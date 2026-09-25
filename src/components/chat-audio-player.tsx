"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import WaveSurfer from "wavesurfer.js";
import styles from "@/components/app-page.module.css";

function formatAudioTime(value: number) {
  if (!Number.isFinite(value)) return "0:00";
  return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
}

export function ChatAudioPlayer({ url }: { url: string }) {
  const waveformRef = useRef<HTMLDivElement | null>(null);
  const waveSurferRef = useRef<WaveSurfer | null>(null);
  const draggingRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [waveformPeaks, setWaveformPeaks] = useState<number[]>([]);
  const progress = duration ? Math.min((currentTime / duration) * 100, 100) : 0;

  function seekFromPointer(event: React.PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
    waveSurferRef.current?.seekTo(position);
    setCurrentTime(position * duration);
  }
  useEffect(() => {
    if (!waveformRef.current) return;
    const waveform = WaveSurfer.create({
      container: waveformRef.current,
      url,
      height: 24,
      waveColor: "rgba(24, 49, 83, 0.25)",
      progressColor: "#0f6fbd",
      cursorColor: "#0f6fbd",
      cursorWidth: 2,
      barWidth: 3,
      barGap: 2,
      barRadius: 3,
      barMinHeight: 2,
      normalize: true,
      dragToSeek: true,
    });
    waveSurferRef.current = waveform;
    waveform.on("ready", (audioDuration) => {
      setDuration(audioDuration);
      const peaks = waveform.exportPeaks({ channels: 1, maxLength: 64 })[0] ?? [];
      setWaveformPeaks(peaks.map((peak) => Math.abs(peak)));
      setReady(true);
    });
    waveform.on("timeupdate", setCurrentTime);
    waveform.on("play", () => setPlaying(true));
    waveform.on("pause", () => setPlaying(false));
    waveform.on("finish", () => setPlaying(false));
    return () => {
      waveform.destroy();
      waveSurferRef.current = null;
    };
  }, [url]);

  return (
    <div className={styles.whatsAppVoiceMessage}>
      <button type="button" onClick={() => void waveSurferRef.current?.playPause()} aria-label={playing ? "Pause voice message" : "Play voice message"}>
        <span
          className={playing ? styles.whatsAppPauseGlyph : styles.whatsAppPlayGlyph}
          aria-hidden="true"
        />
      </button>
      <div
        className={styles.whatsAppVoiceScrubber}
        style={{ "--voice-progress": `${progress}%` } as CSSProperties}
        onPointerDown={(event) => {
          draggingRef.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          seekFromPointer(event);
        }}
        onPointerMove={(event) => {
          if (draggingRef.current) seekFromPointer(event);
        }}
        onPointerUp={(event) => {
          seekFromPointer(event);
          draggingRef.current = false;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          draggingRef.current = false;
        }}
        role="slider"
        aria-label="Voice message progress"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(currentTime)}
      >
        <div
          ref={waveformRef}
          className={`${styles.whatsAppWaveSurfer} ${ready ? styles.whatsAppWaveSurferReady : styles.whatsAppWaveSurferLoading}`}
        />
        {waveformPeaks.length ? (
          <div className={styles.whatsAppVoiceRecordedPeaks} aria-hidden="true">
            {waveformPeaks.map((peak, index) => (
              <span
                key={`decoded-peak-${index}`}
                style={{ height: `${Math.max(2, Math.round(peak * 26))}px` }}
              />
            ))}
          </div>
        ) : null}
        <span className={styles.whatsAppVoiceScrubberHandle} aria-hidden="true" />
      </div>
      <time>{formatAudioTime(currentTime)} / {formatAudioTime(duration)}</time>
    </div>
  );
}
