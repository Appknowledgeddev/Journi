import { NextRequest, NextResponse } from "next/server";
import { friendlyDatabaseError } from "@/lib/api/errors";
import { requireBackofficeAccess } from "@/lib/backoffice/auth";
import { loadGlobalEmailTemplate, saveGlobalEmailTemplate } from "@/lib/backoffice/email-template";

export async function GET(request: NextRequest) {
  const access = await requireBackofficeAccess(request);
  if (access instanceof NextResponse) return access;
  return NextResponse.json({ template: await loadGlobalEmailTemplate() });
}

export async function PATCH(request: NextRequest) {
  const access = await requireBackofficeAccess(request);
  if (access instanceof NextResponse) return access;
  const body = (await request.json()) as { name?: string; html?: string };
  if (!body.name?.trim() || !body.html?.trim()) return NextResponse.json({ error: "Template name and HTML are required." }, { status: 400 });
  try {
    return NextResponse.json({ template: await saveGlobalEmailTemplate(body.name.trim(), body.html) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save the global email template.";
    return NextResponse.json({ error: friendlyDatabaseError(message, "save the global email template") }, { status: 500 });
  }
}
