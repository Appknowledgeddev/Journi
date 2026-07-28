import { NextRequest, NextResponse } from "next/server";

type GooglePlaceDetailsResponse = {
  id?: string;
  displayName?: {
    text?: string;
  };
  formattedAddress?: string;
  location?: {
    latitude?: number;
    longitude?: number;
  };
  websiteUri?: string;
  googleMapsUri?: string;
  rating?: number;
  priceLevel?: string;
  priceRange?: {
    startPrice?: GoogleMoney;
    endPrice?: GoogleMoney;
  };
  userRatingCount?: number;
  internationalPhoneNumber?: string;
  regularOpeningHours?: {
    weekdayDescriptions?: string[];
  };
  editorialSummary?: {
    text?: string;
  };
  photos?: Array<{
    name?: string;
    authorAttributions?: Array<{
      displayName?: string;
      uri?: string;
    }>;
  }>;
  reviews?: Array<{
    rating?: number;
    relativePublishTimeDescription?: string;
    text?: {
      text?: string;
    };
    authorAttribution?: {
      displayName?: string;
      uri?: string;
      photoUri?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

type GoogleMoney = {
  currencyCode?: string;
  units?: string;
  nanos?: number;
};

function moneyToNumber(money?: GoogleMoney) {
  if (!money?.units && typeof money?.nanos !== "number") {
    return null;
  }

  const units = money.units ? Number(money.units) : 0;
  const nanos = typeof money.nanos === "number" ? money.nanos / 1_000_000_000 : 0;
  const value = units + nanos;

  return Number.isFinite(value) ? value : null;
}

function formatMoney(money?: GoogleMoney) {
  const value = moneyToNumber(money);
  const currencyCode = money?.currencyCode || "GBP";

  if (value === null) {
    return "";
  }

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}

function formatPriceLevel(priceLevel?: string) {
  switch (priceLevel) {
    case "PRICE_LEVEL_FREE":
      return "Free";
    case "PRICE_LEVEL_INEXPENSIVE":
      return "Budget";
    case "PRICE_LEVEL_MODERATE":
      return "Mid-range";
    case "PRICE_LEVEL_EXPENSIVE":
      return "Premium";
    case "PRICE_LEVEL_VERY_EXPENSIVE":
      return "Luxury";
    default:
      return "";
  }
}

function formatRateLabel(place: GooglePlaceDetailsResponse) {
  const startLabel = formatMoney(place.priceRange?.startPrice);
  const endLabel = formatMoney(place.priceRange?.endPrice);

  if (startLabel && endLabel) {
    return `${startLabel}-${endLabel}`;
  }

  if (startLabel) {
    return `From ${startLabel}`;
  }

  return formatPriceLevel(place.priceLevel);
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "Hotel API is not configured yet. Add GOOGLE_MAPS_API_KEY to the environment." },
      { status: 500 },
    );
  }

  const body = (await request.json()) as {
    placeId?: string;
  };
  const placeId = typeof body.placeId === "string" ? body.placeId.trim() : "";

  if (!placeId) {
    return NextResponse.json({ error: "Place ID is required." }, { status: 400 });
  }

  try {
    const response = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "id,displayName,formattedAddress,location,websiteUri,googleMapsUri,rating,priceLevel,priceRange,userRatingCount,internationalPhoneNumber,regularOpeningHours,editorialSummary,photos,reviews",
      },
      cache: "no-store",
    });

    const data = (await response.json()) as GooglePlaceDetailsResponse;

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error?.message || "Unable to load hotel details from Google Places." },
        { status: 502 },
      );
    }

    return NextResponse.json({
      id: data.id ?? placeId,
      name: data.displayName?.text ?? "Hotel details",
      address: data.formattedAddress ?? "",
      latitude: data.location?.latitude ?? null,
      longitude: data.location?.longitude ?? null,
      websiteUri: data.websiteUri ?? "",
      googleMapsUri: data.googleMapsUri ?? "",
      rating: data.rating ?? null,
      rateLabel: formatRateLabel(data),
      priceLevel: data.priceLevel ?? "",
      pricePerNight: moneyToNumber(data.priceRange?.startPrice),
      currency: data.priceRange?.startPrice?.currencyCode || data.priceRange?.endPrice?.currencyCode || "GBP",
      userRatingCount: data.userRatingCount ?? null,
      phone: data.internationalPhoneNumber ?? "",
      openingHours: data.regularOpeningHours?.weekdayDescriptions ?? [],
      summary: data.editorialSummary?.text ?? "",
      photos: (data.photos ?? []).map((photo) => ({
        url: photo.name
          ? `https://places.googleapis.com/v1/${photo.name}/media?maxHeightPx=720&key=${apiKey}`
          : "",
        attribution: photo.authorAttributions?.[0]?.displayName ?? "",
      })),
      reviews: (data.reviews ?? []).slice(0, 5).map((review) => ({
        author: review.authorAttribution?.displayName ?? "Google reviewer",
        authorUrl: review.authorAttribution?.uri ?? "",
        authorPhotoUrl: review.authorAttribution?.photoUri ?? "",
        rating: review.rating ?? null,
        text: review.text?.text ?? "",
        published: review.relativePublishTimeDescription ?? "",
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load hotel details.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
