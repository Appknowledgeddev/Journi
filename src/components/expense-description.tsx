"use client";

import { useEffect, useId, useState } from "react";
import styles from "./trip-expenses.module.css";

export function ExpenseDescription({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const compact = text.replace(/\s+/g, " ").trim();
  const truncated = compact.length > 60;

  useEffect(() => {
    if (!expanded) return;
    const timer = window.setTimeout(() => setExpanded(false), 10000);
    return () => window.clearTimeout(timer);
  }, [expanded]);

  if (!truncated) return <p className={styles.expenseDescription}>{compact}</p>;

  return <div className={styles.descriptionBlock}>
    <div className={styles.descriptionPreview}>
      <span>{compact.slice(0, 60).trimEnd()}…</span>
      <button type="button" aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpanded((value) => !value)}>{expanded ? "Read less" : "Read more"}</button>
    </div>
    <div id={detailsId} className={`${styles.descriptionReveal} ${expanded ? styles.descriptionExpanded : ""}`} aria-hidden={!expanded} inert={!expanded}>
      <div><p>{text}</p></div>
    </div>
  </div>;
}
