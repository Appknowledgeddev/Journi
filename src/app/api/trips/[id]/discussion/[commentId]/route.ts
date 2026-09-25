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

function hasParticipantAccess(participant: { status?: string | null; membership_status?: string | null } | null) {
  if (!participant) {
    return false;
  }

  return participant.membership_status === "active" || participant.status === "accepted";
}

async function selectActiveParticipantLink(tripId: string, userId: string, userEmail: string) {
  const result = await supabaseAdmin
    .from("trip_participants")
    .select("id, status, membership_status")
    .eq("trip_id", tripId)
    .or(`user_id.eq.${userId},email.eq.${userEmail}`)
    .maybeSingle();

  if (!result.error) {
    return result;
  }

  if (!result.error.message.toLowerCase().includes("membership_status")) {
    return result;
  }

  return supabaseAdmin
    .from("trip_participants")
    .select("id, status")
    .eq("trip_id", tripId)
    .or(`user_id.eq.${userId},email.eq.${userEmail}`)
    .maybeSingle();
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> },
) {
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

  const { id: tripId, commentId } = await params;
  const payload = (await request.json().catch(() => null)) as { body?: unknown } | null;
  const body = typeof payload?.body === "string" ? payload.body.trim() : "";

  if (!body) {
    return NextResponse.json({ error: "Message text is required." }, { status: 400 });
  }

  if (body.length > 5000) {
    return NextResponse.json({ error: "Messages can be up to 5,000 characters." }, { status: 400 });
  }

  const { data: comment, error: commentError } = await supabaseAdmin
    .from("comments")
    .select("id, author_id, deleted_at")
    .eq("id", commentId)
    .eq("trip_id", tripId)
    .single();

  if (commentError || !comment) {
    return NextResponse.json({ error: schemaError(commentError?.message || "Comment not found.") }, { status: 404 });
  }

  if (comment.author_id !== user.id) {
    return NextResponse.json({ error: "You can only edit your own messages." }, { status: 403 });
  }


  if (comment.deleted_at) {
    return NextResponse.json({ error: "Deleted messages cannot be edited." }, { status: 400 });
  }

  const updatedAt = new Date().toISOString();
  const { data: updatedComment, error: updateError } = await supabaseAdmin
    .from("comments")
    .update({ body, updated_at: updatedAt })
    .eq("id", commentId)
    .eq("trip_id", tripId)
    .select("id, body, updated_at")
    .single();

  if (updateError || !updatedComment) {
    return NextResponse.json({ error: schemaError(updateError?.message || "Unable to edit message.") }, { status: 400 });
  }

  return NextResponse.json({
    comment: {
      id: updatedComment.id,
      body: updatedComment.body,
      updatedAt: updatedComment.updated_at,
    },
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> },
) {
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

  const { id: tripId, commentId } = await params;
  const userEmail = (user.email ?? "").toLowerCase();

  const { data: trip, error: tripError } = await supabaseAdmin
    .from("trips")
    .select("id, owner_id")
    .eq("id", tripId)
    .single();

  if (tripError || !trip) {
    return NextResponse.json({ error: schemaError(tripError?.message || "Trip not found.") }, { status: 404 });
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
      return NextResponse.json({ error: schemaError(participantError.message) }, { status: 400 });
    }

    if (hasParticipantAccess(participantLink)) {
      accessRole = "participant";
    }
  }

  if (!accessRole) {
    return NextResponse.json({ error: "You do not have access to this trip." }, { status: 403 });
  }

  const { data: comment, error: commentError } = await supabaseAdmin
    .from("comments")
    .select("id, author_id")
    .eq("id", commentId)
    .eq("trip_id", tripId)
    .single();

  if (commentError || !comment) {
    return NextResponse.json({ error: schemaError(commentError?.message || "Comment not found.") }, { status: 404 });
  }

  if (accessRole !== "organiser" && comment.author_id !== user.id) {
    return NextResponse.json({ error: "Only organisers can remove other people's messages." }, { status: 403 });
  }

  const deletedAt = new Date().toISOString();
  const { error: deleteError } = await supabaseAdmin
    .from("comments")
    .update({ body: "", deleted_at: deletedAt, updated_at: deletedAt })
    .eq("id", commentId);

  if (deleteError) {
    return NextResponse.json({ error: schemaError(deleteError.message) }, { status: 400 });
  }

  return NextResponse.json({ success: true, deletedAt });
}
