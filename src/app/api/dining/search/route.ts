import { NextRequest, NextResponse } from "next/server";

type GooglePlace = {
  id?: string;
  displayName?: {
    text?: string;
  };
  formattedAddress?: string;
  rating?: number;
  websiteUri?: string;
  googleMapsUri?: string;
  location?: {
    latitude?: number;
    longitude?: number;
  };
  primaryType?: string;
  photos?: Array<{
    name?: string;
    authorAttributions?: Array<{
      displayName?: string;
    }>;
  }>;
};

type GooglePlacesResponse = {
  places?: GooglePlace[];
  error?: {
    message?: string;
  };
};

const diningTypes = new Set([
  "restaurant",
  "cafe",
  "bar",
  "meal_takeaway",
  "bakery",
]);

export async function POST(request: NextRequest) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        error: "Dining API is not configured yet. Add GOOGLE_MAPS_API_KEY to the environment.",
      },
      { status: 500 },
    );
  }

  const body = (await request.json()) as {
    destination?: string;
  };
  const destination = typeof body.destination === "string" ? body.destination.trim() : "";

  if (!destination) {
    return NextResponse.json({ error: "Destination is required." }, { status: 400 });
  }

  try {
    const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.rating,places.websiteUri,places.googleMapsUri,places.location,places.primaryType,places.photos",
      },
      body: JSON.stringify({
        textQuery: `best restaurants and dining in ${destination}`,
        pageSize: 16,
      }),
      cache: "no-store",
    });

    const data = (await response.json()) as GooglePlacesResponse;

    if (!response.ok) {
      return NextResponse.json(
        {
          error: data.error?.message || "Unable to load dining options from Google Places.",
        },
        { status: 502 },
      );
    }

    const dining = (data.places ?? [])
      .filter((place) => diningTypes.has(place.primaryType ?? "") || place.displayName?.text)
      .map((place) => ({
        id: place.id ?? place.displayName?.text ?? crypto.randomUUID(),
        name: place.displayName?.text ?? "Dining option",
        location: place.formattedAddress ?? destination,
        cuisine: place.primaryType?.replaceAll("_", " ") || "Dining",
        reservationUrl: place.websiteUri ?? place.googleMapsUri ?? "",
        notes:
          typeof place.rating === "number"
            ? `Google rating ${place.rating.toFixed(1)}`
            : "Loaded from Google Places",
        latitude: place.location?.latitude ?? null,
        longitude: place.location?.longitude ?? null,
        photoUrl: place.photos?.[0]?.name
          ? `https://places.googleapis.com/v1/${place.photos[0].name}/media?maxHeightPx=420&key=${apiKey}`
          : "",
        photoAttribution: place.photos?.[0]?.authorAttributions?.[0]?.displayName ?? "",
      }));

    return NextResponse.json({
      cityName: destination,
      dining,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to search dining.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
