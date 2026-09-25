import { NextRequest, NextResponse } from "next/server";
import { friendlyDatabaseError } from "@/lib/api/errors";
import { logBackofficeActivity } from "@/lib/backoffice/activity";
import { requireBackofficeAccess } from "@/lib/backoffice/auth";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireBackofficeAccess(request);

  if (access instanceof NextResponse) {
    return access;
  }

  const { id: userId } = await params;

  try {
    let requestedNext = "/dashboard";

    try {
      const body = (await request.json()) as { next?: unknown };
      if (typeof body.next === "string" && body.next.startsWith("/") && !body.next.startsWith("//")) {
        requestedNext = body.next;
      }
    } catch {
      requestedNext = "/dashboard";
    }

    const { data: userResult, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);

    if (userError || !userResult.user?.email) {
      return NextResponse.json({ error: "This account cannot be assumed because it has no email." }, { status: 404 });
    }

    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: userResult.user.email,
      options: {
        redirectTo: `${request.nextUrl.origin}/auth/assume?next=${encodeURIComponent(requestedNext)}`,
      },
    });

    if (error || !data.properties?.action_link) {
      throw error ?? new Error("Supabase did not return an account access link.");
    }

    const properties = data.properties as {
      action_link?: string;
      hashed_token?: string;
    };
    const assumeUrl = properties.hashed_token
      ? `${request.nextUrl.origin}/auth/assume?token_hash=${encodeURIComponent(
          properties.hashed_token,
        )}&type=magiclink&next=${encodeURIComponent(requestedNext)}`
      : properties.action_link;

    console.info("[Journi Backoffice] Admin generated account assumption link", {
      adminUserId: access.user.id,
      assumedUserId: userId,
    });

    await logBackofficeActivity({
      actor: access.user,
      action: "backoffice.user.assume",
      tableName: "auth.users",
      recordId: userId,
      summary: `Backoffice assumed account ${userResult.user.email}`,
      metadata: {
        assumedUserId: userId,
        assumedUserEmail: userResult.user.email,
      },
    });

    return NextResponse.json({
      assumeUrl,
      userEmail: userResult.user.email,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to assume this account.";

    return NextResponse.json(
      { error: friendlyDatabaseError(message, "assume this account") },
      { status: 500 },
    );
  }
}
