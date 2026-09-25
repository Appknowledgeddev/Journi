import type { User } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/server";

export type ActivityLog = {
  id: string;
  occurredAt: string;
  actorUserId: string | null;
  actorEmail: string | null;
  action: string;
  tableName: string | null;
  recordId: string | null;
  tripId: string | null;
  summary: string;
  metadata: Record<string, unknown>;
};

type ActivityInsert = {
  actor?: Pick<User, "id" | "email"> | null;
  action: string;
  tableName?: string | null;
  recordId?: string | null;
  tripId?: string | null;
  summary: string;
  metadata?: Record<string, unknown>;
};

function toActivityLog(row: Record<string, unknown>): ActivityLog {
  return {
    id: String(row.id ?? ""),
    occurredAt: typeof row.occurred_at === "string" ? row.occurred_at : "",
    actorUserId: typeof row.actor_user_id === "string" ? row.actor_user_id : null,
    actorEmail: typeof row.actor_email === "string" ? row.actor_email : null,
    action: String(row.action ?? ""),
    tableName: typeof row.table_name === "string" ? row.table_name : null,
    recordId: typeof row.record_id === "string" ? row.record_id : null,
    tripId: typeof row.trip_id === "string" ? row.trip_id : null,
    summary: String(row.summary ?? ""),
    metadata:
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {},
  };
}

export async function logBackofficeActivity({
  actor,
  action,
  tableName = null,
  recordId = null,
  tripId = null,
  summary,
  metadata = {},
}: ActivityInsert) {
  const { error } = await supabaseAdmin.from("activity_logs").insert({
    actor_user_id: actor?.id ?? null,
    actor_email: actor?.email ?? null,
    action,
    table_name: tableName,
    record_id: recordId,
    trip_id: tripId,
    summary,
    metadata,
  });

  if (error) {
    console.warn("[Journi Backoffice] Unable to write activity log", error.message);
  }
}

export async function loadActivityLogs(limit = 250) {
  const { data, error } = await supabaseAdmin
    .from("activity_logs")
    .select("id,occurred_at,actor_user_id,actor_email,action,table_name,record_id,trip_id,summary,metadata")
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map(toActivityLog);
}

export async function loadActivityLogsForTrip(tripId: string, limit = 100) {
  const { data, error } = await supabaseAdmin
    .from("activity_logs")
    .select("id,occurred_at,actor_user_id,actor_email,action,table_name,record_id,trip_id,summary,metadata")
    .eq("trip_id", tripId)
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn("[Journi Backoffice] Unable to load trip activity log", error.message);
    return [];
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map(toActivityLog);
}

export async function loadActivityLogsForRecord(tableName: string, recordId: string, limit = 100) {
  const { data, error } = await supabaseAdmin
    .from("activity_logs")
    .select("id,occurred_at,actor_user_id,actor_email,action,table_name,record_id,trip_id,summary,metadata")
    .eq("table_name", tableName)
    .eq("record_id", recordId)
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map(toActivityLog);
}
