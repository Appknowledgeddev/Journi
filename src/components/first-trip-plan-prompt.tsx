"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase/client";
import styles from "./trip-upgrade-modal.module.css";

export function FirstTripPlanPrompt({ eligible, userId, resuming, onUpgrade }: {
  eligible: boolean;
  userId: string;
  resuming: boolean;
  onUpgrade: (mode: "trip_pass" | "pro_organiser") => void;
}) {
  const choiceKey = `journi-trip-plan-choice:${userId}`;
  const [open, setOpen] = useState(() => {
    if (!resuming) return true;
    try { return sessionStorage.getItem(choiceKey) !== "seen"; } catch { return true; }
  });
  const dialog = useRef<HTMLDialogElement>(null);
  const [access, setAccess] = useState<{ freeTripAvailable: boolean; canCreate: boolean } | null>(null);
  const [accessError, setAccessError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    async function checkAccess() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const checkout = sessionStorage.getItem(`journi-trip-checkout:${userId}`);
        const response = await fetch(`/api/trip-access${checkout ? `?checkout_session_id=${encodeURIComponent(checkout)}` : ""}`, {
          headers: { Authorization: `Bearer ${session?.access_token ?? ""}` }, signal: controller.signal,
        });
        if (!response.ok) throw new Error("Access check failed");
        const result = await response.json();
        if (!controller.signal.aborted) { setAccess(result); setAccessError(false); }
      } catch { if (!controller.signal.aborted) setAccessError(true); }
    }
    void checkAccess();
    return () => controller.abort();
  }, [open, userId, retry]);
  function dismiss() {
    try { sessionStorage.setItem(choiceKey, "seen"); } catch { /* Still allow planning when storage is unavailable. */ }
    setOpen(false);
  }

  useEffect(() => {
    if (!open || !eligible) return;
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, [open, eligible]);

  if (!open || !eligible) return null;
  return createPortal(
    <dialog ref={dialog} className={styles.backdrop} aria-labelledby="first-trip-plan-title" onCancel={(event) => { event.preventDefault(); dismiss(); }}>
      <div className={`${styles.modal} ${styles.firstTripModal}`}>
        <div className={styles.header}>
          <div>
            <p className={styles.kicker}>Your trip, your choice</p>
            <h2 id="first-trip-plan-title">How would you like to start?</h2>
            <p className={styles.lead}>{access && !access.freeTripAvailable ? "You've used your free trip. Each additional trip needs a Trip Pass or an active Pro subscription." : "Your first trip is free. Upgrade now for extra flexibility, or use your free trip."}</p>
          </div>
          <button type="button" className={styles.closeButton} aria-label="Close plan choices" onClick={dismiss}>Close</button>
        </div>
        <div className={styles.firstTripChoices}>
          <button type="button" className={styles.optionCard} onClick={() => { dismiss(); onUpgrade("trip_pass"); }}>
            <span className={styles.optionEyebrow}>One-off purchase</span><strong>Buy a Trip Pass</strong><p>£39 for an additional published trip and more invites.</p>
          </button>
          <button type="button" className={styles.optionCard} onClick={() => { dismiss(); onUpgrade("pro_organiser"); }}>
            <span className={styles.optionEyebrow}>Subscription</span><strong>Subscribe to Pro</strong><p>Unlimited trips, templates and priority support.</p>
          </button>
          {access?.canCreate ? <button type="button" className={styles.freeTripChoice} onClick={dismiss}>
            <strong>{access.freeTripAvailable ? "Continue with my free trip" : "Continue with my paid access"}</strong>
            <span>{access.freeTripAvailable ? "One free trip per account. You can upgrade later." : "Your paid access has been verified."}</span>
          </button> : !access ? <div className={styles.accessNotice} role="status">
            {accessError ? <><p>Unable to check your free trip allowance.</p><button type="button" className={styles.closeButton} onClick={() => { setAccessError(false); setRetry(value => value + 1); }}>Try again</button></> : "Checking your trip allowance…"}
          </div> : null}
        </div>
      </div>
    </dialog>, document.body,
  );
}
