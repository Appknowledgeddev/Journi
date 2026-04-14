import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

type TripDetail = {
  id: string;
  title: string;
  destination: string | null;
  description: string | null;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  cover_image_url: string | null;
};

function schemaError(message: string) {
  if (message.toLowerCase().includes("column")) {
    return `${message}. The live Supabase table schema may be out of date. Check that public.trip_participants and the planning tables include the expected trip fields.`;
  }

  return message;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";

  if (!token) {
    return NextResponse.json({ error: "Missing user session." }, { status: 401 });
  }

  const inviteId = request.nextUrl.searchParams.get("inviteId")?.trim();

  if (!inviteId) {
    return NextResponse.json({ error: "Invite id is required." }, { status: 400 });
  }

  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(token);

  if (userError || !user) {
    return NextResponse.json({ error: "Invalid user session." }, { status: 401 });
  }

  const userEmail = (user.email ?? "").toLowerCase();

  const { data: invite, error: inviteError } = await supabaseAdmin
    .from("trip_participants")
    .select("id, trip_id, email, full_name, role, status, invited_at, response_reason, responded_at")
    .eq("id", inviteId)
    .or(`user_id.eq.${user.id},email.eq.${userEmail}`)
    .single();

  if (inviteError || !invite) {
    return NextResponse.json({ error: "Invite not found for this user." }, { status: 404 });
  }

  const { data: trip, error: tripError } = await supabaseAdmin
    .from("trips")
    .select("id, title, destination, description, status, starts_at, ends_at, cover_image_url")
    .eq("id", invite.trip_id)
    .single();

  if (tripError || !trip) {
    return NextResponse.json({ error: "Trip not found for this invite." }, { status: 404 });
  }

  const [
    { data: hotels, error: hotelsError },
    { data: activities, error: activitiesError },
    { data: transport, error: transportError },
    { data: dining, error: diningError },
  ] = await Promise.all([
    supabaseAdmin
      .from("hotels")
      .select("id, name, location, notes, source_photo_url")
      .eq("trip_id", trip.id),
    supabaseAdmin
      .from("activities")
      .select("id, title, location, notes, source_photo_url")
      .eq("trip_id", trip.id),
    supabaseAdmin
      .from("transport")
      .select("id, mode, departure_location, arrival_location, notes, source_photo_url")
      .eq("trip_id", trip.id),
    supabaseAdmin
      .from("dining")
      .select("id, name, location, notes, source_photo_url")
      .eq("trip_id", trip.id),
  ]);

  const planningError = hotelsError || activitiesError || transportError || diningError;

  if (planningError) {
    return NextResponse.json({ error: schemaError(planningError.message) }, { status: 400 });
  }

  return NextResponse.json({
    invite,
    trip: trip as TripDetail,
    hotels: hotels ?? [],
    activities: activities ?? [],
    transport: transport ?? [],
    dining: dining ?? [],
  });
}
