import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseServerPublic } from "@/lib/supabase/server";

const MAKE_INVITE_WEBHOOK_URL =
  process.env.MAKE_TRAVELLER_INVITE_WEBHOOK_URL ||
  "https://hook.eu1.make.com/gc44j6vr15obp4so9fxc6evunczovjjb";

async function notifyInviteWebhook(payload: {
  email: string;
  fullName: string;
  tripTitle: string;
  tripId: string;
  origin: string;
  mode: "existing-user" | "new-user";
  linkedUserId: string | null;
}) {
  try {
    const response = await fetch(MAKE_INVITE_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: payload.email,
        full_name: payload.fullName || null,
        trip_title: payload.tripTitle,
        trip_id: payload.tripId || null,
        origin: payload.origin,
        invite_mode: payload.mode,
        linked_user_id: payload.linkedUserId,
        sent_at: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      console.warn("[Journi Invite] Make webhook failed", {
        status: response.status,
        email: payload.email,
        tripId: payload.tripId,
      });
    }
  } catch (error) {
    console.warn("[Journi Invite] Make webhook error", {
      email: payload.email,
      tripId: payload.tripId,
      error: error instanceof Error ? error.message : "Unknown webhook error",
    });
  }
}

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

      await notifyInviteWebhook({
        email,
        fullName,
        tripTitle,
        tripId,
        origin,
        mode: "existing-user",
        linkedUserId: existingUser.id,
      });

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

    await notifyInviteWebhook({
      email,
      fullName,
      tripTitle,
      tripId,
      origin,
      mode: "new-user",
      linkedUserId: null,
    });

    return NextResponse.json({ success: true, mode: "new-user" });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to send traveller invite email.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
