// Lager & Kontraktlogistik (Paket E, Schritt E2).
// Lagerverträge belegen Palettenplätze in eigenen Hallen. Jeder Vertrag erzeugt Einlagerungen (Komplettladungen vom Werk
// des Kunden ins Lager) und Auslagerungen (Teilladungen vom Lager in die Region) als eigene, angenommene Aufträge.
// Der Durchsatz der Halle hängt am Lagerpersonal. Börsen-Teilladungen lassen sich über das Lager umschlagen.

import { canAfford, deptCount, salesPriceBonus, type Result } from './company.ts';
import type { SimContext } from './context.ts';
import { CARGO_BY_ID, FACILITY_DEFS, TRUCK_BY_ID } from './data/catalog.ts';
import { subcontractBlock, subcontractOrder } from './partners.ts';
import { CITIES, CITY_BY_ID, type CityDef } from './data/cities.ts';
import { addLog, adjustSatisfaction, book, formatMoney } from './finance.ts';
import { customerFor, wageLevel } from './generate.ts';
import { haversineKm } from './geo.ts';
import { freshHos, simulateDriving } from './hos.ts';
import { baseRate, pickDestination } from './orders.ts';
import { newId, rand } from './rng.ts';
import { companyIdOf, isMultiCompany } from './shard.ts';
import { MIN_PER_DAY, dayIndex, dayOfMonth, formatDate, holidayName, weekday } from './time.ts';
import type { GameState, Id, Location, Money, Order, StorageContract, WarehouseState } from './types.ts';

// ---------------------------------------------------------------- Kennzahlen

/** Ladungsarten, die auf Paletten gelagert werden */
export const STORAGE_CARGOS = ['pallets', 'piece', 'food', 'electronics', 'pharma'] as const;
/** Paletten einer Komplettladung (Sattelzug) */
export const PALLETS_PER_TRUCK = 33;
/** mittleres Gewicht einer Palette in t */
export const PALLET_T = 0.6;
/** Arbeitstage je Monat (Ein- und Auslagerung nur werktags) */
const WORKDAYS_PER_MONTH = 21.7;

/** Ausbaustufen der Lagerhalle */
export interface WarehouseStage {
  slots: number;
  /** Betriebskosten je Monat (Halle, Technik, Grundbesetzung) */
  monthly: Money;
  /** Ausbaukosten von der vorigen Stufe */
  cost: Money;
  minLevel: number;
  name: string;
}
export const WAREHOUSE_STAGES: WarehouseStage[] = [
  { slots: 2000, monthly: FACILITY_DEFS.warehouse.monthly, cost: FACILITY_DEFS.warehouse.cost, minLevel: 3, name: 'Lagerhalle' },
  { slots: 5000, monthly: 8_200_00, cost: 190_000_00, minLevel: 4, name: 'Logistikzentrum' },
  { slots: 10000, monthly: 15_000_00, cost: 340_000_00, minLevel: 5, name: 'Großlager' },
];
/** Paletten je Tag, die die Grundbesetzung der Halle umschlägt */
export const BASE_THROUGHPUT = 40;
/** Paletten je Tag und Lagerarbeiter */
export const WORKER_THROUGHPUT = 45;
/** Lagerleitung: +20 % Durchsatz, halb so viele Fehlmengen */
export const LEAD_BONUS = 0.2;
export const WORKER_SALARY: Money = 2_700_00;
export const LEAD_SALARY: Money = 4_300_00;
/** ein Lagerarbeiter je 250 Palettenplätze */
export const SLOTS_PER_WORKER = 250;
/** Umschlag über das Lager: höchstens so weit vom Lager zum Empfänger */
export const CROSSDOCK_MAX_KM = 250;
/** Umschlag über das Lager: höchstens so viel Umweg gegenüber der direkten Strecke */
export const CROSSDOCK_DETOUR = 1.35;
/** Umschlaggebühr je Palette beim Cross-Docking */
export const CROSSDOCK_FEE: Money = 3_20;
const MISSED_AFTER_MIN = 6 * 60;
/** Auslagerungen: höchstens so weit (Straßenkilometer) */
export const DISTRIBUTION_MAX_KM = 320;
const STORAGE_OFFER_DAYS = 5;

// ---------------------------------------------------------------- Abfragen

export const isWarehouse = (l: Location) => !!l.facilities?.includes('warehouse');
export const warehouses = (state: GameState) => state.company.locations.filter(isWarehouse);

export function warehouseOf(l: Location): WarehouseState {
  return (l.warehouse ??= { slots: WAREHOUSE_STAGES[0].slots, workers: 0, lead: false, handled: 0, demand: 0 });
}

export function stageOf(l: Location): WarehouseStage {
  const slots = l.warehouse?.slots ?? WAREHOUSE_STAGES[0].slots;
  return WAREHOUSE_STAGES.find((s) => s.slots === slots) ?? WAREHOUSE_STAGES[0];
}

export function nextStage(l: Location): WarehouseStage | undefined {
  return WAREHOUSE_STAGES[WAREHOUSE_STAGES.indexOf(stageOf(l)) + 1];
}

export function storageContracts(state: GameState): StorageContract[] {
  return Object.values(state.storageContracts ?? {});
}

/** belegte Palettenplätze: Summe der laufenden Verträge */
export function occupiedSlots(state: GameState, locationId: Id): number {
  return storageContracts(state).filter((c) => c.locationId === locationId && c.status === 'active').reduce((a, c) => a + c.pallets, 0);
}

/** Paletten, die gerade im Lager stehen (Bestand der Kunden) */
export function stockAt(state: GameState, locationId: Id): number {
  return storageContracts(state).filter((c) => c.locationId === locationId && c.status === 'active').reduce((a, c) => a + c.stock, 0);
}

/** Paletten je Tag, die die Halle ein- und auslagern kann */
export function throughput(l: Location): number {
  const w = l.warehouse;
  if (!w) return BASE_THROUGHPUT;
  return Math.round((BASE_THROUGHPUT + w.workers * WORKER_THROUGHPUT) * (w.lead ? 1 + LEAD_BONUS : 1));
}

export function maxWorkers(l: Location): number {
  return Math.floor(stageOf(l).slots / SLOTS_PER_WORKER);
}

export function workerSalary(l: Location, lead = false): Money {
  return Math.round(((lead ? LEAD_SALARY : WORKER_SALARY) * wageLevel(CITY_BY_ID[l.cityId]?.country ?? 'DE')) / 1000) * 1000;
}

/** Monatliche Kosten des Lagerpersonals (für die Fixkosten) */
export function warehouseStaffItems(state: GameState): { label: string; amount: Money }[] {
  const out: { label: string; amount: Money }[] = [];
  for (const l of warehouses(state)) {
    const w = l.warehouse;
    if (!w) continue;
    const city = CITY_BY_ID[l.cityId]?.name ?? '';
    if (w.workers > 0) out.push({ label: `Lagerpersonal ${city} (${w.workers} Lagerarbeiter)`, amount: Math.round(w.workers * workerSalary(l) * 1.21) });
    if (w.lead) out.push({ label: `Lagerleitung ${city}`, amount: Math.round(workerSalary(l, true) * 1.21) });
  }
  return out;
}

/** Erwarteter Durchsatz eines Vertrags (Paletten je Werktag, ein und aus) */
export function contractThroughput(c: StorageContract): number {
  return (2 * c.pallets * c.turnover) / WORKDAYS_PER_MONTH;
}

/** Monatserlös eines Vertrags: Lagergeld plus Umschlaggebühren */
export function contractMonthly(c: StorageContract): Money {
  return Math.round(c.pallets * c.ratePerPallet + 2 * c.pallets * c.turnover * c.handlingFee);
}

// ---------------------------------------------------------------- Halle, Personal, Ausbau

/** Lagerpersonal festlegen (Lagerarbeiter, Lagerleitung). Einstellung kostet 400 € je Kopf. */
export function setWarehouseStaff(state: GameState, locationId: Id, workers: number, lead: boolean): Result {
  const l = state.company.locations.find((x) => x.id === locationId);
  if (!l || !isWarehouse(l)) return { ok: false, error: 'Hier gibt es keine Lagerhalle.' };
  const w = warehouseOf(l);
  workers = Math.round(workers);
  if (workers < 0 || workers > maxWorkers(l)) return { ok: false, error: `Höchstens ${maxWorkers(l)} Lagerarbeiter in dieser Halle.` };
  const hires = Math.max(0, workers - w.workers) + (lead && !w.lead ? 1 : 0);
  const fires = Math.max(0, w.workers - workers) + (!lead && w.lead ? 1 : 0);
  const cost = hires * 400_00 + fires * workerSalary(l);
  if (cost > 0 && !canAfford(state, cost)) return { ok: false, error: 'Nicht genügend Geld.' };
  const city = CITY_BY_ID[l.cityId].name;
  if (hires) book(state, 'company', -hires * 400_00, 'hiring', `Einstellung Lagerpersonal ${city}`);
  if (fires) book(state, 'company', -fires * workerSalary(l), 'wages', `Abfindung Lagerpersonal ${city}`);
  w.workers = workers;
  w.lead = lead;
  addLog(state, { level: 'info', category: 'personnel', text: `Lager ${city}: ${workers} Lagerarbeiter${lead ? ' und Lagerleitung' : ''}, Durchsatz ${throughput(l)} Paletten am Tag.` });
  return { ok: true };
}

/** Halle auf die nächste Stufe ausbauen */
export function upgradeWarehouse(state: GameState, locationId: Id): Result {
  const l = state.company.locations.find((x) => x.id === locationId);
  if (!l || !isWarehouse(l)) return { ok: false, error: 'Hier gibt es keine Lagerhalle.' };
  const next = nextStage(l);
  if (!next) return { ok: false, error: 'Die Halle hat schon die größte Ausbaustufe.' };
  if ((state.company.level ?? 1) < next.minLevel) return { ok: false, error: `${next.name} ab Unternehmensstufe ${next.minLevel}.` };
  if (!canAfford(state, next.cost)) return { ok: false, error: 'Nicht genügend Geld.' };
  warehouseOf(l).slots = next.slots;
  book(state, 'company', -next.cost, 'maintenance', `Ausbau ${next.name} ${CITY_BY_ID[l.cityId].name}`);
  addLog(state, { level: 'success', category: 'company', text: `Lager ${CITY_BY_ID[l.cityId].name} ausgebaut: ${next.name} mit ${next.slots.toLocaleString('de-DE')} Palettenplätzen (Betrieb ${formatMoney(next.monthly)}/Monat).` });
  return { ok: true };
}

// ---------------------------------------------------------------- Verträge

/** Verlader im Umkreis des Lagers, die eine Lagerware herstellen */
function shippersNear(ctx: SimContext, wh: CityDef, cargoId: string): CityDef[] {
  const cargo = CARGO_BY_ID[cargoId];
  return CITIES.filter((c) => {
    if (c.id === wh.id || !ctx.net.hasCity(c.id) || !c.industries.some((i) => cargo.producers.includes(i))) return false;
    const km = haversineKm([wh.lon, wh.lat], [c.lon, c.lat]);
    return km >= 25 && km <= 220;
  });
}

/** Neues Lagervertragsangebot für eine Halle mit freiem Platz */
export function generateStorageOffer(state: GameState, ctx: SimContext, locationId?: Id): StorageContract | null {
  const halls = warehouses(state).filter((l) => (!locationId || l.id === locationId) && stageOf(l).slots - occupiedSlots(state, l.id) - offeredSlots(state, l.id) >= 100);
  const l = rand.pick(state, halls);
  if (!l) return null;
  const wh = CITY_BY_ID[l.cityId];
  // Ladungsarten, die die eigene Flotte fahren kann, kommen öfter
  const spaces = new Set<string>(Object.values(state.trailers).map((t) => t.type));
  for (const v of Object.values(state.vehicles)) {
    const body = TRUCK_BY_ID[v.modelId]?.body;
    if (body) spaces.add(body);
  }
  const cargo = CARGO_BY_ID[rand.weighted(state, [...STORAGE_CARGOS], (id) => CARGO_BY_ID[id].freq * (spaces.has(CARGO_BY_ID[id].trailer) ? 6 : 1))!];
  const from = rand.weighted(state, shippersNear(ctx, wh, cargo.id), (c) => Math.sqrt(c.pop));
  if (!from || !ctx.net.route(from.id, wh.id)) return null;
  const free = stageOf(l).slots - occupiedSlots(state, l.id) - offeredSlots(state, l.id);
  // Größe passend zur Flotte: je Fahrzeug etwa 90 Palettenplätze (Vertrieb holt größere Kunden)
  const fleetCap = Math.max(100, Math.min(800, Math.floor((Object.keys(state.vehicles).length * 90 * (1 + 0.25 * deptCount(state, 'sales'))) / 50) * 50));
  const pallets = Math.min(Math.floor(free / 50) * 50, fleetCap, rand.int(state, 2, 16) * 50);
  const customer = customerFor(state, from.id, from.industries.find((i) => cargo.producers.includes(i))!);
  const c: StorageContract = {
    id: newId(state, 'stc'),
    customerId: customer.id,
    locationId: l.id,
    cargoId: cargo.id,
    fromCityId: from.id,
    pallets,
    months: rand.int(state, 3, 12),
    ratePerPallet: Math.round((6_50 * rand.float(state, 0.85, 1.2) * (1 + salesPriceBonus(state))) / 10) * 10,
    handlingFee: rand.int(state, 25, 40) * 10,
    turnover: Math.round(rand.float(state, 0.6, 1.2) * 100) / 100,
    stock: 0,
    status: 'offered',
    offerExpires: state.time + STORAGE_OFFER_DAYS * MIN_PER_DAY,
    acc: { in: 0, out: 0 },
    stats: { inbound: 0, outbound: 0, missed: 0, late: 0, shortages: 0, delivered: 0 },
    autoSubcontract: true,
  };
  (state.storageContracts ??= {})[c.id] = c;
  addLog(state, {
    level: 'info',
    category: 'order',
    text: `${customer.name} (${from.name}) sucht ${pallets} Palettenplätze im Lager ${wh.name} für ${c.months} Monate (${CARGO_BY_ID[c.cargoId].name}, ca. ${formatMoney(contractMonthly(c))}/Monat).`,
  });
  return c;
}

function offeredSlots(state: GameState, locationId: Id): number {
  return storageContracts(state).filter((c) => c.locationId === locationId && c.status === 'offered').reduce((a, c) => a + c.pallets, 0);
}

export function acceptStorageContract(state: GameState, contractId: Id): Result {
  const c = state.storageContracts?.[contractId];
  if (!c || c.status !== 'offered') return { ok: false, error: 'Angebot nicht mehr verfügbar.' };
  if (state.time >= c.offerExpires) return { ok: false, error: 'Das Angebot ist abgelaufen.' };
  const l = state.company.locations.find((x) => x.id === c.locationId);
  if (!l || !isWarehouse(l)) return { ok: false, error: 'Die Lagerhalle gibt es nicht mehr.' };
  if (occupiedSlots(state, l.id) + c.pallets > stageOf(l).slots) return { ok: false, error: 'Dafür fehlen freie Palettenplätze.' };
  const start = (dayIndex(state.time) + 1) * MIN_PER_DAY;
  c.status = 'active';
  c.start = start;
  c.end = start + Math.round(c.months * 30.4) * MIN_PER_DAY;
  // der Kunde bringt die Hälfte seiner Ware mit dem Vertragsbeginn selbst
  c.stock = Math.round(c.pallets * 0.5);
  // Lagergeld für den angebrochenen Monat
  const rest = Math.max(1, 31 - dayOfMonth(start));
  const fee = Math.round((c.pallets * c.ratePerPallet * rest) / 30);
  book(state, 'company', fee, 'storage', `Lagergeld ${state.customers[c.customerId]?.name ?? 'Kunde'} (${rest} Tage)`);
  addLog(state, {
    level: 'success',
    category: 'order',
    text: `Lagervertrag mit ${state.customers[c.customerId]?.name ?? 'Kunde'}: ${c.pallets} Palettenplätze in ${CITY_BY_ID[l.cityId].name} bis ${formatDate(c.end)}. Ein- und Auslagerungen erscheinen in der Disposition.`,
  });
  return { ok: true };
}

/** Lagervertrag vorzeitig kündigen: Strafe zwei Monate Lagergeld */
export function cancelStorageContract(state: GameState, contractId: Id): Result<{ fee: Money }> {
  const c = state.storageContracts?.[contractId];
  if (!c || c.status !== 'active') return { ok: false, error: 'Kein laufender Lagervertrag.' };
  const fee = Math.round(c.pallets * c.ratePerPallet * 2);
  book(state, 'company', -fee, 'penalty', 'Vorzeitige Kündigung Lagervertrag');
  endContract(state, c, 'cancelled');
  const cust = state.customers[c.customerId];
  if (cust) adjustSatisfaction(cust, -20);
  state.company.reputation = Math.max(0, state.company.reputation - 3);
  addLog(state, { level: 'warning', category: 'order', text: `Lagervertrag mit ${cust?.name ?? 'Kunde'} gekündigt – Strafe ${formatMoney(fee)}.` });
  return { ok: true, fee };
}

function endContract(state: GameState, c: StorageContract, status: StorageContract['status']) {
  c.status = status;
  c.end = Math.min(c.end ?? state.time, state.time);
  for (const o of Object.values(state.orders)) if (o.storage?.contractId === c.id && o.status === 'accepted') o.status = 'cancelled';
}

// ---------------------------------------------------------------- Ein- und Auslagerungen

interface StorageOrderInput {
  customerId: Id;
  cargoId: string;
  fromCityId: string;
  toCityId: string;
  pallets: number;
  pickupStart: number;
  pickupHours: number;
  flow: NonNullable<Order['storage']>['flow'];
  locationId: Id;
  contractId?: Id;
  payment?: Money;
  minDeliveryEnd?: number;
}

function makeStorageOrder(state: GameState, ctx: SimContext, x: StorageOrderInput): Order | null {
  const route = ctx.net.route(x.fromCityId, x.toCityId);
  if (!route) return null;
  const cargo = CARGO_BY_ID[x.cargoId];
  const weightT = Math.round(x.pallets * PALLET_T * 10) / 10;
  const partial = x.pallets < 20;
  const pickupEnd = x.pickupStart + x.pickupHours * 60;
  const transit = simulateDriving(freshHos(), route.driveMin).elapsed + cargo.loadMin * 2;
  const deliveryEnd = Math.max(x.minDeliveryEnd ?? 0, Math.ceil((pickupEnd + transit * 1.4 + 60) / 30) * 30);
  let payment = x.payment;
  if (payment === undefined) {
    let p = baseRate(state, cargo, route.km) * 0.97;
    if (partial) p *= 0.5 + 0.5 * Math.min(1, weightT / 24);
    payment = Math.round(p / 500) * 500;
  }
  const id = newId(state, 'ord');
  const order: Order = {
    id,
    customerId: x.customerId,
    cargoId: x.cargoId,
    fromCityId: x.fromCityId,
    toCityId: x.toCityId,
    weightT,
    trailerType: cargo.trailer,
    qualifications: cargo.qualifications,
    pickupStart: x.pickupStart,
    pickupEnd,
    deliveryEnd,
    distanceKm: route.km,
    payment,
    penaltyPerHour: Math.round((payment * 0.02) / 100) * 100,
    express: false,
    international: CITY_BY_ID[x.fromCityId].country !== CITY_BY_ID[x.toCityId].country,
    ...(partial ? { partial: true } : {}),
    storage: { flow: x.flow, locationId: x.locationId, pallets: x.pallets, ...(x.contractId ? { contractId: x.contractId } : {}) },
    status: 'accepted',
    ...(isMultiCompany(state) ? { companyId: companyIdOf(state) } : {}),
    offerExpires: x.pickupStart,
    created: state.time,
  };
  state.orders[id] = order;
  return order;
}

/** Touren eines Vertrags für einen Werktag anlegen */
function scheduleContractDay(state: GameState, ctx: SimContext, c: StorageContract, l: Location, day: number, delayMin: number) {
  const t0 = day * MIN_PER_DAY;
  const wh = l.cityId;
  const cust = state.customers[c.customerId];
  // Einlagerung: Komplettladungen vom Werk ins Lager, solange Platz ist
  c.acc.in += (c.pallets * c.turnover) / PALLETS_PER_TRUCK / WORKDAYS_PER_MONTH;
  while (c.acc.in >= 1) {
    c.acc.in -= 1;
    const pallets = Math.min(PALLETS_PER_TRUCK, c.pallets - c.stock - incoming(state, c.id));
    if (pallets < 10) continue;
    const o = makeStorageOrder(state, ctx, { customerId: c.customerId, cargoId: c.cargoId, fromCityId: c.fromCityId, toCityId: wh, pallets, pickupStart: t0 + rand.int(state, 6, 11) * 60, pickupHours: 4, flow: 'in', locationId: l.id, contractId: c.id });
    if (o) c.stats.inbound++;
  }
  // Auslagerung: Teilladungen vom Lager in die Region
  c.acc.out += (c.pallets * c.turnover) / 12 / WORKDAYS_PER_MONTH;
  while (c.acc.out >= 1) {
    c.acc.out -= 1;
    const want = rand.int(state, 6, 18);
    if (c.stock < 4) {
      // Fehlmenge: Ware des Kunden ist nicht da, weil Einlagerungen fehlen
      shortage(state, c, `Fehlmenge im Lager ${CITY_BY_ID[wh].name}: ${cust?.name ?? 'Kunde'} konnte nicht beliefert werden, der Bestand ist leer.`);
      continue;
    }
    const pallets = Math.min(want, c.stock);
    // Verteilerverkehr: Empfänger in der Region (höchstens 320 Straßenkilometer)
    let dest: CityDef | undefined;
    for (let i = 0; i < 3 && !dest; i++) {
      const d = pickDestination(state, ctx, CITY_BY_ID[wh], CARGO_BY_ID[c.cargoId], 220, 20);
      if (d && (ctx.net.route(wh, d.id)?.km ?? Infinity) <= DISTRIBUTION_MAX_KM) dest = d;
    }
    if (!dest) continue;
    const o = makeStorageOrder(state, ctx, { customerId: c.customerId, cargoId: c.cargoId, fromCityId: wh, toCityId: dest.id, pallets, pickupStart: t0 + rand.int(state, 6, 10) * 60 + delayMin, pickupHours: 4, flow: 'out', locationId: l.id, contractId: c.id });
    if (!o) continue;
    // verspätete Kommissionierung: Ladefenster verschiebt sich, der Liefertermin bleibt
    if (delayMin) o.deliveryEnd = Math.max(o.pickupEnd + 60, o.deliveryEnd - delayMin);
    c.stock -= pallets;
    c.stats.outbound++;
  }
}

function incoming(state: GameState, contractId: Id): number {
  let n = 0;
  for (const o of Object.values(state.orders))
    if (o.storage?.contractId === contractId && o.storage.flow === 'in' && (o.status === 'accepted' || o.status === 'planned' || o.status === 'in_transit')) n += o.storage.pallets;
  return n;
}

function shortage(state: GameState, c: StorageContract, text: string) {
  c.stats.shortages++;
  const cust = state.customers[c.customerId];
  if (cust) adjustSatisfaction(cust, -4);
  addLog(state, { level: 'warning', category: 'order', text });
}

/** Nach jeder Zustellung (eigene Fahrt oder Subunternehmer) */
export function onStorageDelivery(state: GameState, order: Order, lateMin: number): void {
  const st = order.storage;
  if (!st) return;
  const c = st.contractId ? state.storageContracts?.[st.contractId] : undefined;
  const l = state.company.locations.find((x) => x.id === st.locationId);
  if (l?.warehouse) l.warehouse.handled += st.pallets;
  if (c) {
    c.stats.delivered++;
    if (lateMin > 0) c.stats.late++;
    if (st.flow === 'in' && c.status === 'active') c.stock = Math.min(c.pallets, c.stock + st.pallets);
    const fee = st.pallets * c.handlingFee;
    book(state, 'company', fee, 'storage', `Umschlag ${st.pallets} Paletten ${st.flow === 'in' ? 'Einlagerung' : 'Auslagerung'} (${state.customers[c.customerId]?.name ?? 'Kunde'})`);
  } else if (st.flow === 'xin') {
    book(state, 'company', st.pallets * CROSSDOCK_FEE, 'storage', `Umschlag ${st.pallets} Paletten über das Lager ${CITY_BY_ID[order.toCityId]?.name ?? ''}`);
  }
}

// ---------------------------------------------------------------- Umschlag (Cross-Docking)

export interface CrossDockPlan {
  locationId: Id;
  viaCityId: string;
  km1: number;
  km2: number;
  pay1: Money;
  pay2: Money;
  fee: Money;
  pallets: number;
}

/** Warum eine Teilladung nicht über ein Lager laufen kann (undefined: geht) */
export function crossDockBlock(state: GameState, o: Order | undefined): string | undefined {
  if (!o) return 'Auftrag nicht gefunden.';
  if (o.status !== 'accepted') return 'Nur angenommene, noch nicht disponierte Aufträge lassen sich umplanen.';
  if (!o.partial) return 'Über das Lager laufen nur Teilladungen.';
  if (o.storage || o.contractId || o.premium || o.subcontract || o.parentOrderId) return 'Dieser Auftrag lässt sich nicht über das Lager führen.';
  if (state.time > o.pickupEnd - 60) return 'Das Ladefenster schließt gleich.';
  return undefined;
}

/** Bester Umschlagplan über ein eigenes Lager in der Nähe des Empfängers */
export function crossDockPlan(state: GameState, ctx: SimContext, orderId: Id): { plan: CrossDockPlan | null; error?: string } {
  const o = state.orders[orderId];
  const block = crossDockBlock(state, o);
  if (block) return { plan: null, error: block };
  const to = CITY_BY_ID[o.toCityId];
  let best: CrossDockPlan | null = null;
  for (const l of warehouses(state)) {
    const wh = CITY_BY_ID[l.cityId];
    if (l.cityId === o.fromCityId || l.cityId === o.toCityId) continue;
    if (haversineKm([wh.lon, wh.lat], [to.lon, to.lat]) > CROSSDOCK_MAX_KM) continue;
    const r1 = ctx.net.route(o.fromCityId, l.cityId);
    const r2 = ctx.net.route(l.cityId, o.toCityId);
    if (!r1 || !r2 || r1.km + r2.km > o.distanceKm * CROSSDOCK_DETOUR + 30) continue;
    const pallets = Math.max(1, Math.ceil(o.weightT / PALLET_T));
    const pay1 = Math.round((o.payment * r1.km) / (r1.km + r2.km) / 100) * 100;
    const plan: CrossDockPlan = { locationId: l.id, viaCityId: l.cityId, km1: r1.km, km2: r2.km, pay1, pay2: o.payment - pay1, fee: pallets * CROSSDOCK_FEE, pallets };
    if (!best || plan.km1 + plan.km2 < best.km1 + best.km2) best = plan;
  }
  return best ? { plan: best } : { plan: null, error: `Kein eigenes Lager im Umkreis von ${CROSSDOCK_MAX_KM} km um den Empfänger, oder der Umweg ist zu groß.` };
}

/** Teilladung über das Lager führen: Vorlauf ins Lager, Weiterlauf als eigener Auftrag ab dem Lager */
export function crossDock(state: GameState, ctx: SimContext, orderId: Id): Result<{ plan: CrossDockPlan }> {
  const { plan, error } = crossDockPlan(state, ctx, orderId);
  if (!plan) return { ok: false, error: error ?? 'Nicht möglich.' };
  const o = state.orders[orderId];
  const final = { cityId: o.toCityId, deliveryEnd: o.deliveryEnd, payment: plan.pay2, km: plan.km2 };
  const r1 = ctx.net.route(o.fromCityId, plan.viaCityId)!;
  const transit = simulateDriving(freshHos(), r1.driveMin).elapsed + CARGO_BY_ID[o.cargoId].loadMin * 2;
  o.toCityId = plan.viaCityId;
  o.distanceKm = plan.km1;
  o.payment = plan.pay1;
  o.penaltyPerHour = Math.round((o.payment * 0.02) / 100) * 100;
  // Vorlauf: bis zum Lager so schnell wie die direkte Lieferung, mindestens aber machbar
  o.deliveryEnd = Math.max(Math.ceil((o.pickupEnd + transit * 1.4 + 60) / 30) * 30, Math.min(o.deliveryEnd, o.pickupEnd + transit * 2));
  o.international = CITY_BY_ID[o.fromCityId].country !== CITY_BY_ID[o.toCityId].country;
  o.storage = { flow: 'xin', locationId: plan.locationId, pallets: plan.pallets, final };
  addLog(state, {
    level: 'info',
    category: 'order',
    text: `Teilladung ${CITY_BY_ID[o.fromCityId].name} → ${CITY_BY_ID[final.cityId].name} läuft über das Lager ${CITY_BY_ID[plan.viaCityId].name}: Vorlauf ${plan.km1} km, Weiterlauf ${plan.km2} km, Umschlag ${formatMoney(plan.fee)}.`,
    ref: { kind: 'order', id: o.id },
  });
  return { ok: true, plan };
}

/** Weiterläufe für umgeschlagene Teilladungen anlegen (Ware ist im Lager angekommen) */
function releaseCrossDock(state: GameState, ctx: SimContext) {
  for (const o of Object.values(state.orders)) {
    const st = o.storage;
    if (st?.flow !== 'xin' || o.status !== 'delivered' || !st.final || st.nextId) continue;
    const l = state.company.locations.find((x) => x.id === st.locationId);
    // Umschlag dauert 2 Stunden; ohne Lager (aufgegeben) geht es direkt weiter
    const ready = Math.ceil(((o.deliveredAt ?? state.time) + 120) / 30) * 30;
    if (state.time < ready - 60) continue;
    const next = makeStorageOrder(state, ctx, {
      customerId: o.customerId, cargoId: o.cargoId, fromCityId: o.toCityId, toCityId: st.final.cityId, pallets: st.pallets, pickupStart: Math.max(ready, state.time), pickupHours: 6,
      flow: 'xout', locationId: l?.id ?? st.locationId, payment: st.final.payment, minDeliveryEnd: st.final.deliveryEnd,
    });
    if (!next) {
      st.nextId = 'none';
      continue;
    }
    next.weightT = o.weightT;
    next.partial = true;
    st.nextId = next.id;
    addLog(state, { level: 'info', category: 'order', text: `Weiterlauf ab Lager ${CITY_BY_ID[o.toCityId].name} nach ${CITY_BY_ID[st.final.cityId].name} bereit (Teilladung ${o.weightT.toLocaleString('de-DE')} t) – mit anderen Auslagerungen bündeln.`, ref: { kind: 'order', id: next.id } });
  }
}

// ---------------------------------------------------------------- Takt

/** Lagertouren, die 3 Stunden vor Ende des Ladefensters niemand fährt, gehen an einen Subunternehmer (wenn erlaubt) */
function autoSubcontract(state: GameState) {
  for (const o of Object.values(state.orders)) {
    const st = o.storage;
    if (!st || o.status !== 'accepted' || o.tripId || state.time < o.pickupEnd - 3 * 60) continue;
    const c = st.contractId ? state.storageContracts?.[st.contractId] : undefined;
    if (c ? !c.autoSubcontract : st.flow !== 'xout') continue;
    if (Object.values(state.vehicles).some((v) => v.queue?.some((j) => j.orderId === o.id))) continue;
    if (subcontractBlock(state, o)) continue;
    const r = subcontractOrder(state, o.id);
    if (r.ok && c) c.stats.subcontracted = (c.stats.subcontracted ?? 0) + 1;
  }
}

/** Automatische Vergabe an Subunternehmer für einen Lagervertrag ein- oder ausschalten */
export function setStorageAutoSubcontract(state: GameState, contractId: Id, on: boolean): Result {
  const c = state.storageContracts?.[contractId];
  if (!c) return { ok: false, error: 'Lagervertrag nicht gefunden.' };
  c.autoSubcontract = on;
  return { ok: true };
}

/** Stündlich: verpasste Lagertouren, Weiterläufe nach dem Umschlag */
export function hourlyStorage(state: GameState, ctx: SimContext): void {
  if (!state.storageContracts && !warehouses(state).length) return;
  autoSubcontract(state);
  for (const o of Object.values(state.orders)) {
    const st = o.storage;
    if (!st || o.status !== 'accepted' || state.time < o.pickupEnd + MISSED_AFTER_MIN) continue;
    o.status = 'cancelled';
    const c = st.contractId ? state.storageContracts?.[st.contractId] : undefined;
    const penalty = Math.round((o.payment * 0.3) / 100) * 100;
    book(state, 'company', -penalty, 'penalty', `Lagertour ${CITY_BY_ID[o.fromCityId].name} → ${CITY_BY_ID[o.toCityId].name} nicht gefahren`);
    const cust = state.customers[o.customerId];
    if (cust) adjustSatisfaction(cust, -6);
    if (c) {
      c.stats.missed++;
      // nicht abgeholte Auslagerung: Ware bleibt im Lager
      if (st.flow === 'out') c.stock = Math.min(c.pallets, c.stock + st.pallets);
    }
    addLog(state, {
      level: 'danger',
      category: 'order',
      text: `${st.flow === 'in' ? 'Einlagerung' : st.flow === 'out' ? 'Auslagerung' : 'Umschlagtour'} ${CITY_BY_ID[o.fromCityId].name} → ${CITY_BY_ID[o.toCityId].name} wurde nicht gefahren – Strafe ${formatMoney(penalty)}, ${cust?.name ?? 'der Kunde'} ist verärgert.`,
      ref: { kind: 'order', id: o.id },
    });
  }
  releaseCrossDock(state, ctx);
}

/** Täglich: Hallen anlegen, Touren für morgen, Durchsatz, Vertragsende, neue Angebote */
export function dailyStorage(state: GameState, ctx: SimContext): void {
  const halls = warehouses(state);
  if (!halls.length && !state.storageContracts) return;
  state.storageContracts ??= {};
  for (const l of halls) ensureWarehouse(state, ctx, l);
  const tomorrow = dayIndex(state.time) + 1;
  const t0 = tomorrow * MIN_PER_DAY;
  const workday = weekday(t0) < 5 && !holidayName(t0);
  for (const l of halls) {
    const w = warehouseOf(l);
    w.handled = 0;
    const active = storageContracts(state).filter((c) => c.locationId === l.id && c.status === 'active' && c.start! <= t0 && t0 < c.end!);
    // Durchsatz: geplanter Umschlag morgen gegen die Leistung der Halle
    w.demand = Math.round(active.reduce((a, c) => a + contractThroughput(c), 0));
    const over = w.demand / throughput(l);
    const delayMin = over > 1 ? Math.min(8 * 60, Math.round(((over - 1) * 6 * 60) / 30) * 30) : 0;
    if (workday) {
      for (const c of active) {
        if (c.scheduledThrough !== undefined && tomorrow <= c.scheduledThrough) continue;
        c.scheduledThrough = tomorrow;
        scheduleContractDay(state, ctx, c, l, tomorrow, delayMin);
      }
      if (over > 1) {
        addLog(state, { level: 'warning', category: 'company', text: `Lager ${CITY_BY_ID[l.cityId].name} überlastet: ${w.demand} Paletten am Tag bei ${throughput(l)} Leistung – Auslagerungen starten bis zu ${Math.round(delayMin / 60)} h später. Mehr Lagerpersonal einstellen.` });
        // Fehlmengen bei starker Überlastung (Lagerleitung halbiert sie)
        if (over > 1.3) for (const c of active) if (rand.chance(state, Math.min(0.6, (over - 1.3) * (w.lead ? 0.5 : 1)))) shortage(state, c, `Fehlmenge im Lager ${CITY_BY_ID[l.cityId].name}: Kommissionierung für ${state.customers[c.customerId]?.name ?? 'Kunde'} unvollständig (Lager überlastet).`);
      }
    }
  }
  for (const c of storageContracts(state)) {
    if (c.status === 'offered' && state.time >= c.offerExpires) c.status = 'expired';
    if (c.status !== 'active') continue;
    const cust = state.customers[c.customerId];
    if (!state.company.locations.some((l) => l.id === c.locationId && isWarehouse(l))) {
      endContract(state, c, 'cancelled');
      continue;
    }
    // zu viele Pannen: der Kunde kündigt
    const fails = c.stats.missed + c.stats.shortages;
    if (cust && cust.satisfaction < 20 && fails >= 5 && fails >= 0.2 * (c.stats.inbound + c.stats.outbound)) {
      endContract(state, c, 'lost');
      state.company.reputation = Math.max(0, state.company.reputation - 3);
      addLog(state, { level: 'danger', category: 'order', text: `${cust.name} kündigt den Lagervertrag in ${CITY_BY_ID[state.company.locations.find((l) => l.id === c.locationId)!.cityId].name}: zu viele verpasste Touren und Fehlmengen.` });
      continue;
    }
    if (state.time >= c.end!) {
      c.status = 'completed';
      const tours = c.stats.inbound + c.stats.outbound;
      const quota = tours ? 1 - (c.stats.missed + c.stats.shortages + c.stats.late * 0.5) / tours : 1;
      if (quota >= 0.85 && cust) {
        adjustSatisfaction(cust, 6);
        state.company.reputation = Math.min(100, state.company.reputation + 2);
        const renewal = renewStorageContract(state, c);
        addLog(state, { level: 'success', category: 'order', text: `Lagervertrag mit ${cust.name} erfüllt. Der Kunde bietet eine Verlängerung über ${renewal.months} Monate zu ${formatMoney(renewal.ratePerPallet)} je Platz an.` });
      } else addLog(state, { level: 'warning', category: 'order', text: `Lagervertrag mit ${cust?.name ?? 'Kunde'} ausgelaufen – zu viele Pannen für eine Verlängerung.` });
    }
  }
  // alte Verträge aufräumen
  for (const c of storageContracts(state))
    if ((c.status === 'expired' && state.time - c.offerExpires > 7 * MIN_PER_DAY) || (['completed', 'cancelled', 'lost'].includes(c.status) && state.time - (c.end ?? 0) > 60 * MIN_PER_DAY)) delete state.storageContracts[c.id];
  if (!halls.length) return;
  const offers = storageContracts(state).filter((c) => c.status === 'offered').length;
  if (offers < 1 + deptCount(state, 'sales') && rand.chance(state, 0.35)) generateStorageOffer(state, ctx);
}

function renewStorageContract(state: GameState, c: StorageContract): StorageContract {
  const r: StorageContract = {
    ...c,
    id: newId(state, 'stc'),
    ratePerPallet: Math.round((c.ratePerPallet * 1.03) / 10) * 10,
    status: 'offered',
    offerExpires: state.time + STORAGE_OFFER_DAYS * MIN_PER_DAY,
    start: undefined,
    end: undefined,
    scheduledThrough: undefined,
    stock: 0,
    acc: { in: 0, out: 0 },
    stats: { inbound: 0, outbound: 0, missed: 0, late: 0, shortages: 0, delivered: 0 },
    starter: undefined,
  };
  state.storageContracts![r.id] = r;
  return r;
}

/** Bestandshallen (vor 0.22.0): Zustand anlegen und Startvertrag in Höhe der bisherigen Auslastung */
function ensureWarehouse(state: GameState, ctx: SimContext, l: Location) {
  if (l.warehouse) return;
  warehouseOf(l);
  const util = l.warehouseUtil;
  delete l.warehouseUtil;
  if (util === undefined) return;
  const pallets = Math.round((util * WAREHOUSE_STAGES[0].slots) / 50) * 50;
  if (pallets < 100) return;
  const c = generateStorageOffer(state, ctx, l.id);
  if (!c) return;
  c.pallets = pallets;
  c.turnover = 0.5;
  c.months = 6;
  c.starter = true;
  acceptStorageContract(state, c.id);
}

/** Am Monatsersten: Lagergeld der laufenden Verträge */
export function monthlyStorage(state: GameState): void {
  for (const c of storageContracts(state)) {
    if (c.status !== 'active' || (c.start ?? 0) > state.time) continue;
    book(state, 'company', Math.round(c.pallets * c.ratePerPallet), 'storage', `Lagergeld ${state.customers[c.customerId]?.name ?? 'Kunde'} (${c.pallets} Plätze)`);
  }
}

/** Erwartete Touren je Woche (Einlagerungen, Auslagerungen) */
export function toursPerWeek(c: StorageContract): { in: number; out: number } {
  const perWeek = (5 * c.pallets * c.turnover) / WORKDAYS_PER_MONTH;
  return { in: Math.round((perWeek / PALLETS_PER_TRUCK) * 10) / 10, out: Math.round((perWeek / 12) * 10) / 10 };
}
