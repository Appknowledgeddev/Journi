import { NextRequest, NextResponse } from "next/server";
import { databaseSetupError, friendlyDatabaseError, isDatabaseSchemaError } from "@/lib/api/errors";
import {
  missingSupabaseServerVariables,
  supabaseAdmin,
  supabaseServerPublic,
} from "@/lib/supabase/server";

function schemaError(message: string) {
  if (isDatabaseSchemaError(message)) {
    return friendlyDatabaseError(message, "load this trip");
  }

  return "Journi could not load this trip right now. Please try again.";
}

const baseTripSelect =
  "id, title, destination, description, status, starts_at, ends_at, cover_image_url, created_at, owner_id";

const tripSelectWithMetadata =
  "id, title, destination, description, status, trip_type_label, audience_filter, date_mode, starts_at, ends_at, voting_deadline, group_size_band, group_size_min, budget_mode, budget_band, budget_total, budget_per_person_min, budget_per_person_max, cover_image_url, created_at, owner_id";

type GooglePlaceDetailsResponse = {
  photos?: Array<{
    name?: string;
    authorAttributions?: Array<{
      displayName?: string;
    }>;
  }>;
};

type AuthenticatedUser = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
};

function getBearerToken(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
}

async function getAuthenticatedUser(request: NextRequest) {
  const token = getBearerToken(request);

  if (!token) {
    return { error: NextResponse.json({ error: "Missing user session." }, { status: 401 }) };
  }

  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(token);

  if (userError || !user) {
    return { error: NextResponse.json({ error: "Invalid user session." }, { status: 401 }) };
  }

  return { user: user as AuthenticatedUser };
}

async function sendTravellerInvite(args: {
  email: string;
  fullName: string | null;
  tripId: string;
  tripTitle: string;
  origin: string;
}) {
  const { data: userListData, error: userListError } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (userListError) {
    return userListError.message;
  }

  const existingUser = userListData.users.find(
    (user) => (user.email || "").toLowerCase() === args.email,
  );

  if (existingUser?.id) {
    await supabaseAdmin
      .from("trip_participants")
      .update({ user_id: existingUser.id, status: "linked" })
      .eq("trip_id", args.tripId)
      .eq("email", args.email);

    const { error } = await supabaseServerPublic.auth.signInWithOtp({
      email: args.email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${args.origin}/signin`,
        data: {
          role: "traveller",
          full_name: args.fullName,
          invited_trip_title: args.tripTitle,
        },
      },
    });

    return error?.message ?? null;
  }

  const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(args.email, {
    redirectTo: `${args.origin}/signin`,
    data: {
      role: "traveller",
      full_name: args.fullName,
      invited_trip_title: args.tripTitle,
    },
  });

  return error?.message ?? null;
}

async function enrichRowsWithPhotos<
  T extends { source_photo_url?: string | null; google_place_id?: string | null },
>(rows: T[]) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return rows;
  }

  const enrichedRows = await Promise.all(
    rows.map(async (row) => {
      if (row.source_photo_url || !row.google_place_id) {
        return row;
      }

      try {
        const response = await fetch(`https://places.googleapis.com/v1/places/${row.google_place_id}`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": "photos",
          },
          cache: "no-store",
        });

        const data = (await response.json()) as GooglePlaceDetailsResponse;
        const photoName = data.photos?.[0]?.name;

        if (!response.ok || !photoName) {
          return row;
        }

        return {
          ...row,
          source_photo_url: `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=720&key=${apiKey}`,
        };
      } catch {
        return row;
      }
    }),
  );

  return enrichedRows;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (missingSupabaseServerVariables.length > 0) {
    return NextResponse.json(
      { error: databaseSetupError(missingSupabaseServerVariables) },
      { status: 503 },
    );
  }

  const auth = await getAuthenticatedUser(request);

  if ("error" in auth) {
    return auth.error;
  }

  const { id: tripId } = await params;
  const userEmail = (auth.user.email ?? "").toLowerCase();

  let { data: trip, error: tripError } = await supabaseAdmin
    .from("trips")
    .select(tripSelectWithMetadata)
    .eq("id", tripId)
    .single();

  if (tripError && isDatabaseSchemaError(tripError.message)) {
    const fallbackResult = await supabaseAdmin
      .from("trips")
      .select(baseTripSelect)
      .eq("id", tripId)
      .single();

    trip = fallbackResult.data;
    tripError = fallbackResult.error;
  }

  if (tripError || !trip) {
    return NextResponse.json({ error: schemaError(tripError?.message || "Trip not found.") }, { status: 404 });
  }

  let accessRole: "organiser" | "participant" | null = null;

  if (trip.owner_id === auth.user.id) {
    accessRole = "organiser";
  } else {
    const { data: participantLink, error: participantError } = await supabaseAdmin
      .from("trip_participants")
      .select("id")
      .eq("trip_id", tripId)
      .eq("status", "accepted")
      .or(`user_id.eq.${auth.user.id},email.eq.${userEmail}`)
      .maybeSingle();

    if (participantError) {
      return NextResponse.json({ error: schemaError(participantError.message) }, { status: 400 });
    }

    if (participantLink) {
      accessRole = "participant";
    }
  }

  if (!accessRole) {
    return NextResponse.json({ error: "You do not have access to this trip." }, { status: 403 });
  }

  const { data: participantRows, error: participantsError } = await supabaseAdmin
    .from("trip_participants")
    .select("id, email, full_name, role, status, invited_at, responded_at, created_at")
    .eq("trip_id", tripId)
    .order("created_at", { ascending: true });

  if (participantsError) {
    return NextResponse.json({ error: schemaError(participantsError.message) }, { status: 400 });
  }

  const [
    { data: hotelRows, error: hotelsError },
    { data: activityRows, error: activitiesError },
    { data: transportRows, error: transportError },
    { data: diningRows, error: diningError },
  ] = await Promise.all([
    supabaseAdmin
      .from("hotels")
      .select("id, name, location, notes, source_photo_url, google_place_id")
      .eq("trip_id", tripId),
    supabaseAdmin
      .from("activities")
      .select("id, title, location, notes, source_photo_url, google_place_id")
      .eq("trip_id", tripId),
    supabaseAdmin
      .from("transport")
      .select("id, mode, departure_location, arrival_location, notes, source_photo_url, google_place_id")
      .eq("trip_id", tripId),
    supabaseAdmin
      .from("dining")
      .select("id, name, location, notes, source_photo_url, google_place_id")
      .eq("trip_id", tripId),
  ]);

  const planningError = hotelsError || activitiesError || transportError || diningError;

  if (planningError) {
    return NextResponse.json({ error: schemaError(planningError.message) }, { status: 400 });
  }

  const [enrichedHotels, enrichedActivities, enrichedTransport, enrichedDining] = await Promise.all([
    enrichRowsWithPhotos((hotelRows ?? []) as Array<Record<string, unknown>>),
    enrichRowsWithPhotos((activityRows ?? []) as Array<Record<string, unknown>>),
    enrichRowsWithPhotos((transportRows ?? []) as Array<Record<string, unknown>>),
    enrichRowsWithPhotos((diningRows ?? []) as Array<Record<string, unknown>>),
  ]);

  return NextResponse.json({
    trip,
    participants: participantRows ?? [],
    hotels: enrichedHotels,
    activities: enrichedActivities,
    transport: enrichedTransport,
    dining: enrichedDining,
    accessRole,
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (missingSupabaseServerVariables.length > 0) {
    return NextResponse.json(
      { error: databaseSetupError(missingSupabaseServerVariables) },
      { status: 503 },
    );
  }

  const auth = await getAuthenticatedUser(request);

  if ("error" in auth) {
    return auth.error;
  }

  const { id: tripId } = await params;
  const body = (await request.json().catch(() => null)) as {
    action?: string;
    origin?: string;
  } | null;

  if (body?.action !== "publish") {
    return NextResponse.json({ error: "Unsupported trip action." }, { status: 400 });
  }

  const { data: existingTrip, error: existingTripError } = await supabaseAdmin
    .from("trips")
    .select(baseTripSelect)
    .eq("id", tripId)
    .single();

  if (existingTripError || !existingTrip) {
    return NextResponse.json(
      { error: schemaError(existingTripError?.message || "Trip not found.") },
      { status: 404 },
    );
  }

  if (existingTrip.owner_id !== auth.user.id) {
    return NextResponse.json({ error: "Only the organiser can publish this trip." }, { status: 403 });
  }

  if (existingTrip.status !== "draft") {
    return NextResponse.json(
      { error: "This trip is already published. Published trips cannot be returned to draft." },
      { status: 409 },
    );
  }

  const userPlan = auth.user.user_metadata?.plan === "pro_organiser" ? "pro_organiser" : "free";

  if (userPlan === "free") {
    const { count, error: countError } = await supabaseAdmin
      .from("trips")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", auth.user.id)
      .eq("status", "active");

    if (countError) {
      return NextResponse.json({ error: schemaError(countError.message) }, { status: 400 });
    }

    if ((count ?? 0) >= 1) {
      return NextResponse.json(
        {
          error:
            "Free plan organisers can only have one published trip at a time. Upgrade to Pro or use a Trip Pass to publish another.",
        },
        { status: 403 },
      );
    }
  }

  const { data: updatedTrip, error: updateError } = await supabaseAdmin
    .from("trips")
    .update({ status: "active" })
    .eq("id", tripId)
    .eq("status", "draft")
    .select(baseTripSelect)
    .single();

  if (updateError || !updatedTrip) {
    return NextResponse.json(
      { error: friendlyDatabaseError(updateError?.message || "Unable to publish trip.", "publish this trip") },
      { status: 400 },
    );
  }

  const { data: participantRows, error: participantsError } = await supabaseAdmin
    .from("trip_participants")
    .select("email, full_name")
    .eq("trip_id", tripId);

  if (participantsError) {
    return NextResponse.json(
      {
        trip: updatedTrip,
        warning: friendlyDatabaseError(participantsError.message, "load traveller notifications"),
      },
    );
  }

  const origin = body.origin || request.nextUrl.origin;
  const inviteFailures = await Promise.all(
    ((participantRows ?? []) as Array<{ email: string | null; full_name: string | null }>)
      .filter((participant) => Boolean(participant.email))
      .map((participant) =>
        sendTravellerInvite({
          email: (participant.email ?? "").trim().toLowerCase(),
          fullName: participant.full_name,
          tripId,
          tripTitle: updatedTrip.title || "your trip",
          origin,
        }),
      ),
  );
  const firstInviteFailure = inviteFailures.find(Boolean);

  return NextResponse.json({
    trip: updatedTrip,
    warning: firstInviteFailure
      ? `Trip published, but at least one traveller notification could not be sent yet: ${firstInviteFailure}`
      : undefined,
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (missingSupabaseServerVariables.length > 0) {
    return NextResponse.json(
      { error: databaseSetupError(missingSupabaseServerVariables) },
      { status: 503 },
    );
  }

  const auth = await getAuthenticatedUser(request);

  if ("error" in auth) {
    return auth.error;
  }

  const { id: tripId } = await params;
  const { data: trip, error: tripError } = await supabaseAdmin
    .from("trips")
    .select("id, owner_id, status")
    .eq("id", tripId)
    .single();

  if (tripError || !trip) {
    return NextResponse.json({ error: schemaError(tripError?.message || "Trip not found.") }, { status: 404 });
  }

  if (trip.owner_id !== auth.user.id) {
    return NextResponse.json({ error: "Only the organiser can delete this trip." }, { status: 403 });
  }

  if (trip.status !== "draft") {
    return NextResponse.json(
      { error: "Published trips cannot be deleted because traveller notifications may already link to them." },
      { status: 409 },
    );
  }

  const { error: deleteError } = await supabaseAdmin.from("trips").delete().eq("id", tripId).eq("status", "draft");

  if (deleteError) {
    return NextResponse.json(
      { error: friendlyDatabaseError(deleteError.message, "delete this draft trip") },
      { status: 400 },
    );
  }

  return NextResponse.json({ success: true });
}
