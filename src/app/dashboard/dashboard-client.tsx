"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import sectionStyles from "@/components/app-page.module.css";
import { storeActiveSubscription } from "@/lib/auth/routing";
import { supabase } from "@/lib/supabase/client";

const celebrationKey = "journi-upgrade-celebration";
const celebrationProductKey = "journi-upgrade-product";

type DashboardTripSummary = {
  trip: {
    id: string;
    title: string;
    destination: string | null;
    status: string;
  };
  summary: {
    phaseLabel: string;
    currentDecision: string;
    leadingOption: string;
    nextAction: string;
    deadlineLabel: string | null;
    latestChange: string;
    confidenceScore: number;
    confidenceMessage: string;
    participantSummary: {
      invited: number;
      responded: number;
      confirmed: number;
      outstanding: number;
    };
  };
  planningCounts: {
    hotels: number;
    activities: number;
    transport: number;
    dining: number;
  };
};

type DashboardSummaryResponse = {
  totals: {
    trips: number;
    outstandingResponses: number;
    readyToDecide: number;
    confirmedParticipants: number;
  };
  trips: DashboardTripSummary[];
  error?: string;
};

function getFirstLoginCelebrationKey(userId: string) {
  return `journi-first-login-celebration:${userId}`;
}

export function DashboardClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const checkoutComplete = searchParams.get("checkout") === "complete";
  const checkoutProduct = searchParams.get("product");
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationClosing, setCelebrationClosing] = useState(false);
  const [celebrationProduct, setCelebrationProduct] = useState<string | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [dashboardSummary, setDashboardSummary] = useState<DashboardSummaryResponse | null>(null);

  useEffect(() => {
    let mounted = true;

    async function markSubscriptionActive() {
      if (!checkoutComplete) {
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!mounted || !user) {
        return;
      }

      if (checkoutProduct === "pro_organiser" || !checkoutProduct) {
        const { data, error } = await supabase.auth.updateUser({
          data: {
            ...user.user_metadata,
            plan: "pro_organiser",
            subscription_status: "active",
          },
        });

        if (!mounted) {
          return;
        }

        storeActiveSubscription(user.email);
        window.sessionStorage.setItem(celebrationKey, "true");
        window.sessionStorage.setItem(celebrationProductKey, "pro_organiser");
        const nextStatus = data.user?.user_metadata?.subscription_status;

        if (nextStatus === "active" || error) {
          router.replace("/dashboard");
          router.refresh();
        }
        return;
      }

      if (checkoutProduct === "trip_pass") {
        window.sessionStorage.setItem(celebrationKey, "true");
        window.sessionStorage.setItem(celebrationProductKey, "trip_pass");
        router.replace("/dashboard");
        router.refresh();
      }
    }

    void markSubscriptionActive();

    return () => {
      mounted = false;
    };
  }, [checkoutComplete, checkoutProduct, router]);

  useEffect(() => {
    let mounted = true;

    async function queueFirstLoginCelebration() {
      if (checkoutComplete) {
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!mounted || !user) {
        return;
      }

      const storageKey = getFirstLoginCelebrationKey(user.id);
      if (window.localStorage.getItem(storageKey) === "true") {
        return;
      }

      window.localStorage.setItem(storageKey, "true");
      window.sessionStorage.setItem(celebrationKey, "true");
      window.sessionStorage.setItem(celebrationProductKey, "welcome");
      setCelebrationClosing(false);
      setCelebrationProduct("welcome");
      setShowCelebration(true);
    }

    void queueFirstLoginCelebration();

    return () => {
      mounted = false;
    };
  }, [checkoutComplete]);

  useEffect(() => {
    const shouldCelebrate =
      checkoutComplete || window.sessionStorage.getItem(celebrationKey) === "true";

    if (!shouldCelebrate) {
      return;
    }

    window.sessionStorage.removeItem(celebrationKey);
    const product = window.sessionStorage.getItem(celebrationProductKey) ?? checkoutProduct;
    window.sessionStorage.removeItem(celebrationProductKey);
    setCelebrationClosing(false);
    setCelebrationProduct(product);
    setShowCelebration(true);
  }, [checkoutComplete, checkoutProduct]);

  useEffect(() => {
    if (!showCelebration) {
      return;
    }

    const closingTimeoutId = window.setTimeout(() => {
      setCelebrationClosing(true);
    }, 3600);

    const timeoutId = window.setTimeout(() => {
      setShowCelebration(false);
      setCelebrationClosing(false);
      setCelebrationProduct(null);
    }, 4000);

    return () => {
      window.clearTimeout(closingTimeoutId);
      window.clearTimeout(timeoutId);
    };
  }, [showCelebration]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("journi:celebration-visibility", {
        detail: {
          active: showCelebration,
        },
      }),
    );

    return () => {
      window.dispatchEvent(
        new CustomEvent("journi:celebration-visibility", {
          detail: {
            active: false,
          },
        }),
      );
    };
  }, [showCelebration]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const debugWindow = window as typeof window & {
      __JOURNI_DEV__?: {
        openProfileCard?: () => void;
        startTour?: () => void;
        showWelcomeMessage?: () => void;
      };
    };

    const current = debugWindow.__JOURNI_DEV__ ?? {};

      debugWindow.__JOURNI_DEV__ = {
      ...current,
      showWelcomeMessage: () => {
        setCelebrationClosing(false);
        setCelebrationProduct("welcome");
        setShowCelebration(true);
      },
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadDashboardSummary() {
      setDashboardLoading(true);
      setDashboardError(null);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) {
        return;
      }

      if (!session?.access_token) {
        setDashboardSummary(null);
        setDashboardLoading(false);
        return;
      }

      const response = await fetch("/api/dashboard/summary", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const result = (await response.json()) as DashboardSummaryResponse;

      if (!mounted) {
        return;
      }

      if (!response.ok) {
        setDashboardSummary(null);
        setDashboardError(result.error || "Unable to load your organiser dashboard.");
        setDashboardLoading(false);
        return;
      }

      setDashboardSummary(result);
      setDashboardLoading(false);
    }

    void loadDashboardSummary();

    return () => {
      mounted = false;
    };
  }, []);

  const intro = useMemo(() => "A quick view of your trip workspace.", []);

  return (
    <AppShell
      kicker="Organiser dashboard"
      title="Welcome to your trip hub."
      intro={intro}
      headerBadge="App home"
    >
      {({ loading, plan, subscriptionStatus, isPro }) => (
        <div className={sectionStyles.stack}>
          {showCelebration ? (
            <div className={sectionStyles.confettiLayer} aria-hidden="true">
              {Array.from({ length: 140 }).map((_, index) => (
                <span
                  key={index}
                  className={sectionStyles.confettiPiece}
                  style={
                    {
                      "--confetti-left": `${(index * 17) % 100}%`,
                      "--confetti-delay": `${(index % 12) * 60}ms`,
                      "--confetti-duration": `${2800 + (index % 9) * 160}ms`,
                      "--confetti-rotate": `${(index % 11) * 22}deg`,
                      "--confetti-drift": `${((index % 5) - 2) * 34}px`,
                    } as CSSProperties
                  }
                />
              ))}
            </div>
          ) : null}

          {showCelebration && celebrationProduct === "pro_organiser" ? (
            <section className={sectionStyles.celebrationCard}>
              <p className={sectionStyles.eyebrow}>Upgrade complete</p>
              <h2>You now have Pro organiser access.</h2>
              <p className={sectionStyles.celebrationCopy}>
                Your account has been upgraded and these features are now live across the app.
              </p>
              <div className={sectionStyles.celebrationFeatureGrid}>
                <article className={sectionStyles.celebrationFeature}>
                  <strong>Unlimited live trips</strong>
                  <span>Publish and manage multiple trip hubs at the same time.</span>
                </article>
                <article className={sectionStyles.celebrationFeature}>
                  <strong>Templates</strong>
                  <span>Reusable planning setups are now available on your organiser account.</span>
                </article>
                <article className={sectionStyles.celebrationFeature}>
                  <strong>Priority support</strong>
                  <span>Faster organiser help is now included with your plan.</span>
                </article>
                <article className={sectionStyles.celebrationFeature}>
                  <strong>Manage subscription</strong>
                  <span>Billing controls are now available from the account menu.</span>
                </article>
              </div>
            </section>
          ) : null}

          {showCelebration && celebrationProduct === "welcome" ? (
            <div
              className={`${sectionStyles.celebrationModalOverlay} ${
                celebrationClosing ? sectionStyles.celebrationModalOverlayClosing : ""
              }`}
            >
              <section
                className={`${sectionStyles.celebrationModal} ${sectionStyles.welcomeCelebrationModal} ${
                  celebrationClosing ? sectionStyles.welcomeCelebrationModalClosing : ""
                }`}
              >
                <p className={sectionStyles.eyebrow}>Welcome to Journi</p>
                <h2>Your trip workspace is ready.</h2>
                <p className={sectionStyles.celebrationCopy}>
                  We’ll help you set up your profile card next, then give you a quick tour so you
                  know where everything lives.
                </p>
              </section>
            </div>
          ) : null}

          {checkoutComplete && checkoutProduct === "pro_organiser" ? (
            <div className={sectionStyles.callout}>
              Payment complete. Your Pro Organiser subscription is now active.
            </div>
          ) : null}

          {plan === "pro_organiser" && subscriptionStatus !== "active" ? (
            <div className={sectionStyles.callout}>
              Your organiser account is set up, but Pro tools stay locked until payment is
              completed.{" "}
              <Link href="/signup/pro-organiser/payment" className={sectionStyles.actionLink}>
                Continue to payment
              </Link>
            </div>
          ) : null}

          {dashboardError ? (
            <section className={sectionStyles.panel}>
              <div className={sectionStyles.emptyState}>
                <p>{dashboardError}</p>
              </div>
            </section>
          ) : null}

          <section className={sectionStyles.grid4}>
            <article className={sectionStyles.metricCard}>
              <p className={sectionStyles.eyebrow}>Trips in motion</p>
              <div className={sectionStyles.metricValue}>
                {dashboardLoading ? "…" : dashboardSummary?.totals.trips ?? 0}
              </div>
              <p className={sectionStyles.metricMeta}>Trips you’re actively steering right now</p>
            </article>
            <article className={sectionStyles.metricCard}>
              <p className={sectionStyles.eyebrow}>Outstanding replies</p>
              <div className={sectionStyles.metricValue}>
                {dashboardLoading ? "…" : dashboardSummary?.totals.outstandingResponses ?? 0}
              </div>
              <p className={sectionStyles.metricMeta}>People who still need a nudge or decision</p>
            </article>
            <article className={sectionStyles.metricCard}>
              <p className={sectionStyles.eyebrow}>Ready to decide</p>
              <div className={sectionStyles.metricValue}>
                {dashboardLoading ? "…" : dashboardSummary?.totals.readyToDecide ?? 0}
              </div>
              <p className={sectionStyles.metricMeta}>Trips where enough responses exist to make the call</p>
            </article>
            <article className={sectionStyles.metricCard}>
              <p className={sectionStyles.eyebrow}>Confirmed travellers</p>
              <div className={sectionStyles.metricValue}>
                {dashboardLoading ? "…" : dashboardSummary?.totals.confirmedParticipants ?? 0}
              </div>
              <p className={sectionStyles.metricMeta}>People currently marked as coming</p>
            </article>
          </section>

          <section className={sectionStyles.split}>
            <article className={sectionStyles.panel}>
              <div className={sectionStyles.sectionTop}>
                <div>
                  <p className={sectionStyles.eyebrow}>Organiser workflow</p>
                  <h2>What Journi says to do next</h2>
                </div>
                <span className={isPro ? sectionStyles.badgeSuccess : sectionStyles.badge}>
                  {loading ? "Loading..." : isPro ? "Pro active" : "Free mode"}
                </span>
              </div>

              {dashboardLoading ? (
                <div className={sectionStyles.emptyState}>
                  <p>Loading trip actions...</p>
                </div>
              ) : dashboardSummary?.trips.length ? (
                <div className={sectionStyles.tripReadinessList}>
                  {dashboardSummary.trips.slice(0, 3).map((item) => (
                    <article key={item.trip.id} className={sectionStyles.tripReadinessCard}>
                      <div className={sectionStyles.tripReadinessHeader}>
                        <div>
                          <p className={sectionStyles.eyebrow}>{item.summary.phaseLabel}</p>
                          <h3>{item.trip.title}</h3>
                        </div>
                        <span className={sectionStyles.tripMetricPill}>
                          {item.summary.confidenceScore}% confidence
                        </span>
                      </div>

                      <div className={sectionStyles.tripQuestionGrid}>
                        <div className={sectionStyles.tripQuestionCard}>
                          <span className={sectionStyles.tripFactLabel}>Decision</span>
                          <strong>{item.summary.currentDecision}</strong>
                        </div>
                        <div className={sectionStyles.tripQuestionCard}>
                          <span className={sectionStyles.tripFactLabel}>Leading option</span>
                          <strong>{item.summary.leadingOption}</strong>
                        </div>
                        <div className={sectionStyles.tripQuestionCard}>
                          <span className={sectionStyles.tripFactLabel}>Outstanding</span>
                          <strong>
                            {item.summary.participantSummary.outstanding > 0
                              ? `${item.summary.participantSummary.outstanding} still to respond`
                              : "No one outstanding"}
                          </strong>
                        </div>
                        <div className={sectionStyles.tripQuestionCard}>
                          <span className={sectionStyles.tripFactLabel}>Next action</span>
                          <strong>{item.summary.nextAction}</strong>
                        </div>
                      </div>

                      <div className={sectionStyles.tripMetricRow}>
                        <span className={sectionStyles.tripMetricPill}>
                          {item.summary.participantSummary.invited} invited
                        </span>
                        <span className={sectionStyles.tripMetricPill}>
                          {item.summary.participantSummary.responded} responded
                        </span>
                        <span className={sectionStyles.tripMetricPill}>
                          {item.summary.participantSummary.confirmed} confirmed
                        </span>
                        {item.summary.deadlineLabel ? (
                          <span className={sectionStyles.tripMetricPill}>{item.summary.deadlineLabel}</span>
                        ) : null}
                      </div>

                      <p className={sectionStyles.metricMeta}>{item.summary.latestChange}</p>
                      <p className={sectionStyles.metricMeta}>{item.summary.confidenceMessage}</p>
                      <Link href={`/trips/${item.trip.id}`} className={sectionStyles.tripSectionToggle}>
                        Open trip →
                      </Link>
                    </article>
                  ))}
                </div>
              ) : (
                <div className={sectionStyles.emptyState}>
                  <p>No live trip hub yet. Create a trip and Journi will start tracking the next action for you.</p>
                </div>
              )}
            </article>

            <article className={sectionStyles.panel}>
              <div className={sectionStyles.sectionTop}>
                <div>
                  <p className={sectionStyles.eyebrow}>Readiness pulse</p>
                  <h2>Trip confidence and blockers</h2>
                </div>
                <span className={sectionStyles.badgeSoft}>This week</span>
              </div>

              {dashboardLoading ? (
                <div className={sectionStyles.emptyState}>
                  <p>Loading trip confidence…</p>
                </div>
              ) : dashboardSummary?.trips.length ? (
                <div className={sectionStyles.activityList}>
                  {dashboardSummary.trips.slice(0, 4).map((item) => (
                    <div key={item.trip.id} className={sectionStyles.activityRow}>
                      <div className={sectionStyles.rowTop}>
                        <span className={sectionStyles.rowTitle}>{item.trip.title}</span>
                        <span className={sectionStyles.rowMeta}>{item.summary.confidenceScore}%</span>
                      </div>
                      <div className={sectionStyles.progressTrack}>
                        <span style={{ width: `${item.summary.confidenceScore}%` }} />
                      </div>
                      <p className={sectionStyles.metricMeta}>{item.summary.confidenceMessage}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={sectionStyles.emptyState}>
                  <p>Your readiness pulse will appear here once you’ve created a trip and invited people.</p>
                </div>
              )}
            </article>
          </section>
        </div>
      )}
    </AppShell>
  );
}
