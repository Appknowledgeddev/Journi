import { PageSkeleton, type SkeletonLayout } from "./page-skeleton";
import Image from "next/image";
import styles from "./app-page.module.css";

type JourniLoaderProps = {
  title?: string;
  detail?: string;
  fullscreen?: boolean;
  skeletonLayout?: SkeletonLayout;
};

export function JourniLoader({
  title = "Getting things ready",
  detail = "",
  fullscreen = false,
  skeletonLayout,
}: JourniLoaderProps) {
  return (
    <div className={`${styles.journiLoader} ${fullscreen ? styles.journiLoaderFullscreen : ""}`} role="status" aria-live="polite">
      {skeletonLayout ? <PageSkeleton layout={skeletonLayout} /> : null}
      <div className={styles.journiLoaderContent}>
      <div className={styles.journiLoaderBrand} aria-hidden="true">
        <div className={styles.journiLoaderWordmark}><Image unoptimized src="/journi-logo-current.webp" alt="" width="220" height="220" /></div>
        <span />
      </div>
      <div>
        <strong>{title}</strong>
        {detail ? <p>{detail}</p> : null}
      </div>
      </div>
    </div>
  );
}
