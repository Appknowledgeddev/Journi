import Link from "next/link";
import styles from "@/app/backoffice/backoffice.module.css";

const sections = [
  ["dashboard", "Dashboard"],
  ["trips", "Trips"],
  ["users", "Users"],
  ["records", "Connected Records"],
  ["payments", "Payments"],
  ["subscriptions", "Subscriptions"],
  ["chats", "Chats"],
  ["notifications", "Notifications"],
  ["activity", "Activity"],
  ["documentation", "Documentation"],
  ["testing", "Testing"],
] as const;

export function BackofficeRail({ active }: { active: (typeof sections)[number][0] }) {
  return (
    <aside className={styles.rail}>
      <div className={styles.identity}>
        <span className={styles.identityMark}><img src="/journi-backoffice-logo.png" alt="Journi" /></span>
        <div><strong>Journi Admin</strong><span>Backoffice</span></div>
      </div>
      <Link href="/dashboard" className={styles.railExitLink}>Return to app</Link>
      <nav className={styles.nav} aria-label="Backoffice sections">
        {sections.map(([id, label]) => (
          <Link key={id} href={`/backoffice#${id}`} className={active === id ? styles.navButtonActive : styles.navButton}>
            {label}
          </Link>
        ))}
      </nav>
      <div className={styles.securityPanel}>
        <span>Access</span><strong>Restricted admin</strong><p>Protected by authenticated server-side admin checks.</p>
      </div>
    </aside>
  );
}
