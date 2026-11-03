// VehicleSystem / Fahrtsimulation: bewegt LKW minutengenau entlang der echten Straßengeometrie
// unter Berücksichtigung von Straßentyp, Verkehr, Lenk-/Ruhezeiten, Tankstopps, Be-/Entladung und Pannen.

import { fleetBreakdownFactor, fleetWearFactor } from './company.ts';
import { CITY_BY_ID } from './data/cities.ts';
import { CARGO_BY_ID, TRUCK_BY_ID } from './data/catalog.ts';
import type { SimContext } from './context.ts';
import { FUEL_RESERVE, FUEL_STOP_MIN, UNLOAD_MIN_FACTOR, consumptionPerKm, penaltyFor, speedFactor, startNextQueued, tollFactor, tripLoadFraction } from './dispatch.ts';
import { disruptionLabel, disruptionOnEdge, routeNow } from './disruptions.ts';
import { onContractDelivery } from './contracts.ts';
import { addLog, adjustSatisfaction, book, createInvoice, formatMoney } from './finance.ts';
import { drivableNow, hosDrive, hosRest, hosWork } from './hos.ts';
import { rand } from './rng.ts';
import { formatDuration, hourOfDay } from './time.ts';
import type { GameState, Order, Trip, TripActivity } from './types.ts';

export const STATIONARY_REST: TripActivity[] = ['break', 'rest_daily', 'rest_weekly', 'waiting', 'blocked'];
const BIG_CITY_POP = 1000;

export const ACTIVITY_LABEL: Record<TripActivity, string> = {
  driving: 'Unterwegs',
  break: 'Pause',
  rest_daily: 'Ruhezeit',
  rest_weekly: 'Wochenruhe',
  fueling: 'Tanken',
  loading: 'Beladung',
  unloading: 'Entladung',
  waiting: 'Wartet auf Ladefenster',
  blocked: 'Wartet an Sperrung',
  ferry: 'Fähre',
  breakdown: 'Defekt',
  done: 'Abgeschlossen',
};

function tlog(state: GameState, trip: Trip, text: string) {
  trip.log.push({ t: state.time, text });
  if (trip.log.length > 60) trip.log.shift();
}

/** Verkehrsfaktor: Berufsverkehr in Ballungsräumen verlangsamt. */
function trafficFactor(state: GameState, a: string, b: string): number {
  const h = hourOfDay(state.time);
  const rush = (h >= 7 && h < 9) || (h >= 16 && h < 19);
  if (!rush) return h >= 22 || h < 5 ? 1.03 : 1;
  const big = CITY_BY_ID[a].pop > BIG_CITY_POP || CITY_BY_ID[b].pop > BIG_CITY_POP;
  return big ? 0.8 : 0.93;
}

/** Eine Simulationsminute für eine Fahrt. */
export function tickTrip(state: GameState, ctx: SimContext, trip: Trip): void {
  if (trip.phase === 'done') return;
  const driver = state.drivers[trip.driverId];
  const vehicle = state.vehicles[trip.vehicleId];

  if (trip.activity !== 'driving' && trip.activity !== 'ferry') {
    trip.speedKmh = 0;
    trip.activityLeft -= 1;
    if (STATIONARY_REST.includes(trip.activity)) hosRest(driver.hos, 1);
    else hosWork(driver.hos, 1);
    if (trip.activityLeft <= 0) onActivityEnd(state, ctx, trip);
    return;
  }

  const leg = trip.legs[trip.legIndex];
  if (trip.progressKm >= leg.km) {
    onLegEnd(state, ctx, trip);
    return;
  }

  const loc = ctx.net.locate(leg.nodes, trip.progressKm)!;
  if (loc.edge.ferry) {
    trip.activity = 'ferry';
    trip.speedKmh = loc.edge.truckKmh;
    hosRest(driver.hos, 1);
    trip.progressKm = Math.min(leg.km, trip.progressKm + loc.edge.truckKmh / 60);
    return;
  }
  if (trip.activity === 'ferry') trip.activity = 'driving';

  // Verkehrsstörung auf der aktuellen Kante
  const dis = disruptionOnEdge(state, loc.edge);
  if (dis?.kind === 'closure') {
    trip.activity = 'blocked';
    trip.activityLeft = Math.max(1, dis.until - state.time);
    trip.speedKmh = 0;
    tlog(state, trip, `${disruptionLabel(dis)} – Wartezeit ca. ${formatDuration(trip.activityLeft)}`);
    return;
  }

  // Lenkzeit erschöpft → Pause/Ruhezeit
  if (drivableNow(driver.hos) <= 0) {
    const kind = driver.hos.requiredRestKind;
    trip.activity = kind === 'weekly' ? 'rest_weekly' : kind === 'daily' ? 'rest_daily' : 'break';
    trip.activityLeft = driver.hos.requiredRest;
    trip.speedKmh = 0;
    tlog(state, trip, `${ACTIVITY_LABEL[trip.activity]} (${formatDuration(trip.activityLeft)})`);
    return;
  }

  // Tankstopp
  const model = TRUCK_BY_ID[vehicle.modelId];
  if (vehicle.fuelL < model.tankL * FUEL_RESERVE) {
    const liters = model.tankL - vehicle.fuelL;
    const country = CITY_BY_ID[loc.reverse ? loc.edge.b : loc.edge.a].country;
    const priceFactor = country === 'LU' || country === 'PL' || country === 'CZ' || country === 'SK' || country === 'HU' ? 0.94 : country === 'CH' || country === 'NO' ? 1.12 : 1;
    const cost = Math.round(liters * state.market.diesel * priceFactor);
    vehicle.fuelL = model.tankL;
    trip.costs.fuel += cost;
    book(state, 'company', -cost, 'fuel', `Diesel ${Math.round(liters)} l (${vehicle.plate})`);
    trip.activity = 'fueling';
    trip.activityLeft = FUEL_STOP_MIN;
    trip.speedKmh = 0;
    tlog(state, trip, `Tankstopp: ${Math.round(liters)} l für ${formatMoney(cost)}`);
    return;
  }

  // Fahren
  const ecoFactor = 0.97 + driver.experience / 1000;
  const speed = Math.min(loc.edge.truckKmh * speedFactor(vehicle.modelId), 120) * trafficFactor(state, loc.edge.a, loc.edge.b) * ecoFactor * (dis?.speedFactor ?? 1);
  const km = Math.min(speed / 60, leg.km - trip.progressKm);
  trip.speedKmh = Math.round(speed);
  trip.progressKm += km;
  hosDrive(driver.hos, 1);

  const loadFrac = leg.loaded ? tripLoadFraction(state, trip) : 0;
  vehicle.fuelL = Math.max(0, vehicle.fuelL - km * consumptionPerKm(vehicle.modelId, loadFrac, driver.ecoDriving));
  vehicle.odometerKm += km;
  driver.kmDriven += km;
  if (leg.loaded) trip.kmLoaded += km;
  else trip.kmEmpty += km;

  // Maut anteilig
  const toll = (loc.edge.toll / Math.max(loc.edge.km, 0.1)) * km * tollFactor(vehicle.modelId);
  trip.costs.toll += toll;

  // Verschleiß – abhängig von Haltbarkeit, Beladung und Fahrweise
  const wear = (0.0006 / model.durability) * (1 + loadFrac * 0.3) * (1.1 - driver.ecoDriving / 500) * km * fleetWearFactor(state);
  vehicle.condition = Math.max(0, vehicle.condition - wear);
  if (trip.trailerId) {
    const tr = state.trailers[trip.trailerId];
    tr.condition = Math.max(0, tr.condition - wear * 0.6);
  }

  // Panne bei schlechtem Zustand
  if (vehicle.condition < 45) {
    const p = ((45 - vehicle.condition) / 45) * 0.0005 * km * state.difficulty.eventFactor * fleetBreakdownFactor(state);
    if (rand.chance(state, p)) breakdown(state, trip);
  }
}

function breakdown(state: GameState, trip: Trip) {
  const vehicle = state.vehicles[trip.vehicleId];
  const duration = rand.int(state, 3, 8) * 60;
  const cost = Math.round(rand.float(state, 450, 2400)) * 100;
  trip.activity = 'breakdown';
  trip.activityLeft = duration;
  trip.speedKmh = 0;
  vehicle.condition = Math.min(100, vehicle.condition + 12);
  vehicle.history.push({ t: state.time, text: 'Panne unterwegs – Reparatur durch Pannendienst', cost });
  book(state, 'company', -cost, 'repair', `Pannenhilfe ${vehicle.plate}`);
  tlog(state, trip, `Panne! Reparatur vor Ort (${formatDuration(duration)}, ${formatMoney(cost)})`);
  addLog(state, {
    level: 'danger',
    category: 'fleet',
    text: `Panne: LKW ${vehicle.plate} steht. Reparatur vor Ort dauert ca. ${formatDuration(duration)} und kostet ${formatMoney(cost)}.`,
    ref: { kind: 'trip', id: trip.id },
  });
}

function startDriving(trip: Trip) {
  trip.activity = 'driving';
  trip.activityLeft = 0;
}

/** Auftrag des aktuellen Halts (legs[i] führt zu stops[i]). */
function stopOrder(state: GameState, trip: Trip): Order | undefined {
  const stop = trip.stops?.[trip.legIndex];
  return stop ? state.orders[stop.orderId] : undefined;
}

function onActivityEnd(state: GameState, ctx: SimContext, trip: Trip) {
  switch (trip.activity) {
    case 'waiting': {
      startLoading(state, trip);
      return;
    }
    case 'loading': {
      const order = stopOrder(state, trip)!;
      order.status = 'in_transit';
      tlog(state, trip, `Beladen: ${CARGO_BY_ID[order.cargoId].name} (${order.weightT.toLocaleString('de-DE')} t)`);
      nextStop(state, ctx, trip);
      return;
    }
    case 'unloading':
      completeDelivery(state, trip, stopOrder(state, trip)!);
      nextStop(state, ctx, trip);
      return;
    default:
      startDriving(trip);
  }
}

/** Weiter zum nächsten Halt; die Route wird nach aktueller Verkehrslage neu bestimmt. */
function nextStop(state: GameState, ctx: SimContext, trip: Trip) {
  if (trip.legIndex + 1 >= trip.legs.length) {
    finishTrip(state, ctx, trip);
    return;
  }
  trip.legIndex++;
  trip.progressKm = 0;
  const leg = trip.legs[trip.legIndex];
  const r = routeNow(state, ctx, leg.nodes[0], leg.nodes[leg.nodes.length - 1]);
  if (r) trip.legs[trip.legIndex] = { nodes: r.nodes, km: r.km, loaded: leg.loaded };
  const stop = trip.stops![trip.legIndex];
  trip.phase = stop.kind === 'pickup' ? 'to_pickup' : 'to_delivery';
  startDriving(trip);
  tlog(state, trip, `${stop.kind === 'pickup' ? 'Fahrt zur Ladestelle' : 'Fahrt zum Empfänger'} ${CITY_BY_ID[stop.cityId].name}`);
}

function startLoading(state: GameState, trip: Trip) {
  const order = stopOrder(state, trip)!;
  const cargo = CARGO_BY_ID[order.cargoId];
  const delay = rand.chance(state, 0.15 * state.difficulty.eventFactor) ? rand.int(state, 30, 150) : 0;
  trip.phase = 'loading';
  trip.activity = 'loading';
  trip.activityLeft = cargo.loadMin + delay;
  tlog(state, trip, delay ? `Beladung (verzögert um ${delay} min)` : 'Beladung');
  if (delay >= 90)
    addLog(state, { level: 'warning', category: 'trip', text: `Verzögerte Beladung in ${CITY_BY_ID[order.fromCityId].name} (+${delay} min).`, ref: { kind: 'trip', id: trip.id } });
}

function onLegEnd(state: GameState, ctx: SimContext, trip: Trip) {
  const stop = trip.stops?.[trip.legIndex];
  if (!stop) {
    finishTrip(state, ctx, trip);
    return;
  }
  const order = state.orders[stop.orderId];
  if (stop.kind === 'pickup') {
    tlog(state, trip, `Ankunft Ladestelle ${CITY_BY_ID[order.fromCityId].name}`);
    if (state.time < order.pickupStart) {
      trip.phase = 'loading';
      trip.activity = 'waiting';
      trip.activityLeft = order.pickupStart - state.time;
    } else startLoading(state, trip);
    return;
  }
  trip.phase = 'unloading';
  trip.activity = 'unloading';
  trip.activityLeft = Math.round(CARGO_BY_ID[order.cargoId].loadMin * UNLOAD_MIN_FACTOR);
  tlog(state, trip, `Ankunft Empfänger ${CITY_BY_ID[order.toCityId].name} – Entladung`);
}

function completeDelivery(state: GameState, trip: Trip, order: Order) {
  const customer = state.customers[order.customerId];
  const driver = state.drivers[trip.driverId];
  const lateMin = Math.max(0, state.time - order.deliveryEnd);
  const penalty = penaltyFor(order, lateMin);
  order.status = 'delivered';
  order.deliveredAt = state.time;
  order.lateMinutes = lateMin;
  customer.deliveries++;
  const c = state.company;
  c.totals.deliveries++;
  c.totals.revenue += order.payment - penalty;
  if (lateMin > 0) {
    c.totals.lateDeliveries++;
    adjustSatisfaction(customer, -Math.min(25, 5 + (lateMin / 60) * 1.5));
    c.reputation = Math.max(0, c.reputation - 1.5);
    addLog(state, {
      level: 'warning',
      category: 'order',
      text: `Verspätete Lieferung an ${customer.name} (${formatDuration(lateMin)}). Vertragsstrafe ${formatMoney(penalty)}.`,
      ref: { kind: 'order', id: order.id },
    });
  } else {
    adjustSatisfaction(customer, order.express ? 4 : 3);
    c.reputation = Math.min(100, c.reputation + 0.4);
  }
  createInvoice(state, order, order.payment - penalty);
  onContractDelivery(state, order, lateMin);
  addLog(state, {
    level: lateMin > 0 ? 'warning' : 'success',
    category: 'order',
    text: `${driver.name} hat ${CARGO_BY_ID[order.cargoId].name} in ${CITY_BY_ID[order.toCityId].name} ${lateMin > 0 ? 'verspätet' : 'pünktlich'} zugestellt.`,
    ref: { kind: 'order', id: order.id },
  });
}

function finishTrip(state: GameState, ctx: SimContext, trip: Trip) {
  const leg = trip.legs[trip.legs.length - 1];
  const dest = leg.nodes[leg.nodes.length - 1];
  trip.phase = 'done';
  trip.activity = 'done';
  trip.finishedAt = state.time;
  trip.speedKmh = 0;
  // Maut wird gesammelt am Ende der Fahrt abgerechnet
  const toll = Math.round(trip.costs.toll);
  const start = trip.stops?.[0]?.cityId ?? trip.legs[0].nodes[0];
  book(state, 'company', -toll, 'toll', trip.stops ? `Maut Fahrt ${CITY_BY_ID[start].name} → ${CITY_BY_ID[dest].name}` : `Maut Überführung nach ${CITY_BY_ID[dest].name}`);
  trip.costs.toll = toll;
  state.company.totals.kmLoaded += trip.kmLoaded;
  state.company.totals.kmEmpty += trip.kmEmpty;
  if (!trip.stops) {
    addLog(state, { level: 'info', category: 'trip', text: `Überführung nach ${CITY_BY_ID[dest].name} abgeschlossen.`, ref: { kind: 'trip', id: trip.id } });
  }
  const driver = state.drivers[trip.driverId];
  if (driver) {
    driver.experience = Math.min(100, driver.experience + trip.kmLoaded / 4000);
    driver.status = 'idle';
    driver.tripId = undefined;
    driver.cityId = dest;
  }
  const vehicle = state.vehicles[trip.vehicleId];
  vehicle.status = 'idle';
  vehicle.tripId = undefined;
  vehicle.cityId = dest;
  if (trip.trailerId) {
    const tr = state.trailers[trip.trailerId];
    tr.status = 'idle';
    tr.tripId = undefined;
    tr.cityId = dest;
  }
  // Vorausplanung: nächsten Folgeauftrag direkt anschließen
  if (vehicle.queue?.length && driver) startNextQueued(state, ctx, vehicle.id, driver.id, trip.trailerId);
}

/** Fahrten älter als 30 Tage aus dem Zustand entfernen (Statistik bleibt in company.totals). */
export function pruneTrips(state: GameState) {
  for (const t of Object.values(state.trips)) if (t.phase === 'done' && state.time - (t.finishedAt ?? 0) > 30 * 1440) delete state.trips[t.id];
}
