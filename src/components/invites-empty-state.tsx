import Image from "next/image";
import styles from "./trips-empty-state.module.css";

export function InvitesEmptyState({ sent = false }: { sent?: boolean }) {
  return <div className={`${styles.empty} ${styles.invitesEmpty}`}>
    <Image className={styles.artwork} src="/images/invites-empty.png" alt="" width={1536} height={1024} sizes="(max-width: 600px) 200px, 250px" />
    <h2>{sent ? "Adventures are better together" : "Every adventure starts with an invite"}</h2>
    <p>{sent ? "You haven’t sent any invites yet. Invite your people to a trip and start making plans together." : "No trip invites just yet. When someone invites you along, your next adventure will appear here."}</p>
  </div>;
}
