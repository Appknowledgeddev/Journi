"use client";

import Image from "next/image";
import Link from "next/link";
import styles from "../pro-organiser/signup.module.css";

export default function TripPassPage() {
  return (
    <main className={styles.page}>
      <div className={styles.overlay} />
      <Link href="/" className={styles.pageLogo}>
        <Image
          src="/journi-logo-app.png"
          alt="Journi"
          width={320}
          height={112}
          className={styles.pageLogoImage}
          priority
        />
      </Link>

      <section className={styles.card}>
        <p className={styles.kicker}>Trip pass</p>
        <h1>Publish one extra trip for £39.</h1>
        <p className={styles.lead}>
          Trip Pass is the one-off option for free organisers who want to publish another
          trip without moving onto the full Pro Organiser plan.
        </p>

        <div className={styles.confirmationPanel}>
          <p>
            Price: £39 per published trip. We can wire this page into Stripe next so it
            works alongside the Pro flow.
          </p>
          <Link href="/signup/pro-organiser/payment" className={styles.primaryButton}>
            Continue to payment
          </Link>
        </div>

        <p className={styles.footer}>
          Need unlimited live trips?{" "}
          <Link href="/signup/pro-organiser" className={styles.link}>
            Upgrade to Pro Organiser
          </Link>
        </p>
      </section>
    </main>
  );
}
