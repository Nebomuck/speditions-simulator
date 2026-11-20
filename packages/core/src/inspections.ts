// Straßenkontrollen: Behörden prüfen unterwegs Fahrzeugzustand, Ladungssicherung, Tempo und Tachograph.
// Häufigkeit je Land, Ergebnis nach Zustand, Fahrererfahrung, Zuverlässigkeit und Eigenschaften.
// Das Fuhrparkmanagement senkt die Beanstandungsquote (Schulungen, Abfahrtkontrollen).

import { COUNTRY_NAMES } from './data/catalog.ts';
import { deptCount } from './company.ts';
import { addLog, book, formatMoney } from './finance.ts';
import { rand } from './rng.ts';
import { formatDuration } from './time.ts';
import type { Driver, GameState, Trip, Vehicle } from './types.ts';

/** etwa eine Kontrolle je 12.000 km in einem durchschnittlichen Land (rund eine im Monat je LKW) */
export const INSPECTION_PER_KM = 1 / 12000;

/** Kontrolldichte je Land (Deutschland mit Bundesamt für Logistik und Mobilität = 1,4) */
export const INSPECTION_RATE: Record<string, number> = {
  DE: 1.4, AT: 1.3, CH: 1.4, FR: 1.25, BE: 1.1, NL: 1.1, LU: 1.0, IT: 0.9, ES: 0.9, PL: 1.0, CZ: 1.0, SK: 0.9, HU: 1.0,
  DK: 1.1, SE: 1.1, NO: 1.3, GB: 1.1,
};
export const inspectionRate = (country: string) => INSPECTION_RATE[country] ?? 0.8;

export type InspectionFinding = 'defects' | 'grounded' | 'securing' | 'speeding' | 'tachograph';
export const FINDING_LABEL: Record<InspectionFinding, string> = {
  defects: 'technische Mängel',
  grounded: 'Weiterfahrt untersagt',
  securing: 'mangelhafte Ladungssicherung',
  speeding: 'Geschwindigkeitsüberschreitung',
  tachograph: 'Unregelmäßigkeiten am Tachographen',
};

export interface InspectionResult {
  findings: InspectionFinding[];
  fine: number;
  repair: number;
  delay: number;
}

/** Fuhrparkmanagement: weniger Beanstandungen (je Abteilungsstufe −25 %) */
const fleetCare = (state: GameState) => Math.max(0.4, 1 - 0.25 * deptCount(state, 'fleet'));

/** Ergebnis einer Kontrolle auswürfeln (ohne Wirkung) */
export function rollInspection(state: GameState, vehicle: Vehicle, driver: Driver, loaded: boolean, country: string): InspectionResult {
  const care = fleetCare(state);
  const strict = country === 'FR' || country === 'AT' || country === 'CH' ? 1.4 : 1;
  const r: InspectionResult = { findings: [], fine: 0, repair: 0, delay: rand.int(state, 25, 45) };
  if (vehicle.condition < 35 && rand.chance(state, 0.7)) {
    r.findings.push('grounded');
    r.fine += rand.int(state, 4, 9) * 100_00;
    r.repair += rand.int(state, 6, 15) * 100_00;
    r.delay += rand.int(state, 120, 240);
  } else if (vehicle.condition < 50 && rand.chance(state, 0.5 * care)) {
    r.findings.push('defects');
    r.fine += rand.int(state, 15, 60) * 10_00;
    r.delay += rand.int(state, 15, 40);
  }
  if (loaded && rand.chance(state, Math.max(0.03, (0.22 - driver.experience / 600) * care))) {
    r.findings.push('securing');
    r.fine += Math.round(rand.int(state, 30, 150) * 10_00 * strict);
    r.delay += rand.int(state, 30, 75);
  }
  if (rand.chance(state, (driver.trait === 'leadfoot' ? 0.25 : 0.04) * care)) {
    r.findings.push('speeding');
    r.fine += rand.int(state, 8, 40) * 10_00;
  }
  if (driver.reliability < 45 && rand.chance(state, ((45 - driver.reliability) / 100) * care)) {
    r.findings.push('tachograph');
    r.fine += Math.round(rand.int(state, 15, 50) * 100_00 * strict);
    r.delay += rand.int(state, 30, 60);
  }
  return r;
}

/** Je gefahrenem Kilometer aufgerufen: vielleicht eine Kontrolle. true = die Fahrt steht jetzt. */
export function maybeInspect(state: GameState, trip: Trip, km: number, country: string, loaded: boolean): boolean {
  if (!rand.chance(state, km * INSPECTION_PER_KM * inspectionRate(country))) return false;
  const vehicle = state.vehicles[trip.vehicleId];
  const driver = state.drivers[trip.driverId];
  if (!vehicle || !driver) return false;
  const r = rollInspection(state, vehicle, driver, loaded, country);
  const land = COUNTRY_NAMES[country] ?? country;
  trip.activity = 'inspection';
  trip.activityLeft = r.delay;
  trip.speedKmh = 0;
  const c = state.company;
  c.totals.inspections = (c.totals.inspections ?? 0) + 1;
  if (!r.findings.length) {
    trip.log.push({ t: state.time, text: `Straßenkontrolle in ${land}: ohne Beanstandung (${formatDuration(r.delay)})` });
    return true;
  }
  c.totals.fines = (c.totals.fines ?? 0) + r.fine;
  if (r.fine) book(state, 'company', -r.fine, 'penalty', `Bußgeld ${land}: ${r.findings.map((f) => FINDING_LABEL[f]).join(', ')} (${vehicle.plate})`);
  if (r.repair) {
    book(state, 'company', -r.repair, 'repair', `Mobile Reparatur nach Kontrolle ${vehicle.plate}`);
    vehicle.condition = Math.max(vehicle.condition, 50);
    vehicle.history.push({ t: state.time, text: `Kontrolle in ${land}: Weiterfahrt erst nach Reparatur vor Ort`, cost: r.repair });
  }
  if (r.findings.includes('tachograph')) c.reputation = Math.max(0, c.reputation - 2);
  driver.satisfaction = Math.max(0, driver.satisfaction - 2);
  const text = `Straßenkontrolle in ${land}: ${r.findings.map((f) => FINDING_LABEL[f]).join(', ')}. Bußgeld ${formatMoney(r.fine)}${r.repair ? `, Reparatur vor Ort ${formatMoney(r.repair)}` : ''}, Aufenthalt ${formatDuration(r.delay)}.`;
  trip.log.push({ t: state.time, text });
  addLog(state, { level: r.findings.includes('grounded') || r.fine >= 1000_00 ? 'danger' : 'warning', category: 'trip', text: `${driver.name} (${vehicle.plate}) – ${text}`, ref: { kind: 'trip', id: trip.id } });
  return true;
}
