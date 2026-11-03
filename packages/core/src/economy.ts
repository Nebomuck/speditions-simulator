// Dynamische Wirtschaft: Konjunktur (normal, Aufschwung, Krise) und regionale Nachfrage je Land.
// Beides wirkt auf das Auftragsvolumen und die Frachtraten. Regionale Ereignisse (Messe, Erntesaison,
// Streik, Werksschließung …) setzen ein Ziel, dem sich die Nachfrage über Tage annähert.

import { COUNTRY_NAMES } from './data/catalog.ts';
import { addLog } from './finance.ts';
import { rand } from './rng.ts';
import { MIN_PER_DAY, formatDate, month } from './time.ts';
import type { Economy, EconomyPhase, GameState, GameTime, RegionalMarket } from './types.ts';
import { COUNTRIES } from './world.ts';

export const PHASE_LABEL: Record<EconomyPhase, string> = { normal: 'Normale Lage', boom: 'Aufschwung', crisis: 'Wirtschaftskrise' };
const PHASE_TARGET: Record<EconomyPhase, number> = { normal: 1, boom: 1.14, crisis: 0.82 };
/** frühestens so lange nach dem letzten Wechsel beginnt eine neue Phase */
const PHASE_GAP_DAYS = 120;

/** saisonale Grundnachfrage je Monat */
export const SEASONAL_DEMAND = [0.92, 0.94, 1.0, 1.02, 1.03, 1.02, 0.97, 0.95, 1.03, 1.06, 1.08, 1.0];

export function defaultEconomy(t: GameTime): Economy {
  return { cycle: 1, phase: 'normal', phaseUntil: 0, lastPhaseChange: t, regions: {} };
}

const clampN = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Nachfragefaktor eines Landes (1 = normal) */
export function regionFactor(state: GameState, country: string): number {
  return state.economy?.regions[country]?.factor ?? 1;
}

/** Regionale Nachfrage für einige Tage anheben oder senken (Ereignisse). */
export function setRegionalTrend(state: GameState, country: string, target: number, days: number, reason: string): RegionalMarket {
  const r = (state.economy.regions[country] ??= { factor: 1, target: 1 });
  r.target = target;
  r.reason = reason;
  r.until = state.time + days * MIN_PER_DAY;
  return r;
}

/** Konjunkturphase wechseln (auch von Ereignissen genutzt) */
export function startPhase(state: GameState, phase: EconomyPhase, days: number) {
  const e = state.economy;
  e.phase = phase;
  e.phaseUntil = phase === 'normal' ? 0 : state.time + days * MIN_PER_DAY;
  e.lastPhaseChange = state.time;
  if (phase === 'crisis')
    addLog(state, { level: 'danger', category: 'market', text: `Wirtschaftskrise: Die Transportnachfrage in Europa bricht ein, Zahlungen kommen schleppender. Voraussichtlich bis ${formatDate(e.phaseUntil)}.` });
  else if (phase === 'boom')
    addLog(state, { level: 'success', category: 'market', text: `Konjunktur im Aufschwung: mehr Aufträge und bessere Frachtraten, voraussichtlich bis ${formatDate(e.phaseUntil)}.` });
  else addLog(state, { level: 'info', category: 'market', text: 'Die Konjunktur hat sich normalisiert.' });
}

/** Täglich: Konjunktur und regionale Nachfrage fortschreiben, Marktnachfrage daraus ableiten. */
export function dailyEconomy(state: GameState): void {
  state.economy ??= defaultEconomy(state.time);
  const e = state.economy;
  const ef = state.difficulty.eventFactor;
  if (e.phase !== 'normal' && state.time >= e.phaseUntil) startPhase(state, 'normal', 0);
  else if (e.phase === 'normal' && state.time - e.lastPhaseChange > PHASE_GAP_DAYS * MIN_PER_DAY) {
    if (rand.chance(state, 0.003 * ef)) startPhase(state, 'crisis', rand.int(state, 45, 100));
    else if (rand.chance(state, 0.004)) startPhase(state, 'boom', rand.int(state, 40, 90));
  }
  e.cycle = clampN(e.cycle + (PHASE_TARGET[e.phase] - e.cycle) * 0.06 + rand.normal(state, 0, 0.004), 0.75, 1.25);

  for (const c of COUNTRIES) {
    const r = (e.regions[c] ??= { factor: 1, target: 1 });
    if (r.until !== undefined && state.time >= r.until) {
      r.target = 1;
      delete r.until;
      delete r.reason;
    }
    r.factor = Math.round(clampN(r.factor + (r.target - r.factor) * 0.12 + rand.normal(state, 0, 0.008), 0.6, 1.5) * 1000) / 1000;
  }

  // Marktnachfrage = Saison × Konjunktur (mit Trägheit)
  const m = state.market;
  const target = SEASONAL_DEMAND[month(state.time)] * e.cycle;
  m.demand = clampN(m.demand + (target - m.demand) * 0.1 + rand.normal(state, 0, 0.01), 0.6, 1.4);
}

/** Zahlungsmoral der Kunden in der Krise schlechter */
export const crisisPaymentFactor = (state: GameState) => (state.economy?.phase === 'crisis' ? 0.85 : 1);

export function regionLabel(state: GameState, country: string): string {
  const r = state.economy?.regions[country];
  return `${COUNTRY_NAMES[country] ?? country}${r?.reason ? ` (${r.reason})` : ''}`;
}
