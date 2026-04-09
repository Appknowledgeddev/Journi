"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./upgrade-plan-modal.module.css";

export function UpgradePlanModal({
  open,
  email,
  onClose,
}: {
  open: boolean;
  email: string;
  onClose: () => void;
}) {
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const iframeSrc = useMemo(
    () =>
      `/signup/pro-organiser/payment?billing=${billing}&compact=1&modal=1&email=${encodeURIComponent(email)}`,
    [billing, email],
  );

  useEffect(() => {
    if (!open) {
      setBilling("monthly");
      return;
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label="Update plan"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.header}>
          <div>
            <p className={styles.kicker}>Update plan</p>
            <h2>Start your Pro organiser subscription</h2>
            <p className={styles.lead}>Upgrade this account without leaving the app.</p>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.detailsColumn}>
            <div className={styles.toggle}>
              <button
                type="button"
                className={billing === "monthly" ? styles.toggleActive : styles.toggleButton}
                onClick={() => setBilling("monthly")}
              >
                Monthly
              </button>
              <button
                type="button"
                className={billing === "yearly" ? styles.toggleActive : styles.toggleButton}
                onClick={() => setBilling("yearly")}
              >
                Yearly
              </button>
            </div>

            <div className={styles.priceRow}>
              <span className={styles.price}>{billing === "monthly" ? "£19" : "£179"}</span>
              <span className={styles.cadence}>/ {billing === "monthly" ? "month" : "year"}</span>
            </div>

            <div className={styles.accountCard}>
              <span className={styles.accountLabel}>Account</span>
              <strong>{email || "Loading..."}</strong>
            </div>

            <ul className={styles.features}>
              <li>Unlimited trips</li>
              <li>No expiry</li>
              <li>Templates</li>
              <li>Priority support</li>
            </ul>
          </div>

          <div className={styles.paymentColumn}>
            <iframe
              key={iframeSrc}
              src={iframeSrc}
              title="Journi Pro organiser checkout"
              className={styles.checkoutFrame}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
