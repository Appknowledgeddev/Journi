"use client";

export type TripFormDraft = {
  title: string;
  destination: string;
  description: string;
  status: string;
  tripType: string;
  audience: string;
  dateMode: string;
  startsAt: string;
  endsAt: string;
  dateOptions?: Array<{
    id: string;
    startsAt: string;
    endsAt: string;
  }>;
  votingDeadline: string;
  groupSize: string;
  budgetMode: string;
  budgetBand: string;
  totalBudget: string;
  budgetPerPersonMin: number | null;
  budgetPerPersonMax: number | null;
  aiDescriptionGenerated: boolean;
  coverImageUrl: string;
};

export type HotelDraft = {
  name: string;
  location: string;
  bookingUrl: string;
  notes: string;
  googlePlaceId?: string;
  sourcePhotoUrl?: string;
  sourcePhotoAttribution?: string;
  latitude?: number | null;
  longitude?: number | null;
};

export type ActivityDraft = {
  title: string;
  location: string;
  bookingUrl: string;
  notes: string;
  googlePlaceId?: string;
  sourcePhotoUrl?: string;
  sourcePhotoAttribution?: string;
  latitude?: number | null;
  longitude?: number | null;
};

export type TransportDraft = {
  mode: string;
  provider: string;
  departureLocation: string;
  arrivalLocation: string;
  notes: string;
  googlePlaceId?: string;
  sourcePhotoUrl?: string;
  sourcePhotoAttribution?: string;
  latitude?: number | null;
  longitude?: number | null;
};

export type DiningDraft = {
  name: string;
  location: string;
  cuisine: string;
  reservationUrl: string;
  notes: string;
  googlePlaceId?: string;
  sourcePhotoUrl?: string;
  sourcePhotoAttribution?: string;
  latitude?: number | null;
  longitude?: number | null;
};

export type ParticipantInviteDraft = {
  fullName: string;
  email: string;
};

export type TripOrganiserDraft = {
  tripForm: TripFormDraft;
  hotels: HotelDraft[];
  activities: ActivityDraft[];
  transport: TransportDraft[];
  dining: DiningDraft[];
  invites?: ParticipantInviteDraft[];
  activeStepKey?: string;
  savedAt: string;
};

const STORAGE_KEY = "journi.tripOrganiserDraft";
const LEGACY_STORAGE_KEY = STORAGE_KEY;

export function saveTripOrganiserDraft(draft: TripOrganiserDraft) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
}

export function readTripOrganiserDraft() {
  if (typeof window === "undefined") {
    return null;
  }

  const rawDraft =
    window.localStorage.getItem(STORAGE_KEY) ?? window.sessionStorage.getItem(LEGACY_STORAGE_KEY);

  if (!rawDraft) {
    return null;
  }

  try {
    const parsedDraft = JSON.parse(rawDraft) as TripOrganiserDraft;

    // Migrate older session-only drafts forward so "save and return later" survives reloads.
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(parsedDraft));
    window.sessionStorage.removeItem(LEGACY_STORAGE_KEY);

    return parsedDraft;
  } catch {
    return null;
  }
}

export function clearTripOrganiserDraft() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(STORAGE_KEY);
  window.sessionStorage.removeItem(STORAGE_KEY);
}
