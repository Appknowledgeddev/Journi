import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

const INVITE_RESPONSE_WEBHOOK = "https://hook.eu1.make.com/6m3wyqfvgf9cmugq7uk7e6i3imrhtyky";

function schemaError(message: string) {
  if (message.toLowerCase().includes("column")) {
    return `${message}. The live Supabase table schema may be out of date. Check that public.trip_participants has user_id, response_reason, and responded_at columns.`;
  }

  return message;
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";

  if (!token) {
    return NextResponse.json({ error: "Missing user session." }, { status: 401 });
  }

  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(token);

  if (userError || !user) {
    return NextResponse.json({ error: "Invalid user session." }, { status: 401 });
  }

  const payload = (await request.json()) as {
    inviteId?: string;
    action?: "accepted" | "declined";
    reason?: string;
    testOnly?: boolean;
  };

  const inviteId = payload.inviteId?.trim();
  const action = payload.action;
  const reason = payload.reason?.trim() || null;
  const testOnly = payload.testOnly === true;

  if (!inviteId || (action !== "accepted" && action !== "declined")) {
    return NextResponse.json({ error: "Invite id and action are required." }, { status: 400 });
  }

  const userEmail = (user.email ?? "").toLowerCase();

  const { data: invite, error: inviteError } = await supabaseAdmin
    .from("trip_participants")
    .select("id, trip_id, email, full_name, role, status, invited_at")
    .eq("id", inviteId)
    .or(`user_id.eq.${user.id},email.eq.${userEmail}`)
    .single();

  if (inviteError || !invite) {
    return NextResponse.json({ error: "Invite not found for this user." }, { status: 404 });
  }

  const { data: trip, error: tripError } = await supabaseAdmin
    .from("trips")
    .select("id, title, destination, owner_id")
    .eq("id", invite.trip_id)
    .single();

  if (tripError || !trip) {
    return NextResponse.json({ error: "Trip not found for this invite." }, { status: 404 });
  }

  let updatedInvite = {
    ...invite,
    status: action,
    response_reason: reason,
    responded_at: new Date().toISOString(),
  };

  if (!testOnly) {
    const { data, error: updateError } = await supabaseAdmin
      .from("trip_participants")
      .update({
        status: action,
        response_reason: reason,
        responded_at: updatedInvite.responded_at,
        user_id: user.id,
      })
      .eq("id", inviteId)
      .select("id, trip_id, email, full_name, role, status, invited_at, response_reason, responded_at")
      .single();

    if (updateError || !data) {
      return NextResponse.json(
        { error: schemaError(updateError?.message || "Unable to update invite.") },
        { status: 400 },
      );
    }

    updatedInvite = data;
  }

  const { data: organiserProfile } = await supabaseAdmin.auth.admin.getUserById(trip.owner_id);

  try {
    await fetch(INVITE_RESPONSE_WEBHOOK, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inviteId: updatedInvite.id,
        tripId: trip.id,
        tripTitle: trip.title,
        destination: trip.destination,
        travellerEmail: updatedInvite.email,
        travellerName:
          typeof user.user_metadata?.full_name === "string"
            ? user.user_metadata.full_name
            : updatedInvite.full_name,
        organiserEmail: organiserProfile.user?.email ?? null,
        organiserName:
          typeof organiserProfile.user?.user_metadata?.full_name === "string"
            ? organiserProfile.user.user_metadata.full_name
            : null,
        role: updatedInvite.role,
        responseStatus: updatedInvite.status,
        responseReason: updatedInvite.response_reason,
        respondedAt: updatedInvite.responded_at,
        testOnly,
      }),
    });
  } catch (error) {
    console.warn("[Journi Invite Response] Unable to send response webhook", error);
  }

  return NextResponse.json({
    invite: updatedInvite,
    trip,
    testOnly,
  });
}
