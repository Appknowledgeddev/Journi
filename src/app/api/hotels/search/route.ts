import { NextRequest, NextResponse } from "next/server";

type GooglePlace = {
  id?: string;
  displayName?: {
    text?: string;
  };
  formattedAddress?: string;
  rating?: number;
  websiteUri?: string;
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
  nextPageToken?: string;
  error?: {
    message?: string;
  };
};

export async function POST(request: NextRequest) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Hotel API is not configured yet. Add GOOGLE_MAPS_API_KEY to the environment.",
      },
      { status: 500 },
    );
  }

  const body = (await request.json()) as {
    destination?: string;
    pageToken?: string;
  };
  const destination = typeof body.destination === "string" ? body.destination.trim() : "";
  const pageToken = typeof body.pageToken === "string" ? body.pageToken.trim() : "";

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
          "places.id,places.displayName,places.formattedAddress,places.rating,places.websiteUri,places.location,places.primaryType,places.photos,nextPageToken",
      },
      body: JSON.stringify({
        textQuery: `hotels in ${destination}`,
        pageSize: 12,
        pageToken: pageToken || undefined,
      }),
      cache: "no-store",
    });

    const data = (await response.json()) as GooglePlacesResponse;

    if (!response.ok) {
      return NextResponse.json(
        {
          error: data.error?.message || "Unable to load hotels from Google Places.",
        },
        { status: 502 },
      );
    }

    const hotels = (data.places ?? [])
      .filter((place) => place.primaryType === "hotel" || place.displayName?.text)
      .map((place) => ({
        id: place.id ?? place.displayName?.text ?? crypto.randomUUID(),
        name: place.displayName?.text ?? "Unnamed hotel",
        location: place.formattedAddress ?? destination,
        bookingUrl: place.websiteUri ?? "",
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
      hotels,
      nextPageToken: data.nextPageToken ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to search hotels.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
