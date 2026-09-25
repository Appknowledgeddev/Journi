"use client";

import { useEffect, useState } from "react";
import { FiPlay } from "react-icons/fi";
import { supabase } from "@/lib/supabase/client";
import styles from "@/components/app-page.module.css";

type LinkMetadata = {
  url: string;
  title: string;
  description: string;
  siteName: string;
  image: string;
  imageType: "preview" | "favicon";
};

function isYouTube(url: string) {
  try {
    return new URL(url).hostname.toLowerCase().includes("youtu");
  } catch {
    return false;
  }
}

function getYouTubeVideoId(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "youtu.be") return parsed.pathname.split("/").filter(Boolean)[0] ?? "";
    if (!["youtube.com", "m.youtube.com"].includes(host)) return "";
    if (parsed.pathname === "/watch") return parsed.searchParams.get("v") ?? "";
    const [section, id] = parsed.pathname.split("/").filter(Boolean);
    return ["shorts", "embed", "live"].includes(section) ? (id ?? "") : "";
  } catch {
    return "";
  }
}

export function ChatLinkPreview({ url, playable = false }: { url: string; playable?: boolean }) {
  const [metadata, setMetadata] = useState<LinkMetadata | null>(null);
  const youtubeVideoId = playable ? getYouTubeVideoId(url) : "";

  useEffect(() => {
    let active = true;

    async function loadPreview() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const response = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const result = (await response.json().catch(() => null)) as LinkMetadata | null;
      if (active && response.ok && result) setMetadata(result);
    }

    void loadPreview();
    return () => {
      active = false;
    };
  }, [url]);

  if (youtubeVideoId) {
    return (
      <div className={styles.whatsAppYouTubePlayer}>
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(youtubeVideoId)}`}
          title={metadata?.title || "YouTube video player"}
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
        {metadata ? (
          <a href={metadata.url} target="_blank" rel="noreferrer">
            <strong>{metadata.title}</strong>
            <span>{metadata.description || metadata.siteName}</span>
          </a>
        ) : null}
      </div>
    );
  }

  if (!metadata) {
    return (
      <a
        className={`${styles.whatsAppLinkPreview} ${playable ? styles.whatsAppSentLinkFallback : ""}`}
        href={url}
        target="_blank"
        rel="noreferrer"
      >
        <strong>{new URL(url).hostname.replace(/^www\./, "")}</strong>
        <small>{url}</small>
      </a>
    );
  }

  return (
    <a
      className={`${styles.whatsAppRichLinkPreview} ${metadata.imageType === "favicon" ? styles.whatsAppRichLinkPreviewFavicon : ""} ${playable ? styles.whatsAppSentLinkPreview : ""} ${playable && metadata.imageType === "favicon" ? styles.whatsAppSentLinkPreviewFavicon : ""}`}
      href={metadata.url}
      target="_blank"
      rel="noreferrer"
    >
      {metadata.image ? (
        <span
          className={`${styles.whatsAppRichLinkImage} ${metadata.imageType === "favicon" ? styles.whatsAppRichLinkImageFavicon : ""}`}
        >
          <img src={metadata.image} alt="" />
          {isYouTube(metadata.url) ? (
            <span className={styles.whatsAppRichLinkPlay} aria-hidden="true">
              <FiPlay />
            </span>
          ) : null}
        </span>
      ) : null}
      <span className={styles.whatsAppRichLinkCopy}>
        <small>{metadata.siteName}</small>
        <strong>{metadata.title}</strong>
        {metadata.description ? <span>{metadata.description}</span> : null}
      </span>
    </a>
  );
}
