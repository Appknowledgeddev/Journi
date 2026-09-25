"use client";

import { useEffect, useRef, useState } from "react";
import { FiSearch, FiX } from "react-icons/fi";
import styles from "./app-page.module.css";

type MediaType = "sticker" | "gif";
export type ChatMediaItem = { id: string; title: string; preview: string; url: string };

export function ChatMediaPicker({ onClose, onSelect, selectedStickerCount = 0 }: { onClose: () => void; onSelect: (type: MediaType, item: ChatMediaItem) => void; selectedStickerCount?: number }) {
  const [type, setType] = useState<MediaType>("sticker");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ChatMediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [error, setError] = useState("");
  const [nextOffset, setNextOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/chat-media?type=${type}&q=${encodeURIComponent(query)}&offset=0`, { signal: controller.signal });
        const result = (await response.json()) as { configured?: boolean; items?: ChatMediaItem[]; error?: string; nextOffset?: number; hasMore?: boolean };
        setConfigured(result.configured !== false);
        setItems(result.items ?? []);
        setNextOffset(result.nextOffset ?? 0);
        setHasMore(Boolean(result.hasMore));
        setError(result.error ?? "");
      } catch (requestError) {
        if ((requestError as Error).name !== "AbortError") setError("Unable to load media.");
      } finally {
        setLoading(false);
      }
    }, query ? 280 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, type]);

  useEffect(() => {
    const marker = loadMoreRef.current;
    if (!marker || !hasMore || loading || loadingMore) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting) return;
      setLoadingMore(true);
      void fetch(`/api/chat-media?type=${type}&q=${encodeURIComponent(query)}&offset=${nextOffset}`)
        .then((response) => response.json())
        .then((result: { items?: ChatMediaItem[]; nextOffset?: number; hasMore?: boolean; error?: string }) => {
          setItems((current) => [...current, ...(result.items ?? []).filter((item) => !current.some((existing) => existing.id === item.id))]);
          setNextOffset(result.nextOffset ?? nextOffset);
          setHasMore(Boolean(result.hasMore));
          if (result.error) setError(result.error);
        })
        .catch(() => setError("Unable to load more media."))
        .finally(() => setLoadingMore(false));
    }, { rootMargin: "120px" });
    observer.observe(marker);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, nextOffset, query, type]);

  return (
    <section className={styles.whatsAppMediaPicker} aria-label="Stickers and GIFs">
      <header>
        <div role="tablist" aria-label="Media type">
          <button type="button" className={type === "sticker" ? styles.whatsAppMediaTabActive : ""} onClick={() => setType("sticker")}>Stickers</button>
          <button type="button" className={type === "gif" ? styles.whatsAppMediaTabActive : ""} onClick={() => setType("gif")}>GIFs</button>
        </div>
        <button type="button" onClick={onClose} aria-label="Close media picker"><FiX /></button>
      </header>
      <label className={styles.whatsAppMediaSearch}><FiSearch /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${type === "gif" ? "GIFs" : "stickers"}`} /></label>
      {!configured ? (
        <div className={styles.whatsAppMediaSetup}><strong>Connect GIPHY to load real stickers and GIFs</strong><span>Add GIPHY_API_KEY to the app environment.</span></div>
      ) : loading ? (
        <div className={styles.whatsAppMediaStatus}>Loading {type === "gif" ? "GIFs" : "stickers"}…</div>
      ) : error ? (
        <div className={styles.whatsAppMediaStatus}>{error}</div>
      ) : (
        <div className={`${styles.whatsAppMediaGrid} ${type === "sticker" ? styles.whatsAppStickerGrid : ""}`}>
          {items.map((item) => (
            <button type="button" key={item.id} onClick={() => onSelect(type, item)} title={item.title}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.preview} alt={item.title} />
            </button>
          ))}
          <div ref={loadMoreRef} className={styles.whatsAppMediaLoadMore}>
            {loadingMore ? (
              "Loading more…"
            ) : hasMore ? (
              "Scroll for more"
            ) : (
              <>
                <span>{items.length ? "Want to see something different?" : "No results — try another search"}</span>
                <div>
                  {(type === "gif"
                    ? ["funny", "excited", "travel", "celebration", "wow"]
                    : ["hello", "love", "laughing", "holiday", "thank you"]
                  ).map((suggestion) => (
                    <button type="button" key={suggestion} onClick={() => setQuery(suggestion)}>{suggestion}</button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
      <small className={styles.whatsAppGiphyCredit}>Powered by GIPHY</small>
      {selectedStickerCount ? (
        <button type="button" className={styles.whatsAppMediaDone} onClick={onClose}>
          Done — {selectedStickerCount} sticker{selectedStickerCount === 1 ? "" : "s"} added
        </button>
      ) : null}
    </section>
  );
}
