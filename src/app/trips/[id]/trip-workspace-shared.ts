export type TripDetail = {
  id: string;
  title: string;
  destination: string | null;
  description: string | null;
  status: string;
  trip_type_label?: string | null;
  audience_filter?: string | null;
  date_mode?: string | null;
  starts_at: string | null;
  ends_at: string | null;
  voting_deadline?: string | null;
  group_size_band?: string | null;
  group_size_min?: number | null;
  budget_mode?: string | null;
  budget_band?: string | null;
  budget_total?: number | null;
  budget_per_person_min?: number | null;
  budget_per_person_max?: number | null;
  cover_image_url: string | null;
  created_at?: string | null;
};

export type TripParticipant = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  status: string;
  invited_at?: string | null;
  responded_at?: string | null;
  created_at?: string | null;
};

export type TripAccessRole = "organiser" | "participant";

export type HotelSelection = {
  id: string;
  name: string;
  location: string | null;
  notes: string | null;
  source_photo_url: string | null;
};

export type ActivitySelection = {
  id: string;
  title: string;
  location: string | null;
  notes: string | null;
  source_photo_url: string | null;
};

export type TransportSelection = {
  id: string;
  mode: string;
  departure_location: string | null;
  arrival_location: string | null;
  notes: string | null;
  source_photo_url: string | null;
};

export type DiningSelection = {
  id: string;
  name: string;
  location: string | null;
  notes: string | null;
  source_photo_url: string | null;
};

export type CategoryKey = "hotels" | "activities" | "transport" | "dining";

export type VoteCategoryState = {
  title: string;
  voterCount: number;
  eligibleVoterCount: number;
  progress: number;
  itemVotes: Record<string, { votes: number; voterIds: string[] }>;
};

export type VotingState = Record<CategoryKey, VoteCategoryState>;

export type VoteChartDatum = {
  id: string;
  label: string;
  value: number;
};

export type TripPhaseKey =
  | "draft"
  | "invites_sent"
  | "collecting_responses"
  | "ready_to_decide"
  | "decision_locked"
  | "booking_and_payments"
  | "pre_trip"
  | "completed"
  | "cancelled";

export type TripPlanningCounts = {
  hotels: number;
  activities: number;
  transport: number;
  dining: number;
};

export type TripPaymentSummary = {
  total: number;
  due: number;
  pending: number;
  paid: number;
  overdue: number;
};

export type TripParticipantSummary = {
  total: number;
  invited: number;
  viewed: number;
  responded: number;
  confirmed: number;
  declined: number;
  outstanding: number;
  inactiveUsers: string[];
};

export type TripWorkspaceStatusSummary = {
  phase: TripPhaseKey;
  phaseLabel: string;
  currentDecision: string;
  leadingOption: string;
  nextAction: string;
  deadlineLabel: string | null;
  latestChange: string;
  confidenceScore: number;
  confidenceMessage: string;
  participantSummary: TripParticipantSummary;
};

export type TripSectionKey =
  | "destinations"
  | "dates"
  | "budget"
  | "accommodation"
  | "activities"
  | "discussion"
  | "expenses"
  | "settings";

export const planningCategories = [
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
] as const;

export const tripWorkspaceNav = [
  { id: "overview", label: "Overview" },
  { id: "destinations", label: "Destinations" },
  { id: "dates", label: "Dates" },
  { id: "budget", label: "Budget" },
  { id: "accommodation", label: "Accommodation" },
  { id: "activities", label: "Activities" },
  { id: "discussion", label: "Discussion" },
  { id: "expenses", label: "Expenses" },
  { id: "settings", label: "Settings" },
] as const;

export function formatTripDateRange(startsAt: string | null, endsAt: string | null) {
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

export function formatTripDatePlanning(trip: TripDetail) {
  if (trip.date_mode === "flexible" && !trip.starts_at && !trip.ends_at) {
    return "Flexible / open dates";
  }

  return formatTripDateRange(trip.starts_at, trip.ends_at);
}

export function getVoteSummary(category?: VoteCategoryState) {
  if (!category) {
    return { votes: 0, participants: 0, eligible: 0, progress: 0 };
  }

  return {
    votes: Object.values(category.itemVotes).reduce((count, item) => count + item.votes, 0),
    participants: category.voterCount,
    eligible: category.eligibleVoterCount,
    progress: category.progress,
  };
}

function countTripParticipants(participants: TripParticipant[]): TripParticipantSummary {
  const invited = participants.length;
  const responded = participants.filter(
    (participant) =>
      Boolean(participant.responded_at) ||
      participant.status === "accepted" ||
      participant.status === "declined",
  ).length;
  const confirmed = participants.filter((participant) => participant.status === "accepted").length;
  const declined = participants.filter((participant) => participant.status === "declined").length;
  const viewed = participants.filter(
    (participant) =>
      participant.status !== "invited" && participant.status !== "pending",
  ).length;
  const outstanding = Math.max(invited - responded, 0);

  return {
    total: invited,
    invited,
    viewed,
    responded,
    confirmed,
    declined,
    outstanding,
    inactiveUsers: participants
      .filter(
        (participant) =>
          !participant.responded_at &&
          participant.status !== "accepted" &&
          participant.status !== "declined",
      )
      .map((participant) => participant.full_name || participant.email),
  };
}

function getPhaseLabel(phase: TripPhaseKey) {
  switch (phase) {
    case "draft":
      return "Draft";
    case "invites_sent":
      return "Invites sent";
    case "collecting_responses":
      return "Collecting responses";
    case "ready_to_decide":
      return "Ready to decide";
    case "decision_locked":
      return "Decision locked";
    case "booking_and_payments":
      return "Booking and payments";
    case "pre_trip":
      return "Pre-trip";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    default:
      return "Draft";
  }
}

function describeLatestChange(
  trip: TripDetail,
  participants: TripParticipant[],
  formatter: Intl.DateTimeFormat,
) {
  const respondedAt = participants
    .map((participant) => participant.responded_at)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0];

  if (respondedAt) {
    return `Latest change: response received on ${formatter.format(new Date(respondedAt))}`;
  }

  const invitedAt = participants
    .map((participant) => participant.invited_at ?? participant.created_at)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0];

  if (invitedAt) {
    return `Latest change: invite sent on ${formatter.format(new Date(invitedAt))}`;
  }

  if (trip.created_at) {
    return `Latest change: trip created on ${formatter.format(new Date(trip.created_at))}`;
  }

  return "Latest change: trip created";
}

function getLeadingOptionLabel(args: {
  trip: TripDetail;
  hotels: HotelSelection[];
  activities: ActivitySelection[];
  transport: TransportSelection[];
  dining: DiningSelection[];
  voting?: VotingState | null;
}) {
  if (args.trip.destination) {
    return args.trip.destination;
  }

  const hotelLeader = buildVoteChartData(args.hotels, args.voting?.hotels?.itemVotes, (item) => item.name).find(
    (item) => item.value > 0,
  );
  if (hotelLeader) {
    return hotelLeader.label;
  }

  const activityLeader = buildVoteChartData(
    args.activities,
    args.voting?.activities?.itemVotes,
    (item) => item.title,
  ).find((item) => item.value > 0);
  if (activityLeader) {
    return activityLeader.label;
  }

  const transportLeader = buildVoteChartData(
    args.transport,
    args.voting?.transport?.itemVotes,
    (item) => item.mode,
  ).find((item) => item.value > 0);
  if (transportLeader) {
    return transportLeader.label;
  }

  const diningLeader = buildVoteChartData(args.dining, args.voting?.dining?.itemVotes, (item) => item.name).find(
    (item) => item.value > 0,
  );
  if (diningLeader) {
    return diningLeader.label;
  }

  if (args.trip.starts_at || args.trip.ends_at) {
    return formatTripDateRange(args.trip.starts_at, args.trip.ends_at);
  }

  return "No leading option yet";
}

export function summariseTripWorkspace(args: {
  trip: TripDetail;
  participants: TripParticipant[];
  planningCounts?: Partial<TripPlanningCounts>;
  planningProgress?: number;
  paymentSummary?: Partial<TripPaymentSummary>;
  voting?: VotingState | null;
  hotels?: HotelSelection[];
  activities?: ActivitySelection[];
  transport?: TransportSelection[];
  dining?: DiningSelection[];
}) {
  const participantSummary = countTripParticipants(args.participants);
  const planningCounts: TripPlanningCounts = {
    hotels: args.planningCounts?.hotels ?? 0,
    activities: args.planningCounts?.activities ?? 0,
    transport: args.planningCounts?.transport ?? 0,
    dining: args.planningCounts?.dining ?? 0,
  };
  const planningProgress =
    args.planningProgress ??
    Math.round(
      ([planningCounts.hotels, planningCounts.activities, planningCounts.transport, planningCounts.dining].filter(
        (count) => count > 0,
      ).length /
        4) *
        100,
    );
  const payments = {
    total: args.paymentSummary?.total ?? 0,
    due: args.paymentSummary?.due ?? 0,
    pending: args.paymentSummary?.pending ?? 0,
    paid: args.paymentSummary?.paid ?? 0,
    overdue: args.paymentSummary?.overdue ?? 0,
  };
  const hasDates = Boolean(args.trip.starts_at && args.trip.ends_at);
  const hasFlexibleDates = args.trip.date_mode === "flexible" && !hasDates;
  const hasCoreDecision = Boolean(args.trip.destination && hasDates);
  const now = new Date();
  const startDate = args.trip.starts_at ? new Date(args.trip.starts_at) : null;
  const endDate = args.trip.ends_at ? new Date(args.trip.ends_at) : null;
  const votingDeadline = args.trip.voting_deadline ? new Date(args.trip.voting_deadline) : null;
  const daysUntilStart =
    startDate ? Math.ceil((startDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;
  const deadlineLabel = votingDeadline
    ? `Voting deadline ${new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(votingDeadline)}`
    : startDate
      ? `Travel starts ${new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(startDate)}`
      : null;

  let phase: TripPhaseKey = "draft";

  if (args.trip.status === "cancelled") {
    phase = "cancelled";
  } else if (endDate && endDate.getTime() < now.getTime()) {
    phase = "completed";
  } else if (payments.due > 0 || payments.pending > 0 || payments.overdue > 0) {
    phase = "booking_and_payments";
  } else if (hasCoreDecision && daysUntilStart !== null && daysUntilStart <= 30 && daysUntilStart >= 0) {
    phase = "pre_trip";
  } else if (hasCoreDecision) {
    phase = "decision_locked";
  } else if (participantSummary.total > 0 && participantSummary.outstanding === 0 && participantSummary.responded > 0) {
    phase = "ready_to_decide";
  } else if (participantSummary.responded > 0 && participantSummary.outstanding > 0) {
    phase = "collecting_responses";
  } else if (participantSummary.total > 0) {
    phase = "invites_sent";
  }

  const currentDecision = !args.trip.destination
    ? "Pick the destination"
    : hasFlexibleDates
      ? "Confirm the final date window"
      : !hasDates
      ? "Confirm the trip dates"
      : planningCounts.hotels === 0
        ? "Choose the accommodation"
        : planningCounts.activities === 0
          ? "Shape the activity plan"
          : participantSummary.outstanding > 0
            ? "Collect the remaining responses"
            : "Lock the next group decision";

  const leadingOption = getLeadingOptionLabel({
    trip: args.trip,
    hotels: args.hotels ?? [],
    activities: args.activities ?? [],
    transport: args.transport ?? [],
    dining: args.dining ?? [],
    voting: args.voting,
  });

  let nextAction = "Keep the group aligned and move the trip forward.";

  if (!args.trip.destination) {
    nextAction = "Add destination ideas so the group has something concrete to react to.";
  } else if (hasFlexibleDates) {
    nextAction = "You can keep planning with open dates, but Journi should keep reminding the organiser to finalise them.";
  } else if (!hasDates) {
    nextAction = "Add candidate dates to start narrowing down availability.";
  } else if (participantSummary.total === 0) {
    nextAction = "Invite the group so responses can start coming in.";
  } else if (participantSummary.outstanding > 0) {
    nextAction = `Chase ${participantSummary.outstanding} outstanding participant${
      participantSummary.outstanding === 1 ? "" : "s"
    } for a response.`;
  } else if (planningCounts.hotels === 0) {
    nextAction = "Add accommodation options and let the group compare them.";
  } else if (planningCounts.activities === 0) {
    nextAction = "Add activity options so the group can shape the plan.";
  } else if (args.trip.status === "draft") {
    nextAction = "Publish the hub so the latest decisions are visible to everyone.";
  } else if (payments.due > 0 || payments.pending > 0) {
    nextAction = "Follow up on payments and confirm who is financially committed.";
  } else if (phase === "pre_trip") {
    nextAction = "Share the final itinerary, reminders, and anything people need before departure.";
  } else {
    nextAction = "Review the leading option and lock the decision with the group.";
  }

  const confidenceScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        (args.trip.destination ? 25 : 0) +
          ((hasDates || hasFlexibleDates) ? 25 : 0) +
          (participantSummary.total
            ? (participantSummary.responded / participantSummary.total) * 25
            : 0) +
          (planningProgress / 100) * 25,
      ),
    ),
  );

  let confidenceMessage = "No data yet — start by adding destinations.";

  if (args.trip.destination && hasFlexibleDates) {
    confidenceMessage = "Destination is set and dates are still open. Keep planning, but make sure the organiser comes back to lock the final window.";
  } else if (args.trip.destination && !hasDates) {
    confidenceMessage = "Destination aligned. Add dates so the group can move forward.";
  } else if (hasDates && participantSummary.outstanding > 0) {
    confidenceMessage = `Dates are in place. Waiting for ${participantSummary.outstanding} participant${
      participantSummary.outstanding === 1 ? "" : "s"
    } to respond.`;
  } else if (participantSummary.total > 0 && participantSummary.outstanding === 0 && !hasCoreDecision) {
    confidenceMessage = "Responses are in. Review the leading option and make the call.";
  } else if (hasCoreDecision && planningProgress < 100) {
    confidenceMessage = "Core trip decision locked. Finish the remaining planning modules next.";
  } else if (phase === "pre_trip") {
    confidenceMessage = "The trip is nearly ready. Focus on reminders, documents, and final confirmations.";
  } else if (phase === "completed") {
    confidenceMessage = "Trip completed. Use the hub to close balances and capture feedback.";
  }

  return {
    phase,
    phaseLabel: getPhaseLabel(phase),
    currentDecision,
    leadingOption,
    nextAction,
    deadlineLabel,
    latestChange: describeLatestChange(
      args.trip,
      args.participants,
      new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }),
    ),
    confidenceScore,
    confidenceMessage,
    participantSummary,
  } satisfies TripWorkspaceStatusSummary;
}

export function buildVoteChartData<T extends { id: string }>(
  items: T[],
  itemVotes: Record<string, { votes: number; voterIds: string[] }> | undefined,
  getLabel: (item: T) => string,
) {
  return items
    .map<VoteChartDatum>((item) => ({
      id: item.id,
      label: getLabel(item),
      value: itemVotes?.[item.id]?.votes ?? 0,
    }))
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label));
}
