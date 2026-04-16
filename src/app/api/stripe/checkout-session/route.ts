import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/server";

type Interval = "monthly" | "yearly";
type Product = "pro_organiser" | "trip_pass";

const pricing: Record<Interval, { amount: number; interval: "month" | "year"; label: string }> = {
  monthly: {
    amount: 1900,
    interval: "month",
    label: "Journi Pro Organiser Monthly",
  },
  yearly: {
    amount: 17900,
    interval: "year",
    label: "Journi Pro Organiser Yearly",
  },
};

function getStripeSecretMode() {
  const key = process.env.STRIPE_SECRET_KEY;

  if (!key) {
    return "missing";
  }

  if (key.startsWith("sk_live_")) {
    return "live";
  }

  if (key.startsWith("sk_test_")) {
    return "test";
  }

  return "unknown";
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    product?: Product;
    interval?: Interval;
    email?: string;
    origin?: string;
    returnPath?: string;
  };
  const product = body.product === "trip_pass" ? "trip_pass" : "pro_organiser";
  const interval = body.interval === "yearly" ? "yearly" : "monthly";
  const origin = body.origin || request.nextUrl.origin;
  const returnPath =
    body.returnPath && body.returnPath.startsWith("/")
      ? body.returnPath
      : product === "trip_pass"
        ? "/dashboard?checkout=complete&product=trip_pass"
        : "/dashboard?checkout=complete&product=pro_organiser";
  const email = typeof body.email === "string" ? body.email.trim() : "";

  try {
    const session =
      product === "trip_pass"
        ? await stripe.checkout.sessions.create({
            customer_email: email || undefined,
            mode: "payment",
            ui_mode: "embedded",
            return_url: `${origin}${returnPath}`,
            line_items: [
              {
                quantity: 1,
                price_data: {
                  currency: "gbp",
                  unit_amount: 3900,
                  product_data: {
                    name: "Journi Trip Pass",
                    description: "Publish one extra trip without moving onto the full Pro plan.",
                  },
                },
              },
            ],
          })
        : await stripe.checkout.sessions.create({
            customer_email: email || undefined,
            mode: "subscription",
            ui_mode: "embedded",
            return_url: `${origin}${returnPath}`,
            line_items: [
              {
                quantity: 1,
                price_data: {
                  currency: "gbp",
                  unit_amount: pricing[interval].amount,
                  recurring: {
                    interval: pricing[interval].interval,
                  },
                  product_data: {
                    name: pricing[interval].label,
                    description:
                      "Unlimited trips, no expiry, templates, and priority support.",
                  },
                },
              },
            ],
          });

    return NextResponse.json({ clientSecret: session.client_secret });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to create embedded Stripe checkout.";

    return NextResponse.json(
      {
        error: message,
        debug: {
          serverStripeMode: getStripeSecretMode(),
        },
      },
      { status: 500 },
    );
  }
}
