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

type TripAccessRole = "organiser" | "participant";

type HotelSelection = {
  id: string;
  name: string;
  location: string | null;
  notes: string | null;
  source_photo_url: string | null;
};

type ActivitySelection = {
  id: string;
  title: string;
  location: string | null;
  notes: string | null;
  source_photo_url: string | null;
};

type TransportSelection = {
  id: string;
  mode: string;
  departure_location: string | null;
  arrival_location: string | null;
  notes: string | null;
  source_photo_url: string | null;
};

type DiningSelection = {
  id: string;
  name: string;
  location: string | null;
  notes: string | null;
  source_photo_url: string | null;
};

type CategoryKey = "hotels" | "activities" | "transport" | "dining";

type VoteCategoryState = {
  title: string;
  voterCount: number;
  eligibleVoterCount: number;
  progress: number;
  itemVotes: Record<string, { votes: number; voterIds: string[] }>;
};

type VotingState = Record<CategoryKey, VoteCategoryState>;

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
  const [votingError, setVotingError] = useState<string | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
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
  const [accessRole, setAccessRole] = useState<TripAccessRole>("organiser");
  const [hotels, setHotels] = useState<HotelSelection[]>([]);
  const [activities, setActivities] = useState<ActivitySelection[]>([]);
  const [transport, setTransport] = useState<TransportSelection[]>([]);
  const [dining, setDining] = useState<DiningSelection[]>([]);
  const [voting, setVoting] = useState<VotingState | null>(null);
  const [submittingVoteKey, setSubmittingVoteKey] = useState<string | null>(null);

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
      setCurrentUserId(user?.id ?? null);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) {
        return;
      }

      if (!session?.access_token) {
        setTripError("You need to be signed in before viewing this trip.");
        setTrip(null);
        setLoadingTrip(false);
        return;
      }

      const response = await fetch(`/api/trips/${tripId}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const result = (await response.json()) as {
        trip?: TripDetail;
        participants?: TripParticipant[];
        hotels?: HotelSelection[];
        activities?: ActivitySelection[];
        transport?: TransportSelection[];
        dining?: DiningSelection[];
        accessRole?: TripAccessRole;
        error?: string;
      };

      if (!mounted) {
        return;
      }

      if (!response.ok || !result.trip) {
        setTripError(result.error || "Unable to load this trip.");
        setTrip(null);
        setParticipants([]);
        setHotels([]);
        setActivities([]);
        setTransport([]);
        setDining([]);
        setParticipantsError(null);
        setLoadingTrip(false);
        return;
      }

      setTrip(result.trip);
      setParticipants(result.participants ?? []);
      setHotels(result.hotels ?? []);
      setActivities(result.activities ?? []);
      setTransport(result.transport ?? []);
      setDining(result.dining ?? []);
      setParticipantsError(null);
      setAccessRole(result.accessRole ?? "participant");

      const votingResponse = await fetch(`/api/trips/${tripId}/voting`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const votingResult = (await votingResponse.json()) as {
        categories?: VotingState;
        error?: string;
      };

      if (!mounted) {
        return;
      }

      if (!votingResponse.ok) {
        setVoting(null);
        setVotingError(votingResult.error || "Unable to load voting.");
        setLoadingTrip(false);
        return;
      }

      setVoting(votingResult.categories ?? null);
      setVotingError(null);
      setLoadingTrip(false);
    }

    void loadTrip();

    return () => {
      mounted = false;
    };
  }, [tripId]);

  const tripTitle = loadingTrip ? "Loading trip..." : trip?.title || "Trip";
  const completedSections = [hotels.length, activities.length, transport.length, dining.length].filter(
    (count) => count > 0,
  ).length;
  const overallProgress = voting
    ? Math.round(
        planningCategories.reduce((sum, category) => sum + (voting[category.key as CategoryKey]?.progress ?? 0), 0) /
          planningCategories.length,
      )
    : Math.round((completedSections / planningCategories.length) * 100);

  async function handleVote(category: CategoryKey, entityId: string) {
    if (!tripId) {
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setVotingError("You need to be signed in before voting.");
      return;
    }

    const voteKey = `${category}-${entityId}`;
    setSubmittingVoteKey(voteKey);
    setVotingError(null);

    const response = await fetch(`/api/trips/${tripId}/voting`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ category, entityId }),
    });

    const result = (await response.json()) as {
      categories?: VotingState;
      error?: string;
    };

    if (!response.ok) {
      setVotingError(result.error || "Unable to save your vote.");
      setSubmittingVoteKey(null);
      return;
    }

    setVoting(result.categories ?? null);
    setSubmittingVoteKey(null);
  }

  function renderSelectionSection(
    category: CategoryKey,
    title: string,
    items: Array<{
      id: string;
      title: string;
      meta: string;
      note: string;
      image?: string | null;
    }>,
    emptyMessage: string,
  ) {
    const votingState = voting?.[category];

    return (
      <section className={styles.panel}>
        <div className={styles.sectionTop}>
          <div>
            <p className={styles.eyebrow}>Trip plan</p>
            <h2>{title}</h2>
          </div>
          <div className={styles.headerActions}>
            {votingState ? (
              <span className={styles.badgeSoft}>
                {votingState.voterCount}/{votingState.eligibleVoterCount} voted
              </span>
            ) : null}
            <span className={styles.badgeSoft}>{items.length} selected</span>
          </div>
        </div>

        {votingState ? (
          <div className={styles.voteSectionHeader}>
            <div className={styles.progressBar}>
              <span
                className={`${styles.progressFill} ${styles.progressFillBlue}`}
                style={{ width: `${votingState.progress}%` }}
              >
                {votingState.progress}%
              </span>
            </div>
            <p className={styles.progressMeta}>
              {votingState.voterCount} of {votingState.eligibleVoterCount} participants have voted on {title.toLowerCase()}.
            </p>
          </div>
        ) : null}

        {items.length ? (
          <div className={styles.selectionSummaryGrid}>
            {items.map((item) => (
              <article key={item.id} className={styles.selectionSummaryCard}>
                {item.image ? (
                  <img src={item.image} alt={item.title} className={styles.selectionSummaryImage} />
                ) : (
                  <div className={styles.selectionSummaryImageFallback} />
                )}
                <div className={styles.selectionSummaryBody}>
                  <strong>{item.title}</strong>
                  <small>{item.meta}</small>
                  <p>{item.note}</p>
                  <div className={styles.voteCardFooter}>
                    <span className={styles.voteCount}>
                      {votingState?.itemVotes[item.id]?.votes ?? 0} vote
                      {(votingState?.itemVotes[item.id]?.votes ?? 0) === 1 ? "" : "s"}
                    </span>
                    <button
                      type="button"
                      className={styles.secondaryAction}
                      onClick={() => void handleVote(category, item.id)}
                      disabled={submittingVoteKey === `${category}-${item.id}`}
                    >
                      {submittingVoteKey === `${category}-${item.id}`
                        ? "Saving..."
                        : currentUserId &&
                            (votingState?.itemVotes[item.id]?.voterIds ?? []).includes(currentUserId)
                          ? "Remove vote"
                          : "Vote"}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <p>{emptyMessage}</p>
          </div>
        )}
      </section>
    );
  }

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
          {accessRole === "organiser" && trip?.status === "draft" ? (
            <button
              type="button"
              className={styles.primaryAction}
              onClick={handlePublishTrip}
              disabled={isPublishing}
            >
              {isPublishing ? "Publishing..." : "Publish trip"}
            </button>
          ) : null}
          {accessRole === "organiser" && trip?.status === "draft" ? (
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
                        <span className={styles.badge}>
                          {accessRole === "participant" ? "participant" : trip.status}
                        </span>
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

              {accessRole === "organiser" ? (
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
              ) : null}

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
	                  <p className={styles.progressMeta}>{completedSections} of 4 planning sections have selections</p>
	                  <p className={styles.progressMeta}>
	                    Voting progress updates as participants vote on the options below.
	                  </p>
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
	                            style={{ width: `${voting?.[category.key as CategoryKey]?.progress ?? 0}%` }}
	                          />
	                        </div>
		                        <p className={styles.progressMeta}>
		                          {voting?.[category.key as CategoryKey]
		                            ? `${voting[category.key as CategoryKey].voterCount}/${voting[category.key as CategoryKey].eligibleVoterCount} participants voted`
		                            : "Voting not loaded yet"}
		                        </p>
	                      </div>
	                    ))}
	                  </div>
	                </div>

	                <div className={styles.nextActionCard}>
	                  <p className={styles.eyebrow}>Next action</p>
	                  <p className={styles.nextActionText}>
	                    Ask the group to vote on hotels, activities, transport, and dining below.
	                  </p>
	                </div>
                  {votingError ? <p className={styles.formError}>{votingError}</p> : null}
	              </section>

	                {renderSelectionSection(
	                  "hotels",
	                  "Hotels",
                  hotels.map((hotel) => ({
                    id: hotel.id,
                    title: hotel.name,
                    meta: hotel.location || "Location to be confirmed",
                    note: hotel.notes || "Selected hotel option",
                    image: hotel.source_photo_url,
                  })),
                  "No hotels have been added to this trip yet.",
                )}

	                {renderSelectionSection(
	                  "activities",
	                  "Activities",
                  activities.map((activity) => ({
                    id: activity.id,
                    title: activity.title,
                    meta: activity.location || "Location to be confirmed",
                    note: activity.notes || "Selected activity option",
                    image: activity.source_photo_url,
                  })),
                  "No activities have been added to this trip yet.",
                )}

	                {renderSelectionSection(
	                  "transport",
	                  "Transport",
                  transport.map((item) => ({
                    id: item.id,
                    title: item.mode,
                    meta:
                      [item.departure_location, item.arrival_location].filter(Boolean).join(" to ") ||
                      "Route to be confirmed",
                    note: item.notes || "Selected transport option",
                    image: item.source_photo_url,
                  })),
                  "No transport has been added to this trip yet.",
                )}

	                {renderSelectionSection(
	                  "dining",
	                  "Dining",
                  dining.map((item) => ({
                    id: item.id,
                    title: item.name,
                    meta: item.location || "Location to be confirmed",
                    note: item.notes || "Selected dining option",
                    image: item.source_photo_url,
                  })),
                  "No dining spots have been added to this trip yet.",
                )}
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
