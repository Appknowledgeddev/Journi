"use client";

import { AppShell } from "@/components/app-shell";
import styles from "@/components/app-page.module.css";

const polls = [
  { title: "Which villa should we book?", votes: 12, progress: "76%", status: "Closing tonight" },
  { title: "Friday dinner plan", votes: 9, progress: "54%", status: "2 days left" },
  { title: "Airport transfer choice", votes: 7, progress: "48%", status: "Awaiting late votes" },
];

export default function VotingPage() {
  return (
    <AppShell
      kicker="Voting"
      title="Track the decisions that move a trip forward."
      intro="This page is the organiser control room for polls and group choices. It keeps live votes, winning options, and unresolved decisions in one place."
      headerBadge="Polls and results"
    >
      {() => (
        <div className={styles.stack}>
          <section className={styles.grid3}>
            <article className={styles.metricCard}>
              <p className={styles.eyebrow}>Open polls</p>
              <div className={styles.metricValue}>3</div>
              <p className={styles.metricMeta}>Decisions currently collecting group input</p>
            </article>
            <article className={styles.metricCard}>
              <p className={styles.eyebrow}>Votes cast</p>
              <div className={styles.metricValue}>28</div>
              <p className={styles.metricMeta}>Responses across all live trip hubs</p>
            </article>
            <article className={styles.metricCard}>
              <p className={styles.eyebrow}>Resolved</p>
              <div className={styles.metricValue}>11</div>
              <p className={styles.metricMeta}>Past decisions already promoted into itineraries</p>
            </article>
          </section>

          <section className={styles.panel}>
            <div className={styles.sectionTop}>
              <div>
                <p className={styles.eyebrow}>Live now</p>
                <h2>Current polls</h2>
              </div>
            </div>

            <div className={styles.simpleList}>
              {polls.map((poll) => (
                <div key={poll.title} className={styles.listRow}>
                  <div className={styles.rowTop}>
                    <span className={styles.rowTitle}>{poll.title}</span>
                    <span className={styles.badgeSoft}>{poll.status}</span>
                  </div>
                  <p className={styles.muted}>{poll.votes} votes collected so far</p>
                  <div className={styles.progressTrack}>
                    <span style={{ width: poll.progress }} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.grid2}>
            <article className={styles.panel}>
              <div className={styles.sectionTop}>
                <div>
                  <p className={styles.eyebrow}>Recent winners</p>
                  <h2>Choices already locked in</h2>
                </div>
              </div>

              <div className={styles.simpleList}>
                <div className={styles.listRow}>
                  <div className={styles.rowTop}>
                    <span className={styles.rowTitle}>Sailing day in Lisbon</span>
                    <span className={styles.badgeSuccess}>Won</span>
                  </div>
                  <p className={styles.muted}>Moved into Saturday itinerary and shared with the group.</p>
                </div>
                <div className={styles.listRow}>
                  <div className={styles.rowTop}>
                    <span className={styles.rowTitle}>Riad Atlas Medina</span>
                    <span className={styles.badgeSuccess}>Booked next</span>
                  </div>
                  <p className={styles.muted}>Most popular hotel choice and now awaiting payment confirmation.</p>
                </div>
              </div>
            </article>

            <article className={styles.panel}>
              <div className={styles.sectionTop}>
                <div>
                  <p className={styles.eyebrow}>Poll design</p>
                  <h2>Good organiser patterns</h2>
                </div>
              </div>

              <div className={styles.timeline}>
                <article className={styles.timelineCard}>
                  <span className={styles.step}>1</span>
                  <div>
                    <h3>Keep the shortlist tight</h3>
                    <p>Run polls on 2 to 4 strong options rather than dumping the whole research list.</p>
                  </div>
                </article>
                <article className={styles.timelineCard}>
                  <span className={styles.step}>2</span>
                  <div>
                    <h3>Set a clear deadline</h3>
                    <p>Deadlines keep the hub moving and reduce organiser follow-up work later.</p>
                  </div>
                </article>
              </div>
            </article>
          </section>
        </div>
      )}
    </AppShell>
  );
}
