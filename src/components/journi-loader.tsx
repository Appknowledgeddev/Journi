import styles from "./app-page.module.css";

type JourniLoaderProps = {
  title?: string;
  detail?: string;
};

export function JourniLoader({
  title = "Getting things ready",
  detail = "Pulling the latest trip details into place.",
}: JourniLoaderProps) {
  return (
    <div className={styles.journiLoader} role="status" aria-live="polite">
      <div className={styles.journiLoaderMark} aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
    </div>
  );
}
