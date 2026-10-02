"use client";

import { TripListControls, filterTripList, initialTripListFilters } from "@/components/trip-list-controls";
import { PublicTripFilterModal } from "@/components/public-trip-filter-modal";
import { distanceKm, matchesPresetPlace, readPublicTripPresets, type PublicTripPreset } from "@/lib/public-trip-filters";
import { TripsEmptyState } from "@/components/trips-empty-state";
import Link from "next/link";
import { FiCalendar, FiUsers, FiPlus, FiEdit2, FiX } from "react-icons/fi";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { supabase } from "@/lib/supabase/client";
import styles from "@/components/app-page.module.css";

type PublicTripCard = {
  id: string;
  title: string;
  destination: string | null;
  description: string | null;
  status: string;
  visibility: "public" | "private" | null;
  starts_at: string | null;
  ends_at: string | null;
  cover_image_url: string | null;
  created_at: string | null;
  peopleCount?: number | null;
  optionCounts?: (number | null)[];
};

function formatTripDateRange(startsAt: string | null, endsAt: string | null) {
  if (!startsAt && !endsAt) {
    return "Dates to be confirmed";
  }

  const formatter = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const startLabel = startsAt ? formatter.format(new Date(startsAt)) : null;
  const endLabel = endsAt ? formatter.format(new Date(endsAt)) : null;

  if (startLabel && endLabel) {
    return `${startLabel} to ${endLabel}`;
  }

  return startLabel ?? endLabel ?? "Dates to be confirmed";
}

export default function PublicTripsPage() {
  const [listFilters, setListFilters] = useState(initialTripListFilters);
  const [trips, setTrips] = useState<PublicTripCard[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(true);
  const [tripError, setTripError] = useState<string | null>(null);
  const [filters, setFilters] = useState({ place: "", from: "", to: "" });
  const [savingFilters, setSavingFilters] = useState(false);
  const [presets, setPresets] = useState<PublicTripPreset[]>([]);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [filterModal, setFilterModal] = useState<PublicTripPreset | null | undefined>(undefined);
  const [filterError, setFilterError] = useState("");
  const [locations, setLocations] = useState<Record<string, { lat: number; lng: number } | null> | null>(null);
  const [locationError, setLocationError] = useState("");
  const [locationAttempt, setLocationAttempt] = useState(0);
  const activeLocation = presets.find(preset => preset.id === activePresetId)?.location;
  const radiusActive = Boolean(activeLocation?.radiusKm);
  const loadingLocations = radiusActive && !locations && !locationError;
  useEffect(() => {
    if (!radiusActive || locations || loadingTrips) return;
    const controller = new AbortController();
    async function loadLocations() {
      setLocationError("");
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("Please sign in again to check trip locations.");
        const response = await fetch("/api/public-trips?locations=1", { headers: { Authorization: `Bearer ${session.access_token}` }, signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to check trip locations.");
        if (!controller.signal.aborted) setLocations(Object.fromEntries((result.trips || []).map((trip: { id: string; coordinates: { lat: number; lng: number } | null }) => [trip.id, trip.coordinates])));
      } catch (reason) {
        if (!controller.signal.aborted) setLocationError(reason instanceof Error ? reason.message : "Unable to check trip locations.");
      }
    }
    void loadLocations();
    return () => controller.abort();
  }, [radiusActive, locations, loadingTrips, locationAttempt]);
  const invalidDates = Boolean(filters.from && filters.to && filters.from > filters.to);
  const scopedTrips = trips.filter((trip) => {
    if (activeLocation?.radiusKm) {
      const point = locations?.[trip.id];
      if (!point || distanceKm(activeLocation, point) > activeLocation.radiusKm) return false;
    } else if (!matchesPresetPlace(trip.destination, filters.place)) return false;
    if (filters.from || filters.to) {
      const start = (trip.starts_at || trip.ends_at)?.slice(0, 10);
      const end = (trip.ends_at || trip.starts_at)?.slice(0, 10);
      if (!start || !end || invalidDates) return false;
      if (filters.from && end < filters.from) return false;
      if (filters.to && start > filters.to) return false;
    }
    return true;
  });

  function applyPreset(preset: PublicTripPreset | null) {
    setActivePresetId(preset?.id || null);
    setFilters(preset ? { place: preset.place, from: preset.from, to: preset.to } : { place: "", from: "", to: "" });
    setListFilters(preset?.list || initialTripListFilters);
  }

  async function persistPreset(preset: PublicTripPreset | null, deleteId?: string, hideId?: string) {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error("Please sign in again to save your filter.");
    const existing = readPublicTripPresets(user.user_metadata?.public_trip_saved_filters);
    const remaining = existing.items.filter((item) => item.id !== (deleteId || preset?.id));
    if (preset && remaining.length >= 20) throw new Error("You can save up to 20 filters. Edit or delete one first.");
    const next = preset ? [...remaining, { ...preset, hidden: false }] : remaining.map(item => item.id === hideId ? { ...item, hidden: true } : item);
    if (preset && next.some((item) => item.id !== preset.id && item.name.toLocaleLowerCase() === preset.name.toLocaleLowerCase())) throw new Error("Choose a different name for this filter.");
    const nextActiveId = preset?.id || (existing.activeId === deleteId || existing.activeId === hideId ? null : existing.activeId);
    const { error } = await supabase.auth.updateUser({ data: { public_trip_saved_filters: { items: next, activeId: nextActiveId } } });
    if (error) throw new Error("Unable to save your filters. Please try again.");
    const { data: verified, error: verifyError } = await supabase.auth.getUser();
    if (verifyError || !verified.user) throw new Error("Your update was sent, but could not be confirmed. Please reopen the page before trying again.");
    const saved = readPublicTripPresets(verified.user.user_metadata?.public_trip_saved_filters);
    if (preset && !saved.items.some((item) => item.id === preset.id) || deleteId && saved.items.some((item) => item.id === deleteId)) throw new Error("Your filter could not be confirmed. Please try again.");
    if (hideId && !saved.items.some(item => item.id === hideId && item.hidden)) throw new Error("Your filter could not be hidden. Please try again.");
    setPresets(saved.items);
    if (preset) applyPreset(preset);
    else if (activePresetId === deleteId || activePresetId === hideId) applyPreset(null);
  }

  async function removePreset(id: string) {
    if (savingFilters) return;
    setSavingFilters(true); setFilterError("");
    try { await persistPreset(null, undefined, id); }
    catch (reason) { setFilterError(reason instanceof Error ? reason.message : "Unable to remove this filter. Please try again."); }
    finally { setSavingFilters(false); }
  }

  async function selectPreset(preset: PublicTripPreset | null) {
    if (savingFilters) return;
    setSavingFilters(true); setFilterError("");
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error();
      const saved = readPublicTripPresets(user.user_metadata?.public_trip_saved_filters);
      const selected = preset ? saved.items.find((item) => item.id === preset.id) : null;
      if (preset && !selected) throw new Error();
      const { error } = await supabase.auth.updateUser({ data: { public_trip_saved_filters: { items: saved.items, activeId: selected?.id || null } } });
      if (error) throw error;
      setPresets(saved.items); applyPreset(selected || null);
    } catch { setFilterError("Unable to switch your saved filter. Please try again."); }
    finally { setSavingFilters(false); }
  }

  useEffect(() => {
    let mounted = true;

    async function loadPublicTrips() {
      setLoadingTrips(true);
      setTripError(null);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setTripError("You need to be signed in before viewing public trips.");
        setTrips([]);
        setLoadingTrips(false);
        return;
      }

      if (!mounted) return;
      const saved = session.user.user_metadata?.public_trip_filters;
      if (saved && typeof saved === "object") {
        const date = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
        setFilters({ place: typeof saved.place === "string" ? saved.place.slice(0, 160) : "", from: date(saved.from), to: date(saved.to) });
      }
      const savedPresets = readPublicTripPresets(session.user.user_metadata?.public_trip_saved_filters);
      setPresets(savedPresets.items);
      if (session.user.user_metadata?.public_trip_saved_filters) {
        applyPreset(savedPresets.items.find((item) => item.id === savedPresets.activeId) || null);
      }
      const response = await fetch("/api/public-trips", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      const result = (await response.json()) as {
        trips?: PublicTripCard[];
        error?: string;
      };

      if (!mounted) {
        return;
      }

      if (!response.ok) {
        setTripError(result.error || "Unable to load public trips.");
        setTrips([]);
        setLoadingTrips(false);
        return;
      }

      setTrips(result.trips ?? []);
      setLoadingTrips(false);
    }

    void loadPublicTrips().catch(() => {
      if (mounted) { setTripError("Unable to load public trips. Please try again."); setLoadingTrips(false); }
    });

    return () => {
      mounted = false;
    };
  }, []);

  const today = new Date().toLocaleDateString("en-CA");
  const filteredTrips = filterTripList(scopedTrips, listFilters, today);

  return (
    <AppShell
      pageLoading={loadingTrips || loadingLocations}
      loadingLabel="Finding public trips…"
      title="Explore public trips."
      headerActionInline
      headerAction={<button type="button" className={styles.newPublicFilter} disabled={loadingTrips || savingFilters} onClick={() => setFilterModal(null)}><FiPlus aria-hidden="true" /> New filter<span className={styles.savedFilterCount} aria-label={`${presets.length} saved filters`}>{presets.length}</span></button>}
    >
      {() => (
        <div className={styles.stack}>
          {filterModal !== undefined ? <PublicTripFilterModal initial={filterModal} presets={presets} onClose={() => setFilterModal(undefined)} onSave={(preset) => persistPreset(preset)} onDelete={(id) => persistPreset(null, id)} /> : null}
          <div className={styles.savedPublicFilters} role="group" aria-label="Saved public trip filters">
            <button type="button" aria-pressed={!activePresetId && !filters.place && !filters.from && !filters.to} disabled={savingFilters} onClick={() => void selectPreset(null)}>All trips</button>
            {presets.filter(preset => !preset.hidden).map((preset) => <div key={preset.id} className={styles.savedPublicFilter} data-active={activePresetId === preset.id}>
              <button type="button" aria-pressed={activePresetId === preset.id} disabled={savingFilters} onClick={() => void selectPreset(preset)}>{preset.name}</button>
              <button type="button" className={styles.editPublicFilter} disabled={savingFilters} aria-label={`Edit ${preset.name}`} onClick={() => setFilterModal(preset)}><FiEdit2 /></button>
              <button type="button" className={styles.removePublicFilter} disabled={savingFilters} aria-label={`Hide filter ${preset.name} from list`} title="Remove from list — keep saved" onClick={() => void removePreset(preset.id)}><FiX /></button>
            </div>)}
            {!activePresetId && filters.place ? <span className={styles.muted}>Previous filter: {filters.place}</span> : null}
          </div>
          {filterError ? <p role="alert" className={styles.formError}>{filterError}</p> : null}
          <section className={styles.tripListSection}>
            <TripListControls value={listFilters} onChange={setListFilters} statuses={[...new Set(trips.map((trip) => trip.status))].sort()} count={filteredTrips.length} total={scopedTrips.length} />
            {radiusActive && locationError ? <p role="alert" className={styles.formError}>{locationError} <button type="button" onClick={() => { setLocationError(""); setLocationAttempt(attempt => attempt + 1); }}>Try again</button></p> : null}
            {radiusActive && locations && trips.some(trip => !locations[trip.id]) ? <p className={styles.muted}>Trips without a known destination location are excluded from radius results.</p> : null}
            {tripError ? <p className={styles.formError}>{tripError}</p> : null}



            {!loadingTrips && !loadingLocations && !(radiusActive && locationError) && !tripError && filteredTrips.length === 0 ? (
              <TripsEmptyState publicTrips filtered={trips.length > 0} resetting={savingFilters} onReset={() => void selectPreset(null)} />
            ) : null}

            {!tripError && filteredTrips.length > 0 ? (
              <div className={styles.tripList}>
                {filteredTrips.map((trip) => (
                  <Link key={trip.id} href={`/trips/${trip.id}`} className={styles.tripListCardLink}>
                    <article className={styles.tripListCard}>
                      <span className={styles.tripCardRoleBadge}>Public</span>
                      {trip.cover_image_url ? (
                        <img src={trip.cover_image_url} alt={trip.title} className={styles.tripListImage} />
                      ) : (
                        <div className={styles.tripListImageFallback} />
                      )}

                      <div className={styles.tripListBody}>
                        <div className={styles.rowTop}>
                          <span className={styles.rowTitle}>{trip.title}</span>
                        </div>
                        <div className={styles.tripMetaRow}>
                          <span>{trip.destination || "Destination to be confirmed"}</span>
                        </div>
                        <div className={styles.tripCardFacts}>
                          <span className={styles.tripCardDate}><FiCalendar aria-hidden="true" /><strong>{formatTripDateRange(trip.starts_at, trip.ends_at)}</strong></span>
                          {trip.peopleCount != null ? <span className={styles.tripCardPeople}><FiUsers aria-hidden="true" /><span><strong>{trip.peopleCount}</strong> {trip.peopleCount === 1 ? "person" : "people"}</span></span> : null}
                        </div>
                        <p className={styles.tripListDescription}>
                          {trip.description || "No trip summary added yet."}
                        </p>
                        <div className={styles.tripCardMiniGrid}>
                          {["Hotels", "Activities", "Transport", "Dining"].map((label, index) => <div key={label} className={styles.tripCardMiniItem}>
                            <div className={styles.tripCardMiniTop}><span>{label}</span><strong className={styles.tripCardOptionCount}>{trip.optionCounts?.[index] ?? "—"}</strong></div>
                          </div>)}
                        </div>
                      </div>
                    </article>
                  </Link>
                ))}
              </div>
            ) : null}
          </section>
        </div>
      )}
    </AppShell>
  );
}
