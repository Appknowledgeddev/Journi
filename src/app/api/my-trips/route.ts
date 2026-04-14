import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

type TripRow = {
  id: string;
  title: string;
  destination: string | null;
  description: string | null;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  cover_image_url: string | null;
  owner_id: string | null;
};

function schemaError(message: string) {
  if (message.toLowerCase().includes("column") || message.toLowerCase().includes("schema")) {
    return `${message}. The live Supabase schema may be out of date for trips or trip_participants.`;
  }

  return message;
}

export async function GET(request: NextRequest) {
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

  const userEmail = (user.email ?? "").toLowerCase();

  const [{ data: ownedTrips, error: ownedTripsError }, { data: participantRows, error: participantError }] =
    await Promise.all([
      supabaseAdmin
        .from("trips")
        .select("id, title, destination, description, status, starts_at, ends_at, cover_image_url, owner_id")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("trip_participants")
        .select("trip_id")
        .eq("status", "accepted")
        .or(`user_id.eq.${user.id},email.eq.${userEmail}`),
    ]);

  if (ownedTripsError || participantError) {
    return NextResponse.json(
      { error: schemaError(ownedTripsError?.message || participantError?.message || "Unable to load trips.") },
      { status: 400 },
    );
  }

  const participantTripIds = Array.from(
    new Set(
      ((participantRows ?? []) as Array<{ trip_id: string | null }>)
        .map((row) => row.trip_id)
        .filter((tripId): tripId is string => Boolean(tripId)),
    ),
  );

  let invitedTrips: TripRow[] = [];

  if (participantTripIds.length > 0) {
    const { data: invitedTripRows, error: invitedTripsError } = await supabaseAdmin
      .from("trips")
      .select("id, title, destination, description, status, starts_at, ends_at, cover_image_url, owner_id")
      .in("id", participantTripIds)
      .order("created_at", { ascending: false });

    if (invitedTripsError) {
      return NextResponse.json({ error: schemaError(invitedTripsError.message) }, { status: 400 });
    }

    invitedTrips = ((invitedTripRows ?? []) as TripRow[]).filter((trip) => trip.owner_id !== user.id);
  }

  const combinedTrips = [
    ...((ownedTrips ?? []) as TripRow[]).map((trip) => ({ ...trip, roleView: "organiser" as const })),
    ...invitedTrips.map((trip) => ({ ...trip, roleView: "participant" as const })),
  ];

  const trips = Array.from(new Map(combinedTrips.map((trip) => [trip.id, trip])).values());

  return NextResponse.json({ trips });
}
