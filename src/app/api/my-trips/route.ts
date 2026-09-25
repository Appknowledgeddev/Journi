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
  membership_status?: string | null;
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

  const [{ data: ownedTrips, error: ownedTripsError }, participantResult] =
    await Promise.all([
      loadTripsByOwner(user.id),
      supabaseAdmin
        .from("trip_participants")
        .select("trip_id, status, membership_status")
        .in("membership_status", ["active", "pending_approval", "invited"])
        .or(`user_id.eq.${user.id},email.eq.${userEmail}`),
    ]);

  let participantError = participantResult.error as { message: string } | null;
  let normalisedParticipantRows = (participantResult.data ?? []) as ParticipantTripLink[];

  if (participantError && isDatabaseSchemaError(participantError.message)) {
    const fallbackResult = await supabaseAdmin
      .from("trip_participants")
      .select("trip_id, status")
      .in("status", ["accepted", "pending", "linked", "invited"])
      .or(`user_id.eq.${user.id},email.eq.${userEmail}`);

    normalisedParticipantRows = (fallbackResult.data ?? []) as ParticipantTripLink[];
    participantError = fallbackResult.error;
  }

  if (ownedTripsError || participantError) {
    return NextResponse.json(
      { error: schemaError(ownedTripsError?.message || participantError?.message || "Unable to load trips.") },
      { status: 400 },
    );
  }

  const participantTripIds = Array.from(
    new Set(
      normalisedParticipantRows
        .map((row) => row.trip_id)
        .filter((tripId): tripId is string => Boolean(tripId)),
    ),
  );
  const participantStatusByTripId = new Map(
    normalisedParticipantRows
      .filter((row) => Boolean(row.trip_id))
      .map((row) => [
        row.trip_id as string,
        row.membership_status === "pending_approval"
          ? "pending_approval"
          : row.membership_status === "active"
            ? "active"
            : row.status || "pending",
      ]),
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

  if (!trips.length) return NextResponse.json({ trips });
  const { data: progress, error: progressError } = await supabaseAdmin.rpc("trip_card_progress", { trip_ids: trips.map((trip) => trip.id) });
  if (progressError) return NextResponse.json({ error: "Unable to load trip progress." }, { status: 500 });
  const { data: members, error: membersError } = await supabaseAdmin
    .from("trip_participants")
    .select("trip_id,user_id,email,status,membership_status")
    .in("trip_id", trips.map((trip) => trip.id));
  if (membersError) return NextResponse.json({ error: schemaError(membersError.message) }, { status: 400 });
  return NextResponse.json({ trips: trips.map((trip) => {
    const userIds = new Set<string>(trip.owner_id ? [trip.owner_id] : []);
    const emails = new Set<string>();
    let peopleCount = trip.owner_id ? 1 : 0;
    // Registered members first, so duplicate email-only invitations do not inflate the count.
    const active = (members || []).filter((member) => member.trip_id === trip.id && (member.membership_status ? member.membership_status === "active" : member.status === "accepted"))
      .sort((a, b) => Number(Boolean(b.user_id)) - Number(Boolean(a.user_id)));
    for (const member of active) {
      const email = member.email?.trim().toLowerCase();
      const duplicate = (member.user_id && userIds.has(member.user_id)) || (email && emails.has(email));
      if (member.user_id) userIds.add(member.user_id);
      if (email) emails.add(email);
      if (!duplicate) peopleCount++;
    }
    return { ...trip, peopleCount, categoryProgress: progress?.[trip.id] || {} };
  }) });
}
