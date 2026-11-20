// Alternative Antriebe: Diesel, LNG und Elektro. Energiepreis und Einheit je Antrieb, CO₂-Klasse für die Maut,
// Ladestopps für E-LKW und der Ladepark als Einrichtung am Standort.

import { TRUCK_BY_ID, type TruckModel } from './data/catalog.ts';
import { countryDieselFactor, fuelCardFactor } from './fuel.ts';
import type { GameState, Vehicle } from './types.ts';

export type Drive = 'diesel' | 'lng' | 'electric';
export const DRIVE_LABEL: Record<Drive, string> = { diesel: 'Diesel', lng: 'LNG (Flüssigerdgas)', electric: 'Elektro' };
/** Einheit von Tank/Akku und Verbrauch */
export const DRIVE_UNIT: Record<Drive, string> = { diesel: 'l', lng: 'kg', electric: 'kWh' };

export const driveOf = (modelId: string): Drive => TRUCK_BY_ID[modelId]?.drive ?? 'diesel';
export const energyUnit = (modelId: string) => DRIVE_UNIT[driveOf(modelId)];
export const isLowEmission = (modelId: string) => driveOf(modelId) !== 'diesel';

/**
 * CO₂-Klasse wie bei der europäischen Lkw-Maut: 1 = Euro V Diesel, 2 = Euro VI Diesel, 4 = LNG (emissionsarm),
 * 5 = Elektro (emissionsfrei). Der Mautfaktor gilt auf den Kilometersatz.
 */
export function co2Class(m: TruckModel | undefined): 1 | 2 | 4 | 5 {
  if (!m) return 2;
  if (m.drive === 'electric') return 5;
  if (m.drive === 'lng') return 4;
  return m.emission === 'Euro V' ? 1 : 2;
}
export const CO2_TOLL_FACTOR: Record<1 | 2 | 4 | 5, number> = { 1: 1.12, 2: 1, 4: 0.8, 5: 0.25 };
export const CO2_CLASS_LABEL: Record<1 | 2 | 4 | 5, string> = { 1: 'CO₂-Klasse 1', 2: 'CO₂-Klasse 2', 4: 'CO₂-Klasse 4 (emissionsarm)', 5: 'CO₂-Klasse 5 (emissionsfrei)' };
export const co2TollFactor = (modelId: string) => CO2_TOLL_FACTOR[co2Class(TRUCK_BY_ID[modelId])];

/** Strompreis an öffentlichen Schnellladern (Cent/kWh) und am eigenen Ladepark */
export const POWER_PUBLIC = 44;
export const POWER_DEPOT = 24;
/** LNG kostet je kg etwa 80 % des Dieselpreises je Liter */
export const LNG_FACTOR = 0.8;

/** Energiepreis je Einheit (Cent) in einem Land, mit Tankkarte für Diesel und LNG */
export function energyPriceIn(state: GameState, modelId: string, country: string): number {
  const drive = driveOf(modelId);
  if (drive === 'electric') return POWER_PUBLIC * (0.9 + 0.1 * (state.market.diesel / 160));
  const base = state.market.diesel * countryDieselFactor(country) * fuelCardFactor(state);
  return drive === 'lng' ? base * LNG_FACTOR : base;
}

/** Dauer eines Tank- bzw. Ladestopps in Minuten */
export const CHARGE_STOP_MIN = 50;
export const stopMinFor = (modelId: string, fuelStopMin: number) => (driveOf(modelId) === 'electric' ? CHARGE_STOP_MIN : fuelStopMin);

/** Reichweite in km bei voller Ladung/Tankfüllung (leer, mittlere Fahrweise) */
export function rangeKm(modelId: string): number {
  const m = TRUCK_BY_ID[modelId];
  return m ? Math.round((m.tankL / m.consumption) * 100) : 0;
}

/** Anteil emissionsarmer Fahrzeuge (LNG, Elektro) im Fuhrpark */
export function lowEmissionShare(state: GameState): number {
  const vs = Object.values(state.vehicles);
  return vs.length ? vs.filter((v) => isLowEmission(v.modelId)).length / vs.length : 0;
}

/** Grüne Kunden: dieser Anteil emissionsarmer Fahrzeuge genügt, sonst muss das Fahrzeug selbst emissionsarm sein */
export const GREEN_FLEET_SHARE = 0.25;
export const GREEN_PREMIUM = 0.1;
/** Branchen, in denen es Kunden mit Klimazielen gibt */
export const GREEN_INDUSTRIES = ['retail', 'food', 'electronics', 'pharma', 'automotive', 'logistics'];
/** Grüner Kunde: aus der ID abgeleitet (kein Zufallswurf, gilt auch für ältere Spielstände) */
export function isGreenCustomer(c: { id: string; industry: string } | undefined): boolean {
  if (!c || !GREEN_INDUSTRIES.includes(c.industry)) return false;
  let h = 7;
  for (const ch of c.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 100 < 25;
}
export const GREEN_TEXT = `Grüner Kunde: fährt nur mit LNG- oder E-LKW, oder wenn mindestens ${Math.round(GREEN_FLEET_SHARE * 100)} % des Fuhrparks emissionsarm sind.`;
export const greenOk = (state: GameState, v: Vehicle) => isLowEmission(v.modelId) || lowEmissionShare(state) >= GREEN_FLEET_SHARE;
