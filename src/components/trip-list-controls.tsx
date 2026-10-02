"use client";
import { ListControls } from "./list-controls";
export type TripListFilters = { search: string; status: string; timing: string; visibility: string; sort: string };
export const initialTripListFilters: TripListFilters = { search: "", status: "all", timing: "all", visibility: "all", sort: "default" };
type SearchableTrip = { title: string; destination: string | null; description: string | null; status: string; starts_at: string | null; ends_at: string | null; visibility?: string | null };
export function filterTripList<T extends SearchableTrip>(trips: T[], filters: TripListFilters, today: string): T[] {
  const query = filters.search.trim().toLocaleLowerCase();
  const result = trips.filter((trip) => {
    if (query && ![trip.title, trip.destination, trip.description].filter(Boolean).join(" ").toLocaleLowerCase().includes(query)) return false;
    if (filters.status !== "all" && trip.status !== filters.status) return false;
    if (filters.visibility !== "all" && trip.visibility !== filters.visibility) return false;
    const start = (trip.starts_at || trip.ends_at)?.slice(0, 10);
    const end = (trip.ends_at || trip.starts_at)?.slice(0, 10);
    if (filters.timing === "upcoming" && (!start || start < today)) return false;
    if (filters.timing === "ongoing" && (!start || !end || start > today || end < today)) return false;
    if (filters.timing === "past" && (!end || end >= today)) return false;
    if (filters.timing === "undated" && (start || end)) return false;
    return true;
  });
  if (filters.sort === "name") result.sort((a, b) => a.title.localeCompare(b.title));
  if (filters.sort === "soonest") result.sort((a, b) => (a.starts_at || a.ends_at || "9999").localeCompare(b.starts_at || b.ends_at || "9999"));
  return result;
}
export function TripListControls({ value, onChange, statuses, count, total, privateTrips = false }: {
  value: TripListFilters; onChange: (value: TripListFilters) => void; statuses: string[]; count: number; total: number; privateTrips?: boolean;
}) {
  const update = (key: keyof TripListFilters) => (next: string) => onChange({ ...value, [key]: next });
  return <ListControls search={value.search} onSearch={update("search")} placeholder="Search trips or destinations" count={count} total={total}
    active={Object.keys(value).some((key) => value[key as keyof TripListFilters] !== initialTripListFilters[key as keyof TripListFilters])}
    onReset={() => onChange(initialTripListFilters)} filters={[
      { label: "Status", value: value.status, onChange: update("status"), options: [{ value: "all", label: "All statuses" }, ...statuses.map((status) => ({ value: status, label: status.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()) }))] },
      { label: "Dates", value: value.timing, onChange: update("timing"), options: [{ value: "all", label: "Any time" }, { value: "upcoming", label: "Upcoming" }, { value: "ongoing", label: "Happening now" }, { value: "past", label: "Past" }, { value: "undated", label: "Dates undecided" }] },
      ...(privateTrips ? [{ label: "Visibility", value: value.visibility, onChange: update("visibility"), options: [{ value: "all", label: "All" }, { value: "private", label: "Private" }, { value: "public", label: "Public" }] }] : []),
      { label: "Sort", value: value.sort, onChange: update("sort"), options: [{ value: "default", label: "Default" }, { value: "soonest", label: "Date: soonest" }, { value: "name", label: "Name A–Z" }] },
    ]} />;
}
