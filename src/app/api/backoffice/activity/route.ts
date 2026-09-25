import { NextRequest, NextResponse } from "next/server";
import { friendlyDatabaseError } from "@/lib/api/errors";
import { loadActivityLogs, loadActivityLogsForRecord } from "@/lib/backoffice/activity";
import { requireBackofficeAccess } from "@/lib/backoffice/auth";

export async function GET(request: NextRequest) {
  const access = await requireBackofficeAccess(request);

  if (access instanceof NextResponse) {
    return access;
  }

  try {
    const tableName = request.nextUrl.searchParams.get("table");
    const recordId = request.nextUrl.searchParams.get("recordId");
    const activityLogs =
      tableName && recordId
        ? await loadActivityLogsForRecord(tableName, recordId, 150)
        : await loadActivityLogs(500);

    return NextResponse.json({ accessMode: access.accessMode, activityLogs });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load activity.";

    return NextResponse.json(
      { error: friendlyDatabaseError(message, "load the activity log") },
      { status: 500 },
    );
  }
}
