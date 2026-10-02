import Image from "next/image";
import styles from "./trips-empty-state.module.css";

export function ExpensesEmptyState() {
  return (
    <div className={`${styles.empty} ${styles.lowerEmpty}`}>
      <Image
        className={styles.artwork}
        src="/images/expenses-empty.png"
        alt=""
        width={1536}
        height={1024}
        sizes="(max-width: 600px) 200px, 250px"
      />
      <h2>No trip expenses yet</h2>
      <p>Once payments or trip costs are added to your trips, they’ll appear here.</p>
    </div>
  );
}
