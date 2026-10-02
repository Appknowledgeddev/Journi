import Image from "next/image";
import Link from "next/link";
import { FiArrowRight, FiSliders } from "react-icons/fi";
import styles from "./trips-empty-state.module.css";

export function TripsEmptyState({ filtered, publicTrips = false, onReset, resetting = false }: {
  filtered: boolean; publicTrips?: boolean; onReset: () => void; resetting?: boolean;
}) {
  return <div className={styles.empty}>
    <Image className={styles.artwork} src="/images/trips-empty.png" alt="" width={1536} height={1024} sizes="(max-width: 600px) 200px, 250px" />
    <h2>{filtered ? "No adventures found here… yet" : publicTrips ? "No public trips just yet" : "Your next adventure starts here"}</h2>
    <p>{filtered ? "Try a different destination or open up your dates. Your next trip could be just outside these filters." : publicTrips ? "New adventures will appear here when organisers share their trips. In the meantime, you can plan one of your own." : "You don’t have any trips yet. Pick a place, bring your people together and start making plans."}</p>
    {filtered ? <button type="button" onClick={onReset} disabled={resetting}><FiSliders aria-hidden="true" />{resetting ? "Resetting…" : "Show all trips"}</button> : <Link href="/trip-organiser?fresh=1">Plan a trip <FiArrowRight aria-hidden="true" /></Link>}
  </div>;
}
