// Häfen & Container (Paket E, Schritt E3).
// Große Häfen haben ein Containerterminal mit Wartezeit am Tor, Ereignissen und Zeitfenstern (Slots).
// Importcontainer kommen voll vom Terminal zum Empfänger und gehen leer zurück (Gratistage, danach Standgeld).
// Exportcontainer brauchen erst einen Leercontainer beim Verlader und müssen vor dem Annahmeschluss am Terminal sein.
//
// Der Terminalzustand ist eine reine Funktion aus Weltsamen, Ort und Zeit: Er belegt keinen Speicher und verbraucht
// keine Zufallszahlen der Simulation. So bleibt der Spielablauf für Firmen ohne Containerverkehr unverändert.

import type { SimContext } from './context.ts';
import { CARGO_BY_ID } from './data/catalog.ts';
import { CITY_BY_ID } from './data/cities.ts';
import { addLog, adjustSatisfaction, book, formatMoney } from './finance.ts';
import { haversineKm } from './geo.ts';
import { freshHos, simulateDriving } from './hos.ts';
import { baseRate } from './orders.ts';
import { newId } from './rng.ts';
import { companyIdOf, isMultiCompany } from './shard.ts';
import { MIN_PER_DAY, dayIndex, formatDateTime, month, weekday } from './time.ts';
import type { GameState, GameTime, Id, Money, Order } from './types.ts';

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

// ---------------------------------------------------------------- Terminals

export interface TerminalDef {
  cityId: string;
  name: string;
  /** Größe (Umschlag) – große Terminals sind öfter voll, aber robuster */
  size: number;
}

export const TERMINALS: TerminalDef[] = [
  { cityId: 'hamburg', name: 'Containerterminal Hamburg', size: 1.2 },
  { cityId: 'bremen', name: 'Containerterminal Bremerhaven', size: 1 },
  { cityId: 'rotterdam', name: 'Containerterminal Rotterdam', size: 1.4 },
  { cityId: 'antwerpen', name: 'Containerterminal Antwerpen', size: 1.3 },
  { cityId: 'lehavre', name: 'Containerterminal Le Havre', size: 1 },
  { cityId: 'felixstowe', name: 'Containerterminal Felixstowe', size: 1 },
  { cityId: 'danzig', name: 'Containerterminal Danzig', size: 0.9 },
  { cityId: 'genua', name: 'Containerterminal Genua', size: 0.9 },
  { cityId: 'triest', name: 'Containerterminal Triest', size: 0.8 },
  { cityId: 'koper', name: 'Containerterminal Koper', size: 0.8 },
  { cityId: 'barcelona', name: 'Containerterminal Barcelona', size: 1 },
  { cityId: 'valencia', name: 'Containerterminal Valencia', size: 1.1 },
  { cityId: 'algeciras', name: 'Containerterminal Algeciras', size: 1.1 },
  { cityId: 'athen', name: 'Containerterminal Piräus', size: 1.1 },
];
export const TERMINAL_BY_CITY: Record<string, TerminalDef> = Object.fromEntries(TERMINALS.map((t) => [t.cityId, t]));
export const TERMINAL_CITIES = new Set(TERMINALS.map((t) => t.cityId));
export const isTerminal = (cityId: string) => TERMINAL_CITIES.has(cityId);

/** Zeitfenster (Slot) am Terminal */
export const SLOT_MIN = 120;
/** Umbuchung eines verpassten Slots */
export const SLOT_REBOOK_FEE: Money = 60_00;
/** Gratistage für den Leercontainer nach der Zustellung */
export const FREE_DAYS = 5;
/** Standgeld (Detention) je angefangenem Tag nach den Gratistagen */
export const DETENTION_PER_DAY: Money = 75_00;
/** nach so vielen Tagen Überziehung gilt der Container als verloren */
export const DETENTION_MAX_DAYS = 21;
export const CONTAINER_LOST_FEE: Money = 2_800_00;
/** verpasstes Schiff: Strafe in Anteilen der Vergütung (zusätzlich zur Verspätungsstrafe) */
export const MISSED_SHIP_SHARE = 0.35;
/** Street-Turn: Leercontainer direkt zum Exporteur, Prämie der Reederei */
export const STREET_TURN_BONUS: Money = 90_00;
export const STREET_TURN_MAX_KM = 150;
/** Leergewicht eines 40-Fuß-Containers in t */
const EMPTY_T = 3.8;

/** deterministischer Zufallswert 0–1 aus Weltsamen und Schlüssel (ohne den Simulationszufall zu berühren) */
function hash01(seed: number, key: string): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  for (let i = 0; i < key.length; i++) {
    h = Math.imul(h ^ key.charCodeAt(i), 0x85ebca6b);
    h ^= h >>> 13;
  }
  h = Math.imul(h ^ (h >>> 16), 0xc2b2ae35);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

export type TerminalEventKind = 'ship' | 'strike' | 'storm';
export interface TerminalEvent {
  kind: TerminalEventKind;
  from: GameTime;
  until: GameTime;
  text: string;
}
const EVENT_TEXT: Record<TerminalEventKind, string> = {
  ship: 'Großschiff im Hafen – viele Container gleichzeitig',
  strike: 'Streik der Hafenarbeiter – Abfertigung stark eingeschränkt',
  storm: 'Sturm – Containerbrücken stehen still',
};
const EVENT_DAYS: Record<TerminalEventKind, number> = { ship: 2, strike: 3, storm: 1 };
const EVENT_WAIT: Record<TerminalEventKind, number> = { ship: 120, strike: 300, storm: 180 };

/** Ereignis am Terminal zum Zeitpunkt t (Großschiff, Streik, Sturm im Winterhalbjahr) */
export function terminalEvent(state: GameState, cityId: string, t: GameTime = state.time): TerminalEvent | undefined {
  const day = dayIndex(t);
  for (let d = day; d >= day - 3; d--) {
    const r = hash01(state.seed, `${cityId}:${d}:ev`);
    const start = d * MIN_PER_DAY;
    const winter = [0, 1, 2, 9, 10, 11].includes(month(start));
    const kind: TerminalEventKind | undefined = r < 0.035 ? 'ship' : r < 0.042 ? 'strike' : winter && r < 0.062 ? 'storm' : undefined;
    if (!kind) continue;
    const until = start + EVENT_DAYS[kind] * MIN_PER_DAY;
    if (t >= start && t < until) return { kind, from: start, until, text: EVENT_TEXT[kind] };
  }
  return undefined;
}

/** Auslastung des Terminals 0–1,3 (Tageswert, Wochentag, Tageszeit) */
export function terminalLoad(state: GameState, cityId: string, t: GameTime = state.time): number {
  const def = TERMINAL_BY_CITY[cityId];
  if (!def) return 0;
  const day = dayIndex(t);
  const wd = weekday(t);
  const base = 0.45 + 0.4 * hash01(state.seed, `${cityId}:${day}:load`) + (def.size - 1) * 0.15;
  const week = wd === 0 ? 0.1 : wd === 4 ? 0.08 : wd === 5 ? -0.15 : wd === 6 ? -0.3 : 0;
  const hour = Math.floor((t % MIN_PER_DAY) / 60);
  const daytime = hour >= 7 && hour < 17 ? 0.08 : hour >= 22 || hour < 5 ? -0.2 : 0;
  return Math.max(0.1, Math.min(1.3, base + week + daytime));
}

/** Wartezeit am Terminaltor in Minuten (30 min bis 6 h) */
export function terminalWait(state: GameState, cityId: string, t: GameTime = state.time): number {
  if (!isTerminal(cityId)) return 0;
  const ev = terminalEvent(state, cityId, t);
  const load = terminalLoad(state, cityId, t);
  const wait = 30 + Math.max(0, load - 0.55) * 360 + (ev ? EVENT_WAIT[ev.kind] : 0);
  return Math.round(Math.max(30, Math.min(360, wait)) / 5) * 5;
}

export interface TerminalStatus {
  def: TerminalDef;
  waitMin: number;
  load: number;
  level: 'green' | 'yellow' | 'red';
  event?: TerminalEvent;
}

export function terminalStatus(state: GameState, cityId: string, t: GameTime = state.time): TerminalStatus | undefined {
  const def = TERMINAL_BY_CITY[cityId];
  if (!def) return undefined;
  const waitMin = terminalWait(state, cityId, t);
  return { def, waitMin, load: terminalLoad(state, cityId, t), level: waitMin >= 180 ? 'red' : waitMin >= 90 ? 'yellow' : 'green', event: terminalEvent(state, cityId, t) };
}

export function allTerminals(state: GameState): TerminalStatus[] {
  return TERMINALS.map((d) => terminalStatus(state, d.cityId)!);
}

// ---------------------------------------------------------------- Containeraufträge

/** Börsenauftrag mit Containerladung am Terminal: Kreislauf und Slot festlegen (ohne Zufall) */
export function tagContainerOrder(order: Order): void {
  if (order.cargoId === 'container' && isTerminal(order.fromCityId)) {
    order.container = { phase: 'import', terminal: order.fromCityId };
    // Abholung im Zeitfenster von 2 Stunden
    order.pickupEnd = Math.min(order.pickupEnd, order.pickupStart + SLOT_MIN);
  } else if (order.cargoId === 'container_export' && isTerminal(order.toCityId)) {
    // Annahmeschluss des Schiffs = Liefertermin
    order.container = { phase: 'export', terminal: order.toCityId };
  }
}

/** Warum ein Containerauftrag (noch) nicht disponiert werden kann */
export function containerBlock(state: GameState, order: Order): string | undefined {
  const c = order.container;
  if (!c || c.phase !== 'export') return undefined;
  if (order.status === 'offered') return 'Exportcontainer: erst annehmen. Dann wird der Leercontainer zum Verlader gebracht (Gestellung), danach lässt sich der Export disponieren.';
  const pos = c.positionId ? state.orders[c.positionId] : undefined;
  if (pos && (pos.status === 'in_transit' || pos.status === 'delivered')) return undefined;
  if (c.ready) return undefined;
  return `Der Leercontainer ist noch nicht beim Verlader in ${CITY_BY_ID[order.fromCityId]?.name ?? ''}. Zuerst die Gestellung fahren (oder einen Leercontainer per Street-Turn umleiten).`;
}

function makeOrder(state: GameState, ctx: SimContext, x: { customerId: Id; from: string; to: string; pickupStart: GameTime; pickupEnd: GameTime; deliveryEnd?: GameTime; container: NonNullable<Order['container']>; payShare: number }): Order | null {
  const route = ctx.net.route(x.from, x.to);
  if (!route) return null;
  const cargo = CARGO_BY_ID.container;
  const transit = simulateDriving(freshHos(), route.driveMin).elapsed + cargo.loadMin * 2;
  const deliveryEnd = x.deliveryEnd ?? Math.ceil((x.pickupEnd + transit * 1.4 + 60) / 30) * 30;
  const payment = Math.max(80_00, Math.round((baseRate(state, cargo, route.km) * x.payShare) / 500) * 500);
  const id = newId(state, 'ord');
  const o: Order = {
    id,
    customerId: x.customerId,
    cargoId: 'container_empty',
    fromCityId: x.from,
    toCityId: x.to,
    weightT: EMPTY_T,
    trailerType: 'container',
    qualifications: [],
    pickupStart: x.pickupStart,
    pickupEnd: x.pickupEnd,
    deliveryEnd: Math.max(deliveryEnd, x.pickupEnd + transit + 30),
    distanceKm: route.km,
    payment,
    penaltyPerHour: Math.round((payment * 0.02) / 100) * 100,
    express: false,
    international: CITY_BY_ID[x.from].country !== CITY_BY_ID[x.to].country,
    container: x.container,
    status: 'accepted',
    ...(isMultiCompany(state) ? { companyId: companyIdOf(state) } : {}),
    offerExpires: x.pickupStart,
    created: state.time,
  };
  state.orders[id] = o;
  return o;
}

/** Leerrückgabe nach einem Import: vom Empfänger zurück zum Terminal, Gratistage bis freeUntil */
function createReturn(state: GameState, ctx: SimContext, imp: Order): void {
  const c = imp.container!;
  const at = imp.deliveredAt ?? state.time;
  const freeUntil = at + FREE_DAYS * MIN_PER_DAY;
  const ret = makeOrder(state, ctx, {
    customerId: imp.customerId, from: imp.toCityId, to: c.terminal, pickupStart: Math.ceil((at + 60) / 30) * 30, pickupEnd: freeUntil, deliveryEnd: freeUntil + 12 * 60,
    container: { phase: 'return', terminal: c.terminal, freeUntil, parentId: imp.id }, payShare: 0.4,
  });
  c.linkedId = ret?.id ?? 'none';
  if (ret)
    addLog(state, {
      level: 'info',
      category: 'order',
      text: `Leercontainer in ${CITY_BY_ID[imp.toCityId].name} muss bis ${formatDateTime(freeUntil)} zurück zum ${TERMINAL_BY_CITY[c.terminal].name} (danach ${formatMoney(DETENTION_PER_DAY)} Standgeld je Tag).`,
      ref: { kind: 'order', id: ret.id },
    });
}

/** Gestellung vor einem Export: Leercontainer vom Terminal-Depot zum Verlader */
function createPosition(state: GameState, ctx: SimContext, exp: Order): void {
  const c = exp.container!;
  const route = ctx.net.route(c.terminal, exp.fromCityId);
  if (!route) {
    c.ready = true;
    return;
  }
  const transit = simulateDriving(freshHos(), route.driveMin).elapsed + CARGO_BY_ID.container.loadMin * 2 + 30;
  const start = Math.ceil((state.time + 60) / 30) * 30;
  // spätestens zum Ladebeginn beim Verlader
  const latest = Math.max(start + transit + 60, exp.pickupStart);
  const pos = makeOrder(state, ctx, {
    customerId: exp.customerId, from: c.terminal, to: exp.fromCityId, pickupStart: start, pickupEnd: Math.max(start + SLOT_MIN, latest - transit), deliveryEnd: latest,
    container: { phase: 'position', terminal: c.terminal, parentId: exp.id }, payShare: 0.4,
  });
  c.positionId = pos?.id;
  if (!pos) c.ready = true;
  else
    addLog(state, {
      level: 'info',
      category: 'order',
      text: `Export ${CITY_BY_ID[exp.fromCityId].name} → ${TERMINAL_BY_CITY[c.terminal].name}: Leercontainer am Terminal holen und bis ${formatDateTime(latest)} zum Verlader bringen. Annahmeschluss des Schiffs ${formatDateTime(exp.deliveryEnd)}.`,
      ref: { kind: 'order', id: pos.id },
    });
}

/** Angenommener Export: Gestellung sofort anlegen */
export function onContainerAccepted(state: GameState, ctx: SimContext, order: Order): void {
  if (order.container?.phase === 'export' && !order.container.positionId && !order.container.ready) createPosition(state, ctx, order);
}

/** Ankunft am Terminal (Tor): für die Annahmeschluss-Prüfung merken */
export function onTerminalGate(order: Order, t: GameTime): void {
  if (order.container) order.container.gateIn = t;
}

/** Nach jeder Zustellung (eigene Fahrt oder Subunternehmer) */
export function onContainerDelivery(state: GameState, order: Order, lateMin: number): void {
  const c = order.container;
  if (!c) return;
  const cust = state.customers[order.customerId];
  if (c.phase === 'export' && lateMin > 0) {
    const fee = Math.round((order.payment * MISSED_SHIP_SHARE) / 100) * 100;
    book(state, 'company', -fee, 'penalty', `Schiff verpasst: Export ${CITY_BY_ID[order.fromCityId].name} → ${TERMINAL_BY_CITY[c.terminal]?.name ?? ''}`);
    if (cust) adjustSatisfaction(cust, -10);
    addLog(state, { level: 'danger', category: 'order', text: `Annahmeschluss verpasst: Der Exportcontainer aus ${CITY_BY_ID[order.fromCityId].name} geht erst mit dem nächsten Schiff – Strafe ${formatMoney(fee)}.`, ref: { kind: 'order', id: order.id } });
  }
  if (c.phase === 'return' && c.streetTurn) {
    book(state, 'company', STREET_TURN_BONUS, 'other', `Street-Turn: Leercontainer direkt zum Exporteur in ${CITY_BY_ID[order.toCityId].name}`);
    const exp = state.orders[c.streetTurn];
    if (exp?.container) exp.container.ready = true;
  }
}

/** Street-Turn: Leercontainer statt zurück zum Terminal direkt zu einem Exporteur in der Nähe */
export function streetTurnBlock(state: GameState, ret: Order | undefined, exp: Order | undefined): string | undefined {
  if (!ret || ret.container?.phase !== 'return' || ret.container.streetTurn) return 'Kein umleitbarer Leercontainer.';
  if (ret.status !== 'accepted') return 'Die Leerrückgabe ist schon disponiert.';
  if (!exp || exp.container?.phase !== 'export' || exp.container.ready) return 'Kein Export, der noch einen Leercontainer braucht.';
  if (exp.status !== 'accepted') return 'Der Export muss angenommen und noch nicht disponiert sein.';
  const pos = exp.container.positionId ? state.orders[exp.container.positionId] : undefined;
  if (pos && pos.status !== 'accepted') return 'Die Gestellung für diesen Export läuft schon.';
  const a = CITY_BY_ID[ret.fromCityId];
  const b = CITY_BY_ID[exp.fromCityId];
  if (haversineKm([a.lon, a.lat], [b.lon, b.lat]) > STREET_TURN_MAX_KM) return `Der Exporteur ist mehr als ${STREET_TURN_MAX_KM} km vom Leercontainer entfernt.`;
  return undefined;
}

/** passende Exporte für einen Street-Turn */
export function streetTurnCandidates(state: GameState, retId: Id): Order[] {
  const ret = state.orders[retId];
  return Object.values(state.orders).filter((o) => o.container?.phase === 'export' && !streetTurnBlock(state, ret, o));
}

export function streetTurn(state: GameState, ctx: SimContext, retId: Id, exportId: Id): Result {
  const ret = state.orders[retId];
  const exp = state.orders[exportId];
  const block = streetTurnBlock(state, ret, exp);
  if (block) return { ok: false, error: block };
  const route = ctx.net.route(ret.fromCityId, exp.fromCityId);
  if (!route && ret.fromCityId !== exp.fromCityId) return { ok: false, error: 'Keine Straßenroute zum Exporteur.' };
  const pos = exp.container!.positionId ? state.orders[exp.container!.positionId] : undefined;
  if (pos) pos.status = 'cancelled';
  if (ret.fromCityId === exp.fromCityId) {
    // gleicher Ort: Container bleibt einfach stehen
    ret.status = 'delivered';
    ret.deliveredAt = state.time;
    ret.container!.streetTurn = exp.id;
    exp.container!.positionId = ret.id;
    onContainerDelivery(state, ret, 0);
  } else {
    ret.toCityId = exp.fromCityId;
    ret.distanceKm = route!.km;
    ret.deliveryEnd = Math.max(ret.pickupStart + 120, exp.pickupStart);
    ret.pickupEnd = Math.min(ret.pickupEnd, ret.deliveryEnd - 60);
    ret.payment = Math.max(80_00, Math.round((baseRate(state, CARGO_BY_ID.container, route!.km) * 0.4) / 500) * 500);
    ret.container!.streetTurn = exp.id;
    exp.container!.positionId = ret.id;
  }
  addLog(state, { level: 'success', category: 'order', text: `Street-Turn: Der Leercontainer aus ${CITY_BY_ID[ret.fromCityId].name} geht direkt zum Exporteur in ${CITY_BY_ID[exp.fromCityId].name} – keine Leerfahrt zum Terminal, Prämie ${formatMoney(STREET_TURN_BONUS)}.` });
  return { ok: true };
}

// ---------------------------------------------------------------- Takt

/** Stündlich: Leerrückgaben nach Importen, Gestellungen für angenommene Exporte */
export function hourlyContainers(state: GameState, ctx: SimContext): void {
  const me = companyIdOf(state);
  for (const o of Object.values(state.orders)) {
    const c = o.container;
    if (!c || (o.companyId && o.companyId !== me)) continue;
    // Subunternehmer erledigen den ganzen Kreislauf selbst
    if (o.subcontract) {
      if (c.phase === 'import') c.linkedId ??= 'partner';
      if (c.phase === 'export' && !c.ready) {
        const pos = c.positionId ? state.orders[c.positionId] : undefined;
        if (pos?.status === 'accepted') pos.status = 'cancelled';
        c.ready = true;
      }
      continue;
    }
    if (c.phase === 'import' && o.status === 'delivered' && !c.linkedId) createReturn(state, ctx, o);
    else if (c.phase === 'export' && !c.positionId && !c.ready && (o.status === 'accepted' || o.status === 'planned')) createPosition(state, ctx, o);
  }
}

/** Täglich: Standgeld für überfällige Leercontainer, nach 21 Tagen gilt der Container als verloren */
export function dailyContainers(state: GameState): void {
  for (const o of Object.values(state.orders)) {
    const c = o.container;
    if (c?.phase !== 'return' || c.streetTurn || o.status === 'delivered' || o.status === 'cancelled' || c.freeUntil === undefined) continue;
    if (o.companyId && o.companyId !== companyIdOf(state)) continue;
    if (state.time < c.freeUntil) continue;
    const days = Math.ceil((state.time - c.freeUntil) / MIN_PER_DAY);
    if (days > DETENTION_MAX_DAYS) {
      if (o.status !== 'accepted') continue; // unterwegs: Standgeld läuft weiter bis zur Rückgabe
      o.status = 'cancelled';
      book(state, 'company', -CONTAINER_LOST_FEE, 'penalty', `Container nicht zurückgegeben (${CITY_BY_ID[o.fromCityId].name})`);
      const cust = state.customers[o.customerId];
      if (cust) adjustSatisfaction(cust, -12);
      addLog(state, { level: 'danger', category: 'order', text: `Der Leercontainer in ${CITY_BY_ID[o.fromCityId].name} wurde nie zurückgebracht – die Reederei stellt ${formatMoney(CONTAINER_LOST_FEE)} in Rechnung.` });
      continue;
    }
    c.detention = (c.detention ?? 0) + DETENTION_PER_DAY;
    book(state, 'company', -DETENTION_PER_DAY, 'penalty', `Standgeld Container ${CITY_BY_ID[o.fromCityId].name} (Tag ${days})`);
    if (days === 1)
      addLog(state, { level: 'warning', category: 'order', text: `Gratistage für den Leercontainer in ${CITY_BY_ID[o.fromCityId].name} sind vorbei – ab jetzt ${formatMoney(DETENTION_PER_DAY)} Standgeld je Tag.`, ref: { kind: 'order', id: o.id } });
  }
}
