import { NextRequest, NextResponse } from "next/server";
import { requireBackofficeAccess } from "@/lib/backoffice/auth";
import { loadEmailWebhook, saveEmailWebhook } from "@/lib/backoffice/email-webhook";

export async function GET(request: NextRequest) {
  const access = await requireBackofficeAccess(request);
  if (access instanceof NextResponse) return access;
  try {
    const settings = await loadEmailWebhook();
    return NextResponse.json({ configured: Boolean(settings), url: settings?.url || "", hasSecret: settings?.hasSecret || false, updatedAt: settings?.updatedAt || null });
  } catch (error) { return NextResponse.json({ configured: false, url: "", hasSecret: false, error: error instanceof Error ? error.message : "Unable to load webhook settings." }); }
}

export async function PATCH(request: NextRequest) {
  const access = await requireBackofficeAccess(request);
  if (access instanceof NextResponse) return access;
  const body = (await request.json()) as { url?: string; secret?: string; clearSecret?: boolean };
  if (!body.url?.trim()) return NextResponse.json({ error: "Webhook URL is required." }, { status: 400 });
  try { return NextResponse.json({ settings: await saveEmailWebhook(body.url.trim(), body.secret, body.clearSecret) }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save webhook settings." }, { status: 400 }); }
}
