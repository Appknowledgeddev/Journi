"use client";

import { useEffect, useState } from "react";
import { FiStar, FiX } from "react-icons/fi";
import styles from "@/components/app-page.module.css";

export type SavedPlaceSummary = {
  placeId?: string | null;
  name: string;
  address: string;
  imageUrl?: string | null;
  category: string;
};

type PlaceDetails = {
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  websiteUri: string;
  googleMapsUri: string;
  rating: number | null;
  userRatingCount: number | null;
  phone: string;
  openingHours: string[];
  summary: string;
  photos: Array<{ url: string; attribution: string }>;
  reviews: Array<{ author: string; authorUrl: string; rating: number | null; text: string; published: string }>;
};

type Tab = "overview" | "gallery" | "map" | "reviews" | "practical";

export function PlaceDetailsModal({ place, onClose }: { place: SavedPlaceSummary | null; onClose: () => void }) {
  const [details, setDetails] = useState<PlaceDetails | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!place) return;
    setTab("overview");
    setError("");
    setDetails({
      name: place.name, address: place.address, latitude: null, longitude: null,
      websiteUri: "", googleMapsUri: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.name} ${place.address}`)}`,
      rating: null, userRatingCount: null, phone: "", openingHours: [], summary: "",
      photos: place.imageUrl ? [{ url: place.imageUrl, attribution: "" }] : [], reviews: [],
    });
    if (!place.placeId) return;
    setLoading(true);
    fetch("/api/hotels/details", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ placeId: place.placeId }),
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to load place details.");
        setDetails(result);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load place details."))
      .finally(() => setLoading(false));
  }, [place]);

  if (!place || !details) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalCard} role="dialog" aria-modal="true" aria-label={`${place.name} details`} onClick={(event) => event.stopPropagation()}>
        <div className={styles.sectionTop}>
          <div><p className={styles.eyebrow}>{place.category} details</p><h2>{details.name}</h2></div>
          <button type="button" className={styles.slidePanelCloseButton} onClick={onClose} aria-label="Close details"><FiX /></button>
        </div>
        {loading ? <p className={styles.muted}>Loading more information from Google…</p> : null}
        {error ? <p className={styles.formError}>{error}</p> : null}
        <div className={styles.hotelTabRow}>
          {(["overview", "gallery", "map", "reviews", "practical"] as Tab[]).map((item) => (
            <button key={item} type="button" className={tab === item ? styles.hotelTabActive : styles.hotelTab} onClick={() => setTab(item)}>{item}</button>
          ))}
        </div>
        {tab === "overview" ? <div className={styles.stack}>
          {details.photos[0]?.url ? <div className={styles.hotelHeroCard}><img src={details.photos[0].url} alt={details.name} className={styles.hotelHeroImage} /><div className={styles.hotelHeroBody}><strong>{details.name}</strong><p className={styles.muted}>{details.summary || "Google place information for this trip selection."}</p></div></div> : null}
          <div className={styles.hotelOverviewStats}><div className={styles.infoCard}><span className={styles.tripFactLabel}>Address</span><strong>{details.address || "Not available"}</strong></div><div className={styles.infoCard}><span className={styles.tripFactLabel}>Rating</span><strong>{details.rating ? <><FiStar /> {details.rating} ({details.userRatingCount ?? 0})</> : "Not available"}</strong></div><div className={styles.infoCard}><span className={styles.tripFactLabel}>Phone</span><strong>{details.phone || "Not available"}</strong></div></div>
        </div> : null}
        {tab === "gallery" ? details.photos.length ? <div className={styles.hotelDetailGallery}>{details.photos.map((photo, index) => <figure key={`${photo.url}-${index}`} className={styles.hotelDetailMediaCard}><img src={photo.url} alt={`${details.name} ${index + 1}`} className={styles.hotelDetailPhoto} />{photo.attribution ? <figcaption className={styles.fieldHint}>Photo: {photo.attribution}</figcaption> : null}</figure>)}</div> : <div className={styles.emptyState}><h3>No gallery available.</h3></div> : null}
        {tab === "map" ? details.latitude !== null && details.longitude !== null ? <iframe title={`${details.name} map`} src={`https://www.google.com/maps?q=${details.latitude},${details.longitude}&z=15&output=embed`} className={styles.hotelMapFrame} loading="lazy" /> : <div className={styles.emptyState}><h3>Map unavailable.</h3></div> : null}
        {tab === "reviews" ? details.reviews.length ? <div className={styles.reviewGrid}>{details.reviews.map((review, index) => <article key={`${review.author}-${index}`} className={styles.reviewCard}><div className={styles.rowTop}><strong>{review.author}</strong><span className={styles.badge}>{review.rating ? `${review.rating}/5` : "Review"}</span></div><p className={styles.muted}>{review.text || "No review text provided."}</p><small>{review.published}</small></article>)}</div> : <div className={styles.emptyState}><h3>No reviews loaded.</h3></div> : null}
        {tab === "practical" ? <div className={styles.stack}><div className={styles.settingsList}><div className={styles.settingsRow}><h3>Address</h3><strong>{details.address || "Not available"}</strong></div><div className={styles.settingsRow}><h3>Phone</h3><strong>{details.phone || "Not available"}</strong></div></div>{details.openingHours.length ? <div className={styles.simpleList}>{details.openingHours.map((line) => <div key={line} className={styles.listRow}>{line}</div>)}</div> : null}</div> : null}
        <div className={styles.hotelCardActions}>{details.websiteUri ? <a href={details.websiteUri} target="_blank" rel="noreferrer" className={styles.hotelActionLink}>Website</a> : <span />}<a href={details.googleMapsUri} target="_blank" rel="noreferrer" className={styles.hotelActionLink}>Open in Google Maps</a></div>
      </div>
    </div>
  );
}
