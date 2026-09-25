"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import styles from "./trip-expenses.module.css";
type Category = "hotels" | "activities" | "transport" | "dining";
type DecisionData = { isOwner: boolean; trip: { voting_deadline: string | null; status: string }; decisions: { category: Category; option_id: string }[]; history: { category: Category; action: string; reason: string; created_at: string }[]; options: Record<Category, { id: string; name?: string; title?: string; mode?: string }[]> };
const label = (option?: { name?: string; title?: string; mode?: string }) => option?.name || option?.title || option?.mode || "Selected option";
export function TripDecisions({ tripId, onTripChange }: { tripId: string; onTripChange?: (trip: DecisionData["trip"]) => void }) {
  const [data, setData] = useState<DecisionData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState<Category>("hotels");
  const [optionId, setOptionId] = useState("");
  const [reason, setReason] = useState("");
  const [cancelConfirmed, setCancelConfirmed] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [deadline, setDeadline] = useState("");
  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const response = await fetch(`/api/trips/${tripId}/decisions`, { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Unable to load decisions.");
    setData(result);
    return result as DecisionData;
  }, [tripId]);
  useEffect(() => { void load().catch(e => setError(e.message)); }, [load]);
  async function save(reopen: boolean, cancel = false) {
    setBusy(true); setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sign in to update decisions.");
      const response = await fetch(`/api/trips/${tripId}/decisions`, { method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ ...(cancel ? { action: "cancel" } : {}), category, optionId: reopen ? null : optionId, reason: cancel ? cancelReason : reason, deadline: reopen && deadline ? new Date(deadline).toISOString() : null }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save decision.");
      const updated = await load(); if (updated) onTripChange?.(updated.trip); setReason(""); setOptionId(""); setCancelConfirmed(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to update decision."); }
    finally { setBusy(false); }
  }
  const locked = data?.decisions.find(d => d.category === category);
  const closed = data?.trip.voting_deadline && Date.parse(data.trip.voting_deadline) <= Date.now();
  return <details className={styles.decisions}>
    <summary>Trip decisions <span>{data ? `${data.decisions.length}/4 locked` : ""}</span></summary>
    {error ? <p role="alert" className={styles.formError}>{error}</p> : null}
    {data ? <div className={styles.costForm}>
      <p className={styles.hint}>{data.trip.status === "cancelled" ? "This trip is cancelled. Voting and reminders are stopped; payment records are kept for reconciliation. " : ""}{data.trip.voting_deadline ? `${closed ? "Voting closed" : "Voting closes"} ${new Date(data.trip.voting_deadline).toLocaleString("en-GB")}.` : "No voting deadline set."} Locked choices stay fixed until the organiser reopens them.</p>
      <div className={styles.decisionGrid}>{(Object.keys(data.options) as Category[]).map(key => {
        const decision = data.decisions.find(d => d.category === key);
        return <div key={key}><strong>{key[0].toUpperCase() + key.slice(1)}</strong><span>{decision ? `Locked · ${label(data.options[key].find(o => o.id === decision.option_id))}` : closed ? "Voting closed · awaiting decision" : "Open for votes"}</span></div>;
      })}</div>
      {data.isOwner && !["cancelled", "closed", "completed"].includes(data.trip.status) ? <form className={styles.costForm} onSubmit={event => { event.preventDefault(); void save(Boolean(locked || closed)); }}>
        <fieldset disabled={busy} className={styles.formFields}><div className={styles.costFormGrid}>
          <label>Category<select value={category} onChange={e => { setCategory(e.target.value as Category); setOptionId(""); }}>{Object.keys(data.options).map(key => <option key={key} value={key}>{key[0].toUpperCase() + key.slice(1)}</option>)}</select></label>
          {!locked ? <label>Final choice<select value={optionId} onChange={e => setOptionId(e.target.value)}><option value="">Choose an option</option>{data.options[category].map(option => <option value={option.id} key={option.id}>{label(option)}</option>)}</select></label> : null}
          <label className={styles.wideField}>Reason / tie-break explanation<input maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} placeholder="Explain the decision to the group" /></label>
          {locked || closed ? <label>Reopen voting until<input type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)} /></label> : null}
        </div></fieldset>
        <div className={styles.costActions}>{!locked ? <button className={styles.accentButton} disabled={busy || !optionId || reason.trim().length < 3} type="button" onClick={() => void save(false)}>Lock choice</button> : null}{locked || closed ? <button type="submit" disabled={busy || !deadline || reason.trim().length < 3}>Reopen voting</button> : null}</div>
      </form> : null}
      {data.isOwner && ["active", "draft"].includes(data.trip.status) ? <details><summary>Cancel trip</summary><p className={styles.hint}>Stops voting and reminders. Existing expenses and payments stay available; no refunds are sent.</p><form className={styles.costForm} onSubmit={event => { event.preventDefault(); if (cancelConfirmed) void save(false, true); }}><label>Reason<input required minLength={3} maxLength={1000} value={cancelReason} onChange={event => setCancelReason(event.target.value)} /></label><label><input type="checkbox" checked={cancelConfirmed} onChange={event => setCancelConfirmed(event.target.checked)} /> Cancel this trip and notify its travellers</label><button type="submit" disabled={busy || !cancelConfirmed || cancelReason.trim().length < 3}>Confirm cancellation</button></form></details> : null}
      {data.history.length ? <details><summary>Decision history</summary><ul>{data.history.map((entry, index) => <li key={`${entry.created_at}-${index}`}>{entry.category} {entry.action} · {new Date(entry.created_at).toLocaleString("en-GB")}{entry.reason ? ` — ${entry.reason}` : ""}</li>)}</ul></details> : null}
    </div> : null}
  </details>;
}
