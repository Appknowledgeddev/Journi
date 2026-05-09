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
    const { data: participantLink, error: participantError } = await supabaseAdmin
      .from("trip_participants")
      .select("id")
      .eq("trip_id", tripId)
      .eq("status", "accepted")
      .or(`user_id.eq.${user.id},email.eq.${userEmail}`)
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

  const { error: deleteError } = await supabaseAdmin.from("comments").delete().eq("id", commentId);

  if (deleteError) {
    return NextResponse.json({ error: schemaError(deleteError.message) }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
