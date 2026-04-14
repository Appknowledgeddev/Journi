"use client";

import { DateRange, DayPicker } from "react-day-picker";
import { useRouter } from "next/navigation";
import { ReactNode, useEffect, useRef, useState } from "react";
import { FiCalendar, FiCheck, FiEdit3, FiImage, FiMapPin } from "react-icons/fi";
import { AppShell } from "@/components/app-shell";
import styles from "@/components/app-page.module.css";
import { supabase } from "@/lib/supabase/client";
import { saveTripOrganiserDraft } from "@/lib/trip-organiser/draft";

type TripFormState = {
  title: string;
  destination: string;
  description: string;
  status: string;
  startsAt: string;
  endsAt: string;
  coverImageUrl: string;
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

type StepKey = "details" | "hotels" | "activities" | "transport" | "dining";
type HotelDetailsTab = "overview" | "gallery" | "map" | "reviews" | "practical";

const steps: Array<{ key: StepKey; label: string; eyebrow: string }> = [
  { key: "details", label: "Trip basics", eyebrow: "Destination and dates" },
  { key: "hotels", label: "Select hotels", eyebrow: "API hotel search" },
  { key: "activities", label: "Activities", eyebrow: "Things to do" },
  { key: "transport", label: "Transport", eyebrow: "Getting around" },
  { key: "dining", label: "Dining", eyebrow: "Food plans" },
];

const initialTripForm: TripFormState = {
  title: "",
  destination: "",
  description: "",
  status: "draft",
  startsAt: "",
  endsAt: "",
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
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const destinationBlurTimeoutRef = useRef<number | null>(null);
  const hotelLoadMoreTriggerRef = useRef<HTMLDivElement | null>(null);
  const tripBuilderTopRef = useRef<HTMLDivElement | null>(null);
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
  const [activities, setActivities] = useState<ActivityOption[]>([{ ...emptyActivity }]);
  const [activityResults, setActivityResults] = useState<ActivitySearchResult[]>([]);
  const [activitySearchQuery, setActivitySearchQuery] = useState("");
  const [activitySearchError, setActivitySearchError] = useState<string | null>(null);
  const [isSearchingActivities, setIsSearchingActivities] = useState(false);
  const [transport, setTransport] = useState<TransportOption[]>([{ ...emptyTransport }]);
  const [transportResults, setTransportResults] = useState<TransportSearchResult[]>([]);
  const [transportSearchQuery, setTransportSearchQuery] = useState("");
  const [transportSearchError, setTransportSearchError] = useState<string | null>(null);
  const [isSearchingTransport, setIsSearchingTransport] = useState(false);
  const [dining, setDining] = useState<DiningOption[]>([{ ...emptyDining }]);
  const [diningResults, setDiningResults] = useState<DiningSearchResult[]>([]);
  const [diningSearchQuery, setDiningSearchQuery] = useState("");
  const [diningSearchError, setDiningSearchError] = useState<string | null>(null);
  const [isSearchingDining, setIsSearchingDining] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [pendingTripRange, setPendingTripRange] = useState<DateRange | undefined>(undefined);
  const [isEditingDates, setIsEditingDates] = useState(true);
  const [pendingDescription, setPendingDescription] = useState("");
  const [isEditingDescription, setIsEditingDescription] = useState(true);

  const activeStep = steps[activeStepIndex];
  const selectedTripRange: DateRange | undefined =
    tripForm.startsAt || tripForm.endsAt
      ? {
          from: parseDateInput(tripForm.startsAt),
          to: parseDateInput(tripForm.endsAt),
        }
      : undefined;
  const displayedTripRange = pendingTripRange ?? selectedTripRange;
  const hasDestination = Boolean(tripForm.destination.trim());
  const hasSelectedDestination = destinationCommitted && hasDestination;
  const showSelectedDestination = hasHydrated && hasSelectedDestination;
  const hasCoverImage = Boolean(tripForm.coverImageUrl.trim());
  const hasTripName = Boolean(tripForm.title.trim());
  const hasTripDates = Boolean(tripForm.startsAt && tripForm.endsAt);
  const hasSelectedHotels = hotels.length > 0;
  const hasSelectedActivities = activities.some(hasActivityValue);
  const hasSelectedTransport = transport.some(hasTransportValue);
  const hasSelectedDining = dining.some(hasDiningValue);
  const tripBasicsReady = hasSelectedDestination && hasCoverImage && hasTripName && hasTripDates;
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
      default:
        return false;
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
  }, []);

  useEffect(() => {
    setPendingTripRange(selectedTripRange);
  }, [tripForm.startsAt, tripForm.endsAt]);

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
            <div className={styles.hotelResultsGrid}>
              {hotelResults.map((hotel) => {
                const selected = isHotelSelected(hotel);

                return (
                  <article
                    key={hotel.id}
                    className={
                      selected ? styles.hotelResultCardSelected : styles.hotelResultCard
                    }
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
                        className={
                          selected ? styles.hotelSelectButtonActive : styles.hotelSelectButton
                        }
                        onClick={() => toggleHotelSelection(hotel)}
                      >
                        {selected ? "Selected" : "Select"}
                      </button>
                    </div>
                  </article>
                );
              })}
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
            <div className={styles.hotelResultsGrid}>
              {activityResults.map((activity) => {
                const selected = isActivitySelected(activity);

                return (
                  <article
                    key={activity.id}
                    className={
                      selected ? styles.hotelResultCardSelected : styles.hotelResultCard
                    }
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
                        className={
                          selected ? styles.hotelSelectButtonActive : styles.hotelSelectButton
                        }
                        onClick={() => toggleActivitySelection(activity)}
                      >
                        {selected ? "Selected" : "Select"}
                      </button>
                    </div>
                  </article>
                );
              })}
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

  function renderTripContinuationCard(
    content: ReactNode,
    options?: {
      showHotels?: boolean;
      showActivities?: boolean;
      showTransport?: boolean;
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
              <div className={styles.dateRangeInline}>
                <div className={styles.dateRangeSummary}>
                  <span>{formatDateLabel(tripForm.startsAt)}</span>
                  <span className={styles.dateRangeDivider}>to</span>
                  <span>{formatDateLabel(tripForm.endsAt)}</span>
                </div>
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

            {options?.showHotels ? renderSelectedHotelsSummary() : null}
            {options?.showActivities ? renderSelectedActivitiesSummary() : null}
            {options?.showTransport ? renderSelectedTransportSummary() : null}
            {content}
          </div>
        </div>
      </div>
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
            <div className={styles.hotelResultsGrid}>
              {transportResults.map((option) => {
                const selected = isTransportSelected(option);

                return (
                  <article
                    key={option.id}
                    className={
                      selected ? styles.hotelResultCardSelected : styles.hotelResultCard
                    }
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
                        className={
                          selected ? styles.hotelSelectButtonActive : styles.hotelSelectButton
                        }
                        onClick={() => toggleTransportSelection(option)}
                      >
                        {selected ? "Selected" : "Select"}
                      </button>
                    </div>
                  </article>
                );
              })}
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
            <div className={styles.hotelResultsGrid}>
              {diningResults.map((option) => {
                const selected = isDiningSelected(option);

                return (
                  <article
                    key={option.id}
                    className={
                      selected ? styles.hotelResultCardSelected : styles.hotelResultCard
                    }
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
                        className={
                          selected ? styles.hotelSelectButtonActive : styles.hotelSelectButton
                        }
                        onClick={() => toggleDiningSelection(option)}
                      >
                        {selected ? "Selected" : "Select"}
                      </button>
                    </div>
                  </article>
                );
              })}
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
      {({ userId, loading }) => {
        function handleOpenFinalisePage() {
          if (!userId) {
            setCreateError("You need to be signed in before saving this trip.");
            return;
          }

          if (!tripBasicsReady) {
            setCreateError(
              "Finish destination, cover image, trip name, and dates before moving to finalise.",
            );
            setActiveStepIndex(0);
            return;
          }

          if (!hasSelectedHotels) {
            setCreateError("Select at least one hotel before finalising the trip.");
            setActiveStepIndex(1);
            return;
          }

          if (!hasSelectedActivities) {
            setCreateError("Select at least one activity before finalising the trip.");
            setActiveStepIndex(2);
            return;
          }

          if (!hasSelectedTransport) {
            setCreateError("Select at least one transport option before finalising the trip.");
            setActiveStepIndex(3);
            return;
          }

          if (!hasSelectedDining) {
            setCreateError("Select at least one dining option before finalising the trip.");
            setActiveStepIndex(4);
            return;
          }

          saveTripOrganiserDraft({
            tripForm: { ...tripForm },
            hotels: hotels.filter(hasHotelValue),
            activities: activities.filter(hasActivityValue),
            transport: transport.filter(hasTransportValue),
            dining: dining.filter(hasDiningValue),
            invites: [],
            savedAt: new Date().toISOString(),
          });

          setCreateError(null);
          router.push("/trip-organiser/finalise");
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
                                {displayedTripRange?.from
                                  ? formatDateLabel(formatDateInput(displayedTripRange.from))
                                  : "Start date"}
                              </span>
                              <span className={styles.dateRangeDivider}>to</span>
                              <span>
                                {displayedTripRange?.to
                                  ? formatDateLabel(formatDateInput(displayedTripRange.to))
                                  : "End date"}
                              </span>
                            </div>
                            {isEditingDates ? (
                              <>
                                <div className={styles.datePickerShell}>
                                  <DayPicker
                                    mode="range"
                                    selected={displayedTripRange}
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
                                      setTripForm((current) => ({
                                        ...current,
                                        startsAt: formatDateInput(pendingTripRange?.from),
                                        endsAt: formatDateInput(pendingTripRange?.to),
                                      }));
                                      setIsEditingDates(false);
                                    }}
                                  >
                                    Add dates
                                  </button>
                                </div>
                              </>
                            ) : hasTripDates ? (
                              <button
                                type="button"
                                className={styles.inlineEditLink}
                                onClick={() => setIsEditingDates(true)}
                              >
                                Edit dates
                              </button>
                            ) : null}
                          </div>
                        ) : null}

                        {hasTripDates ? (
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
                              </>
                            ) : (
                              <p className={styles.muted}>{tripForm.description}</p>
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
                            "Finish destination, cover image, trip name, and dates before moving ahead.",
                          );
                          return;
                        }

                        if (index > 1 && !hasSelectedHotels) {
                          setCreateError("Select at least one hotel before moving on to activities.");
                          return;
                        }

                        setCreateError(null);
                        setHotelSearchQuery((current) => current || tripForm.destination.trim());
                        setActiveStepIndex(index);
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
                        setActiveStepIndex(2);
                        scrollToTripBuilderTop();
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
                        setActiveStepIndex(3);
                        scrollToTripBuilderTop();
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
                        setActiveStepIndex(4);
                        scrollToTripBuilderTop();
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

                        handleOpenFinalisePage();
                      }}
                    >
                      Review and finalise
                    </button>
                  </div>
                ) : null}
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
          </div>
        );
      }}
    </AppShell>
  );
}
