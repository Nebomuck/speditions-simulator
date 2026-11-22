// Auswertung (Paket E, Schritt E1): Nachkalkulation je Fahrt, Berichte nach Kunde, Fahrzeug, Fahrer und
// Strecke, Liquiditätsprognose, Engpass-Warnungen und CSV-Export. Alles reine Lesefunktionen auf dem
// Spielstand – nur `recordTrip` und `pruneRecords` schreiben (in `state.tripRecords`).

import { CITY_BY_ID } from './data/cities.ts';
import { throughput } from './storage.ts';
import { CARGO_BY_ID, TRAILER_BY_TYPE, TRUCK_BY_ID } from './data/catalog.ts';
import { TEAM_ALLOWANCE_PER_DAY, penaltyFor } from './dispatch.ts';
import { EMPLOYER_COST_FACTOR, formatMoney, monthlyFixedCosts } from './finance.ts';
import { CREDIT_LINE, WARNING_DAYS, bankLiquidity } from './insolvency.ts';
import { energyPriceIn } from './energy.ts';
import { HOS_RULES } from './hos.ts';
import { companyIdOf, orderOwner } from './shard.ts';
import { MIN_PER_DAY, dayOfMonth, formatDateTime } from './time.ts';
import type { GameState, GameTime, Id, Money, Trip } from './types.ts';

// ---------------------------------------------------------------- Nachkalkulation

/** Abrechnung einer abgeschlossenen Fahrt */
export interface TripRecord {
  id: Id;
  /** Ende der Fahrt */
  t: GameTime;
  start: GameTime;
  vehicleId: Id;
  driverId: Id;
  coDriverId?: Id;
  fromCityId: string;
  toCityId: string;
  /** zugestellte Aufträge dieser Fahrt mit Erlös nach Vertragsstrafe */
  orders: { id: Id; customerId: Id; revenue: Money; late: boolean }[];
  kmLoaded: number;
  kmEmpty: number;
  revenue: Money;
  fuel: Money;
  toll: Money;
  /** Bahn und Fähre */
  rail: Money;
  /** Fahrerlohn mit Arbeitgeberanteil, anteilig für die Dauer der Fahrt */
  driver: Money;
  /** Versicherung, Leasing bzw. Abschreibung anteilig plus Verschleiß je km */
  vehicle: Money;
  /** Deckungsbeitrag */
  profit: Money;
  /** geplanter Gewinn bei der Disposition */
  planned?: Money;
}

/** so lange bleiben Abrechnungen erhalten */
export const RECORD_DAYS = 400;
/** Verschleiß je km (wie in der Schätzung) */
const WEAR_PER_KM = 6;

/** Fahrt abrechnen (beim Abschluss, nur Fahrten mit Aufträgen) */
export function recordTrip(state: GameState, trip: Trip): TripRecord | undefined {
  if (!trip.stops?.length) return undefined;
  const seen = new Set<Id>();
  const orders: TripRecord['orders'] = [];
  for (const st of trip.stops) {
    if (st.kind !== 'delivery' || seen.has(st.orderId)) continue;
    seen.add(st.orderId);
    const o = state.orders[st.orderId];
    if (!o || o.status !== 'delivered') continue;
    const late = (o.lateMinutes ?? 0) > 0;
    orders.push({ id: o.id, customerId: o.customerId, revenue: o.payment - penaltyFor(o, o.lateMinutes ?? 0), late });
  }
  const end = trip.finishedAt ?? state.time;
  const durationMin = Math.max(1, end - trip.startedAt);
  const d = state.drivers[trip.driverId];
  const co = trip.coDriverId ? state.drivers[trip.coDriverId] : undefined;
  const wages = ((d?.salary ?? 0) + (co?.salary ?? 0)) * EMPLOYER_COST_FACTOR;
  const driver = Math.round((wages / (30 * MIN_PER_DAY)) * durationMin) + (co ? Math.ceil(durationMin / MIN_PER_DAY) * TEAM_ALLOWANCE_PER_DAY : 0);
  const v = state.vehicles[trip.vehicleId];
  const model = v ? TRUCK_BY_ID[v.modelId] : undefined;
  const daily = model ? (model.insurance + (v!.leaseRate ?? model.price / 72)) / 30 : 0;
  const km = trip.kmLoaded + trip.kmEmpty;
  const vehicle = Math.round((daily * durationMin) / MIN_PER_DAY + km * WEAR_PER_KM);
  const revenue = orders.reduce((a, o) => a + o.revenue, 0);
  // Kraftstoff nach Verbrauch auf dieser Fahrt (getankt wird, wann es passt – das wäre je Fahrt zufällig verteilt)
  const fromC = CITY_BY_ID[trip.stops[0].cityId]?.country;
  const toC = CITY_BY_ID[trip.stops[trip.stops.length - 1].cityId]?.country;
  const price = v && fromC && toC ? (energyPriceIn(state, v.modelId, fromC) + energyPriceIn(state, v.modelId, toC)) / 2 : 0;
  const fuel = Math.round((trip.fuelUsed ?? 0) * price);
  const toll = Math.round(trip.costs.toll);
  const rail = Math.round(trip.costs.rail ?? 0);
  const firstPickup = trip.stops.find((s) => s.kind === 'pickup');
  const lastDrop = [...trip.stops].reverse().find((s) => s.kind === 'delivery');
  const r: TripRecord = {
    id: trip.id,
    t: end,
    start: trip.startedAt,
    vehicleId: trip.vehicleId,
    driverId: trip.driverId,
    ...(trip.coDriverId ? { coDriverId: trip.coDriverId } : {}),
    fromCityId: firstPickup?.cityId ?? trip.legs[0].nodes[0],
    toCityId: lastDrop?.cityId ?? trip.legs[trip.legs.length - 1].nodes.at(-1)!,
    orders,
    kmLoaded: Math.round(trip.kmLoaded),
    kmEmpty: Math.round(trip.kmEmpty),
    revenue,
    fuel,
    toll,
    rail,
    driver,
    vehicle,
    profit: revenue - fuel - toll - rail - driver - vehicle,
    ...(trip.plannedProfit !== undefined ? { planned: trip.plannedProfit } : {}),
  };
  (state.tripRecords ??= []).push(r);
  return r;
}

/** Täglich: alte Abrechnungen entfernen */
export function pruneRecords(state: GameState): void {
  const list = state.tripRecords;
  if (!list?.length) return;
  const cut = state.time - RECORD_DAYS * MIN_PER_DAY;
  let i = 0;
  while (i < list.length && list[i].t < cut) i++;
  if (i) list.splice(0, i);
}

export const recordsSince = (state: GameState, days: number) => {
  const from = state.time - days * MIN_PER_DAY;
  return (state.tripRecords ?? []).filter((r) => r.t >= from);
};

// ---------------------------------------------------------------- Berichte

export interface ReportRow {
  key: string;
  label: string;
  trips: number;
  deliveries: number;
  late: number;
  revenue: Money;
  costs: Money;
  profit: Money;
  kmLoaded: number;
  kmEmpty: number;
  /** Stunden im Einsatz (Fahrten) */
  hours: number;
  /** Zusatzwerte je Bericht */
  extra?: Record<string, number>;
}

export type ReportKind = 'customer' | 'vehicle' | 'driver' | 'route';

const costsOf = (r: TripRecord) => r.fuel + r.toll + r.rail + r.driver + r.vehicle;

function row(key: string, label: string): ReportRow {
  return { key, label, trips: 0, deliveries: 0, late: 0, revenue: 0, costs: 0, profit: 0, kmLoaded: 0, kmEmpty: 0, hours: 0 };
}

/** Anteil `share` einer Fahrt auf eine Zeile buchen */
function add(rw: ReportRow, r: TripRecord, share: number, orders: TripRecord['orders']) {
  rw.trips += share;
  rw.deliveries += orders.length;
  rw.late += orders.filter((o) => o.late).length;
  rw.revenue += Math.round(orders.reduce((a, o) => a + o.revenue, 0));
  rw.costs += Math.round(costsOf(r) * share);
  rw.kmLoaded += Math.round(r.kmLoaded * share);
  rw.kmEmpty += Math.round(r.kmEmpty * share);
  rw.hours += ((r.t - r.start) / 60) * share;
}

/** Bericht über die letzten `days` Tage, nach Deckungsbeitrag absteigend */
export function report(state: GameState, kind: ReportKind, days: number): ReportRow[] {
  const rows = new Map<string, ReportRow>();
  const get = (key: string, label: string) => rows.get(key) ?? rows.set(key, row(key, label)).get(key)!;
  for (const r of recordsSince(state, days)) {
    if (kind === 'customer') {
      // Kosten nach Erlösanteil auf die Kunden der Fahrt verteilen
      const total = r.revenue || 1;
      const by = new Map<Id, TripRecord['orders']>();
      for (const o of r.orders) by.set(o.customerId, [...(by.get(o.customerId) ?? []), o]);
      for (const [cid, os] of by) {
        const share = r.revenue ? os.reduce((a, o) => a + o.revenue, 0) / total : 1 / by.size;
        add(get(cid, state.customers[cid]?.name ?? 'Ehemaliger Kunde'), r, share, os);
      }
    } else if (kind === 'vehicle') {
      const v = state.vehicles[r.vehicleId];
      add(get(r.vehicleId, v ? `${v.plate} (${TRUCK_BY_ID[v.modelId]?.name ?? v.modelId})` : 'Verkauftes Fahrzeug'), r, 1, r.orders);
    } else if (kind === 'driver') {
      for (const id of [r.driverId, ...(r.coDriverId ? [r.coDriverId] : [])]) add(get(id, state.drivers[id]?.name ?? 'Ehemaliger Fahrer'), r, r.coDriverId ? 0.5 : 1, id === r.driverId ? r.orders : []);
    } else {
      const from = CITY_BY_ID[r.fromCityId];
      const to = CITY_BY_ID[r.toCityId];
      add(get(`${r.fromCityId}>${r.toCityId}`, `${from?.name ?? r.fromCityId} → ${to?.name ?? r.toCityId}`), r, 1, r.orders);
    }
  }
  const out = [...rows.values()];
  for (const rw of out) {
    rw.profit = rw.revenue - rw.costs;
    rw.trips = Math.round(rw.trips * 10) / 10;
    rw.hours = Math.round(rw.hours * 10) / 10;
  }
  if (kind === 'vehicle') {
    // Auslastung: Einsatzstunden an der Zeit, seit der das Fahrzeug im Bestand ist (höchstens der Zeitraum)
    for (const rw of out) {
      const v = state.vehicles[rw.key];
      const avail = Math.max(1, Math.min(days * 24, v ? (state.time - (v.bought ?? 0)) / 60 : days * 24));
      rw.extra = { utilization: Math.min(1, rw.hours / avail), costPerKm: Math.round(rw.costs / Math.max(1, rw.kmLoaded + rw.kmEmpty)) };
    }
  }
  if (kind === 'customer') {
    // Zahlungsdauer aus bezahlten Rechnungen
    for (const rw of out) {
      const paid = Object.values(state.invoices).filter((i) => i.customerId === rw.key && i.paid !== undefined);
      if (paid.length) rw.extra = { payDays: Math.round((paid.reduce((a, i) => a + (i.paid! - i.issued), 0) / paid.length / MIN_PER_DAY) * 10) / 10 };
    }
  }
  if (kind === 'route') for (const rw of out) rw.extra = { profitPerKm: Math.round(rw.profit / Math.max(1, rw.kmLoaded + rw.kmEmpty)) };
  return out.sort((a, b) => b.profit - a.profit);
}

/** Summe über alle Fahrten im Zeitraum */
export function reportTotals(state: GameState, days: number): ReportRow & { planned: Money; plannedTrips: number } {
  const t = { ...row('total', 'Gesamt'), planned: 0, plannedTrips: 0 };
  for (const r of recordsSince(state, days)) {
    add(t, r, 1, r.orders);
    if (r.planned !== undefined) {
      t.planned += r.planned;
      t.plannedTrips++;
    }
  }
  t.profit = t.revenue - t.costs;
  t.hours = Math.round(t.hours * 10) / 10;
  return t;
}

// ---------------------------------------------------------------- Liquiditätsprognose

export interface ForecastDay {
  day: number;
  t: GameTime;
  balance: Money;
  /** Zahlungseingänge offener Rechnungen (gewichtet mit Zahlungsmoral) */
  receipts: Money;
  /** laufendes Geschäft: neue Erlöse (nach Zahlungsziel) abzüglich Kraftstoff und Maut */
  operations: Money;
  /** Fixkosten zum Monatsersten */
  fixed: Money;
}

export interface Forecast {
  days: ForecastDay[];
  /** erster Tag mit negativem Kontostand (Index) */
  negativeOn?: number;
  lowest: Money;
  monthlyFixed: Money;
}

/** Liquiditätsprognose über `days` Tage: Fixkosten, offene Rechnungen, Durchschnitt des laufenden Geschäfts (letzte 30 Tage) */
export function forecastLiquidity(state: GameState, days = 30): Forecast {
  const fixedItems = monthlyFixedCosts(state);
  const monthlyFixed = fixedItems.reduce((a, i) => a + i.amount, 0);
  const rentDaily = Object.values(state.vehicles).reduce((a, v) => a + (v.ownership === 'rented' ? (v.rentPerDay ?? 0) : 0), 0);
  // laufendes Geschäft aus den Abrechnungen der letzten 30 Tage
  const recent = recordsSince(state, 30);
  const span = Math.max(7, Math.min(30, (state.time - (state.company.founded ?? state.time)) / MIN_PER_DAY));
  const revDay = recent.reduce((a, r) => a + r.revenue, 0) / span;
  const varDay = recent.reduce((a, r) => a + r.fuel + r.toll + r.rail, 0) / span;
  // Zahlungsziel im Mittel der Kunden mit offenen Rechnungen, sonst 21 Tage
  const open = Object.values(state.invoices).filter((i) => i.status === 'open' || i.status === 'overdue');
  const terms = open.map((i) => state.customers[i.customerId]?.paymentTermDays ?? 21);
  const term = terms.length ? terms.reduce((a, b) => a + b, 0) / terms.length : 21;
  const out: ForecastDay[] = [];
  let bal = state.company.account.balance;
  let lowest = bal;
  let negativeOn: number | undefined;
  const today = Math.floor(state.time / MIN_PER_DAY);
  for (let d = 1; d <= days; d++) {
    const t = (today + d) * MIN_PER_DAY;
    let receipts = 0;
    for (const i of open) {
      const cu = state.customers[i.customerId];
      // fällig gilt am Fälligkeitstag, überfällige verteilt auf die nächsten 10 Tage
      const expect = Math.max(i.due, state.time + MIN_PER_DAY);
      const dayOf = i.due < state.time ? today + 1 + (Number.parseInt(i.id.replace(/\D/g, '') || '0', 10) % 10) : Math.floor(expect / MIN_PER_DAY);
      if (dayOf === today + d) receipts += Math.round(i.amount * (cu?.paymentReliability ?? 0.9));
    }
    // neue Rechnungen werden erst nach dem Zahlungsziel zu Geld
    const operations = Math.round((d > term ? revDay : 0) - varDay - rentDaily);
    const fixed = dayOfMonth(t) === 1 ? monthlyFixed : 0;
    bal += receipts + operations - fixed;
    if (bal < lowest) lowest = bal;
    if (bal < 0 && negativeOn === undefined) negativeOn = d;
    out.push({ day: d, t, balance: Math.round(bal), receipts, operations, fixed });
  }
  return { days: out, negativeOn, lowest: Math.round(lowest), monthlyFixed };
}

// ---------------------------------------------------------------- Engpass-Warnungen

export interface Bottleneck {
  id: string;
  level: 'warning' | 'danger' | 'info';
  text: string;
  /** Seite zum Beheben */
  page: 'personnel' | 'fleet' | 'dispatch' | 'finance' | 'orders' | 'analysis' | 'locations';
}

export function bottlenecks(state: GameState): Bottleneck[] {
  const out: Bottleneck[] = [];
  const crisis = state.company.crisis;
  if (crisis)
    out.push({
      id: 'crisis',
      level: 'danger',
      text: crisis.stage === 'notice' && crisis.deadline
        ? `Die Bank hat den Kontokorrentrahmen gekündigt: Bis ${formatDateTime(crisis.deadline)} muss die Liquidität wieder über ${formatMoney(CREDIT_LINE)} liegen, sonst droht die Insolvenz.`
        : `Warnung der Bank: Die Liquidität liegt unter dem Kontokorrentrahmen (${formatMoney(bankLiquidity(state))}). Hält das ${WARNING_DAYS} Tage an, kündigt die Bank.`,
      page: 'finance',
    });
  const vehicles = Object.values(state.vehicles);
  const drivers = Object.values(state.drivers);
  const ready = drivers.filter((d) => d.status !== 'sick' && d.status !== 'vacation' && d.status !== 'training' && d.leavesAt === undefined);
  if (vehicles.length > ready.length) out.push({ id: 'drivers', level: 'warning', text: `${vehicles.length - ready.length} ${vehicles.length - ready.length === 1 ? 'Fahrzeug steht' : 'Fahrzeuge stehen'} ohne einsatzfähigen Fahrer (${ready.length} Fahrer für ${vehicles.length} Fahrzeuge).`, page: 'personnel' });
  const service = vehicles.filter((v) => v.condition < 50 && v.status !== 'workshop');
  if (service.length) out.push({ id: 'service', level: service.some((v) => v.condition < 30) ? 'danger' : 'warning', text: `Wartung fällig: ${service.map((v) => `${v.plate} (${Math.round(v.condition)} %)`).slice(0, 3).join(', ')}${service.length > 3 ? ` und ${service.length - 3} weitere` : ''}.`, page: 'fleet' });
  const tired = drivers.filter((d) => d.hos && HOS_RULES.WEEKLY_DRIVE - d.hos.drivenWeek < 6 * 60);
  if (tired.length) out.push({ id: 'hos', level: 'info', text: `Wochenlenkzeit fast erreicht: ${tired.map((d) => d.name).slice(0, 3).join(', ')}${tired.length > 3 ? ` und ${tired.length - 3} weitere` : ''}.`, page: 'dispatch' });
  const types = new Set<string>(Object.values(state.trailers).map((t) => t.type));
  for (const v of vehicles) {
    const body = TRUCK_BY_ID[v.modelId]?.body;
    if (body) types.add(body);
  }
  const me = companyIdOf(state);
  const ownStuck = Object.values(state.orders).filter((o) => o.status === 'accepted' && orderOwner(o) === me && !o.subcontract && !o.handover && !types.has(o.trailerType));
  if (ownStuck.length) out.push({ id: 'trailer', level: 'warning', text: `${ownStuck.length} ${ownStuck.length === 1 ? 'angenommener Auftrag braucht' : 'angenommene Aufträge brauchen'} einen Auflieger, den du nicht hast (${[...new Set(ownStuck.map((o) => TRAILER_BY_TYPE[o.trailerType]?.name ?? o.trailerType))].join(', ')}).`, page: 'orders' });
  // Lager: Umschlag über der Leistung der Halle
  for (const l of state.company.locations) {
    const w = l.warehouse;
    if (!w || !l.facilities?.includes('warehouse') || w.demand <= throughput(l)) continue;
    out.push({ id: `warehouse-${l.id}`, level: w.demand > throughput(l) * 1.3 ? 'danger' : 'warning', text: `Lager ${CITY_BY_ID[l.cityId]?.name ?? ''} überlastet: ${w.demand} Paletten am Tag bei ${throughput(l)} Leistung. Lagerpersonal einstellen.`, page: 'locations' });
  }
  // Auslastung der letzten 14 Tage
  if (vehicles.length && state.time - (state.company.founded ?? 0) > 14 * MIN_PER_DAY) {
    const hours = recordsSince(state, 14).reduce((a, r) => a + (r.t - r.start) / 60, 0);
    const util = hours / (vehicles.length * 14 * 24);
    if (util < 0.5) out.push({ id: 'utilization', level: 'info', text: `Flotte in den letzten 14 Tagen nur zu ${Math.round(util * 100)} % im Einsatz. Mehr Aufträge annehmen oder Fahrzeuge abgeben.`, page: 'analysis' });
  }
  const fc = forecastLiquidity(state, 30);
  if (fc.negativeOn !== undefined) {
    const low = `${(fc.lowest / 100).toLocaleString('de-DE', { maximumFractionDigits: 0 })} €`;
    const text = state.company.account.balance < 0
      ? `Liquidität: Das Konto ist im Minus, laut Prognose bis auf ${low}.`
      : `Liquidität: Laut Prognose ist das Konto in ${fc.negativeOn} ${fc.negativeOn === 1 ? 'Tag' : 'Tagen'} im Minus (Tiefststand ${low}).`;
    out.push({ id: 'liquidity', level: 'danger', text, page: 'analysis' });
  }
  return out;
}

// ---------------------------------------------------------------- CSV

const csvCell = (v: unknown) => {
  const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v ?? '');
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
/** CSV mit Semikolon und Dezimalkomma (öffnet sich in deutschem Excel direkt richtig) */
export const toCsv = (rows: unknown[][]) => '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n';
const euro = (c: Money) => Math.round(c) / 100;

export const REPORT_LABEL: Record<ReportKind, string> = { customer: 'Kunde', vehicle: 'Fahrzeug', driver: 'Fahrer', route: 'Strecke' };

export function reportCsv(state: GameState, kind: ReportKind, days: number): string {
  const rows = report(state, kind, days);
  return toCsv([
    [REPORT_LABEL[kind], 'Touren', 'Lieferungen', 'verspätet', 'Erlös €', 'Kosten €', 'Deckungsbeitrag €', 'km beladen', 'km leer', 'Stunden im Einsatz'],
    ...rows.map((r) => [r.label, r.trips, r.deliveries, r.late, euro(r.revenue), euro(r.costs), euro(r.profit), r.kmLoaded, r.kmEmpty, r.hours]),
  ]);
}

export function tripsCsv(state: GameState, days: number): string {
  const rows = recordsSince(state, days);
  return toCsv([
    ['Ende', 'Fahrzeug', 'Fahrer', 'Von', 'Nach', 'Ladung', 'km beladen', 'km leer', 'Erlös €', 'Kraftstoff €', 'Maut €', 'Bahn/Fähre €', 'Lohn €', 'Fahrzeug €', 'Deckungsbeitrag €', 'geplant €'],
    ...rows.map((r) => {
      const o = r.orders[0] ? state.orders[r.orders[0].id] : undefined;
      return [
        formatDateTime(r.t), state.vehicles[r.vehicleId]?.plate ?? r.vehicleId, state.drivers[r.driverId]?.name ?? r.driverId,
        CITY_BY_ID[r.fromCityId]?.name ?? r.fromCityId, CITY_BY_ID[r.toCityId]?.name ?? r.toCityId, o ? (CARGO_BY_ID[o.cargoId]?.name ?? '') : '',
        r.kmLoaded, r.kmEmpty, euro(r.revenue), euro(r.fuel), euro(r.toll), euro(r.rail), euro(r.driver), euro(r.vehicle), euro(r.profit), r.planned === undefined ? '' : euro(r.planned),
      ];
    }),
  ]);
}

export function ledgerCsv(state: GameState): string {
  return toCsv([
    ['Zeit', 'Konto', 'Kategorie', 'Text', 'Betrag €'],
    ...state.ledger.map((l) => [formatDateTime(l.t), l.account, l.category, l.text, euro(l.amount)]),
  ]);
}
