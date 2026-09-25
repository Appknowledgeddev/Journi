import { supabaseAdmin } from "@/lib/supabase/server";

export type NotificationRule = {
  id: string;
  title: string;
  triggerKey: string;
  audience: string;
  channel: string;
  sendTiming: string;
  subject: string;
  body: string;
  pushBody: string;
  customTemplate: string;
  templateMode: "global" | "custom";
  enabled: boolean;
  updatedAt: string | null;
  source: "database" | "default";
};

export const defaultNotificationRules: NotificationRule[] = [
  {
    id: "trip_invite_sent",
    title: "Trip invite sent",
    triggerKey: "participant_invited",
    audience: "Invited traveller",
    channel: "Email + In-app",
    sendTiming: "Immediately after invite is sent",
    subject: "You have been invited to {trip_title}",
    body: "Hi {first_name}, you have been invited to join {trip_title}. Open Journi to view the trip and respond.",
    pushBody: "You have been invited to join {trip_title}.",
    customTemplate: "",
    templateMode: "global",
    enabled: true,
    updatedAt: null,
    source: "default",
  },
  {
    id: "public_interest_received",
    title: "Public trip interest",
    triggerKey: "participant_interest_requested",
    audience: "Trip organiser",
    channel: "Email + In-app",
    sendTiming: "Immediately after someone registers interest",
    subject: "New interest for {trip_title}",
    body: "{participant_name} has registered interest in {trip_title}. Review the request in your trip workspace.",
    pushBody: "{participant_name} registered interest in {trip_title}.",
    customTemplate: "",
    templateMode: "global",
    enabled: true,
    updatedAt: null,
    source: "default",
  },
  {
    id: "participant_approved",
    title: "Participant approved",
    triggerKey: "participant_approved",
    audience: "Participant",
    channel: "Email + In-app",
    sendTiming: "Immediately after organiser approval",
    subject: "You are approved for {trip_title}",
    body: "Good news, {first_name}. You have been approved for {trip_title}. Open Journi to confirm your attendance.",
    pushBody: "You have been approved for {trip_title}.",
    customTemplate: "",
    templateMode: "global",
    enabled: true,
    updatedAt: null,
    source: "default",
  },
  {
    id: "voting_deadline_reminder",
    title: "Voting deadline reminder",
    triggerKey: "voting_deadline_approaching",
    audience: "Active participants",
    channel: "Email + In-app",
    sendTiming: "24 hours before voting deadline",
    subject: "Voting closes soon for {trip_title}",
    body: "Voting for {trip_title} closes soon. Add your choices before the organiser makes the final decision.",
    pushBody: "Voting for {trip_title} closes soon.",
    customTemplate: "",
    templateMode: "global",
    enabled: true,
    updatedAt: null,
    source: "default",
  },
  {
    id: "trip_published",
    title: "Trip published",
    triggerKey: "trip_published",
    audience: "Invited and active participants",
    channel: "Email + In-app",
    sendTiming: "Immediately after trip is published",
    subject: "{trip_title} is now live",
    body: "{trip_title} has been published. Open Journi to view the latest details and next steps.",
    pushBody: "{trip_title} is now live.",
    customTemplate: "",
    templateMode: "global",
    enabled: true,
    updatedAt: null,
    source: "default",
  },
  {
    id: "payment_follow_up",
    title: "Payment follow-up",
    triggerKey: "payment_pending",
    audience: "Participants with unpaid balances",
    channel: "Email",
    sendTiming: "3 days after payment request",
    subject: "Payment reminder for {trip_title}",
    body: "A payment is still pending for {trip_title}. Please review the payment details in Journi.",
    pushBody: "A payment is still pending for {trip_title}.",
    customTemplate: "",
    templateMode: "global",
    enabled: false,
    updatedAt: null,
    source: "default",
  },
];

function normaliseRule(row: Record<string, unknown>): NotificationRule {
  return {
    id: String(row.id ?? ""),
    title: typeof row.title === "string" ? row.title : "Notification",
    triggerKey: typeof row.trigger_key === "string" ? row.trigger_key : "",
    audience: typeof row.audience === "string" ? row.audience : "",
    channel: typeof row.channel === "string" ? row.channel : "Email",
    sendTiming: typeof row.send_timing === "string" ? row.send_timing : "",
    subject: typeof row.subject === "string" ? row.subject : "",
    body: typeof row.body === "string" ? row.body : "",
    pushBody: typeof row.push_body === "string" ? row.push_body : typeof row.body === "string" ? row.body : "",
    customTemplate: typeof row.custom_template_html === "string" ? row.custom_template_html : "",
    templateMode: row.template_mode === "custom" ? "custom" : "global",
    enabled: typeof row.enabled === "boolean" ? row.enabled : true,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
    source: "database",
  };
}

export async function loadNotificationRules() {
  const { data, error } = await supabaseAdmin
    .from("notification_rules")
    .select("id,title,trigger_key,audience,channel,send_timing,subject,body,push_body,custom_template_html,template_mode,enabled,updated_at")
    .order("title", { ascending: true });

  if (error || !data || data.length === 0) {
    return defaultNotificationRules;
  }

  const savedRulesById = new Map(
    (data as unknown as Array<Record<string, unknown>>).map((row) => {
      const rule = normaliseRule(row);
      return [rule.id, rule];
    }),
  );

  return defaultNotificationRules.map((rule) => savedRulesById.get(rule.id) ?? rule);
}

export async function saveNotificationRule(rule: NotificationRule) {
  const { data, error } = await supabaseAdmin
    .from("notification_rules")
    .upsert({
      id: rule.id,
      title: rule.title,
      trigger_key: rule.triggerKey,
      audience: rule.audience,
      channel: rule.channel,
      send_timing: rule.sendTiming,
      subject: rule.subject,
      body: rule.body,
      push_body: rule.pushBody,
      custom_template_html: rule.customTemplate,
      template_mode: rule.templateMode,
      enabled: rule.enabled,
      updated_at: new Date().toISOString(),
    })
    .select("id,title,trigger_key,audience,channel,send_timing,subject,body,push_body,custom_template_html,template_mode,enabled,updated_at")
    .single();

  if (error) {
    throw error;
  }

  return normaliseRule(data as Record<string, unknown>);
}
