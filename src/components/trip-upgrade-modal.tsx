"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckoutFrame } from "./checkout-frame";
import styles from "./trip-upgrade-modal.module.css";

type UpgradeMode = "trip_pass" | "pro_organiser";

export function TripUpgradeModal({
  open,
  email,
  tripId,
  returnPath,
  onClose,
  initialMode = "trip_pass",
}: {
  open: boolean;
  email: string;
  tripId: string;
  returnPath?: string;
  onClose: () => void;
  initialMode?: UpgradeMode;
}) {
  const [mode, setMode] = useState<UpgradeMode>(initialMode);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    const previousOverflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = previousOverflow; };
  }, [open]);

  const iframeSrc = useMemo(() => {
    const destination = new URL(returnPath || `/trips/${tripId}`, "https://journi.local");
    destination.searchParams.set("product", mode);
    const checkoutReturnPath = encodeURIComponent(`${destination.pathname}${destination.search}${destination.hash}`);

    if (mode === "trip_pass") {
      return `/signup/trip-pass/payment?compact=1&returnPath=${checkoutReturnPath}&email=${encodeURIComponent(
        email,
      )}`;
    }

    return `/signup/pro-organiser/payment?compact=1&billing=monthly&returnPath=${checkoutReturnPath}&email=${encodeURIComponent(
      email,
    )}`;
  }, [email, mode, returnPath, tripId]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <dialog ref={dialog} className={styles.backdrop} aria-label="Upgrade trip access" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div
        className={styles.modal}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.header}>
          <div>
            <p className={styles.kicker}>Unlock more invites</p>
            <h2>Choose how you want to unlock more travellers</h2>
            <p className={styles.lead}>
              Stay on free with a Trip Pass for this hub, or upgrade the whole account to Pro organiser.
            </p>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose}>
            Close
          </button>
        </div>

        <div className={styles.layout}>
          <div className={styles.optionsColumn}>
            <button
              type="button"
              className={mode === "trip_pass" ? styles.optionCardActive : styles.optionCard}
              onClick={() => setMode("trip_pass")}
            >
              <span className={styles.optionEyebrow}>Buy for this trip</span>
              <strong>Trip Pass</strong>
              <p>£39 one-off for one additional published trip.</p>
            </button>

            <button
              type="button"
              className={mode === "pro_organiser" ? styles.optionCardActive : styles.optionCard}
              onClick={() => setMode("pro_organiser")}
            >
              <span className={styles.optionEyebrow}>Subscribe</span>
              <strong>Pro organiser</strong>
              <p>Unlimited trips, no expiry, templates, and priority support.</p>
            </button>
          </div>

          <div className={styles.frameShell}>
            <CheckoutFrame
              key={iframeSrc}
              src={iframeSrc}
              title="Journi upgrade checkout"
              className={styles.checkoutFrame}

            />
          </div>
        </div>
      </div>
    </dialog>, document.body
  );
}
