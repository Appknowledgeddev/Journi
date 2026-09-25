"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FiCheckCircle, FiClock, FiCreditCard, FiClipboard, FiPlus } from "react-icons/fi";
import { supabase } from "@/lib/supabase/client";
import { TripCostsManager, type TripCostsManagerHandle } from "./trip-costs-manager";
import { type TripCostsResponse } from "@/lib/expenses/shared";
import { TripExpensePayments } from "./trip-expense-payments";
import { AnimatedExpenseNumber } from "./animated-expense-number";
import styles from "./trip-expenses.module.css";

type Payment = { id: string; status: string; amount: number | null; currency: string | null; created_at: string; paid_at: string | null; metadata: Record<string, unknown> | null };
type PlannedCost = { id: string; category: "hotel" | "activity" | "transport" | "dining"; title: string; amount: number | null; currency: string | null; location: string | null; notes?: string | null };
type Expenses = { payments: Payment[]; selectionExpenses: PlannedCost[]; warning?: string; paymentScope: "personal" | "trip"; error?: string };
function currencyOf(value: string | null) { return value?.trim().toUpperCase() || "Unspecified"; }
function money(value: number | null, currency: string) {
  if (value === null || !Number.isFinite(Number(value))) return "Not priced";
  try { return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(Number(value)); }
  catch { return `${Number(value).toFixed(2)} (${currency})`; }
}

export function TripExpenses({ tripId, embedded = false, onReady }: { tripId: string; embedded?: boolean; onReady?: (ready: boolean) => void }) {
  const [data, setData] = useState<Expenses | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [view, setView] = useState<"expenses" | "payments">("expenses");
  const [paymentStatus, setPaymentStatus] = useState<"due" | "paid">("due");
  const costsManager = useRef<TripCostsManagerHandle>(null);
  const [createNotice, setCreateNotice] = useState("");
  const [ledgerReady, setLedgerReady] = useState(false);
  const [ledger, setLedger] = useState<TripCostsResponse | null>(null);
  const [creationHost, setCreationHost] = useState<HTMLDivElement | null>(null);
  const [creatingExpense, setCreatingExpense] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("Sign in to view expenses.");
        const response = await fetch(`/api/my-expenses?tripId=${encodeURIComponent(tripId)}`, { headers: { Authorization: `Bearer ${session.access_token}` }, signal: controller.signal, cache: "no-store" });
        const result = await response.json() as Expenses;
        if (!response.ok) throw new Error(result.error || "Unable to load expenses.");
        if (!controller.signal.aborted) setData(result);
      } catch (caught) {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Unable to load expenses.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [tripId, revision]);

  useEffect(() => {
    if (!loading && (error || ledgerReady)) onReady?.(true);
  }, [loading, error, ledgerReady, onReady]);

  if (loading) return <div className={styles.state} role="status">Loading trip expenses…</div>;
  if (error || !data) return <div className={styles.state} role="alert"><p>{error || "Expenses unavailable."}</p><button onClick={() => setRevision((value) => value + 1)}>Try again</button></div>;
  const payments = data.payments;
  const allPayments = [...payments, ...(ledger?.payments || []).map((payment) => ({ amount: payment.amount_minor / 100, currency: payment.currency, status: payment.status }))];
  const dueCount = allPayments.filter((payment) => ["due", "pending", "overdue"].includes(payment.status)).length;
  const paidCount = allPayments.filter((payment) => payment.status === "paid").length;
  function totalByCurrency(statuses: string[]) {
    const totals = new Map<string, number>();
    for (const item of allPayments) {
      if (!statuses.includes(item.status) || item.amount === null) continue;
      const currency = currencyOf(item.currency);
      totals.set(currency, (totals.get(currency) || 0) + Number(item.amount));
    }
    const amounts = totals.size ? [...totals] : [["GBP", 0] as const];
    return amounts.map(([currency, total], index) => <span key={currency}>{index > 0 ? " · " : null}<AnimatedExpenseNumber value={total} currency={currency} /></span>);
  }
  const visibleOnlinePayments = payments.filter((payment) => paymentStatus === "paid" ? payment.status === "paid" : ["due", "pending", "overdue"].includes(payment.status));
  const unknownPayments = visibleOnlinePayments.filter((item) => item.amount === null).length;

  return <div className={`${styles.expenseLayout} ${creatingExpense ? styles.expenseLayoutOpen : ""}`} data-expense-creation-open={creatingExpense}>
    <div className={`${styles.workspace} ${styles.expenseMain}`}>
    <div className={styles.metrics}>
      <article><FiClipboard /><span>{ledger?.scope === "personal" ? "Your share" : "Planned"}</span><strong>{ledger ? <AnimatedExpenseNumber value={(ledger.scope === "personal" ? ledger.payments.reduce((sum, payment) => sum + payment.amount_minor, 0) : ledger.costs.filter((cost) => cost.kind === "planned").reduce((sum, cost) => sum + cost.amount_minor, 0)) / 100} currency="GBP" /> : "—"}</strong></article>
      <article><FiCheckCircle /><span>Paid</span><strong>{ledger ? totalByCurrency(["paid"]) : "—"}</strong></article>
      <article><FiClock /><span>Outstanding</span><strong>{ledger ? totalByCurrency(["due", "pending", "overdue"]) : "—"}</strong></article>
      <article><FiCreditCard /><span>Payment records</span><strong>{ledger ? <AnimatedExpenseNumber value={allPayments.length} /> : "—"}</strong></article>
    </div>
    <div className={styles.expenseToolbar}>
    <div className={styles.pillMenus}>
    <div className={styles.viewToggle} role="group" aria-label="Expense view">
      <button type="button" aria-pressed={view === "expenses"} onClick={() => setView("expenses")}>Expenses</button>
      <button type="button" aria-pressed={view === "payments"} onClick={() => setView("payments")}>Payments <span>{allPayments.length}</span></button>
    </div>
    <div className={`${styles.paymentFilterReveal} ${view === "payments" ? styles.paymentFilterOpen : ""}`} aria-hidden={view !== "payments"} inert={view !== "payments"}>
    <div className={styles.paymentFilterClip}>
    <div className={styles.paymentFilter} role="group" aria-label="Payment status">
      <button type="button" aria-pressed={paymentStatus === "due"} onClick={() => setPaymentStatus("due")}>Due <span className={styles.filterCount}>{ledger ? dueCount : "—"}</span></button>
      <button type="button" aria-pressed={paymentStatus === "paid"} onClick={() => setPaymentStatus("paid")}>Paid <span className={styles.filterCount}>{ledger ? paidCount : "—"}</span></button>
    </div>
    </div>
    </div>
    </div>
    {ledger?.scope === "trip" ? <button type="button" className={styles.addExpenseButton} disabled={!ledger} onClick={() => {
      const opened = costsManager.current?.createFromOption({ title: "", amount: "", category: "other", notes: "" });
      setCreateNotice(opened ? "" : "Finish or cancel the open expense form before creating another expense.");
      setView("expenses");
    }}><FiPlus /> Add expense</button> : null}
    </div>
    <div hidden={view !== "expenses"}>
      {createNotice ? <p className={styles.notice} role="status">{createNotice}</p> : null}
      <TripCostsManager ref={costsManager} tripId={tripId} onDataChange={setLedger} onLoadReady={setLedgerReady} creationHost={creationHost} onCreationChange={setCreatingExpense} planningOptions={data.selectionExpenses} />
    </div>
    <div className={styles.paymentsView} hidden={view !== "payments"}>
    <TripExpensePayments tripId={tripId} data={ledger} expenseId="" statusFilter={paymentStatus} hideEmpty={visibleOnlinePayments.length > 0} onSaved={(payment) => costsManager.current?.updatePayment(payment)} />
    {data.warning ? <p className={styles.notice} role="status">{data.warning}</p> : null}
    {visibleOnlinePayments.length ? <section className={styles.panel}>
      <div className={styles.sectionHead}><h2>{data.paymentScope === "personal" ? "Your online payments" : "Online payments"}</h2></div>
      {unknownPayments ? <p className={styles.hint}>{unknownPayments} payment {unknownPayments === 1 ? "record has" : "records have"} no amount and {unknownPayments === 1 ? "is" : "are"} excluded from totals.</p> : null}
      {visibleOnlinePayments.length ? <div className={styles.tableScroll}><table><thead><tr><th>Payment</th><th>Date</th><th>Status</th><th>Amount</th></tr></thead><tbody>{visibleOnlinePayments.map((payment) => <tr key={payment.id}><td>{typeof payment.metadata?.label === "string" ? payment.metadata.label : typeof payment.metadata?.name === "string" ? payment.metadata.name : "Trip payment"}</td><td>{new Date(payment.paid_at || payment.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</td><td><span className={payment.status === "paid" ? styles.paid : styles.status}>{payment.status}</span></td><td>{money(payment.amount, currencyOf(payment.currency))}</td></tr>)}</tbody></table></div> : <p className={styles.empty}>{data.warning ? "Payment history is unavailable." : "No payment records for this trip yet."}</p>}
    </section> : null}
    </div>
    {!embedded ? <Link className={styles.back} href={`/trips/${tripId}`}>← Back to trip</Link> : null}
    </div>
    <aside className={styles.creationPanel} aria-label="New expense" aria-hidden={!creatingExpense} inert={!creatingExpense}>
      <div ref={setCreationHost} className={`${styles.workspace} ${styles.creationContent}`} />
    </aside>
  </div>;
}
