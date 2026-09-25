import { NextRequest, NextResponse } from "next/server";
import { friendlyDatabaseError } from "@/lib/api/errors";
import { logBackofficeActivity } from "@/lib/backoffice/activity";
import {
  getBackofficeUserRole,
  requireBackofficeAccess,
} from "@/lib/backoffice/auth";
import { supabaseAdmin } from "@/lib/supabase/server";

async function safeUserRows(
  table: string,
  select: string,
  column: string,
  value: string,
): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await supabaseAdmin
    .from(table)
    .select(select)
    .eq(column, value)
    .order("created_at", { ascending: false });

  if (error) {
    return [];
  }

  return (data ?? []) as unknown as Array<Record<string, unknown>>;
}

async function loadParticipantRows(userId: string, email: string | null) {
  const preferredSelect =
    "id,trip_id,user_id,email,full_name,role,status,membership_status,attendance_status,request_message,invited_at,responded_at,reviewed_at,created_at";
  const fallbackSelect = "id,trip_id,user_id,email,full_name,role,status,invited_at,responded_at,created_at";
  const baseSelect = "id,trip_id,email,full_name,role,status,invited_at,responded_at,created_at";
  const userResult = await supabaseAdmin
    .from("trip_participants")
    .select(preferredSelect)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  let rows: Array<Record<string, unknown>> = userResult.error
    ? []
    : ((userResult.data ?? []) as Array<Record<string, unknown>>);

  if (userResult.error) {
    const fallbackResult = await supabaseAdmin
      .from("trip_participants")
      .select(fallbackSelect)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (fallbackResult.error) {
      rows = [];
    } else {
      rows = (fallbackResult.data ?? []) as Array<Record<string, unknown>>;
    }
  }

  if (!email) {
    return rows;
  }

  const emailResult = await supabaseAdmin
    .from("trip_participants")
    .select(preferredSelect)
    .eq("email", email)
    .order("created_at", { ascending: false });
  let emailRows: Array<Record<string, unknown>> = emailResult.error
    ? []
    : ((emailResult.data ?? []) as unknown as Array<Record<string, unknown>>);

  if (emailResult.error) {
    const emailFallbackResult = await supabaseAdmin
      .from("trip_participants")
      .select(baseSelect)
      .eq("email", email)
      .order("created_at", { ascending: false });

    emailRows = emailFallbackResult.error
      ? []
      : ((emailFallbackResult.data ?? []) as unknown as Array<Record<string, unknown>>);
  }

  const existingIds = new Set(rows.map((row) => row.id));
  return [
    ...rows,
    ...emailRows.filter((row) => !existingIds.has(row.id)),
  ];
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireBackofficeAccess(request);

  if (access instanceof NextResponse) {
    return access;
  }

  const { id: userId } = await params;

  try {
    const { data: userResult, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);

    if (userError || !userResult.user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const user = userResult.user;
    const [ownedTrips, participantRows, payments, comments] = await Promise.all([
      safeUserRows(
        "trips",
        "id,title,destination,status,visibility,starts_at,ends_at,created_at",
        "owner_id",
        user.id,
      ),
      loadParticipantRows(user.id, user.email ?? null),
      safeUserRows("payments", "id,trip_id,user_id,status,amount,currency,paid_at,created_at", "user_id", user.id),
      safeUserRows("comments", "id,trip_id,author_id,entity_type,entity_id,body,created_at", "author_id", user.id),
    ]);
    const tripIds = Array.from(
      new Set(
        [
          ...ownedTrips.map((trip) => trip.id),
          ...participantRows.map((participant) => participant.trip_id),
          ...payments.map((payment) => payment.trip_id),
          ...comments.map((comment) => comment.trip_id),
        ].filter((value): value is string => typeof value === "string"),
      ),
    );
    const tripsResult =
      tripIds.length > 0
        ? await supabaseAdmin
            .from("trips")
            .select("id,title,destination,status,visibility,created_at")
            .in("id", tripIds)
        : { data: [], error: null };

    return NextResponse.json({
      accessMode: access.accessMode,
      user: {
        id: user.id,
        email: user.email ?? "",
        fullName:
          typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : "",
        role: getBackofficeUserRole(user) || "member",
        plan:
          typeof user.user_metadata?.plan === "string" ? user.user_metadata.plan : "free",
        createdAt: user.created_at,
        lastSignInAt: user.last_sign_in_at ?? null,
      },
      ownedTrips,
      participantRows,
      payments,
      comments,
      relatedTrips: tripsResult.error ? [] : tripsResult.data ?? [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load user detail.";

    return NextResponse.json(
      { error: friendlyDatabaseError(message, "load this backoffice user detail") },
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

  const { id: userId } = await params;

  try {
    const body = (await request.json()) as {
      fullName?: string;
      email?: string;
      role?: string;
      plan?: string;
    };
    const { data: currentUser, error: currentUserError } =
      await supabaseAdmin.auth.admin.getUserById(userId);

    if (currentUserError || !currentUser.user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const existingMetadata = currentUser.user.user_metadata ?? {};
    const existingAppMetadata = currentUser.user.app_metadata ?? {};
    const userMetadata = {
      ...existingMetadata,
      full_name:
        typeof body.fullName === "string" ? body.fullName.trim() : existingMetadata.full_name,
      plan: typeof body.plan === "string" ? body.plan : existingMetadata.plan,
      role: typeof body.role === "string" ? body.role : existingMetadata.role,
    };
    const appMetadata = {
      ...existingAppMetadata,
      role: typeof body.role === "string" ? body.role : existingAppMetadata.role,
    };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : undefined;
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      ...(email ? { email, email_confirm: true } : {}),
      user_metadata: userMetadata,
      app_metadata: appMetadata,
    });

    if (error || !data.user) {
      throw error ?? new Error("Unable to save this user.");
    }

    await logBackofficeActivity({
      actor: access.user,
      action: "backoffice.user.update",
      tableName: "auth.users",
      recordId: userId,
      summary: `Backoffice updated user ${data.user.email ?? userId}`,
      metadata: {
        updatedFields: Object.keys(body).filter((key) => body[key as keyof typeof body] !== undefined),
      },
    });

    return NextResponse.json({
      user: {
        id: data.user.id,
        email: data.user.email ?? "",
        fullName:
          typeof data.user.user_metadata?.full_name === "string"
            ? data.user.user_metadata.full_name
            : "",
        role: getBackofficeUserRole(data.user) || "member",
        plan:
          typeof data.user.user_metadata?.plan === "string"
            ? data.user.user_metadata.plan
            : "free",
        createdAt: data.user.created_at,
        lastSignInAt: data.user.last_sign_in_at ?? null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update this user.";

    return NextResponse.json(
      { error: friendlyDatabaseError(message, "update this backoffice user") },
      { status: 500 },
    );
  }
}
