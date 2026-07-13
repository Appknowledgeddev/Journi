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
const STORAGE_KEY_PREFIX = `${STORAGE_KEY}:`;

function getStorageKey(userId?: string | null) {
  return userId ? `${STORAGE_KEY}:${userId}` : STORAGE_KEY;
}

export function saveTripOrganiserDraft(draft: TripOrganiserDraft, userId?: string | null) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(getStorageKey(userId), JSON.stringify(draft));
}

export function readTripOrganiserDraft(userId?: string | null) {
  if (typeof window === "undefined") {
    return null;
  }

  const storageKey = getStorageKey(userId);
  const rawDraft = userId
    ? window.localStorage.getItem(storageKey)
    : window.localStorage.getItem(storageKey) ?? window.sessionStorage.getItem(LEGACY_STORAGE_KEY);

  if (!rawDraft) {
    return null;
  }

  try {
    const parsedDraft = JSON.parse(rawDraft) as TripOrganiserDraft;

    if (!userId) {
      // Migrate older session-only drafts forward so "save and return later" survives reloads.
      window.localStorage.setItem(storageKey, JSON.stringify(parsedDraft));
      window.sessionStorage.removeItem(LEGACY_STORAGE_KEY);
    }

    return parsedDraft;
  } catch {
    return null;
  }
}

export function clearTripOrganiserDraft(userId?: string | null, options?: { includeLegacy?: boolean }) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(getStorageKey(userId));

  if (options?.includeLegacy) {
    window.localStorage.removeItem(STORAGE_KEY);
  }

  window.sessionStorage.removeItem(STORAGE_KEY);
}

export function clearAllTripOrganiserDrafts() {
  if (typeof window === "undefined") {
    return;
  }

  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index);

    if (key === STORAGE_KEY || key?.startsWith(STORAGE_KEY_PREFIX)) {
      window.localStorage.removeItem(key);
    }
  }

  window.sessionStorage.removeItem(STORAGE_KEY);
}
