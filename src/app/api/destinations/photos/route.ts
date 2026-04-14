import { NextRequest, NextResponse } from "next/server";

type GooglePlacePhotoResponse = {
  places?: Array<{
    displayName?: {
      text?: string;
    };
    formattedAddress?: string;
    photos?: Array<{
      name?: string;
      authorAttributions?: Array<{
        displayName?: string;
      }>;
    }>;
  }>;
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
          "Destination photo API is not configured yet. Add GOOGLE_MAPS_API_KEY to the environment.",
      },
      { status: 500 },
    );
  }

  const body = (await request.json()) as {
    destination?: string;
  };
  const destination = typeof body.destination === "string" ? body.destination.trim() : "";

  if (!destination) {
    return NextResponse.json({ photos: [] });
  }

  try {
    const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "places.displayName,places.formattedAddress,places.photos",
      },
      body: JSON.stringify({
        textQuery: destination,
        pageSize: 1,
      }),
      cache: "no-store",
    });

    const data = (await response.json()) as GooglePlacePhotoResponse;

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error?.message || "Unable to load destination photos." },
        { status: 502 },
      );
    }

    const place = data.places?.[0];
    const photos = (place?.photos ?? []).map((photo, index) => ({
      id: `${destination}-${index}`,
      url: photo.name
        ? `https://places.googleapis.com/v1/${photo.name}/media?maxHeightPx=960&key=${apiKey}`
        : "",
      attribution: photo.authorAttributions?.[0]?.displayName ?? "",
      placeName: place?.displayName?.text ?? destination,
      subtitle: place?.formattedAddress ?? destination,
    }));

    return NextResponse.json({ photos: photos.filter((photo) => photo.url) });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load destination photos.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
