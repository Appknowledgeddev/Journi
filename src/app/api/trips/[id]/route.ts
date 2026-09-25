import { NextRequest, NextResponse } from "next/server";
import { databaseSetupError, friendlyDatabaseError, isDatabaseSchemaError } from "@/lib/api/errors";
import { logBackofficeActivity } from "@/lib/backoffice/activity";
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
  "id, title, destination, description, status, visibility, trip_type_label, audience_filter, date_mode, starts_at, ends_at, voting_deadline, group_size_band, group_size_min, budget_mode, budget_band, budget_total, budget_per_person_min, budget_per_person_max, cover_image_url, created_at, owner_id";

const participantSelect =
  "id, email, full_name, role, status, membership_status, attendance_status, request_message, invited_at, responded_at, reviewed_at, created_at";

const baseParticipantSelect = "id, email, full_name, role, status, invited_at, responded_at, created_at";

const fallbackPublicSeedOwnerEmails = [
  "journi-public-amelia@example.com",
  "journi-public-marco@example.com",
  "journi-public-sophie@example.com",
];

type GooglePlaceDetailsResponse = {
  photos?: Array<{
    name?: string;
    authorAttributions?: Array<{
      displayName?: string;
    }>;
  }>;
};

type TripRouteRow = {
  id: string;
  title: string;
  destination: string | null;
  description: string | null;
  status: string;
  visibility?: "private" | "public" | null;
  trip_type_label?: string | null;
  audience_filter?: string | null;
  date_mode?: string | null;
  starts_at: string | null;
  ends_at: string | null;
  voting_deadline?: string | null;
  group_size_band?: string | null;
  group_size_min?: number | null;
  budget_mode?: string | null;
  budget_band?: string | null;
  budget_total?: number | null;
  budget_per_person_min?: number | null;
  budget_per_person_max?: number | null;
  cover_image_url: string | null;
  created_at?: string | null;
  owner_id: string | null;
};

type AuthenticatedUser = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
};

type ParticipantRouteRow = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  status: string;
  membership_status?: "invited" | "pending_approval" | "active" | "declined" | "removed" | null;
  attendance_status?: "going" | "maybe" | "not_going" | null;
  request_message?: string | null;
  invited_at?: string | null;
  responded_at?: string | null;
  reviewed_at?: string | null;
  created_at?: string | null;
};

function profileFromAuthUser(user: { id: string; email?: string; user_metadata?: Record<string, unknown> }, fallbackName?: string | null) {
  const metadata = user.user_metadata ?? {};
  return {
    id: user.id,
    email: user.email ?? "",
    fullName:
      (typeof metadata.full_name === "string" && metadata.full_name) ||
      (typeof metadata.name === "string" && metadata.name) ||
      fallbackName || user.email || "Journi traveller",
    bio: typeof metadata.bio === "string" ? metadata.bio : "",
    avatarUrl: typeof metadata.avatar_url === "string" ? metadata.avatar_url : "",
    backgroundUrl: typeof metadata.profile_background_url === "string" ? metadata.profile_background_url : "",
    backgroundPattern: typeof metadata.profile_background_pattern === "string" ? metadata.profile_background_pattern : "",
  };
}

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

async function isFallbackPublicSeedTrip(trip: TripRouteRow) {
  if (trip.status !== "active" || !trip.owner_id) {
    return false;
  }

  const { data, error } = await supabaseAdmin.auth.admin.getUserById(trip.owner_id);

  if (error || !data.user?.email) {
    return false;
  }

  return fallbackPublicSeedOwnerEmails.includes(data.user.email.toLowerCase());
}

function isActiveParticipant(participant: Pick<ParticipantRouteRow, "status" | "membership_status"> | null) {
  return participant?.membership_status === "active" || participant?.status === "accepted";
}

function isPendingApprovalParticipant(participant: Pick<ParticipantRouteRow, "status" | "membership_status"> | null) {
  return participant?.membership_status === "pending_approval" || participant?.status === "pending";
}

function hasParticipantAccess(participant: Pick<ParticipantRouteRow, "status" | "membership_status"> | null) {
  if (!participant) {
    return false;
  }

  const membershipStatus = participant.membership_status ?? "";
  const status = participant.status ?? "";

  if (membershipStatus === "declined" || membershipStatus === "removed" || status === "declined") {
    return false;
  }

  return (
    membershipStatus === "active" ||
    membershipStatus === "pending_approval" ||
    membershipStatus === "invited" ||
    status === "accepted" ||
    status === "pending" ||
    status === "linked" ||
    status === "invited"
  );
}

function normaliseParticipantForResponse(participant: ParticipantRouteRow): ParticipantRouteRow {
  return {
    ...participant,
    membership_status:
      participant.membership_status ??
      (participant.status === "accepted"
        ? "active"
        : participant.status === "declined"
          ? "declined"
          : participant.status === "pending"
            ? "pending_approval"
            : "invited"),
    attendance_status: participant.attendance_status ?? null,
    request_message: participant.request_message ?? null,
  };
}

async function selectParticipantsByTrip(tripId: string) {
  let { data, error } = (await supabaseAdmin
    .from("trip_participants")
    .select(participantSelect)
    .eq("trip_id", tripId)
    .order("created_at", { ascending: true })) as {
    data: ParticipantRouteRow[] | null;
    error: { message: string } | null;
  };

  if (error && isDatabaseSchemaError(error.message)) {
    const fallbackResult = await supabaseAdmin
      .from("trip_participants")
      .select(baseParticipantSelect)
      .eq("trip_id", tripId)
      .order("created_at", { ascending: true });

    data = fallbackResult.data as ParticipantRouteRow[] | null;
    error = fallbackResult.error;
  }

  return { data: (data ?? []).map(normaliseParticipantForResponse), error };
}

async function selectParticipantForUser(tripId: string, userId: string, userEmail: string) {
  let { data, error } = (await supabaseAdmin
    .from("trip_participants")
    .select(participantSelect)
    .eq("trip_id", tripId)
    .or(`user_id.eq.${userId},email.eq.${userEmail}`)
    .maybeSingle()) as {
    data: ParticipantRouteRow | null;
    error: { message: string } | null;
  };

  if (error && isDatabaseSchemaError(error.message)) {
    const fallbackResult = await supabaseAdmin
      .from("trip_participants")
      .select(baseParticipantSelect)
      .eq("trip_id", tripId)
      .eq("email", userEmail)
      .maybeSingle();

    data = fallbackResult.data as ParticipantRouteRow | null;
    error = fallbackResult.error;
  }

  return { data: data ? normaliseParticipantForResponse(data) : null, error };
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
    const { error: linkError } = await supabaseAdmin
      .from("trip_participants")
      .update({ user_id: existingUser.id, status: "linked", membership_status: "invited" })
      .eq("trip_id", args.tripId)
      .eq("email", args.email);

    if (linkError && isDatabaseSchemaError(linkError.message)) {
      await supabaseAdmin
        .from("trip_participants")
        .update({ user_id: existingUser.id, status: "linked" })
        .eq("trip_id", args.tripId)
        .eq("email", args.email);
    }

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

async function logNotificationEvent(args: {
  actor: AuthenticatedUser;
  tripId: string;
  triggerKey: string;
  title: string;
  recipientEmail: string;
  status: "sent" | "failed" | "prepared";
  channel?: string;
  error?: string | null;
}) {
  await logBackofficeActivity({
    actor: { id: args.actor.id, email: args.actor.email },
    action: `notification.${args.status}`,
    tableName: "notifications",
    recordId: `${args.triggerKey}:${args.recipientEmail}`,
    tripId: args.tripId,
    summary: `${args.title} ${args.status} for ${args.recipientEmail}`,
    metadata: {
      notification: {
        triggerKey: args.triggerKey,
        title: args.title,
        recipientEmail: args.recipientEmail,
        actorEmail: args.actor.email ?? null,
        channel: args.channel ?? "Email",
        status: args.status,
        error: args.error ?? null,
      },
    },
  });
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

  let { data: trip, error: tripError } = (await supabaseAdmin
    .from("trips")
    .select(tripSelectWithMetadata)
    .eq("id", tripId)
    .single()) as { data: TripRouteRow | null; error: { message: string } | null };

  if (tripError && isDatabaseSchemaError(tripError.message)) {
    const fallbackResult = await supabaseAdmin
      .from("trips")
      .select(baseTripSelect)
      .eq("id", tripId)
      .single();

    trip = fallbackResult.data as TripRouteRow | null;
    tripError = fallbackResult.error;
  }

  if (tripError || !trip) {
    return NextResponse.json({ error: schemaError(tripError?.message || "Trip not found.") }, { status: 404 });
  }

  const { data: currentParticipant, error: currentParticipantError } = await selectParticipantForUser(
    tripId,
    auth.user.id,
    userEmail,
  );

  if (currentParticipantError) {
    return NextResponse.json({ error: schemaError(currentParticipantError.message) }, { status: 400 });
  }

  const isPublicTrip =
    trip.status === "active" &&
    (trip.visibility === "public" || (await isFallbackPublicSeedTrip(trip)));

  let accessRole: "organiser" | "participant" | "public" | null = null;

  if (trip.owner_id === auth.user.id) {
    accessRole = "organiser";
  } else if (hasParticipantAccess(currentParticipant)) {
    accessRole = "participant";
  } else if (isPublicTrip) {
    accessRole = "public";
  }

  if (!accessRole) {
    return NextResponse.json({ error: "You do not have access to this trip." }, { status: 403 });
  }

  const { data: participantRows, error: participantsError } = await selectParticipantsByTrip(tripId);

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
      .select("id, name, location, notes, price_per_night, currency, source_photo_url, google_place_id")
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

  const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const participantProfiles = (participantRows ?? []).flatMap((participant) => {
    const user = authUsers.users.find(
      (candidate) => candidate.email?.toLowerCase() === participant.email.toLowerCase(),
    );
    return user ? [profileFromAuthUser(user, participant.full_name)] : [{
      id: participant.id,
      email: participant.email,
      fullName: participant.full_name || participant.email,
      bio: "",
      avatarUrl: "",
      backgroundUrl: "",
      backgroundPattern: "",
    }];
  });
  const ownerUser = trip.owner_id
    ? authUsers.users.find((candidate) => candidate.id === trip.owner_id)
    : null;
  const referencePeople = [
    ...(ownerUser ? [{ ...profileFromAuthUser(ownerUser), roleLabel: "Trip organiser" }] : []),
    ...participantProfiles.map((profile) => ({ ...profile, roleLabel: "Traveller" })),
  ].filter((person, index, people) =>
    people.findIndex((candidate) => candidate.email.toLowerCase() === person.email.toLowerCase()) === index,
  );

  return NextResponse.json({
    trip: accessRole === "public" ? { ...trip, visibility: "public" } : trip,
    participants: accessRole === "public" ? (currentParticipant ? [currentParticipant] : []) : participantRows ?? [],
    participantTotal:
      accessRole === "public"
        ? participantRows.filter(
            (participant) => isActiveParticipant(participant) || isPendingApprovalParticipant(participant),
          ).length
        : undefined,
    hotels: enrichedHotels,
    activities: enrichedActivities,
    transport: enrichedTransport,
    dining: enrichedDining,
    referencePeople: accessRole === "public" ? [] : referencePeople,
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
    visibility?: string;
    participantId?: string;
    attendanceStatus?: string | null;
    requestMessage?: string;
  } | null;

  if (
    body?.action !== "publish" &&
    body?.action !== "update_visibility" &&
    body?.action !== "request_participation" &&
    body?.action !== "approve_participant" &&
    body?.action !== "decline_participant" &&
    body?.action !== "update_attendance"
  ) {
    return NextResponse.json({ error: "Unsupported trip action." }, { status: 400 });
  }

  let { data: existingTrip, error: existingTripError } = (await supabaseAdmin
    .from("trips")
    .select(tripSelectWithMetadata)
    .eq("id", tripId)
    .single()) as { data: TripRouteRow | null; error: { message: string } | null };

  if (existingTripError && isDatabaseSchemaError(existingTripError.message)) {
    const fallbackResult = await supabaseAdmin
      .from("trips")
      .select(baseTripSelect)
      .eq("id", tripId)
      .single();

    existingTrip = fallbackResult.data as TripRouteRow | null;
    existingTripError = fallbackResult.error;
  }

  if (existingTripError || !existingTrip) {
    return NextResponse.json(
      { error: schemaError(existingTripError?.message || "Trip not found.") },
      { status: 404 },
    );
  }

  if (body.action === "request_participation") {
    if (existingTrip.owner_id === auth.user.id) {
      return NextResponse.json(
        { error: "You are already the organiser for this trip." },
        { status: 409 },
      );
    }

    const isPublicTrip =
      existingTrip.status === "active" &&
      (existingTrip.visibility === "public" || (await isFallbackPublicSeedTrip(existingTrip)));

    if (!isPublicTrip) {
      return NextResponse.json(
        { error: "This trip is not open for public participant requests." },
        { status: 403 },
      );
    }

    const participantEmail = (auth.user.email ?? "").trim().toLowerCase();

    if (!participantEmail) {
      return NextResponse.json(
        { error: "Add an email address to your account before joining this trip." },
        { status: 400 },
      );
    }

    const { data: existingParticipant, error: participantLookupError } = await selectParticipantForUser(
      tripId,
      auth.user.id,
      participantEmail,
    );

    if (participantLookupError) {
      return NextResponse.json({ error: schemaError(participantLookupError.message) }, { status: 400 });
    }

    if (existingParticipant) {
      return NextResponse.json({
        participant: existingParticipant,
        message:
          isActiveParticipant(existingParticipant)
            ? "You are already confirmed for this trip."
            : "You are already connected to this trip.",
      });
    }

    const fullName =
      typeof auth.user.user_metadata?.full_name === "string"
        ? auth.user.user_metadata.full_name.trim()
        : "";
    const participantInsert = {
      trip_id: tripId,
      inviter_id: null,
      user_id: auth.user.id,
      email: participantEmail,
      full_name: fullName || participantEmail.split("@")[0] || null,
      role: "traveller",
      status: "pending",
      membership_status: "pending_approval",
      attendance_status: null,
      request_message: body.requestMessage?.trim() || null,
    };

    let { data: participant, error: participantInsertError } = await supabaseAdmin
      .from("trip_participants")
      .insert(participantInsert)
      .select(participantSelect)
      .single();

    if (participantInsertError && isDatabaseSchemaError(participantInsertError.message)) {
      const fallbackParticipantInsert = {
        trip_id: participantInsert.trip_id,
        inviter_id: participantInsert.inviter_id,
        email: participantInsert.email,
        full_name: participantInsert.full_name,
        role: participantInsert.role,
        status: participantInsert.status,
      };
      const fallbackResult = await supabaseAdmin
        .from("trip_participants")
        .insert(fallbackParticipantInsert)
        .select(baseParticipantSelect)
        .single();

      participant = fallbackResult.data as typeof participant;
      participantInsertError = fallbackResult.error;
    }

    if (participantInsertError || !participant) {
      return NextResponse.json(
        {
          error: friendlyDatabaseError(
            participantInsertError?.message || "Unable to request participation.",
            "join this trip",
          ),
        },
        { status: 400 },
      );
    }

    if (existingTrip.owner_id) {
      const { data: ownerData } = await supabaseAdmin.auth.admin.getUserById(existingTrip.owner_id);
      const ownerEmail = ownerData.user?.email;

      if (ownerEmail) {
        await logNotificationEvent({
          actor: auth.user,
          tripId,
          triggerKey: "participant_interest_requested",
          title: "Public trip interest",
          recipientEmail: ownerEmail.toLowerCase(),
          status: "prepared",
          channel: "Email + In-app",
        });
      }
    }

    return NextResponse.json({
      participant: normaliseParticipantForResponse(participant as ParticipantRouteRow),
      message:
        "You have been added as a potential participant. The organiser can review it before the trip is confirmed.",
    });
  }

  if (body.action === "update_attendance") {
    const nextAttendance =
      body.attendanceStatus === "going" ||
      body.attendanceStatus === "maybe" ||
      body.attendanceStatus === "not_going"
        ? body.attendanceStatus
        : null;
    const { data: participant, error: participantError } = await selectParticipantForUser(
      tripId,
      auth.user.id,
      (auth.user.email ?? "").toLowerCase(),
    );

    if (participantError) {
      return NextResponse.json({ error: schemaError(participantError.message) }, { status: 400 });
    }

    if (!participant || !isActiveParticipant(participant)) {
      return NextResponse.json(
        { error: "Only approved participants can update attendance." },
        { status: 403 },
      );
    }

    const { data: updatedParticipant, error: updateError } = await supabaseAdmin
      .from("trip_participants")
      .update({ attendance_status: nextAttendance })
      .eq("id", participant.id)
      .select(participantSelect)
      .single();

    if (updateError && isDatabaseSchemaError(updateError.message)) {
      return NextResponse.json({
        participant,
        warning: "Attendance needs the latest Supabase migration before it can be saved.",
      });
    }

    if (updateError || !updatedParticipant) {
      return NextResponse.json(
        { error: friendlyDatabaseError(updateError?.message || "Unable to update attendance.", "update attendance") },
        { status: 400 },
      );
    }

    return NextResponse.json({
      participant: normaliseParticipantForResponse(updatedParticipant as ParticipantRouteRow),
    });
  }

  if (existingTrip.owner_id !== auth.user.id) {
    return NextResponse.json({ error: "Only the organiser can update this trip." }, { status: 403 });
  }

  if (body.action === "approve_participant" || body.action === "decline_participant") {
    const participantId = body.participantId?.trim();

    if (!participantId) {
      return NextResponse.json({ error: "Participant id is required." }, { status: 400 });
    }

    const approving = body.action === "approve_participant";
    const updatePayload = approving
      ? {
          status: "accepted",
          membership_status: "active",
          reviewed_at: new Date().toISOString(),
          reviewed_by: auth.user.id,
        }
      : {
          status: "declined",
          membership_status: "declined",
          reviewed_at: new Date().toISOString(),
          reviewed_by: auth.user.id,
        };

    let { data: participant, error: updateError } = await supabaseAdmin
      .from("trip_participants")
      .update(updatePayload)
      .eq("id", participantId)
      .eq("trip_id", tripId)
      .select(participantSelect)
      .single();

    if (updateError && isDatabaseSchemaError(updateError.message)) {
      const fallbackResult = await supabaseAdmin
        .from("trip_participants")
        .update({ status: approving ? "accepted" : "declined" })
        .eq("id", participantId)
        .eq("trip_id", tripId)
        .select(baseParticipantSelect)
        .single();

      participant = fallbackResult.data as typeof participant;
      updateError = fallbackResult.error;
    }

    if (updateError || !participant) {
      return NextResponse.json(
        {
          error: friendlyDatabaseError(
            updateError?.message || "Unable to review participant request.",
            "review this participant request",
          ),
        },
        { status: 400 },
      );
    }

    if ((participant as ParticipantRouteRow).email) {
      await logNotificationEvent({
        actor: auth.user,
        tripId,
        triggerKey: approving ? "participant_approved" : "participant_declined",
        title: approving ? "Participant approved" : "Participant declined",
        recipientEmail: (participant as ParticipantRouteRow).email.toLowerCase(),
        status: "prepared",
        channel: "Email + In-app",
      });
    }

    return NextResponse.json({
      participant: normaliseParticipantForResponse(participant as ParticipantRouteRow),
      message: approving ? "Participant approved." : "Participant declined.",
    });
  }

  if (body.action === "update_visibility") {
    const nextVisibility = body.visibility === "public" ? "public" : "private";
    const { data: updatedTrip, error: updateError } = await supabaseAdmin
      .from("trips")
      .update({ visibility: nextVisibility })
      .eq("id", tripId)
      .select(tripSelectWithMetadata)
      .single();

    if (updateError || !updatedTrip) {
      return NextResponse.json(
        {
          error: friendlyDatabaseError(
            updateError?.message || "Unable to update trip visibility.",
            "update this trip visibility",
          ),
        },
        { status: 400 },
      );
    }

    return NextResponse.json({ trip: updatedTrip });
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
      .map(async (participant) => {
        const recipientEmail = (participant.email ?? "").trim().toLowerCase();
        const inviteFailure = await sendTravellerInvite({
          email: recipientEmail,
          fullName: participant.full_name,
          tripId,
          tripTitle: updatedTrip.title || "your trip",
          origin,
        });

        await logNotificationEvent({
          actor: auth.user,
          tripId,
          triggerKey: "trip_published",
          title: "Trip published",
          recipientEmail,
          status: inviteFailure ? "failed" : "sent",
          channel: "Email",
          error: inviteFailure,
        });

        return inviteFailure;
      }),
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
