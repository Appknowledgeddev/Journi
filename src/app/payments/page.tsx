"use client";

import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import styles from "@/components/app-page.module.css";

export default function PaymentsPage() {
  return (
    <AppShell
      kicker="Payments"
      title="Track trip money and organiser subscriptions."
      intro="This page reflects the payment layer in the planning hub: traveller deposits, organiser payment status, and the Stripe products that back the free and Pro plans."
      headerBadge="Stripe and trip payments"
    >
      {({ isPro, plan, subscriptionStatus }) => (
        <div className={styles.stack}>
          {plan === "pro_organiser" && subscriptionStatus !== "active" ? (
            <div className={styles.callout}>
              Your Pro organiser workspace exists, but billing is still incomplete.{" "}
              <Link href="/signup/pro-organiser/payment" className={styles.actionLink}>
                Finish Pro payment
              </Link>
            </div>
          ) : null}

          <section className={styles.grid4}>
            <article className={styles.metricCard}>
              <p className={styles.eyebrow}>Deposits collected</p>
              <div className={styles.metricValue}>£1.2k</div>
              <p className={styles.metricMeta}>Traveller money currently logged across hubs</p>
            </article>
            <article className={styles.metricCard}>
              <p className={styles.eyebrow}>Outstanding</p>
              <div className={styles.metricValue}>£640</div>
              <p className={styles.metricMeta}>Amounts still waiting on travellers</p>
            </article>
            <article className={styles.metricCard}>
              <p className={styles.eyebrow}>Plan</p>
              <div className={styles.metricValue}>{isPro ? "Pro" : "Free"}</div>
              <p className={styles.metricMeta}>Current organiser plan on this account</p>
            </article>
            <article className={styles.metricCard}>
              <p className={styles.eyebrow}>Products</p>
              <div className={styles.metricValue}>2</div>
              <p className={styles.metricMeta}>Free and Pro subscription products in Stripe</p>
            </article>
          </section>

          <section className={styles.grid2}>
            <article className={styles.panel}>
              <div className={styles.sectionTop}>
                <div>
                  <p className={styles.eyebrow}>Traveller payments</p>
                  <h2>Current trip balances</h2>
                </div>
              </div>

              <div className={styles.simpleList}>
                <div className={styles.listRow}>
                  <div className={styles.rowTop}>
                    <span className={styles.rowTitle}>Lisbon birthday weekend</span>
                    <span className={styles.badgeSuccess}>£480 received</span>
                  </div>
                  <p className={styles.muted}>2 guests still need to pay their deposit before the villa is locked.</p>
                </div>
                <div className={styles.listRow}>
                  <div className={styles.rowTop}>
                    <span className={styles.rowTitle}>Marrakech spring trip</span>
                    <span className={styles.badge}>£160 pending</span>
                  </div>
                  <p className={styles.muted}>Waiting on one final transfer before the airport driver is confirmed.</p>
                </div>
              </div>
            </article>

            <article className={styles.panel}>
              <div className={styles.sectionTop}>
                <div>
                  <p className={styles.eyebrow}>Stripe products</p>
                  <h2>Subscription products in use</h2>
                </div>
              </div>

              <div className={styles.grid2}>
                <article className={styles.featureCard}>
                  <div className={styles.rowTop}>
                    <h3>Free organiser</h3>
                    <span className={styles.badge}>£0</span>
                  </div>
                  <p>Single active trip, limited participants, standard support.</p>
                </article>
                <article className={styles.featureCard}>
                  <div className={styles.rowTop}>
                    <h3>Pro organiser</h3>
                    <span className={styles.badgeSuccess}>£19 / £179</span>
                  </div>
                  <p>Unlimited hubs, no expiry, templates, and priority support.</p>
                </article>
              </div>
            </article>
          </section>
        </div>
      )}
    </AppShell>
  );
}
