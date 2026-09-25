import Link from "next/link";
import styles from "./page.module.css";

export default function HomePage() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <p className={styles.kicker}>Development only</p>
        <p className={styles.notice}>
          This page is for development purposes only.
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

        <div id="backoffice" className={styles.section}>
          <p className={styles.sectionTitle}>Development tools</p>
          <p className={styles.sectionCopy}>
            Open the admin backoffice while working locally. Use <strong>/#backoffice</strong> to jump straight here.
          </p>
          <div className={styles.actions}>
            <Link href="/backoffice" className={styles.primaryButton}>
              Open backoffice
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
