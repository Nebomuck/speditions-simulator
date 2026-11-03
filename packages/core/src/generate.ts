// Prozedurale Erzeugung: Fahrer/Bewerber, Kunden, Gebrauchtfahrzeugangebote, Kennzeichen.

import { CITIES, CITY_BY_ID, type CityDef, type Industry } from './data/cities.ts';
import { TRUCK_MODELS, TRUCK_BY_ID } from './data/catalog.ts';
import { COMPANY_CORE, COMPANY_PREFIX, FIRST_NAMES, LAST_NAMES, LEGAL_FORM } from './data/names.ts';
import { haversineKm } from './geo.ts';
import { rand, newId } from './rng.ts';
import { MIN_PER_DAY, toDate } from './time.ts';
import type { Applicant, Customer, CustomerSize, GameState, Money, Qualification, VehicleOffer } from './types.ts';

export function personName(state: GameState, country: string): string {
  const key = FIRST_NAMES[country] ? country : 'XX';
  return `${rand.pick(state, FIRST_NAMES[key])} ${rand.pick(state, LAST_NAMES[key])}`;
}

const PLATE_LETTERS = 'ABCDEFGHJKLMNPRSTUVWXYZ';
export function plate(state: GameState, cityId: string): string {
  const city = CITY_BY_ID[cityId];
  const prefix = city.name.replace(/[^A-Za-zÄÖÜäöü]/g, '').slice(0, city.country === 'DE' ? 2 : 1).toUpperCase();
  const l = () => PLATE_LETTERS[rand.int(state, 0, PLATE_LETTERS.length - 1)];
  return `${prefix}-${l()}${l()} ${rand.int(state, 100, 9999)}`;
}

export function citiesNear(cityId: string, maxKm: number): CityDef[] {
  const c = CITY_BY_ID[cityId];
  return CITIES.filter((x) => haversineKm([c.lon, c.lat], [x.lon, x.lat]) <= maxKm);
}

/** Lohnniveau eines Landes relativ zu Deutschland. */
export function wageLevel(country: string): number {
  return ['DE', 'AT', 'CH', 'NL', 'BE', 'LU', 'DK', 'SE', 'NO', 'FI', 'FR', 'GB'].includes(country) ? 1 : 0.88;
}

/** Bewerber für den Fahrerberuf, Wohnort in der Nähe eines Firmenstandorts. */
export function makeApplicant(state: GameState, nearCityId: string): Applicant {
  const near = citiesNear(nearCityId, 350);
  const home = rand.weighted(state, near, (c) => Math.sqrt(c.pop)) ?? CITY_BY_ID[nearCityId];
  const experience = Math.round(Math.max(2, Math.min(98, rand.normal(state, 42, 22))));
  const quals: Qualification[] = [];
  if (rand.chance(state, 0.15 + experience / 250)) quals.push('ADR');
  if (rand.chance(state, 0.05 + experience / 400)) quals.push('heavy');
  if (rand.chance(state, 0.2 + experience / 300)) quals.push('reefer');
  const age = Math.round(Math.max(21, Math.min(63, 22 + experience * 0.35 + rand.float(state, 0, 14))));
  // Gehaltsvorstellung: abhängig von Erfahrung, Qualifikationen und Lohnniveau des Herkunftslandes
  const salary: Money = Math.round((2_850_00 + experience * 16_00 + quals.length * 140_00) * wageLevel(home.country) * rand.float(state, 0.93, 1.1) / 1000) * 1000;
  return {
    id: newId(state, 'app'),
    name: personName(state, home.country),
    age,
    homeCityId: home.id,
    cityId: nearCityId,
    experience,
    licenses: ['C', 'CE'],
    qualifications: quals,
    salary,
    reliability: Math.round(Math.max(10, Math.min(99, rand.normal(state, 55 + experience * 0.3, 15)))),
    ecoDriving: Math.round(Math.max(5, Math.min(99, rand.normal(state, 40 + experience * 0.4, 15)))),
    stressResistance: Math.round(Math.max(5, Math.min(99, rand.normal(state, 50, 18)))),
    expires: state.time + rand.int(state, 3, 10) * MIN_PER_DAY,
  };
}

export function makeVehicleOffer(state: GameState, cityId: string): VehicleOffer {
  const model = rand.weighted(state, TRUCK_MODELS, (m) => (m.price < 100_000_00 ? 2 : 1))!;
  const year = toDate(state.time).getUTCFullYear() - rand.int(state, 2, 9);
  const age = toDate(state.time).getUTCFullYear() - year;
  const odometerKm = Math.round(age * rand.float(state, 90_000, 135_000) / 1000) * 1000;
  const condition = Math.round(Math.max(35, Math.min(92, 95 - age * 5 - rand.float(state, 0, 15))));
  return {
    id: newId(state, 'off'),
    modelId: model.id,
    year,
    odometerKm,
    condition,
    price: usedValue(model.price, age, odometerKm, condition, rand.float(state, 0.92, 1.08)),
    cityId,
    expires: state.time + rand.int(state, 4, 14) * MIN_PER_DAY,
  };
}

/** Marktwert eines Fahrzeugs: Wertverlust nach Alter, Laufleistung und Zustand. */
export function usedValue(newPrice: Money, ageYears: number, km: number, condition: number, noise = 1): Money {
  const ageFactor = Math.pow(0.86, Math.max(0, ageYears));
  const kmFactor = Math.max(0.35, 1 - km / 1_600_000);
  const condFactor = 0.55 + 0.45 * (condition / 100);
  return Math.round((newPrice * ageFactor * kmFactor * condFactor * noise) / 100_00) * 100_00;
}

export function vehicleMarketValue(state: GameState, vehicleId: string): Money {
  const v = state.vehicles[vehicleId];
  const m = TRUCK_BY_ID[v.modelId];
  const age = toDate(state.time).getUTCFullYear() - v.year;
  return usedValue(m.price, age, v.odometerKm, v.condition);
}

/** Inzahlungnahme beim Händler: etwas besser als ein Privatverkauf (90 %). */
export function tradeInValue(state: GameState, vehicleId: string): Money {
  return Math.round(vehicleMarketValue(state, vehicleId) * 0.95);
}

const SIZE_WEIGHTS: Record<CustomerSize, number> = { small: 3, medium: 2, large: 1 };

/** Kunde einer Branche in einer Stadt finden oder neu anlegen (Kunden sind persistent). */
export function customerFor(state: GameState, cityId: string, industry: Industry): Customer {
  const existing = Object.values(state.customers).filter((c) => c.cityId === cityId && c.industry === industry);
  const city = CITY_BY_ID[cityId];
  const maxCustomers = city.pop > 1500 ? 3 : city.pop > 400 ? 2 : 1;
  if (existing.length >= maxCustomers || (existing.length > 0 && rand.chance(state, 0.7))) {
    return rand.weighted(state, existing, (c) => SIZE_WEIGHTS[c.size] + c.satisfaction / 50)!;
  }
  const size = rand.weighted(state, ['small', 'medium', 'large'] as CustomerSize[], (s) => SIZE_WEIGHTS[s])!;
  const core = rand.pick(state, COMPANY_CORE[industry] ?? ['Handel']);
  const name = `${rand.pick(state, COMPANY_PREFIX)}${rand.chance(state, 0.5) ? '-' : ' '}${core} ${LEGAL_FORM[city.country] ?? 'Ltd'}`;
  const reliabilityBase = size === 'large' ? 0.9 : size === 'medium' ? 0.82 : 0.72;
  const c: Customer = {
    id: newId(state, 'cus'),
    name,
    cityId,
    industry,
    size,
    paymentReliability: Math.max(0.3, Math.min(0.99, rand.normal(state, reliabilityBase, 0.08) / Math.sqrt(state.difficulty.paymentRiskFactor))),
    paymentTermDays: rand.pick(state, size === 'large' ? [30, 45, 60] : [14, 21, 30]),
    satisfaction: 50,
    priceSensitivity: rand.float(state, 0.2, 0.9),
    deliveries: 0,
  };
  state.customers[c.id] = c;
  return c;
}
