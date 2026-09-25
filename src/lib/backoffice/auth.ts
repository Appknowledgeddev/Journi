import { NextRequest, NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { databaseSetupError } from "@/lib/api/errors";
import {
  missingSupabaseServerVariables,
  supabaseAdmin,
} from "@/lib/supabase/server";

export type BackofficeAccess = {
  user: User;
  accessMode: "development" | "restricted";
};

export function getBackofficeUserRole(user: User) {
  const metadataRole =
    typeof user.user_metadata?.role === "string" ? user.user_metadata.role : null;
  const appRole = typeof user.app_metadata?.role === "string" ? user.app_metadata.role : null;

  return (metadataRole ?? appRole ?? "").toLowerCase();
}

function getBearerToken(request: NextRequest) {
  const header = request.headers.get("authorization") ?? "";

  if (!header.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  return header.slice("bearer ".length).trim();
}

function getConfiguredAdminEmails() {
  return (process.env.BACKOFFICE_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function canUseBackoffice(user: User) {
  const role = getBackofficeUserRole(user);

  if (role === "admin" || role === "super_admin") {
    return true;
  }

  const adminEmails = getConfiguredAdminEmails();
  const email = (user.email ?? "").toLowerCase();

  if (email && adminEmails.includes(email)) {
    return true;
  }

  return process.env.NODE_ENV !== "production" && adminEmails.length === 0;
}

export async function requireBackofficeAccess(
  request: NextRequest,
): Promise<BackofficeAccess | NextResponse> {
  if (missingSupabaseServerVariables.length > 0) {
    return NextResponse.json(
      { error: databaseSetupError(missingSupabaseServerVariables) },
      { status: 500 },
    );
  }

  const token = getBearerToken(request);

  if (!token) {
    return NextResponse.json(
      { error: "Sign in with an admin account before opening the backoffice." },
      { status: 401 },
    );
  }

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    return NextResponse.json(
      { error: "Your admin session has expired. Please sign in again." },
      { status: 401 },
    );
  }

  if (!canUseBackoffice(user)) {
    return NextResponse.json(
      {
        error:
          "Backoffice access is not enabled for this account. Add your email to BACKOFFICE_ADMIN_EMAILS or set your role to admin.",
      },
      { status: 403 },
    );
  }

  return {
    user,
    accessMode: process.env.NODE_ENV === "production" ? "restricted" : "development",
  };
}
