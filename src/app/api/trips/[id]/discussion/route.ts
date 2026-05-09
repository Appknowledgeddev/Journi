import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

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
};

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
    const { data: participantLink, error: participantError } = await supabaseAdmin
      .from("trip_participants")
      .select("id")
      .eq("trip_id", tripId)
      .eq("status", "accepted")
      .or(`user_id.eq.${user.id},email.eq.${userEmail}`)
      .maybeSingle();

    if (participantError) {
      return { error: NextResponse.json({ error: schemaError(participantError.message) }, { status: 400 }) };
    }

    if (participantLink) {
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
    return new Map<string, { name: string; email: string | null }>();
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

        return [
          authorId,
          {
            name: fullName || data.user?.email || "Journi traveller",
            email: data.user?.email ?? null,
          },
        ] as const;
      } catch {
        return [authorId, { name: "Journi traveller", email: null }] as const;
      }
    }),
  );

  return new Map(authorEntries);
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

  const { data, error } = await supabaseAdmin
    .from("comments")
    .select("id, trip_id, author_id, parent_comment_id, entity_type, entity_id, body, created_at, updated_at")
    .eq("trip_id", tripId)
    .eq("entity_type", "trip")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: schemaError(error.message) }, { status: 400 });
  }

  const rows = (data ?? []) as CommentRow[];
  const authorMap = await resolveCommentAuthors(rows);

  return NextResponse.json({
    comments: rows.map((row) => {
      const author = row.author_id ? authorMap.get(row.author_id) : null;

      return {
        id: row.id,
        parentCommentId: row.parent_comment_id,
        body: row.body,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        authorId: row.author_id,
        authorName: author?.name || "Journi traveller",
        authorEmail: author?.email || null,
        canDelete: access.accessRole === "organiser" || row.author_id === access.user.id,
      };
    }),
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

  const body = (await request.json()) as {
    body?: string;
    parentCommentId?: string | null;
  };

  const message = body.body?.trim() ?? "";

  if (!message) {
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }

  if (message.length > 2000) {
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
    .select("id, trip_id, author_id, parent_comment_id, entity_type, entity_id, body, created_at, updated_at")
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

  return NextResponse.json({
    comment: {
      id: data.id,
      parentCommentId: data.parent_comment_id,
      body: data.body,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      authorId: data.author_id,
      authorName,
      authorEmail: access.user.email ?? null,
      canDelete: true,
    },
  });
}
