import { NextRequest, NextResponse } from "next/server";
import { friendlyDatabaseError } from "@/lib/api/errors";
import { logBackofficeActivity } from "@/lib/backoffice/activity";
import { requireBackofficeAccess } from "@/lib/backoffice/auth";
import {
  loadNotificationRules,
  saveNotificationRule,
  type NotificationRule,
} from "@/lib/backoffice/notifications";

export async function GET(request: NextRequest) {
  const access = await requireBackofficeAccess(request);

  if (access instanceof NextResponse) {
    return access;
  }

  const notificationRules = await loadNotificationRules();

  return NextResponse.json({ notificationRules });
}

export async function PATCH(request: NextRequest) {
  const access = await requireBackofficeAccess(request);

  if (access instanceof NextResponse) {
    return access;
  }

  const body = (await request.json()) as Partial<NotificationRule>;

  if (!body.id || !body.title || !body.triggerKey || !body.audience || !body.sendTiming) {
    return NextResponse.json(
      { error: "Notification rule is missing required fields." },
      { status: 400 },
    );
  }

  try {
    const notificationRule = await saveNotificationRule({
      id: body.id,
      title: body.title,
      triggerKey: body.triggerKey,
      audience: body.audience,
      channel: body.channel || "Email",
      sendTiming: body.sendTiming,
      subject: body.subject || "",
      body: body.body || "",
      pushBody: body.pushBody || body.body || "",
      customTemplate: body.customTemplate || "",
      templateMode: body.templateMode === "custom" ? "custom" : "global",
      enabled: body.enabled ?? true,
      updatedAt: null,
      source: "database",
    });

    await logBackofficeActivity({
      actor: access.user,
      action: "backoffice.notification_rule.update",
      tableName: "notification_rules",
      recordId: notificationRule.id,
      summary: `Backoffice updated notification rule ${notificationRule.title}`,
      metadata: {
        triggerKey: notificationRule.triggerKey,
        channel: notificationRule.channel,
        enabled: notificationRule.enabled,
      },
    });

    return NextResponse.json({ notificationRule });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to save notification rule.";

    return NextResponse.json(
      { error: friendlyDatabaseError(message, "save this notification rule") },
      { status: 500 },
    );
  }
}
