"use client";

import { AppShell } from "@/components/app-shell";
import styles from "@/components/app-page.module.css";

export const dynamic = "force-dynamic";

export default function GuestsPage() {
  return (
    <AppShell
      kicker="Guests"
      title="Keep invites, comments, and traveller status together."
      intro="This page is the shared participant layer from the planning hub. It gives organisers one place to check who has joined, who still needs nudging, and what the group is saying."
      headerBadge="People and comments"
    >
      {({ isPro }) => (
        <div className={styles.stack}>
          <section className={styles.grid3}>
            <article className={styles.metricCard}>
              <p className={styles.eyebrow}>Invited</p>
              <div className={styles.metricValue}>{isPro ? "18" : "5"}</div>
              <p className={styles.metricMeta}>People currently connected to live hubs</p>
            </article>
            <article className={styles.metricCard}>
              <p className={styles.eyebrow}>Awaiting reply</p>
              <div className={styles.metricValue}>4</div>
              <p className={styles.metricMeta}>Travellers who still need an organiser nudge</p>
            </article>
            <article className={styles.metricCard}>
              <p className={styles.eyebrow}>Comments</p>
              <div className={styles.metricValue}>27</div>
              <p className={styles.metricMeta}>Notes and reactions left across all option cards</p>
            </article>
          </section>

          <section className={styles.grid2}>
            <article className={styles.panel}>
              <div className={styles.sectionTop}>
                <div>
                  <p className={styles.eyebrow}>Participants</p>
                  <h2>Guest list snapshot</h2>
                </div>
              </div>

              <div className={styles.simpleList}>
                <div className={styles.listRow}>
                  <div className={styles.rowTop}>
                    <span className={styles.rowTitle}>Sophie Hall</span>
                    <span className={styles.badgeSuccess}>Joined</span>
                  </div>
                  <p className={styles.muted}>Voted on accommodation and left two dining comments.</p>
                </div>
                <div className={styles.listRow}>
                  <div className={styles.rowTop}>
                    <span className={styles.rowTitle}>Ben Marsh</span>
                    <span className={styles.badge}>Invite sent</span>
                  </div>
                  <p className={styles.muted}>Still waiting for first login and poll response.</p>
                </div>
                <div className={styles.listRow}>
                  <div className={styles.rowTop}>
                    <span className={styles.rowTitle}>Ella James</span>
                    <span className={styles.badgeSoft}>Needs reminder</span>
                  </div>
                  <p className={styles.muted}>Has opened the hub but has not answered the hotel poll yet.</p>
                </div>
              </div>
            </article>

            <article className={styles.panel}>
              <div className={styles.sectionTop}>
                <div>
                  <p className={styles.eyebrow}>Comments</p>
                  <h2>Latest traveller notes</h2>
                </div>
              </div>

              <div className={styles.commentList}>
                <div className={styles.commentRow}>
                  <div className={styles.rowTop}>
                    <span className={styles.rowTitle}>“The rooftop riad is my favourite.”</span>
                    <span className={styles.rowMeta}>Hotel option</span>
                  </div>
                  <p className={styles.muted}>Left by Sophie on Marrakech spring trip</p>
                </div>
                <div className={styles.commentRow}>
                  <div className={styles.rowTop}>
                    <span className={styles.rowTitle}>“Can we do brunch before the boat day?”</span>
                    <span className={styles.rowMeta}>Activity option</span>
                  </div>
                  <p className={styles.muted}>Left by Chloe on Lisbon birthday weekend</p>
                </div>
              </div>
            </article>
          </section>
        </div>
      )}
    </AppShell>
  );
}
