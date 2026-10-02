"use client";

import { useSyncExternalStore } from "react";
import { FiMonitor, FiMoon, FiSun } from "react-icons/fi";
import styles from "./theme-control.module.css";

type Theme = "system" | "light" | "dark";
const storageKey = "journi-theme";
const valid = (value: string | null): Theme => value === "light" || value === "dark" ? value : "system";
const options = [
  { value: "light", label: "Light", Icon: FiSun },
  { value: "dark", label: "Dark", Icon: FiMoon },
  { value: "system", label: "System", Icon: FiMonitor },
] as const;

let memoryPreference: Theme | null = null;
function readPreference(): Theme {
  if (memoryPreference) return memoryPreference;
  try { return valid(localStorage.getItem(storageKey)); } catch { return "system"; }
}
function apply(value: Theme) {
  const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = value === "system" ? (dark ? "dark" : "light") : value;
}
function subscribe(onChange: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const refresh = () => { apply(readPreference()); onChange(); };
  const stored = (event: StorageEvent) => {
    if (event.key === storageKey || event.key === null) { memoryPreference = valid(event.newValue); refresh(); }
  };
  refresh();
  media.addEventListener("change", refresh);
  window.addEventListener("storage", stored);
  window.addEventListener("journi-theme-change", refresh);
  return () => { media.removeEventListener("change", refresh); window.removeEventListener("storage", stored); window.removeEventListener("journi-theme-change", refresh); };
}
let currentTransition: ViewTransition | null = null;
let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
function change(value: Theme, source: HTMLElement) {
  const root = document.documentElement;
  const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolved = value === "system" ? (dark ? "dark" : "light") : value;
  const update = () => {
    memoryPreference = value;
    apply(value);
    try { localStorage.setItem(storageKey, value); } catch { /* The theme still works for this visit. */ }
    window.dispatchEvent(new Event("journi-theme-change"));
  };
  currentTransition?.skipTransition();
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || root.dataset.theme === resolved) { update(); return; }
  if (typeof document.startViewTransition === "function") {
    const rect = source.getBoundingClientRect();
    root.style.setProperty("--theme-origin-x", `${rect.left + rect.width / 2}px`);
    root.style.setProperty("--theme-origin-y", `${rect.top + rect.height / 2}px`);
    root.classList.add("theme-reveal");
    const transition = document.startViewTransition(update);
    currentTransition = transition;
    void transition.ready.catch(() => undefined);
    void transition.finished.catch(() => undefined).finally(() => {
      if (currentTransition === transition) { root.classList.remove("theme-reveal"); currentTransition = null; }
    });
  } else {
    root.classList.add("theme-fade");
    clearTimeout(fallbackTimer);
    update();
    fallbackTimer = setTimeout(() => root.classList.remove("theme-fade"), 500);
  }
}
export function ThemeControl({ inline = false }: { inline?: boolean }) {
  const theme = useSyncExternalStore(subscribe, readPreference, () => "system" as Theme);
  return <div className={`${styles.control} ${inline ? styles.inline : styles.fallback}`} data-theme-navigation={inline ? "true" : undefined} role="group" aria-label="Colour theme">
    {options.map(({ value, label, Icon }) => <button className={styles.option} key={value} type="button" aria-label={label} title={`${label} mode`} aria-pressed={theme === value} onClick={event => change(value, event.currentTarget)}>
      <Icon aria-hidden="true" /><span>{label}</span>
    </button>)}
    {inline ? <button type="button" className={styles.mobileToggle} aria-label="Toggle light and dark mode" title="Toggle light and dark mode" onClick={event => change(document.documentElement.dataset.theme === "dark" ? "light" : "dark", event.currentTarget)}><FiSun aria-hidden="true" /></button> : null}
  </div>;
}
