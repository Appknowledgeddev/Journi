import { NextRequest, NextResponse } from "next/server";

type GooglePlace = {
  id?: string;
  displayName?: {
    text?: string;
  };
  formattedAddress?: string;
  rating?: number;
  priceLevel?: string;
  priceRange?: {
    startPrice?: GoogleMoney;
    endPrice?: GoogleMoney;
  };
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

type GoogleMoney = {
  currencyCode?: string;
  units?: string;
  nanos?: number;
};

type GooglePlacesResponse = {
  places?: GooglePlace[];
  nextPageToken?: string;
  error?: {
    message?: string;
  };
};

type HotelSearchHotel = {
  id: string;
  name: string;
  location: string;
  bookingUrl: string;
  notes: string;
  rateLabel: string;
  priceLevel: string;
  pricePerNight: number | null;
  currency: string;
  rateSource?: string;
  amadeusHotelId?: string;
  duffelAccommodationId?: string;
  duffelSearchResultId?: string;
  latitude: number | null;
  longitude: number | null;
  photoUrl: string;
  photoAttribution: string;
};

type AmadeusTokenResponse = {
  access_token?: string;
  error_description?: string;
};

type AmadeusHotelListResponse = {
  data?: Array<{
    hotelId?: string;
    name?: string;
    geoCode?: {
      latitude?: number;
      longitude?: number;
    };
  }>;
  errors?: Array<{ title?: string; detail?: string }>;
};

type AmadeusHotelOffersResponse = {
  data?: Array<{
    hotel?: {
      hotelId?: string;
      name?: string;
    };
    offers?: Array<{
      price?: {
        currency?: string;
        total?: string;
        sellingTotal?: string;
        base?: string;
      };
    }>;
  }>;
  errors?: Array<{ title?: string; detail?: string }>;
};

type DuffelStaysSearchResponse = {
  data?: {
    results?: Array<{
      id?: string;
      cheapest_rate_total_amount?: string | null;
      cheapest_rate_currency?: string | null;
      accommodation?: {
        id?: string;
        name?: string;
        location?: {
          geographic_coordinates?: {
            latitude?: number;
            longitude?: number;
          };
        };
      };
    }>;
  };
  errors?: Array<{ title?: string; detail?: string }>;
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

function formatRateLabel(place: GooglePlace) {
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

function getAmadeusBaseUrl() {
  return process.env.AMADEUS_BASE_URL || "https://test.api.amadeus.com";
}

async function getAmadeusToken() {
  const clientId = process.env.AMADEUS_API_KEY;
  const clientSecret = process.env.AMADEUS_API_SECRET;

  if (!clientId || !clientSecret) {
    return null;
  }

  const response = await fetch(`${getAmadeusBaseUrl()}/v1/security/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
    cache: "no-store",
  });

  const data = (await response.json().catch(() => null)) as AmadeusTokenResponse | null;

  if (!response.ok || !data?.access_token) {
    console.warn("[Journi Hotels] Unable to get Amadeus token", {
      error: data?.error_description,
      status: response.status,
    });
    return null;
  }

  return data.access_token;
}

function normaliseHotelName(name: string) {
  return name
    .toLowerCase()
    .replace(/\b(hotel|hotels|resort|resorts|the|by|collection)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function distanceKm(
  first: { latitude: number; longitude: number },
  second: { latitude: number; longitude: number },
) {
  const earthRadiusKm = 6371;
  const latDelta = ((second.latitude - first.latitude) * Math.PI) / 180;
  const lonDelta = ((second.longitude - first.longitude) * Math.PI) / 180;
  const firstLat = (first.latitude * Math.PI) / 180;
  const secondLat = (second.latitude * Math.PI) / 180;
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(firstLat) * Math.cos(secondLat) * Math.sin(lonDelta / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getStayNights(checkInDate: string, checkOutDate: string) {
  const start = new Date(`${checkInDate}T00:00:00Z`);
  const end = new Date(`${checkOutDate}T00:00:00Z`);
  const nights = Math.round((end.getTime() - start.getTime()) / 86_400_000);

  return nights > 0 ? nights : 1;
}

function hasValidRateDates(checkInDate: string, checkOutDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkInDate) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOutDate)) {
    return false;
  }

  return new Date(checkOutDate).getTime() > new Date(checkInDate).getTime();
}

function formatAmadeusRate(total: number, currency: string, nights: number) {
  const nightly = total / nights;

  return `From ${new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: nightly % 1 === 0 ? 0 : 2,
  }).format(nightly)}/night via Amadeus`;
}

function formatDuffelRate(total: number, currency: string, nights: number) {
  const nightly = total / nights;

  return `From ${new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: nightly % 1 === 0 ? 0 : 2,
  }).format(nightly)}/night via Duffel`;
}

function findMatchingDuffelStay(
  hotel: HotelSearchHotel,
  candidates: NonNullable<NonNullable<DuffelStaysSearchResponse["data"]>["results"]>,
) {
  if (hotel.latitude === null || hotel.longitude === null) {
    return null;
  }

  const hotelName = normaliseHotelName(hotel.name);
  let bestMatch:
    | {
        accommodationId: string;
        searchResultId: string;
        total: number;
        currency: string;
        score: number;
      }
    | null = null;

  for (const candidate of candidates) {
    const candidateLatitude = candidate.accommodation?.location?.geographic_coordinates?.latitude;
    const candidateLongitude = candidate.accommodation?.location?.geographic_coordinates?.longitude;
    const total = Number(candidate.cheapest_rate_total_amount);
    const accommodationId = candidate.accommodation?.id;

    if (
      !candidate.id ||
      !accommodationId ||
      typeof candidateLatitude !== "number" ||
      typeof candidateLongitude !== "number" ||
      !Number.isFinite(total)
    ) {
      continue;
    }

    const candidateName = normaliseHotelName(candidate.accommodation?.name ?? "");
    const nameMatches =
      Boolean(candidateName && hotelName) &&
      (candidateName.includes(hotelName) || hotelName.includes(candidateName));
    const distance = distanceKm(
      { latitude: hotel.latitude, longitude: hotel.longitude },
      { latitude: candidateLatitude, longitude: candidateLongitude },
    );
    const score = distance - (nameMatches ? 0.35 : 0);

    if (distance <= 0.25 || (nameMatches && distance <= 2)) {
      if (!bestMatch || score < bestMatch.score) {
        bestMatch = {
          accommodationId,
          searchResultId: candidate.id,
          total,
          currency: candidate.cheapest_rate_currency || "GBP",
          score,
        };
      }
    }
  }

  return bestMatch;
}

async function enrichHotelsWithDuffelRates(args: {
  hotels: HotelSearchHotel[];
  checkInDate: string;
  checkOutDate: string;
  adults: number;
}): Promise<{ hotels: HotelSearchHotel[]; notice?: string }> {
  const token = process.env.DUFFEL_ACCESS_TOKEN;
  const duffelVersion = process.env.DUFFEL_API_VERSION || "v2";

  if (!token || !hasValidRateDates(args.checkInDate, args.checkOutDate)) {
    return { hotels: args.hotels };
  }

  const hotelsWithCoordinates = args.hotels.filter(
    (hotel) => typeof hotel.latitude === "number" && typeof hotel.longitude === "number",
  );

  if (hotelsWithCoordinates.length === 0) {
    return { hotels: args.hotels };
  }

  const center = hotelsWithCoordinates[0];
  const response = await fetch("https://api.duffel.com/stays/search", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Duffel-Version": duffelVersion,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      data: {
        rooms: 1,
        location: {
          radius: 5,
          geographic_coordinates: {
            latitude: center.latitude,
            longitude: center.longitude,
          },
        },
        check_in_date: args.checkInDate,
        check_out_date: args.checkOutDate,
        guests: Array.from({ length: Math.min(Math.max(args.adults, 1), 9) }, () => ({
          type: "adult",
        })),
      },
    }),
    cache: "no-store",
  });
  const data = (await response.json().catch(() => null)) as DuffelStaysSearchResponse | null;
  const results = data?.data?.results ?? [];

  if (!response.ok || results.length === 0) {
    console.warn("[Journi Hotels] Duffel stays search did not return rates", {
      status: response.status,
      error: data?.errors?.[0]?.detail || data?.errors?.[0]?.title,
    });
    return {
      hotels: args.hotels,
      notice:
        response.status === 403
          ? "Duffel rates are configured, but this token does not currently have access to Stays rates."
          : "Duffel did not return live rates for these hotels and dates.",
    };
  }

  const nights = getStayNights(args.checkInDate, args.checkOutDate);

  return {
    hotels: args.hotels.map((hotel) => {
    const match = findMatchingDuffelStay(hotel, results);

    if (!match) {
      return hotel;
    }

    return {
      ...hotel,
      duffelAccommodationId: match.accommodationId,
      duffelSearchResultId: match.searchResultId,
      rateSource: "Duffel",
      rateLabel: formatDuffelRate(match.total, match.currency, nights),
      pricePerNight: Number((match.total / nights).toFixed(2)),
      currency: match.currency,
    };
    }),
  };
}

function findMatchingAmadeusHotel(
  hotel: HotelSearchHotel,
  candidates: NonNullable<AmadeusHotelListResponse["data"]>,
) {
  if (hotel.latitude === null || hotel.longitude === null) {
    return null;
  }

  const hotelName = normaliseHotelName(hotel.name);
  let bestMatch: { hotelId: string; score: number } | null = null;

  for (const candidate of candidates) {
    const candidateLatitude = candidate.geoCode?.latitude;
    const candidateLongitude = candidate.geoCode?.longitude;

    if (!candidate.hotelId || typeof candidateLatitude !== "number" || typeof candidateLongitude !== "number") {
      continue;
    }

    const candidateName = normaliseHotelName(candidate.name ?? "");
    const nameMatches =
      Boolean(candidateName && hotelName) &&
      (candidateName.includes(hotelName) || hotelName.includes(candidateName));
    const distance = distanceKm(
      { latitude: hotel.latitude, longitude: hotel.longitude },
      { latitude: candidateLatitude, longitude: candidateLongitude },
    );
    const score = distance - (nameMatches ? 0.35 : 0);

    if (distance <= 0.25 || (nameMatches && distance <= 2)) {
      if (!bestMatch || score < bestMatch.score) {
        bestMatch = { hotelId: candidate.hotelId, score };
      }
    }
  }

  return bestMatch?.hotelId ?? null;
}

async function enrichHotelsWithAmadeusRates(args: {
  hotels: HotelSearchHotel[];
  checkInDate: string;
  checkOutDate: string;
  adults: number;
}) {
  if (!hasValidRateDates(args.checkInDate, args.checkOutDate)) {
    return args.hotels;
  }

  const token = await getAmadeusToken();

  if (!token) {
    return args.hotels;
  }

  const hotelsWithCoordinates = args.hotels.filter(
    (hotel) => typeof hotel.latitude === "number" && typeof hotel.longitude === "number",
  );

  if (hotelsWithCoordinates.length === 0) {
    return args.hotels;
  }

  const center = hotelsWithCoordinates[0];
  const listParams = new URLSearchParams({
    latitude: String(center.latitude),
    longitude: String(center.longitude),
    radius: "20",
    radiusUnit: "KM",
    hotelSource: "ALL",
  });
  const listResponse = await fetch(
    `${getAmadeusBaseUrl()}/v1/reference-data/locations/hotels/by-geocode?${listParams.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    },
  );
  const listData = (await listResponse.json().catch(() => null)) as AmadeusHotelListResponse | null;
  const amadeusHotels = listData?.data ?? [];

  if (!listResponse.ok || amadeusHotels.length === 0) {
    console.warn("[Journi Hotels] Amadeus hotel list did not return matches", {
      status: listResponse.status,
      error: listData?.errors?.[0]?.detail || listData?.errors?.[0]?.title,
    });
    return args.hotels;
  }

  const matches = new Map<string, string>();
  for (const hotel of args.hotels) {
    const amadeusHotelId = findMatchingAmadeusHotel(hotel, amadeusHotels);

    if (amadeusHotelId) {
      matches.set(hotel.id, amadeusHotelId);
    }
  }

  const hotelIds = Array.from(new Set(matches.values())).slice(0, 40);

  if (hotelIds.length === 0) {
    return args.hotels;
  }

  const offerParams = new URLSearchParams({
    hotelIds: hotelIds.join(","),
    adults: String(Math.min(Math.max(args.adults, 1), 9)),
    checkInDate: args.checkInDate,
    checkOutDate: args.checkOutDate,
    roomQuantity: "1",
  });
  const offerResponse = await fetch(
    `${getAmadeusBaseUrl()}/v3/shopping/hotel-offers?${offerParams.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    },
  );
  const offerData = (await offerResponse.json().catch(() => null)) as AmadeusHotelOffersResponse | null;
  const offersByHotelId = new Map(
    (offerData?.data ?? [])
      .map((hotelOffer) => {
        const hotelId = hotelOffer.hotel?.hotelId;
        const price = hotelOffer.offers?.[0]?.price;
        const total = Number(price?.sellingTotal ?? price?.total ?? price?.base);

        if (!hotelId || !Number.isFinite(total)) {
          return null;
        }

        return [
          hotelId,
          {
            total,
            currency: price?.currency || "GBP",
          },
        ] as const;
      })
      .filter((entry): entry is readonly [string, { total: number; currency: string }] => Boolean(entry)),
  );

  if (!offerResponse.ok || offersByHotelId.size === 0) {
    console.warn("[Journi Hotels] Amadeus hotel offers did not return rates", {
      status: offerResponse.status,
      error: offerData?.errors?.[0]?.detail || offerData?.errors?.[0]?.title,
    });
    return args.hotels;
  }

  const nights = getStayNights(args.checkInDate, args.checkOutDate);

  return args.hotels.map((hotel) => {
    const amadeusHotelId = matches.get(hotel.id);
    const offer = amadeusHotelId ? offersByHotelId.get(amadeusHotelId) : null;

    if (!amadeusHotelId || !offer) {
      return hotel;
    }

    return {
      ...hotel,
      amadeusHotelId,
      rateSource: "Amadeus",
      rateLabel: formatAmadeusRate(offer.total, offer.currency, nights),
      pricePerNight: Number((offer.total / nights).toFixed(2)),
      currency: offer.currency,
    };
  });
}

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
    checkInDate?: string;
    checkOutDate?: string;
    adults?: number;
  };
  const destination = typeof body.destination === "string" ? body.destination.trim() : "";
  const pageToken = typeof body.pageToken === "string" ? body.pageToken.trim() : "";
  const checkInDate = typeof body.checkInDate === "string" ? body.checkInDate.trim() : "";
  const checkOutDate = typeof body.checkOutDate === "string" ? body.checkOutDate.trim() : "";
  const adults = typeof body.adults === "number" && Number.isFinite(body.adults) ? body.adults : 2;

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
          "places.id,places.displayName,places.formattedAddress,places.rating,places.priceLevel,places.priceRange,places.websiteUri,places.location,places.primaryType,places.photos,nextPageToken",
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
      .map((place) => {
        const rateLabel = formatRateLabel(place);
        const pricePerNight = moneyToNumber(place.priceRange?.startPrice);
        const currency = place.priceRange?.startPrice?.currencyCode || place.priceRange?.endPrice?.currencyCode || "GBP";

        return {
          id: place.id ?? place.displayName?.text ?? crypto.randomUUID(),
          name: place.displayName?.text ?? "Unnamed hotel",
          location: place.formattedAddress ?? destination,
          bookingUrl: place.websiteUri ?? "",
          notes:
            typeof place.rating === "number"
              ? `Google rating ${place.rating.toFixed(1)}`
              : "Loaded from Google Places",
          rateLabel,
          priceLevel: place.priceLevel ?? "",
          pricePerNight,
          currency,
          latitude: place.location?.latitude ?? null,
          longitude: place.location?.longitude ?? null,
          photoUrl: place.photos?.[0]?.name
            ? `https://places.googleapis.com/v1/${place.photos[0].name}/media?maxHeightPx=420&key=${apiKey}`
            : "",
          photoAttribution: place.photos?.[0]?.authorAttributions?.[0]?.displayName ?? "",
        };
      });
    const duffelResult = await enrichHotelsWithDuffelRates({
      hotels,
      checkInDate,
      checkOutDate,
      adults,
    });
    const enrichedHotels = duffelResult.hotels.some((hotel) => hotel.rateSource === "Duffel")
      ? duffelResult.hotels
      : await enrichHotelsWithAmadeusRates({
          hotels,
          checkInDate,
          checkOutDate,
          adults,
        });

    return NextResponse.json({
      cityName: destination,
      hotels: enrichedHotels,
      nextPageToken: data.nextPageToken ?? null,
      rateProviderNotice: duffelResult.notice ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to search hotels.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
