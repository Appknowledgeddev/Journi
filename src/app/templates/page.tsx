"use client";

import { AppShell } from "@/components/app-shell";
import styles from "@/components/app-page.module.css";

const templates = [
  {
    title: "Birthday weekend",
    description: "Hotel, dinner, brunch, and one signature activity already scaffolded.",
  },
  {
    title: "Hen do / stag weekend",
    description: "Group invite flow, poll sequence, and payment reminders pre-configured.",
  },
  {
    title: "Friends city break",
    description: "Balanced template for dining, transport, and one or two optional activities.",
  },
];

export default function TemplatesPage() {
  return (
    <AppShell
      kicker="Templates"
      title="Reuse the trips you plan again and again."
      intro="The docs point toward templates as a core Pro organiser benefit. This page is the library for repeatable trip structures, saved flows, and future automation shortcuts."
      headerBadge="Reusable trip setups"
    >
      {({ isPro }) => (
        <div className={styles.stack}>
          <section className={styles.panel}>
            <div className={styles.sectionTop}>
              <div>
                <p className={styles.eyebrow}>Template library</p>
                <h2>Saved organiser starting points</h2>
              </div>
              <span className={isPro ? styles.badgeSuccess : styles.badgeLocked}>
                {isPro ? "Unlocked for Pro" : "Locked on free"}
              </span>
            </div>

            <div className={styles.grid3}>
              {templates.map((template) => (
                <article key={template.title} className={styles.card}>
                  <div className={styles.rowTop}>
                    <span className={styles.rowTitle}>{template.title}</span>
                    <span className={isPro ? styles.badgeSuccess : styles.badgeLocked}>
                      {isPro ? "Ready to use" : "Pro only"}
                    </span>
                  </div>
                  <p>{template.description}</p>
                </article>
              ))}
            </div>
          </section>

          <section className={styles.grid2}>
            <article className={styles.panel}>
              <div className={styles.sectionTop}>
                <div>
                  <p className={styles.eyebrow}>Why it matters</p>
                  <h2>Best for repeat organisers</h2>
                </div>
              </div>

              <div className={styles.timeline}>
                <article className={styles.timelineCard}>
                  <span className={styles.step}>1</span>
                  <div>
                    <h3>Start faster</h3>
                    <p>Spin up a new hub with the same structure you used on the last successful trip.</p>
                  </div>
                </article>
                <article className={styles.timelineCard}>
                  <span className={styles.step}>2</span>
                  <div>
                    <h3>Keep consistency</h3>
                    <p>Make every group experience feel polished, even when plans are changing quickly.</p>
                  </div>
                </article>
              </div>
            </article>

            <article className={styles.panel}>
              <div className={styles.sectionTop}>
                <div>
                  <p className={styles.eyebrow}>Future automation</p>
                  <h2>Where the technical flow can go next</h2>
                </div>
              </div>

              <div className={styles.simpleList}>
                <div className={styles.listRow}>
                  <div className={styles.rowTop}>
                    <span className={styles.rowTitle}>Template-driven trip creation</span>
                    <span className={styles.badgeSoft}>Next</span>
                  </div>
                  <p className={styles.muted}>Create the hub, default categories, and poll structure in one action.</p>
                </div>
                <div className={styles.listRow}>
                  <div className={styles.rowTop}>
                    <span className={styles.rowTitle}>Reminder automations</span>
                    <span className={styles.badgeSoft}>Later</span>
                  </div>
                  <p className={styles.muted}>Send nudges when votes or payments are still incomplete near the trip deadline.</p>
                </div>
              </div>
            </article>
          </section>
        </div>
      )}
    </AppShell>
  );
}
