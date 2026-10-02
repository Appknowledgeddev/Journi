import "server-only";

type Point = { lat: number; lng: number };
/** Resolve only destinations from the authorised public-trip query. */
export async function locatePublicTrips<T extends { id: string; destination: string | null }>(trips: T[]) {
  if (!trips.length) return [];
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) throw new Error("Location search is not configured. Please use a country filter for now.");
  const destinations = [...new Set(trips.map(trip => trip.destination?.trim()).filter((name): name is string => Boolean(name)))];
  const points = new Map<string, Point | null>();
  for (let offset = 0; offset < destinations.length; offset += 5) {
    await Promise.all(destinations.slice(offset, offset + 5).map(async destination => {
      const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "places.location" },
        body: JSON.stringify({ textQuery: destination, pageSize: 1 }),
        next: { revalidate: 86400 }, signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error("Unable to check trip locations. Please try again or use a country filter.");
      const data = await response.json() as { places?: { location?: { latitude?: number; longitude?: number } }[] };
      const point = data.places?.[0]?.location;
      points.set(destination, typeof point?.latitude === "number" && typeof point.longitude === "number" && Number.isFinite(point.latitude) && Number.isFinite(point.longitude) && Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180
        ? { lat: point.latitude, lng: point.longitude } : null);
    }));
  }
  return trips.map(trip => ({ id: trip.id, coordinates: points.get(trip.destination?.trim() || "") || null }));
}
