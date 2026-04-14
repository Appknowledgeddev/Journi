import { NextRequest, NextResponse } from "next/server";

type GooglePlacePrediction = {
  text?: {
    text?: string;
  };
  placeId?: string;
};

type GoogleAutocompleteResponse = {
  suggestions?: Array<{
    placePrediction?: GooglePlacePrediction;
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
          "Destination API is not configured yet. Add GOOGLE_MAPS_API_KEY to the environment.",
      },
      { status: 500 },
    );
  }

  const body = (await request.json()) as {
    query?: string;
  };
  const query = typeof body.query === "string" ? body.query.trim() : "";

  if (!query) {
    return NextResponse.json({ destinations: [] });
  }

  try {
    const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "suggestions.placePrediction.text,suggestions.placePrediction.placeId",
      },
      body: JSON.stringify({
        input: query,
        includedPrimaryTypes: ["locality", "administrative_area_level_1", "country"],
      }),
      cache: "no-store",
    });

    const data = (await response.json()) as GoogleAutocompleteResponse;

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error?.message || "Unable to load destination suggestions." },
        { status: 502 },
      );
    }

    const destinations = (data.suggestions ?? [])
      .map((suggestion) => ({
        id: suggestion.placePrediction?.placeId ?? "",
        label: suggestion.placePrediction?.text?.text ?? "",
      }))
      .filter((destination) => destination.label);

    return NextResponse.json({ destinations });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to search destinations.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
