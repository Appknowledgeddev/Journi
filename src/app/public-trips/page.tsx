"use client";

import Link from "next/link";
import { FiCalendar, FiUsers, FiSliders, FiMapPin } from "react-icons/fi";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { JourniLoader } from "@/components/journi-loader";
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
  const [trips, setTrips] = useState<PublicTripCard[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(true);
  const [tripError, setTripError] = useState<string | null>(null);
  const [filters, setFilters] = useState({ place: "", from: "", to: "" });
  const [savingFilters, setSavingFilters] = useState(false);
  const [filterNotice, setFilterNotice] = useState("");
  const [filterError, setFilterError] = useState("");
  const invalidDates = Boolean(filters.from && filters.to && filters.from > filters.to);
  const filterCount = Number(Boolean(filters.place.trim())) + Number(Boolean(filters.from || filters.to));
  const filteredTrips = trips.filter((trip) => {
    if (filters.place.trim() && !trip.destination?.toLocaleLowerCase().includes(filters.place.trim().toLocaleLowerCase())) return false;
    if (filters.from || filters.to) {
      const start = (trip.starts_at || trip.ends_at)?.slice(0, 10);
      const end = (trip.ends_at || trip.starts_at)?.slice(0, 10);
      if (!start || !end || invalidDates) return false;
      if (filters.from && end < filters.from) return false;
      if (filters.to && start > filters.to) return false;
    }
    return true;
  });

  function updateFilter(key: keyof typeof filters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
    setFilterNotice(""); setFilterError("");
  }

  async function saveFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingFilters || invalidDates) return;
    setSavingFilters(true); setFilterNotice(""); setFilterError("");
    try {
      const { error } = await supabase.auth.updateUser({ data: { public_trip_filters: filters } });
      if (error) throw error;
      setFilterNotice("Filter saved for your next visit.");
    } catch { setFilterError("Unable to save your filter. Please try again."); }
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

  return (
    <AppShell
      title="Explore public trips."
      headerActionInline
      headerAction={<details className={styles.publicTripFilters}>
        <summary><FiSliders aria-hidden="true" /> Filters{filterCount ? <span>{filterCount}</span> : null}</summary>
        <form className={styles.publicTripFilterPanel} onSubmit={saveFilters}>
          <fieldset disabled={savingFilters || loadingTrips}>
            <label><span><FiMapPin aria-hidden="true" /> Place</span><input maxLength={160} list="public-trip-places" placeholder="City or country" value={filters.place} onChange={(event) => updateFilter("place", event.target.value)} /></label>
            <datalist id="public-trip-places">{[...new Set(trips.map((trip) => trip.destination).filter((place): place is string => Boolean(place)))].map((place) => <option key={place} value={place} />)}</datalist>
            <div className={styles.publicTripDateFields}>
              <label><span><FiCalendar aria-hidden="true" /> From</span><input type="date" value={filters.from} onChange={(event) => updateFilter("from", event.target.value)} /></label>
              <label><span><FiCalendar aria-hidden="true" /> To</span><input type="date" min={filters.from || undefined} value={filters.to} onChange={(event) => updateFilter("to", event.target.value)} /></label>
            </div>
            <p>Shows trips overlapping these dates. Undated trips appear when dates are cleared.</p>
            {invalidDates ? <p role="alert">Choose an end date on or after the start date.</p> : null}
            <div className={styles.publicTripFilterActions}>
              <button type="button" onClick={() => { setFilters({ place: "", from: "", to: "" }); setFilterNotice(""); setFilterError(""); }}>Clear</button>
              <button type="submit" disabled={invalidDates}>{savingFilters ? "Saving…" : "Save filter"}</button>
            </div>
          </fieldset>
          {filterNotice ? <p role="status">{filterNotice}</p> : null}
          {filterError ? <p role="alert">{filterError}</p> : null}
        </form>
      </details>}
    >
      {() => (
        <div className={styles.stack}>
          <section className={styles.tripListSection}>
            {tripError ? <p className={styles.formError}>{tripError}</p> : null}

            {loadingTrips ? (
              <JourniLoader
                title="Finding public trips"
                detail="Looking for open trips posted by other organisers."
              />
            ) : null}

            {!loadingTrips && !tripError && filteredTrips.length === 0 ? (
              <div className={styles.emptyState}>
                <p>{trips.length ? "No trips match your dates and place. Try changing or clearing the filter." : "No public trips have been published yet."}</p>
              </div>
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
