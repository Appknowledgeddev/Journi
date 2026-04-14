"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import styles from "@/components/app-page.module.css";
import { supabase } from "@/lib/supabase/client";

type TripOption = {
  id: string;
  title: string;
  destination: string | null;
  status: string;
};

type TripParticipant = {
  id: string;
  trip_id: string;
  email: string;
  full_name: string | null;
  role: string;
  status: string;
  invited_at?: string | null;
};

type InviteApiResponse = {
  trips?: TripOption[];
  sentInvites?: TripParticipant[];
  receivedInvites?: TripParticipant[];
  receivedTrips?: TripOption[];
  receivedOrganisers?: Array<{
    user_id: string;
    email: string | null;
    full_name: string | null;
    trip_ids: string[];
  }>;
  error?: string;
};

type ConnectionRecord = {
  key: string;
  email: string;
  fullName: string | null;
  latestStatus: string;
  latestInvitedAt: string | null;
  roles: string[];
  trips: TripOption[];
  direction: "invited" | "joined";
};

function formatInviteDate(value: string | null) {
  if (!value) {
    return "Recently";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Recently";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function buildConnections(
  sentInvites: TripParticipant[],
  trips: TripOption[],
): ConnectionRecord[] {
  const tripById = new Map(trips.map((trip) => [trip.id, trip]));
  const grouped = new Map<string, ConnectionRecord>();

  for (const invite of sentInvites) {
    const key = invite.email.toLowerCase();
    const existing = grouped.get(key);
    const linkedTrip = tripById.get(invite.trip_id);
    const invitedAt = invite.invited_at ?? null;

    if (!existing) {
      grouped.set(key, {
        key,
        email: key,
        fullName: invite.full_name,
        latestStatus: invite.status,
        latestInvitedAt: invitedAt,
        roles: invite.role ? [invite.role] : [],
        trips: linkedTrip ? [linkedTrip] : [],
        direction: "invited",
      });
      continue;
    }

    if (!existing.fullName && invite.full_name) {
      existing.fullName = invite.full_name;
    }

    if (invite.role && !existing.roles.includes(invite.role)) {
      existing.roles.push(invite.role);
    }

    if (linkedTrip && !existing.trips.some((trip) => trip.id === linkedTrip.id)) {
      existing.trips.push(linkedTrip);
    }

    const existingTime = existing.latestInvitedAt ? new Date(existing.latestInvitedAt).getTime() : 0;
    const nextTime = invitedAt ? new Date(invitedAt).getTime() : 0;

    if (nextTime >= existingTime) {
      existing.latestInvitedAt = invitedAt;
      existing.latestStatus = invite.status;
    }
  }

  return Array.from(grouped.values()).sort((first, second) => {
    const firstTime = first.latestInvitedAt ? new Date(first.latestInvitedAt).getTime() : 0;
    const secondTime = second.latestInvitedAt ? new Date(second.latestInvitedAt).getTime() : 0;

    return secondTime - firstTime;
  });
}

function buildOrganiserConnections(
  organisers: NonNullable<InviteApiResponse["receivedOrganisers"]>,
  trips: TripOption[],
  invites: TripParticipant[],
): ConnectionRecord[] {
  const tripById = new Map(trips.map((trip) => [trip.id, trip]));

  return organisers
    .map((organiser) => {
      const linkedTrips = organiser.trip_ids
        .map((tripId) => tripById.get(tripId))
        .filter((trip): trip is TripOption => Boolean(trip));

      const latestInvite = invites
        .filter((invite) => organiser.trip_ids.includes(invite.trip_id))
        .sort((first, second) => {
          const firstTime = first.invited_at ? new Date(first.invited_at).getTime() : 0;
          const secondTime = second.invited_at ? new Date(second.invited_at).getTime() : 0;

          return secondTime - firstTime;
        })[0];

      return {
        key: `organiser-${organiser.user_id}`,
        email: organiser.email || "Organiser email unavailable",
        fullName: organiser.full_name,
        latestStatus: latestInvite?.status || "invited",
        latestInvitedAt: latestInvite?.invited_at ?? null,
        roles: ["organiser"],
        trips: linkedTrips,
        direction: "joined" as const,
      };
    })
    .sort((first, second) => {
      const firstTime = first.latestInvitedAt ? new Date(first.latestInvitedAt).getTime() : 0;
      const secondTime = second.latestInvitedAt ? new Date(second.latestInvitedAt).getTime() : 0;

      return secondTime - firstTime;
    });
}

function MyConnectionsManager({
  userId,
  loading,
}: {
  userId: string | null;
  loading: boolean;
}) {
  const [connections, setConnections] = useState<ConnectionRecord[]>([]);
  const [organiserConnections, setOrganiserConnections] = useState<ConnectionRecord[]>([]);
  const [loadingConnections, setLoadingConnections] = useState(true);
  const [connectionsError, setConnectionsError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadConnections() {
      if (loading) {
        return;
      }

      setLoadingConnections(true);
      setConnectionsError(null);

      if (!userId) {
        setConnections([]);
        setOrganiserConnections([]);
        setConnectionsError("You need to be signed in before viewing connections.");
        setLoadingConnections(false);
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) {
        return;
      }

      if (!session?.access_token) {
        setConnections([]);
        setOrganiserConnections([]);
        setConnectionsError("You need to be signed in before viewing connections.");
        setLoadingConnections(false);
        return;
      }

      const response = await fetch("/api/travellers/invites", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const result = (await response.json()) as InviteApiResponse;

      if (!mounted) {
        return;
      }

      if (!response.ok) {
        setConnections([]);
        setOrganiserConnections([]);
        setConnectionsError(result.error || "Unable to load connections.");
        setLoadingConnections(false);
        return;
      }

      const nextConnections = buildConnections(result.sentInvites ?? [], result.trips ?? []);
      const nextOrganiserConnections = buildOrganiserConnections(
        result.receivedOrganisers ?? [],
        result.receivedTrips ?? [],
        result.receivedInvites ?? [],
      );
      setConnections(nextConnections);
      setOrganiserConnections(nextOrganiserConnections);
      setLoadingConnections(false);
    }

    void loadConnections();

    return () => {
      mounted = false;
    };
  }, [loading, userId]);

  const totalTripsShared = useMemo(
    () =>
      [...connections, ...organiserConnections].reduce(
        (count, connection) => count + connection.trips.length,
        0,
      ),
    [connections, organiserConnections],
  );

  return (
    <div className={styles.stack}>
      <section className={styles.grid3}>
        <article className={styles.metricCard}>
          <p className={styles.eyebrow}>Connections</p>
          <div className={styles.metricValue}>
            {loadingConnections ? "..." : connections.length + organiserConnections.length}
          </div>
          <p className={styles.metricMeta}>People you are actively planning trips with</p>
        </article>
        <article className={styles.metricCard}>
          <p className={styles.eyebrow}>Invited by you</p>
          <div className={styles.metricValue}>{loadingConnections ? "..." : connections.length}</div>
          <p className={styles.metricMeta}>Travellers you have invited into your trips</p>
        </article>
        <article className={styles.metricCard}>
          <p className={styles.eyebrow}>Shared trips</p>
          <div className={styles.metricValue}>{loadingConnections ? "..." : totalTripsShared}</div>
          <p className={styles.metricMeta}>Trips these connections have been invited into</p>
        </article>
      </section>

      {connectionsError ? (
        <section className={styles.panel}>
          <p className={styles.formError}>{connectionsError}</p>
        </section>
      ) : null}

      <section className={styles.panel}>
        <div className={styles.sectionTop}>
          <div>
            <p className={styles.eyebrow}>Directory</p>
            <h2>My connections</h2>
          </div>
        </div>

        <div className={styles.simpleList}>
          {loadingConnections ? (
            <div className={styles.listRow}>
              <p className={styles.muted}>Loading your planning connections...</p>
            </div>
          ) : null}

          {!loadingConnections && connections.length === 0 && organiserConnections.length === 0 ? (
            <div className={styles.listRow}>
              <p className={styles.muted}>
                Once you start inviting travellers or join trips from other organisers, your shared
                planning people will appear here.
              </p>
            </div>
          ) : null}

          {connections.map((connection) => (
            <div key={connection.key} className={styles.listRow}>
              <div className={styles.rowTop}>
                <span className={styles.rowTitle}>{connection.fullName || connection.email}</span>
                <span className={styles.badgeSuccess}>Invited by you</span>
              </div>
              <p className={styles.muted}>
                {connection.trips.length} shared {connection.trips.length === 1 ? "trip" : "trips"} ·
                latest update {formatInviteDate(connection.latestInvitedAt)}
              </p>
              <div className={styles.tripMetaRow}>
                {connection.trips.map((trip) => (
                  <span key={trip.id}>{trip.title}</span>
                ))}
              </div>
            </div>
          ))}

          {organiserConnections.map((connection) => (
            <div key={connection.key} className={styles.listRow}>
              <div className={styles.rowTop}>
                <span className={styles.rowTitle}>{connection.fullName || connection.email}</span>
                <span className={styles.badgeSoft}>Invited you</span>
              </div>
              <p className={styles.muted}>
                {connection.trips.length} shared {connection.trips.length === 1 ? "trip" : "trips"} ·
                latest update {formatInviteDate(connection.latestInvitedAt)}
              </p>
              <div className={styles.tripMetaRow}>
                {connection.trips.map((trip) => (
                  <span key={trip.id}>{trip.title}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function MyConnectionsPageClient() {
  return (
    <AppShell
      kicker="Connections"
      title="Keep the people you plan with close."
      intro="This page turns trip invites into a people-first view, so you can quickly see who you organise with, which travellers are active, and where your shared trips sit."
      headerBadge="Traveller network"
    >
      {({ userId, loading }) => <MyConnectionsManager userId={userId} loading={loading} />}
    </AppShell>
  );
}
