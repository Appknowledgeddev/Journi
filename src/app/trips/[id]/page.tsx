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
  formatTripDatePlanning,
  formatTripDateRange,
  getVoteSummary,
  type HotelSelection,
  planningCategories,
  summariseTripWorkspace,
  type TripAccessRole,
  type TripDetail,
  type TripParticipant,
  tripWorkspaceNav,
  type TransportSelection,
  type VotingState,
} from "./trip-workspace-shared";
import { getAudienceLabel, getBudgetBandLabel, getGroupSizeLabel } from "@/lib/trip-organiser/config";

type Plan = "free" | "pro_organiser";

export default function TripDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const tripId = params?.id;
  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [loadingTrip, setLoadingTrip] = useState(true);
  const [tripError, setTripError] = useState<string | null>(null);
  const [votingError, setVotingError] = useState<string | null>(null);
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
  const [accessRole, setAccessRole] = useState<TripAccessRole>("organiser");
  const [hotels, setHotels] = useState<HotelSelection[]>([]);
  const [activities, setActivities] = useState<ActivitySelection[]>([]);
  const [transport, setTransport] = useState<TransportSelection[]>([]);
  const [dining, setDining] = useState<DiningSelection[]>([]);
  const [voting, setVoting] = useState<VotingState | null>(null);

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
    () => buildVoteChartData(
      transport,
      voting?.transport?.itemVotes,
      (option) => option.mode,
    ),
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
  const sectionHref = (section: string) => `/trips/${tripId}/${section}`;

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

  async function handleUnpublishTrip() {
    if (!trip || trip.status !== "active") {
      return;
    }

    setIsPublishing(true);
    setTripError(null);
    setPublishGateMessage(null);

    const { data, error } = await supabase
      .from("trips")
      .update({ status: "draft" })
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

  async function handleTogglePublish() {
    if (!trip || accessRole !== "organiser") {
      return;
    }

    if (trip.status === "draft") {
      await handlePublishTrip();
      return;
    }

    if (trip.status === "active") {
      await handleUnpublishTrip();
    }
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
      kicker=""
      title=""
      intro=""
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
            <div className={styles.tripWorkspaceDetailLayout}>
              <aside className={styles.tripWorkspaceSideMenu}>
                <section className={styles.tripWorkspaceStickyBar}>
                  <nav aria-label="Trip sections" className={styles.tripHeaderNav}>
                    {tripWorkspaceNav.map((item, index) => (
                      <Link
                        key={item.id}
                        href={item.id === "overview" ? "#overview" : sectionHref(item.id)}
                        className={styles.tripHeaderNavLink}
                      >
                        <span className={styles.tripHeaderNavIndex}>{index + 1}.</span>
                        <span>{item.label}</span>
                      </Link>
                    ))}
                  </nav>
                </section>
              </aside>

              <div className={styles.tripWorkspaceShellCard}>
                <div className={styles.tripWorkspaceContent}>
                  <section id="overview" className={styles.tripOverviewPanel}>
                    <div className={`${styles.tripBuilderCard} ${styles.tripBuilderCardNoFade}`}>
                      <div className={styles.tripImagePreviewWrap}>
                        {trip.cover_image_url ? (
                          <img
                            src={trip.cover_image_url}
                            alt={trip.title}
                            className={styles.imagePreview}
                          />
                        ) : (
                          <div className={styles.tripDetailImageFallback} />
                        )}
                        <div className={styles.tripWorkspaceHeroControls}>
                          {accessRole === "organiser" ? (
                            <button
                              type="button"
                              role="switch"
                              aria-checked={trip.status === "active"}
                              aria-label={trip.status === "active" ? "Unpublish trip" : "Publish trip"}
                              className={styles.tripPublishToggle}
                              onClick={() => void handleTogglePublish()}
                              disabled={isPublishing}
                            >
                              <span className={styles.tripPublishToggleLabel}>
                                {isPublishing
                                  ? "Saving..."
                                  : trip.status === "active"
                                    ? "Published"
                                    : "Draft"}
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
                              {accessRole === "participant" ? "participant" : trip.status}
                            </span>
                          )}
                        </div>
                        <div className={styles.tripImageTextOverlay}>
                          <p className={styles.tripImageMeta}>
                            Destination
                          </p>
                          <h1 className={styles.tripImageTitle}>
                            {trip.destination || "Your trip"}
                          </h1>
                          <p className={`${styles.tripImageSubtitle} ${styles.tripOverviewSupportText}`}>
                            {trip.title || "Trip workspace"}
                          </p>
                        </div>
                      </div>

                      <div className={`${styles.tripBuilderBody} ${styles.tripOverviewBodyStrong}`}>
                        <div className={`${styles.tripMetaRow} ${styles.tripOverviewSupportText}`}>
                          <span>{trip.destination || "Destination to be confirmed"}</span>
                          <span>{formatTripDatePlanning(trip)}</span>
                        </div>
                        <p className={`${styles.muted} ${styles.tripOverviewSupportText}`}>
                          {trip.description || "No trip summary added yet."}
                        </p>
                        {workspaceSummary ? (
                          <>
                            <div className={styles.tripQuestionGrid}>
                              <div className={styles.tripQuestionCard}>
                                <span className={styles.tripFactLabel}>Current phase</span>
                                <strong>{workspaceSummary.phaseLabel}</strong>
                                <p className={styles.muted}>{workspaceSummary.confidenceMessage}</p>
                              </div>
                              <div className={styles.tripQuestionCard}>
                                <span className={styles.tripFactLabel}>Decision we’re making</span>
                                <strong>{workspaceSummary.currentDecision}</strong>
                                <p className={styles.muted}>Keep the group focused on the next call, not a long chat thread.</p>
                              </div>
                              <div className={styles.tripQuestionCard}>
                                <span className={styles.tripFactLabel}>Leading option</span>
                                <strong>{workspaceSummary.leadingOption}</strong>
                                <p className={styles.muted}>This is the clearest front-runner Journi can see right now.</p>
                              </div>
                              <div className={styles.tripQuestionCard}>
                                <span className={styles.tripFactLabel}>What happens next</span>
                                <strong>{workspaceSummary.nextAction}</strong>
                                <p className={styles.muted}>Journi should always surface the next best organiser action.</p>
                              </div>
                              <div className={styles.tripQuestionCard}>
                                <span className={styles.tripFactLabel}>Audience and size</span>
                                <strong>{getAudienceLabel(trip.audience_filter)}</strong>
                                <p className={styles.muted}>
                                  {getGroupSizeLabel(trip.group_size_band)} for a {trip.trip_type_label || "group trip"}.
                                </p>
                              </div>
                              <div className={styles.tripQuestionCard}>
                                <span className={styles.tripFactLabel}>Budget guide</span>
                                <strong>
                                  {trip.budget_mode === "overall" && trip.budget_total
                                    ? `£${trip.budget_total} overall`
                                    : getBudgetBandLabel(trip.budget_band)}
                                </strong>
                                <p className={styles.muted}>
                                  {trip.budget_per_person_min
                                    ? `Approx. £${trip.budget_per_person_min}${
                                        trip.budget_per_person_max ? `-£${trip.budget_per_person_max}` : "+"
                                      } per person`
                                    : "Budget still being defined."}
                                </p>
                              </div>
                            </div>

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

                            <div className={styles.tripConfidencePanel}>
                              <div className={styles.rowTop}>
                                <span className={styles.rowTitle}>Confidence score</span>
                                <span className={styles.rowMeta}>{workspaceSummary.confidenceScore}%</span>
                              </div>
                              <div className={styles.tripMiniProgress}>
                                <span
                                  className={styles.tripMiniProgressFill}
                                  style={{ width: `${workspaceSummary.confidenceScore}%` }}
                                />
                              </div>
                              <p className={styles.muted}>{workspaceSummary.latestChange}</p>
                            </div>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </section>

                  <div className={styles.tripWorkspaceMainColumn}>
                    <section
                      id="destinations"
                      className={`${styles.tripWorkspaceSectionCard} ${styles.tripWorkspaceSectionCompact}`}
                    >
                      <div className={styles.tripWorkspaceSectionTop}>
                        <div>
                          <p className={styles.eyebrow}>Destinations</p>
                          <h2>Destinations</h2>
                        </div>
                        <Link href={sectionHref("destinations")} className={styles.tripSectionToggle}>
                          View destinations →
                        </Link>
                      </div>
                      <div className={styles.tripWorkspaceCardGrid}>
                        <div className={`${styles.infoCard} ${styles.infoCardCompact}`}>
                          <span className={styles.tripFactLabel}>Primary destination</span>
                          <strong>{trip.destination || "Destination to be confirmed"}</strong>
                          <p className={styles.muted}>
                            The lead destination the rest of the planning is currently built around.
                          </p>
                          <div className={styles.tripMetricRow}>
                            <span className={styles.tripMetricPill}>1 stop</span>
                            <span className={styles.tripMetricPill}>
                              {transport.length} route option{transport.length === 1 ? "" : "s"}
                            </span>
                          </div>
                        </div>
                        <div className={`${styles.infoCard} ${styles.infoCardCompact}`}>
                          <span className={styles.tripFactLabel}>Travel flow</span>
                          <strong>
                            {transport.length
                              ? "Transport has been planned"
                              : "Transport still to be chosen"}
                          </strong>
                          <p className={styles.muted}>
                            Arrival, departure, and internal movement can all be tracked from this section.
                          </p>
                          <div className={styles.tripMiniProgress}>
                            <span
                              className={styles.tripMiniProgressFill}
                              style={{ width: `${transport.length ? 100 : 18}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </section>

                    <section
                      id="dates"
                      className={`${styles.tripWorkspaceSectionCard} ${styles.tripWorkspaceSectionCompact}`}
                    >
                      <div className={styles.tripWorkspaceSectionTop}>
                        <div>
                          <p className={styles.eyebrow}>Dates</p>
                          <h2>Dates</h2>
                        </div>
                        <Link href={sectionHref("dates")} className={styles.tripSectionToggle}>
                          View dates →
                        </Link>
                      </div>
                      <div className={styles.tripWorkspaceCardGrid}>
                        <div className={`${styles.infoCard} ${styles.infoCardCompact}`}>
                          <span className={styles.tripFactLabel}>Travel dates</span>
                          <strong>{formatTripDatePlanning(trip)}</strong>
                          <p className={styles.muted}>
                            {trip.date_mode === "flexible"
                              ? "The organiser is still collecting the right window before locking final dates."
                              : "The active travel window the rest of the plan is being coordinated against."}
                          </p>
                          <div className={styles.tripMetricRow}>
                            <span className={styles.tripMetricPill}>
                              {trip.date_mode === "flexible"
                                ? "Flexible"
                                : trip.starts_at && trip.ends_at
                                  ? "Locked in"
                                  : "Pending"}
                            </span>
                          </div>
                        </div>
                        <div className={`${styles.infoCard} ${styles.infoCardCompact}`}>
                          <span className={styles.tripFactLabel}>Planning state</span>
                          <strong>{completedSections} planning areas started</strong>
                          <p className={styles.muted}>
                            This gives the group a quick read on how complete the trip shape is so far.
                          </p>
                          <div className={styles.tripMiniProgress}>
                            <span
                              className={styles.tripMiniProgressFill}
                              style={{ width: `${overallProgress}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </section>

                    <section id="budget" className={styles.tripWorkspaceSectionCard}>
                      <div className={styles.tripWorkspaceSectionTop}>
                        <div>
                          <p className={styles.eyebrow}>Budget</p>
                          <h2>Budget</h2>
                        </div>
                        <Link href={sectionHref("budget")} className={styles.tripSectionToggle}>
                          View budget →
                        </Link>
                      </div>
                      <div className={styles.tripWorkspaceCardGrid}>
                        <div className={`${styles.infoCard} ${styles.infoCardCompact}`}>
                          <span className={styles.tripFactLabel}>Budget guide</span>
                          <strong>
                            {trip.budget_mode === "overall" && trip.budget_total
                              ? `£${trip.budget_total} overall`
                              : getBudgetBandLabel(trip.budget_band)}
                          </strong>
                          <p className={styles.muted}>
                            {trip.budget_per_person_min
                              ? `Approx. £${trip.budget_per_person_min}${
                                  trip.budget_per_person_max ? `-£${trip.budget_per_person_max}` : "+"
                                } per person, based on the current group size.`
                              : `${completedSections} of 4 core planning areas already have live selections.`}
                          </p>
                          <div className={styles.tripMiniProgress}>
                            <span
                              className={styles.tripMiniProgressFill}
                              style={{ width: `${overallProgress}%` }}
                            />
                          </div>
                        </div>
                        <TripVotePie
                          title="Voting mix"
                          caption="Where the group is putting its votes across the planning categories."
                          data={planningVoteMix}
                          accent="blue"
                          emptyLabel="No planning votes yet"
                        />
                      </div>
                      {votingError ? <p className={styles.formError}>{votingError}</p> : null}
                    </section>

                    <section id="accommodation" className={styles.tripWorkspaceSectionCard}>
                      <div className={styles.tripWorkspaceSectionTop}>
                        <div>
                          <p className={styles.eyebrow}>Accommodation</p>
                          <h2>Accommodation</h2>
                        </div>
                        <Link href={sectionHref("accommodation")} className={styles.tripSectionToggle}>
                          View accommodation →
                        </Link>
                      </div>
                      <div className={styles.tripWorkspaceCardGrid}>
                        <div className={`${styles.infoCard} ${styles.infoCardCompact}`}>
                          <span className={styles.tripFactLabel}>Selected stays</span>
                          <strong>{hotels.length}</strong>
                          <p className={styles.muted}>
                            {hotels[0]?.name || "No hotel added yet."} This section shows where the group is currently leaning on accommodation.
                          </p>
                          <div className={styles.tripMetricRow}>
                            <span className={styles.tripMetricPill}>{hotelVoteSummary.votes} votes</span>
                            <span className={styles.tripMetricPill}>
                              {hotelVoteSummary.participants}/{hotelVoteSummary.eligible || 0} voters
                            </span>
                          </div>
                        </div>
                        <TripVotePie
                          title="Accommodation vote split"
                          caption={`${hotels.length} shortlisted option${hotels.length === 1 ? "" : "s"} with live traveller votes.`}
                          data={hotelVoteChart}
                          accent="purple"
                          emptyLabel="No hotel votes yet"
                        />
                      </div>
                    </section>

                    <section id="activities" className={styles.tripWorkspaceSectionCard}>
                      <div className={styles.tripWorkspaceSectionTop}>
                        <div>
                          <p className={styles.eyebrow}>Activities</p>
                          <h2>Activities</h2>
                        </div>
                        <Link href={sectionHref("activities")} className={styles.tripSectionToggle}>
                          View activities →
                        </Link>
                      </div>
                      <div className={styles.tripWorkspaceCardGrid}>
                        <div className={`${styles.infoCard} ${styles.infoCardCompact}`}>
                          <span className={styles.tripFactLabel}>Activities</span>
                          <strong>{activities.length} selected</strong>
                          <p className={styles.muted}>
                            {activities[0]?.title || "No activities added yet."} This is the current lead experience for the trip.
                          </p>
                          <div className={styles.tripMetricRow}>
                            <span className={styles.tripMetricPill}>{activityVoteSummary.votes} votes</span>
                            <span className={styles.tripMetricPill}>
                              {activityVoteSummary.participants}/{activityVoteSummary.eligible || 0} voters
                            </span>
                          </div>
                        </div>
                        <TripVotePie
                          title="Activity vote split"
                          caption="Quick read on which experiences are currently leading the shortlist."
                          data={activityVoteChart}
                          accent="orange"
                          emptyLabel="No activity votes yet"
                        />
                      </div>
                      <div className={styles.tripWorkspaceCardGrid}>
                        <TripVotePie
                          title="Transport vote split"
                          caption="See which movement option is drawing the most support."
                          data={transportVoteChart}
                          accent="blue"
                          emptyLabel="No transport votes yet"
                        />
                        <TripVotePie
                          title="Dining vote split"
                          caption="A quick snapshot of how meal options are stacking up."
                          data={diningVoteChart}
                          accent="green"
                          emptyLabel="No dining votes yet"
                        />
                      </div>
                    </section>

                    <section id="discussion" className={styles.tripWorkspaceSectionCard}>
                      <div className={styles.tripWorkspaceSectionTop}>
                        <div>
                          <p className={styles.eyebrow}>Discussion</p>
                          <h2>Discussion</h2>
                        </div>
                        <Link href={sectionHref("discussion")} className={styles.tripSectionToggle}>
                          View discussion →
                        </Link>
                      </div>
                      <div className={styles.tripWorkspaceCardGrid}>
                        <div className={`${styles.infoCard} ${styles.infoCardCompact}`}>
                          <span className={styles.tripFactLabel}>Outstanding people</span>
                          <strong>{workspaceSummary?.participantSummary.outstanding ?? 0}</strong>
                          <p className={styles.muted}>
                            {workspaceSummary?.participantSummary.outstanding
                              ? `${
                                  workspaceSummary.participantSummary.outstanding
                                } traveller${
                                  workspaceSummary.participantSummary.outstanding === 1 ? "" : "s"
                                } still need to respond.`
                              : "No one is outstanding right now."} Journi should do the chasing, not the organiser.
                          </p>
                          <div className={styles.tripMetricRow}>
                            <span className={styles.tripMetricPill}>
                              {workspaceSummary?.participantSummary.invited ?? 0} invited
                            </span>
                            <span className={styles.tripMetricPill}>
                              {workspaceSummary?.participantSummary.responded ?? 0} responded
                            </span>
                          </div>
                        </div>
                        <div className={`${styles.infoCard} ${styles.infoCardCompact}`}>
                          <span className={styles.tripFactLabel}>Latest important change</span>
                          <strong>
                            {workspaceSummary?.latestChange ?? "No trip changes yet"}
                          </strong>
                          <p className={styles.muted}>
                            {workspaceSummary?.deadlineLabel
                              ? `${workspaceSummary.deadlineLabel}.`
                              : "Add a trip date to give the group a clearer deadline."} The discussion hub should always make the blocker obvious.
                          </p>
                          <div className={styles.tripMiniProgress}>
                            <span
                              className={styles.tripMiniProgressFill}
                              style={{
                                width: `${
                                  workspaceSummary?.participantSummary.total
                                    ? Math.round(
                                        ((workspaceSummary?.participantSummary.responded ?? 0) /
                                          (workspaceSummary?.participantSummary.total ?? 1)) *
                                          100,
                                      )
                                    : 0
                                }%`,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </section>

                    <section id="expenses" className={styles.tripWorkspaceSectionCard}>
                      <div className={styles.tripWorkspaceSectionTop}>
                        <div>
                          <p className={styles.eyebrow}>Expenses</p>
                          <h2>Expenses</h2>
                        </div>
                        <Link href={sectionHref("expenses")} className={styles.tripSectionToggle}>
                          View expenses →
                        </Link>
                      </div>
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
                          <span className={styles.tripFactLabel}>Open expenses</span>
                          <strong>Review in My expenses</strong>
                          <p className={styles.muted}>
                            Use the wider expenses area when you need the full cost breakdown and payment context.
                          </p>
                        </div>
                      </div>
                    </section>

                    <section id="settings" className={styles.tripWorkspaceSectionCard}>
                      <div className={styles.tripWorkspaceSectionTop}>
                        <div>
                          <p className={styles.eyebrow}>Settings</p>
                          <h2>Settings</h2>
                        </div>
                        <Link href={sectionHref("settings")} className={styles.tripSectionToggle}>
                          View settings →
                        </Link>
                      </div>

                      <div className={styles.tripWorkspaceCardGrid}>
                        <div className={`${styles.infoCard} ${styles.infoCardCompact}`}>
                          <span className={styles.tripFactLabel}>Access</span>
                          <strong>
                            {accessRole === "organiser"
                              ? "You are managing this trip"
                              : "You are viewing as a participant"}
                          </strong>
                          <p className={styles.muted}>
                            Access level drives whether someone can manage, publish, invite, or simply review and vote.
                          </p>
                          <div className={styles.tripMetricRow}>
                            <span className={styles.tripMetricPill}>{trip.status}</span>
                            <span className={styles.tripMetricPill}>{accessRole}</span>
                          </div>
                        </div>
                        <div className={`${styles.infoCard} ${styles.infoCardCompact}`}>
                          <span className={styles.tripFactLabel}>Actions</span>
                          <strong>Workspace controls</strong>
                          <p className={styles.muted}>
                            The key state controls for this trip live here, including publish status and return paths.
                          </p>
                        </div>
                      </div>
                    </section>
                  </div>
                </div>
              </div>
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
