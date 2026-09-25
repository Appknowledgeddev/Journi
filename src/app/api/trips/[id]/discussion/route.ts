import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { dispatchNotificationAction } from "@/lib/notifications/dispatch";

function schemaError(message: string) {
  if (
    message.toLowerCase().includes("column") ||
    message.toLowerCase().includes("schema") ||
    message.toLowerCase().includes("relation")
  ) {
    return `${message}. The live Supabase schema may be missing the comments table or expected trip participant fields.`;
  }

  return message;
}

type CommentRow = {
  id: string;
  trip_id: string;
  author_id: string | null;
  parent_comment_id: string | null;
  entity_type: string;
  entity_id: string | null;
  body: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

function hasParticipantAccess(participant: { status?: string | null; membership_status?: string | null } | null) {
  if (!participant) {
    return false;
  }

  return participant.membership_status === "active" || participant.status === "accepted";
}

async function selectActiveParticipantLink(tripId: string, userId: string, userEmail: string) {
  const query = supabaseAdmin
    .from("trip_participants")
    .select("id, status, membership_status")
    .eq("trip_id", tripId)
    .or(`user_id.eq.${userId},email.eq.${userEmail}`)
    .maybeSingle();

  const { data, error } = await query;

  if (!error) {
    return { data, error: null };
  }

  if (!error.message.toLowerCase().includes("membership_status")) {
    return { data: null, error };
  }

  const fallback = await supabaseAdmin
    .from("trip_participants")
    .select("id, status")
    .eq("trip_id", tripId)
    .or(`user_id.eq.${userId},email.eq.${userEmail}`)
    .maybeSingle();

  return fallback;
}

async function getAccess(tripId: string, token: string) {
  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(token);

  if (userError || !user) {
    return { error: NextResponse.json({ error: "Invalid user session." }, { status: 401 }) };
  }

  const userEmail = (user.email ?? "").toLowerCase();

  const { data: trip, error: tripError } = await supabaseAdmin
    .from("trips")
    .select("id, owner_id, title")
    .eq("id", tripId)
    .single();

  if (tripError || !trip) {
    return {
      error: NextResponse.json({ error: schemaError(tripError?.message || "Trip not found.") }, { status: 404 }),
    };
  }

  let accessRole: "organiser" | "participant" | null = null;

  if (trip.owner_id === user.id) {
    accessRole = "organiser";
  } else {
    const { data: participantLink, error: participantError } = await selectActiveParticipantLink(
      tripId,
      user.id,
      userEmail,
    );

    if (participantError) {
      return { error: NextResponse.json({ error: schemaError(participantError.message) }, { status: 400 }) };
    }

    if (hasParticipantAccess(participantLink)) {
      accessRole = "participant";
    }
  }

  if (!accessRole) {
    return { error: NextResponse.json({ error: "You do not have access to this trip." }, { status: 403 }) };
  }

  return { user, trip, accessRole };
}

async function resolveCommentAuthors(rows: CommentRow[]) {
  const authorIds = [...new Set(rows.map((row) => row.author_id).filter(Boolean))] as string[];

  if (!authorIds.length) {
    return new Map<
      string,
      {
        name: string;
        email: string | null;
        bio: string;
        avatarUrl: string;
        backgroundUrl: string;
        backgroundPattern: string;
        avatarPositionX: number;
        avatarPositionY: number;
        backgroundPositionX: number;
        backgroundPositionY: number;
      }
    >();
  }

  const authorEntries = await Promise.all(
    authorIds.map(async (authorId) => {
      try {
        const { data } = await supabaseAdmin.auth.admin.getUserById(authorId);
        const fullName =
          typeof data.user?.user_metadata?.full_name === "string"
            ? data.user.user_metadata.full_name
            : typeof data.user?.user_metadata?.name === "string"
              ? data.user.user_metadata.name
              : null;
        const metadata = data.user?.user_metadata;

        return [
          authorId,
          {
            name: fullName || data.user?.email || "Journi traveller",
            email: data.user?.email ?? null,
            bio: typeof metadata?.bio === "string" ? metadata.bio : "",
            avatarUrl: typeof metadata?.avatar_url === "string" ? metadata.avatar_url : "",
            backgroundUrl:
              typeof metadata?.profile_background_url === "string" ? metadata.profile_background_url : "",
            backgroundPattern:
              typeof metadata?.profile_background_pattern === "string" ? metadata.profile_background_pattern : "",
            avatarPositionX: typeof metadata?.avatar_position_x === "number" ? metadata.avatar_position_x : 50,
            avatarPositionY: typeof metadata?.avatar_position_y === "number" ? metadata.avatar_position_y : 50,
            backgroundPositionX:
              typeof metadata?.background_position_x === "number" ? metadata.background_position_x : 50,
            backgroundPositionY:
              typeof metadata?.background_position_y === "number" ? metadata.background_position_y : 50,
          },
        ] as const;
      } catch {
        return [
          authorId,
          {
            name: "Journi traveller",
            email: null,
            bio: "",
            avatarUrl: "",
            backgroundUrl: "",
            backgroundPattern: "",
            avatarPositionX: 50,
            avatarPositionY: 50,
            backgroundPositionX: 50,
            backgroundPositionY: 50,
          },
        ] as const;
      }
    }),
  );

  return new Map(authorEntries);
}

async function getAcceptedParticipantCount(
  tripId: string,
): Promise<{ count: number } | { error: { message: string } }> {
  const result = await supabaseAdmin
    .from("trip_participants")
    .select("id", { count: "exact", head: true })
    .eq("trip_id", tripId)
    .or("membership_status.eq.active,status.eq.accepted");

  if (!result.error) {
    return { count: result.count ?? 0 };
  }

  if (!result.error.message.toLowerCase().includes("membership_status")) {
    return { error: result.error };
  }

  const fallback = await supabaseAdmin
    .from("trip_participants")
    .select("id", { count: "exact", head: true })
    .eq("trip_id", tripId)
    .eq("status", "accepted");

  if (fallback.error) {
    return { error: fallback.error };
  }

  return { count: fallback.count ?? 0 };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";

  if (!token) {
    return NextResponse.json({ error: "Missing user session." }, { status: 401 });
  }

  const { id: tripId } = await params;
  const access = await getAccess(tripId, token);

  if ("error" in access) {
    return access.error;
  }

  const participantCount = await getAcceptedParticipantCount(tripId);

  if ("error" in participantCount) {
    return NextResponse.json({ error: schemaError(participantCount.error.message) }, { status: 400 });
  }

  if ((participantCount.count ?? 0) < 1) {
    return NextResponse.json({
      comments: [],
      messagingEnabled: false,
      message: "Messaging appears once a participant has been approved for this trip.",
    });
  }

  const before = request.nextUrl.searchParams.get("before");
  const pageSize = 50;
  let commentsQuery = supabaseAdmin
    .from("comments")
    .select("id, trip_id, author_id, parent_comment_id, entity_type, entity_id, body, created_at, updated_at, deleted_at")
    .eq("trip_id", tripId)
    .eq("entity_type", "trip")
    .order("created_at", { ascending: false })
    .limit(pageSize + 1);

  if (before) {
    const beforeDate = new Date(before);
    if (Number.isNaN(beforeDate.getTime())) {
      return NextResponse.json({ error: "Invalid message cursor." }, { status: 400 });
    }
    commentsQuery = commentsQuery.lt("created_at", beforeDate.toISOString());
  }

  const { data, error } = await commentsQuery;

  if (error) {
    return NextResponse.json({ error: schemaError(error.message) }, { status: 400 });
  }

  const fetchedRows = (data ?? []) as CommentRow[];
  const hasMore = fetchedRows.length > pageSize;
  const rows = fetchedRows.slice(0, pageSize).reverse();
  const authorMap = await resolveCommentAuthors(rows);

  return NextResponse.json({
    comments: rows.map((row) => {
      const author = row.author_id ? authorMap.get(row.author_id) : null;

      return {
        id: row.id,
        parentCommentId: row.parent_comment_id,
        body: row.deleted_at ? "" : row.body,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        deletedAt: row.deleted_at,
        authorId: row.author_id,
        authorName: author?.name || "Journi traveller",
        authorEmail: author?.email || null,
        authorProfile: author
          ? {
              bio: author.bio,
              avatarUrl: author.avatarUrl,
              backgroundUrl: author.backgroundUrl,
              backgroundPattern: author.backgroundPattern,
              avatarPositionX: author.avatarPositionX,
              avatarPositionY: author.avatarPositionY,
              backgroundPositionX: author.backgroundPositionX,
              backgroundPositionY: author.backgroundPositionY,
            }
          : null,
        canDelete: access.accessRole === "organiser" || row.author_id === access.user.id,
      };
    }),
    hasMore,
    nextCursor: hasMore ? rows[0]?.created_at ?? null : null,
    accessRole: access.accessRole,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";

  if (!token) {
    return NextResponse.json({ error: "Missing user session." }, { status: 401 });
  }

  const { id: tripId } = await params;
  const access = await getAccess(tripId, token);

  if ("error" in access) {
    return access.error;
  }

  const participantCount = await getAcceptedParticipantCount(tripId);

  if ("error" in participantCount) {
    return NextResponse.json({ error: schemaError(participantCount.error.message) }, { status: 400 });
  }

  if ((participantCount.count ?? 0) < 1) {
    return NextResponse.json(
      { error: "Messaging appears once a participant has been approved for this trip." },
      { status: 403 },
    );
  }

  const body = (await request.json()) as {
    body?: string;
    parentCommentId?: string | null;
  };

  const message = body.body?.trim() ?? "";

  if (!message) {
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }

  if (message.length > 5000) {
    return NextResponse.json({ error: "Message is too long." }, { status: 400 });
  }

  if (body.parentCommentId) {
    const { data: parent, error: parentError } = await supabaseAdmin
      .from("comments")
      .select("id")
      .eq("id", body.parentCommentId)
      .eq("trip_id", tripId)
      .maybeSingle();

    if (parentError) {
      return NextResponse.json({ error: schemaError(parentError.message) }, { status: 400 });
    }

    if (!parent) {
      return NextResponse.json({ error: "Reply target not found." }, { status: 404 });
    }
  }

  const { data, error } = await supabaseAdmin
    .from("comments")
    .insert({
      trip_id: tripId,
      author_id: access.user.id,
      parent_comment_id: body.parentCommentId ?? null,
      entity_type: "trip",
      body: message,
    })
    .select("id, trip_id, author_id, parent_comment_id, entity_type, entity_id, body, created_at, updated_at, deleted_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: schemaError(error?.message || "Unable to create message.") }, { status: 400 });
  }

  const authorName =
    typeof access.user.user_metadata?.full_name === "string"
      ? access.user.user_metadata.full_name
      : typeof access.user.user_metadata?.name === "string"
        ? access.user.user_metadata.name
        : access.user.email || "Journi traveller";

  await dispatchNotificationAction({
    actionKey: body.parentCommentId ? "chat.reply_sent" : "chat.message_sent",
    tripId,
    actorUserId: access.user.id,
    title: `${authorName} sent a message in ${access.trip.title}`,
    message: message.length > 180 ? `${message.slice(0, 177)}…` : message,
    url: `${process.env.NEXT_PUBLIC_SITE_URL || ""}/trips/${tripId}/discussion`,
    context: { commentId: data.id },
  });

  return NextResponse.json({
    comment: {
      id: data.id,
      parentCommentId: data.parent_comment_id,
      body: data.body,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      deletedAt: data.deleted_at,
      authorId: data.author_id,
      authorName,
      authorEmail: access.user.email ?? null,
      authorProfile: {
        bio: typeof access.user.user_metadata?.bio === "string" ? access.user.user_metadata.bio : "",
        avatarUrl:
          typeof access.user.user_metadata?.avatar_url === "string" ? access.user.user_metadata.avatar_url : "",
        backgroundUrl:
          typeof access.user.user_metadata?.profile_background_url === "string"
            ? access.user.user_metadata.profile_background_url
            : "",
        backgroundPattern:
          typeof access.user.user_metadata?.profile_background_pattern === "string"
            ? access.user.user_metadata.profile_background_pattern
            : "",
        avatarPositionX:
          typeof access.user.user_metadata?.avatar_position_x === "number"
            ? access.user.user_metadata.avatar_position_x
            : 50,
        avatarPositionY:
          typeof access.user.user_metadata?.avatar_position_y === "number"
            ? access.user.user_metadata.avatar_position_y
            : 50,
        backgroundPositionX:
          typeof access.user.user_metadata?.background_position_x === "number"
            ? access.user.user_metadata.background_position_x
            : 50,
        backgroundPositionY:
          typeof access.user.user_metadata?.background_position_y === "number"
            ? access.user.user_metadata.background_position_y
            : 50,
      },
      canDelete: true,
    },
  });
}
