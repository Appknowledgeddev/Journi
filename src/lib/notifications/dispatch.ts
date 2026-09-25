import { supabaseAdmin } from "@/lib/supabase/server";
import { sendEmailWebhook } from "@/lib/backoffice/email-webhook";
import { loadGlobalEmailTemplate } from "@/lib/backoffice/email-template";
import { loadNotificationRules } from "@/lib/backoffice/notifications";

type Recipient = {
  userId: string | null;
  email: string | null;
  name: string;
  type: string;
};
type DispatchInput = {
  actionKey: string;
  tripId: string;
  actorUserId: string;
  title: string;
  message: string;
  url?: string;
  affectedUserId?: string | null;
  affectedEmail?: string | null;
  context?: Record<string, unknown>;
};

function replace(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce(
    (value, [key, replacement]) => value.replaceAll(`{${key}}`, replacement),
    template,
  );
}

function humaniseMessageReferences(message: string) {
  return message.replace(
    /\[\[journi:([^:\]]+):([^|\]]+)\|([^\]]+)\]\]/g,
    (_match, _kind: string, _id: string, label: string) => label,
  );
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function dispatchNotificationAction(input: DispatchInput) {
  const displayMessage = humaniseMessageReferences(input.message);
  const { data: action } = await supabaseAdmin
    .from("notification_actions")
    .select("*")
    .eq("action_key", input.actionKey)
    .maybeSingle();
  if (!action?.enabled) return null;
  const { data: trip } = await supabaseAdmin
    .from("trips")
    .select("id,title,owner_id")
    .eq("id", input.tripId)
    .single();
  if (!trip) return null;
  const types = (action.recipient_types || []) as string[];
  const recipients: Recipient[] = [];
  if (types.includes("organiser") && trip.owner_id !== input.actorUserId) {
    const { data } = await supabaseAdmin.auth.admin.getUserById(trip.owner_id);
    recipients.push({
      userId: trip.owner_id,
      email: data.user?.email || null,
      name: String(
        data.user?.user_metadata?.full_name || data.user?.email || "Organiser",
      ),
      type: "organiser",
    });
  }
  if (
    types.some((type) =>
      [
        "active_participants",
        "invited_participants",
        "invited_participant",
        "affected_participant",
      ].includes(type),
    )
  ) {
    const { data } = await supabaseAdmin
      .from("trip_participants")
      .select("user_id,email,full_name,status,membership_status")
      .eq("trip_id", input.tripId);
    for (const row of data || []) {
      if (row.user_id === input.actorUserId) continue;
      const active =
        row.membership_status ? row.membership_status === "active" : row.status === "accepted";
      const invited =
        row.membership_status === "invited" ||
        ["invited", "linked", "pending"].includes(row.status || "");
      const affected =
        (input.affectedUserId && row.user_id === input.affectedUserId) ||
        (input.affectedEmail &&
          row.email?.toLowerCase() === input.affectedEmail.toLowerCase());
      const type = affected
        ? "affected_participant"
        : active
          ? "active_participants"
          : "invited_participants";
      if (
        (active && types.includes("active_participants")) ||
        (invited &&
          (types.includes("invited_participants") ||
            types.includes("invited_participant"))) ||
        (affected && types.includes("affected_participant"))
      )
        recipients.push({
          userId: row.user_id,
          email: row.email,
          name: row.full_name || row.email || "Traveller",
          type,
        });
    }
  }
  const unique = [
    ...new Map(
      recipients.map((recipient) => [
        recipient.userId || recipient.email,
        recipient,
      ]),
    ).values(),
  ];
  const { data: batch, error } = await supabaseAdmin
    .from("notification_batches")
    .insert({
      action_key: input.actionKey,
      trip_id: input.tripId,
      actor_user_id: input.actorUserId,
      email_notification_id: action.email_notification_id || null,
      recipient_count: unique.length,
      context: input.context || {},
    })
    .select("id")
    .single();
  if (error || !batch) {
    console.warn(
      "[Journi Notifications] Unable to create batch",
      error?.message,
    );
    return null;
  }
  const selectedKeys = new Set(
    unique.map((recipient) => recipient.userId || recipient.email),
  );
  const { data: ownerData } = await supabaseAdmin.auth.admin.getUserById(
    trip.owner_id,
  );
  const { data: allParticipants } = await supabaseAdmin
    .from("trip_participants")
    .select("user_id,email,full_name,status,membership_status")
    .eq("trip_id", input.tripId);
  const candidates = [
    {
      user_id: trip.owner_id,
      email: ownerData.user?.email || null,
      full_name:
        ownerData.user?.user_metadata?.full_name ||
        ownerData.user?.email ||
        "Organiser",
      status: "owner",
      membership_status: "organiser",
      connection_type: "organiser",
    },
    ...(allParticipants || []).map((row) => ({
      ...row,
      connection_type: "participant",
    })),
  ];
  const audienceEvaluations = candidates.map((candidate) => {
    const key = candidate.user_id || candidate.email;
    const selected = selectedKeys.has(key);
    const isActor = candidate.user_id === input.actorUserId;
    const membership =
      candidate.membership_status || candidate.status || "unknown";
    let reason = "Matched the selected audience for this action.";
    if (isActor)
      reason = "Not selected because this user triggered the action.";
    else if (!selected && candidate.connection_type === "organiser")
      reason = types.includes("organiser")
        ? "Organiser was excluded by another rule."
        : "Organiser is not selected for this action.";
    else if (!selected)
      reason = `Participant membership “${membership}” does not match the selected recipient types.`;
    return {
      batch_id: batch.id,
      user_id: candidate.user_id,
      email: candidate.email,
      name: String(candidate.full_name || candidate.email || "Traveller"),
      connection_type: candidate.connection_type,
      membership_status: membership,
      selected,
      reason,
    };
  });
  await supabaseAdmin
    .from("notification_audience_evaluations")
    .insert(audienceEvaluations);
  let sent = 0;
  let failed = 0;
  const deliverySummaries: Array<{
    userId: string | null;
    email: string | null;
    channel: "push" | "email";
    status: "sent" | "failed" | "skipped";
    reason: string | null;
  }> = [];
  const global = action.send_email ? await loadGlobalEmailTemplate() : null;
  const emailRule =
    action.send_email && action.email_notification_id
      ? (await loadNotificationRules()).find(
          (rule) => rule.id === action.email_notification_id,
        )
      : null;
  const activeSince = new Date(
    Date.now() - Number(action.active_window_minutes || 5) * 60_000,
  ).toISOString();
  const { data: activeRows } = action.suppress_email_when_active
    ? await supabaseAdmin
        .from("user_presence")
        .select("user_id")
        .gte("last_seen_at", activeSince)
    : { data: [] as Array<{ user_id: string }> };
  const activeUserIds = new Set((activeRows || []).map((row) => row.user_id));
  for (const recipient of unique) {
    const { data: preferences, error: preferenceError } = await supabaseAdmin.rpc("recipient_notification_preferences", { recipient: recipient.userId, recipient_address: recipient.email });
    const group = input.actionKey.startsWith("expense.") || input.actionKey.startsWith("reminder.payment") ? "payments" : input.actionKey.includes("invit") || input.actionKey.startsWith("participant.") ? "invites" : "planning";
    for (const channel of [
      action.send_push ? "push" : null,
      action.send_email ? "email" : null,
    ].filter(Boolean) as Array<"push" | "email">) {
      let status: "sent" | "failed" | "skipped" = "sent";
      let deliveryError: string | null = null;
      try {
        if (preferenceError) throw new Error("Unable to check notification preferences.");
        if (preferences?.[group] === false || preferences?.[channel === "push" ? "in_app" : "email"] === false) {
          status = "skipped"; deliveryError = "Disabled in recipient notification preferences.";
        } else if (channel === "push") {
          const { error: pushError } = await supabaseAdmin
            .from("user_notifications")
            .insert({
              user_id: recipient.userId,
              recipient_email: recipient.email,
              trip_id: input.tripId,
              batch_id: batch.id,
              action_key: input.actionKey,
              title: input.title,
              message: displayMessage,
              action_url: input.url || null,
            });
          if (pushError) throw pushError;
        } else {
          if (
            recipient.userId &&
            action.suppress_email_when_active &&
            activeUserIds.has(recipient.userId)
          ) {
            status = "skipped";
            deliveryError = `Email suppressed: user active in Journi within ${action.active_window_minutes || 5} minutes.`;
          } else if (!recipient.email) {
            status = "skipped";
            deliveryError = "Email skipped: recipient has no email address.";
          } else {
            const values = {
              email_subject: emailRule?.subject || input.title,
              content: emailRule?.body || displayMessage,
              message: displayMessage,
              action_url: input.url || "#",
              action_label: "Open Journi",
              logo_url: `${process.env.NEXT_PUBLIC_SITE_URL || ""}/journi-backoffice-logo.png`,
              first_name: recipient.name.split(" ")[0] || recipient.name,
              participant_name: recipient.name,
              trip_title: trip.title,
            };
            const resolvedContent = replace(values.content, values);
            const content = /<[^>]+>/.test(resolvedContent)
              ? resolvedContent
              : `<p>${escapeHtml(resolvedContent).replaceAll("\n", "<br />")}</p>`;
            const html =
              emailRule?.templateMode === "custom" && emailRule.customTemplate
                ? replace(emailRule.customTemplate, { ...values, content })
                : replace(global!.html, { ...values, content });
            const subject = replace(emailRule?.subject || input.title, values);
            await sendEmailWebhook({
              to: recipient.email,
              subject,
              html,
              text: replace(emailRule?.body || displayMessage, values),
              templateId: emailRule?.id || input.actionKey,
              triggerKey: input.actionKey,
            });
          }
        }
      } catch (caught) {
        status = "failed";
        deliveryError =
          caught instanceof Error ? caught.message : "Delivery failed";
      }
      if (status === "sent") sent++;
      else if (status === "failed") failed++;
      await supabaseAdmin.from("notification_deliveries").insert({
        batch_id: batch.id,
        recipient_user_id: recipient.userId,
        recipient_email: recipient.email,
        recipient_name: recipient.name,
        recipient_type: recipient.type,
        channel,
        status,
        subject: input.title,
        message: displayMessage,
        error: deliveryError,
      });
      deliverySummaries.push({
        userId: recipient.userId,
        email: recipient.email,
        channel,
        status,
        reason: deliveryError,
      });
    }
  }
  await supabaseAdmin
    .from("notification_batches")
    .update({
      status: failed ? (sent ? "partial" : "failed") : "completed",
      sent_count: sent,
      failed_count: failed,
      completed_at: new Date().toISOString(),
    })
    .eq("id", batch.id);
  const audienceLog = audienceEvaluations.map((person) => {
    const deliveries = deliverySummaries.filter((delivery) =>
      person.user_id
        ? delivery.userId === person.user_id
        : delivery.email === person.email,
    );
    const received = deliveries.some((delivery) => delivery.status === "sent");
    return {
      name: person.name,
      email: person.email,
      connectionType: person.connection_type,
      membershipStatus: person.membership_status,
      selected: person.selected,
      received,
      reason: person.selected
        ? deliveries.length
          ? deliveries
              .map(
                (delivery) =>
                  `${delivery.channel}: ${delivery.status}${delivery.reason ? ` (${delivery.reason})` : ""}`,
              )
              .join("; ")
          : "Selected, but no delivery channel was enabled."
        : person.reason,
    };
  });
  console.info("[Journi Notifications] Batch audience and delivery log", {
    batchId: batch.id,
    action: input.actionKey,
    tripId: input.tripId,
    summary: {
      considered: audienceLog.length,
      selected: unique.length,
      sent,
      failed,
      notReceived: audienceLog.filter((person) => !person.received).length,
    },
    people: audienceLog,
  });
  return batch.id;
}
