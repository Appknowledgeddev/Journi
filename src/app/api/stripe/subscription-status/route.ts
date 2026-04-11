import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe/server";

type SubscriptionItemWithPeriod = Stripe.SubscriptionItem & {
  current_period_end?: number;
};

function getFirstSubscriptionItem(subscription: Stripe.Subscription) {
  return subscription.items.data[0] as SubscriptionItemWithPeriod | undefined;
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    email?: string;
  };
  const email = typeof body.email === "string" ? body.email.trim() : "";

  if (!email) {
    return NextResponse.json({ error: "Account email is required." }, { status: 400 });
  }

  try {
    const customers = await stripe.customers.list({
      email,
      limit: 10,
    });

    for (const customer of customers.data) {
      const subscriptions = await stripe.subscriptions.list({
        customer: customer.id,
        status: "all",
        limit: 10,
      });

      const activeSubscription = subscriptions.data.find((subscription) =>
        ["active", "trialing"].includes(subscription.status),
      );

      if (activeSubscription) {
        const firstItem = getFirstSubscriptionItem(activeSubscription);

        return NextResponse.json({
          isPro: true,
          customerId: customer.id,
          subscriptionId: activeSubscription.id,
          status: activeSubscription.status,
          cancelAtPeriodEnd: activeSubscription.cancel_at_period_end,
          currentPeriodEnd: firstItem?.current_period_end ?? null,
          productName: firstItem?.price.nickname ?? null,
          amount: firstItem?.price.unit_amount ?? null,
          currency: firstItem?.price.currency ?? null,
          interval: firstItem?.price.recurring?.interval ?? null,
        });
      }
    }

    return NextResponse.json({ isPro: false });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to check Stripe subscription.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
