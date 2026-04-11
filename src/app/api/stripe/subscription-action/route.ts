import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe/server";

type SubscriptionAction = "cancel_at_period_end" | "reactivate";
type SubscriptionItemWithPeriod = Stripe.SubscriptionItem & {
  current_period_end?: number;
};

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    subscriptionId?: string;
    action?: SubscriptionAction;
  };
  const subscriptionId =
    typeof body.subscriptionId === "string" ? body.subscriptionId.trim() : "";
  const action = body.action;

  if (!subscriptionId) {
    return NextResponse.json({ error: "Subscription ID is required." }, { status: 400 });
  }

  if (action !== "cancel_at_period_end" && action !== "reactivate") {
    return NextResponse.json({ error: "Unsupported subscription action." }, { status: 400 });
  }

  try {
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: action === "cancel_at_period_end",
    });

    const firstItem = subscription.items.data[0] as SubscriptionItemWithPeriod | undefined;

    return NextResponse.json({
      subscriptionId: subscription.id,
      status: subscription.status,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      currentPeriodEnd: firstItem?.current_period_end ?? null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to update subscription.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
