// Erfolge und Rekorde: Meilensteine, die einmal freigeschaltet werden, und Bestwerte der Firma.
// Zähler für Lieferungen werden bei jeder Zustellung fortgeschrieben; die Prüfung der Erfolge
// läuft nach jeder Zustellung und einmal täglich.

import { CITY_BY_ID } from './data/cities.ts';
import { CARGO_BY_ID } from './data/catalog.ts';
import { addLog } from './finance.ts';
import { MIN_PER_DAY, dayIndex, toDate } from './time.ts';
import type { GameState, Order, ProgressState } from './types.ts';

export function defaultProgress(): ProgressState {
  return {
    achievements: {},
    records: { longestKm: 0, bestPayment: 0, bestMonth: 0, onTimeStreak: 0, bestStreak: 0, maxVehicles: 0, maxBalance: 0 },
    counts: { international: 0, premium: 0, heavy: 0, fair: 0, reefer: 0, tendersWon: 0, quartersMet: 0 },
    countries: [],
  };
}

export interface AchievementDef {
  id: string;
  title: string;
  text: string;
  group: 'Touren' | 'Firma' | 'Spezial';
  check(state: GameState, p: ProgressState): boolean;
  /** Fortschritt [jetzt, Ziel] für die Anzeige */
  progress?(state: GameState, p: ProgressState): [number, number];
}

const deliveries = (s: GameState) => s.company.totals.deliveries;
const vehicles = (s: GameState) => Object.keys(s.vehicles).length;
const count = (n: number, of: number) => (): [number, number] => [Math.min(n, of), of];

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_delivery', group: 'Touren', title: 'Die erste Fuhre', text: 'Die erste Lieferung zugestellt.', check: (s) => deliveries(s) >= 1 },
  { id: 'deliveries_100', group: 'Touren', title: 'Hundert Touren', text: '100 Lieferungen zugestellt.', check: (s) => deliveries(s) >= 100, progress: (s) => count(deliveries(s), 100)() },
  { id: 'deliveries_1000', group: 'Touren', title: 'Tausend Touren', text: '1.000 Lieferungen zugestellt.', check: (s) => deliveries(s) >= 1000, progress: (s) => count(deliveries(s), 1000)() },
  { id: 'international', group: 'Touren', title: 'Grenzenlos', text: 'Die erste Lieferung ins Ausland.', check: (_s, p) => p.counts.international >= 1 },
  { id: 'countries_10', group: 'Touren', title: 'Europareise', text: 'Lieferungen in zehn verschiedene Länder.', check: (_s, p) => p.countries.length >= 10, progress: (_s, p) => count(p.countries.length, 10)() },
  { id: 'streak_25', group: 'Touren', title: 'Auf die Minute', text: '25 pünktliche Lieferungen in Folge.', check: (_s, p) => p.records.bestStreak >= 25, progress: (_s, p) => count(p.records.onTimeStreak, 25)() },
  { id: 'streak_100', group: 'Touren', title: 'Uhrwerk', text: '100 pünktliche Lieferungen in Folge.', check: (_s, p) => p.records.bestStreak >= 100, progress: (_s, p) => count(p.records.onTimeStreak, 100)() },
  { id: 'reefer_50', group: 'Touren', title: 'Kühlkette', text: '50 Kühltransporte zugestellt.', check: (_s, p) => p.counts.reefer >= 50, progress: (_s, p) => count(p.counts.reefer, 50)() },
  { id: 'heavy', group: 'Spezial', title: 'Schwergewicht', text: 'Den ersten Schwertransport zugestellt.', check: (_s, p) => p.counts.heavy >= 1 },
  { id: 'fair', group: 'Spezial', title: 'Messeprofi', text: 'Einen Messe-Termin pünktlich beliefert.', check: (_s, p) => p.counts.fair >= 1 },
  { id: 'premium_10', group: 'Spezial', title: 'Premiumpartner', text: '10 Premium-Aufträge pünktlich erledigt.', check: (_s, p) => p.counts.premium >= 10, progress: (_s, p) => count(p.counts.premium, 10)() },
  { id: 'tender', group: 'Spezial', title: 'Zuschlag!', text: 'Die erste Ausschreibung gewonnen.', check: (_s, p) => p.counts.tendersWon >= 1 },
  { id: 'quarter', group: 'Spezial', title: 'Musterschüler', text: 'Alle Quartalsziele der Bank erreicht.', check: (s) => (s.quarterHistory ?? []).some((q) => q.met === q.of) },
  { id: 'rating_a', group: 'Spezial', title: 'Bonität A', text: 'Die beste Einstufung bei der Hausbank.', check: (s) => (s.company.rating ?? 2) <= 0 },
  { id: 'scenario', group: 'Spezial', title: 'Mission erfüllt', text: 'Das Ziel eines Szenarios erreicht.', check: (s) => s.scenario?.status === 'won' },
  { id: 'fleet_5', group: 'Firma', title: 'Kleine Flotte', text: 'Fünf Fahrzeuge im Fuhrpark.', check: (s) => vehicles(s) >= 5, progress: (s) => count(vehicles(s), 5)() },
  { id: 'fleet_10', group: 'Firma', title: 'Mittelstand', text: 'Zehn Fahrzeuge im Fuhrpark.', check: (s) => vehicles(s) >= 10, progress: (s) => count(vehicles(s), 10)() },
  { id: 'fleet_25', group: 'Firma', title: 'Großflotte', text: '25 Fahrzeuge im Fuhrpark.', check: (s) => vehicles(s) >= 25, progress: (s) => count(vehicles(s), 25)() },
  { id: 'branch', group: 'Firma', title: 'Zweites Standbein', text: 'Die erste Niederlassung eröffnet.', check: (s) => s.company.locations.length >= 2 },
  { id: 'level_3', group: 'Firma', title: 'Aufsteiger', text: 'Unternehmensstufe 3 erreicht.', check: (s) => s.company.level >= 3, progress: (s) => count(s.company.level, 3)() },
  { id: 'level_5', group: 'Firma', title: 'Branchengröße', text: 'Unternehmensstufe 5 erreicht.', check: (s) => s.company.level >= 5, progress: (s) => count(s.company.level, 5)() },
  { id: 'reputation_80', group: 'Firma', title: 'Erste Adresse', text: 'Ansehen von 80 erreicht.', check: (s) => s.company.reputation >= 80, progress: (s) => count(Math.floor(s.company.reputation), 80)() },
  { id: 'revenue_1m', group: 'Firma', title: 'Umsatzmillionär', text: '1 Mio. € Umsatz seit der Gründung.', check: (s) => s.company.totals.revenue >= 1_000_000_00 },
  { id: 'revenue_10m', group: 'Firma', title: 'Zehn Millionen', text: '10 Mio. € Umsatz seit der Gründung.', check: (s) => s.company.totals.revenue >= 10_000_000_00 },
  { id: 'balance_1m', group: 'Firma', title: 'Dickes Polster', text: '1 Mio. € auf dem Geschäftskonto.', check: (s) => s.company.account.balance >= 1_000_000_00 },
];

export const ACHIEVEMENT_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

/** Prüft alle noch offenen Erfolge und meldet neue. */
export function checkAchievements(state: GameState): string[] {
  const p = (state.progress ??= defaultProgress());
  const fresh: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (p.achievements[a.id] !== undefined || !a.check(state, p)) continue;
    p.achievements[a.id] = state.time;
    fresh.push(a.id);
    addLog(state, { level: 'success', category: 'company', text: `Erfolg freigeschaltet: „${a.title}“ – ${a.text}` });
  }
  return fresh;
}

/** Nach jeder Zustellung: Zähler und Rekorde fortschreiben. */
export function onDelivery(state: GameState, order: Order, lateMin: number): void {
  const p = (state.progress ??= defaultProgress());
  const r = p.records;
  const onTime = lateMin <= 0;
  r.onTimeStreak = onTime ? r.onTimeStreak + 1 : 0;
  r.bestStreak = Math.max(r.bestStreak, r.onTimeStreak);
  if (order.distanceKm > r.longestKm) r.longestKm = Math.round(order.distanceKm);
  if (order.payment > r.bestPayment) r.bestPayment = order.payment;
  if (order.international) p.counts.international++;
  if (CARGO_BY_ID[order.cargoId]?.trailer === 'reefer') p.counts.reefer++;
  if (order.premium?.kind === 'heavy') p.counts.heavy++;
  if (order.premium && onTime) {
    p.counts.premium++;
    if (order.premium.kind === 'fair') p.counts.fair++;
  }
  const country = CITY_BY_ID[order.toCityId]?.country;
  if (country && !p.countries.includes(country)) p.countries.push(country);
  checkAchievements(state);
}

/** Täglich: Bestwerte für Fuhrpark und Kontostand, Monatsbilanz am Monatsersten. */
export function dailyProgress(state: GameState): void {
  const p = (state.progress ??= defaultProgress());
  const r = p.records;
  r.maxVehicles = Math.max(r.maxVehicles, Object.keys(state.vehicles).length);
  r.maxBalance = Math.max(r.maxBalance, state.company.account.balance);
  if (toDate(state.time).getUTCDate() === 1) {
    // Ergebnis des abgelaufenen Monats aus der Tagesstatistik
    const days = toDate(state.time - MIN_PER_DAY).getUTCDate();
    const from = dayIndex(state.time) - days;
    const month = state.stats.filter((d) => d.day >= from);
    if (month.length >= days - 1) {
      const result = month.reduce((sum, d) => sum + d.revenue - d.costs, 0);
      if (result > r.bestMonth) r.bestMonth = result;
    }
  }
  // kleine Geschichten: Betriebsjubiläen
  for (const d of Object.values(state.drivers)) {
    const days = Math.floor((state.time - d.hired) / MIN_PER_DAY);
    if (days <= 0 || days % 365 !== 0) continue;
    const years = days / 365;
    d.satisfaction = Math.min(100, d.satisfaction + 3);
    addLog(state, { level: 'success', category: 'personnel', text: `${d.name} ist seit ${years === 1 ? 'einem Jahr' : `${years} Jahren`} in der Firma – die Kollegen gratulieren.`, ref: { kind: 'driver', id: d.id } });
  }
  checkAchievements(state);
}
