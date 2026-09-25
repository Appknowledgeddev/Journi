"use client";

import { ScrollableOptionCards } from "@/components/scrollable-option-cards";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import WaveSurfer from "wavesurfer.js";
import RecordPlugin from "wavesurfer.js/dist/plugins/record.esm.js";
import {
  FiBarChart2,
  FiCamera,
  FiChevronLeft,
  FiChevronRight,
  FiCornerUpLeft,
  FiCreditCard,
  FiEdit3,
  FiFile,
  FiImage,
  FiLink,
  FiMaximize2,
  FiMessageSquare,
  FiMoreVertical,
  FiMinimize2,
  FiMic,
  FiPlus,
  FiSend,
  FiSettings,
  FiSmile,
  FiStar,
  FiThumbsDown,
  FiThumbsUp,
  FiTrash2,
  FiUsers,
  FiX,
} from "react-icons/fi";
import { FaThumbsDown, FaThumbsUp } from "react-icons/fa";
import { AppShell } from "@/components/app-shell";
import { ChatLinkPreview } from "@/components/chat-link-preview";
import { ChatAudioPlayer } from "@/components/chat-audio-player";
import { ChatMediaPicker, type ChatMediaItem } from "@/components/chat-media-picker";
import { TripDecisions } from "@/components/trip-decisions";
import { TripExpenses } from "@/components/trip-expenses";
import { TripUpgradeModal } from "@/components/trip-upgrade-modal";
import { TripVotePie } from "@/components/trip-vote-pie";
import { PlaceDetailsModal, type SavedPlaceSummary } from "@/components/place-details-modal";
import { isAssumedSession } from "@/lib/auth/assumed-session";
import { supabase } from "@/lib/supabase/client";
import { resolveProfileBackgroundStyle } from "@/lib/profile-card";
import styles from "@/components/app-page.module.css";
import {
  type ActivitySelection,
  buildVoteChartData,
  type CategoryKey,
  type DiningSelection,
  formatHotelRate,
  formatTripDatePlanning,
  formatTripDateRange,
  getAttendanceStatusLabel,
  getParticipantMembershipLabel,
  getVoteSummary,
  getTripStatusLabel,
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
import {
  getAudienceLabel,
  getBudgetBandLabel,
  getGroupSizeLabel,
} from "@/lib/trip-organiser/config";

type Plan = "free" | "pro_organiser";
type TripPlanningDrawer =
  "hotels" | "activities" | "transport" | "dining" | null;
type TripOwnerDrawer =
  "dashboard" | "participants" | "settings" | "messages" | "expenses" | null;
type ParticipantDrawerTab = "invite" | "requests" | "travellers";

type DiscussionComment = {
  id: string;
  parentCommentId: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  authorId: string | null;
  authorName: string;
  authorEmail: string | null;
  authorProfile: {
    bio: string;
    avatarUrl: string;
    backgroundUrl: string;
    backgroundPattern: string;
    avatarPositionX: number;
    avatarPositionY: number;
    backgroundPositionX: number;
    backgroundPositionY: number;
  } | null;
  canDelete: boolean;
};

type PendingChatPhoto = {
  id: string;
  blob: Blob;
  previewUrl: string;
};

type PendingChatFile = {
  id: string;
  file: File;
};

type ReferencePerson = {
  id: string;
  email: string;
  fullName: string;
  bio: string;
  avatarUrl: string;
  backgroundUrl: string;
  backgroundPattern: string;
  roleLabel: string;
};

type TestingActivityLog = {
  id: string;
  occurredAt: string;
  actorEmail: string | null;
  action: string;
  tableName: string | null;
  summary: string;
  viewerContext: string;
  metadata?: {
    notification?: {
      recipientEmail?: string;
      triggerKey?: string;
      channel?: string;
      status?: string;
      error?: string | null;
    };
  };
};

function normaliseTripVisibility(value: string | null | undefined) {
  if (value === "public") {
    return "Public";
  }

  if (value === "private") {
    return "Private";
  }

  return "Private";
}

function normaliseAccessValue(value: string | null | undefined) {
  if (!value) {
    return "Not set";
  }

  return value.replaceAll("_", " ");
}

function getParticipantMembershipStatus(
  participant: TripParticipant | undefined,
) {
  if (!participant) {
    return null;
  }

  return (
    participant.membership_status ??
    (participant.status === "accepted"
      ? "active"
      : participant.status === "declined"
        ? "declined"
        : participant.status === "pending"
          ? "pending_approval"
          : "invited")
  );
}

function buildGoogleMapsPlaceUrl(
  name: string | null | undefined,
  location: string | null | undefined,
) {
  const query = [name, location].filter(Boolean).join(" ");

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function getGoogleRatingFromNotes(notes: string | null | undefined) {
  const match = (notes ?? "").match(/Google rating\s+(\d+(?:\.\d+)?)/i);

  return match?.[1] ?? "";
}

function getNotesWithoutGoogleRating(notes: string | null | undefined) {
  return (notes ?? "")
    .replace(/Google rating\s+\d+(?:\.\d+)?\.?\s*/i, "")
    .trim();
}

function makeChatReference(kind: string, id: string, label: string) {
  return `[[journi:${kind}:${id}|${label.replaceAll("]", "").replaceAll("|", "")}]]`;
}

function getFirstUrl(value: string) {
  return getAllUrls(value)[0] ?? "";
}

function normaliseWebUrl(value: string) {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function isChatAudioUrl(value: string) {
  return value.includes("/chat-audio/");
}

function isChatImageUrl(value: string) {
  return value.includes("/chat-images/");
}

function isChatFileUrl(value: string) {
  return value.includes("/chat-files/");
}

function isGiphyMediaUrl(value: string) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "giphy.com" || host.endsWith(".giphy.com") || host === "giphy.gif";
  } catch {
    return false;
  }
}

function getChatFileName(value: string) {
  try {
    const fileName = decodeURIComponent(new URL(value).pathname.split("/").pop() || "Attachment");
    return fileName.split("--").slice(1).join("--") || fileName;
  } catch {
    return "Attachment";
  }
}

function getEmojiOnlyCount(value: string) {
  const segments = Array.from(
    new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value.trim()),
    (segment) => segment.segment,
  ).filter((segment) => segment.trim());
  return segments.length && segments.every((segment) => /\p{Extended_Pictographic}/u.test(segment))
    ? segments.length
    : 0;
}

function getAllUrls(value: string) {
  const urls = value
    .split(/\s+/)
    .map(
      (token) =>
        token.match(
          /(?:https?:\/\/|www\.)[^<>()]+|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^<>()]*)?/i,
        )?.[0] ?? "",
    )
    .map((url) => url.replace(/[.,!?;:]+$/, ""))
    .filter(Boolean)
    .map(normaliseWebUrl);

  return [...new Set(urls)];
}

function getUrlHost(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
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
  const [currentUserId, setCurrentUserId] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isUpdatingVisibility, setIsUpdatingVisibility] = useState(false);
  const [isRequestingParticipation, setIsRequestingParticipation] =
    useState(false);
  const [isUpdatingAttendance, setIsUpdatingAttendance] = useState(false);
  const [reviewingParticipantId, setReviewingParticipantId] = useState<
    string | null
  >(null);
  const [plan, setPlan] = useState<Plan>("free");
  const [publishGateMessage, setPublishGateMessage] = useState<string | null>(
    null,
  );
  const [participationMessage, setParticipationMessage] = useState<
    string | null
  >(null);
  const [requestMessage, setRequestMessage] = useState("");
  const [participants, setParticipants] = useState<TripParticipant[]>([]);
  const [referencePeople, setReferencePeople] = useState<ReferencePerson[]>([]);
  const [participantsError, setParticipantsError] = useState<string | null>(
    null,
  );
  const [participantName, setParticipantName] = useState("");
  const [participantEmail, setParticipantEmail] = useState("");
  const [isInviting, setIsInviting] = useState(false);
  const [participantGateMessage, setParticipantGateMessage] = useState<
    string | null
  >(null);
  const [showParticipantUpgradeModal, setShowParticipantUpgradeModal] =
    useState(false);
  const [accessRole, setAccessRole] = useState<TripAccessRole>("organiser");
  const [hotels, setHotels] = useState<HotelSelection[]>([]);
  const [activities, setActivities] = useState<ActivitySelection[]>([]);
  const [transport, setTransport] = useState<TransportSelection[]>([]);
  const [dining, setDining] = useState<DiningSelection[]>([]);
  const [voting, setVoting] = useState<VotingState | null>(null);
  const [selectedPlaceDetails, setSelectedPlaceDetails] = useState<SavedPlaceSummary | null>(null);
  const [submittingVoteKey, setSubmittingVoteKey] = useState<string | null>(
    null,
  );
  const [voteFeedback, setVoteFeedback] = useState<{
    id: number;
    direction: "up" | "down";
    removed: boolean;
  } | null>(null);
  const [assumedSession, setAssumedSession] = useState(false);
  const [testingAccessLogReady, setTestingAccessLogReady] = useState(false);
  const [testingAccessLogOpen, setTestingAccessLogOpen] = useState(false);
  const [testingConsoleTab, setTestingConsoleTab] = useState<
    "activity" | "access"
  >("activity");
  const [testingActivityLogs, setTestingActivityLogs] = useState<
    TestingActivityLog[]
  >([]);
  const [testingActivityLoading, setTestingActivityLoading] = useState(false);
  const [testingActivityError, setTestingActivityError] = useState<
    string | null
  >(null);
  const [planningDrawer, setPlanningDrawer] =
    useState<TripPlanningDrawer>(null);
  const [expensesReady, setExpensesReady] = useState(false);
  const [ownerDrawer, setOwnerDrawer] = useState<TripOwnerDrawer>(null);
  const [slidePanelExpanded, setSlidePanelExpanded] = useState(false);
  const [participantDrawerTab, setParticipantDrawerTab] =
    useState<ParticipantDrawerTab>("invite");
  const [discussionComments, setDiscussionComments] = useState<
    DiscussionComment[]
  >([]);
  const [expandedAttachmentMessageIds, setExpandedAttachmentMessageIds] = useState<string[]>([]);
  const [discussionError, setDiscussionError] = useState<string | null>(null);
  const [discussionBody, setDiscussionBody] = useState("");
  const [chatReferencesOpen, setChatReferencesOpen] = useState(false);
  const [chatReferenceQuery, setChatReferenceQuery] = useState("");
  const [chatReferencesFromMention, setChatReferencesFromMention] = useState(false);
  const [chatAddMenuOpen, setChatAddMenuOpen] = useState(false);
  const [chatAddMenuClosing, setChatAddMenuClosing] = useState(false);
  const [chatEmojiOpen, setChatEmojiOpen] = useState(false);
  const [pendingChatStickers, setPendingChatStickers] = useState<ChatMediaItem[]>([]);
  const [pendingChatGif, setPendingChatGif] = useState<ChatMediaItem | null>(null);
  const [chatAudioRecording, setChatAudioRecording] = useState(false);
  const [chatAudioPaused, setChatAudioPaused] = useState(false);
  const [chatAudioUploading, setChatAudioUploading] = useState(false);
  const [chatAudioSeconds, setChatAudioSeconds] = useState(0);
  const chatAudioWaveformRef = useRef<HTMLDivElement | null>(null);
  const chatAudioWaveSurferRef = useRef<WaveSurfer | null>(null);
  const chatAudioRecordPluginRef = useRef<RecordPlugin | null>(null);
  const chatAudioCancelledRef = useRef(false);
  const [chatCameraOpen, setChatCameraOpen] = useState(false);
  const [chatCameraError, setChatCameraError] = useState<string | null>(null);
  const [chatCameraSource, setChatCameraSource] = useState<Blob | null>(null);
  const [chatCameraSourceUrl, setChatCameraSourceUrl] = useState("");
  const [chatCameraZoom, setChatCameraZoom] = useState(1);
  const [chatCameraX, setChatCameraX] = useState(0);
  const [chatCameraY, setChatCameraY] = useState(0);
  const [pendingChatPhotos, setPendingChatPhotos] = useState<PendingChatPhoto[]>([]);
  const [pendingChatFiles, setPendingChatFiles] = useState<PendingChatFile[]>([]);
  const [chatFileDragActive, setChatFileDragActive] = useState(false);
  const chatFileDragDepthRef = useRef(0);
  const chatCameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const chatCameraStreamRef = useRef<MediaStream | null>(null);
  const chatCameraFileRef = useRef<HTMLInputElement | null>(null);
  const chatAttachmentFileRef = useRef<HTMLInputElement | null>(null);
  const chatCameraDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    imageX: number;
    imageY: number;
  } | null>(null);
  const [chatComposerExpanded, setChatComposerExpanded] = useState(false);
  const chatComposerModalClosingRef = useRef(false);
  const chatComposerModalRef = useRef<HTMLElement | null>(null);
  const chatComposerBackdropRef = useRef<HTMLDivElement | null>(null);
  const messagesDrawerRef = useRef<HTMLElement | null>(null);
  const messagesDrawerBackdropRef = useRef<HTMLDivElement | null>(null);
  const messagesDrawerClosingRef = useRef(false);
  const [chatComposerOverflows, setChatComposerOverflows] = useState(false);
  const chatComposerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const chatComposerHighlightRef = useRef<HTMLDivElement | null>(null);
  const chatLinkPreviewsRef = useRef<HTMLDivElement | null>(null);
  const chatMessageListRef = useRef<HTMLDivElement | null>(null);
  const chatNotificationAudioRef = useRef<AudioContext | null>(null);
  const [discussionHasMore, setDiscussionHasMore] = useState(false);
  const [discussionLoadingMore, setDiscussionLoadingMore] = useState(false);
  const [discussionReplyBody, setDiscussionReplyBody] = useState<
    Record<string, string>
  >({});
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [messageOptionsId, setMessageOptionsId] = useState<string | null>(null);
  const [isSubmittingDiscussion, setIsSubmittingDiscussion] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(
    null,
  );
  const [deleteConfirmCommentId, setDeleteConfirmCommentId] = useState<
    string | null
  >(null);
  const [profileTooltip, setProfileTooltip] = useState<{
    comment: DiscussionComment;
    top: number;
    left: number;
    opensBelow: boolean;
  } | null>(null);
  const [hoveredDraftLink, setHoveredDraftLink] = useState<string | null>(null);

  useEffect(() => {
    const textarea = chatComposerTextareaRef.current;
    if (!textarea) return;

    const frame = window.requestAnimationFrame(() => {
      textarea.style.height = "auto";
      const overflows = textarea.scrollHeight > 124;
      textarea.style.height = `${Math.min(textarea.scrollHeight, 124)}px`;
      textarea.style.overflowY = overflows ? "auto" : "hidden";
      setChatComposerOverflows(overflows);
      if (!overflows) setChatComposerExpanded(false);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [discussionBody, discussionReplyBody, replyingToId]);

  function showChatProfileCard(
    anchor: HTMLElement,
    comment: DiscussionComment,
    alignRight: boolean,
  ) {
    const cardWidth = 220;
    const cardHeight = 270;
    const gap = 8;
    const edgeGap = 8;
    const anchorRect = anchor.getBoundingClientRect();
    const chatRect = anchor
      .closest(`.${styles.whatsAppChatList}`)
      ?.getBoundingClientRect();
    const bounds = {
      top: Math.max(chatRect?.top ?? 0, edgeGap),
      right: Math.min(chatRect?.right ?? window.innerWidth, window.innerWidth - edgeGap),
      bottom: Math.min(chatRect?.bottom ?? window.innerHeight, window.innerHeight - edgeGap),
      left: Math.max(chatRect?.left ?? 0, edgeGap),
    };
    const roomAbove = anchorRect.top - bounds.top;
    const roomBelow = bounds.bottom - anchorRect.bottom;
    const opensBelow = roomAbove < cardHeight + gap && roomBelow > roomAbove;
    const desiredTop = opensBelow
      ? anchorRect.bottom + gap
      : anchorRect.top - cardHeight - gap;
    const desiredLeft = alignRight
      ? anchorRect.right - cardWidth
      : anchorRect.left;

    setProfileTooltip({
      comment,
      top: Math.max(bounds.top, Math.min(desiredTop, bounds.bottom - cardHeight)),
      left: Math.max(bounds.left, Math.min(desiredLeft, bounds.right - cardWidth)),
      opensBelow,
    });
  }

  async function closeChatComposerModal() {
    if (chatComposerModalClosingRef.current) return;
    chatComposerModalClosingRef.current = true;

    const modal = chatComposerModalRef.current;
    const backdrop = chatComposerBackdropRef.current;

    if (!modal) {
      setChatComposerExpanded(false);
      chatComposerModalClosingRef.current = false;
      return;
    }

    const modalRect = modal.getBoundingClientRect();
    const travelDistance = window.innerHeight - modalRect.top + 40;
    const modalAnimation = modal.animate(
      [
        { transform: "translate3d(0, 0, 0)", opacity: 1 },
        { transform: `translate3d(0, ${travelDistance}px, 0)`, opacity: 0.92 },
      ],
      {
        duration: 520,
        easing: "cubic-bezier(0.45, 0, 0.75, 0.25)",
        fill: "forwards",
      },
    );
    const backdropAnimation = backdrop?.animate(
      [{ opacity: 1 }, { opacity: 0 }],
      { duration: 520, easing: "ease-in", fill: "forwards" },
    );

    await Promise.allSettled(
      [modalAnimation.finished, backdropAnimation?.finished].filter(
        (animation): animation is Promise<Animation> => Boolean(animation),
      ),
    );
    setChatComposerExpanded(false);
    chatComposerModalClosingRef.current = false;
  }

  async function closeOwnerDrawer() {
    if (ownerDrawer !== "messages") {
      setOwnerDrawer(null);
      return;
    }

    if (messagesDrawerClosingRef.current) return;
    messagesDrawerClosingRef.current = true;
    const drawer = messagesDrawerRef.current;
    const backdrop = messagesDrawerBackdropRef.current;

    if (!drawer) {
      setOwnerDrawer(null);
      messagesDrawerClosingRef.current = false;
      return;
    }

    const drawerAnimation = drawer.animate(
      [
        { transform: "translate3d(0, 0, 0)", opacity: 1 },
        { transform: "translate3d(100%, 0, 0)", opacity: 1 },
      ],
      {
        duration: 420,
        easing: "cubic-bezier(0.45, 0, 0.75, 0.25)",
        fill: "forwards",
      },
    );
    const backdropAnimation = backdrop?.animate(
      [{ opacity: 1 }, { opacity: 0 }],
      { duration: 420, easing: "ease-in", fill: "forwards" },
    );

    await Promise.allSettled(
      [drawerAnimation.finished, backdropAnimation?.finished].filter(
        (animation): animation is Promise<Animation> => Boolean(animation),
      ),
    );
    setOwnerDrawer(null);
    messagesDrawerClosingRef.current = false;
  }

  useEffect(() => {
    setAssumedSession(isAssumedSession());
    setTestingAccessLogReady(true);
  }, []);

  useEffect(() => {
    if (ownerDrawer !== "expenses" || !expensesReady) return;
    const panel = messagesDrawerRef.current;
    if (!panel) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOwnerDrawer(null);
      }
      if (event.key !== "Tab" || !panel) return;
      const controls = Array.from(panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled]), summary, [tabindex="0"]'))
        .filter((element) => element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first) { event.preventDefault(); panel.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel)) {
        event.preventDefault(); first.focus();
      }
    }
    panel.addEventListener("keydown", onKeyDown);
    return () => {
      panel.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [ownerDrawer, expensesReady]);

  useEffect(() => {
    setSlidePanelExpanded(false);
  }, [ownerDrawer, planningDrawer]);

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

      setPlan(
        user?.user_metadata?.plan === "pro_organiser"
          ? "pro_organiser"
          : "free",
      );
      setCurrentUserEmail(user?.email ?? "");
      setCurrentUserId(user?.id ?? "");

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
        referencePeople?: ReferencePerson[];
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
      setReferencePeople(result.referencePeople ?? []);
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

      setTestingActivityLoading(true);
      setTestingActivityError(null);
      const activityResponse = await fetch(
        `/api/testing/activity-log?tripId=${tripId}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        },
      );
      const activityResult = (await activityResponse
        .json()
        .catch(() => null)) as {
        activityLogs?: TestingActivityLog[];
        error?: string;
      } | null;

      if (mounted) {
        if (activityResponse.ok) {
          setTestingActivityLogs(activityResult?.activityLogs ?? []);
        } else {
          setTestingActivityLogs([]);
          setTestingActivityError(
            activityResult?.error || "Unable to load testing activity.",
          );
        }
        setTestingActivityLoading(false);
      }

      setLoadingTrip(false);
    }

    void loadTrip();

    return () => {
      mounted = false;
    };
  }, [tripId]);

  const tripTitle = loadingTrip ? "Loading trip..." : trip?.title || "Trip";
  const completedSections = [
    hotels.length,
    activities.length,
    transport.length,
    dining.length,
  ].filter((count) => count > 0).length;
  const overallProgress = voting
    ? Math.round(
        planningCategories.reduce(
          (sum, category) =>
            sum + (voting[category.key as CategoryKey]?.progress ?? 0),
          0,
        ) / planningCategories.length,
      )
    : Math.round((completedSections / planningCategories.length) * 100);
  const hotelVoteSummary = getVoteSummary(voting?.hotels);
  const activityVoteSummary = getVoteSummary(voting?.activities);
  const transportVoteSummary = getVoteSummary(voting?.transport);
  const diningVoteSummary = getVoteSummary(voting?.dining);
  const planningVoteMix = useMemo(
    () => [
      { id: "hotels", label: "Hotels", value: hotelVoteSummary.votes },
      {
        id: "activities",
        label: "Activities",
        value: activityVoteSummary.votes,
      },
      {
        id: "transport",
        label: "Transport",
        value: transportVoteSummary.votes,
      },
      { id: "dining", label: "Dining", value: diningVoteSummary.votes },
    ],
    [
      activityVoteSummary.votes,
      diningVoteSummary.votes,
      hotelVoteSummary.votes,
      transportVoteSummary.votes,
    ],
  );
  const hotelVoteChart = useMemo(
    () =>
      buildVoteChartData(
        hotels,
        voting?.hotels?.itemVotes,
        (hotel) => hotel.name,
      ),
    [hotels, voting?.hotels?.itemVotes],
  );
  const activityVoteChart = useMemo(
    () =>
      buildVoteChartData(
        activities,
        voting?.activities?.itemVotes,
        (activity) => activity.title,
      ),
    [activities, voting?.activities?.itemVotes],
  );
  const transportVoteChart = useMemo(
    () =>
      buildVoteChartData(
        transport,
        voting?.transport?.itemVotes,
        (option) => option.mode,
      ),
    [transport, voting?.transport?.itemVotes],
  );
  const diningVoteChart = useMemo(
    () =>
      buildVoteChartData(
        dining,
        voting?.dining?.itemVotes,
        (option) => option.name,
      ),
    [dining, voting?.dining?.itemVotes],
  );
  const workspaceSummary = useMemo(
    () =>
      trip && accessRole !== "public"
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
    [
      accessRole,
      activities,
      dining,
      hotels,
      overallProgress,
      participants,
      transport,
      trip,
      voting,
    ],
  );
  const sectionHref = (section: string) => `/trips/${tripId}/${section}`;
  const currentParticipant = participants.find(
    (participant) =>
      participant.email.toLowerCase() === currentUserEmail.toLowerCase(),
  );
  const currentMembershipStatus =
    getParticipantMembershipStatus(currentParticipant);
  const currentParticipantIsActive = currentMembershipStatus === "active";
  const canUpdateAttendance =
    accessRole === "participant" &&
    Boolean(currentParticipant) &&
    currentParticipantIsActive;
  const canRequestParticipation =
    accessRole === "public" && !currentParticipant && Boolean(currentUserEmail);
  const showTestingAccessLog =
    testingAccessLogReady &&
    (assumedSession || process.env.NODE_ENV !== "production");
  const testingAccessLevel = useMemo(() => {
    if (accessRole === "organiser") {
      return "Organiser controls";
    }

    if (accessRole === "participant") {
      return currentParticipantIsActive
        ? "Active participant"
        : "Connected view only";
    }

    if (canRequestParticipation) {
      return "Public viewer with request option";
    }

    if (currentParticipant) {
      return "Public connected view";
    }

    return "View only";
  }, [
    accessRole,
    canRequestParticipation,
    currentParticipant,
    currentParticipantIsActive,
  ]);
  const testingAccessRows = useMemo(
    () => [
      { label: "Base level", value: "View only" },
      { label: "Derived level", value: testingAccessLevel },
      { label: "Viewer email", value: currentUserEmail || "Not signed in" },
      { label: "Trip role", value: normaliseAccessValue(accessRole) },
      {
        label: "Connection type",
        value:
          accessRole === "organiser"
            ? "owner"
            : normaliseAccessValue(currentParticipant?.role),
      },
      {
        label: "Participant status",
        value: normaliseAccessValue(currentParticipant?.status),
      },
      {
        label: "Membership",
        value: normaliseAccessValue(currentMembershipStatus),
      },
      {
        label: "Attendance",
        value: currentParticipant
          ? getAttendanceStatusLabel(currentParticipant.attendance_status)
          : "Not connected",
      },
      {
        label: "Trip status",
        value: trip ? getTripStatusLabel(trip.status) : "Not loaded",
      },
      {
        label: "Visibility",
        value: trip ? normaliseTripVisibility(trip.visibility) : "Not loaded",
      },
      {
        label: "Membership plan",
        value: plan === "pro_organiser" ? "Pro organiser" : "Free",
      },
    ],
    [
      accessRole,
      currentMembershipStatus,
      currentParticipant,
      currentUserEmail,
      plan,
      testingAccessLevel,
      trip,
    ],
  );
  const testingAccessAdded = useMemo(() => {
    const items = ["Trip preview and read-only planning sections"];

    if (accessRole === "organiser") {
      items.push(
        "Publish, visibility, draft delete, invites, and participant approvals",
      );
      items.push(
        plan === "free"
          ? "Invite limit: up to 5 travellers"
          : "Expanded organiser limits",
      );
    }

    if (canUpdateAttendance) {
      items.push("Attendance controls for this active participant");
    }

    if (canRequestParticipation) {
      items.push("Request to join this public trip");
    }

    if (accessRole === "public" && currentParticipant) {
      items.push("Public trip connection status message");
    }

    return items;
  }, [
    accessRole,
    canRequestParticipation,
    canUpdateAttendance,
    currentParticipant,
    plan,
  ]);
  const testingAccessRemoved = useMemo(() => {
    const items: string[] = [];

    if (accessRole !== "organiser") {
      items.push("Organiser controls are hidden");
      items.push("Invite and participant approval controls are hidden");
      items.push("Draft delete and visibility controls are hidden");
    }

    if (!canUpdateAttendance) {
      items.push(
        accessRole === "participant" && currentParticipant
          ? "Attendance controls are withheld until membership is active"
          : "Attendance controls are hidden",
      );
    }

    if (!canRequestParticipation) {
      items.push(
        accessRole === "public" && currentParticipant
          ? "Join request is hidden because this viewer is already connected"
          : "Public join request is hidden",
      );
    }

    return items;
  }, [
    accessRole,
    canRequestParticipation,
    canUpdateAttendance,
    currentParticipant,
  ]);
  const testingNotificationLogs = useMemo(
    () =>
      testingActivityLogs.filter((log) => Boolean(log.metadata?.notification)),
    [testingActivityLogs],
  );
  const planningDrawerMeta = useMemo(() => {
    switch (planningDrawer) {
      case "hotels":
        return {
          eyebrow: "Hotels",
          title: "Selected stays",
          copy: "Full accommodation shortlist for this trip.",
          count: hotels.length,
          empty: "No hotels have been added yet.",
        };
      case "activities":
        return {
          eyebrow: "Activities",
          title: "Selected activities",
          copy: "Full activity list for this trip.",
          count: activities.length,
          empty: "No activities have been added yet.",
        };
      case "transport":
        return {
          eyebrow: "Transport",
          title: "Selected transport",
          copy: "Full transport list for this trip.",
          count: transport.length,
          empty: "No transport has been added yet.",
        };
      case "dining":
        return {
          eyebrow: "Dining",
          title: "Selected dining",
          copy: "Full dining list for this trip.",
          count: dining.length,
          empty: "No dining has been added yet.",
        };
      default:
        return null;
    }
  }, [
    activities.length,
    dining.length,
    hotels.length,
    planningDrawer,
    transport.length,
  ]);
  const pendingApprovalParticipants = participants.filter(
    (participant) =>
      participant.membership_status === "pending_approval" ||
      participant.status === "pending",
  );
  const acceptedParticipants = participants.filter(
    (participant) =>
      participant.membership_status === "active" ||
      participant.status === "accepted",
  );
  const invitedParticipants = participants.filter(
    (participant) =>
      participant.membership_status === "invited" ||
      (!participant.membership_status && participant.status === "invited"),
  );
  const declinedParticipants = participants.filter(
    (participant) =>
      participant.membership_status === "declined" ||
      participant.membership_status === "removed" ||
      participant.status === "declined",
  );
  const goingParticipants = participants.filter(
    (participant) => participant.attendance_status === "going",
  );
  const maybeParticipants = participants.filter(
    (participant) => participant.attendance_status === "maybe",
  );
  const notGoingParticipants = participants.filter(
    (participant) => participant.attendance_status === "not_going",
  );
  const attendanceNotSetParticipants = participants.filter(
    (participant) => !participant.attendance_status,
  );
  const respondedParticipants = participants.filter(
    (participant) =>
      Boolean(participant.responded_at) ||
      participant.status === "accepted" ||
      participant.status === "declined" ||
      participant.membership_status === "active" ||
      participant.membership_status === "declined" ||
      Boolean(participant.attendance_status),
  );
  const participantResponseRate = participants.length
    ? Math.round((respondedParticipants.length / participants.length) * 100)
    : 0;
  const peopleFunnelRows = [
    { label: "Invited", count: invitedParticipants.length },
    { label: "Pending approval", count: pendingApprovalParticipants.length },
    { label: "Active participants", count: acceptedParticipants.length },
    { label: "Declined or removed", count: declinedParticipants.length },
  ];
  const attendanceRows = [
    { label: "Going", count: goingParticipants.length },
    { label: "Maybe", count: maybeParticipants.length },
    { label: "Not going", count: notGoingParticipants.length },
    { label: "Not set", count: attendanceNotSetParticipants.length },
  ];
  const currentViewerHasActiveMembership =
    accessRole === "organiser" ||
    Boolean(
      currentParticipant &&
      (currentParticipant.membership_status === "active" ||
        currentParticipant.status === "accepted"),
    );
  const canUseTripMessaging =
    currentViewerHasActiveMembership && acceptedParticipants.length > 0;
  const canViewTripExpenses =
    accessRole === "organiser" ||
    Boolean(currentParticipant && (currentParticipant.membership_status
      ? currentParticipant.membership_status === "active"
      : currentParticipant.status === "accepted"));

  useEffect(() => {
    if (ownerDrawer !== "messages" || !tripId || !canUseTripMessaging) return;

    const channel = supabase
      .channel(`trip-chat-${tripId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "comments",
          filter: `trip_id=eq.${tripId}`,
        },
        (payload) => {
          const changedComment = payload.new as { author_id?: string; entity_type?: string } | null;
          const oldComment = payload.old as { entity_type?: string } | null;
          if ((changedComment?.entity_type ?? oldComment?.entity_type) !== "trip") return;

          if (payload.eventType === "INSERT" && changedComment?.author_id !== currentUserId) {
            playChatNotificationSound();
          }
          void loadDiscussionComments().then(() => scrollChatToBottom());
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [canUseTripMessaging, currentUserId, ownerDrawer, tripId]);

  const visibleWorkspaceNav = tripWorkspaceNav.filter(
    (item) => item.id !== "discussion",
  );
  const commentById = discussionComments.reduce<
    Record<string, DiscussionComment>
  >((accumulator, comment) => {
    accumulator[comment.id] = comment;
    return accumulator;
  }, {});
  const chronologicalDiscussion = [...discussionComments].sort(
    (first, second) =>
      new Date(first.createdAt).getTime() -
      new Date(second.createdAt).getTime(),
  );
  const chatReferenceGroups = useMemo(
    () => [
      {
        label: "Hotels",
        items: hotels.map((hotel) => ({
          id: hotel.id,
          label: hotel.name,
          detail: hotel.location || "Selected stay",
          imageUrl: hotel.source_photo_url || "",
          googlePlaceId: hotel.google_place_id || "",
          rating: getGoogleRatingFromNotes(hotel.notes),
          token: makeChatReference("hotel", hotel.id, hotel.name),
        })),
      },
      {
        label: "Activities",
        items: activities.map((activity) => ({
          id: activity.id,
          label: activity.title,
          detail: activity.location || "Selected activity",
          imageUrl: activity.source_photo_url || "",
          googlePlaceId: activity.google_place_id || "",
          rating: getGoogleRatingFromNotes(activity.notes),
          token: makeChatReference("activity", activity.id, activity.title),
        })),
      },
      {
        label: "Transport",
        items: transport.map((option) => ({
          id: option.id,
          label: option.mode || "Transport",
          detail:
            [option.departure_location, option.arrival_location]
              .filter(Boolean)
              .join(" to ") || "Selected transport",
          imageUrl: option.source_photo_url || "",
          googlePlaceId: option.google_place_id || "",
          rating: getGoogleRatingFromNotes(option.notes),
          token: makeChatReference(
            "transport",
            option.id,
            option.mode || "Transport",
          ),
        })),
      },
      {
        label: "Dining",
        items: dining.map((option) => ({
          id: option.id,
          label: option.name,
          detail: option.location || "Selected dining",
          imageUrl: option.source_photo_url || "",
          googlePlaceId: option.google_place_id || "",
          rating: getGoogleRatingFromNotes(option.notes),
          token: makeChatReference("dining", option.id, option.name),
        })),
      },
      {
        label: "People",
        items: referencePeople.map((person) => ({
          id: person.id,
          label: person.fullName,
          detail: person.bio || person.roleLabel,
          imageUrl: person.avatarUrl,
          backgroundUrl: person.backgroundUrl,
          backgroundPattern: person.backgroundPattern,
          googlePlaceId: "",
          rating: "",
          token: makeChatReference(
            "person",
            person.id,
            person.fullName,
          ),
        })),
      },
    ],
    [activities, dining, hotels, referencePeople, transport],
  );
  const filteredChatReferenceGroups = useMemo(() => {
    const query = chatReferenceQuery.trim().toLowerCase();
    if (!query) return chatReferenceGroups;
    return chatReferenceGroups.map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        `${item.label} ${item.detail}`.toLowerCase().includes(query),
      ),
    }));
  }, [chatReferenceGroups, chatReferenceQuery]);

  function appendToChatDraft(value: string) {
    if (replyingToId) {
      setDiscussionReplyBody((current) => ({
        ...current,
        [replyingToId]: `${current[replyingToId] ?? ""}${current[replyingToId] ? " " : ""}${value}`,
      }));
      return;
    }

    setDiscussionBody((current) => `${current}${current ? " " : ""}${value}`);
  }

  function appendChatReference(value: string) {
    const addReference = (current: string) => {
      const mentionIndex = chatReferencesFromMention ? current.lastIndexOf("@") : -1;
      const withoutTrigger = mentionIndex >= 0 ? current.slice(0, mentionIndex) : current;
      return `${withoutTrigger}${withoutTrigger && !withoutTrigger.endsWith(" ") ? " " : ""}${value}`;
    };
    if (replyingToId) {
      setDiscussionReplyBody((current) => ({
        ...current,
        [replyingToId]: addReference(current[replyingToId] ?? ""),
      }));
      return;
    }
    setDiscussionBody(addReference);
  }

  function closeChatReferences() {
    setChatReferencesOpen(false);
    setChatReferenceQuery("");
    setChatReferencesFromMention(false);
  }

  function updateChatReferenceSearch(value: string) {
    const mention = value.match(/@([^@\n]*)$/);
    if (!mention) {
      if (chatReferencesFromMention) closeChatReferences();
      return;
    }
    if (!chatReferencesFromMention && !value.endsWith("@")) return;
    setChatReferencesOpen(true);
    setChatReferencesFromMention(true);
    setChatReferenceQuery(mention[1].trimStart());
    setChatAddMenuOpen(false);
    setChatEmojiOpen(false);
  }

  function updateActiveChatDraft(value: string) {
    if (replyingToId) {
      setDiscussionReplyBody((current) => ({
        ...current,
        [replyingToId]: value,
      }));
      return;
    }

    setDiscussionBody(value);
  }

  function removeLinkFromChatDraft(link: string) {
    const start = activeChatDraft.indexOf(link);
    if (start < 0) return;

    const before = activeChatDraft.slice(0, start);
    const after = activeChatDraft.slice(start + link.length).replace(/^\s{1,3}/, "");
    updateActiveChatDraft(`${before}${after}`);
    setHoveredDraftLink(null);
    requestAnimationFrame(() => chatComposerTextareaRef.current?.focus());
  }

  function handleAddChatLink() {
    const url = window.prompt("Paste a link or attachment URL");

    if (!url?.trim()) {
      return;
    }

    appendToChatDraft(url.trim());
  }

  function resetChatCameraCrop() {
    if (chatCameraSourceUrl) URL.revokeObjectURL(chatCameraSourceUrl);
    setChatCameraSource(null);
    setChatCameraSourceUrl("");
    setChatCameraZoom(1);
    setChatCameraX(0);
    setChatCameraY(0);
  }

  function stopChatCamera() {
    chatCameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    chatCameraStreamRef.current = null;
  }

  function closeChatCamera() {
    stopChatCamera();
    resetChatCameraCrop();
    setChatCameraOpen(false);
    setChatCameraError(null);
  }

  async function attachChatCameraStream(stream: MediaStream) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    if (!chatCameraVideoRef.current) return;
    chatCameraVideoRef.current.srcObject = stream;
    await chatCameraVideoRef.current.play().catch(() => undefined);
  }

  async function openChatCamera() {
    setChatCameraOpen(true);
    setChatCameraError(null);
    resetChatCameraCrop();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      chatCameraStreamRef.current = stream;
      await attachChatCameraStream(stream);
    } catch {
      setChatCameraError("Camera access was not available. You can choose a photo instead.");
    }
  }

  function useChatCameraSource(blob: Blob) {
    if (chatCameraSourceUrl) URL.revokeObjectURL(chatCameraSourceUrl);
    setChatCameraSource(blob);
    setChatCameraSourceUrl(URL.createObjectURL(blob));
    setChatCameraZoom(1);
    setChatCameraX(0);
    setChatCameraY(0);
  }

  async function captureChatCameraPhoto() {
    const video = chatCameraVideoRef.current;
    if (!video?.videoWidth || !video.videoHeight) {
      setChatCameraError("The camera is still starting. Try again in a moment.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.92),
    );
    if (blob) useChatCameraSource(blob);
  }

  async function addCroppedChatPhoto() {
    if (!chatCameraSource) return;
    const image = await createImageBitmap(chatCameraSource);
    const width = 1200;
    const height = 900;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return;

    const scale = Math.max(width / image.width, height / image.height) * chatCameraZoom;
    const drawnWidth = image.width * scale;
    const drawnHeight = image.height * scale;
    const spareX = Math.max(0, drawnWidth - width) / 2;
    const spareY = Math.max(0, drawnHeight - height) / 2;
    context.drawImage(
      image,
      (width - drawnWidth) / 2 + (chatCameraX / 100) * spareX,
      (height - drawnHeight) / 2 + (chatCameraY / 100) * spareY,
      drawnWidth,
      drawnHeight,
    );
    image.close();
    const croppedBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.88),
    );
    if (!croppedBlob) return;
    setPendingChatPhotos((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        blob: croppedBlob,
        previewUrl: URL.createObjectURL(croppedBlob),
      },
    ]);
    resetChatCameraCrop();
    const stream = chatCameraStreamRef.current;
    if (stream) void attachChatCameraStream(stream);
  }

  function removePendingChatPhoto(id: string) {
    setPendingChatPhotos((current) => {
      const photo = current.find((item) => item.id === id);
      if (photo) URL.revokeObjectURL(photo.previewUrl);
      return current.filter((item) => item.id !== id);
    });
  }

  function addPendingChatFiles(files: FileList | File[]) {
    const additions = Array.from(files).filter((file) => file.size > 0);
    if (!additions.length) return;
    setPendingChatFiles((current) => [
      ...current,
      ...additions.map((file) => ({ id: crypto.randomUUID(), file })),
    ]);
  }

  function removePendingChatFile(id: string) {
    setPendingChatFiles((current) => current.filter((item) => item.id !== id));
  }

  async function uploadPendingChatPhotos() {
    if (!pendingChatPhotos.length) return [];
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("You need to be signed in to send photos.");
    return Promise.all(
      pendingChatPhotos.map(async (photo) => {
        const filePath = `chat-images/${tripId}/${user.id}/${crypto.randomUUID()}.jpg`;
        const { error } = await supabase.storage
          .from("trip-images")
          .upload(filePath, photo.blob, { contentType: "image/jpeg", upsert: false });
        if (error) throw new Error(error.message);
        return supabase.storage.from("trip-images").getPublicUrl(filePath).data.publicUrl;
      }),
    );
  }

  async function uploadPendingChatFiles() {
    if (!pendingChatFiles.length) return [];
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("You need to be signed in to send files.");
    return Promise.all(
      pendingChatFiles.map(async ({ file }) => {
        const safeName = file.name.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "attachment";
        const filePath = `chat-files/${tripId}/${user.id}/${crypto.randomUUID()}--${safeName}`;
        const { error } = await supabase.storage
          .from("trip-images")
          .upload(filePath, file, { contentType: file.type || "application/octet-stream", upsert: false });
        if (error) throw new Error(error.message);
        return supabase.storage.from("trip-images").getPublicUrl(filePath).data.publicUrl;
      }),
    );
  }

  async function startChatAudioRecording() {
    try {
      const preferredType = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find(
        (type) => MediaRecorder.isTypeSupported(type),
      );
      chatAudioCancelledRef.current = false;
      setChatAudioSeconds(0);
      setChatAudioPaused(false);
      setChatAudioRecording(true);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (!chatAudioWaveformRef.current) throw new Error("Recorder display unavailable.");

      const waveform = WaveSurfer.create({
        container: chatAudioWaveformRef.current,
        height: 30,
        waveColor: "rgba(24, 49, 83, 0.24)",
        progressColor: "#2c94f5",
        cursorColor: "#0f6fbd",
        cursorWidth: 2,
        barWidth: 3,
        barGap: 2,
        barRadius: 3,
        barMinHeight: 2,
        interact: false,
      });
      const record = waveform.registerPlugin(
        RecordPlugin.create({
          continuousWaveform: true,
          renderRecordedAudio: false,
          mediaRecorderTimeslice: 250,
          mimeType: preferredType,
        }),
      );
      chatAudioWaveSurferRef.current = waveform;
      chatAudioRecordPluginRef.current = record;
      record.on("record-progress", (durationMs) =>
        setChatAudioSeconds(Math.floor(durationMs / 1000)),
      );
      record.on("record-end", async (blob) => {
        setChatAudioRecording(false);
        chatAudioRecordPluginRef.current = null;
        chatAudioWaveSurferRef.current = null;
        window.setTimeout(() => waveform.destroy(), 0);
        if (chatAudioCancelledRef.current || !blob.size) return;

        setChatAudioUploading(true);
        try {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (!user) throw new Error("You need to be signed in to send a recording.");
          const extension = blob.type.includes("mp4") ? "m4a" : "webm";
          const filePath = `chat-audio/${tripId}/${user.id}/${crypto.randomUUID()}.${extension}`;
          const { error: uploadError } = await supabase.storage
            .from("trip-images")
            .upload(filePath, blob, { contentType: blob.type, upsert: false });
          if (uploadError) throw new Error(uploadError.message);
          const { data } = supabase.storage.from("trip-images").getPublicUrl(filePath);
          await submitDiscussionMessage(data.publicUrl);
        } catch (error) {
          setDiscussionError(
            error instanceof Error ? error.message : "Unable to send the audio recording.",
          );
        } finally {
          setChatAudioUploading(false);
        }
      });
      await record.startRecording();
    } catch {
      setChatAudioRecording(false);
      setDiscussionError("Microphone access is needed to record an audio message.");
    }
  }

  function finishChatAudioRecording(cancelled = false) {
    chatAudioCancelledRef.current = cancelled;
    chatAudioRecordPluginRef.current?.stopRecording();
  }

  function toggleChatAudioRecording() {
    const recorder = chatAudioRecordPluginRef.current;
    if (!recorder) return;
    if (recorder.isRecording() && !recorder.isPaused()) {
      recorder.pauseRecording();
      setChatAudioPaused(true);
    } else if (recorder.isPaused()) {
      recorder.resumeRecording();
      setChatAudioPaused(false);
    }
  }

  function closeChatAddMenu(afterClose?: () => void) {
    if (!chatAddMenuOpen || chatAddMenuClosing) return;
    setChatAddMenuClosing(true);
    window.setTimeout(() => {
      setChatAddMenuOpen(false);
      setChatAddMenuClosing(false);
      afterClose?.();
    }, 170);
  }

  function renderLinkedText(
    text: string,
    keyPrefix: string,
    visibleAttachmentUrls?: Set<string>,
  ) {
    const parts = text.split(
      /((?:https?:\/\/|www\.)[^\s<>()]+|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s<>()]*)?)/gi,
    );

    return parts.map((part, index) => {
      if (
        /^(?:https?:\/\/|www\.)/i.test(part) ||
        /^(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/|$)/i.test(part)
      ) {
        const url = normaliseWebUrl(part.replace(/[.,!?;:]+$/, ""));
        if (
          visibleAttachmentUrls &&
          (isChatImageUrl(url) || isChatFileUrl(url)) &&
          !visibleAttachmentUrls.has(url)
        ) {
          return null;
        }
        if (isChatAudioUrl(url)) {
          return <ChatAudioPlayer key={`${keyPrefix}-audio-${index}`} url={url} />;
        }
        if (isChatImageUrl(url)) {
          return (
            <a
              key={`${keyPrefix}-image-${index}`}
              className={styles.whatsAppMessagePhoto}
              href={url}
              target="_blank"
              rel="noreferrer"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="Shared chat photo" />
            </a>
          );
        }
        if (isChatFileUrl(url)) {
          return (
            <a
              key={`${keyPrefix}-file-${index}`}
              className={styles.whatsAppMessageFile}
              href={url}
              target="_blank"
              rel="noreferrer"
              download
            >
              <FiFile />
              <span><strong>{getChatFileName(url)}</strong><small>Open attachment</small></span>
            </a>
          );
        }
        return (
          <a
            key={`${keyPrefix}-url-${index}`}
            href={url}
            target="_blank"
            rel="noreferrer"
          >
            {getUrlHost(url)}
          </a>
        );
      }

      return <span key={`${keyPrefix}-text-${index}`}>{part}</span>;
    });
  }

  function renderChatMessageBody(
    body: string,
    stickerCount = 0,
    visibleAttachmentUrls?: Set<string>,
  ) {
    const parts = body.split(/(\[\[journi:[^:\]]+:[^|\]]+\|[^\]]+\]\])/g);

    return parts.map((part, index) => {
      const reference = part.match(
        /^\[\[journi:([^:\]]+):([^|\]]+)\|([^\]]+)\]\]$/,
      );

      if (reference) {
        const [, kind, id, label] = reference;

        if (kind === "sticker" || kind === "gif") {
          return (
            <span
              key={`media-${index}`}
              className={
                kind === "sticker"
                  ? `${styles.whatsAppSentSticker} ${stickerCount === 1 ? styles.whatsAppSentStickerSingle : stickerCount === 2 ? styles.whatsAppSentStickerPair : styles.whatsAppSentStickerGroup}`
                  : styles.whatsAppSentGif
              }
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={id} alt={label} />
            </span>
          );
        }

        const linkedReference = chatReferenceGroups
          .flatMap((group) => group.items.map((item) => ({ ...item, groupLabel: group.label })))
          .find((item) => item.token === part);

        if (kind === "person") {
          return (
            <span key={`reference-${index}`} className={styles.whatsAppPersonMention}>
              {linkedReference?.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={linkedReference.imageUrl} alt="" />
              ) : (
                <span aria-hidden="true">{label.slice(0, 1).toUpperCase()}</span>
              )}
              <strong>{linkedReference?.label || label}</strong>
            </span>
          );
        }

        return null;
      }

      return renderLinkedText(part, `message-${index}`, visibleAttachmentUrls);
    });
  }

  function renderComposerDraft(body: string) {
    const referenceParts = body.split(/(\[\[journi:[^:\]]+:[^|\]]+\|[^\]]+\]\])/g);

    return referenceParts.flatMap((referencePart, referenceIndex) => {
      const reference = referencePart.match(/^\[\[journi:([^:\]]+):([^|\]]+)\|([^\]]+)\]\]$/);
      if (reference && reference[1] !== "sticker" && reference[1] !== "gif") {
        const [, kind, , label] = reference;
        const linkedReference = chatReferenceGroups
          .flatMap((group) => group.items.map((item) => ({ ...item, groupLabel: group.label })))
          .find((item) => item.token === referencePart);
        return [
          <span
            key={`draft-reference-${referenceIndex}`}
            className={styles.whatsAppDraftReference}
            onMouseDown={(event) => {
              event.preventDefault();
              const nextDraft = activeChatDraft.replace(referencePart, "").replace(/\s{2,}/g, " ");
              updateActiveChatDraft(nextDraft);
              requestAnimationFrame(() => chatComposerTextareaRef.current?.focus());
            }}
          >
            {linkedReference?.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={linkedReference.imageUrl} alt="" />
            ) : (
              <span aria-hidden="true">{label.slice(0, 1).toUpperCase()}</span>
            )}
            <span>
              <small>{linkedReference?.groupLabel || kind}</small>
              <strong>{linkedReference?.label || label}</strong>
            </span>
          </span>,
        ];
      }

      const parts = referencePart.split(
        /((?:https?:\/\/|www\.)[^\s<>()]+|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s<>()]*)?)/gi,
      );
      return parts.map((part, index) => {
        if (/^(?:https?:\/\/|www\.)/i.test(part) || /^(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/|$)/i.test(part)) {
          const isEstablished = /^\s/.test(parts[index + 1] ?? "");
          return (
            <span
              key={`draft-link-${referenceIndex}-${index}`}
              className={`${styles.whatsAppDraftLink} ${isEstablished ? styles.whatsAppDraftLinkEstablished : ""}`}
              onMouseEnter={isEstablished ? () => setHoveredDraftLink(normaliseWebUrl(part.replace(/[.,!?;:]+$/, ""))) : undefined}
              onMouseLeave={isEstablished ? () => setHoveredDraftLink(null) : undefined}
              onMouseDown={isEstablished ? (event) => { event.preventDefault(); event.stopPropagation(); removeLinkFromChatDraft(part); } : undefined}
            >
              {part}
            </span>
          );
        }
        return <span key={`draft-text-${referenceIndex}-${index}`}>{part}</span>;
      });
    });
  }

  function renderPlanningVoteControls(category: CategoryKey, entityId: string) {
    const itemVotes = voting?.[category]?.itemVotes[entityId];
    const upVotes = itemVotes?.upVotes ?? itemVotes?.votes ?? 0;
    const downVotes = itemVotes?.downVotes ?? 0;
    const hasUpVoted = Boolean(
      currentUserId &&
      (itemVotes?.upVoterIds ?? itemVotes?.voterIds ?? []).includes(
        currentUserId,
      ),
    );
    const hasDownVoted = Boolean(
      currentUserId && (itemVotes?.downVoterIds ?? []).includes(currentUserId),
    );

    return (
      <div className={styles.tripOptionVoteControls}>
        <button
          type="button"
          className={
            hasUpVoted
              ? styles.tripOptionVoteButtonActive
              : styles.tripOptionVoteButton
          }
          onClick={() => void handleVote(category, entityId, "up")}
          disabled={
            submittingVoteKey === `${category}-${entityId}-up` ||
            !currentViewerHasActiveMembership
          }
          aria-pressed={hasUpVoted}
        >
          {hasUpVoted ? <FaThumbsUp /> : <FiThumbsUp />}
          <span>{upVotes}</span>
        </button>
        <button
          type="button"
          className={
            hasDownVoted
              ? styles.tripOptionVoteButtonDownActive
              : styles.tripOptionVoteButton
          }
          onClick={() => void handleVote(category, entityId, "down")}
          disabled={
            submittingVoteKey === `${category}-${entityId}-down` ||
            !currentViewerHasActiveMembership
          }
          aria-pressed={hasDownVoted}
        >
          {hasDownVoted ? <FaThumbsDown /> : <FiThumbsDown />}
          <span>{downVotes}</span>
        </button>
      </div>
    );
  }

  function formatRank(rank: number) {
    const suffix =
      rank % 100 >= 11 && rank % 100 <= 13
        ? "th"
        : ["th", "st", "nd", "rd"][rank % 10] || "th";

    return `${rank}${suffix}`;
  }

  function getReferenceVoteCategory(groupLabel: string): CategoryKey | null {
    if (groupLabel === "Hotels") return "hotels";
    if (groupLabel === "Activities") return "activities";
    if (groupLabel === "Transport") return "transport";
    if (groupLabel === "Dining") return "dining";
    return null;
  }

  function openSavedPlaceDetails(
    category: string,
    name: string,
    address: string | null,
    placeId?: string | null,
    imageUrl?: string | null,
  ) {
    setSelectedPlaceDetails({ category, name, address: address || "", placeId, imageUrl });
  }

  function getCategoryEntityIds(category: CategoryKey) {
    if (category === "hotels") return hotels.map((item) => item.id);
    if (category === "activities") return activities.map((item) => item.id);
    if (category === "transport") return transport.map((item) => item.id);
    return dining.map((item) => item.id);
  }

  function orderPlanningItemsByVotes<T extends { id: string }>(
    items: T[],
    category: CategoryKey,
  ) {
    const originalOrder = new Map(items.map((item, index) => [item.id, index]));
    return [...items].sort((left, right) => {
      const leftVotes = voting?.[category]?.itemVotes[left.id];
      const rightVotes = voting?.[category]?.itemVotes[right.id];
      const leftUp = leftVotes?.upVotes ?? leftVotes?.votes ?? 0;
      const rightUp = rightVotes?.upVotes ?? rightVotes?.votes ?? 0;
      const leftScore = leftUp - (leftVotes?.downVotes ?? 0);
      const rightScore = rightUp - (rightVotes?.downVotes ?? 0);
      return (
        rightScore - leftScore ||
        rightUp - leftUp ||
        (originalOrder.get(left.id) ?? 0) - (originalOrder.get(right.id) ?? 0)
      );
    });
  }

  function renderPlanningVoteBadge(
    category: CategoryKey,
    entityId: string,
    orderedIds: string[],
  ) {
    const itemVotes = voting?.[category]?.itemVotes[entityId];
    const upVotes = itemVotes?.upVotes ?? itemVotes?.votes ?? 0;
    const downVotes = itemVotes?.downVotes ?? 0;
    const hasUpVoted = Boolean(currentUserId && (itemVotes?.upVoterIds ?? itemVotes?.voterIds ?? []).includes(currentUserId));
    const hasDownVoted = Boolean(currentUserId && (itemVotes?.downVoterIds ?? []).includes(currentUserId));
    const rankedIds = [...orderedIds].sort((leftId, rightId) => {
      const leftVotes = voting?.[category]?.itemVotes[leftId];
      const rightVotes = voting?.[category]?.itemVotes[rightId];
      const leftUpVotes = leftVotes?.upVotes ?? leftVotes?.votes ?? 0;
      const rightUpVotes = rightVotes?.upVotes ?? rightVotes?.votes ?? 0;
      const leftDownVotes = leftVotes?.downVotes ?? 0;
      const rightDownVotes = rightVotes?.downVotes ?? 0;
      const leftScore = leftUpVotes - leftDownVotes;
      const rightScore = rightUpVotes - rightDownVotes;

      return (
        rightScore - leftScore ||
        rightUpVotes - leftUpVotes ||
        orderedIds.indexOf(leftId) - orderedIds.indexOf(rightId)
      );
    });
    const rank = Math.max(1, rankedIds.indexOf(entityId) + 1);

    return (
      <div
        className={styles.tripOptionRankBadge}
        aria-label={`${formatRank(rank)} place, ${upVotes} upvotes and ${downVotes} downvotes`}
      >
        <strong>{formatRank(rank)}</strong>
        <button
          type="button"
          onClick={() => void handleVote(category, entityId, "up")}
          disabled={!currentViewerHasActiveMembership || submittingVoteKey === `${category}-${entityId}-up`}
          aria-label={`Upvote, ${upVotes} votes`}
          aria-pressed={hasUpVoted}
        >
          {hasUpVoted ? <FaThumbsUp /> : <FiThumbsUp />}
          <span>{upVotes}</span>
        </button>
        <button
          type="button"
          onClick={() => void handleVote(category, entityId, "down")}
          disabled={!currentViewerHasActiveMembership || submittingVoteKey === `${category}-${entityId}-down`}
          aria-label={`Downvote, ${downVotes} votes`}
          aria-pressed={hasDownVoted}
        >
          {hasDownVoted ? <FaThumbsDown /> : <FiThumbsDown />}
          <span>{downVotes}</span>
        </button>
      </div>
    );
  }

  function renderPlanningDrawerCards() {
    if (planningDrawer === "hotels") {
      const hotelIds = hotels.map((hotel) => hotel.id);

      return orderPlanningItemsByVotes(hotels, "hotels").map((hotel) => {
        const googleRating = getGoogleRatingFromNotes(hotel.notes);

        return (
          <article key={hotel.id} className={styles.hotelResultCard}>
            {hotel.source_photo_url ? (
              <img
                src={hotel.source_photo_url}
                alt={hotel.name}
                className={styles.hotelResultImage}
              />
            ) : (
              <div className={styles.hotelResultImageFallback} />
            )}
            {renderPlanningVoteBadge("hotels", hotel.id, hotelIds)}
            <strong>{hotel.name}</strong>
            <small>{hotel.location || "Location ready to confirm"}</small>
            {formatHotelRate(hotel) ? (
              <span className={styles.hotelRateBadgeMuted}>
                {formatHotelRate(hotel)}
              </span>
            ) : null}
            {googleRating ? (
              <span className={styles.hotelRatingBadge}>
                <FiStar />
                <strong>{googleRating}</strong>
                <small>Google</small>
              </span>
            ) : null}
            <div className={styles.selectedStayActions}>
              <button
                type="button"
                onClick={() => openSavedPlaceDetails("Hotel", hotel.name, hotel.location, hotel.google_place_id, hotel.source_photo_url)}
                className={styles.hotelActionLink}
              >
                View more
              </button>
            </div>
            {renderPlanningVoteControls("hotels", hotel.id)}
          </article>
        );
      });
    }

    if (planningDrawer === "activities") {
      const activityIds = activities.map((activity) => activity.id);

      return orderPlanningItemsByVotes(activities, "activities").map((activity) => {
        const googleRating = getGoogleRatingFromNotes(activity.notes);

        return (
          <article key={activity.id} className={styles.hotelResultCard}>
            {activity.source_photo_url ? (
              <img
                src={activity.source_photo_url}
                alt={activity.title}
                className={styles.hotelResultImage}
              />
            ) : (
              <div className={styles.hotelResultImageFallback} />
            )}
            {renderPlanningVoteBadge("activities", activity.id, activityIds)}
            <strong>{activity.title}</strong>
            <small>{activity.location || "Activity location"}</small>
            {googleRating ? (
              <span className={styles.hotelRatingBadge}>
                <FiStar />
                <strong>{googleRating}</strong>
                <small>Google</small>
              </span>
            ) : null}
            <div className={styles.selectedStayActions}>
              <button
                type="button"
                onClick={() => openSavedPlaceDetails("Activity", activity.title, activity.location, activity.google_place_id, activity.source_photo_url)}
                className={styles.hotelActionLink}
              >
                View more
              </button>
            </div>
            {renderPlanningVoteControls("activities", activity.id)}
          </article>
        );
      });
    }

    if (planningDrawer === "transport") {
      const transportIds = transport.map((option) => option.id);

      return orderPlanningItemsByVotes(transport, "transport").map((option) => {
        const googleRating = getGoogleRatingFromNotes(option.notes);
        const route =
          [option.departure_location, option.arrival_location]
            .filter(Boolean)
            .join(" to ") || "Transport route ready to confirm";

        return (
          <article key={option.id} className={styles.hotelResultCard}>
            {option.source_photo_url ? (
              <img
                src={option.source_photo_url}
                alt={option.mode || "Transport"}
                className={styles.hotelResultImage}
              />
            ) : (
              <div className={styles.hotelResultImageFallback} />
            )}
            {renderPlanningVoteBadge("transport", option.id, transportIds)}
            <strong>{option.mode || "Transport"}</strong>
            <small>{route}</small>
            {googleRating ? (
              <span className={styles.hotelRatingBadge}>
                <FiStar />
                <strong>{googleRating}</strong>
                <small>Google</small>
              </span>
            ) : null}
            <div className={styles.selectedStayActions}>
              <button
                type="button"
                onClick={() => openSavedPlaceDetails("Transport", option.mode || "Transport", option.arrival_location || option.departure_location, option.google_place_id, option.source_photo_url)}
                className={styles.hotelActionLink}
              >
                View more
              </button>
            </div>
            {renderPlanningVoteControls("transport", option.id)}
          </article>
        );
      });
    }

    if (planningDrawer === "dining") {
      const diningIds = dining.map((option) => option.id);

      return orderPlanningItemsByVotes(dining, "dining").map((option) => {
        const googleRating = getGoogleRatingFromNotes(option.notes);

        return (
          <article key={option.id} className={styles.hotelResultCard}>
            {option.source_photo_url ? (
              <img
                src={option.source_photo_url}
                alt={option.name}
                className={styles.hotelResultImage}
              />
            ) : (
              <div className={styles.hotelResultImageFallback} />
            )}
            {renderPlanningVoteBadge("dining", option.id, diningIds)}
            <strong>{option.name}</strong>
            <small>
              {option.location || "Restaurant location ready to confirm"}
            </small>
            {googleRating ? (
              <span className={styles.hotelRatingBadge}>
                <FiStar />
                <strong>{googleRating}</strong>
                <small>Google</small>
              </span>
            ) : null}
            <div className={styles.selectedStayActions}>
              <button
                type="button"
                onClick={() => openSavedPlaceDetails("Dining", option.name, option.location, option.google_place_id, option.source_photo_url)}
                className={styles.hotelActionLink}
              >
                View more
              </button>
            </div>
            {renderPlanningVoteControls("dining", option.id)}
          </article>
        );
      });
    }

    return null;
  }

  const basicTripSteps = [
    {
      label: "Trip basics",
      eyebrow: "Destination and dates",
      complete: Boolean(trip?.destination && (trip.starts_at || trip.ends_at)),
      meta: trip ? formatTripDatePlanning(trip) : "Not set",
    },
    {
      label: "Hotels",
      eyebrow: "Accommodation",
      complete: hotels.length > 0,
      meta: `${hotels.length} option${hotels.length === 1 ? "" : "s"}`,
    },
    {
      label: "Activities",
      eyebrow: "Things to do",
      complete: activities.length > 0,
      meta: `${activities.length} option${activities.length === 1 ? "" : "s"}`,
    },
    {
      label: "Transport",
      eyebrow: "Getting around",
      complete: transport.length > 0,
      meta: `${transport.length} option${transport.length === 1 ? "" : "s"}`,
    },
    {
      label: "Dining",
      eyebrow: "Food plans",
      complete: dining.length > 0,
      meta: `${dining.length} option${dining.length === 1 ? "" : "s"}`,
    },
    {
      label: "Review",
      eyebrow: "Participants",
      complete: participants.length > 0 || accessRole === "public",
      meta: `${participants.length} participant${participants.length === 1 ? "" : "s"}`,
    },
  ];

  function scrollChatToBottom() {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const list = chatMessageListRef.current;
        if (list) list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
      });
    });
    // Animated media can increase the message height shortly after it renders.
    [180, 520].forEach((delay) => {
      window.setTimeout(() => {
        const list = chatMessageListRef.current;
        if (list) list.scrollTop = list.scrollHeight;
      }, delay);
    });
  }

  function prepareChatNotificationSound() {
    if (!chatNotificationAudioRef.current) {
      chatNotificationAudioRef.current = new AudioContext();
    }
    if (chatNotificationAudioRef.current.state === "suspended") {
      void chatNotificationAudioRef.current.resume();
    }
  }

  function playChatNotificationSound() {
    prepareChatNotificationSound();
    const context = chatNotificationAudioRef.current;
    if (!context || context.state === "closed") return;
    const startedAt = context.currentTime;
    [0, 0.11].forEach((delay, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(index ? 880 : 740, startedAt + delay);
      gain.gain.setValueAtTime(0.0001, startedAt + delay);
      gain.gain.exponentialRampToValueAtTime(0.11, startedAt + delay + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, startedAt + delay + 0.11);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startedAt + delay);
      oscillator.stop(startedAt + delay + 0.12);
    });
  }

  async function loadDiscussionComments(before?: string) {
    if (!tripId || !canUseTripMessaging) {
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setDiscussionError("You need to be signed in before opening messages.");
      return;
    }

    setDiscussionError(null);

    const query = before ? `?before=${encodeURIComponent(before)}` : "";
    const response = await fetch(`/api/trips/${tripId}/discussion${query}`, {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    const result = (await response.json().catch(() => null)) as {
      comments?: DiscussionComment[];
      hasMore?: boolean;
      error?: string;
    } | null;

    if (!response.ok) {
      if (!before) setDiscussionComments([]);
      setDiscussionError(result?.error || "Unable to load messages.");
      return;
    }

    setDiscussionHasMore(Boolean(result?.hasMore));
    if (before) {
      setDiscussionComments((current) => [...(result?.comments ?? []), ...current]);
    } else {
      setDiscussionComments(result?.comments ?? []);
      scrollChatToBottom();
    }
  }

  async function loadOlderDiscussionComments() {
    if (discussionLoadingMore || !discussionHasMore || !discussionComments.length) return;
    const list = chatMessageListRef.current;
    if (!list) return;

    const previousHeight = list.scrollHeight;
    const previousTop = list.scrollTop;
    setDiscussionLoadingMore(true);
    await loadDiscussionComments(discussionComments[0].createdAt);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const currentList = chatMessageListRef.current;
        if (currentList) {
          currentList.scrollTop = previousTop + currentList.scrollHeight - previousHeight;
        }
        setDiscussionLoadingMore(false);
      });
    });
  }

  async function openMessagesDrawer() {
    messagesDrawerClosingRef.current = false;
    prepareChatNotificationSound();
    await loadDiscussionComments();
    setOwnerDrawer("messages");
    requestAnimationFrame(() => {
      requestAnimationFrame(scrollChatToBottom);
    });
  }

  async function submitDiscussionMessage(
    body: string,
    parentCommentId?: string | null,
  ) {
    const message = body.trim();

    if (!message) {
      setDiscussionError("Message is required.");
      return false;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setDiscussionError("You need to be signed in before sending messages.");
      return false;
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
        body: message,
        parentCommentId: parentCommentId ?? null,
      }),
    });

    const result = (await response.json().catch(() => null)) as {
      comment?: DiscussionComment;
      error?: string;
    } | null;

    if (!response.ok || !result?.comment) {
      setDiscussionError(result?.error || "Unable to send message.");
      setIsSubmittingDiscussion(false);
      return false;
    }

    setDiscussionComments((current) =>
      current.some((comment) => comment.id === result.comment?.id)
        ? current
        : [...current, result.comment as DiscussionComment],
    );
    scrollChatToBottom();
    setIsSubmittingDiscussion(false);
    return true;
  }

  async function submitChatDraftWithPhotos(body: string, parentCommentId?: string | null) {
    if (!body.trim() && !pendingChatPhotos.length && !pendingChatFiles.length && !pendingChatStickers.length && !pendingChatGif) {
      setDiscussionError("Message is required.");
      return false;
    }
    setIsSubmittingDiscussion(true);
    try {
      const [photoUrls, fileUrls] = await Promise.all([
        uploadPendingChatPhotos(),
        uploadPendingChatFiles(),
      ]);
      const stickerTokens = pendingChatStickers.map(
        (item) => `[[journi:sticker:${item.url}|${item.title.replaceAll("]", "").replaceAll("|", "")}]]`,
      );
      const gifToken = pendingChatGif
        ? `[[journi:gif:${pendingChatGif.url}|${pendingChatGif.title.replaceAll("]", "").replaceAll("|", "")}]]`
        : "";
      const sent = await submitDiscussionMessage(
        [...stickerTokens, gifToken, body.trim(), ...photoUrls, ...fileUrls].filter(Boolean).join("\n"),
        parentCommentId,
      );
      if (sent) {
        pendingChatPhotos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
        setPendingChatPhotos([]);
        setPendingChatFiles([]);
        setPendingChatStickers([]);
        setPendingChatGif(null);
      }
      return sent;
    } catch (error) {
      setDiscussionError(error instanceof Error ? error.message : "Unable to send the photos.");
      setIsSubmittingDiscussion(false);
      return false;
    }
  }

  async function handlePostDiscussion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await submitChatDraftWithPhotos(discussionBody)) setDiscussionBody("");
  }

  async function handleReply(
    event: React.FormEvent<HTMLFormElement>,
    commentId: string,
  ) {
    event.preventDefault();
    const sent = await submitChatDraftWithPhotos(
      discussionReplyBody[commentId] ?? "",
      commentId,
    );
    if (!sent) return;
    setDiscussionReplyBody((current) => ({ ...current, [commentId]: "" }));
    setReplyingToId(null);
  }

  async function handleDeleteDiscussion(commentId: string) {
    if (!tripId) {
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

    const response = await fetch(
      `/api/trips/${tripId}/discussion/${commentId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      },
    );

    const result = (await response.json().catch(() => null)) as {
      error?: string;
      deletedAt?: string;
    } | null;

    if (!response.ok) {
      setDiscussionError(result?.error || "Unable to delete message.");
      setDeletingCommentId(null);
      return;
    }

    setDiscussionComments((current) =>
      current.map((comment) =>
        comment.id === commentId
          ? {
              ...comment,
              body: "",
              deletedAt: result?.deletedAt ?? new Date().toISOString(),
              canDelete: false,
            }
          : comment,
      ),
    );
    setDeletingCommentId(null);
    setMessageOptionsId(null);
    setDeleteConfirmCommentId(null);
  }

  async function handleEditDiscussion(comment: DiscussionComment) {
    if (!tripId) {
      return;
    }

    const body = window.prompt("Edit message", comment.body)?.trim();
    if (!body || body === comment.body) {
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setDiscussionError("You need to be signed in before editing messages.");
      return;
    }

    setDiscussionError(null);
    setMessageOptionsId(null);

    const response = await fetch(`/api/trips/${tripId}/discussion/${comment.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ body }),
    });

    const result = (await response.json().catch(() => null)) as {
      comment?: { id: string; body: string; updatedAt: string };
      error?: string;
    } | null;

    if (!response.ok || !result?.comment) {
      setDiscussionError(result?.error || "Unable to edit message.");
      return;
    }

    setDiscussionComments((current) =>
      current.map((item) =>
        item.id === comment.id
          ? { ...item, body: result.comment!.body, updatedAt: result.comment!.updatedAt }
          : item,
      ),
    );
  }

  async function handleVote(
    category: CategoryKey,
    entityId: string,
    direction: "up" | "down",
  ) {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setVotingError("You need to be signed in before voting.");
      return;
    }

    const voteKey = `${category}-${entityId}-${direction}`;
    setSubmittingVoteKey(voteKey);
    setVotingError(null);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch(`/api/trips/${tripId}/voting`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ category, entityId, direction }),
        signal: controller.signal,
      });

      const result = (await response.json().catch(() => null)) as {
        categories?: VotingState;
        error?: string;
      } | null;

      if (!response.ok || !result?.categories) {
        setVotingError(result?.error || "Unable to save your vote.");
        return;
      }

      setVoting(result.categories);
      const savedItemVotes = result.categories[category]?.itemVotes[entityId];
      const voteWasSaved = direction === "up"
        ? (savedItemVotes?.upVoterIds ?? savedItemVotes?.voterIds ?? []).includes(session.user.id)
        : (savedItemVotes?.downVoterIds ?? []).includes(session.user.id);
      setVoteFeedback({ id: Date.now(), direction, removed: !voteWasSaved });
    } catch (error) {
      setVotingError(
        error instanceof DOMException && error.name === "AbortError"
          ? "Saving the vote took too long. Please try again."
          : "Unable to save your vote. Please check your connection and try again.",
      );
    } finally {
      window.clearTimeout(timeout);
      setSubmittingVoteKey(null);
    }
  }

  useEffect(() => {
    if (!voteFeedback) return;
    const timeout = window.setTimeout(() => setVoteFeedback(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [voteFeedback]);

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
    const result = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;

    if (!response.ok) {
      setTripError(result?.error || "Unable to delete this draft trip.");
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

    setTrip((current) =>
      current ? { ...current, ...result.trip } : (result.trip ?? null),
    );
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
      setPublishGateMessage(
        "This trip is already published. Published trips cannot be returned to draft or deleted.",
      );
    }
  }

  async function handleUpdateVisibility(nextVisibility: "private" | "public") {
    if (
      !trip ||
      accessRole !== "organiser" ||
      trip.visibility === nextVisibility
    ) {
      return;
    }

    setIsUpdatingVisibility(true);
    setTripError(null);
    setPublishGateMessage(null);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setTripError("You need to be signed in before updating this trip.");
      setIsUpdatingVisibility(false);
      return;
    }

    const response = await fetch(`/api/trips/${trip.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        action: "update_visibility",
        visibility: nextVisibility,
      }),
    });
    const result = (await response.json().catch(() => null)) as {
      error?: string;
      trip?: TripDetail;
    } | null;

    if (!response.ok || !result?.trip) {
      setTripError(result?.error || "Unable to update trip visibility.");
      setIsUpdatingVisibility(false);
      return;
    }

    setTrip((current) =>
      current ? { ...current, ...result.trip } : (result.trip ?? null),
    );
    setIsUpdatingVisibility(false);
  }

  async function handleRequestParticipation() {
    if (!trip || accessRole !== "public") {
      return;
    }

    setIsRequestingParticipation(true);
    setTripError(null);
    setParticipationMessage(null);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setTripError("You need to be signed in before joining this trip.");
      setIsRequestingParticipation(false);
      return;
    }

    const response = await fetch(`/api/trips/${trip.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        action: "request_participation",
        requestMessage,
      }),
    });
    const result = (await response.json().catch(() => null)) as {
      error?: string;
      message?: string;
      participant?: TripParticipant;
    } | null;

    if (!response.ok || !result?.participant) {
      setTripError(result?.error || "Unable to join this trip.");
      setIsRequestingParticipation(false);
      return;
    }

    setParticipants((current) =>
      current.some((participant) => participant.id === result.participant?.id)
        ? current
        : [...current, result.participant as TripParticipant],
    );
    setParticipationMessage(
      result.message ||
        "You have been added as a potential participant. The organiser can review it before the trip is confirmed.",
    );
    setRequestMessage("");
    setIsRequestingParticipation(false);
  }

  async function handleReviewParticipant(
    participantId: string,
    action: "approve_participant" | "decline_participant",
  ) {
    if (!trip || accessRole !== "organiser") {
      return;
    }

    setReviewingParticipantId(participantId);
    setParticipantsError(null);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setParticipantsError(
        "You need to be signed in before reviewing participants.",
      );
      setReviewingParticipantId(null);
      return;
    }

    const response = await fetch(`/api/trips/${trip.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        action,
        participantId,
      }),
    });
    const result = (await response.json().catch(() => null)) as {
      error?: string;
      participant?: TripParticipant;
    } | null;

    if (!response.ok || !result?.participant) {
      setParticipantsError(
        result?.error || "Unable to review this participant.",
      );
      setReviewingParticipantId(null);
      return;
    }

    setParticipants((current) =>
      current.map((participant) =>
        participant.id === participantId
          ? (result.participant as TripParticipant)
          : participant,
      ),
    );
    setReviewingParticipantId(null);
  }

  async function handleUpdateAttendance(
    attendanceStatus: "going" | "maybe" | "not_going",
  ) {
    if (!trip || accessRole !== "participant") {
      return;
    }

    setIsUpdatingAttendance(true);
    setTripError(null);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setTripError("You need to be signed in before updating attendance.");
      setIsUpdatingAttendance(false);
      return;
    }

    const response = await fetch(`/api/trips/${trip.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        action: "update_attendance",
        attendanceStatus,
      }),
    });
    const result = (await response.json().catch(() => null)) as {
      error?: string;
      participant?: TripParticipant;
      warning?: string;
    } | null;

    if (!response.ok || !result?.participant) {
      setTripError(result?.error || "Unable to update attendance.");
      setIsUpdatingAttendance(false);
      return;
    }

    setParticipants((current) =>
      current.map((participant) =>
        participant.id === result.participant?.id
          ? (result.participant as TripParticipant)
          : participant,
      ),
    );
    setParticipationMessage(result.warning ?? null);
    setIsUpdatingAttendance(false);
  }

  async function handleInviteParticipant(
    event: React.FormEvent<HTMLFormElement>,
  ) {
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
      setParticipantsError(
        "You need to be signed in before inviting travellers.",
      );
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
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token ?? ""}`,
      },
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

  const testingConsolePanel = showTestingAccessLog ? (
    <aside
      className={`${styles.testingAccessLogPanel} ${styles.testingAccessLogPanelDocked}`}
      aria-label="Testing console"
    >
      <div className={styles.testingAccessLogHeader}>
        <div>
          <span>Testing only</span>
          <h2>Activity console</h2>
          <p>
            Records trip actions, then shows which notifications were created
            and who they were sent to.
          </p>
        </div>
        <button
          type="button"
          className={styles.iconButton}
          onClick={() => setTestingAccessLogOpen(false)}
          aria-label="Close activity console"
        >
          ×
        </button>
      </div>

      <div className={styles.testingConsoleTabs}>
        <button
          type="button"
          className={
            testingConsoleTab === "activity"
              ? styles.testingConsoleTabActive
              : styles.testingConsoleTab
          }
          onClick={() => setTestingConsoleTab("activity")}
        >
          Activity
        </button>
        <button
          type="button"
          className={
            testingConsoleTab === "access"
              ? styles.testingConsoleTabActive
              : styles.testingConsoleTab
          }
          onClick={() => setTestingConsoleTab("access")}
        >
          Access
        </button>
      </div>

      {testingConsoleTab === "activity" ? (
        <section className={styles.testingAccessLogSection}>
          <h3>Actions and notifications</h3>
          <div className={styles.testingConsoleSummaryGrid}>
            <div>
              <strong>{testingActivityLogs.length}</strong>
              <span>Activities recorded</span>
            </div>
            <div>
              <strong>{testingNotificationLogs.length}</strong>
              <span>Notifications created</span>
            </div>
          </div>
          {testingActivityLoading ? (
            <p className={styles.testingConsoleNotice}>
              Loading activity for this user.
            </p>
          ) : null}
          {testingActivityError ? (
            <p className={styles.testingConsoleError}>{testingActivityError}</p>
          ) : null}
          <div className={styles.testingActivityTimeline}>
            {testingActivityLogs.map((log) => {
              const notification = log.metadata?.notification;

              return (
                <article key={log.id}>
                  <div className={styles.testingActivityTopline}>
                    <span>{log.viewerContext}</span>
                    <time>
                      {log.occurredAt
                        ? new Intl.DateTimeFormat("en-GB", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          }).format(new Date(log.occurredAt))
                        : "No time"}
                    </time>
                  </div>
                  <strong>{log.summary}</strong>
                  <p>{log.action}</p>
                  {notification ? (
                    <dl>
                      <div>
                        <dt>To</dt>
                        <dd>{notification.recipientEmail || "Not set"}</dd>
                      </div>
                      <div>
                        <dt>Trigger</dt>
                        <dd>{notification.triggerKey || "Not set"}</dd>
                      </div>
                      <div>
                        <dt>Channel</dt>
                        <dd>{notification.channel || "Not set"}</dd>
                      </div>
                      <div>
                        <dt>Status</dt>
                        <dd>{notification.status || "Not set"}</dd>
                      </div>
                      <div>
                        <dt>Error</dt>
                        <dd>{notification.error || "None"}</dd>
                      </div>
                    </dl>
                  ) : (
                    <p className={styles.testingConsoleNotice}>
                      No notification was created by this action.
                    </p>
                  )}
                </article>
              );
            })}
            {testingActivityLogs.length === 0 && !testingActivityLoading ? (
              <p className={styles.testingConsoleNotice}>
                No action or notification activity has been recorded for this
                viewer on this trip yet.
              </p>
            ) : null}
          </div>
        </section>
      ) : (
        <>
          <section className={styles.testingAccessLogSection}>
            <h3>Viewer state</h3>
            <div className={styles.testingAccessLogRows}>
              {testingAccessRows.map((row) => (
                <div key={row.label} className={styles.testingAccessLogRow}>
                  <span>{row.label}</span>
                  <strong>{row.value}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.testingAccessLogSection}>
            <h3>Access added</h3>
            <div className={styles.testingAccessLogList}>
              {testingAccessAdded.map((item) => (
                <p key={item} className={styles.testingAccessLogAllowed}>
                  {item}
                </p>
              ))}
            </div>
          </section>

          <section className={styles.testingAccessLogSection}>
            <h3>Access removed</h3>
            <div className={styles.testingAccessLogList}>
              {testingAccessRemoved.map((item) => (
                <p key={item} className={styles.testingAccessLogRemoved}>
                  {item}
                </p>
              ))}
            </div>
          </section>
        </>
      )}
    </aside>
  ) : null;

  const activeChatDraft = replyingToId
    ? (discussionReplyBody[replyingToId] ?? "")
    : discussionBody;
  const composerReferenceTokens = activeChatDraft.match(/\[\[journi:(?!sticker:|gif:)[^:\]]+:[^|\]]+\|[^\]]+\]\]/g) ?? [];
  const visibleChatDraft = activeChatDraft
    .replace(/\[\[journi:(?!sticker:|gif:)[^:\]]+:[^|\]]+\|[^\]]+\]\]/g, "")
    .replace(/^\s+/, "");
  const selectedComposerReferences = composerReferenceTokens.map((token) => {
    const linkedReference = chatReferenceGroups
      .flatMap((group) => group.items.map((item) => ({ ...item, groupLabel: group.label })))
      .find((item) => item.token === token);
    return { token, linkedReference };
  });
  const composerLinkUrls = getAllUrls(visibleChatDraft);
  const composerLinkUrl = composerLinkUrls[0] ?? "";

  return (
    <>
      <AppShell
        kicker=""
        title=""
        intro=""
        dockPanelOpen={showTestingAccessLog && testingAccessLogOpen}
        dockPanel={testingConsolePanel}
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
                  <p className={styles.publishGateTitle}>
                    Publish limit reached
                  </p>
                  <p className={styles.publishGateCopy}>{publishGateMessage}</p>
                  <div className={styles.headerActions}>
                    <Link
                      href="/signup/pro-organiser"
                      className={styles.primaryActionLink}
                    >
                      Upgrade to Pro
                    </Link>
                    <Link
                      href="/signup/trip-pass"
                      className={styles.secondaryActionLink}
                    >
                      Use Trip Pass £39
                    </Link>
                  </div>
                </div>
              </section>
            ) : null}

            {!tripError && trip ? (
              <>
                <div
                  className={
                    accessRole === "organiser" || canUseTripMessaging || canViewTripExpenses
                      ? styles.tripViewWithRail
                      : styles.tripViewSolo
                  }
                >
                  {accessRole === "organiser" || canUseTripMessaging || canViewTripExpenses ? (
                    <nav
                      className={styles.tripOwnerRail}
                      aria-label="Trip controls"
                    >
                      {accessRole === "organiser" ? (
                        <>
                          <button
                            type="button"
                            className={styles.tripOwnerRailButton}
                            onClick={() => setOwnerDrawer("dashboard")}
                          >
                            <FiBarChart2 />
                            <span>Dashboard</span>
                          </button>
                          <button
                            type="button"
                            className={styles.tripOwnerRailButton}
                            onClick={() => setOwnerDrawer("settings")}
                          >
                            <FiSettings />
                            <span>Settings</span>
                          </button>
                          <button
                            type="button"
                            className={styles.tripOwnerRailButton}
                            onClick={() => setOwnerDrawer("participants")}
                          >
                            <FiUsers />
                            <span>Participants</span>
                          </button>
                        </>
                      ) : null}
                      {canUseTripMessaging ? (
                        <button
                          type="button"
                          className={styles.tripOwnerRailButton}
                          onClick={() => void openMessagesDrawer()}
                        >
                          <FiMessageSquare />
                          <span>Messages</span>
                        </button>
                      ) : null}
                      {canViewTripExpenses ? (
                        <button
                          type="button"
                          onClick={() => { setExpensesReady(false); setOwnerDrawer("expenses"); }}
                          className={styles.tripOwnerRailButton}
                          aria-label="Trip expenses"
                          aria-haspopup="dialog"
                          aria-expanded={ownerDrawer === "expenses"}
                        >
                          <FiCreditCard />
                          <span>Expenses</span>
                        </button>
                      ) : null}
                    </nav>
                  ) : null}

                  <section className={styles.tripBasicStartView}>
                    {canViewTripExpenses ? <TripDecisions tripId={trip.id} onTripChange={updated => setTrip(current => current ? { ...current, ...updated } : current)} /> : null}
                    <div
                      className={`${styles.tripBuilderCard} ${styles.tripBuilderCardNoFade}`}
                    >
                      <div className={styles.tripImagePreviewWrap}>
                        {trip.cover_image_url ? (
                          <img
                            src={trip.cover_image_url}
                            alt={trip.title || trip.destination || "Trip"}
                            className={styles.imagePreview}
                          />
                        ) : (
                          <div className={styles.tripImagePlaceholder} />
                        )}
                        <div className={styles.tripImageTextOverlay}>
                          <h1 className={styles.tripImageTitle}>
                            {trip.destination || "Your trip"}
                          </h1>
                        </div>
                      </div>

                      <div className={styles.tripBuilderBody}>
                        <div className={styles.dateOptionList}>
                          <div className={styles.dateRangeInline}>
                            <div className={styles.dateRangeSummary}>
                              <span>{formatTripDatePlanning(trip)}</span>
                            </div>
                          </div>
                        </div>

                        {trip.description ? (
                          <section className={styles.tripStoryCard}>
                            <span className={styles.tripStoryText}>
                              {trip.description}
                            </span>
                          </section>
                        ) : null}

                        <div className={styles.grid2}>
                          <div className={styles.infoCard}>
                            <span className={styles.tripFactLabel}>
                              Trip type
                            </span>
                            <strong>
                              {trip.trip_type_label || "Type to be confirmed"}
                            </strong>
                            <p className={styles.muted}>
                              {getAudienceLabel(trip.audience_filter)}
                            </p>
                          </div>
                          <div className={styles.infoCard}>
                            <span className={styles.tripFactLabel}>
                              Visibility
                            </span>
                            <strong>
                              {normaliseTripVisibility(trip.visibility)}
                            </strong>
                            <p className={styles.muted}>
                              {getTripStatusLabel(trip.status)}
                            </p>
                          </div>
                        </div>

                        {accessRole === "public" ? (
                          <div className={styles.publishGateCard}>
                            <p className={styles.publishGateTitle}>
                              {currentParticipant
                                ? "You are connected to this public trip"
                                : "Interested in joining this public trip?"}
                            </p>
                            <p className={styles.publishGateCopy}>
                              {participationMessage ||
                                (currentParticipant
                                  ? `Your membership status is ${getParticipantMembershipLabel(currentParticipant)}. ${getAttendanceStatusLabel(currentParticipant.attendance_status)}.`
                                  : "Add yourself as a potential participant so the organiser can see your interest before the trip is confirmed.")}
                            </p>
                            {canRequestParticipation ? (
                              <div className={styles.optionStack}>
                                <label className={styles.field}>
                                  <span>Request message</span>
                                  <textarea
                                    value={requestMessage}
                                    onChange={(event) =>
                                      setRequestMessage(event.target.value)
                                    }
                                    placeholder="Tell the organiser a little about yourself. Optional."
                                    rows={3}
                                  />
                                </label>
                                <button
                                  type="button"
                                  className={styles.primaryAction}
                                  onClick={() =>
                                    void handleRequestParticipation()
                                  }
                                  disabled={isRequestingParticipation}
                                >
                                  {isRequestingParticipation
                                    ? "Adding you..."
                                    : "I’m interested"}
                                </button>
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        {canUpdateAttendance && currentParticipant ? (
                          <div className={styles.publishGateCard}>
                            <p className={styles.publishGateTitle}>
                              Your attendance
                            </p>
                            <p className={styles.publishGateCopy}>
                              Membership and attendance are separate. Tell the
                              organiser whether you are going.
                            </p>
                            <div className={styles.tripFilter}>
                              {[
                                ["going", "Going"],
                                ["maybe", "Maybe"],
                                ["not_going", "Not going"],
                              ].map(([value, label]) => (
                                <button
                                  key={value}
                                  type="button"
                                  className={
                                    currentParticipant.attendance_status ===
                                    value
                                      ? styles.tripFilterButtonActive
                                      : styles.tripFilterButton
                                  }
                                  onClick={() =>
                                    void handleUpdateAttendance(
                                      value as "going" | "maybe" | "not_going",
                                    )
                                  }
                                  disabled={isUpdatingAttendance}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        <div className={styles.selectedOptionsSection}>
                          <div className={styles.rowTop}>
                            <div>
                              <p className={styles.eyebrow}>Hotels</p>
                              <h3 className={styles.sectionHeading}>
                                Selected stays
                              </h3>
                              <p className={styles.muted}>
                                Accommodation options for this trip.
                              </p>
                            </div>
                            <button
                              type="button"
                              className={styles.inlineEditLink}
                              onClick={() => setPlanningDrawer("hotels")}
                            >
                              View hotels
                            </button>
                          </div>
                          {hotels.length > 0 ? (
                            <ScrollableOptionCards
                              className={styles.selectedOptionsCarousel}
                              aria-label="Selected stays carousel"
                            >
                              {orderPlanningItemsByVotes(hotels, "hotels").map((hotel) => {
                                const googleRating = getGoogleRatingFromNotes(
                                  hotel.notes,
                                );
                                const hotelIds = hotels.map(
                                  (option) => option.id,
                                );

                                return (
                                  <article
                                    key={hotel.id}
                                    className={styles.hotelResultCard}
                                  >
                                    {hotel.source_photo_url ? (
                                      <img
                                        src={hotel.source_photo_url}
                                        alt={hotel.name}
                                        className={styles.hotelResultImage}
                                      />
                                    ) : (
                                      <div
                                        className={
                                          styles.hotelResultImageFallback
                                        }
                                      />
                                    )}
                                    {renderPlanningVoteBadge(
                                      "hotels",
                                      hotel.id,
                                      hotelIds,
                                    )}
                                    <strong>{hotel.name}</strong>
                                    <small>
                                      {hotel.location ||
                                        "Location ready to confirm"}
                                    </small>
                                    {formatHotelRate(hotel) ? (
                                      <span
                                        className={styles.hotelRateBadgeMuted}
                                      >
                                        {formatHotelRate(hotel)}
                                      </span>
                                    ) : null}
                                    {googleRating ? (
                                      <span className={styles.hotelRatingBadge}>
                                        <FiStar />
                                        <strong>{googleRating}</strong>
                                        <small>Google</small>
                                      </span>
                                    ) : null}
                                    <div className={styles.selectedStayActions}>
                                      <button
                                        type="button"
                                        onClick={() => openSavedPlaceDetails("Hotel", hotel.name, hotel.location, hotel.google_place_id, hotel.source_photo_url)}
                                        className={styles.hotelActionLink}
                                      >
                                        View more
                                      </button>
                                    </div>
                                  </article>
                                );
                              })}
                            </ScrollableOptionCards>
                          ) : (
                            <p className={styles.emptyStateSmall}>
                              No hotels have been added yet.
                            </p>
                          )}
                        </div>

                        <div className={styles.selectedOptionsSection}>
                          <div className={styles.rowTop}>
                            <div>
                              <p className={styles.eyebrow}>Activities</p>
                              <h3 className={styles.sectionHeading}>
                                Selected activities
                              </h3>
                              <p className={styles.muted}>
                                The experiences already added into this trip.
                              </p>
                            </div>
                            <button
                              type="button"
                              className={styles.inlineEditLink}
                              onClick={() => setPlanningDrawer("activities")}
                            >
                              View activities
                            </button>
                          </div>
                          {activities.length > 0 ? (
                            <ScrollableOptionCards
                              className={styles.selectedOptionsCarousel}
                              aria-label="Selected activities carousel"
                            >
                              {orderPlanningItemsByVotes(activities, "activities").map((activity) => {
                                const googleRating = getGoogleRatingFromNotes(
                                  activity.notes,
                                );
                                const activityIds = activities.map(
                                  (option) => option.id,
                                );

                                return (
                                  <article
                                    key={activity.id}
                                    className={styles.hotelResultCard}
                                  >
                                    {activity.source_photo_url ? (
                                      <img
                                        src={activity.source_photo_url}
                                        alt={activity.title}
                                        className={styles.hotelResultImage}
                                      />
                                    ) : (
                                      <div
                                        className={
                                          styles.hotelResultImageFallback
                                        }
                                      />
                                    )}
                                    {renderPlanningVoteBadge(
                                      "activities",
                                      activity.id,
                                      activityIds,
                                    )}
                                    <strong>{activity.title}</strong>
                                    <small>
                                      {activity.location || "Activity location"}
                                    </small>
                                    {googleRating ? (
                                      <span className={styles.hotelRatingBadge}>
                                        <FiStar />
                                        <strong>{googleRating}</strong>
                                        <small>Google</small>
                                      </span>
                                    ) : null}
                                    <div className={styles.selectedStayActions}>
                                      <button
                                        type="button"
                                        onClick={() => openSavedPlaceDetails("Activity", activity.title, activity.location, activity.google_place_id, activity.source_photo_url)}
                                        className={styles.hotelActionLink}
                                      >
                                        View more
                                      </button>
                                    </div>
                                  </article>
                                );
                              })}
                            </ScrollableOptionCards>
                          ) : (
                            <p className={styles.emptyStateSmall}>
                              No activities have been added yet.
                            </p>
                          )}
                        </div>

                        <div className={styles.selectedOptionsSection}>
                          <div className={styles.rowTop}>
                            <div>
                              <p className={styles.eyebrow}>Transport</p>
                              <h3 className={styles.sectionHeading}>
                                Selected transport
                              </h3>
                              <p className={styles.muted}>
                                How this trip is going to move from place to
                                place.
                              </p>
                            </div>
                            <button
                              type="button"
                              className={styles.inlineEditLink}
                              onClick={() => setPlanningDrawer("transport")}
                            >
                              View transport
                            </button>
                          </div>
                          {transport.length > 0 ? (
                            <ScrollableOptionCards
                              className={styles.selectedOptionsCarousel}
                              aria-label="Selected transport carousel"
                            >
                              {orderPlanningItemsByVotes(transport, "transport").map((option) => {
                                const googleRating = getGoogleRatingFromNotes(
                                  option.notes,
                                );
                                const transportIds = transport.map(
                                  (transportOption) => transportOption.id,
                                );
                                const route =
                                  [
                                    option.departure_location,
                                    option.arrival_location,
                                  ]
                                    .filter(Boolean)
                                    .join(" to ") ||
                                  "Transport route ready to confirm";

                                return (
                                  <article
                                    key={option.id}
                                    className={styles.hotelResultCard}
                                  >
                                    {option.source_photo_url ? (
                                      <img
                                        src={option.source_photo_url}
                                        alt={option.mode || "Transport"}
                                        className={styles.hotelResultImage}
                                      />
                                    ) : (
                                      <div
                                        className={
                                          styles.hotelResultImageFallback
                                        }
                                      />
                                    )}
                                    {renderPlanningVoteBadge(
                                      "transport",
                                      option.id,
                                      transportIds,
                                    )}
                                    <strong>
                                      {option.mode || "Transport"}
                                    </strong>
                                    <small>{route}</small>
                                    {googleRating ? (
                                      <span className={styles.hotelRatingBadge}>
                                        <FiStar />
                                        <strong>{googleRating}</strong>
                                        <small>Google</small>
                                      </span>
                                    ) : null}
                                    <div className={styles.selectedStayActions}>
                                      <button
                                        type="button"
                                        onClick={() => openSavedPlaceDetails("Transport", option.mode || "Transport", option.arrival_location || option.departure_location, option.google_place_id, option.source_photo_url)}
                                        className={styles.hotelActionLink}
                                      >
                                        View more
                                      </button>
                                    </div>
                                  </article>
                                );
                              })}
                            </ScrollableOptionCards>
                          ) : (
                            <p className={styles.emptyStateSmall}>
                              No transport has been added yet.
                            </p>
                          )}
                        </div>

                        <div className={styles.selectedOptionsSection}>
                          <div className={styles.rowTop}>
                            <div>
                              <p className={styles.eyebrow}>Dining</p>
                              <h3 className={styles.sectionHeading}>
                                Selected dining
                              </h3>
                              <p className={styles.muted}>
                                Restaurants and food stops saved into this trip.
                              </p>
                            </div>
                            <button
                              type="button"
                              className={styles.inlineEditLink}
                              onClick={() => setPlanningDrawer("dining")}
                            >
                              View dining
                            </button>
                          </div>
                          {dining.length > 0 ? (
                            <ScrollableOptionCards
                              className={styles.selectedOptionsCarousel}
                              aria-label="Selected dining carousel"
                            >
                              {orderPlanningItemsByVotes(dining, "dining").map((option) => {
                                const googleRating = getGoogleRatingFromNotes(
                                  option.notes,
                                );
                                const diningIds = dining.map(
                                  (diningOption) => diningOption.id,
                                );

                                return (
                                  <article
                                    key={option.id}
                                    className={styles.hotelResultCard}
                                  >
                                    {option.source_photo_url ? (
                                      <img
                                        src={option.source_photo_url}
                                        alt={option.name}
                                        className={styles.hotelResultImage}
                                      />
                                    ) : (
                                      <div
                                        className={
                                          styles.hotelResultImageFallback
                                        }
                                      />
                                    )}
                                    {renderPlanningVoteBadge(
                                      "dining",
                                      option.id,
                                      diningIds,
                                    )}
                                    <strong>{option.name}</strong>
                                    <small>
                                      {option.location ||
                                        "Restaurant location ready to confirm"}
                                    </small>
                                    {googleRating ? (
                                      <span className={styles.hotelRatingBadge}>
                                        <FiStar />
                                        <strong>{googleRating}</strong>
                                        <small>Google</small>
                                      </span>
                                    ) : null}
                                    <div className={styles.selectedStayActions}>
                                      <button
                                        type="button"
                                        onClick={() => openSavedPlaceDetails("Dining", option.name, option.location, option.google_place_id, option.source_photo_url)}
                                        className={styles.hotelActionLink}
                                      >
                                        View more
                                      </button>
                                    </div>
                                  </article>
                                );
                              })}
                            </ScrollableOptionCards>
                          ) : (
                            <p className={styles.emptyStateSmall}>
                              No dining has been added yet.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </section>
                </div>

                <div
                  id="trip-workspace"
                  className={styles.tripWorkspaceDetailLayoutHidden}
                >
                  <aside className={styles.tripWorkspaceSideMenu}>
                    <section className={styles.tripWorkspaceStickyBar}>
                      <nav
                        aria-label="Trip sections"
                        className={styles.tripHeaderNav}
                      >
                        {visibleWorkspaceNav.map((item, index) => (
                          <Link
                            key={item.id}
                            href={
                              item.id === "overview"
                                ? "#overview"
                                : sectionHref(item.id)
                            }
                            className={styles.tripHeaderNavLink}
                          >
                            <span className={styles.tripHeaderNavIndex}>
                              {index + 1}.
                            </span>
                            <span>{item.label}</span>
                          </Link>
                        ))}
                      </nav>
                    </section>
                  </aside>

                  <div className={styles.tripWorkspaceShellCard}>
                    <div className={styles.tripWorkspaceContent}>
                      <section
                        id="overview"
                        className={styles.tripOverviewPanel}
                      >
                        <div
                          className={`${styles.tripBuilderCard} ${styles.tripBuilderCardNoFade}`}
                        >
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
                                  aria-label={
                                    trip.status === "active"
                                      ? "Trip published"
                                      : "Publish trip"
                                  }
                                  className={styles.tripPublishToggle}
                                  onClick={() => void handleTogglePublish()}
                                  disabled={
                                    isPublishing || trip.status === "active"
                                  }
                                >
                                  <span
                                    className={styles.tripPublishToggleLabel}
                                  >
                                    {isPublishing
                                      ? "Saving..."
                                      : trip.status === "active"
                                        ? "Published"
                                        : "Draft"}
                                  </span>
                                  <span
                                    className={`${styles.tripPublishToggleTrack} ${
                                      trip.status === "active"
                                        ? styles.tripPublishToggleTrackActive
                                        : ""
                                    }`}
                                  >
                                    <span
                                      className={`${styles.tripPublishToggleThumb} ${
                                        trip.status === "active"
                                          ? styles.tripPublishToggleThumbActive
                                          : ""
                                      }`}
                                    />
                                  </span>
                                </button>
                              ) : (
                                <span className={styles.badge}>
                                  {accessRole === "participant"
                                    ? "Participant"
                                    : getTripStatusLabel(trip.status)}
                                </span>
                              )}
                            </div>
                            <div className={styles.tripImageTextOverlay}>
                              <h1 className={styles.tripImageTitle}>
                                {trip.destination || "Your trip"}
                              </h1>
                            </div>
                          </div>

                          <div
                            className={`${styles.tripBuilderBody} ${styles.tripOverviewBodyStrong}`}
                          >
                            <div
                              className={`${styles.tripMetaRow} ${styles.tripOverviewSupportText}`}
                            >
                              <span>
                                {trip.destination ||
                                  "Destination to be confirmed"}
                              </span>
                              <span>{formatTripDatePlanning(trip)}</span>
                            </div>
                            {trip.description ? (
                              <section className={styles.tripStoryCard}>
                                <span className={styles.tripStoryText}>
                                  {trip.description}
                                </span>
                              </section>
                            ) : null}
                            {accessRole === "public" ? (
                              <div className={styles.publishGateCard}>
                                <p className={styles.publishGateTitle}>
                                  {currentParticipant
                                    ? "You are connected to this public trip"
                                    : "Interested in joining this public trip?"}
                                </p>
                                <p className={styles.publishGateCopy}>
                                  {participationMessage ||
                                    (currentParticipant
                                      ? `Your membership status is ${getParticipantMembershipLabel(currentParticipant)}. ${getAttendanceStatusLabel(currentParticipant.attendance_status)}.`
                                      : "Add yourself as a potential participant so the organiser can see your interest before the trip is confirmed.")}
                                </p>
                                {canRequestParticipation ? (
                                  <div className={styles.optionStack}>
                                    <label className={styles.field}>
                                      <span>Request message</span>
                                      <textarea
                                        value={requestMessage}
                                        onChange={(event) =>
                                          setRequestMessage(event.target.value)
                                        }
                                        placeholder="Tell the organiser a little about yourself. Optional."
                                        rows={3}
                                      />
                                    </label>
                                    <button
                                      type="button"
                                      className={styles.primaryAction}
                                      onClick={() =>
                                        void handleRequestParticipation()
                                      }
                                      disabled={isRequestingParticipation}
                                    >
                                      {isRequestingParticipation
                                        ? "Adding you..."
                                        : "I’m interested"}
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                            {canUpdateAttendance && currentParticipant ? (
                              <div className={styles.publishGateCard}>
                                <p className={styles.publishGateTitle}>
                                  Your attendance
                                </p>
                                <p className={styles.publishGateCopy}>
                                  Membership and attendance are separate. You
                                  are an active participant; now tell the
                                  organiser whether you are going.
                                </p>
                                <div className={styles.tripFilter}>
                                  {[
                                    ["going", "Going"],
                                    ["maybe", "Maybe"],
                                    ["not_going", "Not going"],
                                  ].map(([value, label]) => (
                                    <button
                                      key={value}
                                      type="button"
                                      className={
                                        currentParticipant.attendance_status ===
                                        value
                                          ? styles.tripFilterButtonActive
                                          : styles.tripFilterButton
                                      }
                                      onClick={() =>
                                        void handleUpdateAttendance(
                                          value as
                                            "going" | "maybe" | "not_going",
                                        )
                                      }
                                      disabled={isUpdatingAttendance}
                                    >
                                      {label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                            {workspaceSummary ? (
                              <>
                                <div className={styles.tripQuestionGrid}>
                                  <div className={styles.tripQuestionCard}>
                                    <span className={styles.tripFactLabel}>
                                      Current phase
                                    </span>
                                    <strong>
                                      {workspaceSummary.phaseLabel}
                                    </strong>
                                    <p className={styles.muted}>
                                      {workspaceSummary.confidenceMessage}
                                    </p>
                                  </div>
                                  <div className={styles.tripQuestionCard}>
                                    <span className={styles.tripFactLabel}>
                                      Decision we’re making
                                    </span>
                                    <strong>
                                      {workspaceSummary.currentDecision}
                                    </strong>
                                    <p className={styles.muted}>
                                      Keep the group focused on the next call,
                                      not a long chat thread.
                                    </p>
                                  </div>
                                  <div className={styles.tripQuestionCard}>
                                    <span className={styles.tripFactLabel}>
                                      Leading option
                                    </span>
                                    <strong>
                                      {workspaceSummary.leadingOption}
                                    </strong>
                                    <p className={styles.muted}>
                                      This is the clearest front-runner Journi
                                      can see right now.
                                    </p>
                                  </div>
                                  <div className={styles.tripQuestionCard}>
                                    <span className={styles.tripFactLabel}>
                                      What happens next
                                    </span>
                                    <strong>
                                      {workspaceSummary.nextAction}
                                    </strong>
                                    <p className={styles.muted}>
                                      Journi should always surface the next best
                                      organiser action.
                                    </p>
                                  </div>
                                  <div className={styles.tripQuestionCard}>
                                    <span className={styles.tripFactLabel}>
                                      Audience and size
                                    </span>
                                    <strong>
                                      {getAudienceLabel(trip.audience_filter)}
                                    </strong>
                                    <p className={styles.muted}>
                                      {getGroupSizeLabel(trip.group_size_band)}{" "}
                                      for a{" "}
                                      {trip.trip_type_label || "group trip"}.
                                    </p>
                                  </div>
                                  <div className={styles.tripQuestionCard}>
                                    <span className={styles.tripFactLabel}>
                                      Budget guide
                                    </span>
                                    <strong>
                                      {trip.budget_mode === "overall" &&
                                      trip.budget_total
                                        ? `£${trip.budget_total} overall`
                                        : getBudgetBandLabel(trip.budget_band)}
                                    </strong>
                                    <p className={styles.muted}>
                                      {trip.budget_per_person_min
                                        ? `Approx. £${trip.budget_per_person_min}${
                                            trip.budget_per_person_max
                                              ? `-£${trip.budget_per_person_max}`
                                              : "+"
                                          } per person`
                                        : "Budget still being defined."}
                                    </p>
                                  </div>
                                </div>

                                <div className={styles.tripMetricRow}>
                                  <span className={styles.tripMetricPill}>
                                    {
                                      workspaceSummary.participantSummary
                                        .invited
                                    }{" "}
                                    invited
                                  </span>
                                  <span className={styles.tripMetricPill}>
                                    {workspaceSummary.participantSummary.viewed}{" "}
                                    viewed
                                  </span>
                                  <span className={styles.tripMetricPill}>
                                    {
                                      workspaceSummary.participantSummary
                                        .responded
                                    }{" "}
                                    responded
                                  </span>
                                  <span className={styles.tripMetricPill}>
                                    {
                                      workspaceSummary.participantSummary
                                        .confirmed
                                    }{" "}
                                    confirmed
                                  </span>
                                  <span className={styles.tripMetricPill}>
                                    {
                                      workspaceSummary.participantSummary
                                        .outstanding
                                    }{" "}
                                    outstanding
                                  </span>
                                  {workspaceSummary.deadlineLabel ? (
                                    <span className={styles.tripMetricPill}>
                                      {workspaceSummary.deadlineLabel}
                                    </span>
                                  ) : null}
                                </div>

                                <div className={styles.tripConfidencePanel}>
                                  <div className={styles.rowTop}>
                                    <span className={styles.rowTitle}>
                                      Confidence score
                                    </span>
                                    <span className={styles.rowMeta}>
                                      {workspaceSummary.confidenceScore}%
                                    </span>
                                  </div>
                                  <div className={styles.tripMiniProgress}>
                                    <span
                                      className={styles.tripMiniProgressFill}
                                      style={{
                                        width: `${workspaceSummary.confidenceScore}%`,
                                      }}
                                    />
                                  </div>
                                  <p className={styles.muted}>
                                    {workspaceSummary.latestChange}
                                  </p>
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
                            <Link
                              href={sectionHref("destinations")}
                              className={styles.tripSectionToggle}
                            >
                              View destinations →
                            </Link>
                          </div>
                          <div className={styles.tripWorkspaceCardGrid}>
                            <div
                              className={`${styles.infoCard} ${styles.infoCardCompact}`}
                            >
                              <span className={styles.tripFactLabel}>
                                Primary destination
                              </span>
                              <strong>
                                {trip.destination ||
                                  "Destination to be confirmed"}
                              </strong>
                              <p className={styles.muted}>
                                The lead destination the rest of the planning is
                                currently built around.
                              </p>
                              <div className={styles.tripMetricRow}>
                                <span className={styles.tripMetricPill}>
                                  1 stop
                                </span>
                                <span className={styles.tripMetricPill}>
                                  {transport.length} route option
                                  {transport.length === 1 ? "" : "s"}
                                </span>
                              </div>
                            </div>
                            <div
                              className={`${styles.infoCard} ${styles.infoCardCompact}`}
                            >
                              <span className={styles.tripFactLabel}>
                                Travel flow
                              </span>
                              <strong>
                                {transport.length
                                  ? "Transport has been planned"
                                  : "Transport still to be chosen"}
                              </strong>
                              <p className={styles.muted}>
                                Arrival, departure, and internal movement can
                                all be tracked from this section.
                              </p>
                              <div className={styles.tripMiniProgress}>
                                <span
                                  className={styles.tripMiniProgressFill}
                                  style={{
                                    width: `${transport.length ? 100 : 18}%`,
                                  }}
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
                            <Link
                              href={sectionHref("dates")}
                              className={styles.tripSectionToggle}
                            >
                              View dates →
                            </Link>
                          </div>
                          <div className={styles.tripWorkspaceCardGrid}>
                            <div
                              className={`${styles.infoCard} ${styles.infoCardCompact}`}
                            >
                              <span className={styles.tripFactLabel}>
                                Travel dates
                              </span>
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
                            <div
                              className={`${styles.infoCard} ${styles.infoCardCompact}`}
                            >
                              <span className={styles.tripFactLabel}>
                                Planning state
                              </span>
                              <strong>
                                {completedSections} planning areas started
                              </strong>
                              <p className={styles.muted}>
                                This gives the group a quick read on how
                                complete the trip shape is so far.
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

                        <section
                          id="budget"
                          className={styles.tripWorkspaceSectionCard}
                        >
                          <div className={styles.tripWorkspaceSectionTop}>
                            <div>
                              <p className={styles.eyebrow}>Budget</p>
                              <h2>Budget</h2>
                            </div>
                            <Link
                              href={sectionHref("budget")}
                              className={styles.tripSectionToggle}
                            >
                              View budget →
                            </Link>
                          </div>
                          <div className={styles.tripWorkspaceCardGrid}>
                            <div
                              className={`${styles.infoCard} ${styles.infoCardCompact}`}
                            >
                              <span className={styles.tripFactLabel}>
                                Budget guide
                              </span>
                              <strong>
                                {trip.budget_mode === "overall" &&
                                trip.budget_total
                                  ? `£${trip.budget_total} overall`
                                  : getBudgetBandLabel(trip.budget_band)}
                              </strong>
                              <p className={styles.muted}>
                                {trip.budget_per_person_min
                                  ? `Approx. £${trip.budget_per_person_min}${
                                      trip.budget_per_person_max
                                        ? `-£${trip.budget_per_person_max}`
                                        : "+"
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
                          {votingError ? (
                            <p className={styles.formError}>{votingError}</p>
                          ) : null}
                        </section>

                        <section
                          id="accommodation"
                          className={styles.tripWorkspaceSectionCard}
                        >
                          <div className={styles.tripWorkspaceSectionTop}>
                            <div>
                              <p className={styles.eyebrow}>Accommodation</p>
                              <h2>Accommodation</h2>
                            </div>
                            <Link
                              href={sectionHref("accommodation")}
                              className={styles.tripSectionToggle}
                            >
                              View accommodation →
                            </Link>
                          </div>
                          <div className={styles.tripWorkspaceCardGrid}>
                            <div
                              className={`${styles.infoCard} ${styles.infoCardCompact}`}
                            >
                              <span className={styles.tripFactLabel}>
                                Selected stays
                              </span>
                              <strong>{hotels.length}</strong>
                              <p className={styles.muted}>
                                {hotels[0]?.name || "No hotel added yet."}
                                {hotels[0] && formatHotelRate(hotels[0])
                                  ? ` - ${formatHotelRate(hotels[0])}`
                                  : ""}{" "}
                                This section shows where the group is currently
                                leaning on accommodation.
                              </p>
                              <div className={styles.tripMetricRow}>
                                <span className={styles.tripMetricPill}>
                                  {hotelVoteSummary.votes} votes
                                </span>
                                <span className={styles.tripMetricPill}>
                                  {hotelVoteSummary.participants}/
                                  {hotelVoteSummary.eligible || 0} voters
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

                        <section
                          id="activities"
                          className={styles.tripWorkspaceSectionCard}
                        >
                          <div className={styles.tripWorkspaceSectionTop}>
                            <div>
                              <p className={styles.eyebrow}>Activities</p>
                              <h2>Activities</h2>
                            </div>
                            <Link
                              href={sectionHref("activities")}
                              className={styles.tripSectionToggle}
                            >
                              View activities →
                            </Link>
                          </div>
                          <div className={styles.tripWorkspaceCardGrid}>
                            <div
                              className={`${styles.infoCard} ${styles.infoCardCompact}`}
                            >
                              <span className={styles.tripFactLabel}>
                                Activities
                              </span>
                              <strong>{activities.length} selected</strong>
                              <p className={styles.muted}>
                                {activities[0]?.title ||
                                  "No activities added yet."}{" "}
                                This is the current lead experience for the
                                trip.
                              </p>
                              <div className={styles.tripMetricRow}>
                                <span className={styles.tripMetricPill}>
                                  {activityVoteSummary.votes} votes
                                </span>
                                <span className={styles.tripMetricPill}>
                                  {activityVoteSummary.participants}/
                                  {activityVoteSummary.eligible || 0} voters
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

                        <section
                          id="expenses"
                          className={styles.tripWorkspaceSectionCard}
                        >
                          <div className={styles.tripWorkspaceSectionTop}>
                            <div>
                              <p className={styles.eyebrow}>Expenses</p>
                              <h2>Expenses</h2>
                            </div>
                            <Link
                              href={sectionHref("expenses")}
                              className={styles.tripSectionToggle}
                            >
                              View expenses →
                            </Link>
                          </div>
                          <div className={styles.tripWorkspaceCardGrid}>
                            <div
                              className={`${styles.infoCard} ${styles.infoCardCompact}`}
                            >
                              <span className={styles.tripFactLabel}>
                                Expense tracking
                              </span>
                              <strong>Payments and planned costs</strong>
                              <p className={styles.muted}>
                                View payment history and saved planning costs
                                for this trip.
                              </p>
                              <div className={styles.tripMetricRow}>
                                <span className={styles.tripMetricPill}>
                                  {hotels.length +
                                    activities.length +
                                    transport.length +
                                    dining.length}{" "}
                                  planned items
                                </span>
                              </div>
                            </div>
                            <div
                              className={`${styles.infoCard} ${styles.infoCardCompact}`}
                            >
                              <span className={styles.tripFactLabel}>
                                Open expenses
                              </span>
                              <strong>Keep costs with your trip</strong>
                              <p className={styles.muted}>
                                Open the Expenses tab to see paid and outstanding
                                amounts, with a breakdown by currency.
                              </p>
                            </div>
                          </div>
                        </section>

                        <section
                          id="settings"
                          className={styles.tripWorkspaceSectionCard}
                        >
                          <div className={styles.tripWorkspaceSectionTop}>
                            <div>
                              <p className={styles.eyebrow}>Settings</p>
                              <h2>Settings</h2>
                            </div>
                            <Link
                              href={sectionHref("settings")}
                              className={styles.tripSectionToggle}
                            >
                              View settings →
                            </Link>
                          </div>

                          <div className={styles.tripWorkspaceCardGrid}>
                            <div
                              className={`${styles.infoCard} ${styles.infoCardCompact}`}
                            >
                              <span className={styles.tripFactLabel}>
                                Access
                              </span>
                              <strong>
                                {accessRole === "organiser"
                                  ? "You are managing this trip"
                                  : "You are viewing as a participant"}
                              </strong>
                              <p className={styles.muted}>
                                Access level drives whether someone can manage,
                                publish, invite, or simply review and vote.
                              </p>
                              <div className={styles.tripMetricRow}>
                                <span className={styles.tripMetricPill}>
                                  {getTripStatusLabel(trip.status)}
                                </span>
                                <span className={styles.tripMetricPill}>
                                  {trip.visibility === "public"
                                    ? "Public"
                                    : "Private"}
                                </span>
                                <span className={styles.tripMetricPill}>
                                  {accessRole}
                                </span>
                              </div>
                            </div>
                            {accessRole === "organiser" ? (
                              <div
                                className={`${styles.infoCard} ${styles.infoCardCompact}`}
                              >
                                <span className={styles.tripFactLabel}>
                                  Visibility
                                </span>
                                <strong>
                                  {trip.visibility === "public"
                                    ? "Public - open to all"
                                    : "Private - invited only"}
                                </strong>
                                <p className={styles.muted}>
                                  Public trips can appear on the Public trips
                                  page once published. Private trips stay
                                  invite-only.
                                </p>
                                <div className={styles.tripFilter}>
                                  <button
                                    type="button"
                                    className={
                                      trip.visibility === "public"
                                        ? styles.tripFilterButton
                                        : styles.tripFilterButtonActive
                                    }
                                    onClick={() =>
                                      void handleUpdateVisibility("private")
                                    }
                                    disabled={isUpdatingVisibility}
                                  >
                                    Private
                                  </button>
                                  <button
                                    type="button"
                                    className={
                                      trip.visibility === "public"
                                        ? styles.tripFilterButtonActive
                                        : styles.tripFilterButton
                                    }
                                    onClick={() =>
                                      void handleUpdateVisibility("public")
                                    }
                                    disabled={isUpdatingVisibility}
                                  >
                                    Public
                                  </button>
                                </div>
                              </div>
                            ) : null}
                            <div
                              className={`${styles.infoCard} ${styles.infoCardCompact}`}
                            >
                              <span className={styles.tripFactLabel}>
                                Actions
                              </span>
                              <strong>Workspace controls</strong>
                              <p className={styles.muted}>
                                Draft trips can be deleted. Once published,
                                notifications may link here, so the trip is
                                protected.
                              </p>
                              <div className={styles.headerActions}>
                                {accessRole === "organiser" &&
                                trip.status === "draft" ? (
                                  <button
                                    type="button"
                                    className={styles.dangerAction}
                                    onClick={handleDeleteTrip}
                                    disabled={isDeleting}
                                  >
                                    {isDeleting
                                      ? "Deleting..."
                                      : "Delete draft"}
                                  </button>
                                ) : null}
                                <Link
                                  href="/trips"
                                  className={styles.secondaryActionLink}
                                >
                                  Back to trips
                                </Link>
                              </div>
                            </div>
                            {accessRole === "organiser" &&
                            pendingApprovalParticipants.length > 0 ? (
                              <div
                                className={`${styles.infoCard} ${styles.infoCardCompact}`}
                              >
                                <span className={styles.tripFactLabel}>
                                  Pending approval
                                </span>
                                <strong>
                                  {pendingApprovalParticipants.length} request
                                  waiting
                                </strong>
                                <p className={styles.muted}>
                                  Review public trip interest before people
                                  become active participants.
                                </p>
                                <div className={styles.participantsList}>
                                  {pendingApprovalParticipants.map(
                                    (participant) => (
                                      <article
                                        key={participant.id}
                                        className={styles.participantCard}
                                      >
                                        <div className={styles.rowTop}>
                                          <span className={styles.rowTitle}>
                                            {participant.full_name ||
                                              participant.email}
                                          </span>
                                          <span className={styles.badge}>
                                            {getParticipantMembershipLabel(
                                              participant,
                                            )}
                                          </span>
                                        </div>
                                        {participant.request_message ? (
                                          <p className={styles.muted}>
                                            {participant.request_message}
                                          </p>
                                        ) : null}
                                        <div className={styles.headerActions}>
                                          <button
                                            type="button"
                                            className={styles.primaryAction}
                                            onClick={() =>
                                              void handleReviewParticipant(
                                                participant.id,
                                                "approve_participant",
                                              )
                                            }
                                            disabled={
                                              reviewingParticipantId ===
                                              participant.id
                                            }
                                          >
                                            Approve
                                          </button>
                                          <button
                                            type="button"
                                            className={styles.secondaryAction}
                                            onClick={() =>
                                              void handleReviewParticipant(
                                                participant.id,
                                                "decline_participant",
                                              )
                                            }
                                            disabled={
                                              reviewingParticipantId ===
                                              participant.id
                                            }
                                          >
                                            Decline
                                          </button>
                                        </div>
                                      </article>
                                    ),
                                  )}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </section>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : null}

            {planningDrawer && planningDrawerMeta ? (
              <div
                className={styles.slidePanelBackdrop}
                role="presentation"
                onClick={() => setPlanningDrawer(null)}
              >
                <aside
                  className={`${styles.slidePanel} ${slidePanelExpanded ? styles.slidePanelExpanded : ""}`}
                  aria-label={`${planningDrawerMeta.title} list`}
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className={styles.slidePanelHeader}>
                    <div>
                      <p className={styles.eyebrow}>
                        {planningDrawerMeta.eyebrow}
                      </p>
                      <h2>{planningDrawerMeta.title}</h2>
                      <p className={styles.muted}>
                        {planningDrawerMeta.copy} {planningDrawerMeta.count}{" "}
                        option
                        {planningDrawerMeta.count === 1 ? "" : "s"} saved.
                      </p>
                    </div>
                    <div className={styles.slidePanelHeaderActions}>
                      <button
                        type="button"
                        className={styles.slidePanelIconButton}
                        onClick={() =>
                          setSlidePanelExpanded((current) => !current)
                        }
                        aria-label={
                          slidePanelExpanded
                            ? "Restore panel width"
                            : "Expand panel to full width"
                        }
                        title={slidePanelExpanded ? "Restore" : "Full width"}
                      >
                        {slidePanelExpanded ? <FiMinimize2 /> : <FiMaximize2 />}
                      </button>
                      <button
                        type="button"
                        className={styles.slidePanelCloseButton}
                        onClick={() => setPlanningDrawer(null)}
                        aria-label="Close list"
                        title="Close"
                      >
                        <FiX />
                      </button>
                    </div>
                  </div>
                  <div className={styles.slidePanelBody}>
                    {planningDrawerMeta.count > 0 ? (
                      <div className={styles.tripViewDrawerGrid}>
                        {renderPlanningDrawerCards()}
                      </div>
                    ) : (
                      <p className={styles.emptyStateSmall}>
                        {planningDrawerMeta.empty}
                      </p>
                    )}
                  </div>
                </aside>
              </div>
            ) : null}

            {ownerDrawer &&
            trip &&
            (accessRole === "organiser" || ownerDrawer === "messages" || (ownerDrawer === "expenses" && canViewTripExpenses)) ? (
              <div
                ref={messagesDrawerBackdropRef}
                className={styles.slidePanelBackdrop}
                role="presentation"
                onClick={() => void closeOwnerDrawer()}
              >
                <aside
                  ref={messagesDrawerRef}
                  inert={ownerDrawer === "expenses" && !expensesReady}
                  aria-hidden={ownerDrawer === "expenses" && !expensesReady}
                  className={`${styles.slidePanel} ${ownerDrawer === "expenses" && !expensesReady ? styles.expensesPanelLoading : ""} ${ownerDrawer === "expenses" ? styles.expensesSlidePanel : ""} ${ownerDrawer === "messages" ? styles.chatSlidePanel : ""} ${
                    slidePanelExpanded ? styles.slidePanelExpanded : ""
                  } ${ownerDrawer === "messages" && chatReferencesOpen ? styles.chatSlidePanelWithReferences : ""}`}
                  role={ownerDrawer === "expenses" ? "dialog" : undefined}
                  aria-modal={ownerDrawer === "expenses" ? true : undefined}
                  tabIndex={ownerDrawer === "expenses" ? -1 : undefined}
                  aria-label={
                    ownerDrawer === "expenses" ? "Trip expenses" : ownerDrawer === "settings"
                      ? "Trip settings"
                      : ownerDrawer === "dashboard"
                        ? "Trip dashboard"
                        : ownerDrawer === "messages"
                          ? "Trip messages"
                          : "Trip participants"
                  }
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className={styles.slidePanelHeader}>
                    {ownerDrawer === "expenses" ? <h2>{trip.title}</h2> : null}
                    {ownerDrawer !== "expenses" ? (
                      <div>
                        {ownerDrawer !== "messages" ? (
                          <p className={styles.eyebrow}>Owner controls</p>
                      ) : null}
                      <h2>
                        {ownerDrawer === "settings"
                          ? "Trip settings"
                          : ownerDrawer === "dashboard"
                            ? "Dashboard"
                            : ownerDrawer === "messages"
                              ? trip.title
                              : "Participants"}
                      </h2>
                      {ownerDrawer !== "messages" ? (
                        <p className={styles.muted}>
                          {ownerDrawer === "settings"
                            ? "Manage publish state, visibility, and owner-only actions for this trip."
                            : ownerDrawer === "dashboard"
                              ? "Owner view of progress, voting, and traveller readiness."
                              : "Invite travellers and review public interest before people become active participants."}
                        </p>
                      ) : null}
                    </div>
                    ) : null}
                    <div className={styles.slidePanelHeaderActions}>
                      <button
                        type="button"
                        className={styles.slidePanelIconButton}
                        onClick={() =>
                          setSlidePanelExpanded((current) => !current)
                        }
                        aria-label={
                          slidePanelExpanded
                            ? "Restore panel width"
                            : "Expand panel to full width"
                        }
                        title={slidePanelExpanded ? "Restore" : "Full width"}
                      >
                        {slidePanelExpanded ? <FiMinimize2 /> : <FiMaximize2 />}
                      </button>
                      <button
                        type="button"
                        className={styles.slidePanelCloseButton}
                        onClick={() => void closeOwnerDrawer()}
                        aria-label="Close panel"
                        title="Close"
                      >
                        <FiX />
                      </button>
                    </div>
                  </div>

                  <div className={styles.slidePanelBody}>
                    {ownerDrawer === "expenses" && canViewTripExpenses ? (
                      <TripExpenses key={trip.id} tripId={trip.id} embedded onReady={setExpensesReady} />
                    ) : null}
                    {ownerDrawer === "dashboard" ? (
                      <div className={styles.ownerDashboard}>
                        <div className={styles.ownerDashboardStats}>
                          <span>
                            <strong>{participants.length}</strong>
                            Connected people
                          </span>
                          <span>
                            <strong>{acceptedParticipants.length}</strong>
                            Active participants
                          </span>
                          <span>
                            <strong>
                              {pendingApprovalParticipants.length}
                            </strong>
                            Awaiting review
                          </span>
                          <span>
                            <strong>{participantResponseRate}%</strong>
                            Response rate
                          </span>
                        </div>

                        <section className={styles.ownerDashboardPanel}>
                          <div className={styles.ownerDashboardPanelHeader}>
                            <div>
                              <span className={styles.tripFactLabel}>
                                People overview
                              </span>
                              <strong>{trip.destination || trip.title}</strong>
                              <p className={styles.muted}>
                                {formatTripDatePlanning(trip)} ·{" "}
                                {getTripStatusLabel(trip.status)}
                              </p>
                            </div>
                            <span className={styles.badgeSoft}>
                              {trip.visibility === "public"
                                ? "Public trip"
                                : "Private trip"}
                            </span>
                          </div>
                          <div className={styles.ownerDashboardSplit}>
                            <div className={styles.ownerDashboardProgressList}>
                              {peopleFunnelRows.map((row) => (
                                <div
                                  key={row.label}
                                  className={styles.ownerDashboardProgressRow}
                                >
                                  <div>
                                    <strong>{row.label}</strong>
                                    <span>
                                      {row.count} person
                                      {row.count === 1 ? "" : "s"}
                                    </span>
                                  </div>
                                  <div className={styles.tripMiniProgress}>
                                    <span
                                      className={styles.tripMiniProgressFill}
                                      style={{
                                        width: `${participants.length ? Math.round((row.count / participants.length) * 100) : 0}%`,
                                      }}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div className={styles.ownerDashboardProgressList}>
                              {attendanceRows.map((row) => (
                                <div
                                  key={row.label}
                                  className={styles.ownerDashboardProgressRow}
                                >
                                  <div>
                                    <strong>{row.label}</strong>
                                    <span>
                                      {row.count} person
                                      {row.count === 1 ? "" : "s"}
                                    </span>
                                  </div>
                                  <div className={styles.tripMiniProgress}>
                                    <span
                                      className={styles.tripMiniProgressFill}
                                      style={{
                                        width: `${participants.length ? Math.round((row.count / participants.length) * 100) : 0}%`,
                                      }}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </section>

                        <div className={styles.ownerDashboardSplit}>
                          <section className={styles.ownerDashboardPanel}>
                            <div className={styles.ownerDashboardPanelHeader}>
                              <div>
                                <span className={styles.tripFactLabel}>
                                  Needs review
                                </span>
                                <strong>Approval queue</strong>
                                <p className={styles.muted}>
                                  People who asked to join this trip.
                                </p>
                              </div>
                              <span className={styles.badgeSoft}>
                                {pendingApprovalParticipants.length}
                              </span>
                            </div>
                            <div className={styles.ownerDashboardUserList}>
                              {pendingApprovalParticipants
                                .slice(0, 4)
                                .map((participant) => (
                                  <article
                                    key={participant.id}
                                    className={styles.ownerDashboardUserRow}
                                  >
                                    <div>
                                      <strong>
                                        {participant.full_name ||
                                          participant.email}
                                      </strong>
                                      <p>{participant.email}</p>
                                      {participant.request_message ? (
                                        <small>
                                          {participant.request_message}
                                        </small>
                                      ) : null}
                                    </div>
                                    <span className={styles.badge}>
                                      {getParticipantMembershipLabel(
                                        participant,
                                      )}
                                    </span>
                                  </article>
                                ))}
                              {pendingApprovalParticipants.length === 0 ? (
                                <p className={styles.emptyStateSmall}>
                                  No approval requests are waiting right now.
                                </p>
                              ) : null}
                            </div>
                          </section>

                          <section className={styles.ownerDashboardPanel}>
                            <div className={styles.ownerDashboardPanelHeader}>
                              <div>
                                <span className={styles.tripFactLabel}>
                                  Active people
                                </span>
                                <strong>Current participants</strong>
                                <p className={styles.muted}>
                                  Accepted people and their attendance position.
                                </p>
                              </div>
                              <span className={styles.badgeSoft}>
                                {acceptedParticipants.length}
                              </span>
                            </div>
                            <div className={styles.ownerDashboardUserList}>
                              {acceptedParticipants
                                .slice(0, 6)
                                .map((participant) => (
                                  <article
                                    key={participant.id}
                                    className={styles.ownerDashboardUserRow}
                                  >
                                    <div>
                                      <strong>
                                        {participant.full_name ||
                                          participant.email}
                                      </strong>
                                      <p>{participant.email}</p>
                                    </div>
                                    <span className={styles.badge}>
                                      {getAttendanceStatusLabel(
                                        participant.attendance_status,
                                      )}
                                    </span>
                                  </article>
                                ))}
                              {acceptedParticipants.length === 0 ? (
                                <p className={styles.emptyStateSmall}>
                                  No active participants yet.
                                </p>
                              ) : null}
                            </div>
                          </section>
                        </div>
                      </div>
                    ) : null}

                    {ownerDrawer === "messages" ? (
                      <div className={`${styles.whatsAppChatShell} ${chatReferencesOpen ? styles.whatsAppChatShellWithReferences : ""}`}>
                        <div
                          ref={chatMessageListRef}
                          className={styles.whatsAppChatList}
                          onScroll={(event) => {
                            if (event.currentTarget.scrollTop <= 36) {
                              void loadOlderDiscussionComments();
                            }
                          }}
                        >
                          {discussionLoadingMore ? (
                            <div className={styles.whatsAppLoadingMore}>
                              <span aria-hidden="true" />
                              Loading more messages…
                            </div>
                          ) : discussionHasMore ? (
                            <div className={styles.whatsAppLoadMoreHint}>
                              Scroll up for earlier messages
                            </div>
                          ) : null}
                          {chronologicalDiscussion.length ? (
                            chronologicalDiscussion.map((comment, commentIndex) => {
                              const previousComment = chronologicalDiscussion[commentIndex - 1];
                              if (
                                comment.deletedAt &&
                                previousComment?.deletedAt &&
                                previousComment.authorId === comment.authorId
                              ) {
                                return null;
                              }
                              let deletedRunCount = 1;
                              if (comment.deletedAt) {
                                while (
                                  chronologicalDiscussion[commentIndex + deletedRunCount]?.deletedAt &&
                                  chronologicalDiscussion[commentIndex + deletedRunCount]?.authorId === comment.authorId
                                ) {
                                  deletedRunCount += 1;
                                }
                              }
                              const deletedRunTimes = comment.deletedAt
                                ? chronologicalDiscussion
                                    .slice(commentIndex, commentIndex + deletedRunCount)
                                    .map((deletedComment) =>
                                      new Intl.DateTimeFormat("en-GB", {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      }).format(new Date(deletedComment.createdAt)),
                                    )
                                    .join(", ")
                                : "";
                              const replyTarget = comment.parentCommentId
                                ? commentById[comment.parentCommentId]
                                : null;
                              const isOwnMessage = Boolean(
                                currentUserId &&
                                comment.authorId === currentUserId,
                              );
                              const isEdited =
                                !comment.deletedAt &&
                                new Date(comment.updatedAt).getTime() -
                                  new Date(comment.createdAt).getTime() >
                                  1000;
                              const isStickerOnlyMessage =
                                !comment.deletedAt &&
                                comment.body.replace(/\[\[journi:sticker:[^|\]]+\|[^\]]+\]\]/g, "").trim() === "";
                              const stickerCount = comment.deletedAt
                                ? 0
                                : (comment.body.match(/\[\[journi:sticker:/g) ?? []).length;
                              const emojiOnlyCount = comment.deletedAt
                                ? 0
                                : getEmojiOnlyCount(comment.body);
                              const attachmentUrls = comment.deletedAt
                                ? []
                                : getAllUrls(comment.body).filter((url) => isChatImageUrl(url) || isChatFileUrl(url));
                              const attachmentsExpanded = expandedAttachmentMessageIds.includes(comment.id);
                              const visibleAttachmentUrls = new Set(
                                attachmentsExpanded ? attachmentUrls : attachmentUrls.slice(0, 4),
                              );
                              const tripReferences = comment.deletedAt
                                ? []
                                : (comment.body.match(/\[\[journi:(?!person:|sticker:|gif:)[^:\]]+:[^|\]]+\|[^\]]+\]\]/g) ?? [])
                                    .map((token) => chatReferenceGroups
                                      .flatMap((group) => group.items.map((item) => ({
                                        ...item,
                                        groupLabel: group.label,
                                        voteCategory: getReferenceVoteCategory(group.label),
                                      })))
                                      .find((item) => item.token === token))
                                    .filter((item) => Boolean(item));

                              return (
                                <article
                                  key={comment.id}
                                  className={`${styles.whatsAppMessage} ${isOwnMessage ? styles.whatsAppMessageOwn : ""}`}
                                >
                                  <div
                                    className={styles.whatsAppSenderIdentity}
                                    tabIndex={0}
                                    aria-label={`View ${comment.authorName}'s profile card`}
                                    onMouseEnter={(event) =>
                                      showChatProfileCard(
                                        event.currentTarget,
                                        comment,
                                        isOwnMessage,
                                      )
                                    }
                                    onMouseLeave={() => setProfileTooltip(null)}
                                    onFocus={(event) =>
                                      showChatProfileCard(
                                        event.currentTarget,
                                        comment,
                                        isOwnMessage,
                                      )
                                    }
                                    onBlur={() => setProfileTooltip(null)}
                                  >
                                    {comment.authorProfile?.avatarUrl ? (
                                      <img
                                        src={comment.authorProfile.avatarUrl}
                                        alt=""
                                        className={styles.whatsAppAvatarImage}
                                        style={{
                                          objectPosition: `${comment.authorProfile.avatarPositionX}% ${comment.authorProfile.avatarPositionY}%`,
                                        }}
                                      />
                                    ) : (
                                      <span className={styles.whatsAppAvatar} aria-hidden="true">
                                        {comment.authorName
                                          .split(/\s+/)
                                          .filter(Boolean)
                                          .slice(0, 2)
                                          .map((part) => part[0]?.toUpperCase())
                                          .join("") || "J"}
                                      </span>
                                    )}
                                    {profileTooltip?.comment.id === comment.id &&
                                    typeof document !== "undefined"
                                      ? createPortal(
                                          <aside
                                            className={`${styles.whatsAppProfileTooltip} ${profileTooltip.opensBelow ? styles.whatsAppProfileTooltipBelow : ""}`}
                                            style={{
                                              ...resolveProfileBackgroundStyle({
                                                backgroundUrl:
                                                  comment.authorProfile?.backgroundUrl ?? "",
                                                backgroundPattern:
                                                  comment.authorProfile?.backgroundPattern,
                                                backgroundPositionX:
                                                  comment.authorProfile?.backgroundPositionX,
                                                backgroundPositionY:
                                                  comment.authorProfile?.backgroundPositionY,
                                              }),
                                              top: profileTooltip.top,
                                              left: profileTooltip.left,
                                            }}
                                          >
                                            <div className={styles.whatsAppProfileTooltipBody}>
                                              {comment.authorProfile?.avatarUrl ? (
                                                <img
                                                  src={comment.authorProfile.avatarUrl}
                                                  alt=""
                                                  style={{
                                                    objectPosition: `${comment.authorProfile.avatarPositionX}% ${comment.authorProfile.avatarPositionY}%`,
                                                  }}
                                                />
                                              ) : (
                                                <span>
                                                  {comment.authorName
                                                    .trim()
                                                    .charAt(0)
                                                    .toUpperCase() || "J"}
                                                </span>
                                              )}
                                              <strong>{comment.authorName}</strong>
                                              <p>
                                                {comment.authorProfile?.bio ||
                                                  "Journi traveller"}
                                              </p>
                                            </div>
                                          </aside>,
                                          document.body,
                                        )
                                      : null}
                                  </div>
                                  <div className={`${styles.whatsAppMessageContent} ${isOwnMessage ? styles.whatsAppMessageContentOwn : ""} ${tripReferences.length ? styles.whatsAppMessageContentWithReferences : ""}`}>
                                  <div
                                    className={`${styles.whatsAppBubble} ${isOwnMessage ? styles.whatsAppBubbleOwn : ""} ${comment.deletedAt ? styles.whatsAppBubbleDeleted : ""} ${isStickerOnlyMessage ? styles.whatsAppBubbleSticker : ""}`}
                                  >
                                    <strong className={styles.whatsAppSenderName}>
                                      {comment.authorName}
                                    </strong>
                                    {comment.deletedAt ? null : isOwnMessage ? (
                                      <>
                                        <button
                                          type="button"
                                          className={styles.whatsAppReplyIcon}
                                          onClick={() =>
                                            setMessageOptionsId((current) =>
                                              current === comment.id ? null : comment.id,
                                            )
                                          }
                                          aria-label="Message options"
                                          aria-expanded={messageOptionsId === comment.id}
                                          title="Message options"
                                        >
                                          <FiMoreVertical />
                                        </button>
                                        {messageOptionsId === comment.id ? (
                                          <div className={styles.whatsAppMessageOptions}>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setReplyingToId(comment.id);
                                                setMessageOptionsId(null);
                                              }}
                                            >
                                              <FiCornerUpLeft /> Reply
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => void handleEditDiscussion(comment)}
                                            >
                                              <FiEdit3 /> Edit
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setDeleteConfirmCommentId(comment.id);
                                                setMessageOptionsId(null);
                                              }}
                                              disabled={deletingCommentId === comment.id}
                                            >
                                              <FiTrash2 />
                                              {deletingCommentId === comment.id ? "Deleting..." : "Delete"}
                                            </button>
                                          </div>
                                        ) : null}
                                      </>
                                    ) : (
                                      <button
                                        type="button"
                                        className={styles.whatsAppReplyIcon}
                                        onClick={() =>
                                          setReplyingToId((current) =>
                                            current === comment.id ? null : comment.id,
                                          )
                                        }
                                        aria-label={`Reply to ${comment.authorName}`}
                                        title="Reply"
                                      >
                                        <FiCornerUpLeft />
                                      </button>
                                    )}
                                    {replyTarget ? (
                                      <div
                                        className={styles.whatsAppReplyPreview}
                                      >
                                        {replyTarget.authorName}:{" "}
                                        {replyTarget.deletedAt
                                          ? "This message was deleted"
                                          : replyTarget.body}
                                      </div>
                                    ) : null}
                                    <div
                                      className={`${styles.whatsAppMessageBody} ${comment.deletedAt ? styles.whatsAppDeletedMessage : ""} ${emojiOnlyCount === 1 ? styles.whatsAppEmojiMessageSingle : emojiOnlyCount === 2 ? styles.whatsAppEmojiMessagePair : emojiOnlyCount >= 3 ? styles.whatsAppEmojiMessageGroup : ""}`}
                                    >
                                      {comment.deletedAt
                                        ? (
                                            <>
                                              {deletedRunCount === 1
                                                ? "1 message was deleted"
                                                : "A couple of messages were deleted"}
                                              {deletedRunCount > 1 ? (
                                                <span
                                                  className={styles.whatsAppDeletedCount}
                                                  data-tooltip={`Deleted at ${deletedRunTimes}`}
                                                  aria-label={`${deletedRunCount} messages deleted at ${deletedRunTimes}`}
                                                  tabIndex={0}
                                                >
                                                  ×{deletedRunCount}
                                                </span>
                                              ) : null}
                                            </>
                                          )
                                        : renderChatMessageBody(comment.body, stickerCount, visibleAttachmentUrls)}
                                      {isEdited ? (
                                        <span className={styles.whatsAppEditedLabel}>
                                          edited
                                        </span>
                                      ) : null}
                                      <time
                                        className={styles.whatsAppInlineTime}
                                      >
                                        {new Intl.DateTimeFormat("en-GB", {
                                          hour: "2-digit",
                                          minute: "2-digit",
                                        }).format(new Date(comment.createdAt))}
                                      </time>
                                    </div>
                                    {!comment.deletedAt && attachmentUrls.length > 4 ? (
                                      <button
                                        type="button"
                                        className={styles.whatsAppShowAttachments}
                                        onClick={() => setExpandedAttachmentMessageIds((current) =>
                                          current.includes(comment.id)
                                            ? current.filter((id) => id !== comment.id)
                                            : [...current, comment.id],
                                        )}
                                      >
                                        {attachmentsExpanded
                                          ? "Show fewer"
                                          : `Show all ${attachmentUrls.length} attachments`}
                                      </button>
                                    ) : null}
                                    {!comment.deletedAt
                                      ? getAllUrls(comment.body)
                                        .filter((url) => !isChatAudioUrl(url) && !isChatImageUrl(url) && !isChatFileUrl(url) && !isGiphyMediaUrl(url))
                                        .map((url, index) => (
                                          <ChatLinkPreview
                                            key={`${comment.id}-link-${index}-${url}`}
                                            url={url}
                                            playable
                                          />
                                        ))
                                      : null}
                                    {comment.canDelete && !isOwnMessage ? (
                                      <div className={styles.whatsAppActions}>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setDeleteConfirmCommentId(comment.id)
                                          }
                                          disabled={
                                            deletingCommentId === comment.id
                                          }
                                        >
                                          {deletingCommentId === comment.id
                                            ? "Deleting..."
                                            : "Delete"}
                                        </button>
                                      </div>
                                    ) : null}
                                  </div>
                                  {tripReferences.length ? (
                                    <div className={`${styles.whatsAppMessageReferences} ${tripReferences.length === 1 ? styles.whatsAppMessageReferencesOne : tripReferences.length === 2 ? styles.whatsAppMessageReferencesTwo : styles.whatsAppMessageReferencesMany}`}>
                                      {tripReferences.map((item, referenceIndex) => item ? (
                                        <span key={`${item.token}-${referenceIndex}`} className={styles.whatsAppSentReferenceCard}>
                                          {item.imageUrl ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={item.imageUrl} alt="" />
                                          ) : (
                                            <span aria-hidden="true">{item.label.slice(0, 1).toUpperCase()}</span>
                                          )}
                                          {item.voteCategory
                                            ? renderPlanningVoteBadge(
                                                item.voteCategory,
                                                item.id,
                                                getCategoryEntityIds(item.voteCategory),
                                              )
                                            : null}
                                          <span>
                                            <small>{item.groupLabel}</small>
                                            <strong>{item.label}</strong>
                                            <em>{item.detail}</em>
                                            {item.rating ? <span className={styles.whatsAppSentReferenceRating}><FiStar /> <b>{item.rating}</b> Google</span> : null}
                                            <button
                                              type="button"
                                              className={styles.whatsAppSentReferenceAction}
                                              onClick={() => openSavedPlaceDetails(
                                                item.groupLabel.replace(/s$/, ""),
                                                item.label,
                                                item.detail,
                                                item.googlePlaceId,
                                                item.imageUrl,
                                              )}
                                            >
                                              View more
                                            </button>
                                          </span>
                                        </span>
                                      ) : null)}
                                    </div>
                                  ) : null}
                                  </div>
                                </article>
                              );
                            })
                          ) : (
                            <div className={styles.whatsAppEmpty}>
                              <p>No messages yet. Start the trip chat.</p>
                            </div>
                          )}
                        </div>

                        {chatReferencesOpen ? (
                          <aside className={styles.whatsAppReferenceDrawer} aria-label="Choose a reference">
                            <header>
                              <button type="button" onClick={closeChatReferences} aria-label="Close references"><FiX /></button>
                            </header>
                            <div className={styles.whatsAppReferenceDrawerGroups}>
                              {filteredChatReferenceGroups.map((group) =>
                                group.items.length ? (
                                  <section key={group.label} className={group.label === "People" ? styles.whatsAppReferencePeopleSection : ""}>
                                    <h3>{group.label}</h3>
                                    <div>
                                      {group.items.map((item) => (
                                        <button
                                          key={`${group.label}-${item.id}`}
                                          type="button"
                                          onClick={() => {
                                            appendChatReference(item.token);
                                            closeChatReferences();
                                            requestAnimationFrame(() => chatComposerTextareaRef.current?.focus());
                                          }}
                                          style={
                                            group.label === "People" && "backgroundUrl" in item
                                              ? resolveProfileBackgroundStyle({
                                                  backgroundUrl: typeof item.backgroundUrl === "string" ? item.backgroundUrl : "",
                                                  backgroundPattern: "backgroundPattern" in item && typeof item.backgroundPattern === "string" ? item.backgroundPattern : "",
                                                })
                                              : undefined
                                          }
                                        >
                                          {item.imageUrl ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={item.imageUrl} alt="" />
                                          ) : (
                                            <span aria-hidden="true">{item.label.slice(0, 1).toUpperCase()}</span>
                                          )}
                                          <div>
                                            <strong>{item.label}</strong>
                                            <small>{item.detail}</small>
                                            {group.label !== "People" && item.rating ? (
                                              <span className={styles.whatsAppReferenceRating}><FiStar /><b>{item.rating}</b> Google</span>
                                            ) : null}
                                            {group.label !== "People" ? (
                                              <em className={styles.whatsAppReferenceAdd}><FiPlus /> Add to message</em>
                                            ) : null}
                                          </div>
                                          {group.label === "People" ? <FiPlus aria-hidden="true" /> : null}
                                        </button>
                                      ))}
                                    </div>
                                  </section>
                                ) : null,
                              )}
                              {!filteredChatReferenceGroups.some((group) => group.items.length) ? (
                                <p className={styles.whatsAppReferenceEmpty}>No references match “{chatReferenceQuery}”</p>
                              ) : null}
                            </div>
                          </aside>
                        ) : null}

                        <form
                          className={styles.whatsAppComposer}
                          onDragEnter={(event) => {
                            event.preventDefault();
                            chatFileDragDepthRef.current += 1;
                            setChatFileDragActive(true);
                          }}
                          onDragOver={(event) => {
                            event.preventDefault();
                            event.dataTransfer.dropEffect = "copy";
                          }}
                          onDragLeave={(event) => {
                            event.preventDefault();
                            chatFileDragDepthRef.current = Math.max(0, chatFileDragDepthRef.current - 1);
                            if (!chatFileDragDepthRef.current) setChatFileDragActive(false);
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            chatFileDragDepthRef.current = 0;
                            setChatFileDragActive(false);
                            addPendingChatFiles(event.dataTransfer.files);
                          }}
                          onSubmit={(event) => {
                            setChatComposerExpanded(false);
                            if (replyingToId) {
                              void handleReply(event, replyingToId);
                              return;
                            }

                            void handlePostDiscussion(event);
                          }}
                        >
                          <input
                            ref={chatAttachmentFileRef}
                            type="file"
                            multiple
                            hidden
                            onChange={(event) => {
                              if (event.target.files) addPendingChatFiles(event.target.files);
                              event.target.value = "";
                            }}
                          />
                          {chatFileDragActive ? (
                            <div className={styles.whatsAppFileDropOverlay}>
                              <FiFile />
                              <strong>Drop files here</strong>
                              <span>Add them to this message</span>
                            </div>
                          ) : null}
                          {replyingToId ? (
                            <div className={styles.whatsAppReplyBanner}>
                              <span>
                                Replying to{" "}
                                {commentById[replyingToId]?.authorName ||
                                  "traveller"}
                              </span>
                              <button
                                type="button"
                                onClick={() => setReplyingToId(null)}
                              >
                                Clear
                              </button>
                            </div>
                          ) : null}
                          {chatAddMenuOpen ? (
                            <div
                              className={
                                chatAddMenuClosing
                                  ? styles.whatsAppAddMenuClosing
                                  : styles.whatsAppAddMenu
                              }
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  closeChatAddMenu(() => chatAttachmentFileRef.current?.click());
                                }}
                              >
                                <FiFile />
                                <span>
                                  <strong>Attachment</strong>
                                  <small>Choose one or more files</small>
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  closeChatAddMenu(() =>
                                    {
                                      setChatReferenceQuery("");
                                      setChatReferencesFromMention(false);
                                      setChatReferencesOpen(true);
                                    },
                                  );
                                }}
                              >
                                <FiLink />
                                <span>
                                  <strong>References</strong>
                                  <small>
                                    Hotels, activities, people and plans
                                  </small>
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  closeChatAddMenu(() => void startChatAudioRecording());
                                }}
                              >
                                <FiMic />
                                <span>
                                  <strong>Audio</strong>
                                  <small>Record a voice message</small>
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  closeChatAddMenu(() =>
                                    setChatEmojiOpen(true),
                                  );
                                }}
                              >
                                <FiImage />
                                <span>
                                  <strong>Sticker</strong>
                                  <small>Choose a sticker</small>
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  closeChatAddMenu(() => void openChatCamera());
                                }}
                              >
                                <FiCamera />
                                <span>
                                  <strong>Camera</strong>
                                  <small>Take, crop and add photos</small>
                                </span>
                              </button>
                            </div>
                          ) : null}
                          {chatEmojiOpen ? (
                            <ChatMediaPicker
                              onClose={() => setChatEmojiOpen(false)}
                              selectedStickerCount={pendingChatStickers.length}
                              onSelect={(type, item) => {
                                if (type === "sticker") {
                                  setPendingChatStickers((current) => [...current, item]);
                                  return;
                                }
                                setPendingChatGif(item);
                                setChatEmojiOpen(false);
                              }}
                            />
                          ) : null}
                          {chatCameraOpen ? (
                            <div className={styles.chatCameraBackdrop} role="presentation" onMouseDown={closeChatCamera}>
                              <section className={styles.chatCameraModal} role="dialog" aria-modal="true" aria-labelledby="chat-camera-title" onMouseDown={(event) => event.stopPropagation()}>
                                <header>
                                  <div>
                                    <strong id="chat-camera-title">Add photos</strong>
                                    <span>{pendingChatPhotos.length} ready to send</span>
                                  </div>
                                  <button type="button" onClick={closeChatCamera} aria-label="Close camera"><FiX /></button>
                                </header>
                                {chatCameraSourceUrl ? (
                                  <>
                                    <div
                                      className={styles.chatCameraCropFrame}
                                      onPointerDown={(event) => {
                                        event.currentTarget.setPointerCapture(event.pointerId);
                                        chatCameraDragRef.current = {
                                          pointerId: event.pointerId,
                                          startX: event.clientX,
                                          startY: event.clientY,
                                          imageX: chatCameraX,
                                          imageY: chatCameraY,
                                        };
                                      }}
                                      onPointerMove={(event) => {
                                        const drag = chatCameraDragRef.current;
                                        if (!drag || drag.pointerId !== event.pointerId) return;
                                        const bounds = event.currentTarget.getBoundingClientRect();
                                        setChatCameraX(Math.max(-100, Math.min(100, drag.imageX + ((event.clientX - drag.startX) / bounds.width) * 200)));
                                        setChatCameraY(Math.max(-100, Math.min(100, drag.imageY + ((event.clientY - drag.startY) / bounds.height) * 200)));
                                      }}
                                      onPointerUp={(event) => {
                                        if (chatCameraDragRef.current?.pointerId === event.pointerId) chatCameraDragRef.current = null;
                                        event.currentTarget.releasePointerCapture(event.pointerId);
                                      }}
                                      onPointerCancel={() => { chatCameraDragRef.current = null; }}
                                      onWheel={(event) => {
                                        event.preventDefault();
                                        setChatCameraZoom((current) => Math.max(1, Math.min(2.5, current - event.deltaY * 0.0015)));
                                      }}
                                    >
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={chatCameraSourceUrl} alt="Photo crop preview" style={{ transform: `translate(${chatCameraX * 0.22}%, ${chatCameraY * 0.22}%) scale(${chatCameraZoom})` }} />
                                      <span aria-hidden="true" />
                                    </div>
                                    <div className={styles.chatCameraCropControls}>
                                      <span>Grab and move the photo to frame it</span>
                                      <div>
                                        <button type="button" onClick={() => setChatCameraZoom((current) => Math.max(1, current - 0.15))} aria-label="Zoom out">−</button>
                                        <strong>{Math.round(chatCameraZoom * 100)}%</strong>
                                        <button type="button" onClick={() => setChatCameraZoom((current) => Math.min(2.5, current + 0.15))} aria-label="Zoom in">+</button>
                                      </div>
                                    </div>
                                    <div className={styles.chatCameraActions}>
                                      <button type="button" onClick={resetChatCameraCrop}>Retake</button>
                                      <button type="button" className={styles.chatCameraPrimaryAction} onClick={() => void addCroppedChatPhoto()}>Add photo</button>
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <div className={styles.chatCameraViewfinder}>
                                      <video ref={chatCameraVideoRef} muted playsInline />
                                      <span aria-hidden="true" />
                                    </div>
                                    {chatCameraError ? <p className={styles.formError}>{chatCameraError}</p> : null}
                                    <div className={styles.chatCameraActions}>
                                      <input ref={chatCameraFileRef} type="file" accept="image/*" capture="environment" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) useChatCameraSource(file); event.target.value = ""; }} />
                                      <button type="button" onClick={() => chatCameraFileRef.current?.click()}>Choose photo</button>
                                      <button type="button" className={styles.chatCameraShutter} onClick={() => void captureChatCameraPhoto()} aria-label="Take photo"><span /></button>
                                      <button type="button" className={styles.chatCameraPrimaryAction} onClick={closeChatCamera} disabled={!pendingChatPhotos.length}>Done{pendingChatPhotos.length ? ` (${pendingChatPhotos.length})` : ""}</button>
                                    </div>
                                  </>
                                )}
                                {pendingChatPhotos.length ? (
                                  <div className={styles.chatCameraPhotoStrip}>
                                    {pendingChatPhotos.map((photo, index) => (
                                      <div key={photo.id}>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={photo.previewUrl} alt={`Pending photo ${index + 1}`} />
                                        <button type="button" onClick={() => removePendingChatPhoto(photo.id)} aria-label={`Remove photo ${index + 1}`}><FiX /></button>
                                      </div>
                                    ))}
                                  </div>
                                ) : null}
                              </section>
                            </div>
                          ) : null}
                          {hoveredDraftLink && composerLinkUrls.length > 3 ? (
                            <aside className={styles.whatsAppHoveredLinkModal}>
                              <ChatLinkPreview url={hoveredDraftLink} />
                            </aside>
                          ) : null}
                          {pendingChatStickers.length || pendingChatGif ? (
                            <div className={styles.whatsAppPendingMedia}>
                              {pendingChatStickers.map((item, index) => (
                                <div key={`sticker-${index}-${item.id}`} className={styles.whatsAppPendingSticker}>
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={item.preview} alt={item.title} />
                                  <button type="button" onClick={() => setPendingChatStickers((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove sticker ${index + 1}`}><FiX /></button>
                                </div>
                              ))}
                              {pendingChatGif ? (
                                <div className={styles.whatsAppPendingGif}>
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={pendingChatGif.preview} alt={pendingChatGif.title} />
                                  <span>GIF</span>
                                  <button type="button" onClick={() => setPendingChatGif(null)} aria-label="Remove GIF"><FiX /></button>
                                </div>
                              ) : null}
                              <button type="button" className={styles.whatsAppPendingMediaAdd} onClick={() => setChatEmojiOpen(true)}><FiPlus /><span>Add</span></button>
                            </div>
                          ) : null}
                          {pendingChatPhotos.length ? (
                            <div className={styles.whatsAppPendingPhotos}>
                              {pendingChatPhotos.map((photo, index) => (
                                <div key={photo.id}>
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={photo.previewUrl} alt={`Photo ${index + 1} ready to send`} />
                                  <button type="button" onClick={() => removePendingChatPhoto(photo.id)} aria-label={`Remove photo ${index + 1}`}><FiX /></button>
                                </div>
                              ))}
                              <button type="button" onClick={() => void openChatCamera()} aria-label="Add another photo"><FiCamera /><span>Add another</span></button>
                            </div>
                          ) : null}
                          {pendingChatFiles.length ? (
                            <div className={styles.whatsAppPendingFiles}>
                              {pendingChatFiles.map(({ id, file }) => (
                                <div key={id}>
                                  <FiFile />
                                  <span><strong>{file.name}</strong><small>{Math.max(1, Math.round(file.size / 1024)).toLocaleString()} KB</small></span>
                                  <button type="button" onClick={() => removePendingChatFile(id)} aria-label={`Remove ${file.name}`}><FiX /></button>
                                </div>
                              ))}
                              <button type="button" onClick={() => chatAttachmentFileRef.current?.click()}><FiPlus /> Add files</button>
                            </div>
                          ) : null}
                          {selectedComposerReferences.length ? (
                            <div className={styles.whatsAppComposerReferences}>
                              {selectedComposerReferences.map(({ token, linkedReference }) => (
                                <button
                                  key={token}
                                  type="button"
                                  className={styles.whatsAppDraftReference}
                                  onClick={() => {
                                    updateActiveChatDraft(activeChatDraft.replace(token, "").replace(/\s{2,}/g, " ").trimStart());
                                    requestAnimationFrame(() => chatComposerTextareaRef.current?.focus());
                                  }}
                                  aria-label={`Remove ${linkedReference?.label || "reference"}`}
                                >
                                  {linkedReference?.imageUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={linkedReference.imageUrl} alt="" />
                                  ) : (
                                    <span aria-hidden="true">{linkedReference?.label.slice(0, 1).toUpperCase() || "R"}</span>
                                  )}
                                  <span>
                                    <small>{linkedReference?.groupLabel || "Reference"}</small>
                                    <strong>{linkedReference?.label || "Trip reference"}</strong>
                                  </span>
                                </button>
                              ))}
                            </div>
                          ) : null}
                          {composerLinkUrls.length ? (
                            <div className={styles.whatsAppComposerLinkCarousel}>
                              {composerLinkUrls.length > 3 ? (
                                <button
                                  type="button"
                                  className={`${styles.whatsAppLinkPreviewToggle} ${styles.whatsAppLinkPreviewToggleLeft}`}
                                  onClick={() =>
                                    chatLinkPreviewsRef.current?.scrollBy({
                                      left: -chatLinkPreviewsRef.current.clientWidth / 3,
                                      behavior: "smooth",
                                    })
                                  }
                                  aria-label="Show previous link preview"
                                >
                                  <FiChevronLeft />
                                </button>
                              ) : null}
                              <div
                                ref={chatLinkPreviewsRef}
                                className={`${styles.whatsAppComposerLinkPreviews} ${composerLinkUrls.length > 1 ? styles.whatsAppComposerLinkPreviewsMultiple : ""} ${composerLinkUrls.length >= 3 ? styles.whatsAppComposerLinkPreviewsCompact : ""} ${composerLinkUrls.length > 3 ? styles.whatsAppComposerLinkPreviewsScrollable : ""} ${composerLinkUrls.length >= 5 ? styles.whatsAppComposerLinkPreviewsPills : ""}`}
                                style={
                                  composerLinkUrls.length <= 3
                                    ? {
                                        gridTemplateColumns: `repeat(${composerLinkUrls.length}, minmax(0, 1fr))`,
                                      }
                                    : undefined
                                }
                              >
                                {composerLinkUrls.map((url, index) => (
                                  <div
                                    key={`composer-link-${index}-${url}`}
                                    className={[
                                      styles.whatsAppComposerLinkPreview,
                                      composerLinkUrls.length <= 3 &&
                                      hoveredDraftLink === url
                                        ? styles.whatsAppComposerLinkPreviewPulse
                                        : "",
                                    ]
                                      .filter(Boolean)
                                      .join(" ")}
                                  >
                                    <ChatLinkPreview url={url} />
                                  </div>
                                ))}
                              </div>
                              {composerLinkUrls.length > 3 ? (
                                <button
                                  type="button"
                                  className={`${styles.whatsAppLinkPreviewToggle} ${styles.whatsAppLinkPreviewToggleRight}`}
                                  onClick={() =>
                                    chatLinkPreviewsRef.current?.scrollBy({
                                      left: chatLinkPreviewsRef.current.clientWidth / 3,
                                      behavior: "smooth",
                                    })
                                  }
                                  aria-label="Show next link preview"
                                >
                                  <FiChevronRight />
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                          <div className={styles.whatsAppComposerRow}>
                            <div
                              className={`${styles.whatsAppInputShell} ${chatAudioRecording || chatAudioUploading ? styles.whatsAppInputShellRecording : ""}`}
                            >
                              {chatAudioRecording || chatAudioUploading ? (
                                <div
                                  className={styles.whatsAppAudioRecorder}
                                >
                                  {!chatAudioUploading ? (
                                    <>
                                      <button type="button" className={styles.whatsAppAudioCancel} onClick={() => finishChatAudioRecording(true)} aria-label="Cancel recording">
                                        <FiX />
                                      </button>
                                      <button type="button" className={styles.whatsAppAudioToggle} onClick={toggleChatAudioRecording} aria-label={chatAudioPaused ? "Resume recording" : "Pause recording"}>
                                        <span
                                          className={chatAudioPaused ? styles.whatsAppPlayGlyph : styles.whatsAppPauseGlyph}
                                          aria-hidden="true"
                                        />
                                      </button>
                                      <div ref={chatAudioWaveformRef} className={styles.whatsAppAudioWaveform} aria-hidden="true" />
                                      <strong>{Math.floor(chatAudioSeconds / 60)}:{String(chatAudioSeconds % 60).padStart(2, "0")}</strong>
                                      <button type="button" className={styles.whatsAppAudioSend} onClick={() => finishChatAudioRecording(false)} aria-label="Send recording">
                                        <FiSend />
                                      </button>
                                    </>
                                  ) : (
                                    <strong className={styles.whatsAppAudioSending}>Sending recording…</strong>
                                  )}
                                </div>
                              ) : (
                                <>
                              <span className={styles.srOnly}>Message</span>
                              <button
                                type="button"
                                className={
                                  chatEmojiOpen
                                    ? styles.whatsAppComposerIconActive
                                    : styles.whatsAppComposerIcon
                                }
                                onClick={() => {
                                  setChatEmojiOpen((current) => !current);
                                  closeChatReferences();
                                  setChatAddMenuOpen(false);
                                }}
                                aria-label="Choose emoji"
                                aria-expanded={chatEmojiOpen}
                              >
                                <FiSmile />
                              </button>
                              <button
                                type="button"
                                className={
                                  chatAddMenuOpen
                                    ? styles.whatsAppComposerIconActive
                                    : styles.whatsAppComposerIcon
                                }
                                onClick={() => {
                                  if (chatAddMenuOpen) closeChatAddMenu();
                                  else setChatAddMenuOpen(true);
                                  closeChatReferences();
                                  setChatEmojiOpen(false);
                                }}
                                aria-label="Open add menu"
                                aria-expanded={chatAddMenuOpen}
                              >
                                <FiPlus />
                              </button>
                              <div className={styles.whatsAppComposerDraftField}>
                                <div
                                  ref={chatComposerHighlightRef}
                                  className={styles.whatsAppComposerDraftHighlight}
                                  aria-hidden="true"
                                >
                                  {renderComposerDraft(visibleChatDraft)}
                                  {visibleChatDraft.endsWith("\n") ? "\u00a0" : null}
                                </div>
                                <textarea
                                  ref={chatComposerTextareaRef}
                                  value={visibleChatDraft}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                                      event.preventDefault();
                                      event.currentTarget.form?.requestSubmit();
                                    }
                                  }}
                                  onScroll={(event) => {
                                    if (chatComposerHighlightRef.current) {
                                      chatComposerHighlightRef.current.scrollTop =
                                        event.currentTarget.scrollTop;
                                    }
                                  }}
                                  onChange={(event) => {
                                    const value = event.target.value.replace(
                                      /((?:https?:\/\/|www\.)[^\s<>()]+|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s<>()]*)?) $/i,
                                      "$1   ",
                                    );
                                    const references = composerReferenceTokens.join(" ");
                                    updateActiveChatDraft(`${references}${references && value ? " " : ""}${value}`);
                                    updateChatReferenceSearch(value);
                                  }}
                                  placeholder="Message"
                                  rows={1}
                                />
                              </div>
                              {chatComposerOverflows ? (
                                <button
                                  type="button"
                                  className={styles.whatsAppComposerIcon}
                                  onClick={() => {
                                    chatComposerModalClosingRef.current = false;
                                    setChatComposerExpanded(true);
                                  }}
                                  aria-label="Open large message editor"
                                >
                                  <FiMaximize2 />
                                </button>
                              ) : null}
                              <button
                                type="submit"
                                className={styles.whatsAppSendButton}
                                disabled={isSubmittingDiscussion}
                                aria-label="Send message"
                              >
                                {isSubmittingDiscussion ? "…" : <FiSend />}
                              </button>
                                </>
                              )}
                            </div>
                          </div>
                          {chatComposerExpanded ? (
                            <div
                              ref={chatComposerBackdropRef}
                              className={styles.chatComposerModalBackdrop}
                              role="presentation"
                              onMouseDown={() => void closeChatComposerModal()}
                            >
                              <section
                                ref={chatComposerModalRef}
                                className={styles.chatComposerModal}
                                role="dialog"
                                aria-modal="true"
                                aria-label="Expanded message editor"
                                onMouseDown={(event) => event.stopPropagation()}
                              >
                                <header>
                                  <button
                                    type="button"
                                    onClick={() => void closeChatComposerModal()}
                                    aria-label="Close large message editor"
                                  >
                                    <FiX />
                                  </button>
                                </header>
                                <textarea
                                  autoFocus
                                  value={
                                    replyingToId
                                      ? (discussionReplyBody[replyingToId] ??
                                        "")
                                      : discussionBody
                                  }
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                                      event.preventDefault();
                                      event.currentTarget.form?.requestSubmit();
                                    }
                                  }}
                                  onChange={(event) => {
                                    updateChatReferenceSearch(event.target.value);
                                    if (replyingToId) {
                                      setDiscussionReplyBody((current) => ({
                                        ...current,
                                        [replyingToId]: event.target.value,
                                      }));
                                      return;
                                    }
                                    setDiscussionBody(event.target.value);
                                  }}
                                  placeholder="Write your message…"
                                />
                                <footer>
                                  <span>
                                    {(replyingToId
                                      ? (discussionReplyBody[replyingToId] ??
                                        "")
                                      : discussionBody
                                    ).length.toLocaleString()}{" "}
                                    characters
                                  </span>
                                  <button
                                    type="submit"
                                    className={styles.chatComposerModalSend}
                                    disabled={isSubmittingDiscussion}
                                    aria-label="Send message"
                                  >
                                    {isSubmittingDiscussion ? "…" : <FiSend />}
                                  </button>
                                </footer>
                              </section>
                            </div>
                          ) : null}
                          {deleteConfirmCommentId ? (
                            <div
                              className={styles.chatDeleteModalBackdrop}
                              role="presentation"
                              onMouseDown={() => setDeleteConfirmCommentId(null)}
                            >
                              <section
                                className={styles.chatDeleteModal}
                                role="alertdialog"
                                aria-modal="true"
                                aria-labelledby="delete-message-title"
                                aria-describedby="delete-message-description"
                                onMouseDown={(event) => event.stopPropagation()}
                              >
                                <h2 id="delete-message-title">Delete message?</h2>
                                <p id="delete-message-description">
                                  The message content will be removed, but everyone will see that a message was deleted.
                                </p>
                                <div>
                                  <button
                                    type="button"
                                    onClick={() => setDeleteConfirmCommentId(null)}
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    className={styles.chatDeleteConfirmButton}
                                    onClick={() =>
                                      void handleDeleteDiscussion(deleteConfirmCommentId)
                                    }
                                    disabled={deletingCommentId === deleteConfirmCommentId}
                                  >
                                    {deletingCommentId === deleteConfirmCommentId
                                      ? "Deleting…"
                                      : "Delete message"}
                                  </button>
                                </div>
                              </section>
                            </div>
                          ) : null}
                          {discussionError ? (
                            <p className={styles.formError}>
                              {discussionError}
                              {discussionError === "Microphone access is needed to record an audio message." ? (
                                <button
                                  type="button"
                                  className={styles.formErrorAction}
                                  onClick={() => {
                                    setDiscussionError(null);
                                    void startChatAudioRecording();
                                  }}
                                >
                                  Enable microphone
                                </button>
                              ) : null}
                            </p>
                          ) : null}
                        </form>
                      </div>
                    ) : null}

                    {ownerDrawer === "settings" ? (
                      <div className={styles.ownerDrawerStack}>
                        <section className={styles.infoCard}>
                          <span className={styles.tripFactLabel}>
                            Publish state
                          </span>
                          <strong>{getTripStatusLabel(trip.status)}</strong>
                          <p className={styles.muted}>
                            Draft trips can still be deleted. Published trips
                            stay protected because notifications may link to
                            them.
                          </p>
                          <div className={styles.headerActions}>
                            <button
                              type="button"
                              className={
                                trip.status === "active"
                                  ? styles.secondaryAction
                                  : styles.primaryAction
                              }
                              onClick={() => void handleTogglePublish()}
                              disabled={
                                isPublishing || trip.status === "active"
                              }
                            >
                              {isPublishing
                                ? "Saving..."
                                : trip.status === "active"
                                  ? "Published"
                                  : "Publish trip"}
                            </button>
                            {trip.status === "draft" ? (
                              <button
                                type="button"
                                className={styles.dangerAction}
                                onClick={handleDeleteTrip}
                                disabled={isDeleting}
                              >
                                {isDeleting ? "Deleting..." : "Delete draft"}
                              </button>
                            ) : null}
                          </div>
                          {publishGateMessage ? (
                            <p className={styles.formError}>
                              {publishGateMessage}
                            </p>
                          ) : null}
                        </section>

                        <section className={styles.infoCard}>
                          <span className={styles.tripFactLabel}>
                            Visibility
                          </span>
                          <strong>
                            {trip.visibility === "public"
                              ? "Public - open to all"
                              : "Private - invited only"}
                          </strong>
                          <p className={styles.muted}>
                            Public trips can appear in discovery once published.
                            Private trips stay invite-only.
                          </p>
                          <div className={styles.tripFilter}>
                            <button
                              type="button"
                              className={
                                trip.visibility === "public"
                                  ? styles.tripFilterButton
                                  : styles.tripFilterButtonActive
                              }
                              onClick={() =>
                                void handleUpdateVisibility("private")
                              }
                              disabled={isUpdatingVisibility}
                            >
                              Private
                            </button>
                            <button
                              type="button"
                              className={
                                trip.visibility === "public"
                                  ? styles.tripFilterButtonActive
                                  : styles.tripFilterButton
                              }
                              onClick={() =>
                                void handleUpdateVisibility("public")
                              }
                              disabled={isUpdatingVisibility}
                            >
                              Public
                            </button>
                          </div>
                        </section>
                      </div>
                    ) : null}

                    {ownerDrawer === "participants" ? (
                      <div className={styles.ownerDrawerCompact}>
                        <div className={styles.ownerDrawerStats}>
                          <span>
                            <strong>{participants.length}</strong>
                            Connected
                          </span>
                          <span>
                            <strong>
                              {pendingApprovalParticipants.length}
                            </strong>
                            Waiting
                          </span>
                          <span>
                            <strong>
                              {plan === "free"
                                ? `${Math.min(participants.length, 5)}/5`
                                : "Pro"}
                            </strong>
                            Plan limit
                          </span>
                        </div>

                        <div
                          className={styles.ownerDrawerTabs}
                          role="tablist"
                          aria-label="Participant controls"
                        >
                          {[
                            ["invite", "Invite", null],
                            [
                              "requests",
                              "Requests",
                              pendingApprovalParticipants.length,
                            ],
                            ["travellers", "Travellers", participants.length],
                          ].map(([tab, label, count]) => (
                            <button
                              key={tab}
                              type="button"
                              role="tab"
                              aria-selected={participantDrawerTab === tab}
                              className={
                                participantDrawerTab === tab
                                  ? styles.ownerDrawerTabActive
                                  : styles.ownerDrawerTab
                              }
                              onClick={() =>
                                setParticipantDrawerTab(
                                  tab as ParticipantDrawerTab,
                                )
                              }
                            >
                              {label}
                              {typeof count === "number" ? (
                                <span>{count}</span>
                              ) : null}
                            </button>
                          ))}
                        </div>

                        {participantDrawerTab === "invite" ? (
                          <section className={styles.ownerCompactPanel}>
                            <div>
                              <h3>Invite traveller</h3>
                              <p className={styles.muted}>
                                Free plan organisers can invite up to 5
                                travellers per trip.
                              </p>
                            </div>
                            <form
                              className={styles.compactInviteForm}
                              onSubmit={(event) =>
                                void handleInviteParticipant(event)
                              }
                            >
                              <label className={styles.compactField}>
                                <span>Name</span>
                                <input
                                  value={participantName}
                                  onChange={(event) =>
                                    setParticipantName(event.target.value)
                                  }
                                  placeholder="Traveller name"
                                />
                              </label>
                              <label className={styles.compactField}>
                                <span>Email</span>
                                <input
                                  value={participantEmail}
                                  onChange={(event) =>
                                    setParticipantEmail(event.target.value)
                                  }
                                  placeholder="name@example.com"
                                  type="email"
                                />
                              </label>
                              <button
                                type="submit"
                                className={styles.primaryAction}
                                disabled={isInviting}
                              >
                                {isInviting ? "Adding..." : "Add"}
                              </button>
                            </form>
                            {participantGateMessage ? (
                              <p className={styles.formError}>
                                {participantGateMessage}
                              </p>
                            ) : null}
                            {participantsError ? (
                              <p className={styles.formError}>
                                {participantsError}
                              </p>
                            ) : null}
                          </section>
                        ) : null}

                        {participantDrawerTab === "requests" ? (
                          <section className={styles.ownerCompactPanel}>
                            <div>
                              <h3>Pending approval</h3>
                              <p className={styles.muted}>
                                Review public trip interest before people become
                                active participants.
                              </p>
                            </div>
                            <div className={styles.compactParticipantList}>
                              {pendingApprovalParticipants.map(
                                (participant) => (
                                  <article
                                    key={participant.id}
                                    className={styles.compactParticipantRow}
                                  >
                                    <div>
                                      <strong>
                                        {participant.full_name ||
                                          participant.email}
                                      </strong>
                                      <p>
                                        {participant.email} ·{" "}
                                        {getParticipantMembershipLabel(
                                          participant,
                                        )}
                                      </p>
                                      {participant.request_message ? (
                                        <small>
                                          {participant.request_message}
                                        </small>
                                      ) : null}
                                    </div>
                                    <div className={styles.compactRowActions}>
                                      <button
                                        type="button"
                                        className={styles.primaryAction}
                                        onClick={() =>
                                          void handleReviewParticipant(
                                            participant.id,
                                            "approve_participant",
                                          )
                                        }
                                        disabled={
                                          reviewingParticipantId ===
                                          participant.id
                                        }
                                      >
                                        Approve
                                      </button>
                                      <button
                                        type="button"
                                        className={styles.secondaryAction}
                                        onClick={() =>
                                          void handleReviewParticipant(
                                            participant.id,
                                            "decline_participant",
                                          )
                                        }
                                        disabled={
                                          reviewingParticipantId ===
                                          participant.id
                                        }
                                      >
                                        Decline
                                      </button>
                                    </div>
                                  </article>
                                ),
                              )}
                              {pendingApprovalParticipants.length === 0 ? (
                                <p className={styles.emptyStateSmall}>
                                  No requests are waiting right now.
                                </p>
                              ) : null}
                            </div>
                          </section>
                        ) : null}

                        {participantDrawerTab === "travellers" ? (
                          <section className={styles.ownerCompactPanel}>
                            <div>
                              <h3>Travellers</h3>
                              <p className={styles.muted}>
                                Everyone currently connected to this trip.
                              </p>
                            </div>
                            <div className={styles.compactParticipantList}>
                              {participants.map((participant) => (
                                <article
                                  key={participant.id}
                                  className={styles.compactParticipantRow}
                                >
                                  <div>
                                    <strong>
                                      {participant.full_name ||
                                        participant.email}
                                    </strong>
                                    <p>
                                      {participant.email} ·{" "}
                                      {getAttendanceStatusLabel(
                                        participant.attendance_status,
                                      )}
                                    </p>
                                  </div>
                                  <span className={styles.badge}>
                                    {getParticipantMembershipLabel(participant)}
                                  </span>
                                </article>
                              ))}
                              {participants.length === 0 ? (
                                <p className={styles.emptyStateSmall}>
                                  No participants have been added yet.
                                </p>
                              ) : null}
                            </div>
                          </section>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </aside>
              </div>
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
      <PlaceDetailsModal place={selectedPlaceDetails} onClose={() => setSelectedPlaceDetails(null)} />
      {voteFeedback ? (
        <div key={voteFeedback.id} className={styles.tripVoteFeedback} role="status" aria-live="polite">
          <div className={styles.tripVoteStars} aria-hidden="true">
            {Array.from({ length: 10 }, (_, index) => <FiStar key={index} />)}
          </div>
          <span className={voteFeedback.direction === "up" ? styles.tripVoteFeedbackUp : styles.tripVoteFeedbackDown}>
            {voteFeedback.direction === "up" ? <FiThumbsUp /> : <FiThumbsDown />}
          </span>
          <strong>{voteFeedback.removed ? "Vote removed" : voteFeedback.direction === "up" ? "Upvote saved" : "Downvote saved"}</strong>
          <small>{voteFeedback.removed ? "Your choice has been updated" : "Your choice is saved"}</small>
        </div>
      ) : null}
      {showTestingAccessLog && !testingAccessLogOpen ? (
        <button
          type="button"
          className={styles.testingAccessLogButton}
          onClick={() => setTestingAccessLogOpen(true)}
        >
          Console
        </button>
      ) : null}
    </>
  );
}
