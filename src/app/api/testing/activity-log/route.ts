import { NextRequest, NextResponse } from "next/server";
import { loadActivityLogsForTrip, type ActivityLog } from "@/lib/backoffice/activity";
import { supabaseAdmin } from "@/lib/supabase/server";

function getBearerToken(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
}

function metadataContainsViewer(log: ActivityLog, viewerEmail: string, viewerId: string) {
  const text = JSON.stringify(log.metadata ?? {}).toLowerCase();

  return Boolean(
    viewerEmail && text.includes(viewerEmail.toLowerCase()) ||
      viewerId && text.includes(viewerId.toLowerCase()),
  );
}

function classifyActivity(log: ActivityLog, viewerEmail: string, viewerId: string) {
  const action = log.action.toLowerCase();
  const metadata = log.metadata as {
    notification?: {
      recipientEmail?: string;
      actorEmail?: string;
      status?: string;
      triggerKey?: string;
      channel?: string;
    };
  };
  const recipientEmail = metadata.notification?.recipientEmail?.toLowerCase() ?? "";
  const actorEmail = metadata.notification?.actorEmail?.toLowerCase() ?? "";

  if (action.startsWith("notification.")) {
    if (recipientEmail === viewerEmail) {
      return "Notification to this user";
    }

    if (log.actorUserId === viewerId || log.actorEmail?.toLowerCase() === viewerEmail || actorEmail === viewerEmail) {
      return "Notification caused by this user";
    }

    return "Trip notification";
  }

  if (log.actorUserId === viewerId || log.actorEmail?.toLowerCase() === viewerEmail) {
    return "Action by this user";
  }

  if (metadataContainsViewer(log, viewerEmail, viewerId)) {
    return "Action about this user";
  }

  return "Trip activity";
}

export async function GET(request: NextRequest) {
  const token = getBearerToken(request);

  if (!token) {
    return NextResponse.json({ error: "Missing user session." }, { status: 401 });
  }

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    return NextResponse.json({ error: "Invalid user session." }, { status: 401 });
  }

  const tripId = request.nextUrl.searchParams.get("tripId");

  if (!tripId) {
    return NextResponse.json({ error: "Trip id is required." }, { status: 400 });
  }

  const viewerEmail = (user.email ?? "").toLowerCase();
  const activityLogs = await loadActivityLogsForTrip(tripId, 150);
  const relatedLogs = activityLogs
    .filter((log) =>
      log.actorUserId === user.id ||
      log.actorEmail?.toLowerCase() === viewerEmail ||
      log.action.toLowerCase().startsWith("notification.") ||
      metadataContainsViewer(log, viewerEmail, user.id),
    )
    .slice(0, 60)
    .map((log) => ({
      ...log,
      viewerContext: classifyActivity(log, viewerEmail, user.id),
    }));

  return NextResponse.json({ activityLogs: relatedLogs });
}
