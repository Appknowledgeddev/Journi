import Link from "next/link";
import styles from "./site-header.module.css";

type SiteHeaderProps = {
  ctaHref?: string;
  ctaLabel?: string;
};

const navItems = [
  { href: "/products", label: "Products" },
  { href: "/solutions", label: "Solutions" },
  { href: "/developers", label: "Developers" },
  { href: "/pricing", label: "Pricing" },
];

export function SiteHeader({
  ctaHref = "/pricing",
  ctaLabel = "Start now",
}: SiteHeaderProps) {
  return (
    <header className={styles.nav}>
      <Link href="/" className={styles.brand}>
        Northstar
      </Link>
      <nav className={styles.navLinks} aria-label="Primary">
        {navItems.map((item) => (
          <Link key={item.href} href={item.href}>
            {item.label}
          </Link>
        ))}
      </nav>
      <Link className={styles.navAction} href={ctaHref}>
        {ctaLabel}
      </Link>
    </header>
  );
}
