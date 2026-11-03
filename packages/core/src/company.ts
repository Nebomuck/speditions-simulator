// Unternehmensausbau: Niederlassungen, eigene Einrichtungen (Werkstatt, Tankstelle, Lager),
// Abteilungen mit Büropersonal, Unternehmensstufen und Flottenwartung.

import { CITY_BY_ID } from './data/cities.ts';
import {
  BRANCH_SETUP_COST, COMPANY_LEVELS, DEPARTMENTS, DEPOT_MIN_LEVEL, FACILITY_DEFS, LOCATION_DEFS, LOCATION_ORDER,
  STAFF_GRADES, STAFF_HIRING_COST, TRUCK_BY_ID, WAREHOUSE_RATE, WAREHOUSE_SLOTS, type CompanyLevelDef,
} from './data/catalog.ts';
import type { SimContext } from './context.ts';
import { addLog, book, formatMoney } from './finance.ts';
import { personName, wageLevel } from './generate.ts';
import { newId, rand } from './rng.ts';
import type { Department, FacilityKind, GameState, Id, Location, LocationKind, Money, StaffGrade, StaffMember, Trip, Vehicle } from './types.ts';

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const OVERDRAFT = -10_000_00;
const canAfford = (state: GameState, amount: Money) => state.company.account.balance - amount >= OVERDRAFT;

/** bis zu dieser Fahrzeugzahl disponiert die Geschäftsführung selbst */
export const CEO_MANAGED_VEHICLES = 5;
export const VEHICLES_PER_DISPATCHER = 8;
/** Fuhrparkmanagement: Fahrzeuge unter diesem Zustand gehen automatisch in die eigene Werkstatt */
export const AUTO_SERVICE_BELOW = 60;
/** ab dieser Erfahrung kann ein Fahrer ins Büro befördert werden */
export const PROMOTION_MIN_EXPERIENCE = 50;

// ---------------------------------------------------------------- Abfragen

export function hasFacility(state: GameState, cityId: string, kind: FacilityKind): boolean {
  return state.company.locations.some((l) => l.cityId === cityId && l.facilities?.includes(kind));
}

/** wirksame Mitarbeiterzahl einer Abteilung (gedeckelt) */
export function deptCount(state: GameState, dept: Department, capped = true): number {
  const n = (state.company.staff ?? []).filter((m) => m.dept === dept).length;
  return capped ? Math.min(DEPARTMENTS[dept].maxEffective, n) : n;
}

export function staffSeats(state: GameState): { used: number; total: number } {
  let total = 0;
  for (const l of state.company.locations) total += LOCATION_DEFS[l.kind].staff;
  return { used: (state.company.staff ?? []).length, total };
}

export function seatsAt(state: GameState, locationId: Id): { used: number; total: number } {
  const loc = state.company.locations.find((l) => l.id === locationId);
  return { used: (state.company.staff ?? []).filter((m) => m.locationId === locationId).length, total: loc ? LOCATION_DEFS[loc.kind].staff : 0 };
}

/** Fahrzeuge, die keine Disposition betreut (führt zu Unzufriedenheit der Fahrer) */
export function dispatchShortfall(state: GameState): number {
  const vehicles = Object.keys(state.vehicles).length;
  return Math.max(0, vehicles - CEO_MANAGED_VEHICLES - deptCount(state, 'dispatch') * VEHICLES_PER_DISPATCHER);
}

/** Vertrieb: Faktor auf das Auftragsvolumen der Börse */
export const salesVolumeFactor = (state: GameState) => 1 + 0.12 * deptCount(state, 'sales');
/** Vertrieb: Preisaufschlag in der Börse */
export const salesPriceBonus = (state: GameState) => 0.015 * deptCount(state, 'sales');
/** Buchhaltung: Faktor auf das Ausfallrisiko neuer Rechnungen */
export const accountingRiskFactor = (state: GameState) => [1, 0.55, 0.35][deptCount(state, 'accounting')];
/** Fuhrparkmanagement: Faktoren auf Verschleiß und Pannenrisiko */
export const fleetWearFactor = (state: GameState) => 1 - 0.08 * deptCount(state, 'fleet');
export const fleetBreakdownFactor = (state: GameState) => 1 - 0.3 * deptCount(state, 'fleet');

export function staffSalary(dept: Department, location: Location, grade: StaffGrade = 'regular'): Money {
  return Math.round((DEPARTMENTS[dept].salary * STAFF_GRADES[grade].salaryFactor * wageLevel(CITY_BY_ID[location.cityId]?.country ?? 'DE')) / 1000) * 1000;
}

/** Monatliche Betriebskosten aller Einrichtungen */
export function facilityItems(state: GameState): { label: string; amount: Money }[] {
  const items: { label: string; amount: Money }[] = [];
  for (const l of state.company.locations)
    for (const f of l.facilities ?? []) items.push({ label: `Betrieb ${FACILITY_DEFS[f].name.split(' (')[0]} ${CITY_BY_ID[l.cityId].name}`, amount: FACILITY_DEFS[f].monthly });
  return items;
}

/** Buchwert eigener Einrichtungen (für den Firmenwert): 50 % der Baukosten */
export function facilityValue(state: GameState): Money {
  let v = 0;
  for (const l of state.company.locations) for (const f of l.facilities ?? []) v += FACILITY_DEFS[f].cost * 0.5;
  return v;
}

// ---------------------------------------------------------------- Unternehmensstufen

export interface LevelProgress {
  def: CompanyLevelDef;
  next?: CompanyLevelDef;
  /** erfüllte/nicht erfüllte Anforderungen der nächsten Stufe */
  checks: { label: string; have: number; need: number; ok: boolean }[];
}

export function levelDef(level: number): CompanyLevelDef {
  return COMPANY_LEVELS[Math.max(1, Math.min(COMPANY_LEVELS.length, level)) - 1];
}

function levelChecks(state: GameState, d: CompanyLevelDef) {
  const countries = new Set(state.company.locations.map((l) => CITY_BY_ID[l.cityId]?.country)).size;
  const c = state.company;
  return [
    { label: 'Fahrzeuge', have: Object.keys(state.vehicles).length, need: d.vehicles },
    { label: 'Lieferungen', have: c.totals.deliveries, need: d.deliveries },
    { label: 'Reputation', have: Math.round(c.reputation), need: d.reputation },
    { label: 'Standorte', have: c.locations.length, need: d.locations },
    { label: 'Länder mit Standort', have: countries, need: d.countries },
  ]
    .filter((x) => x.need > (x.label === 'Standorte' || x.label === 'Länder mit Standort' ? 1 : 0))
    .map((x) => ({ ...x, ok: x.have >= x.need }));
}

export function levelProgress(state: GameState): LevelProgress {
  const level = state.company.level ?? 1;
  const next = COMPANY_LEVELS[level];
  return { def: levelDef(level), next, checks: next ? levelChecks(state, next) : [] };
}

/** Täglich: Aufstieg in die nächste Stufe, sobald alle Anforderungen erfüllt sind (Stufen gehen nicht verloren). */
export function updateCompanyLevel(state: GameState): void {
  const c = state.company;
  c.level ??= 1;
  for (;;) {
    const next = COMPANY_LEVELS[c.level];
    if (!next || !levelChecks(state, next).every((x) => x.ok)) break;
    c.level = next.level;
    c.reputation = Math.min(100, c.reputation + 2);
    addLog(state, {
      level: 'success',
      category: 'company',
      text: `Neue Unternehmensstufe ${next.level}: ${next.name}. Jetzt bis zu ${next.maxLocations} Standorte möglich${next.level === 2 ? ', eigene Werkstatt und Tankstelle' : next.level === DEPOT_MIN_LEVEL ? ', Großer Betriebshof und Lagerhalle' : ''}.`,
    });
  }
}

// ---------------------------------------------------------------- Standorte

export function openBranch(state: GameState, ctx: SimContext, cityId: string, kind: LocationKind): Result<{ id: Id }> {
  const city = CITY_BY_ID[cityId];
  if (!city || !ctx.net.hasCity(cityId)) return { ok: false, error: 'Unbekannte Stadt.' };
  if (kind !== 'office_small' && kind !== 'office_yard') return { ok: false, error: 'Neue Niederlassungen starten als Büro oder Büro mit Betriebshof.' };
  const c = state.company;
  if (c.locations.some((l) => l.cityId === cityId)) return { ok: false, error: `In ${city.name} gibt es bereits einen Standort.` };
  const max = levelDef(c.level ?? 1).maxLocations;
  if (c.locations.length >= max) return { ok: false, error: `Auf Unternehmensstufe ${c.level ?? 1} sind höchstens ${max} Standort${max > 1 ? 'e' : ''} möglich.` };
  const def = LOCATION_DEFS[kind];
  const cost = def.deposit + BRANCH_SETUP_COST;
  if (!canAfford(state, cost)) return { ok: false, error: 'Nicht genügend Geld für Kaution und Einrichtung.' };
  const id = newId(state, 'loc');
  c.locations.push({ id, cityId, kind, since: state.time, facilities: [] });
  book(state, 'company', -cost, 'rent', `Neue Niederlassung ${city.name} (Kaution & Einrichtung)`);
  addLog(state, { level: 'success', category: 'company', text: `Niederlassung ${city.name} eröffnet: ${def.name} (${def.parking} Stellplätze, Miete ${formatMoney(def.rent)}/Monat).` });
  return { ok: true, id };
}

export function upgradeLocation(state: GameState, locationId: Id, kind: LocationKind): Result {
  const loc = state.company.locations.find((l) => l.id === locationId);
  const def = LOCATION_DEFS[kind];
  if (!loc || !def) return { ok: false, error: 'Standort nicht gefunden.' };
  if (LOCATION_ORDER.indexOf(kind) <= LOCATION_ORDER.indexOf(loc.kind)) return { ok: false, error: 'Nur Erweiterungen auf eine größere Stufe möglich.' };
  if (kind === 'depot' && (state.company.level ?? 1) < DEPOT_MIN_LEVEL) return { ok: false, error: `Großer Betriebshof ab Unternehmensstufe ${DEPOT_MIN_LEVEL}.` };
  if (!canAfford(state, def.deposit)) return { ok: false, error: 'Nicht genügend Geld für Kaution und Einrichtung.' };
  loc.kind = kind;
  book(state, 'company', -def.deposit, 'rent', `Kaution & Einrichtung ${def.name}`);
  addLog(state, { level: 'success', category: 'company', text: `Standort ${CITY_BY_ID[loc.cityId].name} erweitert: ${def.name} (${def.parking} Stellplätze).` });
  return { ok: true };
}

/** Niederlassung aufgeben: Aufhebung kostet eine Monatsmiete, Einrichtungen verfallen, Personal wird umgesetzt. */
export function closeBranch(state: GameState, locationId: Id): Result {
  const c = state.company;
  const loc = c.locations.find((l) => l.id === locationId);
  if (!loc) return { ok: false, error: 'Standort nicht gefunden.' };
  if (loc.cityId === c.hqCityId) return { ok: false, error: 'Der Firmensitz kann nicht aufgegeben werden.' };
  const def = LOCATION_DEFS[loc.kind];
  let parking = 0;
  let trailerParking = 0;
  for (const l of c.locations) if (l !== loc) {
    parking += LOCATION_DEFS[l.kind].parking;
    trailerParking += LOCATION_DEFS[l.kind].trailerParking;
  }
  if (Object.keys(state.vehicles).length > parking || Object.keys(state.trailers).length > trailerParking)
    return { ok: false, error: 'Ohne diesen Standort fehlen Stellplätze – zuerst Fahrzeuge oder Auflieger abgeben.' };
  const staffHere = (c.staff ?? []).filter((m) => m.locationId === loc.id);
  const free = c.locations.filter((l) => l !== loc).map((l) => ({ l, free: seatsAt(state, l.id).total - seatsAt(state, l.id).used }));
  if (staffHere.length > free.reduce((s, x) => s + x.free, 0)) return { ok: false, error: 'Für das Personal dieses Standorts fehlen andernorts Arbeitsplätze.' };
  for (const m of staffHere) {
    const target = free.find((x) => x.free > 0)!;
    m.locationId = target.l.id;
    target.free--;
  }
  c.locations = c.locations.filter((l) => l !== loc);
  book(state, 'company', -def.rent, 'rent', `Aufhebung Mietvertrag ${CITY_BY_ID[loc.cityId].name}`);
  addLog(state, { level: 'warning', category: 'company', text: `Niederlassung ${CITY_BY_ID[loc.cityId].name} aufgegeben (Aufhebung ${formatMoney(def.rent)}).` });
  return { ok: true };
}

export function buildFacility(state: GameState, locationId: Id, kind: FacilityKind): Result {
  const loc = state.company.locations.find((l) => l.id === locationId);
  const def = FACILITY_DEFS[kind];
  if (!loc || !def) return { ok: false, error: 'Standort oder Einrichtung nicht gefunden.' };
  loc.facilities ??= [];
  if (loc.facilities.includes(kind)) return { ok: false, error: `${def.name} gibt es hier bereits.` };
  if ((state.company.level ?? 1) < def.minLevel) return { ok: false, error: `${def.name} ab Unternehmensstufe ${def.minLevel}.` };
  if (LOCATION_ORDER.indexOf(loc.kind) < LOCATION_ORDER.indexOf(def.minKind)) return { ok: false, error: `${def.name} braucht mindestens einen Standort „${LOCATION_DEFS[def.minKind].name}“.` };
  if (!canAfford(state, def.cost)) return { ok: false, error: 'Nicht genügend Geld.' };
  loc.facilities.push(kind);
  if (kind === 'warehouse') loc.warehouseUtil = 0.15;
  book(state, 'company', -def.cost, 'maintenance', `${def.name} ${CITY_BY_ID[loc.cityId].name}`);
  addLog(state, { level: 'success', category: 'company', text: `${def.name} in ${CITY_BY_ID[loc.cityId].name} in Betrieb genommen (${formatMoney(def.cost)}, Betrieb ${formatMoney(def.monthly)}/Monat).` });
  return { ok: true };
}

// ---------------------------------------------------------------- Abteilungen

export function hireStaff(state: GameState, dept: Department, locationId: Id, grade: StaffGrade = 'regular'): Result<{ id: Id }> {
  const loc = state.company.locations.find((l) => l.id === locationId);
  if (!loc || !DEPARTMENTS[dept] || !STAFF_GRADES[grade]) return { ok: false, error: 'Standort oder Abteilung nicht gefunden.' };
  const seats = seatsAt(state, loc.id);
  if (seats.used >= seats.total) return { ok: false, error: `Keine freien Büroarbeitsplätze in ${CITY_BY_ID[loc.cityId].name} (${seats.total}). Standort erweitern.` };
  if (!canAfford(state, STAFF_HIRING_COST)) return { ok: false, error: 'Nicht genügend Geld.' };
  const [lo, hi] = STAFF_GRADES[grade].skill;
  const m: StaffMember = {
    id: newId(state, 'stf'), name: personName(state, CITY_BY_ID[loc.cityId].country), dept, salary: staffSalary(dept, loc, grade), hired: state.time, locationId: loc.id,
    skill: rand.int(state, lo, hi),
  };
  (state.company.staff ??= []).push(m);
  book(state, 'company', -STAFF_HIRING_COST, 'hiring', `Einstellung ${m.name} (${DEPARTMENTS[dept].name})`);
  addLog(state, { level: 'success', category: 'personnel', text: `${m.name} verstärkt die ${DEPARTMENTS[dept].name} in ${CITY_BY_ID[loc.cityId].name} (Kompetenz ${m.skill}, ${formatMoney(m.salary)}/Monat).` });
  return { ok: true, id: m.id };
}

export function fireStaff(state: GameState, staffId: Id): Result {
  const staff = state.company.staff ?? [];
  const m = staff.find((x) => x.id === staffId);
  if (!m) return { ok: false, error: 'Mitarbeiter nicht gefunden.' };
  state.company.staff = staff.filter((x) => x !== m);
  book(state, 'company', -m.salary, 'wages', `Abfindung ${m.name}`);
  addLog(state, { level: 'warning', category: 'personnel', text: `${m.name} (${DEPARTMENTS[m.dept].name}) wurde entlassen (Abfindung ${formatMoney(m.salary)}).` });
  return { ok: true };
}

/** Erfahrene Fahrer können ins Büro wechseln – ohne Einstellungskosten, mit 8 % mehr Gehalt. */
export function promoteDriver(state: GameState, driverId: Id, dept: Department): Result<{ id: Id }> {
  const d = state.drivers[driverId];
  if (!d || !DEPARTMENTS[dept]) return { ok: false, error: 'Fahrer oder Abteilung nicht gefunden.' };
  if (d.status !== 'idle') return { ok: false, error: `${d.name} ist derzeit nicht verfügbar.` };
  if (d.experience < PROMOTION_MIN_EXPERIENCE) return { ok: false, error: `Beförderung ab ${PROMOTION_MIN_EXPERIENCE} Erfahrungspunkten.` };
  if (d.leavesAt !== undefined) return { ok: false, error: `${d.name} hat gekündigt.` };
  const locs = state.company.locations;
  const loc = locs.find((l) => l.cityId === d.cityId && seatsAt(state, l.id).used < seatsAt(state, l.id).total) ?? locs.find((l) => seatsAt(state, l.id).used < seatsAt(state, l.id).total);
  if (!loc) return { ok: false, error: 'Keine freien Büroarbeitsplätze. Standort erweitern.' };
  const m: StaffMember = {
    id: newId(state, 'stf'), name: d.name, dept, salary: Math.max(staffSalary(dept, loc), Math.round((d.salary * 1.08) / 1000) * 1000),
    hired: d.hired, locationId: loc.id, promoted: true,
    // Fahrpraxis hilft in der Disposition besonders
    skill: Math.round(Math.min(90, dept === 'dispatch' ? 25 + d.experience * 0.6 : 20 + d.experience * 0.4)),
  };
  (state.company.staff ??= []).push(m);
  delete state.drivers[d.id];
  for (const o of Object.values(state.drivers)) o.satisfaction = Math.min(100, o.satisfaction + 2);
  addLog(state, { level: 'success', category: 'personnel', text: `${d.name} wechselt vom Steuer in die ${DEPARTMENTS[dept].name} (${CITY_BY_ID[loc.cityId].name}, ${formatMoney(m.salary)}/Monat).` });
  return { ok: true, id: m.id };
}

// ---------------------------------------------------------------- Flotte

export function serviceCost(state: GameState, v: Vehicle): { cost: Money; hours: number; own: boolean } {
  const missing = 100 - v.condition;
  const own = hasFacility(state, v.cityId, 'workshop');
  const cost = Math.round((180_00 + missing * 38_00) * (own ? 0.65 : 1));
  const hours = Math.ceil((2 + missing / 8) * (own ? 0.7 : 1));
  return { cost, hours, own };
}

export function serviceVehicle(state: GameState, v: Vehicle, auto = false): Result {
  if (v.status !== 'idle') return { ok: false, error: 'Fahrzeug ist im Einsatz.' };
  if (v.condition >= 98) return { ok: false, error: 'Fahrzeug ist bereits in Topzustand.' };
  const { cost, hours, own } = serviceCost(state, v);
  if (!canAfford(state, cost)) return { ok: false, error: 'Nicht genügend Geld.' };
  v.condition = 100;
  v.status = 'workshop';
  v.busyUntil = state.time + hours * 60;
  v.history.push({ t: state.time, text: `Wartung & Reparatur${own ? ' (eigene Werkstatt)' : ''} (${hours} h)`, cost });
  book(state, 'company', -cost, 'maintenance', `${own ? 'Eigene Werkstatt' : 'Werkstatt'} ${v.plate}`);
  for (const t of Object.values(state.trailers)) if (t.cityId === v.cityId && t.status === 'idle' && t.condition < 90) t.condition = 100;
  addLog(state, {
    level: 'info',
    category: 'fleet',
    text: `${auto ? 'Fuhrparkmanagement: ' : ''}LKW ${v.plate} in der ${own ? 'eigenen ' : ''}Werkstatt (${hours} h, ${formatMoney(cost)}).`,
    ref: { kind: 'vehicle', id: v.id },
  });
  return { ok: true };
}

/** Alle freien Fahrzeuge unter dem Schwellwert warten lassen. */
export function serviceFleet(state: GameState, below: number): Result<{ count: number; cost: Money }> {
  let count = 0;
  let cost = 0;
  for (const v of Object.values(state.vehicles)) {
    if (v.status !== 'idle' || v.condition >= below || v.queue?.length) continue;
    const c = serviceCost(state, v).cost;
    if (serviceVehicle(state, v).ok) {
      count++;
      cost += c;
    }
  }
  if (count === 0) return { ok: false, error: `Kein freies Fahrzeug unter ${below} % Zustand.` };
  return { ok: true, count, cost };
}

/** Betriebstankstelle: bei Abfahrt am Standort volltanken. */
export function depotRefuel(state: GameState, vehicle: Vehicle, trip: Trip): void {
  if (!hasFacility(state, vehicle.cityId, 'fuel')) return;
  const tank = TRUCK_BY_ID[vehicle.modelId].tankL;
  const liters = tank - vehicle.fuelL;
  if (liters < tank * 0.05) return;
  const cost = Math.round(liters * state.market.diesel * 0.91);
  vehicle.fuelL = tank;
  trip.costs.fuel += cost;
  book(state, 'company', -cost, 'fuel', `Betriebstankstelle ${Math.round(liters)} l (${vehicle.plate})`);
  trip.log.push({ t: state.time, text: `An der Betriebstankstelle vollgetankt: ${Math.round(liters)} l für ${formatMoney(cost)}` });
}

// ---------------------------------------------------------------- Simulation

/** Stündlich: Fuhrparkmanagement schickt fällige Fahrzeuge in die eigene Werkstatt. */
export function hourlyCompany(state: GameState): void {
  if (deptCount(state, 'fleet') === 0) return;
  for (const v of Object.values(state.vehicles))
    if (v.status === 'idle' && v.condition < AUTO_SERVICE_BELOW && !v.queue?.length && hasFacility(state, v.cityId, 'workshop')) serviceVehicle(state, v, true);
}

/** Täglich: Unternehmensstufe, Lagerauslastung. */
export function dailyCompany(state: GameState): void {
  updateCompanyLevel(state);
  for (const l of state.company.locations) {
    if (!l.facilities?.includes('warehouse')) continue;
    const target = Math.max(0.15, Math.min(0.95, 0.3 + (state.company.reputation - 50) / 150 + 0.12 * deptCount(state, 'sales')));
    l.warehouseUtil = (l.warehouseUtil ?? 0.15) + (target - (l.warehouseUtil ?? 0.15)) * 0.03;
  }
}

export function warehouseIncome(l: Location): Money {
  return l.facilities?.includes('warehouse') ? Math.round(WAREHOUSE_SLOTS * (l.warehouseUtil ?? 0) * WAREHOUSE_RATE) : 0;
}

/** Am Monatsersten: Lagererlöse buchen. */
export function monthlyCompany(state: GameState): void {
  for (const l of state.company.locations) {
    const income = warehouseIncome(l);
    if (income > 0) book(state, 'company', income, 'storage', `Lagerlogistik ${CITY_BY_ID[l.cityId].name} (${Math.round((l.warehouseUtil ?? 0) * 100)} % belegt)`);
  }
}
