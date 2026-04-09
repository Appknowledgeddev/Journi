import Link from "next/link";
import { SiteHeader } from "./site-header";
import styles from "./section-page.module.css";

type Detail = {
  title: string;
  description: string;
};

type SectionPageProps = {
  eyebrow: string;
  title: string;
  intro: string;
  details: Detail[];
  ctaTitle: string;
  ctaText: string;
  ctaHref: string;
  ctaLabel: string;
};

export function SectionPage({
  eyebrow,
  title,
  intro,
  details,
  ctaTitle,
  ctaText,
  ctaHref,
  ctaLabel,
}: SectionPageProps) {
  return (
    <div className={styles.page}>
      <div className={styles.backgroundGlow} />
      <div className={styles.gridLines} />
      <SiteHeader ctaHref={ctaHref} ctaLabel={ctaLabel} />

      <main className={styles.main}>
        <section className={styles.hero}>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h1>{title}</h1>
          <p className={styles.intro}>{intro}</p>
        </section>

        <section className={styles.grid}>
          {details.map((detail) => (
            <article key={detail.title} className={styles.card}>
              <h2>{detail.title}</h2>
              <p>{detail.description}</p>
            </article>
          ))}
        </section>

        <section className={styles.cta}>
          <div>
            <p className={styles.eyebrow}>Next step</p>
            <h2>{ctaTitle}</h2>
            <p>{ctaText}</p>
          </div>
          <Link className={styles.action} href={ctaHref}>
            {ctaLabel}
          </Link>
        </section>
      </main>
    </div>
  );
}
