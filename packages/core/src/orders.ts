// OrderSystem: dynamische Transportbörse auf Basis eines abstrakten Warenflussmodells.
// Aufträge entstehen dort, wo Branchen Güter erzeugen, und gehen dorthin, wo Branchen sie benötigen
// (Gravitationsmodell: Nachfrage ~ Größe / Entfernung). Saison, Wochentag, Feiertage und
// Marktnachfrage beeinflussen das Volumen.

import { CITIES, CITY_BY_ID, type CityDef } from './data/cities.ts';
import { CARGOS, CARGO_BY_ID, type CargoDef } from './data/catalog.ts';
import type { SimContext } from './context.ts';
import { customerFor } from './generate.ts';
import { haversineKm } from './geo.ts';
import { freshHos, simulateDriving } from './hos.ts';
import { rand, newId } from './rng.ts';
import { MIN_PER_DAY, holidayName, month, weekday } from './time.ts';
import type { GameState, Order } from './types.ts';

const ll = (c: CityDef): [number, number] => [c.lon, c.lat];

/** Ziel-Größe der Börse (offene Angebote). */
export const MARKET_TARGET = 320;
/** Anteil der Aufträge aus dem Einzugsgebiet der eigenen Standorte/Fahrzeuge. */
const LOCAL_SHARE = 0.45;
const LOCAL_RADIUS_KM = 450;
/** Anteil Teilladungen bei Ladungsarten, die auf Solo-LKW/Transporter passen */
export const PARTIAL_SHARE = 0.3;
const PARTIAL_TRAILERS = ['curtain', 'box', 'reefer'];
/** Teilladungen gehen überwiegend in die Region (Verteilerverkehr) */
const PARTIAL_MAX_KM = 650;

export function orderVolumeFactor(state: GameState): number {
  const wd = weekday(state.time);
  let f = wd === 5 ? 0.45 : wd === 6 ? 0.12 : 1;
  if (holidayName(state.time)) f *= 0.2;
  return f * state.market.demand;
}

function cargoWeight(state: GameState, c: CargoDef) {
  return c.freq * (c.season ? c.season[month(state.time)] : 1);
}

function activeCities(state: GameState): Set<string> {
  const s = new Set<string>();
  for (const l of state.company.locations) s.add(l.cityId);
  for (const v of Object.values(state.vehicles)) s.add(v.cityId);
  for (const t of Object.values(state.trips)) {
    if (t.phase === 'done') continue;
    const leg = t.legs[t.legs.length - 1];
    s.add(leg.nodes[leg.nodes.length - 1]);
  }
  return s;
}

/** Zielort nach Gravitationsmodell: Städte mit passender Branche, gewichtet nach Größe und Entfernung. */
export function pickDestination(state: GameState, ctx: SimContext, origin: CityDef, cargo: CargoDef, maxKm: number, minKm = 60): CityDef | undefined {
  const dests = CITIES.filter((c) => c.id !== origin.id && ctx.net.hasCity(c.id));
  return rand.weighted(state, dests, (c) => {
    const match = c.industries.filter((i) => cargo.consumers.includes(i)).length;
    if (match === 0 && !(cargo.consumers.includes('retail') && c.pop > 800)) return 0;
    const d = haversineKm(ll(origin), ll(c));
    if (d < minKm || d > maxKm) return 0;
    return ((Math.pow(c.pop, 0.5) * (1 + match)) / Math.pow(d, 1.05)) * 100;
  });
}

/** Grundvergütung einer Tour (ohne Zufall/Express), Grundlage für Börse und Rahmenverträge. */
export function baseRate(state: GameState, cargo: CargoDef, km: number): number {
  const distanceFactor = km < 250 ? 1.25 : km < 500 ? 1.08 : 1;
  const fuelSurcharge = state.market.diesel / 155;
  return (cargo.ratePerKm * km * distanceFactor * (0.75 + 0.25 * fuelSurcharge) + cargo.baseFee) * state.difficulty.rateFactor * state.market.demand ** 0.5;
}

/** Erzeugt einen wirtschaftlich plausiblen Auftrag. Liefert null, wenn kein sinnvoller Auftrag entsteht. */
export function generateOrder(state: GameState, ctx: SimContext, opts: { local?: boolean } = {}): Order | null {
  const cargo = rand.weighted(state, CARGOS, (c) => cargoWeight(state, c))!;
  let origins = CITIES.filter((c) => c.industries.some((i) => cargo.producers.includes(i)) && ctx.net.hasCity(c.id));
  if (opts.local) {
    const anchors = [...activeCities(state)].map((id) => CITY_BY_ID[id]);
    origins = origins.filter((o) => anchors.some((a) => haversineKm(ll(a), ll(o)) <= LOCAL_RADIUS_KM));
  }
  const origin = rand.weighted(state, origins, (c) => Math.pow(c.pop, 0.55));
  if (!origin) return null;
  const partial = PARTIAL_TRAILERS.includes(cargo.trailer) && rand.chance(state, PARTIAL_SHARE);
  const dest = pickDestination(state, ctx, origin, cargo, partial ? PARTIAL_MAX_KM : 2300);
  if (!dest) return null;
  const route = ctx.net.route(origin.id, dest.id);
  if (!route) return null;

  const industry = origin.industries.find((i) => cargo.producers.includes(i))!;
  const customer = customerFor(state, origin.id, industry);
  const express = rand.chance(state, cargo.id === 'autoparts' ? 0.35 : 0.08);
  const weightT = partial
    ? Math.round(rand.weighted(state, [0.6, 1, 2, 3, 5, 7.5], (w) => (w <= 1 ? 2 : w <= 3 ? 3 : 1.5))! * rand.float(state, 0.8, 1) * 10) / 10
    : Math.round(rand.float(state, cargo.weight[0], cargo.weight[1]) * 10) / 10;

  // Zeitfenster
  const half = 30;
  const leadMin = express ? rand.int(state, 2, 10) * 60 : rand.int(state, 4, 48) * 60;
  const pickupStart = Math.ceil((state.time + leadMin) / half) * half;
  const pickupEnd = pickupStart + rand.int(state, 2, 8) * 60;
  const transit = simulateDriving(freshHos(), route.driveMin).elapsed + cargo.loadMin * 2;
  const slack = express ? rand.float(state, 1.08, 1.2) : rand.float(state, 1.2, 1.7);
  const deliveryEnd = Math.ceil((pickupEnd + transit * slack + 60) / half) * half;

  // Vergütung; zufriedene Stammkunden zahlen etwas besser
  const loyalty = customer.deliveries > 0 ? ((customer.satisfaction - 50) / 50) * 0.05 : 0;
  const priceFactor = 1 + (0.5 - customer.priceSensitivity) * 0.12 + loyalty;
  let payment = baseRate(state, cargo, route.km) * priceFactor * rand.float(state, 0.9, 1.12);
  if (express) payment *= 1.3;
  // Teilladung: weniger Gesamterlös, aber höherer Preis je Tonne
  if (partial) payment *= 0.5 + 0.5 * Math.min(1, weightT / 24);
  payment = Math.round(payment / 500) * 500;

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
    penaltyPerHour: Math.round((payment * (express ? 0.04 : 0.02)) / 100) * 100,
    express,
    international: origin.country !== dest.country,
    ...(partial ? { partial: true } : {}),
    status: 'offered',
    offerExpires: Math.min(pickupStart, state.time + rand.int(state, 4, 30) * 60),
    created: state.time,
  };
  state.orders[id] = order;
  return order;
}

/** Stündliche Marktpflege: Angebote verfallen, neue entstehen. */
export function updateOrderMarket(state: GameState, ctx: SimContext, initial = false): void {
  let offered = 0;
  for (const o of Object.values(state.orders)) {
    if (o.status === 'offered') {
      if (state.time >= o.offerExpires) o.status = 'expired';
      else offered++;
    }
  }
  // Historie begrenzen: abgelaufene Angebote nach 1 Tag, erledigte nach 45 Tagen entfernen
  for (const o of Object.values(state.orders)) {
    if (o.status === 'expired' && state.time - o.offerExpires > MIN_PER_DAY) delete state.orders[o.id];
    else if ((o.status === 'delivered' || o.status === 'cancelled') && state.time - (o.deliveredAt ?? o.created) > 45 * MIN_PER_DAY) delete state.orders[o.id];
  }
  const target = MARKET_TARGET * (initial ? 1 : orderVolumeFactor(state));
  const deficit = Math.max(0, target - offered);
  const n = initial ? deficit : Math.min(deficit, Math.round(deficit / 6 + rand.float(state, 0, 3)));
  for (let i = 0; i < n; i++) generateOrder(state, ctx, { local: rand.chance(state, LOCAL_SHARE) });
}

export function cargoOf(order: Order) {
  return CARGO_BY_ID[order.cargoId];
}
