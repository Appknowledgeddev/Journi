import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseServerPublic } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    email?: string;
    fullName?: string;
    tripTitle?: string;
    tripId?: string;
    origin?: string;
  };

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const tripTitle = typeof body.tripTitle === "string" ? body.tripTitle.trim() : "your trip";
  const tripId = typeof body.tripId === "string" ? body.tripId.trim() : "";
  const origin = body.origin || request.nextUrl.origin;

  if (!email) {
    return NextResponse.json({ error: "Traveller email is required." }, { status: 400 });
  }

  try {
    const { data: userListData, error: userListError } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (userListError) {
      return NextResponse.json({ error: userListError.message }, { status: 400 });
    }

    const existingUser = userListData.users.find(
      (user) => (user.email || "").toLowerCase() === email,
    );

    if (existingUser?.id && tripId) {
      await supabaseAdmin
        .from("trip_participants")
        .update({ user_id: existingUser.id, status: "linked" })
        .eq("trip_id", tripId)
        .eq("email", email);
    }

    if (existingUser) {
      const { error } = await supabaseServerPublic.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${origin}/signin`,
          data: {
            role: "traveller",
            full_name: fullName || null,
            invited_trip_title: tripTitle,
          },
        },
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({ success: true, mode: "existing-user" });
    }

    const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${origin}/signin`,
      data: {
        role: "traveller",
        full_name: fullName || null,
        invited_trip_title: tripTitle,
      },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, mode: "new-user" });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to send traveller invite email.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
