import { worldCountryId } from "./world-country-id";
import type { TripListFilters } from "@/components/trip-list-controls";

export type FilterLocation = { name: string; code: string; lat: number; lng: number; radiusKm?: number };
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180;
  const h = Math.sin((b.lat - a.lat) * rad / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lng - a.lng) * rad / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
export type PublicTripPreset = {
  id: string; name: string; location: FilterLocation | null; hidden?: boolean;
  place: string; from: string; to: string; list: TripListFilters;
};
export const emptyPreset = (): PublicTripPreset => ({ id: "", name: "", location: null, place: "", from: "", to: "", list: { search: "", status: "all", timing: "all", visibility: "all", sort: "default" } });
const text = (value: unknown, max = 160) => typeof value === "string" ? value.trim().slice(0, max) : "";
const date = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) ? value : "";
export function readPublicTripPresets(value: unknown): { items: PublicTripPreset[]; activeId: string | null } {
  if (!value || typeof value !== "object") return { items: [], activeId: null };
  const data = value as Record<string, unknown>;
  const items: PublicTripPreset[] = [];
  for (const entry of Array.isArray(data.items) ? data.items.slice(0, 20) : []) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    const id = text(item.id, 80), name = text(item.name, 60);
    if (!id || !name || items.some((existing) => existing.id === id)) continue;
    const rawLocation = item.location as Partial<FilterLocation> | null;
    const location = rawLocation && typeof rawLocation.lat === "number" && Number.isFinite(rawLocation.lat) && Math.abs(rawLocation.lat) <= 90 && typeof rawLocation.lng === "number" && Number.isFinite(rawLocation.lng) && Math.abs(rawLocation.lng) <= 180 && text(rawLocation.name)
      ? { name: text(rawLocation.name), code: worldCountryId(text(rawLocation.code, 200), text(rawLocation.name)), lat: rawLocation.lat, lng: rawLocation.lng,
        ...(typeof rawLocation.radiusKm === "number" && Number.isFinite(rawLocation.radiusKm) && rawLocation.radiusKm >= 1 && rawLocation.radiusKm <= 5000 ? { radiusKm: rawLocation.radiusKm } : {}) } : null;
    const raw = (item.list && typeof item.list === "object" ? item.list : {}) as Record<string, unknown>;
    const list = emptyPreset().list;
    list.search = text(raw.search); list.status = text(raw.status) || "all";
    if (["all", "upcoming", "ongoing", "past", "undated"].includes(String(raw.timing))) list.timing = String(raw.timing);
    if (["default", "soonest", "name"].includes(String(raw.sort))) list.sort = String(raw.sort);
    const from = date(item.from), to = date(item.to);
    items.push({ id, name, hidden: item.hidden === true, location, place: location?.name || text(item.place), from, to: from && to && to < from ? "" : to, list });
  }
  return { items, activeId: items.some((item) => item.id === data.activeId && !item.hidden) ? String(data.activeId) : null };
}
const aliases: Record<string, string[]> = {
  "United States of America": ["United States", "USA", "U.S.A."],
  "United Kingdom": ["UK", "England", "Scotland", "Wales", "Northern Ireland"],
  "Czechia": ["Czech Republic"], "Türkiye": ["Turkey"], "Turkey": ["Türkiye"],
  "United Arab Emirates": ["UAE"], "Russia": ["Russian Federation"],
};
const normalise = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
export function matchesPresetPlace(destination: string | null, place: string) {
  if (!place.trim()) return true;
  const haystack = normalise(destination || "");
  return [place, ...(aliases[place] || [])].some((name) => {
    const escaped = normalise(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|[^a-z])${escaped}(?:$|[^a-z])`).test(haystack);
  });
}
