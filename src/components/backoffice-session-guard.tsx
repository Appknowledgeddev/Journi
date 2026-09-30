"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import styles from "@/app/backoffice/session-guard.module.css";

const INACTIVITY_LIMIT_MS = 5 * 60 * 1000;
const WARNING_DURATION_MS = 60 * 1000;

export function BackofficeSessionGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const lastActivityRef = useRef(Date.now());
  const signingOutRef = useRef(false);
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);

  const signOutForInactivity = useCallback(async () => {
    if (signingOutRef.current) return;
    signingOutRef.current = true;
    await supabase.auth.signOut({ scope: "local" });
    router.replace("/signin?next=/backoffice&reason=inactive");
    router.refresh();
  }, [router]);

  const recordActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    setSecondsRemaining(null);
  }, []);

  useEffect(() => {
    const activityEvents: Array<keyof WindowEventMap> = [
      "pointerdown",
      "keydown",
      "touchstart",
      "scroll",
    ];

    activityEvents.forEach((eventName) =>
      window.addEventListener(eventName, recordActivity, { passive: true }),
    );

    const timer = window.setInterval(() => {
      const remaining = INACTIVITY_LIMIT_MS - (Date.now() - lastActivityRef.current);

      if (remaining <= 0) {
        window.clearInterval(timer);
        void signOutForInactivity();
        return;
      }

      setSecondsRemaining(
        remaining <= WARNING_DURATION_MS ? Math.ceil(remaining / 1000) : null,
      );
    }, 1000);

    return () => {
      window.clearInterval(timer);
      activityEvents.forEach((eventName) =>
        window.removeEventListener(eventName, recordActivity),
      );
    };
  }, [recordActivity, signOutForInactivity]);

  const countdown = secondsRemaining ?? 60;
  const minutes = Math.floor(countdown / 60);
  const seconds = countdown % 60;

  return (
    <>
      {children}
      {secondsRemaining !== null ? (
        <div className={styles.overlay} role="presentation">
          <section className={styles.warning} role="alertdialog" aria-modal="true" aria-labelledby="session-warning-title">
            <p className={styles.eyebrow}>Session timeout</p>
            <h2 id="session-warning-title">You will be signed out shortly</h2>
            <p>No activity has been detected in the backoffice.</p>
            <strong className={styles.countdown} aria-live="polite">
              {minutes}:{seconds.toString().padStart(2, "0")}
            </strong>
            <button type="button" onClick={recordActivity}>Stay signed in</button>
          </section>
        </div>
      ) : null}
    </>
  );
}
