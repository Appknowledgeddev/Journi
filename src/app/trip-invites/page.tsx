"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import styles from "@/components/app-page.module.css";
import { supabase } from "@/lib/supabase/client";

type TripOption = {
  id: string;
  title: string;
  destination: string | null;
  description?: string | null;
  status: string;
  starts_at?: string | null;
  ends_at?: string | null;
  cover_image_url?: string | null;
};

type TripParticipant = {
  id: string;
  trip_id: string;
  email: string;
  full_name: string | null;
  role: string;
  status: string;
  invited_at?: string | null;
  response_reason?: string | null;
  responded_at?: string | null;
};

type InviteApiResponse = {
  trips?: TripOption[];
  sentInvites?: TripParticipant[];
  receivedInvites?: TripParticipant[];
  receivedTrips?: TripOption[];
  error?: string;
};

type InviteDetailResponse = {
  invite?: TripParticipant;
  trip?: TripOption;
  hotels?: Array<{ id: string; name: string; location: string | null; notes: string | null; source_photo_url: string | null }>;
  activities?: Array<{ id: string; title: string; location: string | null; notes: string | null; source_photo_url: string | null }>;
  transport?: Array<{
    id: string;
    mode: string;
    departure_location: string | null;
    arrival_location: string | null;
    notes: string | null;
    source_photo_url: string | null;
  }>;
  dining?: Array<{ id: string; name: string; location: string | null; notes: string | null; source_photo_url: string | null }>;
  error?: string;
};

type TripInvitesManagerProps = {
  userId: string | null;
  loading: boolean;
};

function TripInvitesManager({ userId, loading }: TripInvitesManagerProps) {
  const [activeInviteTab, setActiveInviteTab] = useState<"received" | "sent">("received");
  const [trips, setTrips] = useState<TripOption[]>([]);
  const [participants, setParticipants] = useState<TripParticipant[]>([]);
  const [receivedInvites, setReceivedInvites] = useState<TripParticipant[]>([]);
  const [receivedTrips, setReceivedTrips] = useState<TripOption[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(true);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [selectedInvite, setSelectedInvite] = useState<TripParticipant | null>(null);
  const [responseReason, setResponseReason] = useState("");
  const [respondingInviteId, setRespondingInviteId] = useState<string | null>(null);
  const [responseError, setResponseError] = useState<string | null>(null);
  const [testingWebhook, setTestingWebhook] = useState<"accepted" | "declined" | null>(null);
  const [selectedInviteTrip, setSelectedInviteTrip] = useState<TripOption | null>(null);
  const [inviteHotels, setInviteHotels] = useState<InviteDetailResponse["hotels"]>([]);
  const [inviteActivities, setInviteActivities] = useState<InviteDetailResponse["activities"]>([]);
  const [inviteTransport, setInviteTransport] = useState<InviteDetailResponse["transport"]>([]);
  const [inviteDining, setInviteDining] = useState<InviteDetailResponse["dining"]>([]);
  const [loadingInviteDetail, setLoadingInviteDetail] = useState(false);

  function closeInviteModal() {
    if (respondingInviteId) {
      return;
    }

    setSelectedInvite(null);
    setSelectedInviteTrip(null);
    setInviteHotels([]);
    setInviteActivities([]);
    setInviteTransport([]);
    setInviteDining([]);
    setResponseReason("");
    setResponseError(null);
  }

  useEffect(() => {
    let mounted = true;

    async function loadInviteData() {
      if (loading) {
        return;
      }

      setLoadingInvites(true);
      setInviteError(null);

      if (!userId) {
        setTrips([]);
        setParticipants([]);
        setReceivedInvites([]);
        setReceivedTrips([]);
        setInviteError("You need to be signed in before viewing invites.");
        setLoadingInvites(false);
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) {
        return;
      }

      if (!session?.access_token) {
        setTrips([]);
        setParticipants([]);
        setReceivedInvites([]);
        setReceivedTrips([]);
        setInviteError("You need to be signed in before viewing invites.");
        setLoadingInvites(false);
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
        setTrips([]);
        setParticipants([]);
        setReceivedInvites([]);
        setReceivedTrips([]);
        setInviteError(result.error || "Unable to load trip invites.");
        setLoadingInvites(false);
        return;
      }

      const ownedTrips = result.trips ?? [];

      setTrips(ownedTrips);
      setParticipants(result.sentInvites ?? []);
      setReceivedInvites(result.receivedInvites ?? []);
      setReceivedTrips(result.receivedTrips ?? []);
      setLoadingInvites(false);
    }

    void loadInviteData();

    return () => {
      mounted = false;
    };
  }, [loading, userId]);

  function findTrip(tripId: string) {
    return (
      trips.find((trip) => trip.id === tripId) ??
      receivedTrips.find((trip) => trip.id === tripId) ??
      null
    );
  }

  function formatTripDateRange(startsAt?: string | null, endsAt?: string | null) {
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

  async function openInvite(invite: TripParticipant) {
    setSelectedInvite(invite);
    setSelectedInviteTrip(findTrip(invite.trip_id));
    setInviteHotels([]);
    setInviteActivities([]);
    setInviteTransport([]);
    setInviteDining([]);
    setResponseReason(invite.response_reason || "");
    setResponseError(null);
    setLoadingInviteDetail(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setResponseError("You need to be signed in before opening the invite.");
      setLoadingInviteDetail(false);
      return;
    }

    const response = await fetch(`/api/travellers/invite-detail?inviteId=${invite.id}`, {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    const result = (await response.json()) as InviteDetailResponse;

    if (!response.ok) {
      setResponseError(result.error || "Unable to load invite details.");
      setLoadingInviteDetail(false);
      return;
    }

    if (result.trip) {
      setSelectedInviteTrip(result.trip);
    }
    setInviteHotels(result.hotels ?? []);
    setInviteActivities(result.activities ?? []);
    setInviteTransport(result.transport ?? []);
    setInviteDining(result.dining ?? []);
    setLoadingInviteDetail(false);
  }

  async function handleInviteResponse(action: "accepted" | "declined") {
    if (!selectedInvite) {
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setResponseError("You need to be signed in before responding to an invite.");
      return;
    }

    setRespondingInviteId(selectedInvite.id);
    setResponseError(null);

    const response = await fetch("/api/travellers/respond", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        inviteId: selectedInvite.id,
        action,
        reason: responseReason,
      }),
    });

    const result = (await response.json()) as {
      invite?: TripParticipant;
      error?: string;
    };

    if (!response.ok || !result.invite) {
      setResponseError(result.error || "Unable to send your response.");
      setRespondingInviteId(null);
      return;
    }

    setReceivedInvites((current) =>
      current.map((invite) => (invite.id === result.invite?.id ? result.invite : invite)),
    );
    setSelectedInvite(result.invite);
    setRespondingInviteId(null);
  }

  async function handleTestWebhook(action: "accepted" | "declined") {
    if (!selectedInvite) {
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setResponseError("You need to be signed in before testing the webhook.");
      return;
    }

    setTestingWebhook(action);
    setResponseError(null);

    const response = await fetch("/api/travellers/respond", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        inviteId: selectedInvite.id,
        action,
        reason: responseReason,
        testOnly: true,
      }),
    });

    const result = (await response.json()) as {
      error?: string;
    };

    if (!response.ok) {
      setResponseError(result.error || "Unable to test the webhook.");
    }

    setTestingWebhook(null);
  }

  function renderInviteSummaryCard(
    title: string,
    count: number,
    emptyLabel: string,
    items: Array<{
      id: string;
      title: string;
      meta: string;
      note: string;
      image?: string | null;
    }>,
  ) {
    return (
      <section className={styles.participantCard}>
        <div className={styles.rowTop}>
          <span className={styles.rowTitle}>{title}</span>
          <span className={styles.badgeSoft}>{count}</span>
        </div>

        {items.length ? (
          <div className={styles.inviteTripSummaryGrid}>
            {items.map((item) => (
              <article key={item.id} className={styles.inviteTripSummaryCard}>
                {item.image ? (
                  <img src={item.image} alt={item.title} className={styles.inviteTripSummaryImage} />
                ) : (
                  <div className={styles.inviteTripSummaryImageFallback} />
                )}
                <div className={styles.inviteTripSummaryBody}>
                  <div className={styles.rowTop}>
                    <span className={styles.rowTitle}>{item.title}</span>
                  </div>
                  <div className={styles.tripMetaRow}>
                    <span>{item.meta}</span>
                  </div>
                  <p className={styles.muted}>{item.note}</p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className={styles.muted}>{emptyLabel}</p>
        )}
      </section>
    );
  }

  const hasSentInvites = participants.length > 0;
  const hasReceivedInvites = receivedInvites.length > 0;
  const hasNoInvites = !loadingInvites && !hasSentInvites && !hasReceivedInvites && !inviteError;
  const pendingReceivedInvites = receivedInvites.filter((invite) => invite.status === "pending");
  const showingReceived = activeInviteTab === "received";

  return (
    <div className={styles.stack}>
      {loadingInvites ? (
        <section className={styles.panel}>
          <p className={styles.muted}>Loading trip invites...</p>
        </section>
      ) : null}

      {inviteError ? (
        <section className={styles.panel}>
          <p className={styles.formError}>{inviteError}</p>
        </section>
      ) : null}

      {hasNoInvites ? (
        <section className={styles.panel}>
          <div className={styles.emptyState}>
            <h3>No trip invites yet.</h3>
            <p>When you send a traveller invite or receive one, it will appear here.</p>
          </div>
        </section>
      ) : null}

      <section className={styles.panel}>
        <div className={styles.sectionTop}>
          <div>
            <p className={styles.eyebrow}>Trip invites</p>
            <h2>{showingReceived ? "Invites for you to review" : "Invites you’ve sent"}</h2>
          </div>
          <span className={showingReceived ? styles.badgeSoft : styles.badge}>
            {showingReceived ? receivedInvites.length : participants.length} total
          </span>
        </div>

        <div className={styles.inviteTabs}>
          <button
            type="button"
            className={showingReceived ? styles.inviteTabActive : styles.inviteTab}
            onClick={() => setActiveInviteTab("received")}
          >
            For you
            <span className={styles.badgeSoft}>{pendingReceivedInvites.length}</span>
          </button>
          <button
            type="button"
            className={!showingReceived ? styles.inviteTabActive : styles.inviteTab}
            onClick={() => setActiveInviteTab("sent")}
          >
            Sent by you
            <span className={styles.badge}>{participants.length}</span>
          </button>
        </div>

        {showingReceived ? (
          hasReceivedInvites ? (
            <div className={styles.participantsList}>
              {receivedInvites.map((invite) => {
                const inviteTrip = findTrip(invite.trip_id);

                return (
                  <article
                    key={invite.id}
                    className={styles.participantCard}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      void openInvite(invite);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        void openInvite(invite);
                      }
                    }}
                  >
                    <div className={styles.rowTop}>
                      <span className={styles.rowTitle}>{inviteTrip?.title ?? "Trip invite"}</span>
                      <span className={invite.status === "pending" ? styles.badge : styles.badgeSoft}>
                        {invite.status}
                      </span>
                    </div>
                    <div className={styles.tripMetaRow}>
                      <span>{inviteTrip?.destination || "Destination to be confirmed"}</span>
                      <span>{invite.role}</span>
                      <span>{invite.email}</span>
                    </div>
                    {inviteTrip?.description ? <p className={styles.muted}>{inviteTrip.description}</p> : null}
                    {invite.responded_at ? (
                      <p className={styles.muted}>
                        Responded {new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(invite.responded_at))}
                      </p>
                    ) : null}
                    <p className={styles.listRowLinkHint}>
                      {invite.status === "pending" ? "Open invite to accept or decline" : "Open invite"}
                    </p>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className={styles.emptyState}>
              <h3>No invites waiting on you.</h3>
              <p>Any trip you’re invited to will show up here for you to open, review, and respond to.</p>
            </div>
          )
        ) : hasSentInvites ? (
          <div className={styles.participantsList}>
            {participants.map((participant) => {
              const inviteTrip = findTrip(participant.trip_id);

              return (
                <article key={participant.id} className={styles.participantCard}>
                  <div className={styles.rowTop}>
                    <span className={styles.rowTitle}>{participant.full_name || participant.email}</span>
                    <span className={styles.badge}>{participant.status}</span>
                  </div>
                  <div className={styles.tripMetaRow}>
                    <span>{participant.email}</span>
                    <span>{inviteTrip?.title ?? "Trip"}</span>
                    <span>{participant.role}</span>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <h3>No invites sent yet.</h3>
            <p>Once you invite travellers to one of your trips, they’ll appear here so you can track who has been invited.</p>
          </div>
        )}
      </section>

      {selectedInvite ? (
        <div className={styles.modalOverlay} onClick={closeInviteModal}>
          <div className={styles.modalCard} onClick={(event) => event.stopPropagation()}>
            <div className={styles.sectionTop}>
              <div>
                <p className={styles.eyebrow}>Trip invite</p>
                <h2>{findTrip(selectedInvite.trip_id)?.title ?? "Trip invite"}</h2>
              </div>
              <button
                type="button"
                className={styles.secondaryAction}
                onClick={closeInviteModal}
              >
                Close
              </button>
            </div>

            <div className={styles.tripPanel}>
              {selectedInviteTrip ? (
                <section className={`${styles.tripBuilderCard} ${styles.tripBuilderCardNoFade}`}>
                  <div className={styles.tripImagePreviewWrap}>
                    {selectedInviteTrip.cover_image_url ? (
                      <div className={styles.imagePreviewCard}>
                        <img
                          src={selectedInviteTrip.cover_image_url}
                          alt={selectedInviteTrip.title}
                          className={styles.imagePreview}
                        />
                      </div>
                    ) : (
                      <div className={styles.tripImagePlaceholder}>
                        <div className={styles.tripImagePlaceholderCopy}>
                          <p className={styles.tripImageMetaPlaceholder}>Trip invite</p>
                          <h3 className={styles.tripImagePlaceholderTitle}>
                            {selectedInviteTrip.destination || selectedInviteTrip.title}
                          </h3>
                          <p className={styles.tripImagePlaceholderBody}>
                            Open the invite and explore what the organiser has already planned.
                          </p>
                        </div>
                      </div>
                    )}

                    <div className={styles.tripImageTextOverlay}>
                      <p className={styles.tripImageMeta}>Trip invite</p>
                      <h3 className={styles.tripImageTitle}>{selectedInviteTrip.title}</h3>
                      <p className={styles.tripImageSubtitle}>
                        {selectedInviteTrip.description || "The organiser has already started shaping this trip for you."}
                      </p>
                    </div>
                  </div>

                  <div className={styles.tripBuilderBody}>
                    <section className={styles.participantCard}>
                      <div className={styles.tripInfoGrid}>
                        <div className={styles.tripFact}>
                          <span className={styles.tripFactLabel}>Destination</span>
                          <strong>{selectedInviteTrip.destination || "To be confirmed"}</strong>
                        </div>
                        <div className={styles.tripFact}>
                          <span className={styles.tripFactLabel}>Dates</span>
                          <strong>{formatTripDateRange(selectedInviteTrip.starts_at, selectedInviteTrip.ends_at)}</strong>
                        </div>
                        <div className={styles.tripFact}>
                          <span className={styles.tripFactLabel}>Invite status</span>
                          <strong>{selectedInvite.status}</strong>
                        </div>
                        <div className={styles.tripFact}>
                          <span className={styles.tripFactLabel}>Role</span>
                          <strong>{selectedInvite.role}</strong>
                        </div>
                      </div>
                    </section>

                    {renderInviteSummaryCard(
                      "Hotels selected",
                      inviteHotels?.length ?? 0,
                      "No hotel selections yet.",
                      (inviteHotels ?? []).map((hotel) => ({
                        id: hotel.id,
                        title: hotel.name,
                        meta: hotel.location || "Location to be confirmed",
                        note: hotel.notes || "Selected hotel option",
                        image: hotel.source_photo_url,
                      })),
                    )}

                    {renderInviteSummaryCard(
                      "Activities selected",
                      inviteActivities?.length ?? 0,
                      "No activity selections yet.",
                      (inviteActivities ?? []).map((activity) => ({
                        id: activity.id,
                        title: activity.title,
                        meta: activity.location || "Location to be confirmed",
                        note: activity.notes || "Selected activity option",
                        image: activity.source_photo_url,
                      })),
                    )}

                    {renderInviteSummaryCard(
                      "Transport selected",
                      inviteTransport?.length ?? 0,
                      "No transport selections yet.",
                      (inviteTransport ?? []).map((transport) => ({
                        id: transport.id,
                        title: transport.mode,
                        meta:
                          [transport.departure_location, transport.arrival_location]
                            .filter(Boolean)
                            .join(" to ") || "Route to be confirmed",
                        note: transport.notes || "Selected transport option",
                        image: transport.source_photo_url,
                      })),
                    )}

                    {renderInviteSummaryCard(
                      "Dining selected",
                      inviteDining?.length ?? 0,
                      "No dining selections yet.",
                      (inviteDining ?? []).map((dining) => ({
                        id: dining.id,
                        title: dining.name,
                        meta: dining.location || "Location to be confirmed",
                        note: dining.notes || "Selected dining option",
                        image: dining.source_photo_url,
                      })),
                    )}

                    <section className={`${styles.participantCard} ${styles.inviteResponseCard}`}>
                      <div className={styles.sectionTop}>
                        <div>
                          <p className={styles.eyebrow}>Your response</p>
                          <h2>Respond to this invite</h2>
                        </div>
                      </div>

                      <label className={styles.field}>
                        <span>Reason or note</span>
                        <textarea
                          value={responseReason}
                          onChange={(event) => setResponseReason(event.target.value)}
                          placeholder="Add a reason, note, or message for the organiser"
                          rows={4}
                        />
                      </label>

                      {selectedInvite.response_reason ? (
                        <div className={styles.callout}>
                          <p className={styles.eyebrow}>Current response</p>
                          <p>{selectedInvite.response_reason}</p>
                        </div>
                      ) : null}

                      {responseError ? <p className={styles.formError}>{responseError}</p> : null}

                      <div className={styles.inlineActions}>
                        <button
                          type="button"
                          className={styles.secondaryAction}
                          onClick={() => void handleTestWebhook("accepted")}
                          disabled={Boolean(testingWebhook) || respondingInviteId === selectedInvite.id}
                        >
                          {testingWebhook === "accepted" ? "Sending test..." : "Test accept webhook"}
                        </button>
                        <button
                          type="button"
                          className={styles.secondaryAction}
                          onClick={() => void handleTestWebhook("declined")}
                          disabled={Boolean(testingWebhook) || respondingInviteId === selectedInvite.id}
                        >
                          {testingWebhook === "declined" ? "Sending test..." : "Test decline webhook"}
                        </button>
                      </div>

                      <div className={styles.inlineActions}>
                        <button
                          type="button"
                          className={styles.primaryAction}
                          onClick={() => void handleInviteResponse("accepted")}
                          disabled={respondingInviteId === selectedInvite.id}
                        >
                          {respondingInviteId === selectedInvite.id ? "Sending..." : "Accept invite"}
                        </button>
                        <button
                          type="button"
                          className={styles.secondaryAction}
                          onClick={() => void handleInviteResponse("declined")}
                          disabled={respondingInviteId === selectedInvite.id}
                        >
                          Decline invite
                        </button>
                      </div>
                    </section>
                  </div>
                </section>
              ) : null}

              {loadingInviteDetail ? (
                <section className={styles.panel}>
                  <p className={styles.muted}>Loading trip preview...</p>
                </section>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function TripInvitesPage() {
  return (
    <AppShell
      kicker="Trip invites"
      title="Trip invites."
      intro="See invites you have sent as an organiser and trips you have been invited to as a traveller."
    >
      {(state) => <TripInvitesManager {...state} />}
    </AppShell>
  );
}
