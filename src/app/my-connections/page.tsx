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
      <section className={styles.panel}>
        <div className={styles.sectionTop}>
          <div>
            <p className={styles.eyebrow}>Connections</p>
            <h2>People you’ve invited before</h2>
          </div>
          {!loadingConnections && !connectionsError ? (
            <span className={styles.badge}>{connections.length} saved</span>
          ) : null}
        </div>

        <div className={styles.grid2}>
          <div className={styles.metricCard}>
            <p className={styles.eyebrow}>Contacts</p>
            <div className={styles.metricValue}>{loadingConnections ? "..." : connections.length}</div>
            <p className={styles.metricMeta}>Unique travellers in your organiser network</p>
          </div>
          <div className={styles.metricCard}>
            <p className={styles.eyebrow}>Shared trips</p>
            <div className={styles.metricValue}>{loadingConnections ? "..." : totalTripsShared}</div>
            <p className={styles.metricMeta}>Trips these connections have been invited into</p>
          </div>
        </div>
      </section>

      {loadingConnections ? (
        <section className={styles.panel}>
          <p className={styles.muted}>Loading your connections...</p>
        </section>
      ) : null}

      {connectionsError ? (
        <section className={styles.panel}>
          <p className={styles.formError}>{connectionsError}</p>
        </section>
      ) : null}

      {!loadingConnections &&
      !connectionsError &&
      connections.length === 0 &&
      organiserConnections.length === 0 ? (
        <section className={styles.panel}>
          <div className={styles.emptyState}>
            <h3>No connections yet.</h3>
            <p>Your invited travellers will start building up here once you send trip invites.</p>
          </div>
        </section>
      ) : null}

      {!loadingConnections && !connectionsError && connections.length > 0 ? (
        <section className={styles.panel}>
          <div className={styles.participantsList}>
            {connections.map((connection) => (
              <article key={connection.key} className={styles.participantCard}>
                <div className={styles.rowTop}>
                  <span className={styles.rowTitle}>
                    {connection.fullName || connection.email}
                  </span>
                  <span className={styles.badge}>{connection.latestStatus}</span>
                </div>

                <div className={styles.tripMetaRow}>
                  <span>{connection.email}</span>
                  <span>{connection.trips.length} shared trips</span>
                  <span>{formatInviteDate(connection.latestInvitedAt)}</span>
                </div>

                {connection.roles.length > 0 ? (
                  <div className={styles.tripMetaRow}>
                    <span>{connection.roles.join(", ")}</span>
                  </div>
                ) : null}

                {connection.trips.length > 0 ? (
                  <div className={styles.simpleList}>
                    {connection.trips.slice(0, 4).map((trip) => (
                      <div key={trip.id} className={styles.listRow}>
                        <div className={styles.rowTop}>
                          <span className={styles.rowTitle}>{trip.title}</span>
                          <span className={styles.badgeSoft}>{trip.status}</span>
                        </div>
                        <span className={styles.rowMeta}>
                          {trip.destination || "Destination to be confirmed"}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {!loadingConnections && !connectionsError && organiserConnections.length > 0 ? (
        <section className={styles.panel}>
          <div className={styles.sectionTop}>
            <div>
              <p className={styles.eyebrow}>Joined trips</p>
              <h2>Organisers you’re connected with</h2>
            </div>
            <span className={styles.badgeSoft}>{organiserConnections.length} organisers</span>
          </div>

          <div className={styles.participantsList}>
            {organiserConnections.map((connection) => (
              <article key={connection.key} className={styles.participantCard}>
                <div className={styles.rowTop}>
                  <span className={styles.rowTitle}>
                    {connection.fullName || connection.email}
                  </span>
                  <span className={styles.badgeSoft}>{connection.latestStatus}</span>
                </div>

                <div className={styles.tripMetaRow}>
                  <span>{connection.email}</span>
                  <span>{connection.trips.length} joined trips</span>
                  <span>{formatInviteDate(connection.latestInvitedAt)}</span>
                </div>

                {connection.trips.length > 0 ? (
                  <div className={styles.simpleList}>
                    {connection.trips.slice(0, 4).map((trip) => (
                      <div key={trip.id} className={styles.listRow}>
                        <div className={styles.rowTop}>
                          <span className={styles.rowTitle}>{trip.title}</span>
                          <span className={styles.badgeSoft}>{trip.status}</span>
                        </div>
                        <span className={styles.rowMeta}>
                          {trip.destination || "Destination to be confirmed"}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export default function MyConnectionsPage() {
  return (
    <AppShell
      kicker="Connections"
      title="My connections."
      intro="A simple organiser list of travellers you’ve invited before."
    >
      {(state) => <MyConnectionsManager userId={state.userId} loading={state.loading} />}
    </AppShell>
  );
}
