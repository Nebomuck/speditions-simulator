// Rahmenverträge: Stammkunden (und Ausschreibungen) vergeben regelmäßige Touren zu festem Preis.
// Angenommene Verträge erzeugen ihre Touren selbst als angenommene Aufträge; nicht gefahrene Touren
// kosten eine Vertragsstrafe und Kundenzufriedenheit. Gute Erfüllung führt zu Verlängerungsangeboten.

import { deptCount } from './company.ts';
import { CITIES, CITY_BY_ID } from './data/cities.ts';
import { CARGOS, CARGO_BY_ID, TRUCK_BY_ID } from './data/catalog.ts';
import type { SimContext } from './context.ts';
import { addLog, adjustSatisfaction, book, formatMoney } from './finance.ts';
import { customerFor } from './generate.ts';
import { haversineKm } from './geo.ts';
import { freshHos, simulateDriving } from './hos.ts';
import { baseRate, pickDestination } from './orders.ts';
import { newId, rand } from './rng.ts';
import { MIN_PER_DAY, WEEKDAY_SHORT, dayIndex, formatDate, holidayName, weekday } from './time.ts';
import type { Contract, GameState, Id, Order } from './types.ts';

export const CONTRACT_OFFER_TARGET = 4;
/** Touren gelten als nicht gefahren, wenn sie so lange nach Ende des Ladefensters nicht disponiert sind */
const MISSED_AFTER_MIN = 6 * 60;
const PICKUP_WINDOW_H = 4;

export function contractWeekdays(c: Contract): string {
  return c.weekdays.map((d) => WEEKDAY_SHORT[d]).join(', ');
}

/** Erwarteter Umsatz über die ganze Laufzeit. */
export function contractVolume(c: Contract): number {
  return c.paymentPerTour * c.weekdays.length * c.weeks;
}

function openContractOrders(state: GameState, contractId: Id): Order[] {
  return Object.values(state.orders).filter((o) => o.contractId === contractId && (o.status === 'accepted' || o.status === 'planned' || o.status === 'in_transit'));
}

/** Neues Vertragsangebot: bevorzugt von zufriedenen Stammkunden, sonst als Ausschreibung aus der Region. */
export function generateContractOffer(state: GameState, ctx: SimContext, renewalOf?: Contract): Contract | null {
  if (renewalOf) {
    const c: Contract = {
      ...renewalOf,
      id: newId(state, 'con'),
      paymentPerTour: Math.round((renewalOf.paymentPerTour * 1.04) / 500) * 500,
      regular: true,
      status: 'offered',
      offerExpires: state.time + 5 * MIN_PER_DAY,
      start: undefined,
      end: undefined,
      scheduledThrough: undefined,
      stats: { tours: 0, delivered: 0, late: 0, missed: 0 },
    };
    state.contracts[c.id] = c;
    return c;
  }
  const regulars = Object.values(state.customers).filter((c) => c.deliveries >= 2 && c.satisfaction >= 55);
  const regular = regulars.length > 0 && rand.chance(state, 0.7);
  let customer = regular ? rand.weighted(state, regulars, (c) => c.satisfaction * Math.sqrt(c.deliveries)) : undefined;
  // Ladungsarten, die die eigene Flotte fahren kann, werden bevorzugt angeboten
  const spaces = new Set<string>(Object.values(state.trailers).map((t) => t.type));
  for (const v of Object.values(state.vehicles)) {
    const body = TRUCK_BY_ID[v.modelId]?.body;
    if (body) spaces.add(body);
  }
  const weight = (g: (typeof CARGOS)[number]) => g.freq * (spaces.has(g.trailer) ? 4 : 1);
  const cargo = customer
    ? rand.weighted(state, CARGOS.filter((g) => (g.producers as string[]).includes(customer!.industry)), weight)
    : rand.weighted(state, CARGOS, weight);
  if (!cargo) return null;
  let origin = customer ? CITY_BY_ID[customer.cityId] : undefined;
  if (!origin) {
    // Ausschreibung: Verlader im Umkreis der eigenen Standorte
    const anchors = state.company.locations.map((l) => CITY_BY_ID[l.cityId]);
    const near = CITIES.filter((c) => ctx.net.hasCity(c.id) && c.industries.some((i) => cargo.producers.includes(i)) && anchors.some((a) => haversineKm([a.lon, a.lat], [c.lon, c.lat]) <= 400));
    origin = rand.weighted(state, near, (c) => Math.sqrt(c.pop));
    if (!origin) return null;
    customer = customerFor(state, origin.id, origin.industries.find((i) => cargo.producers.includes(i))!);
  }
  const dest = pickDestination(state, ctx, origin, cargo, 800, 80);
  const route = dest ? ctx.net.route(origin.id, dest.id) : null;
  if (!dest || !route) return null;
  const perWeek = rand.weighted(state, [1, 2, 3], (n) => (n === 1 ? 3 : n === 2 ? 3 : 2))!;
  const patterns: Record<number, number[][]> = { 1: [[0], [1], [2], [3], [4]], 2: [[0, 3], [1, 4], [0, 2], [1, 3]], 3: [[0, 2, 4]] };
  const weekdays = rand.pick(state, patterns[perWeek]);
  const factor = regular ? 1 + (customer!.satisfaction - 55) / 300 : 0.94;
  const paymentPerTour = Math.round((baseRate(state, cargo, route.km) * factor) / 500) * 500;
  const c: Contract = {
    id: newId(state, 'con'),
    customerId: customer!.id,
    cargoId: cargo.id,
    fromCityId: origin.id,
    toCityId: dest.id,
    trailerType: cargo.trailer,
    qualifications: cargo.qualifications,
    weightT: Math.round(((cargo.weight[0] + cargo.weight[1]) / 2) * 10) / 10,
    distanceKm: route.km,
    weekdays,
    pickupHour: rand.int(state, 6, 14),
    paymentPerTour,
    penaltyMissed: Math.round((paymentPerTour * 0.3) / 100) * 100,
    weeks: rand.pick(state, [4, 8, 12]),
    regular,
    status: 'offered',
    offerExpires: state.time + rand.int(state, 3, 6) * MIN_PER_DAY,
    stats: { tours: 0, delivered: 0, late: 0, missed: 0 },
  };
  state.contracts[c.id] = c;
  addLog(state, {
    level: 'info',
    category: 'order',
    text: `${regular ? 'Stammkunde' : 'Ausschreibung'}: ${customer!.name} bietet einen Rahmenvertrag ${origin.name} → ${dest.name} an (${weekdays.length}× pro Woche, ${c.weeks} Wochen, je ${formatMoney(paymentPerTour)}).`,
  });
  return c;
}

/** Touren eines Vertrags für einen Tag als angenommene Aufträge anlegen. */
function scheduleDay(state: GameState, ctx: SimContext, c: Contract, day: number) {
  if (c.scheduledThrough !== undefined && day <= c.scheduledThrough) return;
  c.scheduledThrough = day;
  const t0 = day * MIN_PER_DAY;
  if (c.start === undefined || c.end === undefined || t0 < c.start || t0 >= c.end) return;
  if (!c.weekdays.includes(weekday(t0)) || holidayName(t0)) return;
  const route = ctx.net.route(c.fromCityId, c.toCityId);
  if (!route) return;
  const cargo = CARGO_BY_ID[c.cargoId];
  const pickupStart = t0 + c.pickupHour * 60;
  const pickupEnd = pickupStart + PICKUP_WINDOW_H * 60;
  const transit = simulateDriving(freshHos(), route.driveMin).elapsed + cargo.loadMin * 2;
  const deliveryEnd = Math.ceil((pickupEnd + transit * 1.4 + 60) / 30) * 30;
  const id = newId(state, 'ord');
  state.orders[id] = {
    id,
    customerId: c.customerId,
    cargoId: c.cargoId,
    fromCityId: c.fromCityId,
    toCityId: c.toCityId,
    weightT: c.weightT,
    trailerType: c.trailerType,
    qualifications: c.qualifications,
    pickupStart,
    pickupEnd,
    deliveryEnd,
    distanceKm: route.km,
    payment: c.paymentPerTour,
    penaltyPerHour: Math.round((c.paymentPerTour * 0.02) / 100) * 100,
    express: false,
    international: CITY_BY_ID[c.fromCityId].country !== CITY_BY_ID[c.toCityId].country,
    contractId: c.id,
    status: 'accepted',
    offerExpires: pickupStart,
    created: state.time,
  };
  c.stats.tours++;
  addLog(state, {
    level: 'info',
    category: 'order',
    text: `Vertragstour ${CITY_BY_ID[c.fromCityId].name} → ${CITY_BY_ID[c.toCityId].name} am ${formatDate(pickupStart)} ab ${String(c.pickupHour).padStart(2, '0')}:00 – bitte disponieren.`,
    ref: { kind: 'order', id },
  });
}

export function acceptContract(state: GameState, ctx: SimContext, contractId: Id): { ok: true } | { ok: false; error: string } {
  const c = state.contracts[contractId];
  if (!c || c.status !== 'offered') return { ok: false, error: 'Vertragsangebot nicht mehr verfügbar.' };
  if (state.time >= c.offerExpires) return { ok: false, error: 'Das Angebot ist abgelaufen.' };
  const active = Object.values(state.contracts).filter((x) => x.status === 'active').length;
  const maxActive = Math.max(2, Object.keys(state.vehicles).length * 2);
  if (active >= maxActive) return { ok: false, error: `Mit der aktuellen Flotte sind höchstens ${maxActive} laufende Verträge möglich.` };
  const tomorrow = dayIndex(state.time) + 1;
  c.status = 'active';
  c.start = tomorrow * MIN_PER_DAY;
  c.end = c.start + c.weeks * 7 * MIN_PER_DAY;
  scheduleDay(state, ctx, c, tomorrow);
  const cust = state.customers[c.customerId];
  addLog(state, {
    level: 'success',
    category: 'order',
    text: `Rahmenvertrag mit ${cust?.name ?? 'Kunde'} geschlossen: ${CITY_BY_ID[c.fromCityId].name} → ${CITY_BY_ID[c.toCityId].name}, ${contractWeekdays(c)}, bis ${formatDate(c.end)}.`,
  });
  return { ok: true };
}

export function cancelContract(state: GameState, contractId: Id): { ok: true; fee: number } | { ok: false; error: string } {
  const c = state.contracts[contractId];
  if (!c || c.status !== 'active') return { ok: false, error: 'Kein laufender Vertrag.' };
  const fee = c.penaltyMissed * 3;
  book(state, 'company', -fee, 'penalty', 'Vorzeitige Kündigung Rahmenvertrag');
  for (const o of openContractOrders(state, c.id)) if (o.status === 'accepted') o.status = 'cancelled';
  c.status = 'cancelled';
  c.end = state.time;
  const cust = state.customers[c.customerId];
  if (cust) adjustSatisfaction(cust, -20);
  state.company.reputation = Math.max(0, state.company.reputation - 3);
  addLog(state, { level: 'warning', category: 'order', text: `Rahmenvertrag mit ${cust?.name ?? 'Kunde'} vorzeitig gekündigt – Strafe ${formatMoney(fee)}.` });
  return { ok: true, fee };
}

/** Aufgerufen nach jeder Zustellung. */
export function onContractDelivery(state: GameState, order: Order, lateMin: number) {
  const c = order.contractId ? state.contracts[order.contractId] : undefined;
  if (!c) return;
  c.stats.delivered++;
  if (lateMin > 0) c.stats.late++;
  else {
    const cust = state.customers[c.customerId];
    if (cust) adjustSatisfaction(cust, 1);
  }
}

/** Stündlich: nicht disponierte Vertragstouren als verpasst werten. */
export function hourlyContracts(state: GameState): void {
  for (const o of Object.values(state.orders)) {
    if (!o.contractId || o.status !== 'accepted' || state.time < o.pickupEnd + MISSED_AFTER_MIN) continue;
    const c = state.contracts[o.contractId];
    o.status = 'cancelled';
    if (!c) continue;
    c.stats.missed++;
    book(state, 'company', -c.penaltyMissed, 'penalty', `Vertragsstrafe: Tour ${CITY_BY_ID[o.fromCityId].name} → ${CITY_BY_ID[o.toCityId].name} nicht gefahren`);
    const cust = state.customers[c.customerId];
    if (cust) adjustSatisfaction(cust, -8);
    state.company.reputation = Math.max(0, state.company.reputation - 1);
    addLog(state, {
      level: 'danger',
      category: 'order',
      text: `Vertragstour ${CITY_BY_ID[o.fromCityId].name} → ${CITY_BY_ID[o.toCityId].name} wurde nicht gefahren – Strafe ${formatMoney(c.penaltyMissed)}, ${cust?.name ?? 'der Kunde'} ist verärgert.`,
      ref: { kind: 'order', id: o.id },
    });
  }
}

/** Täglich: Touren für morgen anlegen, Verträge abschließen, Angebote erneuern. */
export function dailyContracts(state: GameState, ctx: SimContext): void {
  state.contracts ??= {};
  const tomorrow = dayIndex(state.time) + 1;
  for (const c of Object.values(state.contracts)) {
    if (c.status === 'offered' && state.time >= c.offerExpires) c.status = 'expired';
    if (c.status !== 'active') continue;
    scheduleDay(state, ctx, c, tomorrow);
    if (state.time >= c.end! && openContractOrders(state, c.id).length === 0) {
      c.status = 'completed';
      const cust = state.customers[c.customerId];
      const quota = c.stats.tours ? (c.stats.delivered - c.stats.late * 0.5) / c.stats.tours : 1;
      if (quota >= 0.85) {
        if (cust) adjustSatisfaction(cust, 8);
        state.company.reputation = Math.min(100, state.company.reputation + 2);
        const renewal = generateContractOffer(state, ctx, c);
        addLog(state, {
          level: 'success',
          category: 'order',
          text: `Rahmenvertrag mit ${cust?.name ?? 'Kunde'} erfüllt (${c.stats.delivered}/${c.stats.tours} Touren). Der Kunde bietet eine Verlängerung zu ${formatMoney(renewal!.paymentPerTour)} je Tour an.`,
        });
      } else {
        if (cust && quota < 0.7) adjustSatisfaction(cust, -10);
        addLog(state, { level: 'warning', category: 'order', text: `Rahmenvertrag mit ${cust?.name ?? 'Kunde'} beendet – nur ${c.stats.delivered} von ${c.stats.tours} Touren pünktlich bzw. gefahren. Keine Verlängerung.` });
      }
    }
  }
  // alte Verträge aufräumen
  for (const c of Object.values(state.contracts))
    if ((c.status === 'expired' && state.time - c.offerExpires > 7 * MIN_PER_DAY) || ((c.status === 'completed' || c.status === 'cancelled') && state.time - (c.end ?? 0) > 60 * MIN_PER_DAY)) delete state.contracts[c.id];
  const offers = Object.values(state.contracts).filter((c) => c.status === 'offered').length;
  if (offers < CONTRACT_OFFER_TARGET + deptCount(state, 'sales') && rand.chance(state, 0.5)) generateContractOffer(state, ctx);
}
