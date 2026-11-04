// Premium-Aufträge: besonders lukrative Einzelaufträge, die nur von Hand disponiert werden können.
// – Schwertransport: Tieflader, Fahrer mit Schwertransport-Schein und eine Genehmigung der Behörde,
//   die Geld kostet und einige Zeit braucht.
// – Messe-Termin: enges Lieferfenster zur Messe, hohe Vergütung, harte Strafe bei Verspätung.
// Die KI-Disposition fasst Premium-Aufträge nicht an.

import type { SimContext } from './context.ts';
import { CITIES, CITY_BY_ID, type CityDef } from './data/cities.ts';
import { CARGO_BY_ID } from './data/catalog.ts';
import { addLog, book, formatMoney } from './finance.ts';
import { customerFor } from './generate.ts';
import { haversineKm } from './geo.ts';
import { freshHos, simulateDriving } from './hos.ts';
import { baseRate, pickDestination } from './orders.ts';
import { newId, rand } from './rng.ts';
import { MIN_PER_DAY, formatDateTime, weekday } from './time.ts';
import type { GameState, Id, Order } from './types.ts';

/** höchstens so viele offene Premium-Angebote */
export const PREMIUM_MAX_OPEN = 2;
/** Wahrscheinlichkeit je Tag für ein neues Angebot */
export const PREMIUM_CHANCE = 0.4;
/** Aufschlag auf die übliche Fracht */
export const PREMIUM_FACTOR = { heavy: 1.9, fair: 1.7 } as const;
/** Anteil der Vergütung, den die Genehmigung kostet */
export const PERMIT_COST_SHARE = 0.045;

const HEAVY_TITLES = ['Transformator', 'Industriepresse', 'Turbinengehäuse', 'Baggerteile', 'Werkzeugmaschine', 'Brückenträger', 'Kranbauteile'];
const FAIR_NAMES = ['Expo', 'Fachmesse Logistik', 'Industrietage', 'Baumesse', 'Food-Expo', 'Technikmesse', 'Möbelmesse'];

const ll = (c: CityDef): [number, number] => [c.lon, c.lat];
const round500 = (v: number) => Math.round(v / 500) * 500;

/** Abholung montags bis mittwochs: so fällt die Lieferung nicht in die Wochenend-Fahrverbote */
function onWeekday(t: number): number {
  while (weekday(t) > 2) t += MIN_PER_DAY;
  return t;
}

/** Herkunft in der Nähe der eigenen Standorte (Premium-Aufträge sollen erreichbar sein) */
function nearOrigin(state: GameState, ctx: SimContext, producers: string[]): CityDef | undefined {
  const anchors = state.company.locations.map((l) => CITY_BY_ID[l.cityId]);
  const pool = CITIES.filter(
    (c) => ctx.net.hasCity(c.id) && c.industries.some((i) => producers.includes(i)) && anchors.some((a) => haversineKm(ll(a), ll(c)) <= 500),
  );
  return rand.weighted(state, pool, (c) => Math.sqrt(c.pop));
}

/** Erzeugt ein Premium-Angebot; null, wenn gerade nichts Passendes entsteht. */
export function generatePremiumOrder(state: GameState, ctx: SimContext, kind: 'heavy' | 'fair'): Order | null {
  const cargo = CARGO_BY_ID[kind === 'heavy' ? 'machines' : rand.pick(state, ['piece', 'electronics', 'pallets'])];
  const origin = nearOrigin(state, ctx, cargo.producers);
  if (!origin) return null;
  let dest: CityDef | undefined;
  if (kind === 'heavy') dest = pickDestination(state, ctx, origin, cargo, 1200, 150);
  else {
    // Messen finden in großen Städten statt
    const fairs = CITIES.filter((c) => {
      if (c.pop < 900 || c.id === origin.id || !ctx.net.hasCity(c.id)) return false;
      const d = haversineKm(ll(origin), ll(c));
      return d >= 150 && d <= 1100;
    });
    dest = rand.weighted(state, fairs, (c) => Math.sqrt(c.pop));
  }
  if (!dest) return null;
  const route = ctx.net.route(origin.id, dest.id);
  if (!route) return null;
  const industry = origin.industries.find((i) => cargo.producers.includes(i)) ?? origin.industries[0];
  const customer = customerFor(state, origin.id, industry);

  const half = 30;
  const transit = simulateDriving(freshHos(), route.driveMin).elapsed + cargo.loadMin * 2;
  let pickupStart: number, pickupEnd: number, deliveryEnd: number;
  if (kind === 'heavy') {
    // Vorlauf für die Genehmigung
    pickupStart = onWeekday(Math.ceil((state.time + rand.int(state, 72, 120) * 60) / half) * half);
    pickupEnd = pickupStart + 8 * 60;
    deliveryEnd = Math.ceil((pickupEnd + transit * 1.4 + 120) / half) * half;
  } else {
    pickupStart = onWeekday(Math.ceil((state.time + rand.int(state, 24, 60) * 60) / half) * half);
    pickupEnd = pickupStart + 3 * 60;
    // knappes Lieferfenster: der Aufbau der Messe beginnt pünktlich
    deliveryEnd = Math.ceil((pickupEnd + transit * 1.08 + 60) / half) * half;
  }
  const weightT = kind === 'heavy' ? Math.round(rand.float(state, 30, 40) * 10) / 10 : Math.round(rand.float(state, 8, 18) * 10) / 10;
  const payment = round500(baseRate(state, cargo, route.km) * PREMIUM_FACTOR[kind] * rand.float(state, 0.95, 1.1));
  const title = kind === 'heavy' ? rand.pick(state, HEAVY_TITLES) : `${dest.name} ${rand.pick(state, FAIR_NAMES)}`;
  const id = newId(state, 'ord');
  const order: Order = {
    id,
    customerId: customer.id,
    cargoId: cargo.id,
    fromCityId: origin.id,
    toCityId: dest.id,
    weightT,
    trailerType: cargo.trailer,
    qualifications: cargo.qualifications,
    pickupStart,
    pickupEnd,
    deliveryEnd,
    distanceKm: route.km,
    payment,
    // Messe: zwei Stunden Verspätung kosten die halbe Vergütung (Deckel in penaltyFor)
    penaltyPerHour: kind === 'fair' ? Math.ceil((payment * 0.25) / 100) * 100 : Math.round((payment * 0.03) / 100) * 100,
    express: false,
    international: origin.country !== dest.country,
    premium:
      kind === 'heavy'
        ? { kind, title, permit: 'none', permitCost: round500(payment * PERMIT_COST_SHARE), permitHours: rand.int(state, 30, 60), reputation: 3 }
        : { kind, title, reputation: 3 },
    status: 'offered',
    offerExpires: Math.min(pickupStart - 12 * 60, state.time + rand.int(state, 24, 40) * 60),
    created: state.time,
  };
  state.orders[id] = order;
  return order;
}

/** Täglich: neue Premium-Angebote (ab dem dritten Spieltag). */
export function dailyPremium(state: GameState, ctx: SimContext): void {
  if (state.time - state.company.founded < 3 * MIN_PER_DAY) return;
  const open = Object.values(state.orders).filter((o) => o.premium && o.status === 'offered').length;
  if (open >= PREMIUM_MAX_OPEN || !rand.chance(state, PREMIUM_CHANCE)) return;
  const o = generatePremiumOrder(state, ctx, rand.chance(state, 0.4) ? 'heavy' : 'fair');
  if (o)
    addLog(state, {
      level: 'info',
      category: 'market',
      text: `Premium-Auftrag in der Börse: ${o.premium!.kind === 'heavy' ? `Schwertransport ${o.premium!.title}` : `Messe-Termin ${o.premium!.title}`}, ${CITY_BY_ID[o.fromCityId].name} → ${CITY_BY_ID[o.toCityId].name}, ${formatMoney(o.payment)}.`,
      ref: { kind: 'order', id: o.id },
    });
}

/** Stündlich: Genehmigungen werden erteilt. */
export function hourlyPremium(state: GameState): void {
  for (const o of Object.values(state.orders)) {
    const p = o.premium;
    if (p?.permit !== 'pending' || p.permitReady === undefined || state.time < p.permitReady) continue;
    p.permit = 'granted';
    addLog(state, { level: 'success', category: 'order', text: `Genehmigung für den Schwertransport ${p.title} erteilt – der Auftrag kann disponiert werden.`, ref: { kind: 'order', id: o.id } });
  }
}

/** Genehmigung beantragen; ein noch offenes Angebot wird damit angenommen. */
export function applyPermit(state: GameState, orderId: Id): { ok: true } | { ok: false; error: string } {
  const o = state.orders[orderId];
  const p = o?.premium;
  if (!o || p?.kind !== 'heavy') return { ok: false, error: 'Nur Schwertransporte brauchen eine Genehmigung.' };
  if (p.permit !== 'none') return { ok: false, error: p.permit === 'pending' ? 'Die Genehmigung ist bereits beantragt.' : 'Die Genehmigung liegt bereits vor.' };
  if (o.status === 'offered' && state.time >= o.offerExpires) return { ok: false, error: 'Angebot ist abgelaufen.' };
  if (o.status !== 'offered' && o.status !== 'accepted') return { ok: false, error: 'Auftrag ist nicht mehr offen.' };
  const cost = p.permitCost ?? 0;
  book(state, 'company', -cost, 'other', `Genehmigung Schwertransport ${p.title}`);
  p.permit = 'pending';
  p.permitReady = state.time + (p.permitHours ?? 48) * 60;
  if (o.status === 'offered') o.status = 'accepted';
  addLog(state, {
    level: 'info',
    category: 'order',
    text: `Genehmigung für ${p.title} beantragt (${formatMoney(cost)}), voraussichtlich erteilt am ${formatDateTime(p.permitReady)}.`,
    ref: { kind: 'order', id: o.id },
  });
  return { ok: true };
}

/** Hindernis für die Disposition (fehlende Genehmigung); null, wenn alles passt. */
export function premiumBlock(order: Order): string | null {
  const p = order.premium;
  if (p?.kind !== 'heavy' || p.permit === 'granted') return null;
  if (p.permit === 'pending') return `Die Genehmigung für den Schwertransport wird noch bearbeitet (bis ${formatDateTime(p.permitReady ?? 0)}).`;
  return 'Für den Schwertransport fehlt die Genehmigung – zuerst beantragen.';
}

/** Folgen der Zustellung: Ansehen bei Pünktlichkeit, Ärger bei Verspätung. */
export function onPremiumDelivery(state: GameState, order: Order, lateMin: number): void {
  const p = order.premium;
  if (!p) return;
  const c = state.company;
  if (lateMin <= 0) {
    c.reputation = Math.min(100, c.reputation + p.reputation);
    addLog(state, { level: 'success', category: 'order', text: `Premium-Auftrag ${p.title} pünktlich erledigt – das spricht sich herum (Ansehen +${p.reputation}).`, ref: { kind: 'order', id: order.id } });
  } else {
    const loss = p.kind === 'fair' ? 4 : 2;
    c.reputation = Math.max(0, c.reputation - loss);
    addLog(state, {
      level: 'danger',
      category: 'order',
      text: `Premium-Auftrag ${p.title} verspätet – ${p.kind === 'fair' ? 'der Messestand stand zur Eröffnung leer' : 'die Baustelle musste warten'} (Ansehen −${loss}).`,
      ref: { kind: 'order', id: order.id },
    });
  }
}
