import Link from "next/link";
import Image from "next/image";
import styles from "./page.module.css";

export default function HomePage() {
  return (
    <main className={styles.page}>
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
        <p className={styles.kicker}>Journi test home</p>
        <h1>Choose which page you want to test.</h1>
        <p className={styles.lead}>
          This is a simple home page for testing the sign in, subscription, and internal
          app pages.
        </p>

        <div className={styles.section}>
          <p className={styles.sectionTitle}>Auth and sign up</p>
          <div className={styles.actions}>
            <Link href="/signin" className={styles.secondaryButton}>
              Sign in page
            </Link>
            <Link href="/signup/free" className={styles.primaryButton}>
              Free plan
            </Link>
            <Link href="/signup/pro-organiser" className={styles.primaryButton}>
              Pro plan
            </Link>
          </div>
        </div>

        <div className={styles.section}>
          <p className={styles.sectionTitle}>App pages</p>
          <div className={styles.actions}>
            <Link href="/dashboard" className={styles.secondaryButton}>
              Dashboard
            </Link>
            <Link href="/trips" className={styles.secondaryButton}>
              Trips
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
