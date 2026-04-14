import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

function schemaError(message: string) {
  if (message.toLowerCase().includes("column") || message.toLowerCase().includes("schema")) {
    return `${message}. The live Supabase schema may be out of date for trips or trip_participants.`;
  }

  return message;
}

type GooglePlaceDetailsResponse = {
  photos?: Array<{
    name?: string;
    authorAttributions?: Array<{
      displayName?: string;
    }>;
  }>;
};

async function enrichRowsWithPhotos<
  T extends { source_photo_url?: string | null; google_place_id?: string | null },
>(rows: T[]) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return rows;
  }

  const enrichedRows = await Promise.all(
    rows.map(async (row) => {
      if (row.source_photo_url || !row.google_place_id) {
        return row;
      }

      try {
        const response = await fetch(`https://places.googleapis.com/v1/places/${row.google_place_id}`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": "photos",
          },
          cache: "no-store",
        });

        const data = (await response.json()) as GooglePlaceDetailsResponse;
        const photoName = data.photos?.[0]?.name;

        if (!response.ok || !photoName) {
          return row;
        }

        return {
          ...row,
          source_photo_url: `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=720&key=${apiKey}`,
        };
      } catch {
        return row;
      }
    }),
  );

  return enrichedRows;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";

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

  const { id: tripId } = await params;
  const userEmail = (user.email ?? "").toLowerCase();

  const { data: trip, error: tripError } = await supabaseAdmin
    .from("trips")
    .select("id, title, destination, description, status, starts_at, ends_at, cover_image_url, created_at, owner_id")
    .eq("id", tripId)
    .single();

  if (tripError || !trip) {
    return NextResponse.json({ error: schemaError(tripError?.message || "Trip not found.") }, { status: 404 });
  }

  let accessRole: "organiser" | "participant" | null = null;

  if (trip.owner_id === user.id) {
    accessRole = "organiser";
  } else {
    const { data: participantLink, error: participantError } = await supabaseAdmin
      .from("trip_participants")
      .select("id")
      .eq("trip_id", tripId)
      .eq("status", "accepted")
      .or(`user_id.eq.${user.id},email.eq.${userEmail}`)
      .maybeSingle();

    if (participantError) {
      return NextResponse.json({ error: schemaError(participantError.message) }, { status: 400 });
    }

    if (participantLink) {
      accessRole = "participant";
    }
  }

  if (!accessRole) {
    return NextResponse.json({ error: "You do not have access to this trip." }, { status: 403 });
  }

  const { data: participantRows, error: participantsError } = await supabaseAdmin
    .from("trip_participants")
    .select("id, email, full_name, role, status")
    .eq("trip_id", tripId)
    .order("created_at", { ascending: true });

  if (participantsError) {
    return NextResponse.json({ error: schemaError(participantsError.message) }, { status: 400 });
  }

  const [
    { data: hotelRows, error: hotelsError },
    { data: activityRows, error: activitiesError },
    { data: transportRows, error: transportError },
    { data: diningRows, error: diningError },
  ] = await Promise.all([
    supabaseAdmin
      .from("hotels")
      .select("id, name, location, notes, source_photo_url, google_place_id")
      .eq("trip_id", tripId),
    supabaseAdmin
      .from("activities")
      .select("id, title, location, notes, source_photo_url, google_place_id")
      .eq("trip_id", tripId),
    supabaseAdmin
      .from("transport")
      .select("id, mode, departure_location, arrival_location, notes, source_photo_url, google_place_id")
      .eq("trip_id", tripId),
    supabaseAdmin
      .from("dining")
      .select("id, name, location, notes, source_photo_url, google_place_id")
      .eq("trip_id", tripId),
  ]);

  const planningError = hotelsError || activitiesError || transportError || diningError;

  if (planningError) {
    return NextResponse.json({ error: schemaError(planningError.message) }, { status: 400 });
  }

  const [enrichedHotels, enrichedActivities, enrichedTransport, enrichedDining] = await Promise.all([
    enrichRowsWithPhotos((hotelRows ?? []) as Array<Record<string, unknown>>),
    enrichRowsWithPhotos((activityRows ?? []) as Array<Record<string, unknown>>),
    enrichRowsWithPhotos((transportRows ?? []) as Array<Record<string, unknown>>),
    enrichRowsWithPhotos((diningRows ?? []) as Array<Record<string, unknown>>),
  ]);

  return NextResponse.json({
    trip,
    participants: participantRows ?? [],
    hotels: enrichedHotels,
    activities: enrichedActivities,
    transport: enrichedTransport,
    dining: enrichedDining,
    accessRole,
  });
}
