"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { TripUpgradeModal } from "@/components/trip-upgrade-modal";
import { supabase } from "@/lib/supabase/client";
import styles from "@/components/app-page.module.css";

type TripDetail = {
  id: string;
  title: string;
  destination: string | null;
  description: string | null;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  cover_image_url: string | null;
  created_at?: string | null;
};

type Plan = "free" | "pro_organiser";

type TripParticipant = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  status: string;
};

const planningCategories = [
  { key: "hotels", label: "Hotels", emoji: "🏨", progress: 80, colorClass: "progressFillBlue" },
  {
    key: "activities",
    label: "Activities",
    emoji: "🎟️",
    progress: 40,
    colorClass: "progressFillOrange",
  },
  {
    key: "transport",
    label: "Transport",
    emoji: "✈️",
    progress: 70,
    colorClass: "progressFillPurple",
  },
  { key: "dining", label: "Dining", emoji: "🍽️", progress: 50, colorClass: "progressFillGreen" },
];

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

export default function TripDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const tripId = params?.id;
  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [loadingTrip, setLoadingTrip] = useState(true);
  const [tripError, setTripError] = useState<string | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [plan, setPlan] = useState<Plan>("free");
  const [publishGateMessage, setPublishGateMessage] = useState<string | null>(null);
  const [participants, setParticipants] = useState<TripParticipant[]>([]);
  const [participantsError, setParticipantsError] = useState<string | null>(null);
  const [participantName, setParticipantName] = useState("");
  const [participantEmail, setParticipantEmail] = useState("");
  const [isInviting, setIsInviting] = useState(false);
  const [participantGateMessage, setParticipantGateMessage] = useState<string | null>(null);
  const [showParticipantUpgradeModal, setShowParticipantUpgradeModal] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadTrip() {
      if (!tripId) {
        return;
      }

      setLoadingTrip(true);
      setTripError(null);
      setPublishGateMessage(null);
      setParticipantGateMessage(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!mounted) {
        return;
      }

      setPlan(user?.user_metadata?.plan === "pro_organiser" ? "pro_organiser" : "free");
      setCurrentUserEmail(user?.email ?? "");

      const { data: participantRows, error: participantsFetchError } = await supabase
        .from("trip_participants")
        .select("id, email, full_name, role, status")
        .eq("trip_id", tripId)
        .order("created_at", { ascending: true });

      if (!mounted) {
        return;
      }

      if (participantsFetchError) {
        setParticipants([]);
        setParticipantsError(participantsFetchError.message);
      } else {
        setParticipants((participantRows ?? []) as TripParticipant[]);
        setParticipantsError(null);
      }

      const { data, error } = await supabase
        .from("trips")
        .select(
          "id, title, destination, description, status, starts_at, ends_at, cover_image_url, created_at",
        )
        .eq("id", tripId)
        .single();

      if (!mounted) {
        return;
      }

      if (error) {
        setTripError(error.message);
        setTrip(null);
        setLoadingTrip(false);
        return;
      }

      setTrip(data as TripDetail);
      setLoadingTrip(false);
    }

    void loadTrip();

    return () => {
      mounted = false;
    };
  }, [tripId]);

  const tripTitle = loadingTrip ? "Loading trip..." : trip?.title || "Trip";
  const overallProgress = 60;

  async function handleDeleteTrip() {
    if (!trip || trip.status !== "draft") {
      return;
    }

    const confirmed = window.confirm(
      `Delete "${trip.title}"? This draft trip will be removed.`,
    );

    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    setTripError(null);

    const { error } = await supabase.from("trips").delete().eq("id", trip.id);

    if (error) {
      setTripError(error.message);
      setIsDeleting(false);
      return;
    }

    router.push("/trips");
    router.refresh();
  }

  async function handlePublishTrip() {
    if (!trip || trip.status !== "draft") {
      return;
    }

    if (plan === "free") {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setTripError("You need to be signed in before publishing a trip.");
        return;
      }

      const { count, error: countError } = await supabase
        .from("trips")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", user.id)
        .eq("status", "active");

      if (countError) {
        setTripError(countError.message);
        return;
      }

      if ((count ?? 0) >= 1) {
        setPublishGateMessage(
          "Free plan organisers can only have one published trip at a time. Upgrade to Pro or use a Trip Pass to publish another.",
        );
        return;
      }
    }

    setIsPublishing(true);
    setTripError(null);
    setPublishGateMessage(null);

    const { data, error } = await supabase
      .from("trips")
      .update({ status: "active" })
      .eq("id", trip.id)
      .select(
        "id, title, destination, description, status, starts_at, ends_at, cover_image_url, created_at",
      )
      .single();

    if (error) {
      setTripError(error.message);
      setIsPublishing(false);
      return;
    }

    setTrip(data as TripDetail);
    setIsPublishing(false);
  }

  async function handleInviteParticipant(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!trip) {
      return;
    }

    if (plan === "free" && participants.length >= 5) {
      setParticipantGateMessage(
        "Free plan organisers can invite up to 5 travellers per trip. Upgrade to Pro organiser or use a Trip Pass to invite more.",
      );
      setShowParticipantUpgradeModal(true);
      return;
    }

    if (!participantEmail.trim()) {
      setParticipantsError("Traveller email is required.");
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setParticipantsError("You need to be signed in before inviting travellers.");
      return;
    }

    setIsInviting(true);
    setParticipantsError(null);
    setParticipantGateMessage(null);

    const { data, error } = await supabase
      .from("trip_participants")
      .insert({
        trip_id: trip.id,
        inviter_id: user.id,
        email: participantEmail.trim().toLowerCase(),
        full_name: participantName.trim() || null,
        role: "traveller",
        status: "invited",
      })
      .select("id, email, full_name, role, status")
      .single();

    if (error) {
      setParticipantsError(error.message);
      setIsInviting(false);
      return;
    }

    setParticipants((current) => [...current, data as TripParticipant]);
    setParticipantName("");
    setParticipantEmail("");

    const response = await fetch("/api/travellers/invite", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: participantEmail.trim().toLowerCase(),
        fullName: participantName.trim(),
        tripTitle: trip.title,
        tripId: trip.id,
        origin: window.location.origin,
      }),
    });

    if (!response.ok) {
      const inviteResult = (await response.json()) as { error?: string };
      setParticipantsError(
        inviteResult.error
          ? `Traveller added, but invite email failed: ${inviteResult.error}`
          : "Traveller added, but invite email failed.",
      );
      setIsInviting(false);
      return;
    }

    setIsInviting(false);
  }

  return (
    <AppShell
      kicker="Trip"
      title={tripTitle}
      intro="This is the trip view. It gives you the cover image, key trip details, and a starting point for the rest of the organiser workflow."
      headerAction={
        <div className={styles.headerActions}>
          {trip?.status === "draft" ? (
            <button
              type="button"
              className={styles.primaryAction}
              onClick={handlePublishTrip}
              disabled={isPublishing}
            >
              {isPublishing ? "Publishing..." : "Publish trip"}
            </button>
          ) : null}
          {trip?.status === "draft" ? (
            <button
              type="button"
              className={styles.dangerAction}
              onClick={handleDeleteTrip}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete draft"}
            </button>
          ) : null}
          <Link href="/trips" className={styles.secondaryActionLink}>
            Back to trips
          </Link>
        </div>
      }
    >
      {() => (
        <div className={styles.stack}>
          {tripError ? (
            <section className={styles.panel}>
              <div className={styles.emptyState}>
                <p>Unable to load this trip: {tripError}</p>
              </div>
            </section>
          ) : null}

          {publishGateMessage ? (
            <section className={styles.panel}>
              <div className={styles.publishGateCard}>
                <p className={styles.publishGateTitle}>Publish limit reached</p>
                <p className={styles.publishGateCopy}>{publishGateMessage}</p>
                <div className={styles.headerActions}>
                  <Link href="/signup/pro-organiser" className={styles.primaryActionLink}>
                    Upgrade to Pro
                  </Link>
                  <Link href="/signup/trip-pass" className={styles.secondaryActionLink}>
                    Use Trip Pass £39
                  </Link>
                </div>
              </div>
            </section>
          ) : null}

          {!tripError && trip ? (
            <>
              <section className={styles.panel}>
                <div className={styles.tripDetailHero}>
                  {trip.cover_image_url ? (
                    <div className={styles.tripDetailMedia}>
                      <img
                        src={trip.cover_image_url}
                        alt={trip.title}
                        className={styles.tripDetailImage}
                      />
                      <div className={styles.tripImageFacts}>
                        <div className={styles.tripFact}>
                          <span className={styles.tripFactLabel}>Destination</span>
                          <strong>{trip.destination || "To be confirmed"}</strong>
                        </div>
                        <div className={styles.tripFact}>
                          <span className={styles.tripFactLabel}>Dates</span>
                          <strong>{formatTripDateRange(trip.starts_at, trip.ends_at)}</strong>
                        </div>
                        <div className={styles.tripFact}>
                          <span className={styles.tripFactLabel}>Status</span>
                          <strong>{trip.status}</strong>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className={styles.tripDetailMedia}>
                      <div className={styles.tripDetailImageFallback} />
                      <div className={styles.tripImageFacts}>
                        <div className={styles.tripFact}>
                          <span className={styles.tripFactLabel}>Destination</span>
                          <strong>{trip.destination || "To be confirmed"}</strong>
                        </div>
                        <div className={styles.tripFact}>
                          <span className={styles.tripFactLabel}>Dates</span>
                          <strong>{formatTripDateRange(trip.starts_at, trip.ends_at)}</strong>
                        </div>
                        <div className={styles.tripFact}>
                          <span className={styles.tripFactLabel}>Status</span>
                          <strong>{trip.status}</strong>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className={styles.tripDetailBody}>
                    <div className={styles.rowTop}>
                      <span className={styles.rowTitle}>{trip.title}</span>
                      <span className={styles.badge}>{trip.status}</span>
                    </div>
                    <div className={styles.tripMetaRow}>
                      <span>{trip.destination || "Destination to be confirmed"}</span>
                      <span>{formatTripDateRange(trip.starts_at, trip.ends_at)}</span>
                    </div>
                    <p className={styles.muted}>
                      {trip.description || "No trip summary added yet."}
                    </p>

                    <div className={styles.tripInfoGrid}>
                      <div className={styles.infoCard}>
                        <span className={styles.tripFactLabel}>Group size</span>
                        <strong>6 travellers</strong>
                        <p className={styles.muted}>Current organiser placeholder until guests are connected.</p>
                      </div>
                      <div className={styles.infoCard}>
                        <span className={styles.tripFactLabel}>Budget band</span>
                        <strong>Mid-range</strong>
                        <p className={styles.muted}>Use this later to filter hotels, dining, and activities.</p>
                      </div>
                      <div className={styles.infoCard}>
                        <span className={styles.tripFactLabel}>Hub link</span>
                        <strong>Shared planning hub</strong>
                        <p className={styles.muted}>This is where guests will eventually enter to vote and comment.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className={styles.panel}>
                <div className={styles.sectionTop}>
                  <div>
                    <p className={styles.eyebrow}>Travellers</p>
                    <h2>Invite participants</h2>
                  </div>
                  <div className={styles.headerActions}>
                    {plan === "free" ? (
                      <span className={styles.badge}>
                        {participants.length}/5 participants
                      </span>
                    ) : null}
                    <span className={styles.badgeSoft}>{participants.length} invited</span>
                  </div>
                </div>

                <form className={styles.inviteForm} onSubmit={handleInviteParticipant}>
                  <div className={styles.formGrid}>
                    <label className={styles.field}>
                      <span>Traveller name</span>
                      <input
                        value={participantName}
                        onChange={(event) => setParticipantName(event.target.value)}
                        placeholder="Sophie Hall"
                      />
                    </label>
                    <label className={styles.field}>
                      <span>Traveller email</span>
                      <input
                        type="email"
                        value={participantEmail}
                        onChange={(event) => setParticipantEmail(event.target.value)}
                        placeholder="traveller@example.com"
                      />
                    </label>
                  </div>

                  {participantsError ? (
                    <p className={styles.formError}>{participantsError}</p>
                  ) : null}

                  <div className={styles.formActions}>
                    <button
                      type="submit"
                      className={styles.primaryAction}
                      disabled={isInviting}
                    >
                      {isInviting ? "Sending invite..." : "Invite traveller"}
                    </button>
                  </div>
                </form>

                <div className={styles.participantsList}>
                  {participants.length === 0 ? (
                    <div className={styles.emptyState}>
                      <p>No travellers invited yet.</p>
                    </div>
                  ) : (
                    participants.map((participant) => (
                      <article key={participant.id} className={styles.participantCard}>
                        <div className={styles.rowTop}>
                          <span className={styles.rowTitle}>
                            {participant.full_name || participant.email}
                          </span>
                          <span className={styles.badge}>
                            {participant.status}
                          </span>
                        </div>
                        <div className={styles.tripMetaRow}>
                          <span>{participant.email}</span>
                          <span>{participant.role}</span>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </section>

              <section className={styles.progressPanel}>
                <div className={styles.progressSection}>
                  <h2>Overall Planning Progress</h2>
                  <div className={styles.progressBar}>
                    <span
                      className={`${styles.progressFill} ${styles.progressFillGreen}`}
                      style={{ width: `${overallProgress}%` }}
                    >
                      {overallProgress}%
                    </span>
                  </div>
                  <p className={styles.progressMeta}>3 of 5 travel decisions completed</p>
                </div>

                <div className={styles.progressSection}>
                  <h2>Planning Categories</h2>

                  <div className={styles.progressCategoryList}>
                    {planningCategories.map((category) => (
                      <div key={category.key} className={styles.progressCategory}>
                        <div className={styles.progressCategoryLabel}>
                          <span>{category.emoji}</span>
                          <span>{category.label}</span>
                        </div>
                        <div className={styles.progressBar}>
                          <span
                            className={`${styles.progressFill} ${
                              styles[category.colorClass as keyof typeof styles]
                            }`}
                            style={{ width: `${category.progress}%` }}
                          />
                        </div>
                        <p className={styles.progressMeta}>{category.progress}% decided</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className={styles.nextActionCard}>
                  <p className={styles.eyebrow}>Next action</p>
                  <p className={styles.nextActionText}>
                    Ask the group to vote on activities to move this category forward.
                  </p>
                </div>
              </section>
            </>
          ) : null}

          {loadingTrip ? (
            <section className={styles.panel}>
              <div className={styles.emptyState}>
                <p>Loading trip details...</p>
              </div>
            </section>
          ) : null}

          <TripUpgradeModal
            open={showParticipantUpgradeModal}
            email={currentUserEmail}
            tripId={trip?.id || ""}
            onClose={() => setShowParticipantUpgradeModal(false)}
          />
        </div>
      )}
    </AppShell>
  );
}
