"use client";

import { usePathname, useSearchParams } from "next/navigation";
import type { StripeMode } from "@/lib/stripe/environment";
import styles from "./billing-mode-indicator.module.css";

export function BillingModeIndicator({ mode, ready }: { mode: StripeMode | null; ready: boolean }) {
  const pathname = usePathname();
  const search = useSearchParams();
  // Embedded checkout has its own visible mode notice inside the modal.
  if (pathname.startsWith("/signup/") && search.get("compact") === "1") return null;
  return <div className={styles.indicator} data-billing-mode={ready ? mode : "unavailable"}>
    <span aria-hidden="true" className={styles.dot} />
    {ready ? mode === "test" ? "Test payments · No real charges" : "Live payments" : "Payments unavailable · Configuration required"}
  </div>;
}
