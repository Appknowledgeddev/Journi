import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    email?: string;
  };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!email) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  try {
    let page = 1;
    const perPage = 1000;

    while (page <= 10) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage,
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const matchingUser = data.users.find(
        (user) => user.email?.toLowerCase() === email,
      );

      if (matchingUser) {
        return NextResponse.json({
          exists: true,
          email: matchingUser.email,
          plan: matchingUser.user_metadata?.plan ?? "free",
          subscriptionStatus: matchingUser.user_metadata?.subscription_status ?? null,
        });
      }

      if (data.users.length < perPage) {
        break;
      }

      page += 1;
    }

    return NextResponse.json({ exists: false });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to check account.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
