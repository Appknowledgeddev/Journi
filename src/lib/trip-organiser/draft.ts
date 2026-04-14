"use client";

export type TripFormDraft = {
  title: string;
  destination: string;
  description: string;
  status: string;
  startsAt: string;
  endsAt: string;
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
  savedAt: string;
};

const STORAGE_KEY = "journi.tripOrganiserDraft";

export function saveTripOrganiserDraft(draft: TripOrganiserDraft) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
}

export function readTripOrganiserDraft() {
  if (typeof window === "undefined") {
    return null;
  }

  const rawDraft = window.sessionStorage.getItem(STORAGE_KEY);

  if (!rawDraft) {
    return null;
  }

  try {
    return JSON.parse(rawDraft) as TripOrganiserDraft;
  } catch {
    return null;
  }
}

export function clearTripOrganiserDraft() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(STORAGE_KEY);
}
