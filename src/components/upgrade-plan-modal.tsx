"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckoutFrame } from "./checkout-frame";
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
  const dialog = useRef<HTMLDialogElement>(null);
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const iframeSrc = useMemo(() => {
    const params = new URLSearchParams({
      billing,
      compact: "1",
      modal: "1",
      email,
      returnPath: "/dashboard?checkout=complete&product=pro_organiser",
    });

    return `/signup/pro-organiser/payment?${params.toString()}`;
  }, [billing, email]);

  function close() {
    setBilling("monthly");
    onClose();
  }

  useEffect(() => {
    if (!open) {
      return;
    }

    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, [open]);

  if (!open) {
    return null;
  }

  return createPortal(
    <dialog ref={dialog} className={styles.backdrop} aria-label="Update plan" onCancel={(event) => { event.preventDefault(); close(); }} onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div
        className={styles.modal}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.header}>
          <div>
            <p className={styles.kicker}>Update plan</p>
            <h2>Start your Pro organiser subscription</h2>
            <p className={styles.lead}>Upgrade this account without leaving the app.</p>
          </div>
          <button type="button" className={styles.closeButton} onClick={close} aria-label="Close">
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
            <CheckoutFrame
              key={iframeSrc}
              src={iframeSrc}
              title="Journi Pro organiser checkout"
              className={styles.checkoutFrame}
            />
          </div>
        </div>
      </div>
    </dialog>, document.body
  );
}
