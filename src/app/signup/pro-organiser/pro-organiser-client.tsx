"use client";

import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import styles from "./page.module.css";
import { supabase } from "@/lib/supabase/client";

const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null;

export function ProOrganiserClient({
  initialBilling,
  compact = false,
  returnPath = "/dashboard?checkout=complete&product=pro_organiser",
}: {
  initialBilling: "monthly" | "yearly";
  compact?: boolean;
  returnPath?: string;
}) {
  const router = useRouter();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState("");
  const [accountEmail, setAccountEmail] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadCheckout() {
      setCheckoutError("");
      setClientSecret(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      const email = user?.email ?? "";

      if (cancelled) {
        return;
      }

      if (!user) {
        router.replace("/signin");
        router.refresh();
        return;
      }

      setAccountEmail(email);

      const response = await fetch("/api/stripe/checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          product: "pro_organiser",
          interval: initialBilling,
          email,
          origin: window.location.origin,
          returnPath,
        }),
      });

      const data = (await response.json()) as { clientSecret?: string; error?: string };

      if (cancelled) {
        return;
      }

      if (!response.ok || !data.clientSecret) {
        setCheckoutError(data.error || "Unable to load Stripe checkout.");
        return;
      }

      setClientSecret(data.clientSecret);
    }

    void loadCheckout();

    return () => {
      cancelled = true;
    };
  }, [initialBilling, returnPath, router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/signin");
    router.refresh();
  }

  function handleBillingChange(nextBilling: "monthly" | "yearly") {
    if (nextBilling === initialBilling) {
      return;
    }

    const params = new URLSearchParams({
      billing: nextBilling,
      returnPath,
    });

    if (compact) {
      params.set("compact", "1");
    }

    window.location.href = `/signup/pro-organiser/payment?${params.toString()}`;
  }

  return (
    <main className={compact ? styles.compactPage : styles.page}>
      {!compact ? <div className={styles.overlay} /> : null}
      {!compact ? (
        <Link href="/" className={styles.pageLogo}>
          <Image
            src="/journi-logo-app.png"
            alt="Journi"
            width={360}
            height={124}
            className={styles.pageLogoImage}
            priority
          />
        </Link>
      ) : null}

      <section className={compact ? styles.compactCard : styles.card}>
        {compact ? (
          <div className={styles.paymentShellCompact}>
            {stripePromise && clientSecret ? (
              <EmbeddedCheckoutProvider
                stripe={stripePromise}
                options={{ clientSecret }}
                key={`${initialBilling}-${clientSecret}`}
              >
                <EmbeddedCheckout />
              </EmbeddedCheckoutProvider>
            ) : checkoutError ? (
              <div className={styles.checkoutMessage}>
                <strong>Stripe checkout could not load</strong>
                <p>{checkoutError}</p>
              </div>
            ) : (
              <div className={styles.checkoutPlaceholder} aria-hidden="true" />
            )}
          </div>
        ) : (
          <div className={styles.checkoutLayout}>
            <div className={styles.detailsColumn}>
              <div className={styles.topActions}>
                <button type="button" className={styles.topLink} onClick={handleLogout}>
                  Log out and come back later
                </button>
              </div>

              <p className={styles.kicker}>Journi Pro Organiser</p>
              <h1>Upgrade before you enter your hub.</h1>
              <p className={styles.lead}>
                For people who plan more than once. Everything from The Trip Pass, plus
                unlimited trips, no expiry, templates, and priority support.
              </p>

              <div className={styles.toggle}>
                <button
                  type="button"
                  className={
                    initialBilling === "monthly" ? styles.toggleActive : styles.toggleButton
                  }
                  onClick={() => handleBillingChange("monthly")}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  className={
                    initialBilling === "yearly" ? styles.toggleActive : styles.toggleButton
                  }
                  onClick={() => handleBillingChange("yearly")}
                >
                  Yearly
                </button>
              </div>

              <div className={styles.priceRow}>
                <div>
                  <span className={styles.price}>
                    {initialBilling === "monthly" ? "£19" : "£179"}
                  </span>
                  <span className={styles.cadence}>
                    / {initialBilling === "monthly" ? "month" : "year"}
                  </span>
                </div>
                <p className={styles.altPrice}>
                  {initialBilling === "monthly"
                    ? "Flexible monthly billing"
                    : "Save £49 compared with monthly billing"}
                </p>
              </div>

              <div className={styles.accountLock}>
                <span className={styles.accountLabel}>Checkout email</span>
                <strong>{accountEmail || "Loading your account..."}</strong>
              </div>

              <ul className={styles.features}>
                <li>Unlimited trips</li>
                <li>No expiry</li>
                <li>Templates</li>
                <li>Priority support</li>
              </ul>
            </div>

            <div className={styles.paymentShell}>
              {stripePromise && clientSecret ? (
                <EmbeddedCheckoutProvider
                  stripe={stripePromise}
                  options={{ clientSecret }}
                  key={`${initialBilling}-${clientSecret}`}
                >
                  <EmbeddedCheckout />
                </EmbeddedCheckoutProvider>
              ) : checkoutError ? (
                <div className={styles.checkoutMessage}>
                  <strong>Stripe checkout could not load</strong>
                  <p>{checkoutError}</p>
                </div>
              ) : (
                <div className={styles.checkoutPlaceholder} aria-hidden="true" />
              )}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
