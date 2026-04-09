import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import styles from "./page.module.css";

const solutionTracks = [
  {
    title: "Software companies",
    description:
      "Run trials, upgrades, seat-based plans, and invoice-ready subscriptions without stitching together separate tools for growth and finance.",
    points: ["Seat and usage billing", "Admin invoicing", "Revenue visibility"],
  },
  {
    title: "Platforms and marketplaces",
    description:
      "Onboard sellers, route funds, and manage payouts with controls that support multi-party money movement from day one.",
    points: ["Connected accounts", "Split payouts", "Operational controls"],
  },
  {
    title: "Global commerce teams",
    description:
      "Launch in new regions with local payment methods, localized customer experiences, and region-aware reporting workflows.",
    points: ["Multi-currency support", "Localized checkout", "Regional settlement"],
  },
];

const operatingLayers = [
  {
    title: "Launch layer",
    body: "A polished starting point for checkout, plans, and onboarding so product teams can ship quickly without compromising the customer journey.",
  },
  {
    title: "Operations layer",
    body: "Shared tooling for support, finance, and engineering with payment events, customer history, and retry workflows in one place.",
  },
  {
    title: "Scale layer",
    body: "Architecture that supports multiple regions, more complex billing models, and custom internal workflows as the business grows.",
  },
];

const implementationSteps = [
  {
    step: "01",
    title: "Define the business model",
    text: "Map whether you are charging subscriptions, processing one-time purchases, or orchestrating multi-party payouts.",
  },
  {
    step: "02",
    title: "Choose the product surface",
    text: "Decide which parts live in the customer-facing app, which belong in internal tooling, and which should be event-driven backend workflows.",
  },
  {
    step: "03",
    title: "Connect the data layer",
    text: "Use Supabase for auth, profiles, and operational records so your marketing site can evolve into a real application.",
  },
];

export default function SolutionsPage() {
  return (
    <div className={styles.page}>
      <div className={styles.backgroundGlow} />
      <div className={styles.gridLines} />
      <SiteHeader ctaHref="/pricing" ctaLabel="Start now" />

      <main className={styles.main}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Solutions</p>
            <h1>Purpose-built flows for the business models modern teams actually run.</h1>
            <p className={styles.intro}>
              Instead of forcing every company into the same payment journey,
              Northstar adapts to SaaS, platforms, and global product teams with
              operating models that feel tailored from the start.
            </p>
            <div className={styles.heroActions}>
              <Link className={styles.primaryCta} href="/pricing">
                Review pricing
              </Link>
              <Link className={styles.secondaryCta} href="/developers">
                Explore developer flows
              </Link>
            </div>
          </div>

          <aside className={styles.heroPanel}>
            <div className={styles.panelCard}>
              <span className={styles.panelLabel}>Solution overview</span>
              <h2>One front door for payments, billing, and revenue operations.</h2>
              <p>
                The same platform should help a product team launch, help finance
                understand the numbers, and help support resolve customer issues.
              </p>
              <div className={styles.metricStack}>
                <div>
                  <strong>3</strong>
                  <span>Core operating layers</span>
                </div>
                <div>
                  <strong>27</strong>
                  <span>Markets launched by growth teams</span>
                </div>
              </div>
            </div>
          </aside>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>Who it serves</p>
            <h2>Different companies need different revenue architecture.</h2>
            <p>
              These solution tracks shape how the product should look, what data
              you store, and which workflows deserve first-class treatment.
            </p>
          </div>

          <div className={styles.trackGrid}>
            {solutionTracks.map((track) => (
              <article key={track.title} className={styles.trackCard}>
                <h3>{track.title}</h3>
                <p>{track.description}</p>
                <ul className={styles.pointList}>
                  {track.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>Operating model</p>
            <h2>Solutions are more than a checkout page.</h2>
            <p>
              A strong system covers launch, day-to-day operations, and the next
              stage of scale so the product keeps working as the company changes.
            </p>
          </div>

          <div className={styles.layerGrid}>
            {operatingLayers.map((layer) => (
              <article key={layer.title} className={styles.layerCard}>
                <span className={styles.layerAccent} />
                <h3>{layer.title}</h3>
                <p>{layer.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.roadmapSection}>
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>Implementation path</p>
            <h2>How we can turn this page into a real product tutorial.</h2>
            <p>
              The quickest way to make this useful is to evolve the page from
              marketing copy into an application-backed experience step by step.
            </p>
          </div>

          <div className={styles.timeline}>
            {implementationSteps.map((item) => (
              <article key={item.step} className={styles.timelineCard}>
                <span className={styles.step}>{item.step}</span>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.cta}>
          <div>
            <p className={styles.eyebrow}>Next step</p>
            <h2>Make one of these solutions real with Next.js and Supabase.</h2>
            <p>
              We can now pick a track like SaaS billing or a marketplace flow and
              build the first real feature with auth, database tables, and live UI.
            </p>
          </div>
          <Link className={styles.primaryCta} href="/developers">
            Build the app layer
          </Link>
        </section>
      </main>
    </div>
  );
}
