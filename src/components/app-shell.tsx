"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CSSProperties, ChangeEvent, PointerEvent as ReactPointerEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  FiBell,
  FiChevronDown,
  FiCreditCard,
  FiHome,
  FiLogOut,
  FiMapPin,
  FiMenu,
  FiPlusCircle,
  FiSend,
  FiSettings,
  FiUser,
  FiUsers,
  FiX,
} from "react-icons/fi";
import { Menu, MenuItem, Sidebar } from "react-pro-sidebar";
import { hasStoredActiveSubscription } from "@/lib/auth/routing";
import {
  clampProfilePosition,
  profileBackgroundPatterns,
  resolveProfileBackgroundStyle,
} from "@/lib/profile-card";
import { supabase } from "@/lib/supabase/client";
import { UpgradePlanModal } from "./upgrade-plan-modal";
import styles from "./app-shell.module.css";

type Plan = "free" | "pro_organiser";

type ShellState = {
  userId: string | null;
  email: string;
  fullName: string;
  bio: string;
  avatarUrl: string;
  backgroundUrl: string;
  backgroundPattern: string;
  avatarPositionX: number;
  avatarPositionY: number;
  backgroundPositionX: number;
  backgroundPositionY: number;
  loading: boolean;
  plan: Plan;
  subscriptionStatus: string | null;
  isPro: boolean;
  profileComplete: boolean;
};

type AppShellProps = {
  kicker?: string;
  title: string;
  intro?: string;
  children: (state: ShellState) => ReactNode;
  headerBadge?: string;
  headerAction?: ReactNode;
};

const navLinks = [
  { label: "Dashboard", href: "/dashboard", icon: <FiHome />, tourClass: "journi-tour-dashboard" },
  { label: "Start a trip", href: "/trip-organiser", icon: <FiPlusCircle />, tourClass: "journi-tour-start-trip" },
  { label: "My trips", href: "/trips", icon: <FiMapPin />, tourClass: "journi-tour-my-trips" },
  { label: "Trip invites", href: "/trip-invites", icon: <FiSend /> },
  { label: "My connections", href: "/my-connections", icon: <FiUsers /> },
  { label: "My expenses", href: "/my-expenses", icon: <FiCreditCard /> },
];

const testNotifications = [
  {
    id: "trip-vote",
    title: "New votes on Lisbon getaway",
    detail: "Two travellers just voted on hotels and activities.",
    time: "2m ago",
  },
  {
    id: "invite-accepted",
    title: "Trip invite accepted",
    detail: "Sophie accepted your invitation to Mallorca Summer Escape.",
    time: "18m ago",
  },
  {
    id: "profile-reminder",
    title: "Finish your profile card",
    detail: "Add your background and profile photo to complete your card.",
    time: "Today",
  },
];

export function AppShell({
  kicker,
  title,
  intro,
  children,
  headerBadge,
  headerAction,
}: AppShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [backgroundUrl, setBackgroundUrl] = useState("");
  const [backgroundPattern, setBackgroundPattern] = useState("");
  const [avatarPositionX, setAvatarPositionX] = useState(50);
  const [avatarPositionY, setAvatarPositionY] = useState(50);
  const [backgroundPositionX, setBackgroundPositionX] = useState(50);
  const [backgroundPositionY, setBackgroundPositionY] = useState(50);
  const [plan, setPlan] = useState<Plan>("free");
  const [loading, setLoading] = useState(true);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [profilePromptName, setProfilePromptName] = useState("");
  const [profilePromptBio, setProfilePromptBio] = useState("");
  const [profilePromptAvatarUrl, setProfilePromptAvatarUrl] = useState("");
  const [profilePromptBackgroundUrl, setProfilePromptBackgroundUrl] = useState("");
  const [profilePromptBackgroundPattern, setProfilePromptBackgroundPattern] = useState("");
  const [profilePromptAvatarPositionX, setProfilePromptAvatarPositionX] = useState(50);
  const [profilePromptAvatarPositionY, setProfilePromptAvatarPositionY] = useState(50);
  const [profilePromptBackgroundPositionX, setProfilePromptBackgroundPositionX] = useState(50);
  const [profilePromptBackgroundPositionY, setProfilePromptBackgroundPositionY] = useState(50);
  const [profilePromptSaving, setProfilePromptSaving] = useState(false);
  const [profilePromptUploadingAvatar, setProfilePromptUploadingAvatar] = useState(false);
  const [profilePromptUploadingBackground, setProfilePromptUploadingBackground] = useState(false);
  const [profilePromptDraggingAvatar, setProfilePromptDraggingAvatar] = useState(false);
  const [profilePromptDraggingBackground, setProfilePromptDraggingBackground] = useState(false);
  const [profilePromptError, setProfilePromptError] = useState<string | null>(null);
  const [profilePromptDismissed, setProfilePromptDismissed] = useState(false);
  const [profilePromptOpen, setProfilePromptOpen] = useState(false);
  const [profilePromptClosing, setProfilePromptClosing] = useState(false);
  const [celebrationActive, setCelebrationActive] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const backgroundInputRef = useRef<HTMLInputElement | null>(null);
  const profilePromptAvatarStageRef = useRef<HTMLDivElement | null>(null);
  const profilePromptBackgroundStageRef = useRef<HTMLDivElement | null>(null);
  const introTourActiveRef = useRef(false);
  const profileComplete = Boolean(
    fullName.trim() &&
      bio.trim() &&
      avatarUrl.trim() &&
      (backgroundUrl.trim() || backgroundPattern.trim()),
  );

  useEffect(() => {
    let mounted = true;

    function applyUser(user: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"]) {
      if (!mounted) {
        return;
      }

      if (!user) {
        setEmail("");
        setUserId(null);
        setFullName("");
        setBio("");
        setAvatarUrl("");
        setBackgroundUrl("");
        setBackgroundPattern("");
        setAvatarPositionX(50);
        setAvatarPositionY(50);
        setBackgroundPositionX(50);
        setBackgroundPositionY(50);
        setPlan("free");
        setSubscriptionStatus(null);
        setLoading(false);
        if (typeof window !== "undefined" && window.location.pathname !== "/signin") {
          window.location.replace("/signin");
        }
        return;
      }

      setEmail(user.email ?? "");
      setUserId(user.id);
      setFullName(
        typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : "",
      );
      setBio(typeof user.user_metadata?.bio === "string" ? user.user_metadata.bio : "");
      setAvatarUrl(
        typeof user.user_metadata?.avatar_url === "string" ? user.user_metadata.avatar_url : "",
      );
      setBackgroundUrl(
        typeof user.user_metadata?.profile_background_url === "string"
          ? user.user_metadata.profile_background_url
          : "",
      );
      setBackgroundPattern(
        typeof user.user_metadata?.profile_background_pattern === "string"
          ? user.user_metadata.profile_background_pattern
          : "",
      );
      setAvatarPositionX(
        typeof user.user_metadata?.avatar_position_x === "number"
          ? clampProfilePosition(user.user_metadata.avatar_position_x)
          : 50,
      );
      setAvatarPositionY(
        typeof user.user_metadata?.avatar_position_y === "number"
          ? clampProfilePosition(user.user_metadata.avatar_position_y)
          : 50,
      );
      setBackgroundPositionX(
        typeof user.user_metadata?.background_position_x === "number"
          ? clampProfilePosition(user.user_metadata.background_position_x)
          : 50,
      );
      setBackgroundPositionY(
        typeof user.user_metadata?.background_position_y === "number"
          ? clampProfilePosition(user.user_metadata.background_position_y)
          : 50,
      );
      setProfilePromptName(
        typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : "",
      );
      setProfilePromptBio(typeof user.user_metadata?.bio === "string" ? user.user_metadata.bio : "");
      setProfilePromptAvatarUrl(
        typeof user.user_metadata?.avatar_url === "string" ? user.user_metadata.avatar_url : "",
      );
      setProfilePromptBackgroundUrl(
        typeof user.user_metadata?.profile_background_url === "string"
          ? user.user_metadata.profile_background_url
          : "",
      );
      setProfilePromptBackgroundPattern(
        typeof user.user_metadata?.profile_background_pattern === "string"
          ? user.user_metadata.profile_background_pattern
          : "",
      );
      setProfilePromptAvatarPositionX(
        typeof user.user_metadata?.avatar_position_x === "number"
          ? clampProfilePosition(user.user_metadata.avatar_position_x)
          : 50,
      );
      setProfilePromptAvatarPositionY(
        typeof user.user_metadata?.avatar_position_y === "number"
          ? clampProfilePosition(user.user_metadata.avatar_position_y)
          : 50,
      );
      setProfilePromptBackgroundPositionX(
        typeof user.user_metadata?.background_position_x === "number"
          ? clampProfilePosition(user.user_metadata.background_position_x)
          : 50,
      );
      setProfilePromptBackgroundPositionY(
        typeof user.user_metadata?.background_position_y === "number"
          ? clampProfilePosition(user.user_metadata.background_position_y)
          : 50,
      );
      const userHasMinimumProfileDetails = Boolean(
        typeof user.user_metadata?.full_name === "string" &&
          user.user_metadata.full_name.trim() &&
          typeof user.user_metadata?.bio === "string" &&
          user.user_metadata.bio.trim(),
      );
      const userProfileComplete = Boolean(
        typeof user.user_metadata?.full_name === "string" &&
          user.user_metadata.full_name.trim() &&
          typeof user.user_metadata?.bio === "string" &&
          user.user_metadata.bio.trim() &&
          typeof user.user_metadata?.avatar_url === "string" &&
          user.user_metadata.avatar_url.trim() &&
          ((typeof user.user_metadata?.profile_background_url === "string" &&
            user.user_metadata.profile_background_url.trim()) ||
            (typeof user.user_metadata?.profile_background_pattern === "string" &&
              user.user_metadata.profile_background_pattern.trim())),
      );
      setProfilePromptDismissed(userHasMinimumProfileDetails && !userProfileComplete);
      setPlan(user.user_metadata?.plan === "pro_organiser" ? "pro_organiser" : "free");
      setSubscriptionStatus(
        user.user_metadata?.subscription_status ??
          (hasStoredActiveSubscription(user) ? "active" : null),
      );

      const userPlan = user.user_metadata?.plan === "pro_organiser" ? "pro_organiser" : "free";
      const userSubscriptionStatus =
        user.user_metadata?.subscription_status ??
        (hasStoredActiveSubscription(user) ? "active" : null);

      if (user.email && (userPlan !== "pro_organiser" || userSubscriptionStatus !== "active")) {
        void fetch("/api/stripe/subscription-status", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: user.email,
          }),
        })
          .then((response) => response.json())
          .then(
            async (result: {
              isPro?: boolean;
              status?: string;
              customerId?: string;
              subscriptionId?: string;
            }) => {
              if (!mounted || !result.isPro) {
                return;
              }

              const { data } = await supabase.auth.updateUser({
                data: {
                  ...user.user_metadata,
                  plan: "pro_organiser",
                  subscription_status: "active",
                  stripe_customer_id: result.customerId,
                  stripe_subscription_id: result.subscriptionId,
                  stripe_subscription_status: result.status,
                },
              });

              const updatedUser = data.user;

              if (!mounted || !updatedUser) {
                return;
              }

              setPlan("pro_organiser");
              setSubscriptionStatus("active");
            },
          )
          .catch((error) => {
            console.warn("[Journi Billing] Unable to sync subscription status", error);
          });
      }

      void fetch("/api/travellers/claim", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: user.id,
          email: user.email ?? "",
        }),
      });

      setLoading(false);
    }

    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      applyUser(user);
    }

    void loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      applyUser(session?.user ?? null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    function handleOpenProfileCard() {
      setProfilePromptError(null);
      setProfilePromptClosing(false);
      setProfilePromptOpen(true);
      setProfileOpen(false);
      setNotificationsOpen(false);
    }

    window.addEventListener("journi:open-profile-card", handleOpenProfileCard);
    return () => window.removeEventListener("journi:open-profile-card", handleOpenProfileCard);
  }, []);

  useEffect(() => {
    function handleDebugStartTour() {
      void startIntroTour(true);
    }

    window.addEventListener("journi:debug-start-tour", handleDebugStartTour);
    return () => window.removeEventListener("journi:debug-start-tour", handleDebugStartTour);
  }, [userId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const debugWindow = window as typeof window & {
      __JOURNI_DEV__?: {
        openProfileCard: () => void;
        startTour: () => void;
      };
    };

    debugWindow.__JOURNI_DEV__ = {
      openProfileCard: () => {
        window.dispatchEvent(new CustomEvent("journi:open-profile-card"));
      },
      startTour: () => {
        window.dispatchEvent(new CustomEvent("journi:debug-start-tour"));
      },
    };
  }, []);

  useEffect(() => {
    function handleCelebrationVisibility(event: Event) {
      const detail =
        event instanceof CustomEvent ? (event.detail as { active?: boolean } | undefined) : undefined;

      setCelebrationActive(Boolean(detail?.active));
    }

    window.addEventListener("journi:celebration-visibility", handleCelebrationVisibility);
    return () =>
      window.removeEventListener("journi:celebration-visibility", handleCelebrationVisibility);
  }, []);

  function getIntroTourStorageKey(nextUserId: string) {
    return `journi-intro-tour-complete:${nextUserId}`;
  }

  function closeProfilePromptWithFade(onClosed?: () => void) {
    setProfilePromptClosing(true);

    window.setTimeout(() => {
      onClosed?.();
      setProfilePromptClosing(false);
    }, 320);
  }

  async function startIntroTour(force = false) {
    if (!userId || introTourActiveRef.current) {
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    const storageKey = getIntroTourStorageKey(userId);
    if (!force && window.localStorage.getItem(storageKey) === "true") {
      return;
    }

    const rawSteps = [
      {
        element: ".journi-tour-profile-card",
        intro: "This is your profile card area. Come back here any time to update how travellers see you.",
      },
      {
        element: ".journi-tour-notifications",
        intro: "Your notifications dropdown will show invites, votes, and planning updates.",
      },
      {
        element: ".journi-tour-start-trip",
        intro: "Use Start a trip to build a new trip hub from scratch.",
      },
      {
        element: ".journi-tour-my-trips",
        intro: "My trips keeps together trips you organise and trips you’ve joined as a participant.",
      },
      {
        element: ".journi-tour-account-menu",
        intro: "Open your account menu for subscription, profile, and settings shortcuts.",
      },
    ].filter((step) => document.querySelector(step.element));

    if (!rawSteps.length) {
      return;
    }

    const introModule = await import("intro.js");
    const introFactory = (introModule as { default?: unknown }).default ?? introModule;
    const intro =
      typeof (introFactory as { tour?: () => unknown }).tour === "function"
        ? (introFactory as { tour: () => { setOptions: (options: unknown) => void; onComplete: (callback: () => void) => void; onExit: (callback: () => void) => void; start: () => void } }).tour()
        : (introFactory as () => { setOptions: (options: unknown) => void; onComplete: (callback: () => void) => void; onExit: (callback: () => void) => void; start: () => void })();

    introTourActiveRef.current = true;

    const completeTour = () => {
      introTourActiveRef.current = false;
      window.localStorage.setItem(storageKey, "true");
    };

    intro.setOptions({
      steps: rawSteps,
      showProgress: true,
      showBullets: false,
      tooltipClass: "journiIntroTooltip",
      highlightClass: "journiIntroHighlight",
      nextLabel: "Next",
      prevLabel: "Back",
      doneLabel: "Got it",
      skipLabel: "Skip",
      exitOnOverlayClick: true,
    });
    intro.onComplete(completeTour);
    intro.onExit(completeTour);
    intro.start();
  }

  useEffect(() => {
    if (
      loading ||
      !userId ||
      !profileComplete ||
      pathname === "/profile" ||
      profilePromptOpen ||
      profilePromptClosing ||
      celebrationActive
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void startIntroTour(false);
    }, 350);

    return () => window.clearTimeout(timeoutId);
  }, [celebrationActive, loading, pathname, profileComplete, profilePromptClosing, profilePromptOpen, userId]);

  useEffect(() => {
    function handleProfileSaved(event: Event) {
      const detail =
        event instanceof CustomEvent ? (event.detail as { profileComplete?: boolean } | undefined) : undefined;

      if (!detail?.profileComplete) {
        return;
      }

      window.setTimeout(() => {
        if (celebrationActive) {
          return;
        }

        void startIntroTour(true);
      }, 350);
    }

    window.addEventListener("journi:profile-saved", handleProfileSaved);
    return () => window.removeEventListener("journi:profile-saved", handleProfileSaved);
  }, [celebrationActive, userId]);

  useEffect(() => {
    if (loading) {
      return;
    }

    const checkoutComplete = searchParams.get("checkout") === "complete";
    const checkoutProduct = searchParams.get("product");
    const isReturningFromProCheckout =
      pathname === "/dashboard" && checkoutComplete && checkoutProduct === "pro_organiser";

    if (isReturningFromProCheckout) {
      return;
    }

    if (plan === "pro_organiser" && subscriptionStatus !== "active") {
      router.replace("/signup/pro-organiser/payment");
      router.refresh();
    }
  }, [loading, pathname, plan, searchParams, subscriptionStatus, router]);

  async function handleLogout() {
    setProfileOpen(false);
    setNotificationsOpen(false);
    await supabase.auth.signOut({ scope: "local" });
    window.location.href = "/signin";
  }

  const isPro = useMemo(
    () => plan === "pro_organiser" && subscriptionStatus === "active",
    [plan, subscriptionStatus],
  );

  const shellState: ShellState = {
    userId,
    email,
    fullName,
    bio,
    avatarUrl,
    backgroundUrl,
    backgroundPattern,
    avatarPositionX,
    avatarPositionY,
    backgroundPositionX,
    backgroundPositionY,
    loading,
    plan,
    subscriptionStatus,
    isPro,
    profileComplete,
  };

  const profilePromptFullyComplete = Boolean(
    profilePromptName.trim() &&
      profilePromptBio.trim() &&
      profilePromptAvatarUrl.trim() &&
      (profilePromptBackgroundUrl.trim() || profilePromptBackgroundPattern.trim()),
  );

  const planLabel =
    plan === "pro_organiser"
      ? subscriptionStatus === "active"
        ? "Pro organiser"
        : "Pro organiser pending"
      : "Free plan";
  const avatarSource = fullName || email || "J";
  const avatarLetter = avatarSource.trim().charAt(0).toUpperCase();

  async function uploadProfileAsset(
    file: File,
    kind: "avatar" | "background",
  ) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error("You need to be signed in before uploading profile images.");
    }

    const extension = file.name.split(".").pop() || "jpg";
    const filePath = `profiles/${user.id}/${kind}-${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await supabase.storage.from("trip-images").upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
    });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const { data } = supabase.storage.from("trip-images").getPublicUrl(filePath);
    return data.publicUrl;
  }

  async function handleProfileAssetSelected(
    event: ChangeEvent<HTMLInputElement>,
    kind: "avatar" | "background",
  ) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setProfilePromptError(null);

    if (kind === "avatar") {
      setProfilePromptUploadingAvatar(true);
    } else {
      setProfilePromptUploadingBackground(true);
    }

    try {
      const publicUrl = await uploadProfileAsset(file, kind);

      if (kind === "avatar") {
        setProfilePromptAvatarUrl(publicUrl);
        setProfilePromptAvatarPositionX(50);
        setProfilePromptAvatarPositionY(50);
      } else {
        setProfilePromptBackgroundUrl(publicUrl);
        setProfilePromptBackgroundPattern("");
        setProfilePromptBackgroundPositionX(50);
        setProfilePromptBackgroundPositionY(50);
      }
    } catch (error) {
      setProfilePromptError(
        error instanceof Error ? error.message : "Unable to upload the selected image.",
      );
    } finally {
      if (kind === "avatar") {
        setProfilePromptUploadingAvatar(false);
      } else {
        setProfilePromptUploadingBackground(false);
      }

      event.target.value = "";
    }
  }

  async function handleProfileAssetDrop(file: File, kind: "avatar" | "background") {
    setProfilePromptError(null);

    if (kind === "avatar") {
      setProfilePromptUploadingAvatar(true);
    } else {
      setProfilePromptUploadingBackground(true);
    }

    try {
      const publicUrl = await uploadProfileAsset(file, kind);

      if (kind === "avatar") {
        setProfilePromptAvatarUrl(publicUrl);
        setProfilePromptAvatarPositionX(50);
        setProfilePromptAvatarPositionY(50);
      } else {
        setProfilePromptBackgroundUrl(publicUrl);
        setProfilePromptBackgroundPattern("");
        setProfilePromptBackgroundPositionX(50);
        setProfilePromptBackgroundPositionY(50);
      }
    } catch (error) {
      setProfilePromptError(
        error instanceof Error ? error.message : "Unable to upload the selected image.",
      );
    } finally {
      if (kind === "avatar") {
        setProfilePromptUploadingAvatar(false);
        setProfilePromptDraggingAvatar(false);
      } else {
        setProfilePromptUploadingBackground(false);
        setProfilePromptDraggingBackground(false);
      }
    }
  }

  async function handleProfilePromptSave() {
    setProfilePromptError(null);

    if (!profilePromptName.trim()) {
      setProfilePromptError("Add your name first.");
      return;
    }

    if (!profilePromptBio.trim()) {
      setProfilePromptError("Add a short bio so people know who you are.");
      return;
    }

    setProfilePromptSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data, error } = await supabase.auth.updateUser({
      data: {
        ...(user?.user_metadata ?? {}),
        full_name: profilePromptName.trim(),
        bio: profilePromptBio.trim(),
        avatar_url: profilePromptAvatarUrl,
        profile_background_url: profilePromptBackgroundUrl,
        profile_background_pattern: profilePromptBackgroundPattern || null,
        avatar_position_x: profilePromptAvatarPositionX,
        avatar_position_y: profilePromptAvatarPositionY,
        background_position_x: profilePromptBackgroundPositionX,
        background_position_y: profilePromptBackgroundPositionY,
      },
    });

    if (error) {
      setProfilePromptError(error.message);
      setProfilePromptSaving(false);
      return;
    }

    const updatedUser = data.user;

    setFullName(
      typeof updatedUser?.user_metadata?.full_name === "string"
        ? updatedUser.user_metadata.full_name
        : profilePromptName.trim(),
    );
    setBio(
      typeof updatedUser?.user_metadata?.bio === "string"
        ? updatedUser.user_metadata.bio
        : profilePromptBio.trim(),
    );
    setAvatarUrl(
      typeof updatedUser?.user_metadata?.avatar_url === "string"
        ? updatedUser.user_metadata.avatar_url
        : profilePromptAvatarUrl,
    );
    setBackgroundUrl(
      typeof updatedUser?.user_metadata?.profile_background_url === "string"
        ? updatedUser.user_metadata.profile_background_url
        : profilePromptBackgroundUrl,
    );
    setBackgroundPattern(
      typeof updatedUser?.user_metadata?.profile_background_pattern === "string"
        ? updatedUser.user_metadata.profile_background_pattern
        : profilePromptBackgroundPattern,
    );
    setAvatarPositionX(profilePromptAvatarPositionX);
    setAvatarPositionY(profilePromptAvatarPositionY);
    setBackgroundPositionX(profilePromptBackgroundPositionX);
    setBackgroundPositionY(profilePromptBackgroundPositionY);
    closeProfilePromptWithFade(() => {
      setProfilePromptDismissed(!profilePromptFullyComplete);
      setProfilePromptOpen(false);
      setProfilePromptSaving(false);

      if (profilePromptFullyComplete) {
        window.setTimeout(() => {
          if (celebrationActive) {
            return;
          }

          void startIntroTour(true);
        }, 150);
      }
    });
  }

  function updatePositionFromPointer(
    event: ReactPointerEvent<HTMLElement>,
    element: HTMLElement | null,
    setX: (value: number) => void,
    setY: (value: number) => void,
  ) {
    if (!element) {
      return;
    }

    const rect = element.getBoundingClientRect();
    const nextX = ((event.clientX - rect.left) / rect.width) * 100;
    const nextY = ((event.clientY - rect.top) / rect.height) * 100;
    setX(clampProfilePosition(nextX));
    setY(clampProfilePosition(nextY));
  }

  const profilePromptBackgroundStyle = resolveProfileBackgroundStyle({
    backgroundUrl: profilePromptBackgroundUrl,
    backgroundPattern: profilePromptBackgroundPattern,
    backgroundPositionX: profilePromptBackgroundPositionX,
    backgroundPositionY: profilePromptBackgroundPositionY,
  });

  const profilePromptAvatarStyle = profilePromptAvatarUrl
    ? ({
        objectPosition: `${profilePromptAvatarPositionX}% ${profilePromptAvatarPositionY}%`,
      } as CSSProperties)
    : undefined;
  const showProfilePrompt =
    !loading &&
    userId &&
    pathname !== "/profile" &&
    !celebrationActive &&
    (profilePromptOpen || (!profileComplete && !profilePromptDismissed));
  const renderProfilePrompt = showProfilePrompt || profilePromptClosing;
  const isManualProfilePrompt = profilePromptOpen;

  if (!loading && !userId) {
    return null;
  }

  return (
    <main className={styles.page}>
      <div className={styles.shellFrame}>
        <div className={styles.environmentBanner}>
          <strong>MVP status</strong>
          <span>
            Journi is currently in MVP production stage. Features and flows are still being
            refined.
          </span>
        </div>

        <div className={sidebarCollapsed ? styles.appShellCollapsed : styles.appShell}>
          <Sidebar
          collapsed={sidebarCollapsed}
          width="290px"
          collapsedWidth="96px"
          transitionDuration={260}
          rootStyles={{
            backgroundColor: "transparent",
            borderRight: "1px solid rgba(255, 255, 255, 0.06)",
            height: "100vh",
          }}
          className={sidebarCollapsed ? styles.sidebarCollapsed : styles.sidebar}
        >
          <div className={styles.sidebarTop}>
            <button
              type="button"
              className={sidebarCollapsed ? styles.menuButtonCollapsed : styles.menuButton}
              onClick={() => setSidebarCollapsed((current) => !current)}
              aria-label={sidebarCollapsed ? "Open sidebar" : "Collapse sidebar"}
            >
              {sidebarCollapsed ? <FiMenu /> : <FiX />}
            </button>
          </div>

            <div className={styles.sidebarBody}>
            <div
              className={`${sidebarCollapsed ? styles.sidebarProfileButtonCollapsed : styles.sidebarProfileButton} journi-tour-profile-card`}
              role="button"
              tabIndex={0}
              onClick={() => {
                setProfilePromptError(null);
                setProfilePromptOpen(true);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setProfilePromptError(null);
                  setProfilePromptOpen(true);
                }
              }}
            >
              <div
                className={sidebarCollapsed ? styles.sidebarProfileCollapsed : styles.sidebarProfile}
              >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt=""
                  className={sidebarCollapsed ? styles.sidebarAvatarImageCollapsed : styles.sidebarAvatarImage}
                />
              ) : (
                <span className={sidebarCollapsed ? styles.sidebarAvatarCollapsed : styles.sidebarAvatar}>
                  {loading ? "…" : avatarLetter}
                </span>
              )}
              {sidebarCollapsed ? null : (
                <div className={styles.sidebarProfileMeta}>
                  <p className={styles.sidebarProfileName}>
                    {loading ? "Loading..." : fullName || "Journi organiser"}
                  </p>
                  <p className={styles.sidebarProfileEmail}>{loading ? "" : email || "No email yet"}</p>
                  <span className={styles.sidebarProfilePlan}>{loading ? "..." : planLabel}</span>
                </div>
              )}
              </div>
            </div>

            <div className={styles.sidebarDivider} />

            <Menu
              className={sidebarCollapsed ? styles.sidebarNavCollapsed : styles.sidebarNav}
              menuItemStyles={{
                button: ({ active }) => ({
                  minHeight: sidebarCollapsed ? 48 : 44,
                  width: sidebarCollapsed ? 48 : "100%",
                  borderRadius: sidebarCollapsed ? 18 : 16,
                  marginBottom: sidebarCollapsed ? 12 : 10,
                  marginInline: sidebarCollapsed ? "auto" : "0",
                  paddingInline: sidebarCollapsed ? 0 : 14,
                  color: active ? "#0f4e8a" : "rgba(255,255,255,0.96)",
                  backgroundColor: active ? "rgba(255,255,255,0.96)" : "rgba(255,255,255,0.08)",
                  justifyContent: sidebarCollapsed ? "center" : "flex-start",
                  transition: "all 180ms ease",
                }),
                icon: {
                  color: "currentColor",
                  fontSize: "16px",
                  marginInlineEnd: sidebarCollapsed ? 0 : 10,
                  minWidth: sidebarCollapsed ? "auto" : "16px",
                },
                label: {
                  fontWeight: 700,
                  fontSize: "0.9rem",
                },
              }}
            >
              {navLinks.map((item) => (
                <MenuItem
                  key={item.href}
                  active={pathname === item.href}
                  icon={item.icon}
                  title={sidebarCollapsed ? item.label : undefined}
                  onClick={() => router.push(item.href)}
                >
                  <div
                    className={
                      `${sidebarCollapsed ? styles.navItemMainCollapsed : styles.navItemMain} ${item.tourClass ?? ""}`
                    }
                  >
                    <span>{item.label}</span>
                  </div>
                </MenuItem>
              ))}
            </Menu>

            <div className={styles.sidebarBottom}>
              <div className={styles.sidebarDivider} />

              <button
                type="button"
                className={sidebarCollapsed ? styles.sidebarLogoutCollapsed : styles.sidebarLogout}
                onClick={handleLogout}
                title={sidebarCollapsed ? "Log out" : undefined}
              >
                <FiLogOut />
                {sidebarCollapsed ? null : <span>Log out</span>}
              </button>
            </div>
          </div>
        </Sidebar>

          <section className={styles.mainPanel}>
            <header className={styles.topNav}>
            <Link href="/dashboard" className={styles.topLogo}>
              <Image
                src="/journi-logo-app.png"
                alt="Journi"
                width={220}
                height={78}
                className={styles.topLogoImage}
                priority
              />
            </Link>

            <div className={styles.topActions}>
              <div className={styles.notificationsMenu}>
                <button
                  type="button"
                  className={`${styles.notificationButton} journi-tour-notifications`}
                  onClick={() => {
                    setNotificationsOpen((current) => !current);
                    setProfileOpen(false);
                  }}
                  aria-expanded={notificationsOpen}
                  aria-label="Open notifications"
                >
                  <FiBell />
                  <span className={styles.notificationBadge}>{testNotifications.length}</span>
                </button>

                {notificationsOpen ? (
                  <div className={styles.notificationsDropdown}>
                    <div className={styles.notificationsHeader}>
                      <div>
                        <p className={styles.notificationsTitle}>Notifications</p>
                        <p className={styles.notificationsMeta}>
                          {testNotifications.length} new updates
                        </p>
                      </div>
                    </div>

                    <div className={styles.notificationsList}>
                      {testNotifications.map((notification) => (
                        <button
                          key={notification.id}
                          type="button"
                          className={styles.notificationItem}
                          onClick={() => setNotificationsOpen(false)}
                        >
                          <span className={styles.notificationDot} />
                          <span className={styles.notificationCopy}>
                            <span className={styles.notificationItemTitle}>
                              {notification.title}
                            </span>
                            <span className={styles.notificationItemDetail}>
                              {notification.detail}
                            </span>
                          </span>
                          <span className={styles.notificationTime}>{notification.time}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className={styles.profileMenu}>
                <button
                  type="button"
                  className={`${styles.profileButton} journi-tour-account-menu`}
                  onClick={() => {
                    setProfileOpen((current) => !current);
                    setNotificationsOpen(false);
                  }}
                  aria-expanded={profileOpen}
                  aria-label="Open profile menu"
                >
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className={styles.avatarImage} />
                  ) : (
                    <span className={styles.avatar}>{loading ? "…" : avatarLetter}</span>
                  )}
                  <span className={styles.profileButtonMeta}>
                      <span className={styles.profileButtonText}>
                      {loading ? "Loading..." : fullName || email || "Journi organiser"}
                      </span>
                    <span className={styles.profileButtonPlan}>{loading ? "..." : planLabel}</span>
                  </span>
                  <FiChevronDown className={profileOpen ? styles.profileChevronOpen : styles.profileChevron} />
                </button>

                {profileOpen ? (
                  <div className={styles.profileDropdown}>
                    <div className={styles.profileDropdownHeader}>
                      {avatarUrl ? (
                        <img src={avatarUrl} alt="" className={styles.avatarLargeImage} />
                      ) : (
                        <span className={styles.avatarLarge}>{loading ? "…" : avatarLetter}</span>
                      )}
                      <div>
                        <p className={styles.profileName}>
                          {loading
                            ? "Loading organiser..."
                            : fullName || email || "Journi organiser"}
                        </p>
                        <p className={styles.profilePlan}>{planLabel}</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      className={styles.dropdownItem}
                      onClick={() => {
                        setProfileOpen(false);
                        if (isPro) {
                          router.push("/subscription");
                          return;
                        }

                        setUpgradeOpen(true);
                      }}
                    >
                      <FiChevronDown />
                      <span>{isPro ? "Manage subscription" : "Update plan"}</span>
                    </button>
                    <button
                      type="button"
                      className={styles.dropdownItem}
                      onClick={() => {
                        setProfileOpen(false);
                        router.push("/profile");
                      }}
                    >
                      <FiUser />
                      <span>Profile</span>
                    </button>
                    <button
                      type="button"
                      className={styles.dropdownItem}
                      onClick={() => {
                        setProfileOpen(false);
                        router.push("/settings");
                      }}
                    >
                      <FiSettings />
                      <span>Settings</span>
                    </button>
                    <button type="button" className={styles.dropdownItem} onClick={handleLogout}>
                      <FiX />
                      <span>Log out</span>
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </header>

            <div className={styles.contentScroll}>
            <header className={styles.pageHeader}>
              <div className={styles.pageHeaderLeft}>
                <p className={styles.kicker} suppressHydrationWarning>
                  {kicker ?? ""}
                </p>
                <h1>{loading ? "Loading your workspace..." : title}</h1>
                <p className={styles.intro} suppressHydrationWarning>
                  {intro ?? ""}
                </p>
              </div>

              {headerAction ? headerAction : null}
              {!headerAction && headerBadge ? (
                <span className={styles.headerBadge}>{headerBadge}</span>
              ) : null}
            </header>

            {renderProfilePrompt ? (
              <div
                className={`${styles.profilePromptOverlay} ${
                  profilePromptClosing ? styles.profilePromptOverlayClosing : ""
                }`}
              >
                <section
                  className={`${styles.profilePrompt} ${
                    profilePromptClosing ? styles.profilePromptClosing : ""
                  }`}
                >
                  {isManualProfilePrompt ? (
                    <button
                      type="button"
                      className={styles.profilePromptClose}
                      onClick={() =>
                        closeProfilePromptWithFade(() => {
                          setProfilePromptOpen(false);
                        })
                      }
                      aria-label="Close profile card"
                    >
                      <FiX />
                    </button>
                  ) : null}
                  <div className={styles.profilePromptIntro}>
                    <p className={styles.profilePromptEyebrow}>
                      {isManualProfilePrompt ? "Your profile" : "Complete profile"}
                    </p>
                    <h3>
                      {isManualProfilePrompt ? "Edit your profile card." : "Build your profile card."}
                    </h3>
                    <p>
                      {isManualProfilePrompt
                        ? "Update the card other travellers see across Journi."
                        : "Add the essentials now so your invites, trips, and connections feel personal from the start."}
                    </p>
                  </div>

                  <div className={styles.profilePromptCardPreview}>
                    <div
                      ref={profilePromptBackgroundStageRef}
                      className={
                        profilePromptDraggingBackground
                          ? styles.profilePromptCardCoverDragging
                          : styles.profilePromptCardCover
                      }
                      style={profilePromptBackgroundStyle}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setProfilePromptDraggingBackground(true);
                      }}
                      onDragLeave={() => setProfilePromptDraggingBackground(false)}
                      onDrop={(event) => {
                        event.preventDefault();
                        const file = event.dataTransfer.files?.[0];
                        if (file) {
                          void handleProfileAssetDrop(file, "background");
                        } else {
                          setProfilePromptDraggingBackground(false);
                        }
                      }}
                      onPointerDown={(event) =>
                        updatePositionFromPointer(
                          event,
                          profilePromptBackgroundStageRef.current,
                          setProfilePromptBackgroundPositionX,
                          setProfilePromptBackgroundPositionY,
                        )
                      }
                      onPointerMove={(event) => {
                        if (event.buttons !== 1) {
                          return;
                        }

                        updatePositionFromPointer(
                          event,
                          profilePromptBackgroundStageRef.current,
                          setProfilePromptBackgroundPositionX,
                          setProfilePromptBackgroundPositionY,
                        );
                      }}
                    >
                      {!profilePromptBackgroundUrl && !profilePromptBackgroundPattern ? (
                        <div className={styles.profilePromptCardCoverPlaceholder}>
                          Drop background here or click upload below
                        </div>
                      ) : null}
                    </div>
                    <div className={styles.profilePromptCardBody}>
                      <div
                        className={
                          profilePromptDraggingAvatar
                            ? styles.profilePromptAvatarButtonDragging
                            : styles.profilePromptAvatarButton
                        }
                        ref={profilePromptAvatarStageRef}
                        onDragOver={(event) => {
                          event.preventDefault();
                          setProfilePromptDraggingAvatar(true);
                        }}
                        onDragLeave={() => setProfilePromptDraggingAvatar(false)}
                        onDrop={(event) => {
                          event.preventDefault();
                          const file = event.dataTransfer.files?.[0];
                          if (file) {
                            void handleProfileAssetDrop(file, "avatar");
                          } else {
                            setProfilePromptDraggingAvatar(false);
                          }
                        }}
                        onPointerDown={(event) =>
                          updatePositionFromPointer(
                            event,
                            profilePromptAvatarStageRef.current,
                            setProfilePromptAvatarPositionX,
                            setProfilePromptAvatarPositionY,
                          )
                        }
                        onPointerMove={(event) => {
                          if (event.buttons !== 1) {
                            return;
                          }

                          updatePositionFromPointer(
                            event,
                            profilePromptAvatarStageRef.current,
                            setProfilePromptAvatarPositionX,
                            setProfilePromptAvatarPositionY,
                          );
                        }}
                      >
                        {profilePromptAvatarUrl ? (
                          <img
                            src={profilePromptAvatarUrl}
                            alt=""
                            className={styles.profilePromptAvatarImage}
                            style={profilePromptAvatarStyle}
                          />
                        ) : (
                          <span className={styles.profilePromptAvatarPlaceholder}>
                            {(profilePromptName || email || "J").trim().charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <input
                        type="text"
                        value={profilePromptName}
                        onChange={(event) => setProfilePromptName(event.target.value)}
                        placeholder="Your full name"
                        autoComplete="name"
                        className={styles.profilePromptNameInput}
                      />
                      <textarea
                        value={profilePromptBio}
                        onChange={(event) => setProfilePromptBio(event.target.value)}
                        placeholder="Add a short bio that tells travellers who you are."
                        rows={3}
                        className={styles.profilePromptBioInput}
                      />
                    </div>
                  </div>

                  <div className={styles.profilePromptControls}>
                    <div className={styles.profilePromptControlGroup}>
                      <strong>Background</strong>
                      <div className={styles.profilePromptBackgroundSwitcher}>
                        <button
                          type="button"
                          className={styles.profilePromptCycleButton}
                          onClick={() => {
                            const currentIndex = profileBackgroundPatterns.findIndex(
                              (pattern) => pattern.id === profilePromptBackgroundPattern,
                            );
                            const nextIndex =
                              currentIndex <= 0
                                ? profileBackgroundPatterns.length - 1
                                : currentIndex - 1;
                            const nextPattern = profileBackgroundPatterns[nextIndex];
                            setProfilePromptBackgroundPattern(nextPattern.id);
                            setProfilePromptBackgroundUrl("");
                            setProfilePromptBackgroundPositionX(50);
                            setProfilePromptBackgroundPositionY(50);
                          }}
                          aria-label="Previous background"
                        >
                          ‹
                        </button>
                        <button
                          type="button"
                          className={styles.profilePromptInlineAction}
                          onClick={() => backgroundInputRef.current?.click()}
                          disabled={profilePromptUploadingBackground}
                        >
                          {profilePromptUploadingBackground
                            ? "Uploading..."
                            : profilePromptBackgroundUrl
                              ? "Change uploaded background"
                              : "Upload image"}
                        </button>
                        <button
                          type="button"
                          className={styles.profilePromptCycleButton}
                          onClick={() => {
                            const currentIndex = profileBackgroundPatterns.findIndex(
                              (pattern) => pattern.id === profilePromptBackgroundPattern,
                            );
                            const nextIndex =
                              currentIndex >= profileBackgroundPatterns.length - 1 ? 0 : currentIndex + 1;
                            const nextPattern = profileBackgroundPatterns[nextIndex];
                            setProfilePromptBackgroundPattern(nextPattern.id);
                            setProfilePromptBackgroundUrl("");
                            setProfilePromptBackgroundPositionX(50);
                            setProfilePromptBackgroundPositionY(50);
                          }}
                          aria-label="Next background"
                        >
                          ›
                        </button>
                      </div>
                      <p className={styles.profilePromptHelper}>
                        Drop an image onto the cover, upload your own, or cycle through built-in
                        backgrounds.
                      </p>
                    </div>

                    <div className={styles.profilePromptControlGroup}>
                      <strong>Profile photo</strong>
                      <div className={styles.profilePromptPhotoActions}>
                        <button
                          type="button"
                          className={styles.profilePromptInlineAction}
                          onClick={() => avatarInputRef.current?.click()}
                          disabled={profilePromptUploadingAvatar}
                        >
                          {profilePromptUploadingAvatar
                            ? "Uploading..."
                            : profilePromptAvatarUrl
                              ? "Change photo"
                              : "Upload photo"}
                        </button>
                      </div>
                      <p className={styles.profilePromptHelper}>
                        Drop a photo on the circle, then drag inside it to reposition the crop.
                      </p>
                    </div>

                    <input
                      ref={backgroundInputRef}
                      type="file"
                      accept="image/*"
                      onChange={(event) => void handleProfileAssetSelected(event, "background")}
                      hidden
                    />
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/*"
                      onChange={(event) => void handleProfileAssetSelected(event, "avatar")}
                      hidden
                    />

                    {profilePromptError ? (
                      <p className={styles.profilePromptError}>{profilePromptError}</p>
                    ) : null}
                  </div>

                  <div className={styles.profilePromptActions}>
                    <button
                      type="button"
                      className={styles.profilePromptAction}
                      onClick={() => void handleProfilePromptSave()}
                      disabled={
                        profilePromptSaving ||
                        profilePromptUploadingAvatar ||
                        profilePromptUploadingBackground
                      }
                    >
                      {profilePromptSaving
                        ? "Saving..."
                        : profilePromptFullyComplete
                          ? "Save profile"
                          : "Save and add more later"}
                    </button>
                  </div>
                </section>
              </div>
            ) : null}

            {children(shellState)}
            </div>
          </section>
        </div>
      </div>

      <UpgradePlanModal
        open={upgradeOpen}
        email={email}
        onClose={() => setUpgradeOpen(false)}
      />
    </main>
  );
}
