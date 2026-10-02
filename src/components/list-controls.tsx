"use client";
import { FiSearch, FiX } from "react-icons/fi";
import styles from "./list-controls.module.css";

type Filter = { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[] };
export function ListControls({ search, onSearch, placeholder, filters, count, total, onReset, active }: {
  search: string; onSearch: (value: string) => void; placeholder: string; filters: Filter[];
  count: number; total: number; onReset: () => void; active: boolean;
}) {
  return <div className={styles.toolbar}>
    <label className={styles.search}><FiSearch aria-hidden="true" /><input type="search" aria-label={placeholder} placeholder={placeholder} value={search} onChange={(e) => onSearch(e.target.value)} /></label>
    {filters.map((filter) => <label className={styles.filter} key={filter.label}><span>{filter.label}</span><select aria-label={filter.label} value={filter.value} onChange={(e) => filter.onChange(e.target.value)}>{filter.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>)}
    <span className={styles.count} role="status">{count} of {total}</span>
    {active ? <button className={styles.reset} type="button" onClick={onReset}><FiX aria-hidden="true" /> Clear</button> : null}
  </div>;
}
