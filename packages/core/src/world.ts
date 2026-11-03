// Umweltbedingungen für Fahrten: Wetter je Land, Sonntags- und Feiertagsfahrverbote, Grenzkontrollen.
// Alle Regeln sind bewusst vereinfacht (siehe GAME_DESIGN.md, Abschnitt „Wetter, Fahrverbote, Grenzen“).

import { CITIES, CITY_BY_ID } from './data/cities.ts';
import { CARGO_BY_ID, COUNTRY_NAMES, TRUCK_BY_ID } from './data/catalog.ts';
import type { SimContext } from './context.ts';
import { weatherClosure } from './disruptions.ts';
import { addLog } from './finance.ts';
import { rand } from './rng.ts';
import type { RoadEdge } from './routing.ts';
import { MIN_PER_DAY, formatDateTime, holidayName, hourOfDay, minuteOfDay, season, weekday } from './time.ts';
import type { CountryWeather, GameState, GameTime, Trip, Vehicle, WeatherKind } from './types.ts';

// ---------------------------------------------------------------- Wetter

export interface WeatherDef {
  name: string;
  /** Geschwindigkeitsfaktor */
  speed: number;
  /** Unfallrisiko relativ zu klarem Wetter */
  risk: number;
}

export const WEATHER: Record<WeatherKind, WeatherDef> = {
  clear: { name: 'Klar', speed: 1, risk: 1 },
  rain: { name: 'Regen', speed: 0.93, risk: 1.5 },
  fog: { name: 'Nebel', speed: 0.85, risk: 2 },
  snow: { name: 'Schneefall', speed: 0.72, risk: 3 },
  ice: { name: 'Glätte', speed: 0.6, risk: 5 },
  storm: { name: 'Sturm', speed: 0.85, risk: 2.5 },
  heat: { name: 'Hitze', speed: 0.98, risk: 1.2 },
};

/** Länder mit Gebirgsanteil: mehr Schnee */
const MOUNTAIN = new Set(['CH', 'AT', 'NO', 'SI', 'SK']);

export const COUNTRIES: string[] = [...new Set(CITIES.map((c) => c.country))].sort();

const COUNTRY_LAT: Record<string, number> = Object.fromEntries(
  COUNTRIES.map((k) => {
    const cs = CITIES.filter((c) => c.country === k);
    return [k, cs.reduce((a, c) => a + c.lat, 0) / cs.length];
  }),
);

const clampN = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Gewichte der Wetterlagen je Land und Jahreszeit */
export function weatherWeights(country: string, t: GameTime): Record<WeatherKind, number> {
  const lat = COUNTRY_LAT[country] ?? 50;
  const cold = clampN((lat - 40) / 15, 0.1, 1.6) + (MOUNTAIN.has(country) ? 0.6 : 0);
  const warm = clampN((50 - lat) / 10 + 0.5, 0.2, 1.8);
  switch (season(t)) {
    case 'winter':
      return { clear: 40, rain: 20, fog: 14, snow: 16 * cold, ice: 8 * cold, storm: 6, heat: 0 };
    case 'spring':
      return { clear: 55, rain: 30, fog: 6, snow: 3 * cold, ice: 1 * cold, storm: 6, heat: 2 * warm };
    case 'summer':
      return { clear: 60, rain: 18, fog: 2, snow: 0, ice: 0, storm: 6, heat: 14 * warm };
    default:
      return { clear: 45, rain: 30, fog: 15, snow: 2 * cold, ice: 1 * cold, storm: 8, heat: 0 };
  }
}

function rollWeather(state: GameState, country: string): CountryWeather {
  const w = weatherWeights(country, state.time);
  const kind = rand.weighted(state, Object.keys(w) as WeatherKind[], (k) => w[k])!;
  const hours = kind === 'clear' ? rand.int(state, 12, 36) : kind === 'snow' || kind === 'ice' || kind === 'storm' ? rand.int(state, 6, 20) : rand.int(state, 6, 24);
  return { kind, since: state.time, until: state.time + hours * 60 };
}

/** Wetterlage eines Landes (klar, solange noch nichts gewürfelt wurde) */
export function weatherIn(state: GameState, country: string): WeatherKind {
  return state.weather?.[country]?.kind ?? 'clear';
}

export function edgeCountry(edge: RoadEdge, reverse = false): string {
  return CITY_BY_ID[reverse ? edge.b : edge.a].country;
}

export function edgeWeather(state: GameState, edge: RoadEdge, reverse = false): WeatherDef {
  return WEATHER[weatherIn(state, edgeCountry(edge, reverse))];
}

const SEVERE: WeatherKind[] = ['snow', 'ice', 'storm'];

/** Stündlich: abgelaufene Wetterlagen neu würfeln; Unwetter können Strecken sperren. */
export function updateWeather(state: GameState, ctx: SimContext): void {
  state.weather ??= {};
  const ownCountries = new Set<string>();
  for (const l of state.company.locations) ownCountries.add(CITY_BY_ID[l.cityId].country);
  for (const v of Object.values(state.vehicles)) ownCountries.add(CITY_BY_ID[v.cityId]?.country);
  for (const c of COUNTRIES) {
    const cur = state.weather[c];
    if (!cur || state.time >= cur.until) {
      const next = rollWeather(state, c);
      state.weather[c] = next;
      if (cur && SEVERE.includes(next.kind) && next.kind !== cur.kind && ownCountries.has(c))
        addLog(state, { level: 'warning', category: 'trip', text: `Wetter: ${WEATHER[next.kind].name} in ${COUNTRY_NAMES[c] ?? c} bis ca. ${formatDateTime(next.until)} – langsamere Fahrt, höheres Unfallrisiko.` });
    }
    const w = state.weather[c];
    // Unwetter: gelegentlich Sperrungen (Schneeverwehungen, umgestürzte Bäume)
    if ((w.kind === 'snow' || w.kind === 'storm' || w.kind === 'ice') && rand.chance(state, 0.03 * state.difficulty.eventFactor)) {
      const edges = ctx.net.edges.filter((e) => !e.ferry && CITY_BY_ID[e.a].country === c);
      if (edges.length) weatherClosure(state, ctx, rand.pick(state, edges), w.kind === 'storm' ? 'Sturmschäden' : w.kind === 'ice' ? 'Glatteis' : 'Schneeverwehungen');
    }
  }
}

// ---------------------------------------------------------------- Fahrverbote

/** Fahrverbote für LKW über 7,5 t (vereinfacht). Liefert das Ende des laufenden Verbots oder null. */
export function banUntil(country: string, t: GameTime): GameTime | null {
  const wd = weekday(t);
  const h = hourOfDay(t);
  const day0 = t - minuteOfDay(t);
  const at = (dayOffset: number, hour: number) => day0 + dayOffset * MIN_PER_DAY + hour * 60;
  const holiday = !!holidayName(t);
  const sunday = wd === 6 || holiday;
  switch (country) {
    case 'DE':
    case 'SK':
      return sunday && h < 22 ? at(0, 22) : null;
    case 'AT':
      if (wd === 5 && h >= 15) return at(1, 22);
      return sunday && h < 22 ? at(0, 22) : null;
    case 'CH':
      // Sonntagsfahrverbot und Nachtfahrverbot 22–5 Uhr
      if (sunday) return at(1, 5);
      if (h >= 22) return at(1, 5);
      if (h < 5) return at(0, 5);
      return null;
    case 'FR':
    case 'HU':
      if (wd === 5 && h >= 22) return at(1, 22);
      return sunday && h < 22 ? at(0, 22) : null;
    case 'IT':
      return sunday && h >= 9 && h < 22 ? at(0, 22) : null;
    case 'CZ':
      return sunday && h >= 13 && h < 22 ? at(0, 22) : null;
    case 'PL':
      return holiday && h >= 8 && h < 22 ? at(0, 22) : null;
    default:
      return null;
  }
}

export const BAN_COUNTRIES = ['DE', 'AT', 'CH', 'FR', 'IT', 'CZ', 'SK', 'HU', 'PL'];

export const BAN_RULES: Record<string, string> = {
  DE: 'Sonn- und Feiertage 0–22 Uhr',
  AT: 'Samstag ab 15 Uhr bis Sonntag 22 Uhr, Feiertage 0–22 Uhr',
  CH: 'Sonn- und Feiertage ganztags, Nachtfahrverbot 22–5 Uhr',
  FR: 'Samstag 22 Uhr bis Sonntag 22 Uhr, Feiertage',
  IT: 'Sonn- und Feiertage 9–22 Uhr',
  CZ: 'Sonn- und Feiertage 13–22 Uhr',
  SK: 'Sonn- und Feiertage 0–22 Uhr',
  HU: 'Samstag 22 Uhr bis Sonntag 22 Uhr, Feiertage',
  PL: 'Feiertage 8–22 Uhr',
};

/** Gilt das Fahrverbot für dieses Fahrzeug? (über 7,5 t; Frischdienst mit Kühlware ist ausgenommen) */
export function banApplies(state: GameState, vehicle: Vehicle, trip?: Trip): boolean {
  const model = TRUCK_BY_ID[vehicle.modelId];
  if (!model) return false;
  if (model.kind === 'van' || (model.kind === 'rigid' && (model.payloadT ?? 0) <= 4)) return false;
  if (!trip) return true;
  const loaded = trip.legs[trip.legIndex]?.loaded;
  if (!loaded) return true;
  const ids = [trip.orderId, ...(trip.stops ?? []).map((s) => s.orderId)].filter((x): x is string => !!x);
  return !ids.some((id) => {
    const o = state.orders[id];
    return o && o.status === 'in_transit' && CARGO_BY_ID[o.cargoId]?.trailer === 'reefer';
  });
}

/** Läuft für den LKW in diesem Land gerade ein Fahrverbot? Liefert dessen Ende. */
export function tripBan(state: GameState, trip: Trip, country: string): GameTime | null {
  const until = banUntil(country, state.time);
  if (until === null) return null;
  const v = state.vehicles[trip.vehicleId];
  return v && banApplies(state, v, trip) ? until : null;
}

/** Erstes Fahrverbot auf einer Route im Zeitraum (stündlich geprüft) – für Warnungen bei der Planung. */
export function banOnRoute(countries: string[], from: GameTime, to: GameTime): { country: string; at: GameTime; until: GameTime } | null {
  const list = countries.filter((c) => BAN_COUNTRIES.includes(c));
  if (!list.length) return null;
  for (let t = from; t <= to; t += 60)
    for (const c of list) {
      const u = banUntil(c, t);
      if (u !== null) return { country: c, at: t, until: u };
    }
  return null;
}

export function routeCountries(nodes: string[]): string[] {
  return [...new Set(nodes.map((n) => CITY_BY_ID[n]?.country).filter(Boolean))];
}

// ---------------------------------------------------------------- Grenzen

/** Länder außerhalb der EU-Zollunion: an ihren Grenzen wird kontrolliert und verzollt */
export const CUSTOMS = new Set(['CH', 'NO', 'GB', 'RS', 'BA', 'MK']);
const BALKAN = new Set(['RS', 'BA', 'MK']);

export function isCustomsBorder(a: string, b: string): boolean {
  if (a === b) return false;
  return CUSTOMS.has(a) || CUSTOMS.has(b);
}

/** Erwartete Wartezeit an einer Grenze (min) */
export function expectedBorderWait(a: string, b: string): number {
  if (!isCustomsBorder(a, b)) return 0;
  return BALKAN.has(a) || BALKAN.has(b) ? 120 : 35;
}

export function rollBorderWait(state: GameState, a: string, b: string): number {
  if (!isCustomsBorder(a, b)) return 0;
  const balkan = BALKAN.has(a) || BALKAN.has(b);
  const wd = weekday(state.time);
  const busy = wd === 0 || wd === 4 ? 1.25 : 1; // Montag und Freitag mehr Verkehr
  return Math.round((balkan ? rand.int(state, 40, 220) : rand.int(state, 15, 60)) * busy * (0.7 + 0.3 * state.difficulty.eventFactor));
}

/** Summe der erwarteten Grenzwartezeiten entlang einer Knotenfolge */
export function routeBorderMin(ctx: SimContext, nodes: string[]): number {
  let min = 0;
  for (let i = 1; i < nodes.length; i++) {
    const e = ctx.net.edgeBetween(nodes[i - 1], nodes[i]);
    if (!e || e.ferry) continue;
    min += expectedBorderWait(CITY_BY_ID[e.a].country, CITY_BY_ID[e.b].country);
  }
  return min;
}
