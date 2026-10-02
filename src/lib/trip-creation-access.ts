import { requireStripeObjectMode } from "@/lib/stripe/environment";
import type { User } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe/server";

export const freeTripLimitMessage = "You've used your one free trip. Buy a Trip Pass or subscribe to Pro to create another.";

async function isActivePro(subscription: Stripe.Subscription, userId: string) {
  requireStripeObjectMode(subscription.livemode);
  if (!["active", "trialing"].includes(subscription.status)) return false;
  if (subscription.metadata.user_id && subscription.metadata.user_id !== userId) return false;
  if (subscription.metadata.product === "pro_organiser" && subscription.metadata.user_id === userId) return true;
  // Older subscriptions predate account metadata; verify the actual product.
  for (const item of subscription.items.data) {
    const product = typeof item.price.product === "string" ? await stripe.products.retrieve(item.price.product) : item.price.product;
    if (!product.deleted && /^Journi Pro Organiser(?: |$)/i.test(product.name)) return true;
  }
  return false;
}

export async function getTripCreationAccess(user: User, checkoutSessionId?: string | null) {
  const { count, error } = await supabaseAdmin.from("trip_creation_ledger")
    .select("trip_id", { count: "exact", head: true }).eq("owner_id", user.id).eq("access_kind", "free");
  if (error) throw new Error("Unable to check your trip allowance. Please try again.");
  const freeTripAvailable = count === 0;
  let hasTripPass = false;
  let hasSubscription = false;
  if (checkoutSessionId) {
    const session = await stripe.checkout.sessions.retrieve(checkoutSessionId);
    requireStripeObjectMode(session.livemode);
    if (session.client_reference_id === user.id && session.metadata?.user_id === user.id && session.status === "complete") {
      if (session.mode === "payment" && session.metadata?.product === "trip_pass" && session.payment_status === "paid" && session.currency === "gbp" && session.amount_total === 3900) {
        const { data: used, error: usedError } = await supabaseAdmin.from("trip_creation_ledger").select("trip_id").eq("checkout_session_id", session.id).maybeSingle();
        if (usedError) throw new Error("Unable to check this Trip Pass. Please try again.");
        hasTripPass = !used;
      }
      if (session.mode === "subscription" && session.subscription) {
        const subscription = await stripe.subscriptions.retrieve(typeof session.subscription === "string" ? session.subscription : session.subscription.id);
        hasSubscription = await isActivePro(subscription, user.id);
      }
    }
  }
  // Read from Stripe with the verified account email, never from editable plan
  // metadata or a customer ID supplied by the browser.
  if (!hasSubscription && !hasTripPass && !freeTripAvailable && user.email && process.env.STRIPE_SECRET_KEY) {
    for await (const customer of stripe.customers.list({ email: user.email, limit: 100 })) {
      for await (const subscription of stripe.subscriptions.list({ customer: customer.id, status: "all", limit: 100 })) {
        if (await isActivePro(subscription, user.id)) { hasSubscription = true; break; }
      }
      if (hasSubscription) break;
    }
  }
  return { freeTripAvailable, hasTripPass, hasSubscription, canCreate: freeTripAvailable || hasTripPass || hasSubscription };
}
