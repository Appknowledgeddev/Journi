"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { BackofficeRail } from "@/components/backoffice-rail";
import styles from "../../backoffice.module.css";
import guide from "../billing/page.module.css";
import { visibilitySections, visibilityScenarios } from "./content";

export default function TripVisibilityGuide() {
  const [query, setQuery] = useState("");
  const scenarios = visibilityScenarios.filter(row => row.join(" ").toLowerCase().includes(query.trim().toLowerCase()));
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
      <h1>Trip visibility documentation</h1>
      <p role="status">{access === "loading" ? "Checking backoffice access…" : "An authorised backoffice session is required to view this guide."}</p>
      {access === "denied" ? <Link href="/signin?next=/backoffice/documentation/trip-visibility">Sign in to backoffice</Link> : null}
    </main>
  );
  return <main className={styles.backoffice}>
    <BackofficeRail active="documentation" />
    <section className={styles.workspace}>
      <header className={styles.header}>
        <div><p className={styles.kicker}>Documentation · Trip visibility</p><h1>Who can see a trip?</h1><span>Current implementation · Reviewed 2 October 2026</span></div>
        <Link className={styles.exitLink} href="/backoffice#documentation">All documentation</Link>
      </header>
      <div className={guide.document}>
        <p className={guide.intro}>Visibility controls discovery. Membership controls participant access. This guide explains both, the data each viewer receives, and the current exceptions.</p>
        <nav className={guide.contents} aria-label="Visibility guide contents">
          <a href="#scenarios">Visibility scenarios · {visibilityScenarios.length} cases</a>
          {visibilitySections.map(section => <a key={section.id} href={`#${section.id}`}>{section.title}</a>)}
        </nav>
        <section id="scenarios" className={guide.section}>
          <h2>Visibility scenarios</h2>
          <div className={guide.scenarioControls}><label>Search scenarios<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Try private, invited, expenses…" /></label></div>
          <p role="status">Showing {scenarios.length} of {visibilityScenarios.length} scenarios</p>
          {scenarios.map(([title, outcome]) => <details key={title} className={guide.scenario}><summary><strong>{title}</strong></summary><div><h4>What happens now</h4><p>{outcome}</p></div></details>)}
          {!scenarios.length ? <p>No matching scenarios. <button type="button" onClick={() => setQuery("")}>Clear search</button></p> : null}
        </section>
        {visibilitySections.map(section => <section key={section.id} id={section.id} className={guide.section}>
          <h2>{section.title}</h2>{section.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
          <details><summary>Implementation references</summary><ul>{section.sources.map(source => <li key={source}><code>{source}</code></li>)}</ul></details>
        </section>)}
        <section className={guide.section}><h2>Support checks</h2><p>Confirm the signed-in account, trip owner, status and persisted visibility. Then inspect both participant status fields and the user ID/email match. Compare a fresh API response with any stale tab, clear discovery filters, and check schema compatibility or seed ownership. Use the separate expense or messaging checks for those features rather than assuming trip access grants everything.</p></section>
      </div>
    </section>
  </main>;
}
