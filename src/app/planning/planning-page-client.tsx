"use client";

import { AppShell } from "@/components/app-shell";
import styles from "@/components/app-page.module.css";

const planningSections = [
  {
    title: "Hotels",
    items: ["Riad shortlist for Marrakech", "Beach villa shortlist for Mallorca"],
  },
  {
    title: "Activities",
    items: ["Boat day vote", "Sunset cooking class", "Spa recovery morning"],
  },
  {
    title: "Dining",
    items: ["Group dinner shortlist", "Brunch reservation options"],
  },
  {
    title: "Transport",
    items: ["Airport transfer comparison", "Train vs private driver"],
  },
];

export function PlanningPageClient() {
  return (
    <AppShell
      kicker="Planning"
      title="Shape the shortlist before the group votes."
      intro="The planning layer brings together options, hotels, activities, dining, and transport so organisers can curate the best set before publishing it out to travellers."
      headerBadge="Options hub"
    >
      {({ isPro }) => (
        <div className={styles.stack}>
          <section className={styles.grid4}>
            {planningSections.map((section) => (
              <article key={section.title} className={styles.metricCard}>
                <p className={styles.eyebrow}>{section.title}</p>
                <div className={styles.metricValue}>{section.items.length}</div>
                <p className={styles.metricMeta}>Saved options ready for comments or voting</p>
              </article>
            ))}
          </section>

          <section className={styles.grid2}>
            {planningSections.map((section) => (
              <article key={section.title} className={styles.panel}>
                <div className={styles.sectionTop}>
                  <div>
                    <p className={styles.eyebrow}>{section.title}</p>
                    <h2>{section.title} shortlist</h2>
                  </div>
                  <span className={styles.badgeSoft}>{section.items.length} saved</span>
                </div>

                <div className={styles.simpleList}>
                  {section.items.map((item, index) => (
                    <div key={item} className={styles.listRow}>
                      <div className={styles.rowTop}>
                        <span className={styles.rowTitle}>{item}</span>
                        <span className={styles.rowMeta}>Option {index + 1}</span>
                      </div>
                      <p className={styles.muted}>
                        Ready to move into a poll, organiser decision, or final itinerary slot.
                      </p>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </section>

          <section className={styles.panel}>
            <div className={styles.sectionTop}>
              <div>
                <p className={styles.eyebrow}>Automation flow</p>
                <h2>How this page fits the hub</h2>
              </div>
              <span className={isPro ? styles.badgeSuccess : styles.badgeLocked}>
                {isPro ? "Full organiser flow" : "Limited on free"}
              </span>
            </div>

            <div className={styles.grid3}>
              <article className={styles.card}>
                <h3>Collect ideas</h3>
                <p>Organiser uploads images, links, and notes into each category.</p>
              </article>
              <article className={styles.card}>
                <h3>Publish to the group</h3>
                <p>Approved options become visible for comments and polls in the hub.</p>
              </article>
              <article className={styles.card}>
                <h3>Promote winners</h3>
                <p>Winning choices feed into the itinerary and payment flow once confirmed.</p>
              </article>
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}
