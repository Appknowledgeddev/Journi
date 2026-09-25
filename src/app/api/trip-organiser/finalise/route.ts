import { NextRequest, NextResponse } from "next/server";
import {
  databaseSetupError,
  friendlyDatabaseError,
  isDatabaseSchemaError,
} from "@/lib/api/errors";
import {
  missingSupabaseServerVariables,
  supabaseAdmin,
  supabaseServerPublic,
} from "@/lib/supabase/server";

type TripOrganiserFinalisePayload = {
  draft?: {
    tripForm?: {
      title?: string;
      destination?: string;
      description?: string;
      status?: string;
      visibility?: string;
      tripType?: string;
      audience?: string;
      dateMode?: string;
      startsAt?: string;
      endsAt?: string;
      votingDeadline?: string;
      groupSize?: string;
      budgetMode?: string;
      budgetBand?: string;
      totalBudget?: string;
      budgetPerPersonMin?: number | null;
      budgetPerPersonMax?: number | null;
      aiDescriptionGenerated?: boolean;
      coverImageUrl?: string;
    };
    hotels?: Array<{
      name?: string;
      location?: string;
      bookingUrl?: string;
      notes?: string;
      rateLabel?: string;
      priceLevel?: string;
      pricePerNight?: number | null;
      currency?: string | null;
      rateSource?: string;
      amadeusHotelId?: string;
      duffelAccommodationId?: string;
      duffelSearchResultId?: string;
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

function getImageExtension(contentType: string | null, sourceUrl: string) {
  if (contentType?.includes("png")) {
    return "png";
  }

  if (contentType?.includes("webp")) {
    return "webp";
  }

  const pathExtension = sourceUrl.split("?")[0].split(".").pop()?.toLowerCase();

  if (pathExtension && ["jpg", "jpeg", "png", "webp"].includes(pathExtension)) {
    return pathExtension === "jpeg" ? "jpg" : pathExtension;
  }

  return "jpg";
}

function isAlreadyJourniStoredImage(url: string) {
  return url.includes("/storage/v1/object/public/trip-images/");
}

async function cacheRemoteImageForTrip({
  sourceUrl,
  tripId,
  userId,
  entityType,
  entityId = null,
  altText,
}: {
  sourceUrl?: string | null;
  tripId: string;
  userId: string;
  entityType: string;
  entityId?: string | null;
  altText?: string | null;
}) {
  const cleanUrl = sourceUrl?.trim();

  if (!cleanUrl || !cleanUrl.startsWith("http") || isAlreadyJourniStoredImage(cleanUrl)) {
    return cleanUrl || null;
  }

  try {
    const response = await fetch(cleanUrl, { cache: "no-store" });

    if (!response.ok) {
      return cleanUrl;
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";

    if (!contentType.startsWith("image/")) {
      return cleanUrl;
    }

    const extension = getImageExtension(contentType, cleanUrl);
    const storagePath = `trips/${tripId}/${entityType}/${crypto.randomUUID()}.${extension}`;
    const bytes = new Uint8Array(await response.arrayBuffer());
    const { error: uploadError } = await supabaseAdmin.storage
      .from("trip-images")
      .upload(storagePath, bytes, {
        cacheControl: "31536000",
        contentType,
        upsert: false,
      });

    if (uploadError) {
      console.warn("[Journi] Unable to cache trip image", uploadError.message);
      return cleanUrl;
    }

    const { data } = supabaseAdmin.storage.from("trip-images").getPublicUrl(storagePath);
    const publicUrl = data.publicUrl || cleanUrl;
    const { error: imageRecordError } = await supabaseAdmin.from("images").insert({
      trip_id: tripId,
      uploaded_by: userId,
      entity_type: entityType,
      entity_id: entityId,
      storage_path: storagePath,
      public_url: publicUrl,
      alt_text: altText || null,
    });

    if (imageRecordError && !isDatabaseSchemaError(imageRecordError.message)) {
      console.warn("[Journi] Unable to record cached trip image", imageRecordError.message);
    }

    return publicUrl;
  } catch (error) {
    console.warn(
      "[Journi] Unable to cache remote trip image",
      error instanceof Error ? error.message : "Unknown image cache error",
    );
    return cleanUrl;
  }
}

export async function POST(request: NextRequest) {
  if (missingSupabaseServerVariables.length > 0) {
    return NextResponse.json(
      {
        error: databaseSetupError(missingSupabaseServerVariables),
        missingVariables: missingSupabaseServerVariables,
      },
      { status: 503 },
    );
  }

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
  if (!draft || !tripForm) {
    return NextResponse.json(
      { error: "The trip draft could not be found. Head back to the organiser first." },
      { status: 400 },
    );
  }

  if (!tripForm.title?.trim()) {
    return NextResponse.json({ error: "Trip name is required." }, { status: 400 });
  }

  const parsedBudgetTotal =
    typeof tripForm.totalBudget === "string" && tripForm.totalBudget.trim()
      ? Number(tripForm.totalBudget)
      : null;

  const baseTripInsert = {
    owner_id: user.id,
    title: tripForm.title.trim(),
    destination: tripForm.destination?.trim() || null,
    description: tripForm.description?.trim() || null,
    status: tripForm.status || "draft",
    starts_at: tripForm.startsAt || null,
    ends_at: tripForm.endsAt || null,
    cover_image_url: tripForm.coverImageUrl?.trim() || null,
  };

  const tripInsertWithMetadata = {
    ...baseTripInsert,
    visibility: tripForm.visibility === "public" ? "public" : "private",
    trip_type_label: tripForm.tripType?.trim() || null,
    audience_filter: tripForm.audience?.trim() || null,
    date_mode: tripForm.dateMode?.trim() || "set_dates",
    voting_deadline: tripForm.votingDeadline || null,
    group_size_band: tripForm.groupSize?.trim() || null,
    group_size_min:
      tripForm.groupSize === "10+" ? 10 : tripForm.groupSize === "6-10" ? 6 : tripForm.groupSize === "4-6" ? 4 : null,
    budget_mode: tripForm.budgetMode?.trim() || "per_person",
    budget_band: tripForm.budgetBand?.trim() || null,
    budget_total: parsedBudgetTotal !== null && Number.isFinite(parsedBudgetTotal) ? parsedBudgetTotal : null,
    budget_per_person_min:
      typeof tripForm.budgetPerPersonMin === "number" ? tripForm.budgetPerPersonMin : null,
    budget_per_person_max:
      typeof tripForm.budgetPerPersonMax === "number" ? tripForm.budgetPerPersonMax : null,
    ai_description_generated: tripForm.aiDescriptionGenerated === true,
  };

  let { data: tripData, error: tripError } = await supabaseAdmin
    .from("trips")
    .insert(tripInsertWithMetadata)
    .select("id")
    .single();

  if (tripError && isDatabaseSchemaError(tripError.message)) {
    const fallbackResult = await supabaseAdmin
      .from("trips")
      .insert(baseTripInsert)
      .select("id")
      .single();

    tripData = fallbackResult.data;
    tripError = fallbackResult.error;
  }

  if (tripError || !tripData?.id) {
    return NextResponse.json(
      { error: friendlyDatabaseError(tripError?.message || "Unable to create trip.", "save this trip") },
      { status: 400 },
    );
  }

  const tripId = tripData.id as string;

  const cachedCoverImageUrl = await cacheRemoteImageForTrip({
    sourceUrl: tripForm.coverImageUrl,
    tripId,
    userId: user.id,
    entityType: "trip_cover",
    entityId: tripId,
    altText: tripForm.title?.trim() || tripForm.destination?.trim() || "Trip cover image",
  });

  if (cachedCoverImageUrl && cachedCoverImageUrl !== baseTripInsert.cover_image_url) {
    await supabaseAdmin.from("trips").update({ cover_image_url: cachedCoverImageUrl }).eq("id", tripId);
  }

  const hotelRows = await Promise.all((draft.hotels ?? []).filter(hasHotelValue).map(async (hotel) => ({
    trip_id: tripId,
    name: hotel.name?.trim() || "",
    location: hotel.location?.trim() || null,
    booking_url: hotel.bookingUrl?.trim() || null,
    price_per_night:
      typeof hotel.pricePerNight === "number" && Number.isFinite(hotel.pricePerNight)
        ? hotel.pricePerNight
        : null,
    currency: hotel.currency?.trim() || null,
    notes:
      [
        hotel.notes?.trim(),
        hotel.rateLabel ? `Rate guide: ${hotel.rateLabel}` : "",
        hotel.rateSource ? `Rate source: ${hotel.rateSource}` : "",
        hotel.amadeusHotelId ? `Amadeus hotel ID: ${hotel.amadeusHotelId}` : "",
        hotel.duffelAccommodationId ? `Duffel accommodation ID: ${hotel.duffelAccommodationId}` : "",
        hotel.duffelSearchResultId ? `Duffel search result ID: ${hotel.duffelSearchResultId}` : "",
      ]
        .filter(Boolean)
        .join("\n") || null,
    google_place_id: hotel.googlePlaceId || null,
    source_photo_url: await cacheRemoteImageForTrip({
      sourceUrl: hotel.sourcePhotoUrl,
      tripId,
      userId: user.id,
      entityType: "hotel",
      altText: hotel.name?.trim() || "Hotel image",
    }),
    source_photo_attribution: hotel.sourcePhotoAttribution || null,
    latitude: hotel.latitude ?? null,
    longitude: hotel.longitude ?? null,
  })));

  if (hotelRows.length > 0) {
    const { error } = await supabaseAdmin.from("hotels").insert(hotelRows);

    if (error) {
      return NextResponse.json(
        { error: friendlyDatabaseError(error.message, "save the selected hotels") },
        { status: 400 },
      );
    }
  }

  const activityRows = await Promise.all((draft.activities ?? []).filter(hasActivityValue).map(async (activity) => ({
    trip_id: tripId,
    title: activity.title?.trim() || "",
    location: activity.location?.trim() || null,
    booking_url: activity.bookingUrl?.trim() || null,
    notes: activity.notes?.trim() || null,
    google_place_id: activity.googlePlaceId || null,
    source_photo_url: await cacheRemoteImageForTrip({
      sourceUrl: activity.sourcePhotoUrl,
      tripId,
      userId: user.id,
      entityType: "activity",
      altText: activity.title?.trim() || "Activity image",
    }),
    source_photo_attribution: activity.sourcePhotoAttribution || null,
    latitude: activity.latitude ?? null,
    longitude: activity.longitude ?? null,
  })));

  if (activityRows.length > 0) {
    const { error } = await supabaseAdmin.from("activities").insert(activityRows);

    if (error) {
      return NextResponse.json(
        { error: friendlyDatabaseError(error.message, "save the selected activities") },
        { status: 400 },
      );
    }
  }

  const transportRows = await Promise.all((draft.transport ?? []).filter(hasTransportValue).map(async (option) => ({
    trip_id: tripId,
    mode: option.mode?.trim() || "",
    provider: option.provider?.trim() || null,
    departure_location: option.departureLocation?.trim() || null,
    arrival_location: option.arrivalLocation?.trim() || null,
    notes: option.notes?.trim() || null,
    google_place_id: option.googlePlaceId || null,
    source_photo_url: await cacheRemoteImageForTrip({
      sourceUrl: option.sourcePhotoUrl,
      tripId,
      userId: user.id,
      entityType: "transport",
      altText: option.provider?.trim() || option.mode?.trim() || "Transport image",
    }),
    source_photo_attribution: option.sourcePhotoAttribution || null,
    latitude: option.latitude ?? null,
    longitude: option.longitude ?? null,
  })));

  if (transportRows.length > 0) {
    const { error } = await supabaseAdmin.from("transport").insert(transportRows);

    if (error) {
      return NextResponse.json(
        { error: friendlyDatabaseError(error.message, "save the selected transport") },
        { status: 400 },
      );
    }
  }

  const diningRows = await Promise.all((draft.dining ?? []).filter(hasDiningValue).map(async (option) => ({
    trip_id: tripId,
    name: option.name?.trim() || "",
    location: option.location?.trim() || null,
    cuisine: option.cuisine?.trim() || null,
    reservation_url: option.reservationUrl?.trim() || null,
    notes: option.notes?.trim() || null,
    google_place_id: option.googlePlaceId || null,
    source_photo_url: await cacheRemoteImageForTrip({
      sourceUrl: option.sourcePhotoUrl,
      tripId,
      userId: user.id,
      entityType: "dining",
      altText: option.name?.trim() || "Dining image",
    }),
    source_photo_attribution: option.sourcePhotoAttribution || null,
    latitude: option.latitude ?? null,
    longitude: option.longitude ?? null,
  })));

  if (diningRows.length > 0) {
    const { error } = await supabaseAdmin.from("dining").insert(diningRows);

    if (error) {
      return NextResponse.json(
        { error: friendlyDatabaseError(error.message, "save the selected dining") },
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
      status: "pending",
      membership_status: "invited",
      attendance_status: null,
    }))
    .filter((invite) => Boolean(invite.email));

  if (participantRows.length > 0) {
    let { error } = await supabaseAdmin.from("trip_participants").insert(participantRows);

    if (error && isDatabaseSchemaError(error.message)) {
      const fallbackRows = participantRows.map((row) => ({
        trip_id: row.trip_id,
        inviter_id: row.inviter_id,
        email: row.email,
        full_name: row.full_name,
        role: row.role,
        status: row.status,
      }));
      const fallbackResult = await supabaseAdmin.from("trip_participants").insert(fallbackRows);
      error = fallbackResult.error;
    }

    if (error) {
      return NextResponse.json(
        { error: friendlyDatabaseError(error.message, "save the traveller invites") },
        { status: 400 },
      );
    }
  }

  return NextResponse.json({ success: true, tripId });
}
