// Fahrzeugbilder aus src/assets/vehicles: Produktfotos für Markt und Fuhrpark, Seitenprofile für Karte und Fahrzeugfenster.
// Fehlt ein Bild (neues Modell), greifen die gezeichneten SVG-Ansichten aus VehicleArt.

import { TRUCK_BY_ID, type TrailerType } from '@spedsim/core';
import { TrailerArt, VehicleArt } from './VehicleArt.tsx';

type Urls = Record<string, string>;
const byName = (files: Urls): Urls => Object.fromEntries(Object.entries(files).map(([p, url]) => [p.slice(p.lastIndexOf('/') + 1, -5), url]));
const PHOTO = byName(import.meta.glob('../assets/vehicles/photo/*.webp', { eager: true, query: '?url', import: 'default' }) as Urls);
const PROFILE = byName(import.meta.glob('../assets/vehicles/profile/*.webp', { eager: true, query: '?url', import: 'default' }) as Urls);
/** kleine Seitenprofile für Kartensymbole (12 px je Meter Fahrzeuglänge) */
export const MAP_ICON_URLS = byName(import.meta.glob('../assets/vehicles/map/*.webp', { eager: true, query: '?url', import: 'default' }) as Urls);

/**
 * Welches Seitenprofil passt: Solo-LKW und Transporter haben genau eins.
 * Bei Sattelzügen zuerst die genaue Kombination, sonst die Zugmaschine mit ihrem Standard-Auflieger.
 * Ohne Auflieger gibt es kein Profil (null).
 */
export function profileKey(modelId: string, trailer?: TrailerType | null): string | null {
  const m = TRUCK_BY_ID[modelId];
  if (!m) return null;
  if (m.kind === 'rigid' || m.kind === 'van') return PROFILE[modelId] ? modelId : null;
  if (!trailer) return null;
  const exact = `${modelId}__${trailer}`;
  if (PROFILE[exact]) return exact;
  return Object.keys(PROFILE).find((k) => k.startsWith(`${modelId}__`)) ?? null;
}

const imgStyle = (width: number) => ({ width, height: 'auto', display: 'block', flexShrink: 0 });

/** Produktfoto eines Modells; mit Auflieger daneben dessen Foto */
export function VehiclePhoto({ modelId, trailer, width = 64, seed }: { modelId: string; trailer?: TrailerType | null; width?: number; seed?: number }) {
  const url = PHOTO[modelId];
  if (!url) return <VehicleArt modelId={modelId} trailer={trailer} width={trailer ? width * 2 : width} seed={seed} />;
  const m = TRUCK_BY_ID[modelId];
  const title = m ? `${m.maker} ${m.name}` : modelId;
  return (
    <span className="vehicle-photo" title={title}>
      <img src={url} alt={title} style={imgStyle(width)} loading="lazy" draggable={false} />
      {trailer && <TrailerPhoto type={trailer} width={Math.round(width * 1.15)} seed={seed} />}
    </span>
  );
}

export function TrailerPhoto({ type, width = 84, seed }: { type: TrailerType; width?: number; seed?: number }) {
  const url = PHOTO[`trailer-${type}`];
  if (!url) return <TrailerArt type={type} width={width} seed={seed} />;
  return <img className="vehicle-photo" src={url} alt="Auflieger" title="Auflieger" style={imgStyle(width)} loading="lazy" draggable={false} />;
}

/** Seitenansicht für das Fahrzeugfenster: Profil, wenn vorhanden, sonst Foto */
export function VehicleProfile({ modelId, trailer, width = 300, seed }: { modelId: string; trailer?: TrailerType | null; width?: number; seed?: number }) {
  const key = profileKey(modelId, trailer);
  if (!key) return <VehiclePhoto modelId={modelId} width={Math.round(width * 0.45)} seed={seed} />;
  const m = TRUCK_BY_ID[modelId];
  // Profile sind auf die Fahrzeuglänge skaliert: Solo-LKW und Transporter kleiner zeigen
  const w = m?.kind === 'van' ? width * 0.55 : m?.kind === 'rigid' ? width * 0.7 : width;
  return <img className="vehicle-photo" src={PROFILE[key]} alt={m ? `${m.maker} ${m.name}` : modelId} style={imgStyle(Math.round(w))} draggable={false} />;
}
