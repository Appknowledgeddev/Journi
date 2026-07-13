"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { TripUpgradeModal } from "@/components/trip-upgrade-modal";
import { TripVotePie } from "@/components/trip-vote-pie";
import { supabase } from "@/lib/supabase/client";
import styles from "@/components/app-page.module.css";
import {
  type ActivitySelection,
  buildVoteChartData,
  type CategoryKey,
  type DiningSelection,
  formatTripDateRange,
  getVoteSummary,
  getTripStatusLabel,
  type HotelSelection,
  planningCategories,
  summariseTripWorkspace,
  type TransportSelection,
  type TripAccessRole,
  type TripDetail,
  type TripParticipant,
  type TripSectionKey,
  type VotingState,
} from "../trip-workspace-shared";

type Plan = "free" | "pro_organiser";

type DiscussionComment = {
  id: string;
  parentCommentId: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
  authorId: string | null;
  authorName: string;
  authorEmail: string | null;
  canDelete: boolean;
};

const validSections: TripSectionKey[] = [
  "destinations",
  "dates",
  "budget",
  "accommodation",
  "activities",
  "discussion",
  "expenses",
  "settings",
];

const sectionMeta: Record<
  TripSectionKey,
  { eyebrow: string; title: string; description: string }
> = {
  destinations: {
    eyebrow: "Destinations",
    title: "Destinations",
    description: "A fuller view of where the trip is centered and how the route is taking shape.",
  },
  dates: {
    eyebrow: "Dates",
    title: "Dates",
    description: "Travel window, planning timing, and the trip rhythm in one place.",
  },
  budget: {
    eyebrow: "Budget",
    title: "Budget",
    description: "Planning progress, vote totals, and section-level momentum across the trip.",
  },
  accommodation: {
    eyebrow: "Accommodation",
    title: "Accommodation",
    description: "The fuller hotel list, voting breakdown, and current stay preferences.",
  },
  activities: {
    eyebrow: "Activities",
    title: "Activities",
    description: "The full shortlist of experiences and the supporting trip flow around them.",
  },
  discussion: {
    eyebrow: "Discussion",
    title: "Discussion",
    description: "Organiser updates, guest replies, and the running conversation around the trip.",
  },
  expenses: {
    eyebrow: "Expenses",
    title: "Expenses",
    description: "How this trip connects to spending, payments, and cost visibility.",
  },
  settings: {
    eyebrow: "Settings",
    title: "Settings",
    description: "Manage access, state, and higher-level controls for this trip.",
  },
};

function formatFullDate(value: string | null) {
  if (!value) {
    return "To be confirmed";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

export default function TripSectionPageClient() {
  const params = useParams<{ id: string; section: string }>();
  const router = useRouter();
  const tripId = params?.id;
  const sectionParam = params?.section;
  const activeSection = validSections.includes(sectionParam as TripSectionKey)
    ? (sectionParam as TripSectionKey)
    : null;

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
  const [discussionComments, setDiscussionComments] = useState<DiscussionComment[]>([]);
  const [discussionError, setDiscussionError] = useState<string | null>(null);
  const [discussionBody, setDiscussionBody] = useState("");
  const [discussionReplyBody, setDiscussionReplyBody] = useState<Record<string, string>>({});
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [isSubmittingDiscussion, setIsSubmittingDiscussion] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);

  useEffect(() => {
    if (!activeSection && tripId) {
      router.replace(`/trips/${tripId}`);
    }
  }, [activeSection, router, tripId]);

  useEffect(() => {
    let mounted = true;

    async function loadTrip() {
      if (!tripId || !activeSection) {
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
        setLoadingTrip(false);
        return;
      }

      setTrip(result.trip);
      setParticipants(result.participants ?? []);
      setHotels(result.hotels ?? []);
      setActivities(result.activities ?? []);
      setTransport(result.transport ?? []);
      setDining(result.dining ?? []);
      setAccessRole(result.accessRole ?? "participant");

      const discussionResponse = await fetch(`/api/trips/${tripId}/discussion`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const discussionResult = (await discussionResponse.json()) as {
        comments?: DiscussionComment[];
        error?: string;
      };

      if (!mounted) {
        return;
      }

      if (!discussionResponse.ok) {
        setDiscussionComments([]);
        setDiscussionError(discussionResult.error || "Unable to load discussion.");
      } else {
        setDiscussionComments(discussionResult.comments ?? []);
        setDiscussionError(null);
      }

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
  }, [activeSection, tripId]);

  const completedSections = [hotels.length, activities.length, transport.length, dining.length].filter(
    (count) => count > 0,
  ).length;
  const overallProgress = voting
    ? Math.round(
        planningCategories.reduce((sum, category) => sum + (voting[category.key as CategoryKey]?.progress ?? 0), 0) /
          planningCategories.length,
      )
    : Math.round((completedSections / planningCategories.length) * 100);
  const hotelVoteSummary = getVoteSummary(voting?.hotels);
  const activityVoteSummary = getVoteSummary(voting?.activities);
  const transportVoteSummary = getVoteSummary(voting?.transport);
  const diningVoteSummary = getVoteSummary(voting?.dining);
  const planningVoteMix = useMemo(
    () => [
      { id: "hotels", label: "Hotels", value: hotelVoteSummary.votes },
      { id: "activities", label: "Activities", value: activityVoteSummary.votes },
      { id: "transport", label: "Transport", value: transportVoteSummary.votes },
      { id: "dining", label: "Dining", value: diningVoteSummary.votes },
    ],
    [activityVoteSummary.votes, diningVoteSummary.votes, hotelVoteSummary.votes, transportVoteSummary.votes],
  );
  const hotelVoteChart = useMemo(
    () => buildVoteChartData(hotels, voting?.hotels?.itemVotes, (hotel) => hotel.name),
    [hotels, voting?.hotels?.itemVotes],
  );
  const activityVoteChart = useMemo(
    () => buildVoteChartData(activities, voting?.activities?.itemVotes, (activity) => activity.title),
    [activities, voting?.activities?.itemVotes],
  );
  const transportVoteChart = useMemo(
    () => buildVoteChartData(transport, voting?.transport?.itemVotes, (option) => option.mode),
    [transport, voting?.transport?.itemVotes],
  );
  const diningVoteChart = useMemo(
    () => buildVoteChartData(dining, voting?.dining?.itemVotes, (option) => option.name),
    [dining, voting?.dining?.itemVotes],
  );
  const workspaceSummary = useMemo(
    () =>
      trip
        ? summariseTripWorkspace({
            trip,
            participants,
            planningCounts: {
              hotels: hotels.length,
              activities: activities.length,
              transport: transport.length,
              dining: dining.length,
            },
            planningProgress: overallProgress,
            voting,
            hotels,
            activities,
            transport,
            dining,
          })
        : null,
    [activities, dining, hotels, overallProgress, participants, transport, trip, voting],
  );

  const activeSectionMeta = activeSection ? sectionMeta[activeSection] : null;

  const activitySupportCount = transport.length + dining.length;
  const acceptedParticipants = workspaceSummary?.participantSummary.confirmed ?? 0;
  const invitedParticipants = workspaceSummary?.participantSummary.invited ?? 0;
  const inactiveParticipantNames = workspaceSummary?.participantSummary.inactiveUsers ?? [];

  const sectionHref = (sectionId: string) => `/trips/${tripId}/${sectionId}`;

  const planningSummaryCards = useMemo(
    () =>
      planningCategories.map((category) => ({
        key: category.key,
        label: category.label,
        emoji: category.emoji,
        progress: voting?.[category.key as CategoryKey]?.progress ?? 0,
        voters: voting?.[category.key as CategoryKey]?.voterCount ?? 0,
        eligible: voting?.[category.key as CategoryKey]?.eligibleVoterCount ?? 0,
        colorClass: category.colorClass,
      })),
    [voting],
  );

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

  async function submitDiscussionMessage(body: string, parentCommentId?: string | null) {
    if (!tripId) {
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setDiscussionError("You need to be signed in before posting.");
      return;
    }

    setIsSubmittingDiscussion(true);
    setDiscussionError(null);

    const response = await fetch(`/api/trips/${tripId}/discussion`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        body,
        parentCommentId: parentCommentId ?? null,
      }),
    });

    const result = (await response.json()) as {
      comment?: DiscussionComment;
      error?: string;
    };

    if (!response.ok || !result.comment) {
      setDiscussionError(result.error || "Unable to post message.");
      setIsSubmittingDiscussion(false);
      return;
    }

    setDiscussionComments((current) => [...current, result.comment as DiscussionComment]);
    setIsSubmittingDiscussion(false);
  }

  async function handlePostDiscussion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const message = discussionBody.trim();
    if (!message) {
      setDiscussionError("Message is required.");
      return;
    }

    await submitDiscussionMessage(message);
    setDiscussionBody("");
  }

  async function handleReply(event: React.FormEvent<HTMLFormElement>, commentId: string) {
    event.preventDefault();

    const message = discussionReplyBody[commentId]?.trim() ?? "";
    if (!message) {
      setDiscussionError("Reply is required.");
      return;
    }

    await submitDiscussionMessage(message, commentId);
    setDiscussionReplyBody((current) => ({ ...current, [commentId]: "" }));
    setReplyingToId(null);
  }

  async function handleDeleteDiscussion(commentId: string) {
    if (!tripId) {
      return;
    }

    const confirmed = window.confirm("Delete this message from the discussion?");
    if (!confirmed) {
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setDiscussionError("You need to be signed in before deleting messages.");
      return;
    }

    setDeletingCommentId(commentId);
    setDiscussionError(null);

    const response = await fetch(`/api/trips/${tripId}/discussion/${commentId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    const result = (await response.json()) as { error?: string };

    if (!response.ok) {
      setDiscussionError(result.error || "Unable to delete message.");
      setDeletingCommentId(null);
      return;
    }

    setDiscussionComments((current) =>
      current.filter((comment) => comment.id !== commentId && comment.parentCommentId !== commentId),
    );
    setDeletingCommentId(null);
  }

  const commentById = discussionComments.reduce<Record<string, DiscussionComment>>((accumulator, comment) => {
    accumulator[comment.id] = comment;
    return accumulator;
  }, {});
  const chronologicalDiscussion = [...discussionComments].sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );

  async function handlePublishTrip() {
    if (!trip || trip.status !== "draft") {
      return;
    }

    setIsPublishing(true);
    setTripError(null);
    setPublishGateMessage(null);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setTripError("You need to be signed in before publishing this trip.");
      setIsPublishing(false);
      return;
    }

    const response = await fetch(`/api/trips/${trip.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        action: "publish",
        origin: window.location.origin,
      }),
    });
    const result = (await response.json().catch(() => null)) as {
      error?: string;
      trip?: TripDetail;
      warning?: string;
    } | null;

    if (!response.ok || !result?.trip) {
      setTripError(result?.error || "Unable to publish this trip.");
      setIsPublishing(false);
      return;
    }

    setTrip((current) => (current ? { ...current, ...result.trip } : result.trip ?? null));
    setPublishGateMessage(result.warning ?? null);
    setIsPublishing(false);
  }

  async function handleTogglePublish() {
    if (!trip || accessRole !== "organiser") {
      return;
    }

    if (trip.status === "draft") {
      await handlePublishTrip();
      return;
    }

    if (trip.status === "active") {
      setPublishGateMessage("This trip is already published. Published trips cannot be returned to draft or deleted.");
    }
  }

  async function handleDeleteTrip() {
    if (!trip || trip.status !== "draft") {
      return;
    }

    const confirmed = window.confirm(`Delete "${trip.title}"? This draft trip will be removed.`);
    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    setTripError(null);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setTripError("You need to be signed in before deleting this draft.");
      setIsDeleting(false);
      return;
    }

    const response = await fetch(`/api/trips/${trip.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });
    const result = (await response.json().catch(() => null)) as { error?: string } | null;

    if (!response.ok) {
      setTripError(result?.error || "Unable to delete this draft trip.");
      setIsDeleting(false);
      return;
    }

    router.push("/trips");
    router.refresh();
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

    const nextParticipantEmail = participantEmail.trim().toLowerCase();
    const nextParticipantName = participantName.trim();
    const { data, error } = await supabase
      .from("trip_participants")
      .insert({
        trip_id: trip.id,
        inviter_id: user.id,
        email: nextParticipantEmail,
        full_name: nextParticipantName || null,
        role: "traveller",
        status: trip.status === "active" ? "invited" : "pending",
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

    if (trip.status !== "active") {
      setIsInviting(false);
      return;
    }

    const response = await fetch("/api/travellers/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: nextParticipantEmail,
        fullName: nextParticipantName,
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
      <section className={styles.tripWorkspaceSectionCard}>
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
              {votingState.voterCount} of {votingState.eligibleVoterCount} participants have voted on{" "}
              {title.toLowerCase()}.
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

  function renderSectionContent() {
    if (!activeSection || !trip) {
      return null;
    }

    switch (activeSection) {
      case "destinations":
        return (
          <section className={styles.tripWorkspaceSectionCard}>
            <div className={styles.tripWorkspaceCardGrid}>
              <div className={`${styles.infoCard} ${styles.infoCardCompact}`}>
                <span className={styles.tripFactLabel}>Primary destination</span>
                <strong>{trip.destination || "Destination to be confirmed"}</strong>
                <p className={styles.muted}>
                  This is the anchor destination for the workspace and the point the rest of the planning revolves around.
                </p>
              </div>
              <div className={`${styles.infoCard} ${styles.infoCardCompact}`}>
                <span className={styles.tripFactLabel}>Trip summary</span>
                <strong>{trip.title}</strong>
                <p className={styles.muted}>{trip.description || "No extra destination notes have been added yet."}</p>
              </div>
            </div>

            <div className={styles.tripWorkspaceCardGrid}>
              <div className={`${styles.infoCard} ${styles.infoCardCompact}`}>
                <span className={styles.tripFactLabel}>Route options</span>
                <strong>{transport.length} transport option{transport.length === 1 ? "" : "s"}</strong>
                <p className={styles.muted}>
                  {transport.length
                    ? transport.map((item) => item.mode).join(" • ")
                    : "No route options have been added yet."}
                </p>
              </div>
              <div className={`${styles.infoCard} ${styles.infoCardCompact}`}>
                <span className={styles.tripFactLabel}>Travel flow</span>
                <strong>{transport.length ? "Movement is being mapped" : "Movement still to be planned"}</strong>
                <p className={styles.muted}>
                  Arrival, departure, and internal movement decisions live here once the group starts shaping the route.
                </p>
              </div>
            </div>
          </section>
        );

      case "dates":
        return (
          <section className={styles.tripWorkspaceSectionCard}>
            <div className={styles.tripWorkspaceCardGrid}>
              <div className={`${styles.infoCard} ${styles.infoCardCompact}`}>
                <span className={styles.tripFactLabel}>Start date</span>
                <strong>{formatFullDate(trip.starts_at)}</strong>
                <p className={styles.muted}>The planned opening day for the trip.</p>
              </div>
              <div className={`${styles.infoCard} ${styles.infoCardCompact}`}>
                <span className={styles.tripFactLabel}>End date</span>
                <strong>{formatFullDate(trip.ends_at)}</strong>
                <p className={styles.muted}>The planned closing day for the trip.</p>
              </div>
            </div>
            <div className={styles.tripWorkspaceCardGrid}>
              <div className={`${styles.infoCard} ${styles.infoCardCompact}`}>
                <span className={styles.tripFactLabel}>Date range</span>
                <strong>{formatTripDateRange(trip.starts_at, trip.ends_at)}</strong>
                <p className={styles.muted}>This is the active travel window the group will be coordinating against.</p>
              </div>
              <div className={`${styles.infoCard} ${styles.infoCardCompact}`}>
                <span className={styles.tripFactLabel}>Planning momentum</span>
                <strong>{completedSections} planning areas started</strong>
                <p className={styles.muted}>As selections and votes come in, this timing view becomes more useful.</p>
                <div className={styles.tripMiniProgress}>
                  <span className={styles.tripMiniProgressFill} style={{ width: `${overallProgress}%` }} />
                </div>
              </div>
            </div>
          </section>
        );

      case "budget":
        return (
          <section className={styles.tripWorkspaceSectionCard}>
            <div className={styles.tripWorkspaceCardGrid}>
              <div className={`${styles.infoCard} ${styles.infoCardCompact}`}>
                <span className={styles.tripFactLabel}>Overall progress</span>
                <strong>{overallProgress}% planned</strong>
                <p className={styles.muted}>
                  {completedSections} of 4 core planning areas already have live selections.
                </p>
                <div className={styles.tripMiniProgress}>
                  <span className={styles.tripMiniProgressFill} style={{ width: `${overallProgress}%` }} />
                </div>
              </div>
              <TripVotePie
                title="Vote mix"
                caption="A full-category read on where group attention is clustering."
                data={planningVoteMix}
                accent="blue"
                emptyLabel="No planning votes yet"
              />
            </div>
            <section className={styles.progressPanel}>
              <div className={styles.progressSection}>
                <h2>Planning categories</h2>
                <div className={styles.progressCategoryList}>
                  {planningSummaryCards.map((category) => (
                    <div key={category.key} className={styles.progressCategory}>
                      <div className={styles.progressCategoryLabel}>
                        <span>{category.emoji}</span>
                        <span>{category.label}</span>
                      </div>
                      <div className={styles.progressBar}>
                        <span
                          className={`${styles.progressFill} ${styles[category.colorClass as keyof typeof styles]}`}
                          style={{ width: `${category.progress}%` }}
                        />
                      </div>
                      <p className={styles.progressMeta}>
                        {category.voters}/{category.eligible} participants voted
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              <div className={styles.tripWorkspaceCardGrid}>
                <TripVotePie
                  title="Accommodation vote split"
                  caption="See how the stay shortlist is breaking down."
                  data={hotelVoteChart}
                  accent="purple"
                  emptyLabel="No hotel votes yet"
                />
                <TripVotePie
                  title="Activity vote split"
                  caption="Quick look at which experiences are resonating most."
                  data={activityVoteChart}
                  accent="orange"
                  emptyLabel="No activity votes yet"
                />
              </div>
              {votingError ? <p className={styles.formError}>{votingError}</p> : null}
            </section>
          </section>
        );

      case "accommodation":
        return (
          <div className={styles.tripWorkspaceAnchorGroup}>
            <div className={styles.tripWorkspaceCardGrid}>
              <TripVotePie
                title="Accommodation vote split"
                caption="Which stay options are leading the group decision right now."
                data={hotelVoteChart}
                accent="purple"
                emptyLabel="No hotel votes yet"
              />
              <div className={`${styles.infoCard} ${styles.infoCardCompact}`}>
                <span className={styles.tripFactLabel}>Accommodation momentum</span>
                <strong>{hotelVoteSummary.progress}% participation</strong>
                <p className={styles.muted}>
                  {hotelVoteSummary.participants}/{hotelVoteSummary.eligible || 0} travellers have weighed in on the current shortlist.
                </p>
                <div className={styles.tripMiniProgress}>
                  <span className={styles.tripMiniProgressFill} style={{ width: `${hotelVoteSummary.progress}%` }} />
                </div>
              </div>
            </div>
            {renderSelectionSection(
              "hotels",
              "Accommodation",
              hotels.map((hotel) => ({
                id: hotel.id,
                title: hotel.name,
                meta: hotel.location || "Location to be confirmed",
                note: hotel.notes || "Selected hotel option",
                image: hotel.source_photo_url,
              })),
              "No hotels have been added to this trip yet.",
            )}
          </div>
        );

      case "activities":
        return (
          <div className={styles.tripWorkspaceAnchorGroup}>
            <div className={styles.tripWorkspaceCardGrid}>
              <TripVotePie
                title="Activities vote split"
                caption="Track the strongest activity contenders before opening the full list."
                data={activityVoteChart}
                accent="orange"
                emptyLabel="No activity votes yet"
              />
              <TripVotePie
                title="Transport vote split"
                caption="See which route or mode is taking the lead."
                data={transportVoteChart}
                accent="blue"
                emptyLabel="No transport votes yet"
              />
            </div>
            <div className={styles.tripWorkspaceCardGrid}>
              <TripVotePie
                title="Dining vote split"
                caption="A quick read on the food shortlist before you open it up."
                data={diningVoteChart}
                accent="green"
                emptyLabel="No dining votes yet"
              />
              <div className={`${styles.infoCard} ${styles.infoCardCompact}`}>
                <span className={styles.tripFactLabel}>Activity support mix</span>
                <strong>{activitySupportCount} support option{activitySupportCount === 1 ? "" : "s"}</strong>
                <p className={styles.muted}>
                  Transport and dining choices round out the day-to-day trip shape around the main experiences.
                </p>
                <div className={styles.tripMetricRow}>
                  <span className={styles.tripMetricPill}>Activities {activityVoteSummary.votes}</span>
                  <span className={styles.tripMetricPill}>Transport {transportVoteSummary.votes}</span>
                  <span className={styles.tripMetricPill}>Dining {diningVoteSummary.votes}</span>
                </div>
              </div>
            </div>
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
          </div>
        );

      case "discussion":
        return (
          <section className={styles.tripWorkspaceSectionCard}>
            <div className={styles.tripWorkspaceSectionTop}>
              <div>
                <p className={styles.eyebrow}>Group chat</p>
                <h2>Discussion</h2>
              </div>
              <div className={styles.headerActions}>
                <span className={styles.badgeSoft}>
                  {discussionComments.length} message{discussionComments.length === 1 ? "" : "s"}
                </span>
                <span className={styles.badgeSoft}>
                  {participants.length} participant{participants.length === 1 ? "" : "s"}
                </span>
              </div>
            </div>

            <div className={styles.discussionChatShell}>
              {chronologicalDiscussion.length ? (
                <div className={styles.discussionChatList}>
                  {chronologicalDiscussion.map((comment) => {
                    const replyTarget = comment.parentCommentId ? commentById[comment.parentCommentId] : null;
                    const isOwnMessage = Boolean(currentUserId && comment.authorId === currentUserId);

                    return (
                      <article
                        key={comment.id}
                        className={`${styles.discussionChatMessage} ${
                          isOwnMessage ? styles.discussionChatMessageOwn : ""
                        }`}
                      >
                        <div
                          className={`${styles.discussionChatBubble} ${
                            isOwnMessage ? styles.discussionChatBubbleOwn : ""
                          }`}
                        >
                          <div className={styles.discussionChatMeta}>
                            <span className={styles.rowTitle}>{comment.authorName}</span>
                            <span className={styles.rowMeta}>
                              {new Intl.DateTimeFormat("en-GB", {
                                day: "numeric",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              }).format(new Date(comment.createdAt))}
                            </span>
                          </div>
                          {replyTarget ? (
                            <div className={styles.discussionReplyPreview}>
                              Replying to {replyTarget.authorName}: {replyTarget.body}
                            </div>
                          ) : null}
                          <p className={styles.discussionChatBody}>{comment.body}</p>
                          <div className={styles.discussionChatActions}>
                            <button
                              type="button"
                              className={styles.tripSectionToggle}
                              onClick={() =>
                                setReplyingToId((current) => (current === comment.id ? null : comment.id))
                              }
                            >
                              {replyingToId === comment.id ? "Cancel reply" : "Reply"}
                            </button>
                            {comment.canDelete ? (
                              <button
                                type="button"
                                className={styles.tripSectionToggle}
                                onClick={() => void handleDeleteDiscussion(comment.id)}
                                disabled={deletingCommentId === comment.id}
                              >
                                {deletingCommentId === comment.id ? "Deleting..." : "Delete"}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className={styles.emptyState}>
                  <p>No messages yet. Send the first one to get the group chat going.</p>
                </div>
              )}

              <form
                className={styles.discussionChatComposer}
                onSubmit={(event) => {
                  if (replyingToId) {
                    void handleReply(event, replyingToId);
                    return;
                  }

                  void handlePostDiscussion(event);
                }}
              >
                {replyingToId ? (
                  <div className={styles.discussionReplyBanner}>
                    <span>Replying to {commentById[replyingToId]?.authorName || "traveller"}</span>
                    <button
                      type="button"
                      className={styles.tripSectionToggle}
                      onClick={() => setReplyingToId(null)}
                    >
                      Clear
                    </button>
                  </div>
                ) : null}
                <label className={styles.field}>
                  <span className={styles.srOnly}>Discussion message</span>
                  <textarea
                    className={styles.discussionTextarea}
                    value={replyingToId ? discussionReplyBody[replyingToId] ?? "" : discussionBody}
                    onChange={(event) => {
                      if (replyingToId) {
                        setDiscussionReplyBody((current) => ({
                          ...current,
                          [replyingToId]: event.target.value,
                        }));
                        return;
                      }

                      setDiscussionBody(event.target.value);
                    }}
                    placeholder={
                      replyingToId
                        ? `Reply to ${commentById[replyingToId]?.authorName || "traveller"}...`
                        : accessRole === "organiser"
                          ? "Post an update or question for the group..."
                          : "Type a message for the trip group..."
                    }
                    rows={3}
                  />
                </label>
                <div className={styles.formActions}>
                  <span className={styles.muted}>Simple group chat for updates, replies, and quick trip decisions.</span>
                  <button
                    type="submit"
                    className={styles.primaryAction}
                    disabled={isSubmittingDiscussion}
                  >
                    {isSubmittingDiscussion
                      ? "Sending..."
                      : replyingToId
                        ? "Send reply"
                        : "Send message"}
                  </button>
                </div>
                {discussionError ? <p className={styles.formError}>{discussionError}</p> : null}
              </form>
            </div>
          </section>
        );

      case "expenses":
        return (
          <section className={styles.tripWorkspaceSectionCard}>
            <div className={styles.tripWorkspaceCardGrid}>
              <div className={`${styles.infoCard} ${styles.infoCardCompact}`}>
                <span className={styles.tripFactLabel}>Expense tracking</span>
                <strong>Trip-level costs are supported</strong>
                <p className={styles.muted}>
                  Review trip-linked payments, selected planning costs, and shared spend in one place.
                </p>
                <div className={styles.tripMetricRow}>
                  <span className={styles.tripMetricPill}>
                    {hotels.length + activities.length + transport.length + dining.length} planned items
                  </span>
                </div>
              </div>
              <div className={`${styles.infoCard} ${styles.infoCardCompact}`}>
                <span className={styles.tripFactLabel}>Trip cost context</span>
                <strong>Open the wider expenses workspace</strong>
                <p className={styles.muted}>
                  Use the full expenses area when you need payment history, reconciliations, and all spend together.
                </p>
              </div>
            </div>
            <div className={styles.formActions}>
              <Link href="/my-expenses" className={styles.secondaryActionLink}>
                Open expenses workspace
              </Link>
            </div>
          </section>
        );

      case "settings":
        return (
          <section className={styles.tripWorkspaceSectionCard}>
            <div className={styles.tripWorkspaceCardGrid}>
              <div className={`${styles.infoCard} ${styles.infoCardCompact}`}>
                <span className={styles.tripFactLabel}>Access</span>
                <strong>
                  {accessRole === "organiser" ? "You are managing this trip" : "You are viewing as a participant"}
                </strong>
                <p className={styles.muted}>
                  Access level drives whether someone can manage, publish, invite, or simply review and vote.
                </p>
                <div className={styles.tripMetricRow}>
                  <span className={styles.tripMetricPill}>{getTripStatusLabel(trip.status)}</span>
                  <span className={styles.tripMetricPill}>{accessRole}</span>
                </div>
              </div>
              <div className={`${styles.infoCard} ${styles.infoCardCompact}`}>
                <span className={styles.tripFactLabel}>Workspace controls</span>
                <strong>Key state controls live here</strong>
                <p className={styles.muted}>
                  Publish status, access context, and the return path to your trips list are all managed here.
                </p>
              </div>
            </div>
            <div className={styles.tripWorkspaceCardGrid}>
              <div className={`${styles.infoCard} ${styles.infoCardCompact}`}>
                <span className={styles.tripFactLabel}>People</span>
                <strong>{participants.length} in the workspace</strong>
                <p className={styles.muted}>
                  {inactiveParticipantNames.length
                    ? `${inactiveParticipantNames.length} participant${inactiveParticipantNames.length === 1 ? "" : "s"} still need to weigh in.`
                    : "Everyone currently linked to the trip has responded or joined the workspace."}
                </p>
                <div className={styles.tripMetricRow}>
                  <span className={styles.tripMetricPill}>{acceptedParticipants} accepted</span>
                  <span className={styles.tripMetricPill}>{invitedParticipants} invited</span>
                </div>
              </div>
              <div className={`${styles.infoCard} ${styles.infoCardCompact}`}>
                <span className={styles.tripFactLabel}>Inactive users</span>
                <strong>
                  {inactiveParticipantNames.length ? inactiveParticipantNames.join(" • ") : "No one is currently inactive"}
                </strong>
                <p className={styles.muted}>
                  This is the clean place to manage invites and spot who may need a follow-up.
                </p>
              </div>
            </div>
            {accessRole === "organiser" ? (
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
                {participantsError ? <p className={styles.formError}>{participantsError}</p> : null}
                <div className={styles.formActions}>
                  <button type="submit" className={styles.primaryAction} disabled={isInviting}>
                    {isInviting ? "Sending invite..." : "Invite traveller"}
                  </button>
                </div>
              </form>
            ) : null}
            <div className={styles.participantsList}>
              {participants.length === 0 ? (
                <div className={styles.emptyState}>
                  <p>No travellers invited yet.</p>
                </div>
              ) : (
                participants.map((participant) => (
                  <article key={participant.id} className={styles.participantCard}>
                    <div className={styles.rowTop}>
                      <span className={styles.rowTitle}>{participant.full_name || participant.email}</span>
                      <span className={styles.badge}>{participant.status}</span>
                    </div>
                    <div className={styles.tripMetaRow}>
                      <span>{participant.email}</span>
                      <span>{participant.role}</span>
                    </div>
                  </article>
                ))
              )}
            </div>
            <div className={styles.headerActions}>
              {accessRole === "organiser" && trip.status === "draft" ? (
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
          </section>
        );

      default:
        return null;
    }
  }

  return (
    <AppShell kicker="" title="" intro="">
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

          {!tripError && trip && activeSection && activeSectionMeta ? (
            <div className={styles.tripSectionPage}>
              <section className={styles.tripSectionPageHeader}>
                <div className={styles.tripWorkspaceSectionTop}>
                  <div>
                    <p className={styles.eyebrow}>{activeSectionMeta.eyebrow}</p>
                    <h1>{activeSectionMeta.title}</h1>
                    <p className={styles.muted}>{activeSectionMeta.description}</p>
                  </div>
                  <div className={styles.tripWorkspaceHeaderActions}>
                    <Link href={`/trips/${trip.id}`} className={styles.tripSectionToggle}>
                      Back to overview
                    </Link>
                    {accessRole === "organiser" ? (
                      <button
                        type="button"
                        role="switch"
                        aria-checked={trip.status === "active"}
                        aria-label={trip.status === "active" ? "Trip published" : "Publish trip"}
                        className={styles.tripPublishToggle}
                        onClick={() => void handleTogglePublish()}
                        disabled={isPublishing || trip.status === "active"}
                      >
                        <span className={styles.tripPublishToggleLabel}>
                          {isPublishing ? "Saving..." : trip.status === "active" ? "Published" : "Draft"}
                        </span>
                        <span
                          className={`${styles.tripPublishToggleTrack} ${
                            trip.status === "active" ? styles.tripPublishToggleTrackActive : ""
                          }`}
                        >
                          <span
                            className={`${styles.tripPublishToggleThumb} ${
                              trip.status === "active" ? styles.tripPublishToggleThumbActive : ""
                            }`}
                          />
                        </span>
                      </button>
                    ) : (
                      <span className={styles.badge}>
                        {accessRole === "participant" ? "Participant" : getTripStatusLabel(trip.status)}
                      </span>
                    )}
                  </div>
                </div>
                {workspaceSummary ? (
                  <div className={styles.tripQuestionGrid}>
                    <div className={styles.tripQuestionCard}>
                      <span className={styles.tripFactLabel}>Current phase</span>
                      <strong>{workspaceSummary.phaseLabel}</strong>
                    </div>
                    <div className={styles.tripQuestionCard}>
                      <span className={styles.tripFactLabel}>Decision</span>
                      <strong>{workspaceSummary.currentDecision}</strong>
                    </div>
                    <div className={styles.tripQuestionCard}>
                      <span className={styles.tripFactLabel}>Leading option</span>
                      <strong>{workspaceSummary.leadingOption}</strong>
                    </div>
                    <div className={styles.tripQuestionCard}>
                      <span className={styles.tripFactLabel}>Next action</span>
                      <strong>{workspaceSummary.nextAction}</strong>
                    </div>
                  </div>
                ) : null}
                {workspaceSummary ? (
                  <div className={styles.tripMetricRow}>
                    <span className={styles.tripMetricPill}>
                      {workspaceSummary.participantSummary.invited} invited
                    </span>
                    <span className={styles.tripMetricPill}>
                      {workspaceSummary.participantSummary.viewed} viewed
                    </span>
                    <span className={styles.tripMetricPill}>
                      {workspaceSummary.participantSummary.responded} responded
                    </span>
                    <span className={styles.tripMetricPill}>
                      {workspaceSummary.participantSummary.confirmed} confirmed
                    </span>
                    <span className={styles.tripMetricPill}>
                      {workspaceSummary.participantSummary.outstanding} outstanding
                    </span>
                    {workspaceSummary.deadlineLabel ? (
                      <span className={styles.tripMetricPill}>{workspaceSummary.deadlineLabel}</span>
                    ) : null}
                  </div>
                ) : null}
                {workspaceSummary ? (
                  <p className={styles.metricMeta}>
                    {workspaceSummary.confidenceScore}% confidence. {workspaceSummary.confidenceMessage} {workspaceSummary.latestChange}
                  </p>
                ) : null}
              </section>

              <div className={styles.tripSectionPageContent}>{renderSectionContent()}</div>
            </div>
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
