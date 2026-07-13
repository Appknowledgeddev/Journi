"use client";

import { DateRange, DayPicker } from "react-day-picker";
import { useRouter, useSearchParams } from "next/navigation";
import { ReactNode, useEffect, useRef, useState } from "react";
import {
  FiCalendar,
  FiCheck,
  FiChevronLeft,
  FiChevronRight,
  FiEdit3,
  FiImage,
  FiMapPin,
  FiX,
} from "react-icons/fi";
import { AppShell } from "@/components/app-shell";
import { TripUpgradeModal } from "@/components/trip-upgrade-modal";
import styles from "@/components/app-page.module.css";
import { supabase } from "@/lib/supabase/client";
import {
  audienceFilters,
  budgetBands,
  derivePerPersonBudgetFromTotal,
  getAudienceLabel,
  getBudgetBandLabel,
  getGroupSizeLabel,
  groupSizeBands,
  parseNumericInput,
  type BudgetMode,
  type DateMode,
} from "@/lib/trip-organiser/config";
import {
  clearAllTripOrganiserDrafts,
  clearTripOrganiserDraft,
  type ParticipantInviteDraft,
  readTripOrganiserDraft,
  saveTripOrganiserDraft,
  type TripOrganiserDraft,
} from "@/lib/trip-organiser/draft";

type TripFormState = {
  title: string;
  destination: string;
  description: string;
  status: string;
  tripType: string;
  audience: string;
  dateMode: DateMode;
  startsAt: string;
  endsAt: string;
  dateOptions: DateOption[];
  votingDeadline: string;
  groupSize: string;
  budgetMode: BudgetMode;
  budgetBand: string;
  totalBudget: string;
  budgetPerPersonMin: number | null;
  budgetPerPersonMax: number | null;
  aiDescriptionGenerated: boolean;
  coverImageUrl: string;
};

type DateOption = {
  id: string;
  startsAt: string;
  endsAt: string;
};

type HotelOption = {
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

type HotelSearchResult = HotelOption & {
  id: string;
  latitude: number | null;
  longitude: number | null;
  photoUrl?: string;
  photoAttribution?: string;
};

type HotelDetails = {
  id: string;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  websiteUri: string;
  googleMapsUri: string;
  rating: number | null;
  userRatingCount: number | null;
  phone: string;
  openingHours: string[];
  summary: string;
  photos: Array<{
    url: string;
    attribution: string;
  }>;
  reviews: Array<{
    author: string;
    authorUrl: string;
    authorPhotoUrl: string;
    rating: number | null;
    text: string;
    published: string;
  }>;
};

type ActivitySearchResult = ActivityOption & {
  id: string;
  latitude: number | null;
  longitude: number | null;
  photoUrl?: string;
  photoAttribution?: string;
};

type TransportSearchResult = TransportOption & {
  id: string;
  bookingUrl?: string;
  latitude: number | null;
  longitude: number | null;
  photoUrl?: string;
  photoAttribution?: string;
};

type DiningSearchResult = DiningOption & {
  id: string;
  latitude: number | null;
  longitude: number | null;
  photoUrl?: string;
  photoAttribution?: string;
};

type DestinationSuggestion = {
  id: string;
  label: string;
};

type DestinationPhoto = {
  id: string;
  url: string;
  attribution: string;
  placeName: string;
  subtitle: string;
};

type ActivityOption = {
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

type TransportOption = {
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

type DiningOption = {
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

type StepKey = "details" | "hotels" | "activities" | "transport" | "dining" | "finalise";
type HotelDetailsTab = "overview" | "gallery" | "map" | "reviews" | "practical";

const steps: Array<{ key: StepKey; label: string; eyebrow: string }> = [
  { key: "details", label: "Trip basics", eyebrow: "Destination and dates" },
  { key: "hotels", label: "Select hotels", eyebrow: "API hotel search" },
  { key: "activities", label: "Activities", eyebrow: "Things to do" },
  { key: "transport", label: "Transport", eyebrow: "Getting around" },
  { key: "dining", label: "Dining", eyebrow: "Food plans" },
  { key: "finalise", label: "Review", eyebrow: "Final checks and invites" },
];

const initialTripForm: TripFormState = {
  title: "",
  destination: "",
  description: "",
  status: "draft",
  tripType: "",
  audience: "",
  dateMode: "set_dates",
  startsAt: "",
  endsAt: "",
  dateOptions: [],
  votingDeadline: "",
  groupSize: "4-6",
  budgetMode: "per_person",
  budgetBand: "400-650",
  totalBudget: "",
  budgetPerPersonMin: 400,
  budgetPerPersonMax: 650,
  aiDescriptionGenerated: false,
  coverImageUrl: "",
};

const emptyHotel: HotelOption = {
  name: "",
  location: "",
  bookingUrl: "",
  notes: "",
};

const emptyActivity: ActivityOption = {
  title: "",
  location: "",
  bookingUrl: "",
  notes: "",
};

const emptyTransport: TransportOption = {
  mode: "",
  provider: "",
  departureLocation: "",
  arrivalLocation: "",
  notes: "",
};

const emptyDining: DiningOption = {
  name: "",
  location: "",
  cuisine: "",
  reservationUrl: "",
  notes: "",
};

const suggestedDestinations = [
  "Mallorca",
  "Barcelona",
  "Paris",
  "Rome",
  "Lisbon",
  "Amsterdam",
  "Mykonos",
  "Ibiza",
];

function hasHotelValue(option: HotelOption) {
  return Boolean(option.name.trim());
}

function hasActivityValue(option: ActivityOption) {
  return Boolean(option.title.trim());
}

function hasTransportValue(option: TransportOption) {
  return Boolean(option.mode.trim());
}

function hasDiningValue(option: DiningOption) {
  return Boolean(option.name.trim());
}

function buildGoogleMapsPlaceUrl(name: string, location: string) {
  const query = [name, location].filter(Boolean).join(" ");

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function parseDateInput(value: string) {
  if (!value) {
    return undefined;
  }

  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return undefined;
  }

  return new Date(year, month - 1, day);
}

function formatDateInput(date?: Date) {
  if (!date) {
    return "";
  }

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatDateLabel(value: string) {
  const date = parseDateInput(value);

  if (!date) {
    return "";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatTripDateRange(startsAt: string | null, endsAt: string | null) {
  if (!startsAt && !endsAt) {
    return "Dates to be confirmed";
  }

  const startLabel = startsAt ? formatDateLabel(startsAt) : "";
  const endLabel = endsAt ? formatDateLabel(endsAt) : "";

  if (startLabel && endLabel) {
    return `${startLabel} to ${endLabel}`;
  }

  return startLabel || endLabel || "Dates to be confirmed";
}

function createDateOption(startsAt: string, endsAt: string): DateOption {
  return {
    id: `${startsAt}-${endsAt}-${Date.now()}`,
    startsAt,
    endsAt,
  };
}

function getTripDateOptions(tripForm: TripFormState) {
  if (tripForm.dateOptions.length > 0) {
    return tripForm.dateOptions;
  }

  if (tripForm.startsAt && tripForm.endsAt) {
    return [
      {
        id: `${tripForm.startsAt}-${tripForm.endsAt}`,
        startsAt: tripForm.startsAt,
        endsAt: tripForm.endsAt,
      },
    ];
  }

  return [];
}

function getDateOptionsSummary(dateOptions: DateOption[]) {
  if (dateOptions.length === 0) {
    return "Dates to be confirmed";
  }

  if (dateOptions.length === 1) {
    return formatTripDateRange(dateOptions[0].startsAt, dateOptions[0].endsAt);
  }

  return `${dateOptions.length} date options added`;
}

function findScrollParent(element: HTMLElement | null) {
  let current = element?.parentElement ?? null;

  while (current) {
    const { overflowY } = window.getComputedStyle(current);

    if (overflowY === "auto" || overflowY === "scroll") {
      return current;
    }

    current = current.parentElement;
  }

  return null;
}

function isElementVisibleInScrollRoot(element: HTMLElement, scrollRoot: HTMLElement | null) {
  const elementRect = element.getBoundingClientRect();

  if (scrollRoot) {
    const rootRect = scrollRoot.getBoundingClientRect();

    return elementRect.bottom > rootRect.top && elementRect.top < rootRect.bottom;
  }

  return elementRect.bottom > 0 && elementRect.top < window.innerHeight;
}

export default function TripOrganiserPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const destinationBlurTimeoutRef = useRef<number | null>(null);
  const hotelLoadMoreTriggerRef = useRef<HTMLDivElement | null>(null);
  const hotelCarouselRef = useRef<HTMLDivElement | null>(null);
  const activityCarouselRef = useRef<HTMLDivElement | null>(null);
  const transportCarouselRef = useRef<HTMLDivElement | null>(null);
  const diningCarouselRef = useRef<HTMLDivElement | null>(null);
  const tripBuilderTopRef = useRef<HTMLDivElement | null>(null);
  const hasRestoredDraftRef = useRef(false);
  const aiTypingIntervalRef = useRef<number | null>(null);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [tripForm, setTripForm] = useState<TripFormState>(initialTripForm);
  const [hotels, setHotels] = useState<HotelOption[]>([]);
  const [hotelResults, setHotelResults] = useState<HotelSearchResult[]>([]);
  const [hotelSearchQuery, setHotelSearchQuery] = useState("");
  const [hotelSearchError, setHotelSearchError] = useState<string | null>(null);
  const [isSearchingHotels, setIsSearchingHotels] = useState(false);
  const [isLoadingMoreHotels, setIsLoadingMoreHotels] = useState(false);
  const [hotelNextPageToken, setHotelNextPageToken] = useState<string | null>(null);
  const [destinationSuggestions, setDestinationSuggestions] = useState<DestinationSuggestion[]>([]);
  const [isLoadingDestinationSuggestions, setIsLoadingDestinationSuggestions] = useState(false);
  const [destinationCommitted, setDestinationCommitted] = useState(false);
  const [destinationPhotos, setDestinationPhotos] = useState<DestinationPhoto[]>([]);
  const [isLoadingDestinationPhotos, setIsLoadingDestinationPhotos] = useState(false);
  const [destinationGalleryOpen, setDestinationGalleryOpen] = useState(false);
  const [isEditingTripTitle, setIsEditingTripTitle] = useState(false);
  const [isEditingDestination, setIsEditingDestination] = useState(false);
  const [selectedHotelDetails, setSelectedHotelDetails] = useState<HotelDetails | null>(null);
  const [hotelDetailsError, setHotelDetailsError] = useState<string | null>(null);
  const [isLoadingHotelDetails, setIsLoadingHotelDetails] = useState(false);
  const [hotelDetailsTab, setHotelDetailsTab] = useState<HotelDetailsTab>("overview");
  const [showAllHotelsPanel, setShowAllHotelsPanel] = useState(false);
  const [activities, setActivities] = useState<ActivityOption[]>([{ ...emptyActivity }]);
  const [activityResults, setActivityResults] = useState<ActivitySearchResult[]>([]);
  const [activitySearchQuery, setActivitySearchQuery] = useState("");
  const [activitySearchError, setActivitySearchError] = useState<string | null>(null);
  const [isSearchingActivities, setIsSearchingActivities] = useState(false);
  const [showAllActivitiesPanel, setShowAllActivitiesPanel] = useState(false);
  const [transport, setTransport] = useState<TransportOption[]>([{ ...emptyTransport }]);
  const [transportResults, setTransportResults] = useState<TransportSearchResult[]>([]);
  const [transportSearchQuery, setTransportSearchQuery] = useState("");
  const [transportSearchError, setTransportSearchError] = useState<string | null>(null);
  const [isSearchingTransport, setIsSearchingTransport] = useState(false);
  const [showAllTransportPanel, setShowAllTransportPanel] = useState(false);
  const [dining, setDining] = useState<DiningOption[]>([{ ...emptyDining }]);
  const [diningResults, setDiningResults] = useState<DiningSearchResult[]>([]);
  const [diningSearchQuery, setDiningSearchQuery] = useState("");
  const [diningSearchError, setDiningSearchError] = useState<string | null>(null);
  const [isSearchingDining, setIsSearchingDining] = useState(false);
  const [showAllDiningPanel, setShowAllDiningPanel] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [draftOwnerId, setDraftOwnerId] = useState<string | null>(null);
  const [hasResolvedDraftOwner, setHasResolvedDraftOwner] = useState(false);
  const [pendingTripRange, setPendingTripRange] = useState<DateRange | undefined>(undefined);
  const [isEditingDates, setIsEditingDates] = useState(true);
  const [pendingDescription, setPendingDescription] = useState("");
  const [isEditingDescription, setIsEditingDescription] = useState(true);
  const [aiDescriptionError, setAiDescriptionError] = useState<string | null>(null);
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);
  const [isTypingDescription, setIsTypingDescription] = useState(false);
  const [invites, setInvites] = useState<ParticipantInviteDraft[]>([]);
  const [participantName, setParticipantName] = useState("");
  const [participantEmail, setParticipantEmail] = useState("");
  const [participantError, setParticipantError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [tripPassUnlocked, setTripPassUnlocked] = useState(false);

  const activeStep = steps[activeStepIndex];
  const hasDestination = Boolean(tripForm.destination.trim());
  const hasSelectedDestination = destinationCommitted && hasDestination;
  const showSelectedDestination = hasHydrated && hasSelectedDestination;
  const hasCoverImage = Boolean(tripForm.coverImageUrl.trim());
  const hasTripName = Boolean(tripForm.title.trim());
  const tripDateOptions = getTripDateOptions(tripForm);
  const hasTripDates = tripDateOptions.length > 0;
  const hasDatePlan = tripForm.dateMode === "flexible" ? true : hasTripDates;
  const hasSelectedHotels = hotels.length > 0;
  const hasSelectedActivities = activities.some(hasActivityValue);
  const hasSelectedTransport = transport.some(hasTransportValue);
  const hasSelectedDining = dining.some(hasDiningValue);
  const inviteCount = invites.length;
  const tripBasicsReady = hasSelectedDestination && hasCoverImage && hasTripName && hasDatePlan;
  const showDockedStepper = true;
  const pageStackClassName = `${styles.stack} ${styles.stepperDockLayout}`;
  const mainSectionClassName = styles.tripWorkspace;
  const showHotelsInline =
    activeStep.key === "details" && Boolean(tripForm.description.trim()) && !isEditingDescription;

  function isStepComplete(stepKey: StepKey) {
    switch (stepKey) {
      case "details":
        return tripBasicsReady;
      case "hotels":
        return hasSelectedHotels;
      case "activities":
        return hasSelectedActivities;
      case "transport":
        return hasSelectedTransport;
      case "dining":
        return hasSelectedDining;
      case "finalise":
        return tripBasicsReady && hasSelectedHotels && hasSelectedActivities && hasSelectedTransport && hasSelectedDining;
      default:
        return false;
    }
  }

  function buildCurrentDraft(nextStepKey?: StepKey): TripOrganiserDraft {
    return {
      tripForm: { ...tripForm },
      hotels: hotels.filter(hasHotelValue),
      activities: activities.filter(hasActivityValue),
      transport: transport.filter(hasTransportValue),
      dining: dining.filter(hasDiningValue),
      invites,
      activeStepKey: nextStepKey ?? activeStep.key,
      savedAt: new Date().toISOString(),
    };
  }

  function persistCurrentDraft(nextStepKey?: StepKey) {
    saveTripOrganiserDraft(buildCurrentDraft(nextStepKey), draftOwnerId);
  }

  function goToStep(stepKey: StepKey, options?: { scrollToTop?: boolean }) {
    const nextStepIndex = steps.findIndex((step) => step.key === stepKey);

    if (nextStepIndex >= 0) {
      setActiveStepIndex(nextStepIndex);

      if (options?.scrollToTop) {
        scrollToTripBuilderTop();
      }
    }
  }

  function updateBudgetFromMode(nextBudgetMode: BudgetMode, nextValues?: Partial<TripFormState>) {
    setTripForm((current) => {
      const baseState = {
        ...current,
        ...nextValues,
        budgetMode: nextBudgetMode,
      };

      if (nextBudgetMode === "overall") {
        const derivedBudget = derivePerPersonBudgetFromTotal(
          parseNumericInput(baseState.totalBudget),
          baseState.groupSize,
        );

        return {
          ...baseState,
          budgetBand: derivedBudget?.budgetBand || baseState.budgetBand,
          budgetPerPersonMin: derivedBudget?.min ?? null,
          budgetPerPersonMax: derivedBudget?.max ?? null,
        };
      }

      const selectedBand = budgetBands.find((option) => option.value === baseState.budgetBand);

      return {
        ...baseState,
        budgetPerPersonMin: selectedBand?.min ?? null,
        budgetPerPersonMax: selectedBand?.max ?? null,
      };
    });
  }

  function stopDescriptionTyping() {
    if (aiTypingIntervalRef.current !== null) {
      window.clearInterval(aiTypingIntervalRef.current);
      aiTypingIntervalRef.current = null;
    }
    setIsTypingDescription(false);
  }

  function typeGeneratedDescription(description: string, title?: string) {
    stopDescriptionTyping();

    const finalDescription = description.trim();
    let nextIndex = 0;
    setPendingDescription("");
    setIsEditingDescription(false);
    setIsTypingDescription(true);
    setTripForm((current) => ({
      ...current,
      title: current.title.trim() || title || current.title,
      description: "",
      aiDescriptionGenerated: true,
    }));

    aiTypingIntervalRef.current = window.setInterval(() => {
      nextIndex += 2;
      const nextDescription = finalDescription.slice(0, nextIndex);

      setPendingDescription(nextDescription);
      setTripForm((current) => ({
        ...current,
        description: nextDescription,
      }));

      if (nextIndex >= finalDescription.length) {
        stopDescriptionTyping();
        setPendingDescription(finalDescription);
        setTripForm((current) => ({
          ...current,
          description: finalDescription,
        }));
      }
    }, 18);
  }

  async function handleGenerateTripDescription() {
    if (!tripForm.destination.trim() && !tripForm.tripType.trim()) {
      setAiDescriptionError("Add a destination or trip type before generating a description.");
      return;
    }

    setIsGeneratingDescription(true);
    setAiDescriptionError(null);

    try {
      const response = await fetch("/api/trip-organiser/generate-description", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          destination: tripForm.destination,
          tripType: tripForm.tripType,
          audience: tripForm.audience,
          dateMode: tripForm.dateMode,
          startsAt: tripForm.startsAt,
          endsAt: tripForm.endsAt,
          groupSize: tripForm.groupSize,
          budgetMode: tripForm.budgetMode,
          budgetBand: tripForm.budgetBand,
          totalBudget: tripForm.totalBudget,
        }),
      });

      const data = (await response.json().catch(() => null)) as {
        title?: string;
        description?: string;
        error?: string;
      } | null;

      if (!response.ok) {
        setAiDescriptionError(data?.error || "Unable to generate a trip description right now.");
        return;
      }

      if (!data?.description?.trim()) {
        setAiDescriptionError("No description came back. Please try again.");
        return;
      }

      typeGeneratedDescription(data.description, data.title);
    } catch (error) {
      setAiDescriptionError(
        error instanceof Error ? error.message : "Unable to generate a trip description right now.",
      );
    } finally {
      setIsGeneratingDescription(false);
    }
  }

  async function loadDestinationPhotos(destination: string) {
    const nextDestination = destination.trim();

    if (nextDestination.length < 2) {
      setDestinationPhotos([]);
      return;
    }

    setIsLoadingDestinationPhotos(true);

    const response = await fetch("/api/destinations/photos", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ destination: nextDestination }),
    });

    const data = (await response.json()) as {
      photos?: DestinationPhoto[];
    };

    setDestinationPhotos(data.photos ?? []);
    setIsLoadingDestinationPhotos(false);
  }

  function applyDestinationSelection(nextDestination: string) {
    const trimmedDestination = nextDestination.trim();
    setDestinationCommitted(true);
    setDestinationGalleryOpen(true);

    setTripForm((current) => ({
      ...current,
      destination: trimmedDestination,
      coverImageUrl:
        current.destination.trim() === trimmedDestination ? current.coverImageUrl : "",
      title: current.title.trim() ? current.title : trimmedDestination ? `${trimmedDestination} trip` : "",
    }));
    setHotelSearchQuery(trimmedDestination);
    setHotelResults([]);
    setHotelNextPageToken(null);
    setHotels([]);
    setHotelSearchError(null);
    setDestinationSuggestions([]);
    setDestinationGalleryOpen(false);
    setIsEditingTripTitle(false);
    setIsEditingDestination(false);
    void loadDestinationPhotos(trimmedDestination);
  }

  async function handleSearchHotels() {
    const destination = hotelSearchQuery.trim() || tripForm.destination.trim();

    if (!destination) {
      setHotelSearchError("Add a destination before searching hotels.");
      return;
    }

    setIsSearchingHotels(true);
    setHotelSearchError(null);
    setHotelNextPageToken(null);

    const response = await fetch("/api/hotels/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ destination }),
    });

    const data = (await response.json()) as {
      hotels?: HotelSearchResult[];
      nextPageToken?: string | null;
      error?: string;
    };

    if (!response.ok) {
      setHotelResults([]);
      setHotelNextPageToken(null);
      setHotelSearchError(data.error || "Unable to search hotels.");
      setIsSearchingHotels(false);
      return;
    }

    setHotelResults(data.hotels ?? []);
    setHotelNextPageToken(data.nextPageToken ?? null);
    console.info("[Journi Hotels] Initial hotel search loaded", {
      destination,
      loadedCount: data.hotels?.length ?? 0,
      hasNextPage: Boolean(data.nextPageToken),
    });
    setIsSearchingHotels(false);
  }

  async function handleLoadMoreHotels() {
    const destination = hotelSearchQuery.trim() || tripForm.destination.trim();
    const nextPageToken = hotelNextPageToken;

    if (!destination || !nextPageToken) {
      return;
    }

    setIsLoadingMoreHotels(true);
    setHotelSearchError(null);
    console.info("[Journi Hotels] Loading more hotels", {
      destination,
      hasNextPageToken: Boolean(nextPageToken),
      currentLoadedCount: hotelResults.length,
    });

    let data:
      | {
          hotels?: HotelSearchResult[];
          nextPageToken?: string | null;
          error?: string;
        }
      | undefined;
    let response: Response | undefined;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      response = await fetch("/api/hotels/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ destination, pageToken: nextPageToken }),
      });

      data = (await response.json()) as {
        hotels?: HotelSearchResult[];
        nextPageToken?: string | null;
        error?: string;
      };

      if (response.ok) {
        break;
      }

      if (attempt === 0) {
        console.warn("[Journi Hotels] Next page token not ready yet, retrying once", {
          destination,
          error: data.error,
        });
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
      }
    }

    if (!response?.ok || !data) {
      console.error("[Journi Hotels] Unable to load more hotels", {
        destination,
        error: data?.error,
      });
      setHotelSearchError(data?.error || "Unable to load more hotels.");
      setIsLoadingMoreHotels(false);
      return;
    }

    setHotelResults((current) => {
      const seenIds = new Set(current.map((hotel) => hotel.id));
      const nextHotels = (data.hotels ?? []).filter((hotel) => !seenIds.has(hotel.id));

      return [...current, ...nextHotels];
    });
    setHotelNextPageToken(data.nextPageToken ?? null);
    console.info("[Journi Hotels] Loaded more hotels", {
      destination,
      addedCount: data.hotels?.length ?? 0,
      hasAnotherPage: Boolean(data.nextPageToken),
    });
    setIsLoadingMoreHotels(false);
  }

  async function handleSearchActivities() {
    const destination = activitySearchQuery.trim() || tripForm.destination.trim();

    if (!destination) {
      setActivitySearchError("Add a destination before searching activities.");
      return;
    }

    setIsSearchingActivities(true);
    setActivitySearchError(null);

    const response = await fetch("/api/activities/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ destination }),
    });

    const data = (await response.json()) as {
      activities?: ActivitySearchResult[];
      error?: string;
    };

    if (!response.ok) {
      setActivityResults([]);
      setActivitySearchError(data.error || "Unable to search activities.");
      setIsSearchingActivities(false);
      return;
    }

    setActivityResults(data.activities ?? []);
    setIsSearchingActivities(false);
  }

  function toggleActivitySelection(activity: ActivitySearchResult) {
    setActivities((current) => {
      const isSelected = current.some(
        (selectedActivity) =>
          selectedActivity.title === activity.title && selectedActivity.location === activity.location,
      );

      if (isSelected) {
        return current.filter(
          (selectedActivity) =>
            selectedActivity.title !== activity.title ||
            selectedActivity.location !== activity.location,
        );
      }

      const nextActivity = {
        title: activity.title,
        location: activity.location,
        bookingUrl: activity.bookingUrl,
        notes: activity.notes,
        googlePlaceId: activity.id,
        sourcePhotoUrl: activity.photoUrl,
        sourcePhotoAttribution: activity.photoAttribution,
        latitude: activity.latitude,
        longitude: activity.longitude,
      };

      const hasPlaceholderOnly =
        current.length === 1 &&
        !current[0].title.trim() &&
        !current[0].location.trim() &&
        !current[0].bookingUrl.trim() &&
        !current[0].notes.trim();

      return hasPlaceholderOnly ? [nextActivity] : [...current, nextActivity];
    });
  }

  function isActivitySelected(activity: ActivitySearchResult) {
    return activities.some(
      (selectedActivity) =>
        selectedActivity.title === activity.title && selectedActivity.location === activity.location,
    );
  }

  async function handleSearchTransport() {
    const destination = transportSearchQuery.trim() || tripForm.destination.trim();

    if (!destination) {
      setTransportSearchError("Add a destination before searching transport.");
      return;
    }

    setIsSearchingTransport(true);
    setTransportSearchError(null);

    const response = await fetch("/api/transport/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ destination }),
    });

    const data = (await response.json()) as {
      transport?: TransportSearchResult[];
      error?: string;
    };

    if (!response.ok) {
      setTransportResults([]);
      setTransportSearchError(data.error || "Unable to search transport.");
      setIsSearchingTransport(false);
      return;
    }

    setTransportResults(data.transport ?? []);
    setIsSearchingTransport(false);
  }

  function toggleTransportSelection(option: TransportSearchResult) {
    setTransport((current) => {
      const isSelected = current.some(
        (selectedOption) =>
          selectedOption.provider === option.provider &&
          selectedOption.arrivalLocation === option.arrivalLocation,
      );

      if (isSelected) {
        return current.filter(
          (selectedOption) =>
            selectedOption.provider !== option.provider ||
            selectedOption.arrivalLocation !== option.arrivalLocation,
        );
      }

      const nextOption = {
        mode: option.mode,
        provider: option.provider,
        departureLocation: option.departureLocation,
        arrivalLocation: option.arrivalLocation,
        notes: option.notes,
        googlePlaceId: option.id,
        sourcePhotoUrl: option.photoUrl,
        sourcePhotoAttribution: option.photoAttribution,
        latitude: option.latitude,
        longitude: option.longitude,
      };

      const hasPlaceholderOnly =
        current.length === 1 &&
        !current[0].mode.trim() &&
        !current[0].provider.trim() &&
        !current[0].departureLocation.trim() &&
        !current[0].arrivalLocation.trim() &&
        !current[0].notes.trim();

      return hasPlaceholderOnly ? [nextOption] : [...current, nextOption];
    });
  }

  function isTransportSelected(option: TransportSearchResult) {
    return transport.some(
      (selectedOption) =>
        selectedOption.provider === option.provider &&
        selectedOption.arrivalLocation === option.arrivalLocation,
    );
  }

  async function handleSearchDining() {
    const destination = diningSearchQuery.trim() || tripForm.destination.trim();

    if (!destination) {
      setDiningSearchError("Add a destination before searching dining.");
      return;
    }

    setIsSearchingDining(true);
    setDiningSearchError(null);

    const response = await fetch("/api/dining/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ destination }),
    });

    const data = (await response.json()) as {
      dining?: DiningSearchResult[];
      error?: string;
    };

    if (!response.ok) {
      setDiningResults([]);
      setDiningSearchError(data.error || "Unable to search dining.");
      setIsSearchingDining(false);
      return;
    }

    setDiningResults(data.dining ?? []);
    setIsSearchingDining(false);
  }

  function toggleDiningSelection(option: DiningSearchResult) {
    setDining((current) => {
      const isSelected = current.some(
        (selectedOption) =>
          selectedOption.name === option.name && selectedOption.location === option.location,
      );

      if (isSelected) {
        return current.filter(
          (selectedOption) =>
            selectedOption.name !== option.name || selectedOption.location !== option.location,
        );
      }

      const nextOption = {
        name: option.name,
        location: option.location,
        cuisine: option.cuisine,
        reservationUrl: option.reservationUrl,
        notes: option.notes,
        googlePlaceId: option.id,
        sourcePhotoUrl: option.photoUrl,
        sourcePhotoAttribution: option.photoAttribution,
        latitude: option.latitude,
        longitude: option.longitude,
      };

      const hasPlaceholderOnly =
        current.length === 1 &&
        !current[0].name.trim() &&
        !current[0].location.trim() &&
        !current[0].cuisine.trim() &&
        !current[0].reservationUrl.trim() &&
        !current[0].notes.trim();

      return hasPlaceholderOnly ? [nextOption] : [...current, nextOption];
    });
  }

  function isDiningSelected(option: DiningSearchResult) {
    return dining.some(
      (selectedOption) =>
        selectedOption.name === option.name && selectedOption.location === option.location,
    );
  }

  function toggleHotelSelection(hotel: HotelSearchResult) {
    setHotels((current) => {
      const isSelected = current.some(
        (selectedHotel) =>
          selectedHotel.name === hotel.name && selectedHotel.location === hotel.location,
      );

      if (isSelected) {
        return current.filter(
          (selectedHotel) =>
            selectedHotel.name !== hotel.name || selectedHotel.location !== hotel.location,
        );
      }

      return [
        ...current,
        {
          name: hotel.name,
          location: hotel.location,
          bookingUrl: hotel.bookingUrl,
          notes: hotel.notes,
          googlePlaceId: hotel.id,
          sourcePhotoUrl: hotel.photoUrl,
          sourcePhotoAttribution: hotel.photoAttribution,
          latitude: hotel.latitude,
          longitude: hotel.longitude,
        },
      ];
    });
  }

  function isHotelSelected(hotel: HotelSearchResult) {
    return hotels.some(
      (selectedHotel) =>
        selectedHotel.name === hotel.name && selectedHotel.location === hotel.location,
    );
  }

  async function handleViewHotelDetails(hotel: HotelSearchResult) {
    setIsLoadingHotelDetails(true);
    setHotelDetailsError(null);
    setHotelDetailsTab("overview");

    const response = await fetch("/api/hotels/details", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ placeId: hotel.id }),
    });

    const data = (await response.json()) as HotelDetails & { error?: string };

    if (!response.ok) {
      setHotelDetailsError(data.error || "Unable to load more hotel information.");
      setSelectedHotelDetails({
        id: hotel.id,
        name: hotel.name,
        address: hotel.location,
        latitude: hotel.latitude,
        longitude: hotel.longitude,
        websiteUri: hotel.bookingUrl,
        googleMapsUri: buildGoogleMapsPlaceUrl(hotel.name, hotel.location),
        rating: null,
        userRatingCount: null,
        phone: "",
        openingHours: [],
        summary: "",
        photos: hotel.photoUrl
          ? [
              {
                url: hotel.photoUrl,
                attribution: hotel.photoAttribution || "",
              },
            ]
          : [],
        reviews: [],
      });
      setIsLoadingHotelDetails(false);
      return;
    }

    setSelectedHotelDetails(data);
    setIsLoadingHotelDetails(false);
  }

  function scrollHotelCarousel(direction: "previous" | "next") {
    const carousel = hotelCarouselRef.current;

    if (!carousel) {
      return;
    }

    const scrollAmount = carousel.clientWidth * 0.82;
    carousel.scrollBy({
      left: direction === "next" ? scrollAmount : -scrollAmount,
      behavior: "smooth",
    });
  }

  function scrollActivityCarousel(direction: "previous" | "next") {
    const carousel = activityCarouselRef.current;

    if (!carousel) {
      return;
    }

    const scrollAmount = carousel.clientWidth * 0.82;
    carousel.scrollBy({
      left: direction === "next" ? scrollAmount : -scrollAmount,
      behavior: "smooth",
    });
  }

  function scrollTransportCarousel(direction: "previous" | "next") {
    const carousel = transportCarouselRef.current;

    if (!carousel) {
      return;
    }

    const scrollAmount = carousel.clientWidth * 0.82;
    carousel.scrollBy({
      left: direction === "next" ? scrollAmount : -scrollAmount,
      behavior: "smooth",
    });
  }

  function scrollDiningCarousel(direction: "previous" | "next") {
    const carousel = diningCarouselRef.current;

    if (!carousel) {
      return;
    }

    const scrollAmount = carousel.clientWidth * 0.82;
    carousel.scrollBy({
      left: direction === "next" ? scrollAmount : -scrollAmount,
      behavior: "smooth",
    });
  }

  useEffect(() => {
    if (activeStep.key !== "hotels") {
      return;
    }

    const destination = hotelSearchQuery.trim() || tripForm.destination.trim();

    if (!destination || isSearchingHotels || hotelResults.length > 0) {
      return;
    }

    void handleSearchHotels();
  }, [
    activeStep.key,
    hotelResults.length,
    hotelSearchQuery,
    isSearchingHotels,
    tripForm.destination,
  ]);

  useEffect(() => {
    if (!showHotelsInline) {
      return;
    }

    const destination = hotelSearchQuery.trim() || tripForm.destination.trim();

    if (!destination || isSearchingHotels || hotelResults.length > 0) {
      return;
    }

    void handleSearchHotels();
  }, [
    showHotelsInline,
    hotelResults.length,
    hotelSearchQuery,
    isSearchingHotels,
    tripForm.destination,
  ]);

  useEffect(() => {
    if (activeStep.key !== "activities") {
      return;
    }

    const destination = activitySearchQuery.trim() || tripForm.destination.trim();

    if (!destination || isSearchingActivities || activityResults.length > 0) {
      return;
    }

    void handleSearchActivities();
  }, [
    activeStep.key,
    activityResults.length,
    activitySearchQuery,
    isSearchingActivities,
    tripForm.destination,
  ]);

  useEffect(() => {
    if (activeStep.key !== "transport") {
      return;
    }

    const destination = transportSearchQuery.trim() || tripForm.destination.trim();

    if (!destination || isSearchingTransport || transportResults.length > 0) {
      return;
    }

    void handleSearchTransport();
  }, [
    activeStep.key,
    transportResults.length,
    transportSearchQuery,
    isSearchingTransport,
    tripForm.destination,
  ]);

  useEffect(() => {
    if (activeStep.key !== "dining") {
      return;
    }

    const destination = diningSearchQuery.trim() || tripForm.destination.trim();

    if (!destination || isSearchingDining || diningResults.length > 0) {
      return;
    }

    void handleSearchDining();
  }, [
    activeStep.key,
    diningResults.length,
    diningSearchQuery,
    isSearchingDining,
    tripForm.destination,
  ]);

  useEffect(() => {
    setHasHydrated(true);

    return () => {
      if (aiTypingIntervalRef.current !== null) {
        window.clearInterval(aiTypingIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function resolveDraftOwner() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!mounted) {
        return;
      }

      setDraftOwnerId(user?.id ?? null);
      setHasResolvedDraftOwner(true);
    }

    void resolveDraftOwner();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (hasRestoredDraftRef.current) {
      return;
    }

    if (!hasResolvedDraftOwner) {
      return;
    }

    const shouldRestoreDraft =
      searchParams.get("resume") === "1" || searchParams.get("checkout") === "complete";

    if (!shouldRestoreDraft) {
      clearAllTripOrganiserDrafts();
      setTripForm(initialTripForm);
      setHotels([]);
      setActivities([{ ...emptyActivity }]);
      setTransport([{ ...emptyTransport }]);
      setDining([{ ...emptyDining }]);
      setInvites([]);
      setDestinationCommitted(false);
      setPendingTripRange(undefined);
      setIsEditingDates(true);
      setPendingDescription("");
      setIsEditingDescription(true);
      setActiveStepIndex(0);
      hasRestoredDraftRef.current = true;
      return;
    }

    const storedDraft = readTripOrganiserDraft(draftOwnerId);

    if (!storedDraft) {
      hasRestoredDraftRef.current = true;
      return;
    }

    hasRestoredDraftRef.current = true;
    const storedDateOptions = storedDraft.tripForm?.dateOptions ?? [];
    const restoredTripForm = {
      ...initialTripForm,
      ...(storedDraft.tripForm ?? {}),
      dateMode:
        storedDraft.tripForm?.dateMode === "flexible" ? "flexible" : "set_dates",
      budgetMode:
        storedDraft.tripForm?.budgetMode === "overall" ? "overall" : "per_person",
      dateOptions:
        storedDateOptions.length > 0
          ? storedDateOptions
          : storedDraft.tripForm?.startsAt && storedDraft.tripForm?.endsAt
            ? [
                {
                  id: `${storedDraft.tripForm.startsAt}-${storedDraft.tripForm.endsAt}`,
                  startsAt: storedDraft.tripForm.startsAt,
                  endsAt: storedDraft.tripForm.endsAt,
                },
              ]
            : [],
    } satisfies TripFormState;
    setTripForm({
      ...restoredTripForm,
    });
    setHotels(storedDraft.hotels?.length ? storedDraft.hotels : []);
    setActivities(storedDraft.activities?.length ? storedDraft.activities : [{ ...emptyActivity }]);
    setTransport(storedDraft.transport?.length ? storedDraft.transport : [{ ...emptyTransport }]);
    setDining(storedDraft.dining?.length ? storedDraft.dining : [{ ...emptyDining }]);
    setInvites(storedDraft.invites ?? []);
    setDestinationCommitted(Boolean(restoredTripForm.destination.trim()));

    const requestedStep = (searchParams.get("step") as StepKey | null) ?? storedDraft.activeStepKey;
    const nextStepIndex = steps.findIndex((step) => step.key === requestedStep);

    if (nextStepIndex >= 0) {
      setActiveStepIndex(nextStepIndex);
    }
  }, [draftOwnerId, hasResolvedDraftOwner, searchParams]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const checkoutComplete = searchParams.get("checkout") === "complete";
    const checkoutProduct = searchParams.get("product");
    const storedUnlock = window.sessionStorage.getItem("journi-trip-pass-unlock") === "true";

    if (checkoutComplete && checkoutProduct === "trip_pass") {
      window.sessionStorage.setItem("journi-trip-pass-unlock", "true");
      setTripPassUnlocked(true);
      goToStep("finalise", { scrollToTop: true });
      return;
    }

    setTripPassUnlocked(storedUnlock);
  }, [searchParams]);

  useEffect(() => {
    if (!hasHydrated || !hasResolvedDraftOwner || !hasRestoredDraftRef.current) {
      return;
    }

    const hasAnyDraftContent = Boolean(
      tripForm.title.trim() ||
        tripForm.destination.trim() ||
        tripForm.description.trim() ||
        tripForm.coverImageUrl.trim() ||
        hotels.some(hasHotelValue) ||
        activities.some(hasActivityValue) ||
        transport.some(hasTransportValue) ||
        dining.some(hasDiningValue) ||
        invites.length,
    );

    if (!hasAnyDraftContent) {
      return;
    }

    persistCurrentDraft();
  }, [
    activeStep.key,
    activities,
    dining,
    hasHydrated,
    hasResolvedDraftOwner,
    hotels,
    invites,
    transport,
    tripForm,
  ]);

  useEffect(() => {
    setIsEditingDates(!(tripForm.startsAt && tripForm.endsAt));
  }, [tripForm.startsAt, tripForm.endsAt]);

  useEffect(() => {
    setPendingDescription(tripForm.description);
  }, [tripForm.description]);

  useEffect(() => {
    setIsEditingDescription(!tripForm.description.trim());
  }, [tripForm.description]);

  useEffect(() => {
    if (activeStep.key !== "details") {
      return;
    }

    const query = tripForm.destination.trim();

    if (query.length < 2) {
      setDestinationSuggestions([]);
      return;
    }

    if (destinationCommitted) {
      setDestinationSuggestions([]);
      return;
    }

    const timeout = window.setTimeout(async () => {
      setIsLoadingDestinationSuggestions(true);

      const response = await fetch("/api/destinations/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      });

      const data = (await response.json()) as {
        destinations?: DestinationSuggestion[];
      };

      setDestinationSuggestions(data.destinations ?? []);
      setIsLoadingDestinationSuggestions(false);
    }, 280);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [activeStep.key, destinationCommitted, tripForm.destination]);

  useEffect(() => {
    return () => {
      if (destinationBlurTimeoutRef.current) {
        window.clearTimeout(destinationBlurTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const trigger = hotelLoadMoreTriggerRef.current;
    const scrollRoot = findScrollParent(trigger);

    if (!trigger || !hotelNextPageToken || isLoadingMoreHotels || isSearchingHotels) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const firstEntry = entries[0];

        if (!firstEntry?.isIntersecting || isLoadingMoreHotels || isSearchingHotels) {
          return;
        }

        void handleLoadMoreHotels();
      },
      {
        root: scrollRoot,
        rootMargin: "0px 0px 320px 0px",
        threshold: 0.15,
      },
    );

    observer.observe(trigger);

    const handleScrollLoad = () => {
      const activeRoot = scrollRoot ?? document.documentElement;
      const scrollTop = scrollRoot ? scrollRoot.scrollTop : window.scrollY;
      const clientHeight = activeRoot.clientHeight;
      const scrollHeight = activeRoot.scrollHeight;
      const nearBottom = scrollHeight - (scrollTop + clientHeight) < 360;
      const hotelsVisible = isElementVisibleInScrollRoot(trigger, scrollRoot);

      if (hotelsVisible && nearBottom && !isLoadingMoreHotels && !isSearchingHotels) {
        void handleLoadMoreHotels();
      }
    };

    if (scrollRoot) {
      scrollRoot.addEventListener("scroll", handleScrollLoad, { passive: true });
    } else {
      window.addEventListener("scroll", handleScrollLoad, { passive: true });
    }

    handleScrollLoad();

    return () => {
      observer.disconnect();
      if (scrollRoot) {
        scrollRoot.removeEventListener("scroll", handleScrollLoad);
      } else {
        window.removeEventListener("scroll", handleScrollLoad);
      }
    };
  }, [hotelNextPageToken, isLoadingMoreHotels, isSearchingHotels]);

  useEffect(() => {
    if (!hotelNextPageToken || isLoadingMoreHotels || isSearchingHotels) {
      return;
    }

    const trigger = hotelLoadMoreTriggerRef.current;
    const scrollRoot = findScrollParent(trigger);
    const activeRoot = scrollRoot ?? document.documentElement;
    const scrollTop = scrollRoot ? scrollRoot.scrollTop : window.scrollY;
    const clientHeight = activeRoot.clientHeight;
    const scrollHeight = activeRoot.scrollHeight;
    const nearBottom = scrollHeight - (scrollTop + clientHeight) < 360;

    if (trigger && isElementVisibleInScrollRoot(trigger, scrollRoot) && nearBottom) {
      void handleLoadMoreHotels();
    }
  }, [hotelResults.length, hotelNextPageToken, isLoadingMoreHotels, isSearchingHotels]);

  async function uploadTripImage(file: File, userId: string) {
    if (!file) {
      return;
    }

    setIsUploadingImage(true);
    setCreateError(null);

    const extension = file.name.split(".").pop() || "jpg";
    const filePath = `${userId}/${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from("trip-images")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      setCreateError(`Image upload failed: ${uploadError.message}`);
      setIsUploadingImage(false);
      return;
    }

    const { data } = supabase.storage.from("trip-images").getPublicUrl(filePath);

    setTripForm((current) => ({
      ...current,
      coverImageUrl: data.publicUrl,
    }));
    setIsUploadingImage(false);
  }

  function renderHotelResultCard(hotel: HotelSearchResult) {
    const selected = isHotelSelected(hotel);

    return (
      <article
        key={hotel.id}
        className={selected ? styles.hotelResultCardSelected : styles.hotelResultCard}
      >
        {hotel.photoUrl ? (
          <img
            src={hotel.photoUrl}
            alt={hotel.name}
            className={styles.hotelResultImage}
          />
        ) : (
          <div className={styles.hotelResultImageFallback} />
        )}
        <strong>{hotel.name}</strong>
        <small>{hotel.location || "Location from API"}</small>
        <p>{hotel.notes}</p>
        {hotel.photoAttribution ? (
          <small className={styles.fieldHint}>Photo: {hotel.photoAttribution}</small>
        ) : null}
        <div className={styles.hotelCardActions}>
          <button
            type="button"
            className={styles.hotelActionButton}
            onClick={() => handleViewHotelDetails(hotel)}
          >
            View more
          </button>
          <button
            type="button"
            className={selected ? styles.hotelSelectButtonActive : styles.hotelSelectButton}
            onClick={() => toggleHotelSelection(hotel)}
          >
            {selected ? "Selected" : "Select"}
          </button>
        </div>
      </article>
    );
  }

  function renderHotelsSection() {
    return (
      <div className={`${styles.optionStack} ${styles.tripStepBody}`}>
        <div className={styles.rowTop}>
          <div>
            <p className={styles.eyebrow}>Hotels</p>
            <h3 className={styles.sectionHeading}>Add hotels</h3>
          </div>
        </div>

        <p className={styles.muted}>
          Search worldwide hotel data from the API, then select the hotels you want to save to
          this trip.
        </p>
        <p className={styles.fieldHint}>
          Loading hotel options for {tripForm.destination || "your destination"}.
        </p>

        {hotelSearchError ? (
          <p className={styles.formError}>{hotelSearchError}</p>
        ) : null}

        {hotelResults.length > 0 ? (
          <div className={styles.optionStack}>
            <div className={styles.carouselHeader}>
              <span>{hotelResults.length} hotel options loaded</span>
              <div className={styles.carouselControls}>
                <button
                  type="button"
                  className={styles.carouselButton}
                  onClick={() => scrollHotelCarousel("previous")}
                  aria-label="Previous hotels"
                >
                  <FiChevronLeft />
                </button>
                <button
                  type="button"
                  className={styles.carouselButton}
                  onClick={() => scrollHotelCarousel("next")}
                  aria-label="Next hotels"
                >
                  <FiChevronRight />
                </button>
              </div>
            </div>
            <div
              ref={hotelCarouselRef}
              className={styles.hotelCarousel}
              aria-label="Hotel options carousel"
            >
              {hotelResults.map((hotel) => (
                <div key={hotel.id} className={styles.hotelCarouselItem}>
                  {renderHotelResultCard(hotel)}
                </div>
              ))}
            </div>
            {hotelNextPageToken || isLoadingMoreHotels ? (
              <div ref={hotelLoadMoreTriggerRef} className={styles.hotelLoadMoreTrigger}>
                <span>
                  {isLoadingMoreHotels ? "Loading more hotels..." : "Scroll to load more hotels"}
                </span>
                {!isLoadingMoreHotels ? (
                  <button
                    type="button"
                    className={styles.inlineEditLink}
                    onClick={handleLoadMoreHotels}
                  >
                    Load more now
                  </button>
                ) : null}
              </div>
            ) : null}
            <div className={styles.carouselFooter}>
              <button
                type="button"
                className={styles.secondaryAction}
                onClick={() => setShowAllHotelsPanel(true)}
              >
                View all hotels
              </button>
            </div>
          </div>
        ) : null}

        {!isSearchingHotels && !hotelSearchError && hotelResults.length === 0 ? (
          <div className={styles.emptyState}>
            <h3>No hotel results loaded yet.</h3>
            <p>Hotel options for this trip are still loading.</p>
          </div>
        ) : null}

      </div>
    );
  }

  function renderActivityResultCard(activity: ActivitySearchResult) {
    const selected = isActivitySelected(activity);

    return (
      <article
        key={activity.id}
        className={selected ? styles.hotelResultCardSelected : styles.hotelResultCard}
      >
        {activity.photoUrl ? (
          <img
            src={activity.photoUrl}
            alt={activity.title}
            className={styles.hotelResultImage}
          />
        ) : (
          <div className={styles.hotelResultImageFallback} />
        )}
        <strong>{activity.title}</strong>
        <small>{activity.location || "Location from Google"}</small>
        <p>{activity.notes}</p>
        {activity.photoAttribution ? (
          <small className={styles.fieldHint}>Photo: {activity.photoAttribution}</small>
        ) : null}
        <div className={styles.hotelCardActions}>
          <a
            href={
              activity.bookingUrl ||
              buildGoogleMapsPlaceUrl(activity.title, activity.location)
            }
            target="_blank"
            rel="noreferrer"
            className={styles.hotelActionLink}
          >
            View more
          </a>
          <button
            type="button"
            className={selected ? styles.hotelSelectButtonActive : styles.hotelSelectButton}
            onClick={() => toggleActivitySelection(activity)}
          >
            {selected ? "Selected" : "Select"}
          </button>
        </div>
      </article>
    );
  }

  function renderActivitiesSection() {
    return (
      <div className={`${styles.optionStack} ${styles.tripStepBody}`}>
        <div className={styles.rowTop}>
          <div>
            <p className={styles.eyebrow}>Activities</p>
            <h3 className={styles.sectionHeading}>Add activities</h3>
          </div>
        </div>

        <p className={styles.muted}>
          Load activity ideas from Google and select the ones you want to include in the trip.
        </p>
        <p className={styles.fieldHint}>
          Loading activity ideas for {tripForm.destination || "your destination"}.
        </p>

        {activitySearchError ? <p className={styles.formError}>{activitySearchError}</p> : null}

        {activityResults.length > 0 ? (
          <div className={styles.optionStack}>
            <div className={styles.carouselHeader}>
              <span>{activityResults.length} activity options loaded</span>
              <div className={styles.carouselControls}>
                <button
                  type="button"
                  className={styles.carouselButton}
                  onClick={() => scrollActivityCarousel("previous")}
                  aria-label="Previous activities"
                >
                  <FiChevronLeft />
                </button>
                <button
                  type="button"
                  className={styles.carouselButton}
                  onClick={() => scrollActivityCarousel("next")}
                  aria-label="Next activities"
                >
                  <FiChevronRight />
                </button>
              </div>
            </div>
            <div
              ref={activityCarouselRef}
              className={styles.hotelCarousel}
              aria-label="Activity options carousel"
            >
              {activityResults.map((activity) => (
                <div key={activity.id} className={styles.hotelCarouselItem}>
                  {renderActivityResultCard(activity)}
                </div>
              ))}
            </div>
            <div className={styles.carouselFooter}>
              <button
                type="button"
                className={styles.secondaryAction}
                onClick={() => setShowAllActivitiesPanel(true)}
              >
                View all activities
              </button>
            </div>
          </div>
        ) : null}

        {!isSearchingActivities && !activitySearchError && activityResults.length === 0 ? (
          <div className={styles.emptyState}>
            <h3>No activity results loaded yet.</h3>
            <p>Activity ideas for this trip are still loading.</p>
          </div>
        ) : null}
      </div>
    );
  }

  function scrollToTripBuilderTop() {
    tripBuilderTopRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function renderSelectedHotelsSummary() {
    if (!hasSelectedHotels) {
      return null;
    }

    const selectedHotels = hotels.map((hotel) => {
      const match = hotelResults.find(
        (result) => result.name === hotel.name && result.location === hotel.location,
      );

      return {
        ...hotel,
        photoUrl: match?.photoUrl ?? "",
        photoAttribution: match?.photoAttribution ?? "",
      };
    });

    return (
      <div className={styles.optionFormCard}>
        <div className={styles.rowTop}>
          <div>
            <p className={styles.eyebrow}>Hotels</p>
            <h3 className={styles.sectionHeading}>Selected stays</h3>
            <p className={styles.muted}>Your saved shortlist for {tripForm.destination}.</p>
          </div>
          <button
            type="button"
            className={styles.inlineEditLink}
            onClick={() => {
              setCreateError(null);
              setActiveStepIndex(1);
              scrollToTripBuilderTop();
            }}
          >
            Edit hotels
          </button>
        </div>
        <div className={styles.selectionSummaryGrid}>
          {selectedHotels.map((hotel) => (
            <article key={`${hotel.name}-${hotel.location}`} className={styles.selectionSummaryCard}>
              {hotel.photoUrl ? (
                <img
                  src={hotel.photoUrl}
                  alt={hotel.name}
                  className={styles.selectionSummaryImage}
                />
              ) : (
                <div className={styles.selectionSummaryImageFallback} />
              )}
              <div className={styles.selectionSummaryBody}>
                <strong>{hotel.name}</strong>
                <small>{hotel.location || "Location ready to confirm"}</small>
                <p>{hotel.notes || "Saved from Google hotel results."}</p>
                {hotel.photoAttribution ? (
                  <span className={styles.fieldHint}>Photo: {hotel.photoAttribution}</span>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </div>
    );
  }

  function renderSelectedActivitiesSummary() {
    if (!hasSelectedActivities) {
      return null;
    }

    const selectedActivities = activities.filter(hasActivityValue).map((activity) => {
      const match = activityResults.find(
        (result) => result.title === activity.title && result.location === activity.location,
      );

      return {
        ...activity,
        photoUrl: match?.photoUrl ?? "",
        photoAttribution: match?.photoAttribution ?? "",
      };
    });

    return (
      <div className={styles.optionFormCard}>
        <div className={styles.rowTop}>
          <div>
            <p className={styles.eyebrow}>Activities</p>
            <h3 className={styles.sectionHeading}>Selected activities</h3>
            <p className={styles.muted}>The experiences already added into this trip.</p>
          </div>
          <button
            type="button"
            className={styles.inlineEditLink}
            onClick={() => {
              setCreateError(null);
              setActiveStepIndex(2);
              scrollToTripBuilderTop();
            }}
          >
            Edit activities
          </button>
        </div>
        <div className={styles.selectionSummaryGrid}>
          {selectedActivities.map((activity) => (
            <article
              key={`${activity.title}-${activity.location}`}
              className={styles.selectionSummaryCard}
            >
              {activity.photoUrl ? (
                <img
                  src={activity.photoUrl}
                  alt={activity.title}
                  className={styles.selectionSummaryImage}
                />
              ) : (
                <div className={styles.selectionSummaryImageFallback} />
              )}
              <div className={styles.selectionSummaryBody}>
                <strong>{activity.title}</strong>
                <small>{activity.location || "Activity location"}</small>
                <p>{activity.notes || "Saved from Google activity ideas."}</p>
                {activity.photoAttribution ? (
                  <span className={styles.fieldHint}>Photo: {activity.photoAttribution}</span>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </div>
    );
  }

  function renderSelectedTransportSummary() {
    if (!hasSelectedTransport) {
      return null;
    }

    const selectedTransportOptions = transport.filter(hasTransportValue).map((option) => {
      const match = transportResults.find(
        (result) =>
          result.provider === option.provider && result.arrivalLocation === option.arrivalLocation,
      );

      return {
        ...option,
        photoUrl: match?.photoUrl ?? "",
        photoAttribution: match?.photoAttribution ?? "",
      };
    });

    return (
      <div className={styles.optionFormCard}>
        <div className={styles.rowTop}>
          <div>
            <p className={styles.eyebrow}>Transport</p>
            <h3 className={styles.sectionHeading}>Selected transport</h3>
            <p className={styles.muted}>How this trip is going to move from place to place.</p>
          </div>
          <button
            type="button"
            className={styles.inlineEditLink}
            onClick={() => {
              setCreateError(null);
              setActiveStepIndex(3);
              scrollToTripBuilderTop();
            }}
          >
            Edit transport
          </button>
        </div>
        <div className={styles.selectionSummaryGrid}>
          {selectedTransportOptions.map((option) => (
            <article
              key={`${option.provider}-${option.arrivalLocation}-${option.mode}`}
              className={styles.selectionSummaryCard}
            >
              {option.photoUrl ? (
                <img
                  src={option.photoUrl}
                  alt={option.provider || option.mode}
                  className={styles.selectionSummaryImage}
                />
              ) : (
                <div className={styles.selectionSummaryImageFallback} />
              )}
              <div className={styles.selectionSummaryBody}>
                <strong>{option.provider || option.mode}</strong>
                <small>{option.mode}</small>
                <p>
                  {option.departureLocation && option.arrivalLocation
                    ? `${option.departureLocation} to ${option.arrivalLocation}`
                    : option.arrivalLocation || "Transport route ready to confirm"}
                </p>
                {option.photoAttribution ? (
                  <span className={styles.fieldHint}>Photo: {option.photoAttribution}</span>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </div>
    );
  }

  function renderSelectedDiningSummary() {
    if (!hasSelectedDining) {
      return null;
    }

    const selectedDiningOptions = dining.filter(hasDiningValue).map((option) => {
      const match = diningResults.find(
        (result) => result.name === option.name && result.location === option.location,
      );

      return {
        ...option,
        photoUrl: match?.photoUrl ?? "",
        photoAttribution: match?.photoAttribution ?? "",
      };
    });

    return (
      <div className={styles.optionFormCard}>
        <div className={styles.rowTop}>
          <div>
            <p className={styles.eyebrow}>Dining</p>
            <h3 className={styles.sectionHeading}>Selected dining</h3>
            <p className={styles.muted}>Restaurants and food stops saved into this trip.</p>
          </div>
          <button
            type="button"
            className={styles.inlineEditLink}
            onClick={() => {
              setCreateError(null);
              goToStep("dining", { scrollToTop: true });
            }}
          >
            Edit dining
          </button>
        </div>
        <div className={styles.selectionSummaryGrid}>
          {selectedDiningOptions.map((option) => (
            <article
              key={`${option.name}-${option.location}`}
              className={styles.selectionSummaryCard}
            >
              {option.photoUrl ? (
                <img
                  src={option.photoUrl}
                  alt={option.name}
                  className={styles.selectionSummaryImage}
                />
              ) : (
                <div className={styles.selectionSummaryImageFallback} />
              )}
              <div className={styles.selectionSummaryBody}>
                <strong>{option.name}</strong>
                <small>{option.cuisine || "Dining option"}</small>
                <p>{option.location || "Restaurant location ready to confirm"}</p>
                {option.photoAttribution ? (
                  <span className={styles.fieldHint}>Photo: {option.photoAttribution}</span>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </div>
    );
  }

  function renderTripContinuationCard(
    content: ReactNode,
    options?: {
      showHotels?: boolean;
      showActivities?: boolean;
      showTransport?: boolean;
      showDining?: boolean;
    },
  ) {
    return (
      <div className={styles.tripForm}>
        <div className={styles.tripBuilderCard}>
          {tripForm.coverImageUrl ? (
            <div className={styles.tripImagePreviewWrap}>
              <img
                src={tripForm.coverImageUrl}
                alt="Trip cover preview"
                className={styles.imagePreview}
              />
              <div className={styles.tripImageTextOverlay}>
                {showSelectedDestination ? (
                  <p className={styles.tripImageMeta}>
                    <FiMapPin />
                    <span>Destination</span>
                  </p>
                ) : null}
                <h1 className={styles.tripImageTitle}>
                  {tripForm.destination || "Your trip"}
                </h1>
                <p className={styles.tripImageSubtitle}>
                  {tripForm.title.trim() || "Keep building your trip"}
                </p>
              </div>
            </div>
          ) : (
            <div className={styles.tripImagePlaceholder}>
              <div className={styles.tripImagePlaceholderCopy}>
                <p className={styles.tripImageMetaPlaceholder}>Trip planner</p>
                <h2 className={styles.tripImagePlaceholderTitle}>
                  {tripForm.destination || "Your trip"}
                </h2>
                <p className={styles.tripImagePlaceholderBody}>
                  {tripForm.title.trim() || "Keep building your trip"}
                </p>
              </div>
            </div>
          )}

          <div className={styles.tripBuilderBody}>
            {hasTripDates ? (
              <div className={styles.dateOptionList}>
                {tripDateOptions.map((option, index) => (
                  <div key={option.id} className={styles.dateRangeInline}>
                    <div className={styles.dateRangeSummary}>
                      <span>Option {index + 1}</span>
                      <span className={styles.dateRangeDivider}>·</span>
                      <span>{formatDateLabel(option.startsAt)}</span>
                      <span className={styles.dateRangeDivider}>to</span>
                      <span>{formatDateLabel(option.endsAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {tripForm.description.trim() ? (
              <div className={styles.field}>
                <div className={styles.rowTop}>
                  <span>Description</span>
                </div>
                <p className={styles.muted}>{tripForm.description}</p>
              </div>
            ) : null}

            <div className={styles.grid2}>
              <div className={styles.infoCard}>
                <span className={styles.tripFactLabel}>Trip type</span>
                <strong>{tripForm.tripType.trim() || "Type to be confirmed"}</strong>
                <p className={styles.muted}>{getAudienceLabel(tripForm.audience)}</p>
              </div>
              <div className={styles.infoCard}>
                <span className={styles.tripFactLabel}>Dates</span>
                <strong>
                  {tripForm.dateMode === "flexible"
                    ? "Flexible / open dates"
                    : getDateOptionsSummary(tripDateOptions)}
                </strong>
                <p className={styles.muted}>
                  {tripForm.votingDeadline
                    ? `Voting deadline ${formatDateLabel(tripForm.votingDeadline)}`
                    : "No voting deadline set yet"}
                </p>
              </div>
              <div className={styles.infoCard}>
                <span className={styles.tripFactLabel}>Group size</span>
                <strong>{getGroupSizeLabel(tripForm.groupSize)}</strong>
                <p className={styles.muted}>Launch minimum stays anchored at four people.</p>
              </div>
              <div className={styles.infoCard}>
                <span className={styles.tripFactLabel}>Budget</span>
                <strong>
                  {tripForm.budgetMode === "overall" && tripForm.totalBudget.trim()
                    ? `£${tripForm.totalBudget.trim()} overall`
                    : getBudgetBandLabel(tripForm.budgetBand)}
                </strong>
                <p className={styles.muted}>
                  {tripForm.budgetPerPersonMin
                    ? `Approx. £${tripForm.budgetPerPersonMin}${
                        tripForm.budgetPerPersonMax ? `-£${tripForm.budgetPerPersonMax}` : "+"
                      } per person`
                    : "Budget guide still to confirm"}
                </p>
              </div>
            </div>

            {options?.showHotels ? renderSelectedHotelsSummary() : null}
            {options?.showActivities ? renderSelectedActivitiesSummary() : null}
            {options?.showTransport ? renderSelectedTransportSummary() : null}
            {options?.showDining ? renderSelectedDiningSummary() : null}
            {content}
          </div>
        </div>
      </div>
    );
  }

  function renderTransportResultCard(option: TransportSearchResult) {
    const selected = isTransportSelected(option);

    return (
      <article
        key={option.id}
        className={selected ? styles.hotelResultCardSelected : styles.hotelResultCard}
      >
        {option.photoUrl ? (
          <img
            src={option.photoUrl}
            alt={option.provider}
            className={styles.hotelResultImage}
          />
        ) : (
          <div className={styles.hotelResultImageFallback} />
        )}
        <strong>{option.provider}</strong>
        <small>{option.mode}</small>
        <p>{option.arrivalLocation || "Transport option from Google"}</p>
        {option.photoAttribution ? (
          <small className={styles.fieldHint}>Photo: {option.photoAttribution}</small>
        ) : null}
        <div className={styles.hotelCardActions}>
          <a
            href={
              option.bookingUrl ||
              buildGoogleMapsPlaceUrl(option.provider, option.arrivalLocation)
            }
            target="_blank"
            rel="noreferrer"
            className={styles.hotelActionLink}
          >
            View more
          </a>
          <button
            type="button"
            className={selected ? styles.hotelSelectButtonActive : styles.hotelSelectButton}
            onClick={() => toggleTransportSelection(option)}
          >
            {selected ? "Selected" : "Select"}
          </button>
        </div>
      </article>
    );
  }

  function renderTransportSection() {
    return (
      <div className={`${styles.optionStack} ${styles.tripStepBody}`}>
        <div className={styles.rowTop}>
          <div>
            <p className={styles.eyebrow}>Transport</p>
            <h3 className={styles.sectionHeading}>Add transport</h3>
          </div>
        </div>

        <p className={styles.muted}>
          Load transport ideas from Google and select the ones that fit this trip.
        </p>
        <p className={styles.fieldHint}>
          Loading transport ideas for {tripForm.destination || "your destination"}.
        </p>

        {transportSearchError ? <p className={styles.formError}>{transportSearchError}</p> : null}

        {transportResults.length > 0 ? (
          <div className={styles.optionStack}>
            <div className={styles.carouselHeader}>
              <span>{transportResults.length} transport options loaded</span>
              <div className={styles.carouselControls}>
                <button
                  type="button"
                  className={styles.carouselButton}
                  onClick={() => scrollTransportCarousel("previous")}
                  aria-label="Previous transport options"
                >
                  <FiChevronLeft />
                </button>
                <button
                  type="button"
                  className={styles.carouselButton}
                  onClick={() => scrollTransportCarousel("next")}
                  aria-label="Next transport options"
                >
                  <FiChevronRight />
                </button>
              </div>
            </div>
            <div
              ref={transportCarouselRef}
              className={styles.hotelCarousel}
              aria-label="Transport options carousel"
            >
              {transportResults.map((option) => (
                <div key={option.id} className={styles.hotelCarouselItem}>
                  {renderTransportResultCard(option)}
                </div>
              ))}
            </div>
            <div className={styles.carouselFooter}>
              <button
                type="button"
                className={styles.secondaryAction}
                onClick={() => setShowAllTransportPanel(true)}
              >
                View all transport
              </button>
            </div>
          </div>
        ) : null}

        {!isSearchingTransport && !transportSearchError && transportResults.length === 0 ? (
          <div className={styles.emptyState}>
            <h3>No transport results loaded yet.</h3>
            <p>Transport ideas for this trip are still loading.</p>
          </div>
        ) : null}
      </div>
    );
  }

  function renderDiningResultCard(option: DiningSearchResult) {
    const selected = isDiningSelected(option);

    return (
      <article
        key={option.id}
        className={selected ? styles.hotelResultCardSelected : styles.hotelResultCard}
      >
        {option.photoUrl ? (
          <img
            src={option.photoUrl}
            alt={option.name}
            className={styles.hotelResultImage}
          />
        ) : (
          <div className={styles.hotelResultImageFallback} />
        )}
        <strong>{option.name}</strong>
        <small>{option.cuisine}</small>
        <p>{option.location || "Dining option from Google"}</p>
        {option.photoAttribution ? (
          <small className={styles.fieldHint}>Photo: {option.photoAttribution}</small>
        ) : null}
        <div className={styles.hotelCardActions}>
          <a
            href={
              option.reservationUrl ||
              buildGoogleMapsPlaceUrl(option.name, option.location)
            }
            target="_blank"
            rel="noreferrer"
            className={styles.hotelActionLink}
          >
            View more
          </a>
          <button
            type="button"
            className={selected ? styles.hotelSelectButtonActive : styles.hotelSelectButton}
            onClick={() => toggleDiningSelection(option)}
          >
            {selected ? "Selected" : "Select"}
          </button>
        </div>
      </article>
    );
  }

  function renderDiningSection() {
    return (
      <div className={`${styles.optionStack} ${styles.tripStepBody}`}>
        <div className={styles.rowTop}>
          <div>
            <p className={styles.eyebrow}>Dining</p>
            <h3 className={styles.sectionHeading}>Add dining</h3>
          </div>
        </div>

        <p className={styles.muted}>
          Load restaurants and dining ideas from Google and select the ones that fit this trip.
        </p>
        <p className={styles.fieldHint}>
          Loading dining ideas for {tripForm.destination || "your destination"}.
        </p>

        {diningSearchError ? <p className={styles.formError}>{diningSearchError}</p> : null}

        {diningResults.length > 0 ? (
          <div className={styles.optionStack}>
            <div className={styles.carouselHeader}>
              <span>{diningResults.length} dining options loaded</span>
              <div className={styles.carouselControls}>
                <button
                  type="button"
                  className={styles.carouselButton}
                  onClick={() => scrollDiningCarousel("previous")}
                  aria-label="Previous dining options"
                >
                  <FiChevronLeft />
                </button>
                <button
                  type="button"
                  className={styles.carouselButton}
                  onClick={() => scrollDiningCarousel("next")}
                  aria-label="Next dining options"
                >
                  <FiChevronRight />
                </button>
              </div>
            </div>
            <div
              ref={diningCarouselRef}
              className={styles.hotelCarousel}
              aria-label="Dining options carousel"
            >
              {diningResults.map((option) => (
                <div key={option.id} className={styles.hotelCarouselItem}>
                  {renderDiningResultCard(option)}
                </div>
              ))}
            </div>
            <div className={styles.carouselFooter}>
              <button
                type="button"
                className={styles.secondaryAction}
                onClick={() => setShowAllDiningPanel(true)}
              >
                View all dining
              </button>
            </div>
          </div>
        ) : null}

        {!isSearchingDining && !diningSearchError && diningResults.length === 0 ? (
          <div className={styles.emptyState}>
            <h3>No dining results loaded yet.</h3>
            <p>Dining ideas for this trip are still loading.</p>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <AppShell
      title="Create your trip"
    >
      {({ userId, loading, email, isPro }) => {
        const freeInviteLimit = 5;
        const canInviteTravellers = isPro || tripPassUnlocked || invites.length < freeInviteLimit;

        function handleGoToFinalise() {
          if (!userId) {
            setCreateError("You need to be signed in before saving this trip.");
            return;
          }

          if (!tripBasicsReady) {
            setCreateError(
              "Finish destination, cover image, trip name, and your date plan before moving to finalise.",
            );
            goToStep("details", { scrollToTop: true });
            return;
          }

          if (!hasSelectedHotels) {
            setCreateError("Select at least one hotel before finalising the trip.");
            goToStep("hotels", { scrollToTop: true });
            return;
          }

          if (!hasSelectedActivities) {
            setCreateError("Select at least one activity before finalising the trip.");
            goToStep("activities", { scrollToTop: true });
            return;
          }

          if (!hasSelectedTransport) {
            setCreateError("Select at least one transport option before finalising the trip.");
            goToStep("transport", { scrollToTop: true });
            return;
          }

          if (!hasSelectedDining) {
            setCreateError("Select at least one dining option before finalising the trip.");
            goToStep("dining", { scrollToTop: true });
            return;
          }

          setCreateError(null);
          persistCurrentDraft("finalise");
          goToStep("finalise");
        }

        function handleSaveAndExit() {
          persistCurrentDraft();
          router.push("/trips");
        }

        function handleAddInvite(event: React.FormEvent<HTMLFormElement>) {
          event.preventDefault();

          if (!isPro && !tripPassUnlocked && invites.length >= freeInviteLimit) {
            setParticipantError(
              "Free plan organisers can invite up to 5 travellers per trip. Upgrade to Pro organiser or use a Trip Pass to invite more.",
            );
            setShowUpgradeModal(true);
            return;
          }

          if (!participantEmail.trim()) {
            setParticipantError("Traveller email is required.");
            return;
          }

          const emailValue = participantEmail.trim().toLowerCase();
          const duplicateInvite = invites.some((invite) => invite.email === emailValue);

          if (duplicateInvite) {
            setParticipantError("That traveller has already been added to this trip.");
            return;
          }

          const nextInvites = [
            ...invites,
            {
              fullName: participantName.trim(),
              email: emailValue,
            },
          ];

          setInvites(nextInvites);
          setParticipantName("");
          setParticipantEmail("");
          setParticipantError(null);
          saveTripOrganiserDraft({
            ...buildCurrentDraft("finalise"),
            invites: nextInvites,
          }, draftOwnerId);
        }

        function handleRemoveInvite(emailToRemove: string) {
          const nextInvites = invites.filter((invite) => invite.email !== emailToRemove);
          setInvites(nextInvites);
          saveTripOrganiserDraft({
            ...buildCurrentDraft("finalise"),
            invites: nextInvites,
          }, draftOwnerId);
        }

        async function handleSaveTrip() {
          if (!userId) {
            setSaveError("You need to be signed in before saving this trip.");
            return;
          }

          if (!tripForm.title.trim()) {
            setSaveError("Trip name is required.");
            return;
          }

          setIsSaving(true);
          setSaveError(null);

          const {
            data: { session },
          } = await supabase.auth.getSession();

          if (!session?.access_token) {
            setSaveError("Your session has expired. Please sign in again before saving.");
            setIsSaving(false);
            return;
          }

          const draft = buildCurrentDraft("finalise");
          const response = await fetch("/api/trip-organiser/finalise", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              draft,
              origin: window.location.origin,
            }),
          });

          const result = (await response.json().catch(() => null)) as
            | { error?: string; tripId?: string; warning?: string }
            | null;

          if (!response.ok || !result?.tripId) {
            setSaveError(result?.error || "Unable to save this trip right now.");
            setIsSaving(false);
            return;
          }

          clearTripOrganiserDraft(draftOwnerId);
          if (typeof window !== "undefined") {
            window.sessionStorage.removeItem("journi-trip-pass-unlock");
          }
          setIsSaving(false);
          router.push(
            result.warning
              ? `/trips/${result.tripId}?inviteWarning=${encodeURIComponent(result.warning)}`
              : `/trips/${result.tripId}`,
          );
        }

        async function handleImageSelected(event: React.ChangeEvent<HTMLInputElement>) {
          const file = event.target.files?.[0];
          if (!file || !userId) {
            if (!userId) {
              setCreateError("You need to be signed in before uploading an image.");
            }
            return;
          }

          await uploadTripImage(file, userId);
          event.target.value = "";
        }

        async function handleImageDrop(event: React.DragEvent<HTMLDivElement>) {
          event.preventDefault();
          setIsDraggingImage(false);

          const file = event.dataTransfer.files?.[0];
          if (!file || !userId) {
            if (!userId) {
              setCreateError("You need to be signed in before uploading an image.");
            }
            return;
          }

          await uploadTripImage(file, userId);
        }

        const finaliseSection = renderTripContinuationCard(
          <div className={`${styles.optionStack} ${styles.tripStepBody}`}>
            <div className={styles.optionFormCard}>
              <div className={styles.rowTop}>
                <div>
                  <p className={styles.eyebrow}>Review</p>
                  <h3 className={styles.sectionHeading}>Finalise your trip hub</h3>
                  <p className={styles.muted}>
                    Review the shortlist, optionally queue traveller invites, then save the trip.
                  </p>
                </div>
                <span className={styles.badgeSoft}>Step 6 of 6</span>
              </div>

              <div className={styles.grid2}>
                <div className={styles.metricCard}>
                  <p className={styles.eyebrow}>Hotels</p>
                  <div className={styles.metricValue}>{hotels.filter(hasHotelValue).length}</div>
                  <p className={styles.metricMeta}>Selected stays ready to save</p>
                </div>
                <div className={styles.metricCard}>
                  <p className={styles.eyebrow}>Activities</p>
                  <div className={styles.metricValue}>
                    {activities.filter(hasActivityValue).length}
                  </div>
                  <p className={styles.metricMeta}>Chosen experiences for the trip</p>
                </div>
                <div className={styles.metricCard}>
                  <p className={styles.eyebrow}>Transport</p>
                  <div className={styles.metricValue}>
                    {transport.filter(hasTransportValue).length}
                  </div>
                  <p className={styles.metricMeta}>Ways the group can move around</p>
                </div>
                <div className={styles.metricCard}>
                  <p className={styles.eyebrow}>Dining</p>
                  <div className={styles.metricValue}>{dining.filter(hasDiningValue).length}</div>
                  <p className={styles.metricMeta}>Restaurants and food plans saved</p>
                </div>
              </div>
            </div>

            <div className={styles.optionFormCard}>
              <div className={styles.rowTop}>
                <div>
                  <p className={styles.eyebrow}>Traveller invites</p>
                  <h3 className={styles.sectionHeading}>Add people now or come back later</h3>
                  <p className={styles.muted}>
                    Email invites are optional at this stage. You can save the trip now and invite
                    people later from the trip workspace.
                  </p>
                </div>
                <div className={styles.headerActions}>
                  {isPro ? (
                    <span className={styles.badgeSuccess}>Pro organiser</span>
                  ) : tripPassUnlocked ? (
                    <span className={styles.badgeSoft}>Trip Pass unlocked</span>
                  ) : (
                    <span className={styles.badgeSoft}>Free plan: {freeInviteLimit} invites</span>
                  )}
                  <span className={styles.badge}>{inviteCount} queued</span>
                </div>
              </div>

              {!canInviteTravellers ? (
                <div className={styles.publishGateCard}>
                  <p className={styles.publishGateCopy}>
                    You have used the {freeInviteLimit} free traveller invites for this trip. Use a
                    Trip Pass or upgrade the account to Pro organiser to invite more.
                  </p>
                  <div className={styles.headerActions}>
                    <button
                      type="button"
                      className={styles.secondaryAction}
                      onClick={() => setShowUpgradeModal(true)}
                    >
                      Unlock invites
                    </button>
                  </div>
                </div>
              ) : null}

              <form className={styles.inviteForm} onSubmit={handleAddInvite}>
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

                {participantError ? <p className={styles.formError}>{participantError}</p> : null}

                <div className={styles.formActions}>
                  <button type="submit" className={styles.primaryAction}>
                    Add traveller
                  </button>
                </div>
              </form>

              <div className={styles.participantsList}>
                {inviteCount === 0 ? (
                  <div className={styles.emptyState}>
                    <p>No travellers queued yet.</p>
                  </div>
                ) : (
                  invites.map((invite) => (
                    <article key={invite.email} className={styles.participantCard}>
                      <div className={styles.rowTop}>
                        <span className={styles.rowTitle}>{invite.fullName || invite.email}</span>
                        <button
                          type="button"
                          className={styles.inlineEditLink}
                          onClick={() => handleRemoveInvite(invite.email)}
                        >
                          Remove
                        </button>
                      </div>
                      <div className={styles.tripMetaRow}>
                        <span>{invite.email}</span>
                        <span>Invite queued</span>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </div>

            {saveError ? <p className={styles.formError}>{saveError}</p> : null}

            <div className={styles.headerActions}>
              <button
                type="button"
                className={styles.secondaryAction}
                onClick={handleSaveAndExit}
              >
                Save and come back later
              </button>
              <button
                type="button"
                className={styles.primaryAction}
                onClick={handleSaveTrip}
                disabled={isSaving || loading}
              >
                {isSaving ? "Saving trip..." : "Save whole trip"}
              </button>
            </div>
          </div>,
          {
            showHotels: true,
            showActivities: true,
            showTransport: true,
            showDining: true,
          },
        );

        return (
          <div className={pageStackClassName}>
            <section className={mainSectionClassName}>
              <div className={styles.tripPanel} ref={tripBuilderTopRef}>
                {activeStep.key === "details" ? (
                  <div className={styles.tripForm}>
                    <div className={styles.tripBuilderCard}>
                      {!hasHydrated ? (
                        <div className={styles.tripImageHeaderButton}>
                          <div className={styles.tripImagePlaceholder} />
                        </div>
                      ) : (
                        <div className={styles.tripImageHeaderButton}>
                          {tripForm.coverImageUrl ? (
                          <div className={styles.tripImagePreviewWrap}>
                            <img
                              src={tripForm.coverImageUrl}
                              alt="Trip cover preview"
                              className={styles.imagePreview}
                            />
                            <div className={styles.tripImageTextOverlay}>
                              {showSelectedDestination ? (
                                <p className={styles.tripImageMeta}>
                                  <FiMapPin />
                                  <span>Destination</span>
                                </p>
                              ) : null}
                              {showSelectedDestination && isEditingDestination ? (
                                <input
                                  value={tripForm.destination}
                                  onChange={(event) => {
                                    const nextDestination = event.target.value;
                                    setDestinationCommitted(false);
                                    setTripForm((current) => ({
                                      ...current,
                                      destination: nextDestination,
                                      coverImageUrl: "",
                                    }));
                                    setHotelSearchQuery(nextDestination);
                                    setHotelResults([]);
                                    setHotelNextPageToken(null);
                                    setHotels([]);
                                    setHotelSearchError(null);
                                    setDestinationPhotos([]);
                                  }}
                                  onFocus={() => {
                                    if (destinationBlurTimeoutRef.current) {
                                      window.clearTimeout(destinationBlurTimeoutRef.current);
                                    }
                                  }}
                                  onBlur={() => {
                                    destinationBlurTimeoutRef.current = window.setTimeout(() => {
                                      setDestinationSuggestions([]);
                                      void loadDestinationPhotos(tripForm.destination);
                                    }, 140);
                                  }}
                                  placeholder="Choose your destination"
                                  className={styles.tripInlineTitleInput}
                                />
                              ) : (
                                <button
                                  type="button"
                                  className={styles.tripInlineTrigger}
                                  onClick={() => {
                                    if (showSelectedDestination) {
                                      setIsEditingDestination(true);
                                      setIsEditingTripTitle(false);
                                    }
                                  }}
                                >
                                  <h1 className={styles.tripImageTitle}>
                                    {showSelectedDestination
                                      ? tripForm.destination
                                      : "Choose your destination"}
                                  </h1>
                                </button>
                              )}
                              {showSelectedDestination && (isEditingTripTitle || !tripForm.title.trim()) ? (
                                <input
                                  value={tripForm.title}
                                  onChange={(event) =>
                                    setTripForm((current) => ({
                                      ...current,
                                      title: event.target.value,
                                    }))
                                  }
                                  placeholder={`${tripForm.destination} getaway`}
                                  className={styles.tripInlineSubtitleInput}
                                />
                              ) : (
                                <button
                                  type="button"
                                  className={styles.tripInlineTrigger}
                                  onClick={() => {
                                    if (showSelectedDestination) {
                                      setIsEditingTripTitle(true);
                                      setIsEditingDestination(false);
                                    }
                                  }}
                                >
                                  <p className={styles.tripImageSubtitle}>
                                    {tripForm.title.trim() ||
                                      (showSelectedDestination
                                        ? "Add a trip name next"
                                        : "Select where this trip is going to begin")}
                                  </p>
                                </button>
                              )}
                            </div>
                            <button
                              type="button"
                              className={styles.tripImageActionChip}
                              onClick={() => setDestinationGalleryOpen(true)}
                            >
                              {tripForm.coverImageUrl ? "Change photo" : "Add photo"}
                            </button>
                          </div>
                          ) : (
                          <div className={styles.tripImagePlaceholder}>
                            <div
                              style={{
                                position: "absolute",
                                left: "24px",
                                right: "24px",
                                bottom: "18px",
                                zIndex: 1,
                                display: "grid",
                                justifyItems: "start",
                                gap: "8px",
                                textAlign: "left",
                              }}
                            >
                              {showSelectedDestination ? (
                                <>
                                  <p className={styles.tripImageMetaPlaceholder}>Add photo</p>
                                  {isEditingDestination ? (
                                    <input
                                      value={tripForm.destination}
                                      onChange={(event) => {
                                        const nextDestination = event.target.value;
                                        setDestinationCommitted(false);
                                        setTripForm((current) => ({
                                          ...current,
                                          destination: nextDestination,
                                          coverImageUrl: "",
                                        }));
                                        setHotelSearchQuery(nextDestination);
                                        setHotelResults([]);
                                        setHotelNextPageToken(null);
                                        setHotels([]);
                                        setHotelSearchError(null);
                                        setDestinationPhotos([]);
                                      }}
                                      onFocus={() => {
                                        if (destinationBlurTimeoutRef.current) {
                                          window.clearTimeout(destinationBlurTimeoutRef.current);
                                        }
                                      }}
                                      onBlur={() => {
                                        destinationBlurTimeoutRef.current = window.setTimeout(() => {
                                          setDestinationSuggestions([]);
                                          void loadDestinationPhotos(tripForm.destination);
                                        }, 140);
                                      }}
                                      placeholder="Choose your destination"
                                      className={styles.tripInlineTitleInput}
                                    />
                                  ) : (
                                    <button
                                      type="button"
                                      className={styles.tripInlineTrigger}
                                      onClick={() => {
                                        setIsEditingDestination(true);
                                        setIsEditingTripTitle(false);
                                      }}
                                    >
                                      <h2 className={styles.tripImagePlaceholderTitle}>
                                        {tripForm.destination}
                                      </h2>
                                    </button>
                                  )}
                                  {isEditingTripTitle || !tripForm.title.trim() ? (
                                    <input
                                      value={tripForm.title}
                                      onChange={(event) =>
                                        setTripForm((current) => ({
                                          ...current,
                                          title: event.target.value,
                                        }))
                                      }
                                      placeholder={`${tripForm.destination} getaway`}
                                      className={styles.tripInlineSubtitleInput}
                                    />
                                  ) : (
                                    <p className={styles.tripImagePlaceholderBody}>
                                      Tap add photo to bring this trip to life.
                                    </p>
                                  )}
                                </>
                              ) : null}
                            </div>
                            {showSelectedDestination ? (
                              <button
                                type="button"
                                className={styles.tripImageActionChip}
                                onClick={() => setDestinationGalleryOpen(true)}
                              >
                                Add photo
                              </button>
                            ) : null}
                          </div>
                          )}
                        </div>
                      )}

                      <div className={styles.tripBuilderBody}>
                        {!showSelectedDestination ? (
                          <div className={styles.displayPromptCard}>
                            <p className={styles.displayPromptLabel}>Destination</p>
                            <input
                              value={tripForm.destination}
                              onChange={(event) => {
                                const nextDestination = event.target.value;
                                setDestinationCommitted(false);
                                setTripForm((current) => ({
                                  ...current,
                                  destination: nextDestination,
                                  coverImageUrl: "",
                                }));
                                setHotelSearchQuery(nextDestination);
                                setHotelResults([]);
                                setHotelNextPageToken(null);
                                setHotels([]);
                                setHotelSearchError(null);
                                setDestinationPhotos([]);
                              }}
                              onFocus={() => {
                                if (destinationBlurTimeoutRef.current) {
                                  window.clearTimeout(destinationBlurTimeoutRef.current);
                                }
                              }}
                              onBlur={() => {
                                destinationBlurTimeoutRef.current = window.setTimeout(() => {
                                  setDestinationSuggestions([]);
                                  void loadDestinationPhotos(tripForm.destination);
                                }, 140);
                              }}
                              placeholder="Where are you going?"
                              className={styles.displayPromptInput}
                              style={{
                                display: "block",
                                width: "100%",
                                border: "0",
                                background: "transparent",
                                color: "#112640",
                                fontSize: "clamp(1.9rem, 4vw, 3.1rem)",
                                fontWeight: 800,
                                letterSpacing: "-0.04em",
                                lineHeight: "0.96",
                                padding: 0,
                                outline: "none",
                                boxShadow: "none",
                                appearance: "none",
                                WebkitAppearance: "none",
                              }}
                            />
                            {isLoadingDestinationSuggestions ? (
                              <small className={styles.fieldHint}>Loading suggestions...</small>
                            ) : null}
                            {destinationSuggestions.length > 0 ? (
                              <div className={styles.suggestionList}>
                                {destinationSuggestions.map((destination) => (
                                  <button
                                    key={destination.id || destination.label}
                                    type="button"
                                    className={styles.suggestionItem}
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => applyDestinationSelection(destination.label)}
                                  >
                                    {destination.label}
                                  </button>
                                ))}
                              </div>
                            ) : null}

                            {!showSelectedDestination ? (
                              <div className={styles.optionStack}>
                                <p className={styles.fieldHint}>Popular destinations</p>
                                <div className={styles.destinationChipRow}>
                                  {suggestedDestinations.map((destination) => (
                                    <button
                                      key={destination}
                                      type="button"
                                      className={styles.destinationChip}
                                      onClick={() => applyDestinationSelection(destination)}
                                    >
                                      {destination}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        {hasCoverImage ? (
                          <>
                            <div className={styles.formGrid}>
                              <label className={styles.field}>
                                <span>Trip type</span>
                                <input
                                  value={tripForm.tripType}
                                  onChange={(event) =>
                                    setTripForm((current) => ({
                                      ...current,
                                      tripType: event.target.value,
                                    }))
                                  }
                                  placeholder="Birthday, anniversary, hen, friends getaway"
                                />
                              </label>
                              <div className={styles.field}>
                                <span>Audience</span>
                                <select
                                  value={tripForm.audience}
                                  onChange={(event) =>
                                    setTripForm((current) => ({
                                      ...current,
                                      audience: event.target.value,
                                    }))
                                  }
                                >
                                  <option value="">Open to all</option>
                                  {audienceFilters.map((option) => (
                                    <option
                                      key={option.value}
                                      value={option.value}
                                    >
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className={styles.field}>
                                <span>Group size</span>
                                <div className={styles.tripFilter}>
                                  {groupSizeBands.map((option) => (
                                    <button
                                      key={option.value}
                                      type="button"
                                      className={
                                        tripForm.groupSize === option.value
                                          ? styles.tripFilterButtonActive
                                          : styles.tripFilterButton
                                      }
                                      onClick={() =>
                                        updateBudgetFromMode(tripForm.budgetMode, {
                                          groupSize: option.value,
                                        })
                                      }
                                    >
                                      {option.label}
                                    </button>
                                  ))}
                                </div>
                                <small className={styles.fieldHint}>
                                  Journi launch trips start at a minimum of 4 people.
                                </small>
                              </div>
                              <div className={styles.field}>
                                <span>Participant response deadline</span>
                                <input
                                  type="date"
                                  value={tripForm.votingDeadline}
                                  onChange={(event) =>
                                    setTripForm((current) => ({
                                      ...current,
                                      votingDeadline: event.target.value,
                                    }))
                                  }
                                />
                                <small className={styles.fieldHint}>
                                  Optional but recommended. Once the trip is saved, treat this as the
                                  live voting deadline.
                                </small>
                              </div>
                            </div>

                            <div className={styles.field}>
                              <div className={styles.rowTop}>
                                <span>Date planning</span>
                              </div>
                              <div className={styles.tripFilter}>
                                <button
                                  type="button"
                                  className={
                                    tripForm.dateMode === "set_dates"
                                      ? styles.tripFilterButtonActive
                                      : styles.tripFilterButton
                                  }
                                  onClick={() =>
                                    setTripForm((current) => ({
                                      ...current,
                                      dateMode: "set_dates",
                                    }))
                                  }
                                >
                                  Set dates
                                </button>
                                <button
                                  type="button"
                                  className={
                                    tripForm.dateMode === "flexible"
                                      ? styles.tripFilterButtonActive
                                      : styles.tripFilterButton
                                  }
                                  onClick={() =>
                                    setTripForm((current) => ({
                                      ...current,
                                      dateMode: "flexible",
                                      startsAt: "",
                                      endsAt: "",
                                      dateOptions: [],
                                    }))
                                  }
                                >
                                  Flexible / open dates
                                </button>
                              </div>
                              <small className={styles.fieldHint}>
                                Choosing flexible dates lets you keep building the trip before a final
                                date window is agreed.
                              </small>
                            </div>

                            {tripForm.dateMode === "set_dates" ? (
                              <div
                                className={
                                  isEditingDates ? styles.dateRangeCard : styles.dateRangeInline
                                }
                              >
                                {isEditingDates ? (
                                  <div className={styles.dateRangeHeader}>
                                    <strong>
                                      <FiCalendar />
                                      <span>Dates</span>
                                    </strong>
                                  </div>
                                ) : null}
                                <div className={styles.dateRangeSummary}>
                                  <span>
                                    {pendingTripRange?.from
                                      ? formatDateLabel(formatDateInput(pendingTripRange.from))
                                      : "Start date"}
                                  </span>
                                  <span className={styles.dateRangeDivider}>to</span>
                                  <span>
                                    {pendingTripRange?.to
                                      ? formatDateLabel(formatDateInput(pendingTripRange.to))
                                      : "End date"}
                                  </span>
                                </div>
                                {tripDateOptions.length > 0 ? (
                                  <div className={styles.dateOptionList}>
                                    {tripDateOptions.map((option, index) => (
                                      <div key={option.id} className={styles.dateOptionRow}>
                                        <div>
                                          <span className={styles.fieldHint}>
                                            Option {index + 1}
                                          </span>
                                          <strong>
                                            {formatTripDateRange(option.startsAt, option.endsAt)}
                                          </strong>
                                        </div>
                                        <button
                                          type="button"
                                          className={styles.inlineEditLink}
                                          onClick={() =>
                                            setTripForm((current) => {
                                              const nextDateOptions = getTripDateOptions(current).filter(
                                                (dateOption) => dateOption.id !== option.id,
                                              );
                                              const primaryDateOption = nextDateOptions[0];

                                              return {
                                                ...current,
                                                dateOptions: nextDateOptions,
                                                startsAt: primaryDateOption?.startsAt ?? "",
                                                endsAt: primaryDateOption?.endsAt ?? "",
                                              };
                                            })
                                          }
                                        >
                                          Remove
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                ) : null}
                                {isEditingDates ? (
                                  <>
                                    <div className={styles.datePickerShell}>
                                      <DayPicker
                                        mode="range"
                                        selected={pendingTripRange}
                                        onSelect={(range) => setPendingTripRange(range)}
                                        numberOfMonths={2}
                                        pagedNavigation
                                        weekStartsOn={1}
                                      />
                                    </div>
                                    <div className={styles.formActions}>
                                      <button
                                        type="button"
                                        className={styles.primaryAction}
                                        disabled={!pendingTripRange?.from || !pendingTripRange?.to}
                                        onClick={() => {
                                          const startsAt = formatDateInput(pendingTripRange?.from);
                                          const endsAt = formatDateInput(pendingTripRange?.to);

                                          setTripForm((current) => ({
                                            ...current,
                                            startsAt: current.startsAt || startsAt,
                                            endsAt: current.endsAt || endsAt,
                                            dateOptions: [
                                              ...getTripDateOptions(current),
                                              createDateOption(startsAt, endsAt),
                                            ],
                                          }));
                                          setPendingTripRange(undefined);
                                          setIsEditingDates(false);
                                        }}
                                      >
                                        {tripDateOptions.length > 0
                                          ? "Add another date option"
                                          : "Add dates"}
                                      </button>
                                    </div>
                                  </>
                                ) : hasTripDates ? (
                                  <div className={styles.formActions}>
                                    <button
                                      type="button"
                                      className={styles.secondaryAction}
                                      onClick={() => setIsEditingDates(true)}
                                    >
                                      Add another date option
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            ) : (
                              <div className={styles.optionFormCard}>
                                <div className={styles.rowTop}>
                                  <div>
                                    <p className={styles.eyebrow}>Date reminder</p>
                                    <h3 className={styles.sectionHeading}>Dates can be confirmed later</h3>
                                    <p className={styles.muted}>
                                      This trip can continue with open dates for now. Journi will keep
                                      surfacing a reminder in the organiser flow until the final date
                                      window is locked in.
                                    </p>
                                  </div>
                                  <span className={styles.badgeSoft}>Open dates</span>
                                </div>
                              </div>
                            )}

                            <div className={styles.field}>
                              <div className={styles.rowTop}>
                                <span>Budget</span>
                              </div>
                              <div className={styles.tripFilter}>
                                <button
                                  type="button"
                                  className={
                                    tripForm.budgetMode === "per_person"
                                      ? styles.tripFilterButtonActive
                                      : styles.tripFilterButton
                                  }
                                  onClick={() => updateBudgetFromMode("per_person")}
                                >
                                  Per person
                                </button>
                                <button
                                  type="button"
                                  className={
                                    tripForm.budgetMode === "overall"
                                      ? styles.tripFilterButtonActive
                                      : styles.tripFilterButton
                                  }
                                  onClick={() => updateBudgetFromMode("overall")}
                                >
                                  Overall budget
                                </button>
                              </div>

                              {tripForm.budgetMode === "per_person" ? (
                                <>
                                  <div className={styles.tripFilter}>
                                    {budgetBands.map((option) => (
                                      <button
                                        key={option.value}
                                        type="button"
                                        className={
                                          tripForm.budgetBand === option.value
                                            ? styles.tripFilterButtonActive
                                            : styles.tripFilterButton
                                        }
                                        onClick={() =>
                                          updateBudgetFromMode("per_person", {
                                            budgetBand: option.value,
                                          })
                                        }
                                      >
                                        {option.label}
                                      </button>
                                    ))}
                                  </div>
                                  <small className={styles.fieldHint}>
                                    Budget is stored as a per-person guide for launch.
                                  </small>
                                </>
                              ) : (
                                <>
                                  <input
                                    inputMode="decimal"
                                    value={tripForm.totalBudget}
                                    onChange={(event) =>
                                      updateBudgetFromMode("overall", {
                                        totalBudget: event.target.value,
                                      })
                                    }
                                    placeholder="3200"
                                  />
                                  <small className={styles.fieldHint}>
                                    Journi uses the minimum group size in the chosen band to estimate a
                                    per-person budget automatically.
                                  </small>
                                </>
                              )}
                            </div>
                          </>
                        ) : null}

                        {hasDatePlan ? (
                          <div className={styles.field}>
                            <div className={styles.rowTop}>
                              <span>Description</span>
                              {tripForm.description.trim() && !isEditingDescription ? (
                                <button
                                  type="button"
                                  className={styles.inlineEditLink}
                                  onClick={() => setIsEditingDescription(true)}
                                >
                                  Edit description
                                </button>
                              ) : null}
                            </div>
                            {isEditingDescription ? (
                              <>
                                <textarea
                                  value={pendingDescription}
                                  onChange={(event) => setPendingDescription(event.target.value)}
                                  placeholder="Write a short summary of the trip"
                                  rows={5}
                                />
                                <div className={styles.formActions}>
                                  <button
                                    type="button"
                                    className={styles.secondaryAction}
                                    onClick={() => void handleGenerateTripDescription()}
                                    disabled={isGeneratingDescription || isTypingDescription}
                                  >
                                    {isGeneratingDescription
                                      ? "Generating..."
                                      : isTypingDescription
                                        ? "Writing..."
                                        : "Generate with AI"}
                                  </button>
                                  <button
                                    type="button"
                                    className={styles.primaryAction}
                                    onClick={() => {
                                      setTripForm((current) => ({
                                        ...current,
                                        description: pendingDescription,
                                      }));
                                      setIsEditingDescription(false);
                                    }}
                                  >
                                    Save description
                                  </button>
                                </div>
                                {aiDescriptionError ? (
                                  <p className={styles.formError}>{aiDescriptionError}</p>
                                ) : null}
                                {tripForm.aiDescriptionGenerated ? (
                                  <small className={styles.fieldHint}>
                                    This description was generated from the organiser brief and can be
                                    edited freely.
                                  </small>
                                ) : null}
                              </>
                            ) : (
                              <p
                                className={
                                  isTypingDescription
                                    ? `${styles.muted} ${styles.typingDescription}`
                                    : styles.muted
                                }
                                aria-live="polite"
                              >
                                {tripForm.description}
                                {isTypingDescription ? (
                                  <span className={styles.typingCursor} aria-hidden="true" />
                                ) : null}
                              </p>
                            )}
                          </div>
                        ) : null}

                        {showHotelsInline ? renderHotelsSection() : null}
                      </div>
                    </div>
                  </div>
                ) : null}

              {destinationGalleryOpen ? (
                <div
                  className={styles.modalOverlay}
                  onClick={() => setDestinationGalleryOpen(false)}
                >
                  <div className={styles.modalCard} onClick={(event) => event.stopPropagation()}>
                    <div className={styles.sectionTop}>
                      <div>
                        <p className={styles.eyebrow}>Destination gallery</p>
                        <h2>{tripForm.destination || "Choose a cover image"}</h2>
                      </div>
                      <button
                        type="button"
                        className={styles.secondaryAction}
                        onClick={() => setDestinationGalleryOpen(false)}
                      >
                        Close
                      </button>
                    </div>

                    {destinationPhotos.length > 0 ? (
                      <div className={styles.stack}>
                        <div className={styles.formActions}>
                          <button
                            type="button"
                            className={styles.secondaryAction}
                            onClick={() => imageInputRef.current?.click()}
                          >
                            Upload your own image
                          </button>
                          <input
                            ref={imageInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleImageSelected}
                            className={styles.hiddenFileInput}
                          />
                        </div>
                        <div className={styles.destinationPhotoGrid}>
                          {destinationPhotos.map((photo) => (
                            <button
                              key={photo.id}
                              type="button"
                              className={
                                tripForm.coverImageUrl === photo.url
                                  ? styles.destinationPhotoButtonActive
                                  : styles.destinationPhotoButton
                              }
                              onClick={() => {
                                setTripForm((current) => ({
                                  ...current,
                                  coverImageUrl: photo.url,
                                }));
                                setDestinationGalleryOpen(false);
                              }}
                            >
                              <img
                                src={photo.url}
                                alt={photo.placeName}
                                className={styles.destinationPhotoImage}
                              />
                              <span>{photo.placeName}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className={styles.emptyState}>
                        <h3>
                          {isLoadingDestinationPhotos
                            ? "Loading cover ideas..."
                            : "No Google cover ideas yet."}
                        </h3>
                        <p>
                          {isLoadingDestinationPhotos
                            ? "Pulling destination imagery from Google."
                            : "Try another destination or upload your own image."}
                        </p>
                        <div className={styles.formActions}>
                          <button
                            type="button"
                            className={styles.secondaryAction}
                            onClick={() => imageInputRef.current?.click()}
                          >
                            Upload your own image
                          </button>
                          <input
                            ref={imageInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleImageSelected}
                            className={styles.hiddenFileInput}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
              </div>

              {activeStep.key === "hotels" ? (
                renderHotelsSection()
              ) : null}

              {activeStep.key === "activities" ? (
                renderTripContinuationCard(renderActivitiesSection(), {
                  showHotels: true,
                })
              ) : null}

              {activeStep.key === "transport" ? (
                renderTripContinuationCard(renderTransportSection(), {
                  showHotels: true,
                  showActivities: true,
                })
              ) : null}

              {activeStep.key === "dining" ? (
                renderTripContinuationCard(renderDiningSection(), {
                  showHotels: true,
                  showActivities: true,
                  showTransport: true,
                })
              ) : null}

              {activeStep.key === "finalise" ? finaliseSection : null}

              {createError ? <p className={styles.formError}>{createError}</p> : null}
            </section>

            {showDockedStepper ? (
              <section className={styles.stepperDock}>
                <div className={styles.stepper}>
                  {steps.map((step, index) => (
                    <button
                      key={step.key}
                      type="button"
                      className={
                        index === activeStepIndex
                          ? styles.stepperItemActive
                          : isStepComplete(step.key)
                            ? styles.stepperItemComplete
                            : styles.stepperItem
                      }
                      onClick={() => {
                        if (index > 0 && !tripBasicsReady) {
                          setCreateError(
                            "Finish destination, cover image, trip name, and your date plan before moving ahead.",
                          );
                          return;
                        }

                        if (index > 1 && !hasSelectedHotels) {
                          setCreateError("Select at least one hotel before moving on to activities.");
                          return;
                        }

                        if (index > 2 && !hasSelectedActivities) {
                          setCreateError("Select at least one activity before moving on to transport.");
                          return;
                        }

                        if (index > 3 && !hasSelectedTransport) {
                          setCreateError("Select at least one transport option before moving on.");
                          return;
                        }

                        if (index > 4 && !hasSelectedDining) {
                          setCreateError("Select at least one dining option before moving to review.");
                          return;
                        }

                        setCreateError(null);
                        setHotelSearchQuery((current) => current || tripForm.destination.trim());
                        setActiveStepIndex(index);
                        persistCurrentDraft(step.key);
                      }}
                    >
                      <span>{isStepComplete(step.key) ? <FiCheck /> : index + 1}</span>
                      {step.key === "details" && showSelectedDestination ? (
                        <>
                          {tripForm.coverImageUrl ? (
                            <img
                              src={tripForm.coverImageUrl}
                              alt={tripForm.destination}
                              className={styles.stepperPreviewImage}
                            />
                          ) : null}
                          <strong>{tripForm.destination}</strong>
                          <small>{tripForm.title.trim() || step.eyebrow}</small>
                        </>
                      ) : (
                        <>
                          <strong>{step.label}</strong>
                          <small>{step.eyebrow}</small>
                        </>
                      )}
                    </button>
                  ))}
                </div>
                {activeStep.key === "hotels" ? (
                  <div className={styles.stepperDockAction}>
                    <button
                      type="button"
                      className={styles.primaryAction}
                      disabled={!hasSelectedHotels}
                      onClick={() => {
                        if (!hasSelectedHotels) {
                          setCreateError("Select at least one hotel before moving on to activities.");
                          return;
                        }

                        setCreateError(null);
                        goToStep("activities");
                      }}
                    >
                      Mark hotels complete
                    </button>
                  </div>
                ) : activeStep.key === "activities" ? (
                  <div className={styles.stepperDockAction}>
                    <button
                      type="button"
                      className={styles.primaryAction}
                      disabled={!hasSelectedActivities}
                      onClick={() => {
                        if (!hasSelectedActivities) {
                        setCreateError("Select at least one activity before moving on.");
                          return;
                        }

                        setCreateError(null);
                        goToStep("transport");
                      }}
                    >
                      Mark activities complete
                    </button>
                  </div>
                ) : activeStep.key === "transport" ? (
                  <div className={styles.stepperDockAction}>
                    <button
                      type="button"
                      className={styles.primaryAction}
                      disabled={!hasSelectedTransport}
                      onClick={() => {
                        if (!hasSelectedTransport) {
                        setCreateError("Select at least one transport option before moving on.");
                          return;
                        }

                        setCreateError(null);
                        goToStep("dining");
                      }}
                    >
                      Mark transport complete
                    </button>
                  </div>
                ) : activeStep.key === "dining" ? (
                  <div className={styles.stepperDockAction}>
                    <button
                      type="button"
                      className={styles.primaryAction}
                      disabled={!hasSelectedDining || loading}
                      onClick={() => {
                        if (!hasSelectedDining) {
                          setCreateError("Select at least one dining option before finalising.");
                          return;
                        }

                        handleGoToFinalise();
                      }}
                    >
                      Review and finalise
                    </button>
                  </div>
                ) : activeStep.key === "finalise" ? (
                  <div className={styles.stepperDockAction}>
                    <button
                      type="button"
                      className={styles.primaryAction}
                      disabled={isSaving || loading}
                      onClick={handleSaveTrip}
                    >
                      {isSaving ? "Saving trip..." : "Save whole trip"}
                    </button>
                  </div>
                ) : null}
                <div className={styles.stepperDockAction}>
                  <button
                    type="button"
                    className={styles.secondaryAction}
                    onClick={handleSaveAndExit}
                  >
                    Save and come back later
                  </button>
                </div>
              </section>
            ) : null}

            {selectedHotelDetails ? (
              <div
                className={styles.modalOverlay}
                onClick={() => {
                  setSelectedHotelDetails(null);
                  setHotelDetailsError(null);
                  setHotelDetailsTab("overview");
                }}
              >
                <div className={styles.modalCard} onClick={(event) => event.stopPropagation()}>
                  <div className={styles.sectionTop}>
                    <div>
                      <p className={styles.eyebrow}>Hotel details</p>
                      <h2>{selectedHotelDetails.name}</h2>
                    </div>
                    <button
                      type="button"
                      className={styles.secondaryAction}
                      onClick={() => {
                        setSelectedHotelDetails(null);
                        setHotelDetailsError(null);
                        setHotelDetailsTab("overview");
                      }}
                    >
                      Close
                    </button>
                  </div>

                  {isLoadingHotelDetails ? (
                    <p className={styles.muted}>Loading more information...</p>
                  ) : null}

                  {hotelDetailsError ? (
                    <p className={styles.formError}>{hotelDetailsError}</p>
                  ) : null}

                  <div className={styles.hotelTabRow}>
                    {[
                      { key: "overview", label: "Overview" },
                      { key: "gallery", label: "Gallery" },
                      { key: "map", label: "Map" },
                      { key: "reviews", label: "Reviews" },
                      { key: "practical", label: "Practical" },
                    ].map((tab) => (
                      <button
                        key={tab.key}
                        type="button"
                        className={
                          hotelDetailsTab === tab.key
                            ? styles.hotelTabActive
                            : styles.hotelTab
                        }
                        onClick={() => setHotelDetailsTab(tab.key as HotelDetailsTab)}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {hotelDetailsTab === "overview" ? (
                    <div className={styles.stack}>
                      {selectedHotelDetails.photos[0]?.url ? (
                        <div className={styles.hotelHeroCard}>
                          <img
                            src={selectedHotelDetails.photos[0].url}
                            alt={selectedHotelDetails.name}
                            className={styles.hotelHeroImage}
                          />
                          <div className={styles.hotelHeroBody}>
                            <div className={styles.rowTop}>
                              <strong>Main photo</strong>
                              {selectedHotelDetails.rating ? (
                                <span className={styles.badgeSoft}>
                                  {selectedHotelDetails.rating}/5
                                </span>
                              ) : null}
                            </div>
                            <p className={styles.muted}>
                              {selectedHotelDetails.summary ||
                                "A richer hotel summary will show here when Google provides one."}
                            </p>
                            {selectedHotelDetails.photos[0].attribution ? (
                              <p className={styles.fieldHint}>
                                Photo: {selectedHotelDetails.photos[0].attribution}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      ) : null}

                      <div className={styles.hotelOverviewStats}>
                        <div className={styles.infoCard}>
                          <span className={styles.tripFactLabel}>Address</span>
                          <strong>{selectedHotelDetails.address || "Not available"}</strong>
                        </div>
                        <div className={styles.infoCard}>
                          <span className={styles.tripFactLabel}>Rating</span>
                          <strong>
                            {selectedHotelDetails.rating
                              ? `${selectedHotelDetails.rating} (${selectedHotelDetails.userRatingCount ?? 0} reviews)`
                              : "Not available"}
                          </strong>
                        </div>
                        <div className={styles.infoCard}>
                          <span className={styles.tripFactLabel}>Phone</span>
                          <strong>{selectedHotelDetails.phone || "Not available"}</strong>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {hotelDetailsTab === "gallery" ? (
                    selectedHotelDetails.photos.length > 0 ? (
                      <div className={styles.stack}>
                        <div className={styles.rowTop}>
                          <strong>Gallery</strong>
                          <span className={styles.badge}>
                            {selectedHotelDetails.photos.length} images
                          </span>
                        </div>
                        <div className={styles.hotelDetailGallery}>
                          {selectedHotelDetails.photos.map((photo, index) =>
                            photo.url ? (
                              <figure
                                key={`${photo.url}-${index}`}
                                className={styles.hotelDetailMediaCard}
                              >
                                <img
                                  src={photo.url}
                                  alt={`${selectedHotelDetails.name} photo ${index + 1}`}
                                  className={styles.hotelDetailPhoto}
                                />
                                {photo.attribution ? (
                                  <figcaption className={styles.fieldHint}>
                                    Photo: {photo.attribution}
                                  </figcaption>
                                ) : null}
                              </figure>
                            ) : null,
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className={styles.emptyState}>
                        <h3>No gallery available yet.</h3>
                        <p>Google did not return extra hotel photos for this result.</p>
                      </div>
                    )
                  ) : null}

                  {hotelDetailsTab === "map" ? (
                    selectedHotelDetails.latitude !== null &&
                    selectedHotelDetails.longitude !== null ? (
                      <div className={styles.stack}>
                        <div className={styles.rowTop}>
                          <strong>Map</strong>
                          <span className={styles.badgeSoft}>Live location</span>
                        </div>
                        <iframe
                          title={`${selectedHotelDetails.name} map`}
                          src={`https://www.google.com/maps?q=${selectedHotelDetails.latitude},${selectedHotelDetails.longitude}&z=15&output=embed`}
                          className={styles.hotelMapFrame}
                          loading="lazy"
                          referrerPolicy="no-referrer-when-downgrade"
                        />
                      </div>
                    ) : (
                      <div className={styles.emptyState}>
                        <h3>Map unavailable.</h3>
                        <p>This hotel result did not include map coordinates.</p>
                      </div>
                    )
                  ) : null}

                  {hotelDetailsTab === "reviews" ? (
                    selectedHotelDetails.reviews.length > 0 ? (
                      <div className={styles.stack}>
                        <div className={styles.rowTop}>
                          <strong>Guest reviews</strong>
                          <span className={styles.badgeSoft}>
                            {selectedHotelDetails.reviews.length} loaded
                          </span>
                        </div>
                        <div className={styles.reviewGrid}>
                          {selectedHotelDetails.reviews.map((review, index) => (
                            <article
                              key={`${review.author}-${review.published}-${index}`}
                              className={styles.reviewCard}
                            >
                              <div className={styles.rowTop}>
                                <div>
                                  <strong>{review.author}</strong>
                                  <p className={styles.muted}>
                                    {review.published || "Recent review"}
                                  </p>
                                </div>
                                <span className={styles.badge}>
                                  {review.rating ? `${review.rating}/5` : "Review"}
                                </span>
                              </div>
                              {review.text ? (
                                <p className={styles.muted}>{review.text}</p>
                              ) : (
                                <p className={styles.muted}>
                                  No review text was provided in the Google result.
                                </p>
                              )}
                              {review.authorUrl ? (
                                <a
                                  href={review.authorUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={styles.actionLink}
                                >
                                  View reviewer profile
                                </a>
                              ) : null}
                            </article>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className={styles.emptyState}>
                        <h3>No reviews loaded.</h3>
                        <p>This place result did not include guest reviews from Google.</p>
                      </div>
                    )
                  ) : null}

                  {hotelDetailsTab === "practical" ? (
                    <div className={styles.stack}>
                      <div className={styles.settingsList}>
                        <div className={styles.settingsRow}>
                          <div>
                            <h3>Address</h3>
                          </div>
                          <strong>{selectedHotelDetails.address || "Not available"}</strong>
                        </div>
                        <div className={styles.settingsRow}>
                          <div>
                            <h3>Phone</h3>
                          </div>
                          <strong>{selectedHotelDetails.phone || "Not available"}</strong>
                        </div>
                        <div className={styles.settingsRow}>
                          <div>
                            <h3>Website</h3>
                          </div>
                          <strong>
                            {selectedHotelDetails.websiteUri ? "Available below" : "Not available"}
                          </strong>
                        </div>
                      </div>

                      {selectedHotelDetails.openingHours.length > 0 ? (
                        <div className={styles.optionFormCard}>
                          <strong>Opening hours</strong>
                          <div className={styles.simpleList}>
                            {selectedHotelDetails.openingHours.map((line) => (
                              <div key={line} className={styles.listRow}>
                                <span className={styles.rowMeta}>{line}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className={styles.emptyState}>
                          <h3>No opening hours yet.</h3>
                          <p>Google did not return opening hours for this hotel.</p>
                        </div>
                      )}
                    </div>
                  ) : null}

                  <div className={styles.hotelCardActions}>
                    {selectedHotelDetails.websiteUri ? (
                      <a
                        href={selectedHotelDetails.websiteUri}
                        target="_blank"
                        rel="noreferrer"
                        className={styles.hotelActionLink}
                      >
                        Hotel website
                      </a>
                    ) : (
                      <span />
                    )}
                    <a
                      href={selectedHotelDetails.googleMapsUri || buildGoogleMapsPlaceUrl(selectedHotelDetails.name, selectedHotelDetails.address)}
                      target="_blank"
                      rel="noreferrer"
                      className={styles.hotelActionLink}
                    >
                      Open in Google Maps
                    </a>
                  </div>
                </div>
              </div>
            ) : null}
            {showAllHotelsPanel ? (
              <div className={styles.slidePanelBackdrop}>
                <aside
                  className={styles.slidePanel}
                  aria-label="All hotel options"
                  aria-modal="true"
                  role="dialog"
                >
                  <div className={styles.slidePanelHeader}>
                    <div>
                      <p className={styles.eyebrow}>Hotels</p>
                      <h2>All hotel options</h2>
                      <p className={styles.muted}>
                        Browse every hotel loaded for {tripForm.destination || "this trip"}.
                      </p>
                    </div>
                    <button
                      type="button"
                      className={styles.carouselButton}
                      onClick={() => setShowAllHotelsPanel(false)}
                      aria-label="Close hotel list"
                    >
                      <FiX />
                    </button>
                  </div>

                  <div className={styles.slidePanelBody}>
                    <div className={styles.hotelResultsGrid}>
                      {hotelResults.map((hotel) => renderHotelResultCard(hotel))}
                    </div>
                    {hotelNextPageToken || isLoadingMoreHotels ? (
                      <div className={styles.hotelLoadMoreTrigger}>
                        <span>
                          {isLoadingMoreHotels
                            ? "Loading more hotels..."
                            : "More hotel results are available"}
                        </span>
                        {!isLoadingMoreHotels ? (
                          <button
                            type="button"
                            className={styles.inlineEditLink}
                            onClick={handleLoadMoreHotels}
                          >
                            Load more now
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </aside>
              </div>
            ) : null}
            {showAllActivitiesPanel ? (
              <div className={styles.slidePanelBackdrop}>
                <aside
                  className={styles.slidePanel}
                  aria-label="All activity options"
                  aria-modal="true"
                  role="dialog"
                >
                  <div className={styles.slidePanelHeader}>
                    <div>
                      <p className={styles.eyebrow}>Activities</p>
                      <h2>All activity options</h2>
                      <p className={styles.muted}>
                        Browse every activity loaded for {tripForm.destination || "this trip"}.
                      </p>
                    </div>
                    <button
                      type="button"
                      className={styles.carouselButton}
                      onClick={() => setShowAllActivitiesPanel(false)}
                      aria-label="Close activity list"
                    >
                      <FiX />
                    </button>
                  </div>

                  <div className={styles.slidePanelBody}>
                    <div className={styles.hotelResultsGrid}>
                      {activityResults.map((activity) => renderActivityResultCard(activity))}
                    </div>
                  </div>
                </aside>
              </div>
            ) : null}
            {showAllTransportPanel ? (
              <div className={styles.slidePanelBackdrop}>
                <aside
                  className={styles.slidePanel}
                  aria-label="All transport options"
                  aria-modal="true"
                  role="dialog"
                >
                  <div className={styles.slidePanelHeader}>
                    <div>
                      <p className={styles.eyebrow}>Transport</p>
                      <h2>All transport options</h2>
                      <p className={styles.muted}>
                        Browse every transport option loaded for {tripForm.destination || "this trip"}.
                      </p>
                    </div>
                    <button
                      type="button"
                      className={styles.carouselButton}
                      onClick={() => setShowAllTransportPanel(false)}
                      aria-label="Close transport list"
                    >
                      <FiX />
                    </button>
                  </div>

                  <div className={styles.slidePanelBody}>
                    <div className={styles.hotelResultsGrid}>
                      {transportResults.map((option) => renderTransportResultCard(option))}
                    </div>
                  </div>
                </aside>
              </div>
            ) : null}
            {showAllDiningPanel ? (
              <div className={styles.slidePanelBackdrop}>
                <aside
                  className={styles.slidePanel}
                  aria-label="All dining options"
                  aria-modal="true"
                  role="dialog"
                >
                  <div className={styles.slidePanelHeader}>
                    <div>
                      <p className={styles.eyebrow}>Dining</p>
                      <h2>All dining options</h2>
                      <p className={styles.muted}>
                        Browse every dining option loaded for {tripForm.destination || "this trip"}.
                      </p>
                    </div>
                    <button
                      type="button"
                      className={styles.carouselButton}
                      onClick={() => setShowAllDiningPanel(false)}
                      aria-label="Close dining list"
                    >
                      <FiX />
                    </button>
                  </div>

                  <div className={styles.slidePanelBody}>
                    <div className={styles.hotelResultsGrid}>
                      {diningResults.map((option) => renderDiningResultCard(option))}
                    </div>
                  </div>
                </aside>
              </div>
            ) : null}
            <TripUpgradeModal
              open={showUpgradeModal}
              email={email}
              tripId="finalise"
              returnPath="/trip-organiser?step=finalise&checkout=complete&product=trip_pass"
              onClose={() => setShowUpgradeModal(false)}
            />
          </div>
        );
      }}
    </AppShell>
  );
}
