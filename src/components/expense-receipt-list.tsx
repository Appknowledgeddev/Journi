"use client";
import { useState } from "react";
import { FiPaperclip } from "react-icons/fi";
import { supabase } from "@/lib/supabase/client";
import type { ExpenseReceipt } from "@/lib/expenses/shared";
import styles from "./trip-expenses.module.css";

export function ExpenseReceiptList({ tripId, receipts }: { tripId: string; receipts: ExpenseReceipt[] }) {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState("");
  async function download(receipt: ExpenseReceipt) {
    setDownloading(receipt.id); setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sign in to download receipts.");
      const response = await fetch(`/api/trips/${tripId}/expenses/receipts?receiptId=${encodeURIComponent(receipt.id)}`, { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (!response.ok) throw new Error("Unable to download this receipt. Please try again.");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a"); link.href = url; link.download = receipt.name;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to download receipt."); }
    finally { setDownloading(null); }
  }
  if (!receipts.length) return null;
  return <div className={styles.receiptLinks}>
    {receipts.map((receipt) => <button key={receipt.id} type="button" disabled={Boolean(downloading)} onClick={() => void download(receipt)} aria-label={`Download receipt ${receipt.name}`}><FiPaperclip />{downloading === receipt.id ? "Downloading…" : receipt.name}</button>)}
    {error ? <p className={styles.formError} role="alert">{error}</p> : null}
  </div>;
}
