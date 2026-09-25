import { NextRequest, NextResponse } from "next/server";
import { requireBackofficeAccess } from "@/lib/backoffice/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { loadNotificationRules } from "@/lib/backoffice/notifications";

export async function GET(request: NextRequest) {
  const access = await requireBackofficeAccess(request); if (access instanceof NextResponse) return access;
  const [{ data: actions, error }, { data: batches }, notificationRules] = await Promise.all([
    supabaseAdmin.from("notification_actions").select("*").order("category").order("label"),
    supabaseAdmin.from("notification_batches").select("id,action_key,trip_id,email_notification_id,status,recipient_count,sent_count,failed_count,created_at,completed_at,notification_deliveries(id,recipient_email,recipient_name,recipient_type,channel,status,error),notification_audience_evaluations(id,user_id,email,name,connection_type,membership_status,selected,reason)").order("created_at", { ascending: false }).limit(100),
    loadNotificationRules(),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ actions: actions || [], batches: batches || [], notificationRules: notificationRules.filter((rule) => rule.channel.toLowerCase().includes("email")) });
}

export async function PATCH(request: NextRequest) {
  const access = await requireBackofficeAccess(request); if (access instanceof NextResponse) return access;
  const body = await request.json() as { actionKey?: string; enabled?: boolean; sendPush?: boolean; sendEmail?: boolean; recipientTypes?: string[]; emailNotificationId?: string|null; suppressEmailWhenActive?:boolean; activeWindowMinutes?:number };
  if (!body.actionKey) return NextResponse.json({ error: "Action key is required." }, { status: 400 });
  const allowed = ["organiser","active_participants","invited_participants","invited_participant","affected_participant"];
  const { data, error } = await supabaseAdmin.from("notification_actions").update({ enabled: body.enabled, send_push: body.sendPush, send_email: body.sendEmail, recipient_types: (body.recipientTypes || []).filter((value) => allowed.includes(value)), email_notification_id: body.emailNotificationId || null, suppress_email_when_active: body.suppressEmailWhenActive !== false, active_window_minutes: Math.min(120,Math.max(1,Number(body.activeWindowMinutes)||5)), updated_at: new Date().toISOString() }).eq("action_key", body.actionKey).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ action: data });
}
