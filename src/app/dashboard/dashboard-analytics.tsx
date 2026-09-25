"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { FiArrowUpRight, FiCheckCircle, FiClock, FiCompass, FiMap, FiUsers } from "react-icons/fi";
import type { DashboardSummaryResponse } from "./dashboard-client";
import { DashboardInsightTiles } from "./dashboard-insight-tiles";
import styles from "./dashboard-analytics.module.css";

const categories = [
  { key: "hotels", label: "Places to stay", color: "#3c8ff6" },
  { key: "activities", label: "Things to do", color: "#8b6cef" },
  { key: "transport", label: "Getting around", color: "#20b6a5" },
  { key: "dining", label: "Food & drink", color: "#efa34e" },
] as const;

export function DashboardAnalytics({ data, loading, error }: {
  data: DashboardSummaryResponse | null;
  loading: boolean;
  error: string | null;
}) {
  const [tripId, setTripId] = useState("all");
  const [sort, setSort] = useState("attention");
  const trips = data?.trips ?? [];
  const selected = tripId === "all" ? trips : trips.filter((item) => item.trip.id === tripId);
  const participants = selected.reduce((total, item) => ({
    invited: total.invited + item.summary.participantSummary.invited,
    responded: total.responded + item.summary.participantSummary.responded,
    outstanding: total.outstanding + item.summary.participantSummary.outstanding,
  }), { invited: 0, responded: 0, outstanding: 0 });
  const responseRate = participants.invited ? Math.round(participants.responded / participants.invited * 100) : 0;
  const planning = categories.map((category) => ({ ...category, count: selected.reduce((total, item) => total + item.planningCounts[category.key], 0) }));
  const options = planning.reduce((sum, item) => sum + item.count, 0);
  const maxOptions = Math.max(...planning.map((item) => item.count), 1);
  const confidence = selected.length ? Math.round(selected.reduce((sum, item) => sum + item.summary.confidenceScore, 0) / selected.length) : 0;
  const ranked = [...selected].sort((a, b) => sort === "attention" ? a.summary.confidenceScore - b.summary.confidenceScore : b.summary.confidenceScore - a.summary.confidenceScore);
  const metrics = [
    { label: "Your trips", value: data?.totals.trips, note: "Across your workspace", icon: FiMap, color: "#3c8ff6" },
    { label: "Awaiting a reply", value: data?.totals.outstandingResponses, note: "Invitations to follow up", icon: FiClock, color: "#db8a27" },
    { label: "Ready to decide", value: data?.totals.readyToDecide, note: "Time to make the next call", icon: FiCheckCircle, color: "#17a795" },
    { label: "Confirmed places", value: data?.totals.confirmedParticipants, note: "Traveller places across trips", icon: FiUsers, color: "#8b6cef" },
  ];

  return (
    <section className={styles.analytics} aria-label="Trip analytics" aria-busy={loading}>
      <div className={styles.metrics}>
        {metrics.map(({ label, value, note, icon: Icon, color }) => (
          <article key={label} className={styles.metric} title={note} style={{ "--chart-color": color } as CSSProperties}>
            <div className={styles.metricTop}><span>{label}</span><span className={styles.metricIcon}><Icon /></span></div>
            <strong className={styles.metricValue}>{loading ? "…" : error || !data ? "—" : (value ?? 0).toLocaleString()}</strong>

          </article>
        ))}
      </div>

      <div className={styles.heading}>
        <h2>Trip overview</h2>
        <label className={styles.filter}><FiCompass aria-hidden="true" /><span className={styles.srOnly}>Filter analytics by trip</span>
          <select value={tripId} onChange={(event) => setTripId(event.target.value)} disabled={loading || !trips.length}>
            <option value="all">All trips</option>
            {trips.map(({ trip }) => <option key={trip.id} value={trip.id}>{trip.title}</option>)}
          </select>
        </label>
      </div>

      {loading ? <div className={styles.loading} role="status"><span /><span /><span /><p>Bringing your trip insights together…</p></div> : error || !data ? (
        <div className={styles.empty}><FiCompass /><h3>Insights are unavailable</h3><p>Your trip data couldn’t be loaded. Refresh the page to try again.</p></div>
      ) : !trips.length ? (
        <div className={styles.empty}><FiCompass /><h3>Every great trip starts with an idea.</h3><p>Create your first trip to start tracking responses, plans and progress.</p><Link href="/trip-organiser?fresh=1">Plan your first trip <FiArrowUpRight /></Link></div>
      ) : (
        <>
          <div className={styles.chartGrid}>
            <article className={`${styles.card} ${styles.responseCard}`}>
              <div className={styles.cardHeading}><h3>Traveller responses</h3><FiUsers aria-hidden="true" /></div>
              <div className={styles.responseBody}>
                <div className={styles.ring}>
                  <svg viewBox="0 0 200 200" role="img" aria-label={participants.invited ? `${responseRate}% response rate. ${participants.responded} responded, ${participants.outstanding} awaiting reply.` : "No invitations yet"}>
                    <circle cx="100" cy="100" r="80" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="15" />
                    <circle className={styles.ringArc} cx="100" cy="100" r="80" fill="none" stroke="#79e4d2" strokeWidth="15" strokeLinecap={responseRate ? "round" : "butt"} pathLength="100" strokeDasharray={`${responseRate} 100`} transform="rotate(-90 100 100)" />
                  </svg>
                  <div className={styles.ringLabel}><strong>{participants.invited ? `${responseRate}%` : "—"}</strong><span>response rate</span></div>
                </div>
                <div className={styles.responseLegend}>
                  <div><span><i style={{ background: "#79e4d2" }} />Responded</span><strong>{participants.responded}</strong></div>
                  <div><span><i style={{ background: "#8d9ebc" }} />Awaiting reply</span><strong>{participants.outstanding}</strong></div>
                  <p>{participants.invited ? `${participants.invited} invitations across ${selected.length === 1 ? "this trip" : `${selected.length} trips`}` : "No invitations yet"}</p>
                </div>
              </div>

            </article>

            <article className={styles.card}>
              <div className={styles.cardHeading}><h3>Saved plans</h3><span className={styles.countBadge}>{options} options</span></div>
              <div className={styles.planningBars}>
                {planning.map((item) => (
                  <div className={styles.barRow} key={item.key}>
                    <div><span><i style={{ background: item.color }} />{item.label}</span><strong>{item.count}</strong></div>
                    <div className={styles.barTrack} role="img" aria-label={`${item.label}: ${item.count} saved options`}><span style={{ width: `${item.count / maxOptions * 100}%`, background: item.color }} /></div>
                  </div>
                ))}
              </div>
              {!options ? <p className={styles.cardFootnote}>No saved options yet.</p> : null}
            </article>

          <article className={`${styles.card} ${styles.confidenceCard}`}>
            <div className={styles.cardHeading}>
              <h3>Trip confidence</h3>
              <span className={styles.countBadge} title="Average planning confidence based on dates, responses and decisions">{confidence}% avg.</span>
            </div>
            <label className={styles.sort}><span className={styles.srOnly}>Sort trips by confidence</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="attention">Needs attention first</option><option value="confidence">Most confident first</option></select></label>
            <div className={styles.confidenceBody}>
              <div className={styles.tripChart}>
                <div className={styles.tripRows}>
                  {ranked.map((item) => <Link className={styles.tripRow} key={item.trip.id} href={`/trips/${item.trip.id}`} title={item.summary.confidenceMessage}>
                    <div className={styles.tripLabel}><strong>{item.trip.title}</strong><span>{item.summary.phaseLabel}</span></div>
                    <div className={styles.tripTrack}><span style={{ width: `${Math.min(100, Math.max(0, item.summary.confidenceScore))}%` }} /></div>
                    <span className={styles.tripScore}>{item.summary.confidenceScore}% <FiArrowUpRight /></span>
                  </Link>)}
                </div>
              </div>
            </div>
          </article>
          <DashboardInsightTiles trips={selected} />
          </div>
        </>
      )}
    </section>
  );
}
