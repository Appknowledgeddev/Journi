"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import styles from "./notification-preferences.module.css";
const labels = { in_app: "In-app notifications", email: "Email notifications", invites: "Invites and membership", planning: "Votes, replies and decisions", payments: "Payments and due-date reminders" };
type Preferences = Record<keyof typeof labels, boolean>;
export function NotificationPreferences() {
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sign in to manage notifications.");
      const response = await fetch("/api/notifications/preferences", { headers: { Authorization: `Bearer ${session.access_token}` } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (active) { setPreferences(result.preferences); setError(""); }
    })().catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [retry]);
  async function toggle(key: keyof Preferences) {
    if (!preferences || busy) return;
    setBusy(true); setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sign in to save preferences.");
      const response = await fetch("/api/notifications/preferences", { method: "PATCH", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ ...preferences, [key]: !preferences[key] }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setPreferences(result.preferences);
    } catch(e) { setError(e instanceof Error ? e.message : "Unable to save preferences."); }
    finally { setBusy(false); }
  }
  return <section className={styles.preferences}><h2>Notifications</h2><p>Choose what you receive and where. Changes apply to future notifications.</p>{error ? <p role="alert">{error} {!preferences ? <button onClick={() => setRetry(value => value + 1)}>Try again</button> : null}</p> : null}{preferences ? <div >{(Object.keys(labels) as (keyof Preferences)[]).map(key => <div className={styles.row} key={key}><span>{labels[key]}</span><button type="button" role="switch" aria-checked={preferences[key]} aria-label={labels[key]} disabled={busy} onClick={() => void toggle(key)} className={styles.toggle}>{preferences[key] ? "On" : "Off"}</button></div>)}</div> : !error ? <p role="status">Loading preferences…</p> : null}</section>;
}
