import { NextRequest, NextResponse } from "next/server";
import { databaseSetupError, friendlyDatabaseError, isDatabaseSchemaError } from "@/lib/api/errors";
import { missingSupabaseServerVariables, supabaseAdmin } from "@/lib/supabase/server";

type TripRow = {
  id: string;
  title: string;
  destination: string | null;
  description: string | null;
  status: string;
  visibility?: "private" | "public" | null;
  date_mode?: string | null;
  starts_at: string | null;
  ends_at: string | null;
  voting_deadline?: string | null;
  cover_image_url: string | null;
  owner_id: string | null;
};

type ParticipantTripLink = {
  trip_id: string | null;
  status: string | null;
};

const baseTripSelect =
  "id, title, destination, description, status, starts_at, ends_at, cover_image_url, owner_id, created_at";

const tripSelectWithMetadata =
  "id, title, destination, description, status, visibility, date_mode, starts_at, ends_at, voting_deadline, cover_image_url, owner_id, created_at";

function schemaError(message: string) {
  if (isDatabaseSchemaError(message)) {
    return friendlyDatabaseError(message, "load your trips");
  }

  return "Journi could not load your trips right now. Please try again.";
}

async function loadTripsByOwner(userId: string) {
  let { data, error } = (await supabaseAdmin
    .from("trips")
    .select(tripSelectWithMetadata)
    .eq("owner_id", userId)
    .order("created_at", { ascending: false })) as {
    data: TripRow[] | null;
    error: { message: string } | null;
  };

  if (error && isDatabaseSchemaError(error.message)) {
    const fallbackResult = await supabaseAdmin
      .from("trips")
      .select(baseTripSelect)
      .eq("owner_id", userId)
      .order("created_at", { ascending: false });

    data = fallbackResult.data as TripRow[] | null;
    error = fallbackResult.error;
  }

  return { data, error };
}

async function loadTripsByIds(tripIds: string[]) {
  let { data, error } = (await supabaseAdmin
    .from("trips")
    .select(tripSelectWithMetadata)
    .in("id", tripIds)
    .order("created_at", { ascending: false })) as {
    data: TripRow[] | null;
    error: { message: string } | null;
  };

  if (error && isDatabaseSchemaError(error.message)) {
    const fallbackResult = await supabaseAdmin
      .from("trips")
      .select(baseTripSelect)
      .in("id", tripIds)
      .order("created_at", { ascending: false });

    data = fallbackResult.data as TripRow[] | null;
    error = fallbackResult.error;
  }

  return { data, error };
}

export async function GET(request: NextRequest) {
  if (missingSupabaseServerVariables.length > 0) {
    return NextResponse.json(
      { error: databaseSetupError(missingSupabaseServerVariables) },
      { status: 503 },
    );
  }

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
      loadTripsByOwner(user.id),
      supabaseAdmin
        .from("trip_participants")
        .select("trip_id, status")
        .in("status", ["accepted", "pending", "linked", "invited"])
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
  const participantStatusByTripId = new Map(
    ((participantRows ?? []) as ParticipantTripLink[])
      .filter((row) => Boolean(row.trip_id))
      .map((row) => [row.trip_id as string, row.status || "pending"]),
  );

  let invitedTrips: TripRow[] = [];

  if (participantTripIds.length > 0) {
    const { data: invitedTripRows, error: invitedTripsError } = await loadTripsByIds(participantTripIds);

    if (invitedTripsError) {
      return NextResponse.json({ error: schemaError(invitedTripsError.message) }, { status: 400 });
    }

    invitedTrips = ((invitedTripRows ?? []) as TripRow[]).filter((trip) => trip.owner_id !== user.id);
  }

  const combinedTrips = [
    ...((ownedTrips ?? []) as TripRow[]).map((trip) => ({ ...trip, roleView: "organiser" as const })),
    ...invitedTrips.map((trip) => ({
      ...trip,
      roleView: "participant" as const,
      participantStatus: participantStatusByTripId.get(trip.id) || "pending",
    })),
  ];

  const trips = Array.from(new Map(combinedTrips.map((trip) => [trip.id, trip])).values());

  return NextResponse.json({ trips });
}
