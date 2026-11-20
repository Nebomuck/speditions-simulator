// Tankstrategie: Dieselpreis je Land (Faktor zum Marktpreis), Tankstrategie der Firma und Tankkarten.
// Die Faktoren orientieren sich grob an den üblichen Unterschieden im europäischen Dieselpreis (netto).

import type { GameState, Money, Vehicle } from './types.ts';
import { addLog, formatMoney } from './finance.ts';

/** Dieselpreis je Land relativ zum Marktpreis (Deutschland = 1) */
export const COUNTRY_DIESEL: Record<string, number> = {
  DE: 1.0, AT: 0.96, CH: 1.12, FR: 1.02, IT: 1.06, ES: 0.95, PT: 1.01, NL: 1.05, BE: 1.0, LU: 0.88, GB: 1.1,
  PL: 0.93, CZ: 0.94, SK: 0.97, HU: 0.95, SI: 0.95, HR: 0.96, RS: 1.0, BA: 0.92, MK: 0.9, RO: 0.97, BG: 0.9,
  GR: 1.03, DK: 1.04, SE: 1.08, NO: 1.12, LT: 0.94, LV: 0.96, EE: 0.98, FI: 1.05, ME: 0.95, AL: 1.02,
};
export const countryDieselFactor = (country: string) => COUNTRY_DIESEL[country] ?? 1;

export type FuelPolicy = 'reserve' | 'cheap';
export const FUEL_POLICY_LABEL: Record<FuelPolicy, string> = { reserve: 'Erst bei Reserve tanken', cheap: 'Günstig tanken (in billigen Ländern nachfüllen)' };
/** „Günstig tanken“: in Ländern bis zu diesem Faktor nachfüllen, sobald der Tank unter … ist */
export const CHEAP_COUNTRY_MAX = 0.95;
export const CHEAP_TOPUP_BELOW = 0.65;

export type FuelCard = 'none' | 'basic' | 'premium';
export const FUEL_CARDS: Record<FuelCard, { name: string; discount: number; monthlyPerVehicle: Money; text: string }> = {
  none: { name: 'Keine Tankkarte', discount: 0, monthlyPerVehicle: 0, text: 'Bezahlt wird an der Säule zum Tagespreis.' },
  basic: { name: 'Tankkarte Basis', discount: 0.02, monthlyPerVehicle: 25_00, text: '2 % Rabatt an Partnertankstellen in ganz Europa.' },
  premium: { name: 'Tankkarte Premium', discount: 0.04, monthlyPerVehicle: 60_00, text: '4 % Rabatt, lohnt sich ab etwa 1.500 l je Fahrzeug und Monat.' },
};

export const fuelPolicy = (state: GameState): FuelPolicy => state.company.fuelPolicy ?? 'reserve';
export const fuelCard = (state: GameState): FuelCard => state.company.fuelCard ?? 'none';
/** Rabattfaktor der Tankkarte (1 = kein Rabatt) */
export const fuelCardFactor = (state: GameState) => 1 - FUEL_CARDS[fuelCard(state)].discount;

/** Preis je Liter (Cent) in einem Land, mit Tankkarte */
export const dieselPriceIn = (state: GameState, country: string) => state.market.diesel * countryDieselFactor(country) * fuelCardFactor(state);

/** Soll der LKW hier tanken? Reserve immer; bei „Günstig tanken“ auch im billigen Land ab 65 % */
export function shouldRefuel(state: GameState, v: Vehicle, tankL: number, reserve: number, country: string): boolean {
  if (v.fuelL < tankL * reserve) return true;
  return fuelPolicy(state) === 'cheap' && countryDieselFactor(country) <= CHEAP_COUNTRY_MAX && v.fuelL < tankL * CHEAP_TOPUP_BELOW;
}

export function setFuelPolicy(state: GameState, policy: FuelPolicy): { ok: true } | { ok: false; error: string } {
  if (!(policy in FUEL_POLICY_LABEL)) return { ok: false, error: 'Unbekannte Tankstrategie.' };
  state.company.fuelPolicy = policy;
  addLog(state, { level: 'info', category: 'fleet', text: `Tankstrategie: ${FUEL_POLICY_LABEL[policy]}.` });
  return { ok: true };
}

export function setFuelCard(state: GameState, card: FuelCard): { ok: true } | { ok: false; error: string } {
  if (!(card in FUEL_CARDS)) return { ok: false, error: 'Unbekannte Tankkarte.' };
  state.company.fuelCard = card;
  const c = FUEL_CARDS[card];
  addLog(state, { level: 'info', category: 'finance', text: card === 'none' ? 'Tankkarte gekündigt.' : `${c.name} abgeschlossen: ${Math.round(c.discount * 100)} % Rabatt, ${formatMoney(c.monthlyPerVehicle)} je Fahrzeug und Monat.` });
  return { ok: true };
}

/** Monatliche Kartengebühr */
export const fuelCardMonthly = (state: GameState): Money => FUEL_CARDS[fuelCard(state)].monthlyPerVehicle * Object.keys(state.vehicles).length;

