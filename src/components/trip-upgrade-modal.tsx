"use client";

import { useMemo, useState } from "react";
import styles from "./trip-upgrade-modal.module.css";

type UpgradeMode = "trip_pass" | "pro_organiser";

export function TripUpgradeModal({
  open,
  email,
  tripId,
  returnPath,
  onClose,
}: {
  open: boolean;
  email: string;
  tripId: string;
  returnPath?: string;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<UpgradeMode>("trip_pass");

  const iframeSrc = useMemo(() => {
    const checkoutReturnPath = encodeURIComponent(returnPath || `/trips/${tripId}`);

    if (mode === "trip_pass") {
      return `/signup/trip-pass/payment?compact=1&returnPath=${checkoutReturnPath}&email=${encodeURIComponent(
        email,
      )}`;
    }

    return `/signup/pro-organiser/payment?compact=1&billing=monthly&returnPath=${checkoutReturnPath}&email=${encodeURIComponent(
      email,
    )}`;
  }, [email, mode, returnPath, tripId]);

  if (!open) {
    return null;
  }

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label="Upgrade trip access"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.header}>
          <div>
            <p className={styles.kicker}>Traveller limit reached</p>
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
              <span className={styles.optionEyebrow}>Upgrade this trip</span>
              <strong>Trip Pass</strong>
              <p>£39 one-off for one additional published trip.</p>
            </button>

            <button
              type="button"
              className={mode === "pro_organiser" ? styles.optionCardActive : styles.optionCard}
              onClick={() => setMode("pro_organiser")}
            >
              <span className={styles.optionEyebrow}>Upgrade plan</span>
              <strong>Pro organiser</strong>
              <p>Unlimited trips, no expiry, templates, and priority support.</p>
            </button>
          </div>

          <div className={styles.frameShell}>
            <iframe
              key={iframeSrc}
              src={iframeSrc}
              title="Journi upgrade checkout"
              className={styles.checkoutFrame}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
