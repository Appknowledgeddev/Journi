import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseServerPublic } from "@/lib/supabase/server";

type TripOrganiserFinalisePayload = {
  draft?: {
    tripForm?: {
      title?: string;
      destination?: string;
      description?: string;
      status?: string;
      startsAt?: string;
      endsAt?: string;
      coverImageUrl?: string;
    };
    hotels?: Array<{
      name?: string;
      location?: string;
      bookingUrl?: string;
      notes?: string;
      googlePlaceId?: string;
      sourcePhotoUrl?: string;
      sourcePhotoAttribution?: string;
      latitude?: number | null;
      longitude?: number | null;
    }>;
    activities?: Array<{
      title?: string;
      location?: string;
      bookingUrl?: string;
      notes?: string;
      googlePlaceId?: string;
      sourcePhotoUrl?: string;
      sourcePhotoAttribution?: string;
      latitude?: number | null;
      longitude?: number | null;
    }>;
    transport?: Array<{
      mode?: string;
      provider?: string;
      departureLocation?: string;
      arrivalLocation?: string;
      notes?: string;
      googlePlaceId?: string;
      sourcePhotoUrl?: string;
      sourcePhotoAttribution?: string;
      latitude?: number | null;
      longitude?: number | null;
    }>;
    dining?: Array<{
      name?: string;
      location?: string;
      cuisine?: string;
      reservationUrl?: string;
      notes?: string;
      googlePlaceId?: string;
      sourcePhotoUrl?: string;
      sourcePhotoAttribution?: string;
      latitude?: number | null;
      longitude?: number | null;
    }>;
    invites?: Array<{
      fullName?: string;
      email?: string;
    }>;
  };
  origin?: string;
};

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length).trim();
}

function hasHotelValue(option: { name?: string }) {
  return Boolean(option.name?.trim());
}

function hasActivityValue(option: { title?: string }) {
  return Boolean(option.title?.trim());
}

function hasTransportValue(option: { mode?: string }) {
  return Boolean(option.mode?.trim());
}

function hasDiningValue(option: { name?: string }) {
  return Boolean(option.name?.trim());
}

export async function POST(request: NextRequest) {
  const token = getBearerToken(request);

  if (!token) {
    return NextResponse.json({ error: "Missing auth token." }, { status: 401 });
  }

  const {
    data: { user },
    error: userError,
  } = await supabaseServerPublic.auth.getUser(token);

  if (userError || !user) {
    return NextResponse.json({ error: "You need to be signed in." }, { status: 401 });
  }

  const body = (await request.json()) as TripOrganiserFinalisePayload;
  const draft = body.draft;
  const tripForm = draft?.tripForm;
  const origin = typeof body.origin === "string" && body.origin ? body.origin : request.nextUrl.origin;

  if (!draft || !tripForm) {
    return NextResponse.json(
      { error: "The trip draft could not be found. Head back to the organiser first." },
      { status: 400 },
    );
  }

  if (!tripForm.title?.trim()) {
    return NextResponse.json({ error: "Trip name is required." }, { status: 400 });
  }

  const { data: tripData, error: tripError } = await supabaseAdmin
    .from("trips")
    .insert({
      owner_id: user.id,
      title: tripForm.title.trim(),
      destination: tripForm.destination?.trim() || null,
      description: tripForm.description?.trim() || null,
      status: tripForm.status || "draft",
      starts_at: tripForm.startsAt || null,
      ends_at: tripForm.endsAt || null,
      cover_image_url: tripForm.coverImageUrl?.trim() || null,
    })
    .select("id")
    .single();

  if (tripError || !tripData?.id) {
    return NextResponse.json({ error: tripError?.message || "Unable to create trip." }, { status: 400 });
  }

  const tripId = tripData.id as string;

  const hotelRows = (draft.hotels ?? []).filter(hasHotelValue).map((hotel) => ({
    trip_id: tripId,
    name: hotel.name?.trim() || "",
    location: hotel.location?.trim() || null,
    booking_url: hotel.bookingUrl?.trim() || null,
    notes: hotel.notes?.trim() || null,
    google_place_id: hotel.googlePlaceId || null,
    source_photo_url: hotel.sourcePhotoUrl || null,
    source_photo_attribution: hotel.sourcePhotoAttribution || null,
    latitude: hotel.latitude ?? null,
    longitude: hotel.longitude ?? null,
  }));

  if (hotelRows.length > 0) {
    const { error } = await supabaseAdmin.from("hotels").insert(hotelRows);

    if (error) {
      return NextResponse.json(
        { error: `Trip created, but hotels could not be saved: ${error.message}` },
        { status: 400 },
      );
    }
  }

  const activityRows = (draft.activities ?? []).filter(hasActivityValue).map((activity) => ({
    trip_id: tripId,
    title: activity.title?.trim() || "",
    location: activity.location?.trim() || null,
    booking_url: activity.bookingUrl?.trim() || null,
    notes: activity.notes?.trim() || null,
    google_place_id: activity.googlePlaceId || null,
    source_photo_url: activity.sourcePhotoUrl || null,
    source_photo_attribution: activity.sourcePhotoAttribution || null,
    latitude: activity.latitude ?? null,
    longitude: activity.longitude ?? null,
  }));

  if (activityRows.length > 0) {
    const { error } = await supabaseAdmin.from("activities").insert(activityRows);

    if (error) {
      return NextResponse.json(
        { error: `Trip created, but activities could not be saved: ${error.message}` },
        { status: 400 },
      );
    }
  }

  const transportRows = (draft.transport ?? []).filter(hasTransportValue).map((option) => ({
    trip_id: tripId,
    mode: option.mode?.trim() || "",
    provider: option.provider?.trim() || null,
    departure_location: option.departureLocation?.trim() || null,
    arrival_location: option.arrivalLocation?.trim() || null,
    notes: option.notes?.trim() || null,
    google_place_id: option.googlePlaceId || null,
    source_photo_url: option.sourcePhotoUrl || null,
    source_photo_attribution: option.sourcePhotoAttribution || null,
    latitude: option.latitude ?? null,
    longitude: option.longitude ?? null,
  }));

  if (transportRows.length > 0) {
    const { error } = await supabaseAdmin.from("transport").insert(transportRows);

    if (error) {
      return NextResponse.json(
        { error: `Trip created, but transport could not be saved: ${error.message}` },
        { status: 400 },
      );
    }
  }

  const diningRows = (draft.dining ?? []).filter(hasDiningValue).map((option) => ({
    trip_id: tripId,
    name: option.name?.trim() || "",
    location: option.location?.trim() || null,
    cuisine: option.cuisine?.trim() || null,
    reservation_url: option.reservationUrl?.trim() || null,
    notes: option.notes?.trim() || null,
    google_place_id: option.googlePlaceId || null,
    source_photo_url: option.sourcePhotoUrl || null,
    source_photo_attribution: option.sourcePhotoAttribution || null,
    latitude: option.latitude ?? null,
    longitude: option.longitude ?? null,
  }));

  if (diningRows.length > 0) {
    const { error } = await supabaseAdmin.from("dining").insert(diningRows);

    if (error) {
      return NextResponse.json(
        { error: `Trip created, but dining could not be saved: ${error.message}` },
        { status: 400 },
      );
    }
  }

  const participantRows = (draft.invites ?? [])
    .map((invite) => ({
      trip_id: tripId,
      inviter_id: user.id,
      email: invite.email?.trim().toLowerCase() || "",
      full_name: invite.fullName?.trim() || null,
      role: "traveller",
      status: "invited",
    }))
    .filter((invite) => Boolean(invite.email));

  if (participantRows.length > 0) {
    const { error } = await supabaseAdmin.from("trip_participants").insert(participantRows);

    if (error) {
      return NextResponse.json(
        { error: `Trip created, but traveller invites could not be saved: ${error.message}` },
        { status: 400 },
      );
    }

    const inviteResults = await Promise.all(
      participantRows.map(async (invite) => {
        const response = await fetch(`${request.nextUrl.origin}/api/travellers/invite`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: invite.email,
            fullName: invite.full_name || "",
            tripTitle: tripForm.title?.trim() || "your trip",
            tripId,
            origin,
          }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;

          return payload?.error || `Invite failed for ${invite.email}`;
        }

        return null;
      }),
    );

    const failedInvite = inviteResults.find(Boolean);

    if (failedInvite) {
      return NextResponse.json({
        success: true,
        tripId,
        warning: `Invite emails could not all be sent yet: ${failedInvite}`,
      });
    }
  }

  return NextResponse.json({ success: true, tripId });
}
