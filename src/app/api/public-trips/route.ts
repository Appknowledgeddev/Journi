import { NextRequest, NextResponse } from "next/server";
import { databaseSetupError, friendlyDatabaseError, isDatabaseSchemaError } from "@/lib/api/errors";
import { missingSupabaseServerVariables, supabaseAdmin } from "@/lib/supabase/server";

const publicTripSelect =
  "id, title, destination, description, status, visibility, starts_at, ends_at, cover_image_url, created_at, owner_id";

const fallbackPublicSeedOwnerEmails = [
  "journi-public-amelia@example.com",
  "journi-public-marco@example.com",
  "journi-public-sophie@example.com",
];

const fallbackTripSelect =
  "id, title, destination, description, status, starts_at, ends_at, cover_image_url, created_at, owner_id";

type PublicTripRow = {
  id: string;
  title: string;
  destination: string | null;
  description: string | null;
  status: string;
  visibility: "public" | "private" | null;
  starts_at: string | null;
  ends_at: string | null;
  cover_image_url: string | null;
  created_at: string | null;
  owner_id: string | null;
};

async function getFallbackPublicSeedOwnerIds() {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data.users
    .filter((seedUser) =>
      fallbackPublicSeedOwnerEmails.includes((seedUser.email || "").toLowerCase()),
    )
    .map((seedUser) => seedUser.id);
}

function getBearerToken(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
}

export async function GET(request: NextRequest) {
  if (missingSupabaseServerVariables.length > 0) {
    return NextResponse.json(
      { error: databaseSetupError(missingSupabaseServerVariables) },
      { status: 503 },
    );
  }

  const token = getBearerToken(request);

  if (!token) {
    return NextResponse.json({ error: "Missing user session." }, { status: 401 });
  }

  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(token);

  if (userError || !user) {
    return NextResponse.json({ error: "Invalid user session." }, { status: 401 });
  }

  const { data, error } = (await supabaseAdmin
    .from("trips")
    .select(publicTripSelect)
    .eq("status", "active")
    .eq("visibility", "public")
    .neq("owner_id", user.id)
    .order("created_at", { ascending: false })) as {
    data: PublicTripRow[] | null;
    error: { message: string } | null;
  };

  if (error) {
    if (isDatabaseSchemaError(error.message)) {
      const fallbackOwnerIds = (await getFallbackPublicSeedOwnerIds()).filter(
        (ownerId) => ownerId !== user.id,
      );

      if (fallbackOwnerIds.length === 0) {
        return NextResponse.json({ trips: [] });
      }

      const { data: fallbackTrips, error: fallbackError } = (await supabaseAdmin
        .from("trips")
        .select(fallbackTripSelect)
        .eq("status", "active")
        .in("owner_id", fallbackOwnerIds)
        .order("created_at", { ascending: false })) as {
        data: Array<Omit<PublicTripRow, "visibility">> | null;
        error: { message: string } | null;
      };

      if (fallbackError) {
        return NextResponse.json(
          { error: friendlyDatabaseError(fallbackError.message, "load public trips") },
          { status: 400 },
        );
      }

      return NextResponse.json({
        trips: (fallbackTrips ?? []).map((trip) => ({
          ...trip,
          visibility: "public",
        })),
      });
    }

    return NextResponse.json(
      { error: friendlyDatabaseError(error.message, "load public trips") },
      { status: 400 },
    );
  }

  return NextResponse.json({ trips: data ?? [] });
}
