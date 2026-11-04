// Quartalsziele der Hausbank: Alle 13 Wochen stellt die Bank drei Ziele, passend zur Größe der Firma.
// Das Ergebnis verändert die Bonität (A … E): bessere Bonität heißt günstigere Kredite und ein höherer
// Kreditrahmen, schlechtere das Gegenteil. Dazu gibt es etwas Ansehen – oder Ärger.

import { addLog, formatMoney } from './finance.ts';
import { rand } from './rng.ts';
import { MIN_PER_DAY, formatDate } from './time.ts';
import type { GameState, QuarterGoal, QuarterState } from './types.ts';

export const QUARTER_DAYS = 91;
export const RATING_LABEL = ['A', 'B', 'C', 'D', 'E'];
export const DEFAULT_RATING = 2;
/** Umsatz je Fahrzeug und Tag als Grundlage der Umsatzziele (vorsichtig, gilt auch für Einsteiger) */
const REVENUE_PER_VEHICLE_DAY = 420_00;
const DELIVERIES_PER_VEHICLE_DAY = 0.28;

export const rating = (state: GameState) => state.company.rating ?? DEFAULT_RATING;
export const ratingLabel = (state: GameState) => RATING_LABEL[rating(state)];
/** Zinsauf- oder -abschlag durch die Bonität (A −1 %, E +1 %) */
export const ratingRateDelta = (state: GameState) => (rating(state) - DEFAULT_RATING) * 0.005;
/** Faktor auf den Kreditrahmen (A +20 %, E −20 %) */
export const ratingLimitFactor = (state: GameState) => 1 + (DEFAULT_RATING - rating(state)) * 0.1;

export const GOAL_LABEL: Record<QuarterGoal['kind'], string> = {
  revenue: 'Umsatz im Quartal',
  deliveries: 'Lieferungen im Quartal',
  ontime: 'Pünktlichkeit im Quartal',
  empty: 'Leerkilometer-Anteil höchstens',
  reputation: 'Ansehen am Quartalsende',
  fleet: 'Fahrzeuge am Quartalsende',
  balance: 'Kontostand am Quartalsende',
};

const vehicleCount = (s: GameState) => Object.keys(s.vehicles).length;
const round = (v: number, step: number) => Math.round(v / step) * step;

/** Umsatz der letzten `days` Tage aus der Tagesstatistik */
function recentRevenue(state: GameState, days: number): number | null {
  const st = state.stats.slice(-days);
  if (st.length < days) return null;
  return st.reduce((s, d) => s + d.revenue, 0);
}

function makeGoals(state: GameState): QuarterGoal[] {
  const t = state.company.totals;
  const n = Math.max(1, vehicleCount(state));
  const recent = recentRevenue(state, 60);
  const revenue = Math.max(n * REVENUE_PER_VEHICLE_DAY * QUARTER_DAYS * 0.85, recent !== null ? (recent / 60) * QUARTER_DAYS * 1.05 : 0);
  const goals: QuarterGoal[] = [{ kind: 'revenue', target: round(revenue, 1000_00), base: t.revenue }];
  const pool: QuarterGoal[] = [
    { kind: 'deliveries', target: Math.max(10, Math.round(n * DELIVERIES_PER_VEHICLE_DAY * QUARTER_DAYS * 0.85)), base: t.deliveries },
    { kind: 'ontime', target: 90, base: t.deliveries, base2: t.lateDeliveries },
    { kind: 'empty', target: 25, base: t.kmEmpty, base2: t.kmLoaded },
    { kind: 'reputation', target: Math.min(95, Math.round(state.company.reputation) + 5), base: state.company.reputation },
    { kind: 'balance', target: round(Math.max(10_000_00, state.company.account.balance + Math.max(3_000_00, state.company.account.balance * 0.05)), 1000_00), base: state.company.account.balance },
  ];
  if (state.company.account.balance > 50_000_00) pool.push({ kind: 'fleet', target: n + 1, base: n });
  for (let i = 0; i < 2; i++) goals.push(pool.splice(rand.int(state, 0, pool.length - 1), 1)[0]);
  return goals;
}

export function startQuarter(state: GameState): QuarterState {
  const index = (state.quarter?.index ?? 0) + 1;
  state.quarter = { index, start: state.time, end: state.time + QUARTER_DAYS * MIN_PER_DAY, goals: makeGoals(state) };
  return state.quarter;
}

export interface GoalProgress {
  label: string;
  /** Anzeige von Stand und Ziel */
  value: string;
  target: string;
  /** 0–1 für den Balken */
  share: number;
  met: boolean;
}

const money = (v: number) => formatMoney(v);

export function goalProgress(state: GameState, g: QuarterGoal): GoalProgress {
  const t = state.company.totals;
  const label = GOAL_LABEL[g.kind];
  switch (g.kind) {
    case 'revenue': {
      const v = t.revenue - g.base;
      return { label, value: money(v), target: money(g.target), share: v / g.target, met: v >= g.target };
    }
    case 'deliveries': {
      const v = t.deliveries - g.base;
      return { label, value: String(v), target: String(g.target), share: v / g.target, met: v >= g.target };
    }
    case 'ontime': {
      const n = t.deliveries - g.base;
      const late = t.lateDeliveries - (g.base2 ?? 0);
      const pct = n ? Math.round(((n - late) / n) * 100) : 0;
      // erst ab fünf Lieferungen aussagekräftig
      return { label, value: n ? `${pct} % (${n} Lieferungen)` : 'noch keine Lieferung', target: `${g.target} %`, share: n >= 5 ? pct / g.target : 0, met: n >= 5 && pct >= g.target };
    }
    case 'empty': {
      const empty = t.kmEmpty - g.base;
      const loaded = t.kmLoaded - (g.base2 ?? 0);
      const total = empty + loaded;
      const pct = total ? Math.round((empty / total) * 100) : 0;
      return { label, value: total ? `${pct} %` : 'noch keine Fahrt', target: `${g.target} %`, share: total > 0 ? Math.min(1, g.target / Math.max(1, pct)) : 0, met: total >= 500 && pct <= g.target };
    }
    case 'reputation': {
      const v = Math.round(state.company.reputation);
      return { label, value: String(v), target: String(g.target), share: v / g.target, met: v >= g.target };
    }
    case 'fleet': {
      const v = vehicleCount(state);
      return { label, value: String(v), target: String(g.target), share: v / g.target, met: v >= g.target };
    }
    case 'balance': {
      const v = state.company.account.balance;
      return { label, value: money(v), target: money(g.target), share: Math.max(0, v) / g.target, met: v >= g.target };
    }
  }
}

function finishQuarter(state: GameState, q: QuarterState) {
  const results = q.goals.map((g) => goalProgress(state, g));
  const met = results.filter((r) => r.met).length;
  const of = results.length;
  const before = rating(state);
  let after = before;
  const c = state.company;
  if (met === of) {
    after = Math.max(0, before - 1);
    c.reputation = Math.min(100, c.reputation + 3);
  } else if (met === of - 1) c.reputation = Math.min(100, c.reputation + 1);
  else {
    after = Math.min(RATING_LABEL.length - 1, before + 1);
    c.reputation = Math.max(0, c.reputation - 2);
  }
  c.rating = after;
  state.progress.counts.quartersMet += met === of ? 1 : 0;
  state.quarterHistory ??= [];
  state.quarterHistory.push({ index: q.index, end: state.time, met, of, rating: after });
  if (state.quarterHistory.length > 12) state.quarterHistory.shift();
  const change = after < before ? `Bonität steigt auf ${RATING_LABEL[after]} – Kredite werden günstiger.` : after > before ? `Bonität sinkt auf ${RATING_LABEL[after]} – Kredite werden teurer.` : `Bonität bleibt bei ${RATING_LABEL[after]}.`;
  addLog(state, {
    level: met === of ? 'success' : met === of - 1 ? 'info' : 'warning',
    category: 'finance',
    text: `Quartalsgespräch mit der Hausbank: ${met} von ${of} Zielen erreicht. ${change}`,
  });
}

/** Täglich: Quartal auswerten und das nächste beginnen. */
export function dailyGoals(state: GameState): void {
  const q = state.quarter;
  if (!q) {
    startQuarter(state);
    return;
  }
  if (state.time < q.end) return;
  finishQuarter(state, q);
  const next = startQuarter(state);
  addLog(state, { level: 'info', category: 'finance', text: `Neue Quartalsziele der Hausbank bis ${formatDate(next.end)}: ${next.goals.map((g) => GOAL_LABEL[g.kind]).join(', ')}.` });
}
