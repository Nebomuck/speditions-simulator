// Fahrereigenschaften: kleine, spürbare Eigenheiten. Etwa zwei von drei Bewerbern bringen eine mit.
// Die Wirkungen sind bewusst klein, damit keine Eigenschaft Pflicht oder K.-o.-Kriterium wird.

import { rand } from './rng.ts';
import type { Driver, DriverTrait, GameState } from './types.ts';

export interface TraitDef {
  id: DriverTrait;
  name: string;
  /** Wirkung in einem Satz */
  effect: string;
  /** gut, gemischt */
  tone: 'good' | 'mixed';
}

export const TRAITS: Record<DriverTrait, TraitDef> = {
  frugal: { id: 'frugal', name: 'Sparfuchs', effect: 'Fährt vorausschauend: etwa 4 % weniger Diesel.', tone: 'good' },
  punctual: { id: 'punctual', name: 'Pünktlich', effect: 'Kunden schätzen die Verlässlichkeit: bei pünktlicher Lieferung zusätzlich Zufriedenheit +2.', tone: 'good' },
  leadfoot: { id: 'leadfoot', name: 'Bleifuß', effect: 'Etwa 4 % schneller unterwegs, aber höheres Unfallrisiko, mehr Verschleiß und hin und wieder ein Blitzerfoto.', tone: 'mixed' },
  cheerful: { id: 'cheerful', name: 'Frohnatur', effect: 'Gute Laune ist ansteckend: Zufriedenheit liegt dauerhaft 8 Punkte höher.', tone: 'good' },
  tough: { id: 'tough', name: 'Eiserne Gesundheit', effect: 'Wird nur selten krank (etwa ein Drittel so oft).', tone: 'good' },
  talker: { id: 'talker', name: 'Plaudertasche', effect: 'Kunden mögen das Gespräch (Zufriedenheit +1), aber Be- und Entladen dauern etwas länger.', tone: 'mixed' },
};

export const TRAIT_IDS = Object.keys(TRAITS) as DriverTrait[];

/** Anteil der Bewerber mit Eigenschaft */
export const TRAIT_SHARE = 0.65;

export function rollTrait(state: GameState): DriverTrait | undefined {
  return rand.chance(state, TRAIT_SHARE) ? rand.pick(state, TRAIT_IDS) : undefined;
}

const has = (d: Pick<Driver, 'trait'> | undefined, t: DriverTrait) => d?.trait === t;

/** Sparsamkeit für den Verbrauch (Sparfuchs fährt wie mit +25 Punkten) */
export function effectiveEco(d: Pick<Driver, 'ecoDriving' | 'trait'>): number {
  return has(d, 'frugal') ? Math.min(100, d.ecoDriving + 25) : d.ecoDriving;
}

/** Fahrtempo */
export function traitSpeed(d: Pick<Driver, 'trait'> | undefined): number {
  return has(d, 'leadfoot') ? 1.04 : 1;
}

/** Unfallrisiko */
export function traitAccident(d: Pick<Driver, 'trait'> | undefined): number {
  return has(d, 'leadfoot') ? 1.6 : 1;
}

/** Verschleiß */
export function traitWear(d: Pick<Driver, 'trait'> | undefined): number {
  return has(d, 'leadfoot') ? 1.1 : 1;
}

/** Krankheitsrisiko */
export function traitSickness(d: Pick<Driver, 'trait'> | undefined): number {
  return has(d, 'tough') ? 0.35 : 1;
}

/** Aufschlag auf Be-/Entladezeit in Minuten */
export function traitHandlingMin(d: Pick<Driver, 'trait'> | undefined): number {
  return has(d, 'talker') ? 15 : 0;
}

/** zusätzliche Kundenzufriedenheit bei einer Lieferung */
export function traitCustomerBonus(d: Pick<Driver, 'trait'> | undefined, onTime: boolean): number {
  if (has(d, 'talker')) return 1;
  if (has(d, 'punctual') && onTime) return 2;
  return 0;
}

/** Zielzufriedenheit */
export function traitSatisfaction(d: Pick<Driver, 'trait'> | undefined): number {
  return has(d, 'cheerful') ? 8 : 0;
}
