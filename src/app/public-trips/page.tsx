"use client";

import Link from "next/link";
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

    void loadPublicTrips();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <AppShell
      kicker="Public trips"
      title="Explore public trips."
      intro="Browse published trips that organisers have opened up for everyone to see."
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

            {!loadingTrips && !tripError && trips.length === 0 ? (
              <div className={styles.emptyState}>
                <p>No public trips have been published yet.</p>
              </div>
            ) : null}

            {!tripError && trips.length > 0 ? (
              <div className={styles.tripList}>
                {trips.map((trip) => (
                  <Link key={trip.id} href={`/trips/${trip.id}`} className={styles.tripListCardLink}>
                    <article className={styles.tripListCard}>
                      {trip.cover_image_url ? (
                        <img src={trip.cover_image_url} alt={trip.title} className={styles.tripListImage} />
                      ) : (
                        <div className={styles.tripListImageFallback} />
                      )}

                      <div className={styles.tripListBody}>
                        <div className={styles.rowTop}>
                          <span className={styles.rowTitle}>{trip.title}</span>
                          <span className={styles.badge}>Public</span>
                        </div>
                        <div className={styles.tripMetaRow}>
                          <span>{trip.destination || "Destination to be confirmed"}</span>
                          <span>{formatTripDateRange(trip.starts_at, trip.ends_at)}</span>
                        </div>
                        <p className={styles.tripListDescription}>
                          {trip.description || "No trip summary added yet."}
                        </p>
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
