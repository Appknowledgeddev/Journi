export type TripDetail = {
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

export type TripParticipant = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  status: string;
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
