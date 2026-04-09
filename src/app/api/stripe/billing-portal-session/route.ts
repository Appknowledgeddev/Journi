import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/server";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    email?: string;
    origin?: string;
    returnPath?: string;
  };

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const origin = body.origin || request.nextUrl.origin;
  const returnPath =
    body.returnPath && body.returnPath.startsWith("/") ? body.returnPath : "/subscription";

  if (!email) {
    return NextResponse.json({ error: "Account email is required." }, { status: 400 });
  }

  try {
    const customers = await stripe.customers.list({
      email,
      limit: 1,
    });

    const customer = customers.data[0];

    if (!customer) {
      return NextResponse.json(
        { error: "No Stripe customer was found for this account yet." },
        { status: 404 },
      );
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: `${origin}${returnPath}`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to open Stripe billing portal.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
