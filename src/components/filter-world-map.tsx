"use client";
import { useEffect, useRef, useState } from "react";
import type { GeoJSON, Map as LeafletMap, CircleMarker, Circle } from "leaflet";
import type { FeatureCollection, Geometry } from "geojson";
import { worldCountryId } from "@/lib/world-country-id";
import { distanceKm, type FilterLocation } from "@/lib/public-trip-filters";
import styles from "./public-trip-filter-modal.module.css";

type Countries = FeatureCollection<Geometry, { name: string }>;
export function FilterWorldMap({ value, onChange }: { value: FilterLocation | null; onChange: (location: FilterLocation | null) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const borders = useRef<GeoJSON | null>(null);
  const marker = useRef<CircleMarker | null>(null);
  const circle = useRef<Circle | null>(null);
  const [drawing, setDrawing] = useState<"center" | "edge" | null>(null);
  const drawStage = useRef<"center" | "edge" | null>(null);
  const drawCenter = useRef<FilterLocation | null>(null);
  const onPick = useRef(onChange);
  function startDrawing() { drawStage.current = "center"; setDrawing("center"); }
  function stopDrawing() { drawStage.current = null; setDrawing(null); }

  const selection = useRef(value);
  const [countries, setCountries] = useState<{ code: string; name: string }[]>([]);
  const [error, setError] = useState("");
  useEffect(() => { onPick.current = onChange; selection.current = value; }, [onChange, value]);
  useEffect(() => {
    let cancelled = false;
    const abort = new AbortController();
    let observer: ResizeObserver | undefined;
    void Promise.all([import("leaflet"), fetch("/images/world-countries.geojson", { signal: abort.signal }).then((response) => { if (!response.ok) throw new Error(); return response.json() as Promise<Countries>; })]).then(([L, data]) => {
      if (cancelled || !host.current) return;
      const normalisedData: Countries = { ...data, features: data.features.map((feature) => ({ ...feature, id: worldCountryId(feature.id, feature.properties.name) })) };
      const instance = L.map(host.current, { minZoom: 1, maxZoom: 12, scrollWheelZoom: false, worldCopyJump: false, maxBounds: [[-85, -180], [85, 180]], maxBoundsViscosity: 1 }).setView([18, 0], 1);
      map.current = instance;
      instance.attributionControl.setPrefix(false);
      instance.attributionControl.addAttribution('Boundaries: <a href="https://www.naturalearthdata.com/" target="_blank" rel="noreferrer">Natural Earth</a>');
      circle.current = L.circle([0, 0], { radius: 250000, color: "#208bff", weight: 2, fillColor: "#389cff", fillOpacity: .2, interactive: false });
      function pick(lat: number, lng: number, name?: string, code = "radius") {
        const point = { lat: Math.max(-85, Math.min(85, lat)), lng: ((lng + 180) % 360 + 360) % 360 - 180 };
        if (drawStage.current === "edge" && drawCenter.current) {
          onPick.current({ ...drawCenter.current, radiusKm: Math.max(1, Math.min(5000, Math.round(distanceKm(drawCenter.current, point)))) });
          drawStage.current = null; setDrawing(null); return;
        }
        const next = { ...point, name: name || `Area at ${point.lat.toFixed(2)}, ${point.lng.toFixed(2)}`, code,
          ...(drawStage.current === "center" || selection.current?.radiusKm ? { radiusKm: selection.current?.radiusKm || 250 } : {}) };
        if (!name && !next.radiusKm) return;
        if (drawStage.current === "center") { drawCenter.current = next; drawStage.current = "edge"; setDrawing("edge"); }
        onPick.current(next);
      }
      instance.on("click", event => pick(event.latlng.lat, event.latlng.lng));
      instance.on("mousemove", event => {
        if (drawStage.current === "edge" && drawCenter.current) circle.current?.setRadius(Math.max(1, Math.min(5000, distanceKm(drawCenter.current, event.latlng))) * 1000);
      });
      const layer = L.geoJSON(normalisedData, {
        style: (feature) => ({ color: "#7998b3", weight: .7, fillColor: !selection.current?.radiusKm && String(feature?.id) === selection.current?.code ? "#389cff" : "#c1d4df", fillOpacity: .85 }),
        onEachFeature: (feature, country) => {
          country.bindTooltip(feature.properties.name);
          country.on("add", () => {
            const element = (country as import("leaflet").Path).getElement();
            element?.setAttribute("aria-label", `Select ${feature.properties.name}`);
            element?.setAttribute("role", "button");
          });
          country.on("click", (event) => {
            L.DomEvent.stopPropagation(event.originalEvent);
            pick(event.latlng.lat, event.latlng.lng, feature.properties.name, String(feature.id));
          });
        },
      }).addTo(instance);
      borders.current = layer;
      marker.current = L.circleMarker(selection.current ? [selection.current.lat, selection.current.lng] : [0, 0], { interactive: false, radius: 7, color: "#ffffff", weight: 3, fillColor: "#1789f5", fillOpacity: 1, opacity: selection.current ? 1 : 0 });
      if (selection.current) marker.current.addTo(instance);
      if (selection.current?.radiusKm) {
        circle.current.setLatLng(selection.current).setRadius(selection.current.radiusKm * 1000).addTo(instance);
        instance.fitBounds(circle.current.getBounds(), { padding: [28, 28], maxZoom: 10, animate: false });
      }
      setCountries(normalisedData.features.map((feature) => ({ code: String(feature.id), name: feature.properties.name })).sort((a, b) => a.name.localeCompare(b.name)));
      observer = new ResizeObserver(() => instance.invalidateSize()); observer.observe(host.current);
      instance.invalidateSize();
    }).catch(() => { if (!cancelled) setError("The map could not load. Close and reopen this window to try again."); });
    return () => { cancelled = true; abort.abort(); observer?.disconnect(); map.current?.remove(); map.current = null; borders.current = null; marker.current = null; circle.current = null; };
  }, []);
  useEffect(() => {
    borders.current?.setStyle((feature) => ({ fillColor: !value?.radiusKm && String(feature?.id) === value?.code ? "#389cff" : "#c1d4df" }));
    if (value && map.current && marker.current) marker.current.setLatLng([value.lat, value.lng]).setStyle({ opacity: 1 }).addTo(map.current);
    if (!value) marker.current?.remove();
    if (value?.radiusKm && map.current) circle.current?.setLatLng(value).setRadius(value.radiusKm * 1000).addTo(map.current);
    else circle.current?.remove();
  }, [value]);
  function chooseCountry(code: string) {
    stopDrawing();
    borders.current?.eachLayer((layer) => {
      const country = layer as GeoJSON;
      const feature = country.feature as { id?: string; properties?: { name: string } } | undefined;
      if (String(feature?.id) !== code) return;
      const center = country.getBounds().getCenter();
      onChange({ code, name: feature!.properties!.name, lat: center.lat, lng: center.lng, ...(value?.radiusKm ? { radiusKm: value.radiusKm } : {}) });
      map.current?.fitBounds(country.getBounds(), { padding: [28, 28], maxZoom: 4, animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches });
    });
  }
  return <div className={styles.mapArea} onKeyDown={(event) => { if (event.key === "Escape" && drawing) { event.preventDefault(); event.stopPropagation(); stopDrawing(); if (value?.radiusKm) circle.current?.setRadius(value.radiusKm * 1000); } }}>
    <div className={styles.mapTools} role="group" aria-label="Location filter type">
      <button type="button" aria-pressed={!value?.radiusKm && !drawing} onClick={() => { stopDrawing(); if (value) { const country = countries.find(item => item.code === value.code); if (country) onChange({ name: country.name, code: value.code, lat: value.lat, lng: value.lng }); else onChange(null); } }}>Whole country</button>
      <button type="button" aria-pressed={Boolean(value?.radiusKm || drawing)} onClick={() => { if (value) onChange({ ...value, radiusKm: value.radiusKm || 250 }); else startDrawing(); }}>Radius</button>
      <button type="button" onClick={startDrawing}>Draw radius</button>
    </div>
    <label className={styles.countryPicker}>Find a country<select aria-label="Choose a country" value={countries.some(country => country.code === value?.code) ? value!.code : ""} onChange={(event) => chooseCountry(event.target.value)}><option value="" disabled>Choose on the map or from this list</option>{countries.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}</select></label>
    <div ref={host} data-drawing={Boolean(drawing)} className={styles.map} aria-label="World map. Click a country to place your filter pin." />
    {value?.radiusKm ? <label className={styles.countryPicker}>Radius: {value.radiusKm.toLocaleString()} km
      <input aria-label="Radius in kilometres" type="range" min="1" max="5000" step="1" value={value.radiusKm} onChange={event => { stopDrawing(); onChange({ ...value, radiusKm: Number(event.target.value) }); }} />
      <input aria-label="Radius distance in kilometres" type="number" min="1" max="5000" step="1" value={value.radiusKm} onChange={event => { const radiusKm = Number(event.target.value); if (Number.isFinite(radiusKm) && radiusKm >= 1 && radiusKm <= 5000) { stopDrawing(); onChange({ ...value, radiusKm }); } }} />
    </label> : null}
    {error ? <p role="alert">{error}</p> : null}
    <p className={styles.mapHint} role="status">{drawing === "center" ? "Click or tap the centre of your area." : drawing === "edge" ? "Move outwards and click or tap to set the radius. Escape finishes drawing." : value?.radiusKm ? "Click to move the centre. Adjust the distance below the map, or draw a new radius." : value ? `Pinned: ${value.name}` : "Click a country to drop a pin. Drag to explore; use + and − to zoom."}</p>
  </div>;
}
