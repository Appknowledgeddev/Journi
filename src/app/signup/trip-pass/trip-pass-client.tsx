"use client";

import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import styles from "@/app/signup/pro-organiser/page.module.css";

const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null;

export function TripPassClient({
  compact = false,
  returnPath,
}: {
  compact?: boolean;
  returnPath: string;
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
          product: "trip_pass",
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
  }, [returnPath, router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/signin");
    router.refresh();
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
              <EmbeddedCheckoutProvider stripe={stripePromise} options={{ clientSecret }}>
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

              <p className={styles.kicker}>Trip pass</p>
              <h1>Publish one extra trip.</h1>
              <p className={styles.lead}>
                The one-off option for free organisers who want to unlock one more live trip
                without moving onto the full Pro organiser plan.
              </p>

              <div className={styles.priceRow}>
                <div>
                  <span className={styles.price}>£39</span>
                  <span className={styles.cadence}>/ one-off</span>
                </div>
                <p className={styles.altPrice}>Unlock one additional published trip</p>
              </div>

              <div className={styles.accountLock}>
                <span className={styles.accountLabel}>Checkout email</span>
                <strong>{accountEmail || "Loading your account..."}</strong>
              </div>

              <ul className={styles.features}>
                <li>One extra published trip</li>
                <li>Stay on the free plan</li>
                <li>Pay once for this trip</li>
              </ul>
            </div>

            <div className={styles.paymentShell}>
              {stripePromise && clientSecret ? (
                <EmbeddedCheckoutProvider stripe={stripePromise} options={{ clientSecret }}>
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
