import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { sendEmailWebhook } from "@/lib/backoffice/email-webhook";
export const runtime = "nodejs";
export const maxDuration = 60;
const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  if (!expected || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (!site || !/^https:\/\//.test(site)) return NextResponse.json({ error: "Configure NEXT_PUBLIC_SITE_URL before delivering notification emails." }, { status: 503 });
  const { error: reminderError } = await supabaseAdmin.rpc("send_trip_reminders");
  if (reminderError) return NextResponse.json({ error: "Unable to enqueue reminders." }, { status: 500 });
  const { data: queue, error } = await supabaseAdmin.rpc("claim_notification_emails");
  if (error) return NextResponse.json({ error: "Unable to load email queue." }, { status: 500 });
  let sent = 0, failed = 0, skipped = 0;
  await Promise.all((queue || []).map(async (item: { id: string; user_id: string | null; recipient_email: string | null; trip_id: string; action_key: string; title: string; message: string; action_url: string; attempts: number; context: { paymentId?: string; dueDate?: string; votingDeadline?: string } }) => {
    let status = "sent", lastError: string | null = null;
    try {
      const { data: trip, error: tripError } = await supabaseAdmin.from("trips").select("owner_id,status,voting_deadline").eq("id", item.trip_id).maybeSingle();
      if (tripError) throw tripError;
      const userResult = item.user_id ? await supabaseAdmin.auth.admin.getUserById(item.user_id) : null;
      if (userResult?.error) throw userResult.error;
      const email = userResult?.data.user?.email || item.recipient_email;
      const { data: prefs, error: prefsError } = await supabaseAdmin.rpc("recipient_notification_preferences", { recipient: item.user_id, recipient_address: email });
      if (prefsError) throw prefsError;
      const group = item.action_key.startsWith("expense.") || item.action_key.startsWith("reminder.payment") ? "payments" : "planning";
      let active = trip?.owner_id === item.user_id;
      if (trip && !active) {
        const { data: members, error: memberError } = await supabaseAdmin.from("trip_participants").select("user_id,email,membership_status,status").eq("trip_id", item.trip_id);
        if (memberError) throw memberError;
        active = (members || []).some(p => (p.membership_status ? p.membership_status === "active" : p.status === "accepted") && (item.user_id ? p.user_id === item.user_id || (!p.user_id && p.email?.toLowerCase() === email?.toLowerCase()) : p.email?.toLowerCase() === email?.toLowerCase()));
      }
      let stale = false;
      if (item.context?.paymentId) {
        const { data: payment, error: paymentError } = await supabaseAdmin.from("trip_expense_payments").select("status,claimed_at,expense_id").eq("trip_id", item.trip_id).eq("id", item.context.paymentId).maybeSingle();
        if (paymentError) throw paymentError;
        const { data: cost, error: costError } = payment ? await supabaseAdmin.from("trip_costs").select("due_date").eq("id", payment.expense_id).single() : { data: null, error: null };
        if (costError) throw costError;
        stale = !payment || payment.status !== "due" || Boolean(payment.claimed_at) || cost?.due_date !== item.context.dueDate;
      }
      if (item.context?.votingDeadline) stale = Date.parse(trip?.voting_deadline || "") !== Date.parse(item.context.votingDeadline) || Date.parse(item.context.votingDeadline) <= Date.now();
      if (!trip || !active || !email || prefs?.email === false || prefs?.[group] === false || stale || (item.action_key.startsWith("reminder.") && ["cancelled", "closed", "completed"].includes(trip.status))) {
        status = "skipped"; lastError = "Recipient, preference or reminder is no longer eligible."; skipped++;
      } else {
        const url = new URL(item.action_url || `/trips/${item.trip_id}`, site);
        if (url.origin !== new URL(site).origin) throw new Error("Invalid notification link.");
        await sendEmailWebhook({ to: email, subject: item.title, text: `${item.message}\n\n${url}`, html: `<p>${escape(item.message)}</p><p><a href="${escape(url.toString())}">Open Journi</a></p>`, triggerKey: item.action_key, idempotencyKey: item.id });
        sent++;
      }
    } catch (caught) {
      failed++; status = item.attempts >= 5 ? "failed" : "pending";
      lastError = caught instanceof Error ? caught.message : "Delivery failed.";
    }
    const { error: saveError } = await supabaseAdmin.from("notification_email_queue").update({ status, last_error: lastError, available_at: new Date(Date.now() + 60000 * 2 ** item.attempts).toISOString() }).eq("id", item.id).eq("attempts", item.attempts);
    if (saveError) throw saveError;
  }));
  return NextResponse.json({ sent, failed, skipped });
}
