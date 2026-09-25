"use client";

import Link from "next/link";
import { FiArrowUpRight, FiCalendar, FiCheck, FiGrid, FiMapPin, FiUsers } from "react-icons/fi";
import type { DashboardSummaryResponse } from "./dashboard-client";
import styles from "./dashboard-analytics.module.css";

type Trip = DashboardSummaryResponse["trips"][number];
const palette = ["#3c8ff6", "#8b6cef", "#20b6a5", "#efa34e", "#ec789a", "#6f8ba8"];
const categories = ["hotels", "activities", "transport", "dining"] as const;
const labels = ["Stay", "Do", "Travel", "Eat"];

export function DashboardInsightTiles({ trips }: { trips: Trip[] }) {
  const invited = trips.reduce((sum, item) => sum + item.summary.participantSummary.invited, 0);
  const confirmed = trips.reduce((sum, item) => sum + item.summary.participantSummary.confirmed, 0);
  const confirmationRate = invited ? Math.round(confirmed / invited * 100) : 0;
  const covered = trips.reduce((sum, item) => sum + categories.filter((key) => item.planningCounts[key] > 0).length, 0);
  const coverage = trips.length ? Math.round(covered / (trips.length * 4) * 100) : 0;
  const destinations = new Map<string, { label: string; count: number; id: string }>();
  const phases = new Map<string, number>();
  for (const item of trips) {
    const destination = item.trip.destination?.trim();
    if (destination) {
      const key = destination.toLocaleLowerCase();
      const entry = destinations.get(key);
      destinations.set(key, { label: entry?.label || destination, count: (entry?.count || 0) + 1, id: entry?.id || item.trip.id });
    }
    phases.set(item.summary.phaseLabel, (phases.get(item.summary.phaseLabel) || 0) + 1);
  }
  const destinationList = [...destinations.values()].sort((a, b) => b.count - a.count);
  const phaseList = [...phases.entries()].sort((a, b) => b[1] - a[1]);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = trips.filter((item) => item.trip.status !== "cancelled" && item.trip.starts_at && new Date(item.trip.starts_at).getTime() >= today.getTime())
    .sort((a, b) => new Date(a.trip.starts_at!).getTime() - new Date(b.trip.starts_at!).getTime());
  const next = upcoming[0];
  const decisions = [...trips].filter((item) => item.trip.status !== "cancelled" && item.trip.status !== "completed" && (!item.trip.ends_at || new Date(item.trip.ends_at).getTime() >= today.getTime()))
    .sort((a, b) => b.summary.participantSummary.outstanding - a.summary.participantSummary.outstanding);

  return <>
    <article className={`${styles.card} ${styles.confirmationTile}`}>
      <div className={styles.cardHeading}><h3>Who’s coming</h3><FiUsers aria-hidden="true" /></div>
      <div className={styles.tileNumber}><strong>{invited ? confirmationRate : "—"}<small>{invited ? "%" : ""}</small></strong><span>{confirmed} of {invited}<br />places confirmed</span></div>
      <div className={styles.waffle} role="img" aria-label={`${confirmed} confirmed places out of ${invited} invitations; ${confirmationRate}% confirmed`}>
        {Array.from({ length: 40 }, (_, index) => <span key={index} style={{ background: index < Math.round(confirmationRate / 2.5) ? "#8b6cef" : "#e9e2fa" }} />)}
      </div>
      <p className={styles.tileCaption}>{invited ? "Traveller places across selected trips" : "Invite travellers to see confirmations"}</p>
    </article>

    <article className={styles.card}>
      <div className={styles.cardHeading}><h3>Planning coverage</h3><span className={styles.countBadge}>{coverage}%</span></div>
      <div className={styles.coverageHeader}><span>Trip</span>{labels.map((label) => <span key={label}>{label}</span>)}</div>
      <div className={styles.tileScroll}>
        {trips.map((item) => <Link key={item.trip.id} href={`/trips/${item.trip.id}`} className={styles.coverageRow}>
          <strong title={item.trip.title}>{item.trip.title}</strong>
          {categories.map((key, index) => <span key={key} className={item.planningCounts[key] ? styles.covered : styles.uncovered} aria-label={`${key}: ${item.planningCounts[key]} options`} title={`${key}: ${item.planningCounts[key]} options`} style={item.planningCounts[key] ? { background: palette[index] } : undefined}>{item.planningCounts[key] ? <FiCheck aria-hidden="true" /> : "–"}</span>)}
        </Link>)}
      </div>
      <p className={styles.tileCaption}>{covered} of {trips.length * 4} categories have saved options</p>
    </article>

    <article className={`${styles.card} ${styles.destinationTile}`}>
      <div className={styles.cardHeading}><h3>On the map</h3><FiMapPin aria-hidden="true" /></div>
      <div className={styles.destinationSummary}><strong>{destinations.size}</strong><span>{destinations.size === 1 ? "destination" : "destinations"}</span></div>
      <div className={styles.destinationList}>
        {destinationList.length ? destinationList.map((item, index) => <Link key={item.label} href={`/trips/${item.id}`} className={styles.destinationRow}><span className={styles.destinationIndex}>{String(index + 1).padStart(2, "0")}</span><strong>{item.label}</strong><span>{item.count} {item.count === 1 ? "trip" : "trips"}</span></Link>) : <p className={styles.tileCaption}>Choose a destination in your trip.</p>}
      </div>
    </article>

    <article className={styles.card}>
      <div className={styles.cardHeading}><h3>Planning stages</h3><FiGrid aria-hidden="true" /></div>
      <div className={styles.stageBar} role="img" aria-label={phaseList.map(([label, count]) => `${label}: ${count} trips`).join(", ")}>
        {phaseList.map(([label, count], index) => <span key={label} title={`${label}: ${count}`} style={{ width: `${count / trips.length * 100}%`, background: palette[index % palette.length] }} />)}
      </div>
      <div className={styles.stageLegend}>{phaseList.map(([label, count], index) => <div key={label}><i style={{ background: palette[index % palette.length] }} /><span>{label}</span><strong>{count}</strong></div>)}</div>
    </article>

    <article className={`${styles.card} ${styles.departureTile}`}>
      <div className={styles.cardHeading}><h3>Next departure</h3><FiCalendar aria-hidden="true" /></div>
      {next ? <>
        <div className={styles.departureDate}><strong>{new Date(next.trip.starts_at!).getDate()}</strong><span>{new Date(next.trip.starts_at!).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}</span></div>
        <Link className={styles.departureLink} href={`/trips/${next.trip.id}`}><strong>{next.trip.title}</strong><FiArrowUpRight /></Link>
        <p className={styles.tileCaption}>{next.trip.destination || "Destination to decide"}</p>
        <span className={styles.departurePill}>{upcoming.length} upcoming {upcoming.length === 1 ? "trip" : "trips"}</span>
      </> : <div className={styles.noDeparture}><FiCalendar /><strong>No upcoming dates</strong><Link href="/trips">Set your travel dates <FiArrowUpRight /></Link></div>}
    </article>

    <article className={styles.card}>
      <div className={styles.cardHeading}><h3>Next decisions</h3><span className={styles.countBadge}>{decisions.length} {decisions.length === 1 ? "trip" : "trips"}</span></div>
      <div className={styles.decisionList}>{decisions.length ? decisions.map((item) => <Link key={item.trip.id} href={`/trips/${item.trip.id}`} className={styles.decisionRow}><span className={styles.decisionDot} /><div><strong>{item.trip.title}</strong><span>{item.summary.currentDecision}</span></div><FiArrowUpRight /></Link>) : <p className={styles.tileCaption}>No active trips to plan.</p>}</div>
    </article>
  </>;
}
