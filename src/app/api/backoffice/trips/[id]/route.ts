import { NextRequest, NextResponse } from "next/server";
import { friendlyDatabaseError } from "@/lib/api/errors";
import { loadActivityLogsForTrip, logBackofficeActivity } from "@/lib/backoffice/activity";
import { sanitiseBackofficeUpdates } from "@/lib/backoffice/editing";
import { requireBackofficeAccess } from "@/lib/backoffice/auth";
import { supabaseAdmin } from "@/lib/supabase/server";

const preferredTripSelect =
  "id,title,destination,description,status,visibility,trip_type_label,audience_filter,date_mode,starts_at,ends_at,voting_deadline,group_size_band,budget_mode,budget_band,budget_total,budget_per_person_min,budget_per_person_max,cover_image_url,created_at,updated_at,owner_id";
const fallbackTripSelect =
  "id,title,destination,description,status,starts_at,ends_at,cover_image_url,created_at,updated_at,owner_id";

async function loadTrip(tripId: string) {
  const preferredResult = await supabaseAdmin
    .from("trips")
    .select(preferredTripSelect)
    .eq("id", tripId)
    .single();
  let data: unknown = preferredResult.data;
  let error = preferredResult.error;

  if (error) {
    const fallbackResult = await supabaseAdmin
      .from("trips")
      .select(fallbackTripSelect)
      .eq("id", tripId)
      .single();

    data = fallbackResult.data;
    error = fallbackResult.error;
  }

  if (error) {
    throw error;
  }

  return data as Record<string, unknown>;
}

async function safeTripRows(table: string, select: string, tripId: string) {
  const { data, error } = await supabaseAdmin
    .from(table)
    .select(select)
    .eq("trip_id", tripId)
    .order("created_at", { ascending: false });

  if (error) {
    return [];
  }

  return data ?? [];
}

async function loadTripParticipants(tripId: string) {
  const selects = [
    "id,trip_id,user_id,email,full_name,role,status,membership_status,attendance_status,invited_at,created_at",
    "id,trip_id,user_id,email,full_name,status,membership_status,attendance_status,invited_at,created_at",
    "id,trip_id,user_id,email,full_name,status,invited_at,created_at",
    "id,trip_id,email,full_name,status,invited_at,created_at",
    "*",
  ];

  for (const select of selects) {
    const { data, error } = await supabaseAdmin
      .from("trip_participants")
      .select(select)
      .eq("trip_id", tripId)
      .order("created_at", { ascending: false });

    if (!error) {
      return data ?? [];
    }
  }

  return [];
}

function getUserDisplayName(user: { email?: string; user_metadata?: Record<string, unknown> }) {
  const fullName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : typeof user.user_metadata?.name === "string"
        ? user.user_metadata.name
        : "";

  return fullName || user.email || "Unknown user";
}

function toSelectableUser(user: {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}) {
  return {
    id: user.id,
    email: user.email ?? "",
    fullName: getUserDisplayName(user),
  };
}

async function insertTripParticipant(
  tripId: string,
  participant: {
    userId: string;
    email: string;
    fullName: string;
    role: string;
    membershipStatus: string;
    attendanceStatus: string | null;
  },
) {
  const preferredPayload = {
    trip_id: tripId,
    user_id: participant.userId,
    email: participant.email,
    full_name: participant.fullName,
    role: participant.role,
    status: participant.membershipStatus === "active" ? "accepted" : "pending",
    membership_status: participant.membershipStatus,
    attendance_status: participant.attendanceStatus,
    invited_at: new Date().toISOString(),
  };
  const fallbackPayload = {
    trip_id: tripId,
    user_id: participant.userId,
    email: participant.email,
    full_name: participant.fullName,
    status: participant.membershipStatus === "active" ? "accepted" : "pending",
    invited_at: preferredPayload.invited_at,
  };
  const minimalPayload = {
    trip_id: tripId,
    email: participant.email,
    full_name: participant.fullName,
    status: participant.membershipStatus === "active" ? "accepted" : "pending",
    invited_at: preferredPayload.invited_at,
  };

  for (const payload of [preferredPayload, fallbackPayload, minimalPayload]) {
    const { data, error } = await supabaseAdmin
      .from("trip_participants")
      .insert(payload)
      .select("*")
      .single();

    if (!error) {
      return data as Record<string, unknown>;
    }
  }

  throw new Error("Unable to add this participant with the live participant schema.");
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireBackofficeAccess(request);

  if (access instanceof NextResponse) {
    return access;
  }

  const { id: tripId } = await params;

  try {
    const [
      usersResult,
      trip,
      participants,
      hotels,
      activities,
      transport,
      dining,
      payments,
      comments,
      polls,
      options,
      activityLogs,
    ] = await Promise.all([
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      loadTrip(tripId),
      loadTripParticipants(tripId),
      safeTripRows(
        "hotels",
        "id,trip_id,name,location,booking_url,price_per_night,currency,rating,google_place_id,created_at",
        tripId,
      ),
      safeTripRows(
        "activities",
        "id,trip_id,title,location,booking_url,scheduled_for,price,currency,google_place_id,created_at",
        tripId,
      ),
      safeTripRows(
        "transport",
        "id,trip_id,mode,provider,departure_location,arrival_location,departs_at,arrives_at,price,currency,created_at",
        tripId,
      ),
      safeTripRows(
        "dining",
        "id,trip_id,name,location,reservation_url,scheduled_for,cuisine,price_level,created_at",
        tripId,
      ),
      safeTripRows("payments", "id,trip_id,user_id,status,amount,currency,paid_at,created_at", tripId),
      safeTripRows(
        "comments",
        "id,trip_id,author_id,parent_comment_id,entity_type,entity_id,body,created_at,updated_at",
        tripId,
      ),
      safeTripRows("polls", "id,trip_id,created_by,title,description,allows_multiple,closes_at,created_at", tripId),
      safeTripRows("options", "id,trip_id,created_by,category,title,description,created_at", tripId),
      loadActivityLogsForTrip(tripId, 150),
    ]);

    if (usersResult.error) {
      throw usersResult.error;
    }

    const userEmailById = Object.fromEntries(
      usersResult.data.users.map((user) => [user.id, user.email ?? "Unknown user"]),
    );
    const userNameById = Object.fromEntries(
      usersResult.data.users.map((user) => [user.id, getUserDisplayName(user)]),
    );
    const users = usersResult.data.users
      .filter((user) => Boolean(user.email))
      .map(toSelectableUser)
      .sort((a, b) => a.email.localeCompare(b.email));
    const pollIds = polls
      .map((poll) => ("id" in poll ? poll.id : null))
      .filter((value): value is string => typeof value === "string");
    const [pollOptionsResult, pollVotesResult] =
      pollIds.length > 0
        ? await Promise.all([
            supabaseAdmin
              .from("poll_options")
              .select("id,poll_id,option_id,label,created_at")
              .in("poll_id", pollIds),
            supabaseAdmin
              .from("poll_votes")
              .select("id,poll_id,poll_option_id,voter_id,voter_name,created_at")
              .in("poll_id", pollIds),
          ])
        : [{ data: [], error: null }, { data: [], error: null }];

    return NextResponse.json({
      accessMode: access.accessMode,
      userEmailById,
      userNameById,
      users,
      trip,
      participants,
      hotels,
      activities,
      transport,
      dining,
      payments,
      comments,
      polls,
      options,
      activityLogs,
      pollOptions: pollOptionsResult.error ? [] : pollOptionsResult.data ?? [],
      pollVotes: pollVotesResult.error ? [] : pollVotesResult.data ?? [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load trip detail.";

    return NextResponse.json(
      { error: friendlyDatabaseError(message, "load this backoffice trip detail") },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireBackofficeAccess(request);

  if (access instanceof NextResponse) {
    return access;
  }

  const { id: tripId } = await params;

  try {
    const body = (await request.json()) as {
      userId?: string;
      role?: string;
      membershipStatus?: string;
      attendanceStatus?: string | null;
    };
    const userId = body.userId?.trim();

    if (!userId) {
      return NextResponse.json({ error: "Choose a user before adding a participant." }, { status: 400 });
    }

    const { data: userResult, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);

    if (userError || !userResult.user?.email) {
      return NextResponse.json({ error: "This user account could not be found." }, { status: 404 });
    }

    const role = body.role || "participant";
    const membershipStatus = body.membershipStatus || "pending_approval";
    const attendanceStatus = body.attendanceStatus || null;
    const participant = await insertTripParticipant(tripId, {
      userId,
      email: userResult.user.email,
      fullName: getUserDisplayName(userResult.user),
      role,
      membershipStatus,
      attendanceStatus,
    });

    await logBackofficeActivity({
      actor: access.user,
      action: "backoffice.trip_participant.create",
      tableName: "trip_participants",
      recordId: typeof participant.id === "string" ? participant.id : null,
      tripId,
      summary: `Backoffice added ${userResult.user.email} as ${role}`,
      metadata: {
        userEmail: userResult.user.email,
        role,
        membershipStatus,
        attendanceStatus,
      },
    });

    return NextResponse.json({ participant });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to add this participant.";

    return NextResponse.json(
      { error: friendlyDatabaseError(message, "add this participant") },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireBackofficeAccess(request);

  if (access instanceof NextResponse) {
    return access;
  }

  const { id: tripId } = await params;

  try {
    const body = (await request.json()) as { updates?: unknown };
    const updates = sanitiseBackofficeUpdates("trips", body.updates);
    const { data, error } = await supabaseAdmin
      .from("trips")
      .update(updates)
      .eq("id", tripId)
      .select(preferredTripSelect)
      .single();

    if (error) {
      const fallbackResult = await supabaseAdmin
        .from("trips")
        .update(updates)
        .eq("id", tripId)
        .select(fallbackTripSelect)
        .single();

      if (fallbackResult.error) {
        throw fallbackResult.error;
      }

      await logBackofficeActivity({
        actor: access.user,
        action: "backoffice.trip.update",
        tableName: "trips",
        recordId: tripId,
        tripId,
        summary: `Backoffice updated trip ${tripId}`,
        metadata: { updates },
      });

      return NextResponse.json({ trip: fallbackResult.data });
    }

    await logBackofficeActivity({
      actor: access.user,
      action: "backoffice.trip.update",
      tableName: "trips",
      recordId: tripId,
      tripId,
      summary: `Backoffice updated trip ${tripId}`,
      metadata: { updates },
    });

    return NextResponse.json({ trip: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update this trip.";

    return NextResponse.json(
      { error: friendlyDatabaseError(message, "update this backoffice trip") },
      { status: 500 },
    );
  }
}
