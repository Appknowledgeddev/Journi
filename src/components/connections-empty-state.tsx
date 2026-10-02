import Image from "next/image";
import styles from "./trips-empty-state.module.css";

export function ConnectionsEmptyState() {
  return <div className={`${styles.empty} ${styles.lowerEmpty}`}>
    <Image className={styles.artwork} src="/images/connections-empty.png" alt="" width={1536} height={1024} sizes="(max-width: 600px) 200px, 250px" />
    <h2>Your next adventure starts with your people</h2>
    <p>No connections to show just yet. Your travel companions’ profile cards will appear here once they’ve completed their profiles.</p>
  </div>;
}
