import { NextRequest, NextResponse } from "next/server";
import { requireBackofficeAccess } from "@/lib/backoffice/auth";
import { sendEmailWebhook } from "@/lib/backoffice/email-webhook";

export async function POST(request: NextRequest) {
  const access = await requireBackofficeAccess(request);
  if (access instanceof NextResponse) return access;
  const body = (await request.json()) as { to?: string; subject?: string; html?: string; templateId?: string; triggerKey?: string };
  const to = body.to?.trim() || "";
  const html = body.html?.trim() || "";
  if (!/^\S+@\S+\.\S+$/.test(to) || !html) return NextResponse.json({ error: "A valid recipient and HTML body are required." }, { status: 400 });
  try {
    const result = await sendEmailWebhook({
      to,
      subject: (body.subject || "Journi email template test").replace(/[\r\n]+/g, " ").trim(),
      html,
      text: html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
      templateId: (body.templateId || "global").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 100),
      triggerKey: (body.triggerKey || "backoffice_test").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 100),
    });
    return NextResponse.json({ sent: true, ...result });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to call the email webhook." }, { status: 502 }); }
}
