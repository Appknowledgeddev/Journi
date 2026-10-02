"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { BackofficeRail } from "@/components/backoffice-rail";
import styles from "../../backoffice.module.css";
import guide from "../billing/page.module.css";
import { notificationSections, notificationScenarios } from "./content";

export default function NotificationsGuide() {
  const [query, setQuery] = useState("");
  const scenarios = notificationScenarios.filter(row => row.join(" ").toLowerCase().includes(query.trim().toLowerCase()));
  const [access, setAccess] = useState<"loading" | "allowed" | "denied">("loading");
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          if (!cancelled) setAccess("denied");
          return;
        }
        const response = await fetch("/api/backoffice/summary", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!cancelled) setAccess(response.ok ? "allowed" : "denied");
      } catch {
        if (!cancelled) setAccess("denied");
      }
    })();
    return () => { cancelled = true; };
  }, []);
  if (access !== "allowed") return (
    <main className={guide.document}>
      <h1>Emails and notifications documentation</h1>
      <p role="status">{access === "loading" ? "Checking backoffice access…" : "An authorised backoffice session is required to view this guide."}</p>
      {access === "denied" ? <Link href="/signin?next=/backoffice/documentation/notifications">Sign in to backoffice</Link> : null}
    </main>
  );
  return <main className={styles.backoffice}>
    <BackofficeRail active="documentation" />
    <section className={styles.workspace}>
      <header className={styles.header}>
        <div><p className={styles.kicker}>Documentation · Emails and notifications</p><h1>How emails and notifications work</h1><span>Current implementation · Reviewed 2 October 2026</span></div>
        <Link className={styles.exitLink} href="/backoffice#documentation">All documentation</Link>
      </header>
      <div className={guide.document}>
        <p className={guide.intro}>A reference for recipients, preferences, email templates, webhook delivery, the account bell and queued reminders. Includes current limitations and troubleshooting scenarios.</p>
        <nav className={guide.contents} aria-label="Notification guide contents">
          <a href="#scenarios">Notification scenarios · {notificationScenarios.length} cases</a>
          {notificationSections.map(section => <a key={section.id} href={`#${section.id}`}>{section.title}</a>)}
        </nav>
        <section id="scenarios" className={guide.section}>
          <h2>Notification scenarios</h2>
          <div className={guide.scenarioControls}><label>Search scenarios<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Try email, reminder, failed…" /></label></div>
          <p role="status">Showing {scenarios.length} of {notificationScenarios.length} scenarios</p>
          {scenarios.map(([title, outcome]) => <details key={title} className={guide.scenario}><summary><strong>{title}</strong></summary><div><h4>What happens now</h4><p>{outcome}</p></div></details>)}
          {!scenarios.length ? <p>No matching scenarios. <button type="button" onClick={() => setQuery("")}>Clear search</button></p> : null}
        </section>
        {notificationSections.map(section => <section key={section.id} id={section.id} className={guide.section}>
          <h2>{section.title}</h2>{section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
          <details><summary>Implementation references</summary><ul>{section.sources.map(source => <li key={source}><code>{source}</code></li>)}</ul></details>
        </section>)}

      </div>
    </section>
  </main>;
}
