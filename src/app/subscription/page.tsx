"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import sectionStyles from "@/components/app-page.module.css";
import { UpgradePlanModal } from "@/components/upgrade-plan-modal";

type StripeSubscription = {
  isPro: boolean;
  customerId?: string;
  subscriptionId?: string;
  status?: string;
  cancelAtPeriodEnd?: boolean;
  currentPeriodEnd?: number | null;
  productName?: string | null;
  amount?: number | null;
  currency?: string | null;
  interval?: string | null;
};

type SubscriptionManagerProps = {
  email: string;
  loading: boolean;
  isPro: boolean;
  plan: string;
  subscriptionStatus: string | null;
};

function formatCurrency(amount: number | null | undefined, currency: string | null | undefined) {
  if (!amount || !currency) {
    return "Not available";
  }

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

function formatDate(timestamp: number | null | undefined) {
  if (!timestamp) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(timestamp * 1000));
}

function SubscriptionManager({
  email,
  loading,
  isPro,
  plan,
  subscriptionStatus,
}: SubscriptionManagerProps) {
  const [subscription, setSubscription] = useState<StripeSubscription | null>(null);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);
  const [loadingSubscription, setLoadingSubscription] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadSubscription() {
      if (loading || !email) {
        return;
      }

      setLoadingSubscription(true);
      setSubscriptionError(null);

      const response = await fetch("/api/stripe/subscription-status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const data = (await response.json()) as StripeSubscription & { error?: string };

      if (cancelled) {
        return;
      }

      if (!response.ok) {
        setSubscriptionError(data.error || "Unable to load subscription.");
        setSubscription(null);
        setLoadingSubscription(false);
        return;
      }

      setSubscription(data);
      setLoadingSubscription(false);
    }

    void loadSubscription();

    return () => {
      cancelled = true;
    };
  }, [email, loading]);

  async function handleSubscriptionAction(action: "cancel_at_period_end" | "reactivate") {
    if (!subscription?.subscriptionId) {
      setSubscriptionError("No active Stripe subscription was found.");
      return;
    }

    setActionLoading(true);
    setActionMessage(null);
    setSubscriptionError(null);

    const response = await fetch("/api/stripe/subscription-action", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subscriptionId: subscription.subscriptionId,
        action,
      }),
    });

    const data = (await response.json()) as Partial<StripeSubscription> & { error?: string };

    if (!response.ok) {
      setSubscriptionError(data.error || "Unable to update subscription.");
      setActionLoading(false);
      return;
    }

    setSubscription((current) =>
      current
        ? {
            ...current,
            status: data.status ?? current.status,
            cancelAtPeriodEnd: data.cancelAtPeriodEnd ?? current.cancelAtPeriodEnd,
            currentPeriodEnd: data.currentPeriodEnd ?? current.currentPeriodEnd,
          }
        : current,
    );
    setActionMessage(
      action === "cancel_at_period_end"
        ? "Your subscription will cancel at the end of the current billing period."
        : "Your subscription will continue as normal.",
    );
    setActionLoading(false);
  }

  async function handleOpenBillingPortal() {
    if (!email) {
      setSubscriptionError("No account email is available for billing management.");
      return;
    }

    setPortalLoading(true);
    setActionMessage(null);
    setSubscriptionError(null);

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
      setSubscriptionError(data.error || "Unable to open Stripe billing settings.");
      setPortalLoading(false);
      return;
    }

    window.location.href = data.url;
  }

  const isCancelling = Boolean(subscription?.cancelAtPeriodEnd);

  return (
    <div className={sectionStyles.stack}>
      <section className={sectionStyles.panel}>
        <div className={sectionStyles.sectionTop}>
          <div>
            <p className={sectionStyles.eyebrow}>Billing</p>
            <h2>Subscription details</h2>
          </div>
          <span className={isPro ? sectionStyles.badgeSuccess : sectionStyles.badge}>
            {loading || loadingSubscription ? "Loading..." : isPro ? "Pro active" : "Not active"}
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
            <strong>{subscription?.status ?? subscriptionStatus ?? "No active subscription"}</strong>
          </div>
          <div className={sectionStyles.settingsRow}>
            <div>
              <h3>Price</h3>
            </div>
            <strong>
              {formatCurrency(subscription?.amount, subscription?.currency)}
              {subscription?.interval ? ` / ${subscription.interval}` : ""}
            </strong>
          </div>
          <div className={sectionStyles.settingsRow}>
            <div>
              <h3>{isCancelling ? "Access ends" : "Renews"}</h3>
            </div>
            <strong>{formatDate(subscription?.currentPeriodEnd)}</strong>
          </div>
        </div>

        {subscriptionError ? <p className={sectionStyles.formError}>{subscriptionError}</p> : null}
        {actionMessage ? <p className={sectionStyles.formSuccess}>{actionMessage}</p> : null}

        <div className={sectionStyles.headerActions}>
          {!isPro ? (
            <button
              type="button"
              className={sectionStyles.primaryAction}
              onClick={() => setUpgradeOpen(true)}
              disabled={loading || !email}
            >
              Upgrade to Pro
            </button>
          ) : null}

          {isPro && subscription?.subscriptionId && !isCancelling ? (
            <button
              type="button"
              className={sectionStyles.dangerAction}
              onClick={() => handleSubscriptionAction("cancel_at_period_end")}
              disabled={actionLoading}
            >
              {actionLoading ? "Updating..." : "Cancel at period end"}
            </button>
          ) : null}

          {isPro && subscription?.subscriptionId ? (
            <button
              type="button"
              className={sectionStyles.secondaryAction}
              onClick={handleOpenBillingPortal}
              disabled={portalLoading}
            >
              {portalLoading ? "Opening billing..." : "Payment methods and invoices"}
            </button>
          ) : null}

          {isPro && subscription?.subscriptionId && isCancelling ? (
            <button
              type="button"
              className={sectionStyles.primaryAction}
              onClick={() => handleSubscriptionAction("reactivate")}
              disabled={actionLoading}
            >
              {actionLoading ? "Updating..." : "Reactivate subscription"}
            </button>
          ) : null}
        </div>
      </section>

      <UpgradePlanModal
        open={upgradeOpen}
        email={email}
        onClose={() => setUpgradeOpen(false)}
      />
    </div>
  );
}

export default function SubscriptionPage() {
  return (
    <AppShell
      kicker="Subscription"
      title="Manage your subscription"
      intro="View and manage your Pro organiser subscription inside Journi."
    >
      {(state) => <SubscriptionManager {...state} />}
    </AppShell>
  );
}
