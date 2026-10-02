"use client";
import { useEffect, useRef, useState } from "react";
import { FiX, FiMapPin, FiTrash2 } from "react-icons/fi";
import { FilterWorldMap } from "./filter-world-map";
import { emptyPreset, type PublicTripPreset } from "@/lib/public-trip-filters";
import styles from "./public-trip-filter-modal.module.css";

export function PublicTripFilterModal({ initial, presets, onClose, onSave, onDelete }: {
  initial: PublicTripPreset | null; presets: PublicTripPreset[]; onClose: () => void;
  onSave: (preset: PublicTripPreset) => Promise<void>; onDelete: (id: string) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(() => initial || emptyPreset());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  const invalidDates = Boolean(draft.from && draft.to && draft.from > draft.to);
  async function save() {
    if (busy || !draft.name.trim() || !draft.location || invalidDates) return;
    setBusy(true); setError("");
    try { await onSave({ ...draft, id: draft.id || crypto.randomUUID(), name: draft.name.trim(), place: draft.location.name }); onClose(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save this filter. Please try again."); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (busy || !draft.id) return;
    setBusy(true); setError("");
    try { await onDelete(draft.id); onClose(); }
    catch { setError("Unable to delete this filter. Please try again."); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="custom-filter-title" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <header className={styles.header}><div><span className={styles.eyebrow}><FiMapPin /> YOUR NEXT ADVENTURE</span><h2 id="custom-filter-title">{draft.id ? "Edit your filter" : "Create a filter"}</h2><p>Pin a country or reuse a saved filter, then save and apply.</p></div><button type="button" className={styles.close} aria-label="Close filter" disabled={busy} onClick={onClose}><FiX /></button></header>
    <div className={styles.savedFilters}>
      <label htmlFor="saved-trip-filter">Your saved filters</label>
      <div className={styles.savedFilterPicker}><select id="saved-trip-filter" disabled={busy} value={draft.id} onChange={(event) => {
        const saved = presets.find((preset) => preset.id === event.target.value);
        setDraft(saved ? structuredClone(saved) : emptyPreset());
        setError("");
      }}>
        <option value="">+ Create a new filter</option>
        {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
      </select>
      {draft.id ? <button type="button" className={styles.delete} disabled={busy} onClick={() => void remove()}><FiTrash2 /> Delete permanently</button> : null}</div>
      <p className={styles.hint}>{draft.id ? "Saving updates this filter, adds it to your list and applies it." : "Saved filters stay here for your next visit."}</p>
    </div>
    <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <fieldset disabled={busy} className={styles.fields}>
        <div className={styles.mapColumn}><FilterWorldMap key={draft.id || "new"} value={draft.location} onChange={(location) => { if (!busy) setDraft((current) => ({ ...current, location, place: location?.name || "", name: current.name || (location ? `${location.name} trips` : "") })); }} /></div>
        <div className={styles.preferences}>
          <label>Filter name<input autoFocus required maxLength={60} placeholder="e.g. Summer in Spain" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
          <div className={styles.selection}><FiMapPin /><div><strong>{draft.location?.name || "Choose a country or draw an area"}</strong><p>{draft.location?.radiusKm ? `Within ${draft.location.radiusKm.toLocaleString()} km of your pin. Trips without a known location are excluded.` : "Matches the country in a trip’s destination."}</p></div></div>
          <div className={styles.dateFields}><label>From<input type="date" value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} /></label><label>Until<input type="date" min={draft.from || undefined} value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} /></label></div>
          <p className={styles.hint}>Dates are optional. Trips must overlap your chosen dates.</p>
          <label>Keywords<input maxLength={160} placeholder="e.g. beach" value={draft.list.search} onChange={(event) => setDraft({ ...draft, list: { ...draft.list, search: event.target.value } })} /></label>
          <label>When<select value={draft.list.timing} onChange={(event) => setDraft({ ...draft, list: { ...draft.list, timing: event.target.value } })}><option value="all">Any time</option><option value="upcoming">Upcoming</option><option value="ongoing">Happening now</option><option value="past">Past trips</option><option value="undated">Dates undecided</option></select></label>
          <label>Sort by<select value={draft.list.sort} onChange={(event) => setDraft({ ...draft, list: { ...draft.list, sort: event.target.value } })}><option value="default">Default</option><option value="soonest">Date: soonest</option><option value="name">Name A–Z</option></select></label>
          {invalidDates ? <p className={styles.error} role="alert">Choose an end date on or after the start date.</p> : null}
          {draft.list.timing === "undated" && (draft.from || draft.to) ? <p className={styles.error}>Clear the dates to include trips with undecided dates.</p> : null}
        </div>
      </fieldset>
      <footer className={styles.footer}><span />
        <div>{error ? <p className={styles.error} role="alert">{error}</p> : null}<button type="submit" className={styles.save} disabled={busy || !draft.name.trim() || !draft.location || invalidDates || (draft.list.timing === "undated" && Boolean(draft.from || draft.to))}>{busy ? "Saving…" : "Save & apply filter"}</button></div>
      </footer>
    </form>
  </dialog>;
}
