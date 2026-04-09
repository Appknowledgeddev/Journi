"use client";

import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import sectionStyles from "@/components/app-page.module.css";

export default function SubscriptionPage() {
  const [portalError, setPortalError] = useState<string | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);

  async function handleOpenPortal(email: string) {
    if (!email) {
      setPortalError("No account email is available for subscription management.");
      return;
    }

    setPortalError(null);
    setOpeningPortal(true);

    const response = await fetch("/api/stripe/billing-portal-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        origin: window.location.origin,
        returnPath: "/subscription",
      }),
    });

    const data = (await response.json()) as { url?: string; error?: string };

    if (!response.ok || !data.url) {
      setPortalError(data.error || "Unable to open subscription management.");
      setOpeningPortal(false);
      return;
    }

    window.location.href = data.url;
  }

  return (
    <AppShell
      kicker="Subscription"
      title="Manage your subscription"
      intro="Review your Pro organiser billing and open Stripe to change or manage the plan."
    >
      {({ email, loading, isPro, plan, subscriptionStatus }) => (
        <div className={sectionStyles.stack}>
          <section className={sectionStyles.panel}>
            <div className={sectionStyles.sectionTop}>
              <div>
                <p className={sectionStyles.eyebrow}>Billing</p>
                <h2>Subscription details</h2>
              </div>
              <span className={isPro ? sectionStyles.badgeSuccess : sectionStyles.badge}>
                {loading ? "Loading..." : isPro ? "Pro active" : "Not active"}
              </span>
            </div>

            <div className={sectionStyles.settingsList}>
              <div className={sectionStyles.settingsRow}>
                <div>
                  <h3>Account</h3>
                </div>
                <strong>{loading ? "Loading..." : email || "No email found"}</strong>
              </div>
              <div className={sectionStyles.settingsRow}>
                <div>
                  <h3>Plan</h3>
                </div>
                <strong>{plan === "pro_organiser" ? "Pro organiser" : "Free plan"}</strong>
              </div>
              <div className={sectionStyles.settingsRow}>
                <div>
                  <h3>Status</h3>
                </div>
                <strong>{subscriptionStatus ?? "No active subscription"}</strong>
              </div>
            </div>

            {portalError ? <p className={sectionStyles.formError}>{portalError}</p> : null}

            <div className={sectionStyles.headerActions}>
              <button
                type="button"
                className={sectionStyles.primaryAction}
                onClick={() => handleOpenPortal(email)}
                disabled={openingPortal || loading || !isPro}
              >
                {openingPortal ? "Opening Stripe..." : "Manage in Stripe"}
              </button>
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}
