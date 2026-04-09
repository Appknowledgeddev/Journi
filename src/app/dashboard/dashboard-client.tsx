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

export function DashboardClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const checkoutComplete = searchParams.get("checkout") === "complete";
  const checkoutProduct = searchParams.get("product");
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationProduct, setCelebrationProduct] = useState<string | null>(null);

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

      if (checkoutProduct === "pro_organiser") {
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
    const shouldCelebrate =
      checkoutComplete || window.sessionStorage.getItem(celebrationKey) === "true";

    if (!shouldCelebrate) {
      return;
    }

    window.sessionStorage.removeItem(celebrationKey);
    const product = window.sessionStorage.getItem(celebrationProductKey) ?? checkoutProduct;
    window.sessionStorage.removeItem(celebrationProductKey);
    setCelebrationProduct(product);
    setShowCelebration(true);

    const timeoutId = window.setTimeout(() => {
      setShowCelebration(false);
      setCelebrationProduct(null);
    }, 4200);

    return () => window.clearTimeout(timeoutId);
  }, [checkoutComplete, checkoutProduct]);

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

          <section className={sectionStyles.grid4}>
            <article className={sectionStyles.metricCard}>
              <p className={sectionStyles.eyebrow}>Trips</p>
              <div className={sectionStyles.metricValue}>{isPro ? "6" : "1"}</div>
              <p className={sectionStyles.metricMeta}>
                {isPro ? "Live hubs across your organiser account" : "Active hub on the free plan"}
              </p>
            </article>
            <article className={sectionStyles.metricCard}>
              <p className={sectionStyles.eyebrow}>Votes</p>
              <div className={sectionStyles.metricValue}>{isPro ? "148" : "21"}</div>
              <p className={sectionStyles.metricMeta}>Traveller decisions collected this month</p>
            </article>
            <article className={sectionStyles.metricCard}>
              <p className={sectionStyles.eyebrow}>Guests</p>
              <div className={sectionStyles.metricValue}>{isPro ? "42" : "5"}</div>
              <p className={sectionStyles.metricMeta}>People currently invited into your hubs</p>
            </article>
            <article className={sectionStyles.metricCard}>
              <p className={sectionStyles.eyebrow}>Payments</p>
              <div className={sectionStyles.metricValue}>{isPro ? "£3.8k" : "£420"}</div>
              <p className={sectionStyles.metricMeta}>Tracked deposits and organiser charges</p>
            </article>
          </section>

          <section className={sectionStyles.split}>
            <article className={sectionStyles.panel}>
              <div className={sectionStyles.sectionTop}>
                <div>
                  <p className={sectionStyles.eyebrow}>Next steps</p>
                  <h2>What to do next</h2>
                </div>
                <span className={isPro ? sectionStyles.badgeSuccess : sectionStyles.badge}>
                  {loading ? "Loading..." : isPro ? "Pro active" : "Free mode"}
                </span>
              </div>

              <div className={sectionStyles.timeline}>
                <article className={sectionStyles.timelineCard}>
                  <span className={sectionStyles.step}>1</span>
                  <div>
                    <h3>Open Trips</h3>
                    <p>Create a new trip or reopen a draft.</p>
                  </div>
                </article>
                <article className={sectionStyles.timelineCard}>
                  <span className={sectionStyles.step}>2</span>
                  <div>
                    <h3>Invite travellers</h3>
                    <p>Add people once the trip is ready to share.</p>
                  </div>
                </article>
                <article className={sectionStyles.timelineCard}>
                  <span className={sectionStyles.step}>3</span>
                  <div>
                    <h3>Publish when ready</h3>
                    <p>Move a draft live when planning is in place.</p>
                  </div>
                </article>
              </div>
            </article>

            <article className={sectionStyles.panel}>
              <div className={sectionStyles.sectionTop}>
                <div>
                  <p className={sectionStyles.eyebrow}>Live now</p>
                  <h2>Hub pulse</h2>
                </div>
                <span className={sectionStyles.badgeSoft}>This week</span>
              </div>

              <div className={sectionStyles.activityList}>
                <div className={sectionStyles.activityRow}>
                  <div className={sectionStyles.rowTop}>
                    <span className={sectionStyles.rowTitle}>Lisbon birthday weekend</span>
                    <span className={sectionStyles.rowMeta}>78%</span>
                  </div>
                  <div className={sectionStyles.progressTrack}>
                    <span style={{ width: isPro ? "78%" : "34%" }} />
                  </div>
                </div>
                <div className={sectionStyles.activityRow}>
                  <div className={sectionStyles.rowTop}>
                    <span className={sectionStyles.rowTitle}>Mallorca villa shortlist</span>
                    <span className={sectionStyles.rowMeta}>62%</span>
                  </div>
                  <div className={sectionStyles.progressTrack}>
                    <span style={{ width: isPro ? "62%" : "24%" }} />
                  </div>
                </div>
                <div className={sectionStyles.activityRow}>
                  <div className={sectionStyles.rowTop}>
                    <span className={sectionStyles.rowTitle}>Airport transfer plan</span>
                    <span className={sectionStyles.rowMeta}>54%</span>
                  </div>
                  <div className={sectionStyles.progressTrack}>
                    <span style={{ width: isPro ? "54%" : "18%" }} />
                  </div>
                </div>
              </div>
            </article>
          </section>
        </div>
      )}
    </AppShell>
  );
}
