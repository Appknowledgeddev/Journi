import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

type TripRow = {
  id: string;
  title: string;
  destination: string | null;
  description?: string | null;
  status: string;
  starts_at?: string | null;
  ends_at?: string | null;
  cover_image_url?: string | null;
};

type ParticipantRow = {
  id: string;
  trip_id: string;
  email: string;
  full_name: string | null;
  role: string;
  status: string;
  invited_at: string | null;
  response_reason?: string | null;
  responded_at?: string | null;
};

type OrganiserConnection = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  trip_ids: string[];
};

async function listAllUsers() {
  const users = [];
  let page = 1;
  const perPage = 1000;

  while (page <= 10) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw error;
    }

    users.push(...data.users);

    if (data.users.length < perPage) {
      break;
    }

    page += 1;
  }

  return users;
}

function schemaError(message: string) {
  if (message.toLowerCase().includes("column")) {
    return `${message}. The live Supabase table schema may be out of date. Check that public.trip_participants has trip_id, email, full_name, role, status, invited_at, user_id, response_reason, and responded_at columns.`;
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

  const { data: ownedTrips, error: ownedTripsError } = await supabaseAdmin
    .from("trips")
    .select("id, title, destination, description, status, starts_at, ends_at, cover_image_url")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  if (ownedTripsError) {
    return NextResponse.json({ error: schemaError(ownedTripsError.message) }, { status: 400 });
  }

  const trips = (ownedTrips ?? []) as TripRow[];
  const tripIds = trips.map((trip) => trip.id);

  let sentInvites: ParticipantRow[] = [];

  if (tripIds.length > 0) {
    const { data: sentRows, error: sentError } = await supabaseAdmin
      .from("trip_participants")
      .select("id, trip_id, email, full_name, role, status, invited_at, response_reason, responded_at")
      .in("trip_id", tripIds)
      .order("invited_at", { ascending: false });

    if (sentError) {
      return NextResponse.json({ error: schemaError(sentError.message) }, { status: 400 });
    }

    sentInvites = (sentRows ?? []) as ParticipantRow[];
  }

  const { data: receivedByUserRows, error: receivedByUserError } = await supabaseAdmin
    .from("trip_participants")
    .select("id, trip_id, email, full_name, role, status, invited_at, response_reason, responded_at")
    .eq("user_id", user.id)
    .order("invited_at", { ascending: false });

  if (receivedByUserError) {
    return NextResponse.json({ error: schemaError(receivedByUserError.message) }, { status: 400 });
  }

  const { data: receivedByEmailRows, error: receivedByEmailError } = await supabaseAdmin
    .from("trip_participants")
    .select("id, trip_id, email, full_name, role, status, invited_at, response_reason, responded_at")
    .eq("email", userEmail)
    .order("invited_at", { ascending: false });

  if (receivedByEmailError) {
    return NextResponse.json(
      { error: schemaError(receivedByEmailError.message) },
      { status: 400 },
    );
  }

  const receivedInvitesById = new Map<string, ParticipantRow>();

  for (const invite of [
    ...((receivedByUserRows ?? []) as ParticipantRow[]),
    ...((receivedByEmailRows ?? []) as ParticipantRow[]),
  ]) {
    receivedInvitesById.set(invite.id, invite);
  }

  const receivedInvites = Array.from(receivedInvitesById.values()).sort((first, second) => {
    const firstTime = first.invited_at ? new Date(first.invited_at).getTime() : 0;
    const secondTime = second.invited_at ? new Date(second.invited_at).getTime() : 0;

    return secondTime - firstTime;
  });

  const receivedTripIds = Array.from(new Set(receivedInvites.map((invite) => invite.trip_id)));
  let receivedTrips: TripRow[] = [];
  let receivedOrganisers: OrganiserConnection[] = [];

  if (receivedTripIds.length > 0) {
    const { data: receivedTripRows, error: receivedTripsError } = await supabaseAdmin
      .from("trips")
      .select("id, title, destination, description, status, starts_at, ends_at, cover_image_url, owner_id")
      .in("id", receivedTripIds);

    if (receivedTripsError) {
      return NextResponse.json(
        { error: schemaError(receivedTripsError.message) },
        { status: 400 },
      );
    }

    receivedTrips = (receivedTripRows ?? []) as TripRow[];

    const ownerIds = Array.from(
      new Set(
        (receivedTripRows ?? [])
          .map((trip) => trip.owner_id as string | null | undefined)
          .filter((ownerId): ownerId is string => Boolean(ownerId) && ownerId !== user.id),
      ),
    );

    if (ownerIds.length > 0) {
      const users = await listAllUsers();
      const userById = new Map(users.map((profile) => [profile.id, profile]));

      receivedOrganisers = ownerIds
        .map((ownerId) => {
          const organiserTrips = (receivedTripRows ?? []).filter(
            (trip) => trip.owner_id === ownerId,
          ) as Array<TripRow & { owner_id?: string | null }>;
          const profile = userById.get(ownerId);

          return {
            user_id: ownerId,
            email: profile?.email ?? null,
            full_name:
              typeof profile?.user_metadata?.full_name === "string"
                ? profile.user_metadata.full_name
                : null,
            trip_ids: organiserTrips.map((trip) => trip.id),
          };
        })
        .filter((connection) => connection.trip_ids.length > 0);
    }
  }

  return NextResponse.json({
    trips,
    sentInvites,
    receivedInvites,
    receivedTrips,
    receivedOrganisers,
  });
}
