"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import { FiPlus, FiX } from "react-icons/fi";
import { supabase } from "@/lib/supabase/client";
import { validatePayment, type ExpensePayment, type PaymentInput, type TripCostsResponse } from "@/lib/expenses/shared";
import styles from "./trip-expenses.module.css";

const money = (minor: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(minor / 100);

export function TripExpensePayments({ tripId, data, expenseId, onSaved, embedded = false, onClose, onBusyChange, statusFilter, hideEmpty = false }: {
  statusFilter?: "due" | "paid"; hideEmpty?: boolean;
  embedded?: boolean; onClose?: () => void; onBusyChange?: (busy: boolean) => void;
  tripId: string; data: TripCostsResponse | null; expenseId: string;
  onSaved: (payment: ExpensePayment) => void;
}) {
  const [draft, setDraft] = useState<PaymentInput | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [success, setSuccess] = useState("");
  const [justPaidId, setJustPaidId] = useState<string | null>(null);
  useEffect(() => {
    if (!justPaidId) return;
    const timeout = window.setTimeout(() => setJustPaidId(null), 1200);
    return () => window.clearTimeout(timeout);
  }, [justPaidId]);
  const busy = useRef(false);
  const editableCosts = data?.costs.filter((cost) => cost.canEdit && (!embedded || cost.id === expenseId)) || [];
  const payments = data?.payments.filter((payment) => (!embedded || payment.expense_id === expenseId) && (!statusFilter || payment.status === statusFilter || payment.id === justPaidId)) || [];

  function exportPayments() {
    const cell = (value: unknown) => '"' + String(value ?? "").replace(/^[=+@\-\t\r]/, "'$&").replaceAll('"', '""') + '"';
    const rows = [["Payment", "Traveller", "Amount GBP", "Status", "Due date", "Paid at"], ...(data?.payments || []).map(p => [p.label, p.payer.name, (p.amount_minor / 100).toFixed(2), p.status === "paid" ? "Paid" : p.claimed_at ? "Awaiting confirmation" : "Due", p.due_date, p.paid_at])];
    const url = URL.createObjectURL(new Blob(["\uFEFF" + rows.map(row => row.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "trip-payments.csv"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function open() {
    setError(""); setSuccess("");
    setDraft({ id: crypto.randomUUID(), expenseId: editableCosts.find((cost) => cost.id === expenseId)?.id || editableCosts[0]?.id || "", label: "", amount: "", payerId: "", status: "due" });
  }
  async function persist(input: PaymentInput | { id: string; status: "paid" | "due" }, method: "POST" | "PATCH") {
    if (busy.current) return;
    busy.current = true; onBusyChange?.(true); setBusyId(input.id); setError(""); setSuccess("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sign in to save payments.");
      const response = await fetch(`/api/trips/${tripId}/expenses/payments`, { method, headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify(input) });
      const result = await response.json() as { payment?: ExpensePayment; error?: string };
      if (!response.ok || !result.payment) throw new Error(result.error || "Unable to save payment.");
      if (method === "PATCH" && result.payment.status === "paid") setJustPaidId(result.payment.id);
      onSaved(result.payment);
      if (method === "POST") setDraft(null);
      setSuccess(method === "POST" ? "Payment added." : result.payment.claimed_at && result.payment.status !== "paid" ? "Sent to the organiser for confirmation." : input.status === "paid" ? "Payment marked as paid." : "Payment marked as due.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to save payment."); }
    finally { busy.current = false; onBusyChange?.(false); setBusyId(null); }
  }
  function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || !data) return;
    try { validatePayment(draft, data.people); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Check the payment details."); return; }
    void persist(draft, "POST");
  }

  return <section className={embedded ? styles.inlinePayments : styles.paymentSection}>
    <div className={styles.sectionHead}><h2>Expense payments</h2>{!embedded && data?.payments.length ? <button type="button" onClick={exportPayments}>Export CSV</button> : null}{embedded ? <div className={styles.costActions}>{editableCosts.length ? <button type="button" className={styles.accentButton} disabled={!editableCosts.length || Boolean(busyId) || Boolean(draft)} onClick={open}><FiPlus /> Add payment</button> : null}<button type="button" aria-label="Close expense payments" disabled={Boolean(busyId)} onClick={onClose}><FiX /></button></div> : null}</div>
    {error ? <p className={styles.formError} role="alert">{error}</p> : null}
    {success ? <p className={success === "Payment marked as paid." ? styles.srOnly : styles.success} role="status">{success}</p> : null}
    {draft && data ? <form className={styles.costForm} onSubmit={save}>
      <div className={styles.sectionHead}><h3>Add payment</h3><button type="button" aria-label="Close payment form" disabled={Boolean(busyId)} onClick={() => { setDraft(null); setError(""); }}><FiX /></button></div>
      <fieldset className={styles.formFields} disabled={Boolean(busyId)}><div className={styles.costFormGrid}>
        <label className={styles.wideField}>Linked expense<select required value={draft.expenseId} onChange={(event) => setDraft({ ...draft, expenseId: event.target.value })}>{editableCosts.map((cost) => <option key={cost.id} value={cost.id}>{cost.title}</option>)}</select></label>
        <label className={styles.wideField}>Payment name<input required maxLength={160} placeholder="e.g. Hotel deposit" value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} /></label>
        <label>Amount (£)<input required inputMode="decimal" placeholder="0.00" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} /></label>
        <label>Who pays?<select required value={draft.payerId} onChange={(event) => setDraft({ ...draft, payerId: event.target.value })}><option value="">Choose a traveller</option>{data.people.map((person) => <option value={person.id} key={person.id}>{person.name}</option>)}</select></label>
        <label>Status<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as "due" | "paid" })}><option value="due">Due</option><option value="paid">Paid</option></select></label>
      </div></fieldset>
      <p className={styles.hint}>This records a payment; it does not charge or transfer money.</p>
      <button type="submit" className={styles.accentButton} disabled={Boolean(busyId)}>{busyId ? "Saving…" : "Save payment"}</button>
    </form> : null}
    {!data ? <p className={styles.empty} role="status">Loading expense payments…</p> : payments.length ? <div className={styles.paymentList}>{payments.map((payment) => <article className={`${styles.paymentRow} ${justPaidId === payment.id ? styles.paymentJustPaid : ""}`} key={payment.id}>
      <div className={styles.paymentIdentity}><strong>{payment.label}</strong><span>{payment.payer.name} · {data.costs.find((cost) => cost.id === payment.expense_id)?.title || "Expense"}{payment.paid_at ? ` · ${new Date(payment.paid_at).toLocaleDateString("en-GB")}` : ""}</span>{payment.due_date && payment.status !== "paid" ? <span>Due {new Date(`${payment.due_date}T12:00:00`).toLocaleDateString("en-GB")}</span> : null}{payment.payment_instructions && payment.status !== "paid" ? <details><summary>Payment details</summary><p>{payment.payment_instructions}</p></details> : null}</div>
      <span className={payment.status === "paid" ? styles.paid : styles.status}>{payment.status === "paid" ? "Paid" : payment.claimed_at ? "Awaiting confirmation" : payment.due_date && payment.due_date < new Date().toISOString().slice(0, 10) ? "Overdue" : "Due"}</span>
      <div className={styles.paymentAmount}><strong>{money(payment.amount_minor)}</strong>{justPaidId === payment.id ? <span className={styles.paidConfirmation}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="m7 12 3 3 7-7" /></svg>Paid</span> : payment.canEdit ? <button type="button" aria-label={`${payment.status === "paid" ? "Mark due" : "Mark paid"}: ${payment.label} for ${payment.payer.name}`} disabled={Boolean(busyId)} onClick={() => void persist({ id: payment.id, status: payment.status === "paid" ? "due" : "paid" }, "PATCH")}>{busyId === payment.id ? "Saving…" : payment.status === "paid" ? "Mark due" : payment.claimed_at ? "Confirm paid" : "Mark paid"}</button> : payment.canClaim && payment.status !== "paid" ? <button type="button" disabled={Boolean(busyId)} onClick={() => void persist({ id: payment.id, status: payment.claimed_at ? "due" : "paid" }, "PATCH")}>{busyId === payment.id ? "Saving…" : payment.claimed_at ? "Withdraw claim" : "I’ve paid"}</button> : null}</div>
    </article>)}</div> : embedded ? <p className={styles.empty}>No payments recorded for this expense yet.</p> : hideEmpty ? null : <div className={styles.paymentsEmpty}>
      <Image src="/images/payments-empty-transparent.png" alt="" width={180} height={180} sizes="180px" />
      <h3>{statusFilter === "paid" ? "No paid payments yet" : statusFilter === "due" ? "No payments due" : "No payments yet"}</h3>
      <p>{statusFilter === "paid" ? "Payments you mark as paid will appear here." : "Payments added to your expenses will appear here."}</p>
    </div>}
  </section>;
}
