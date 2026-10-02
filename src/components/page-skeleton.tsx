"use client";

import Skeleton, { SkeletonTheme } from "react-loading-skeleton";
import styles from "./page-skeleton.module.css";

export type SkeletonLayout = "cards" | "dashboard" | "list" | "detail" | "form";

export function PageSkeleton({ layout = "cards" }: { layout?: SkeletonLayout }) {
  const cards = layout === "cards" || layout === "dashboard";
  return <div className={styles.page} aria-hidden="true" data-skeleton-layout={layout}>
    <SkeletonTheme baseColor="light-dark(#dce6f1, #21344c)" highlightColor="light-dark(#f4f8fd, #35516f)" borderRadius={8} duration={1.8}>
      <div className={styles.heading}><Skeleton width="38%" height={28} /><Skeleton width={100} height={32} /></div>
      {layout === "dashboard" ? <div className={styles.metrics}>{Array.from({ length: 4 }, (_, i) => <div className={styles.card} key={i}><Skeleton width="65%" /><Skeleton width="40%" height={34} /></div>)}</div> : null}
      {cards ? <div className={styles.cards}>{Array.from({ length: 6 }, (_, i) => <div className={styles.card} key={i}>
        <Skeleton height={layout === "dashboard" ? 120 : 156} borderRadius={12} />
        <Skeleton height={22} width="78%" /><Skeleton width="56%" /><Skeleton width="88%" />
      </div>)}</div> : layout === "list" ? <div className={styles.list}>{Array.from({ length: 7 }, (_, i) => <div className={styles.row} key={i}>
        <Skeleton circle width={44} height={44} /><div><Skeleton width="60%" height={18} /><Skeleton width="38%" /></div><Skeleton width={70} height={24} />
      </div>)}</div> : <div className={styles.form}>
        {layout === "detail" ? <Skeleton height={230} borderRadius={20} /> : null}
        <Skeleton width="45%" height={24} />
        <div className={styles.fields}>{Array.from({ length: 6 }, (_, i) => <div className={styles.field} key={i}><Skeleton width="35%" /><Skeleton height={46} /></div>)}</div>
        <Skeleton height={90} />
      </div>}
    </SkeletonTheme>
  </div>;
}
