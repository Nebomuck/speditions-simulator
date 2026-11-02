// DispatchSystem: Planung, Kalkulation und Konfliktprüfung von Fahrten.

import { CITY_BY_ID } from './data/cities.ts';
import { CARGO_BY_ID, TRAILER_BY_TYPE, TRUCK_BY_ID } from './data/catalog.ts';
import type { SimContext } from './context.ts';
import { EMPLOYER_COST_FACTOR, addLog, formatMoney } from './finance.ts';
import { REST_KIND_LABEL, simulateDriving } from './hos.ts';
import { newId } from './rng.ts';
import { MIN_PER_DAY, formatDateTime, formatDuration } from './time.ts';
import type { GameState, Id, Money, Order, Trip, TripLeg } from './types.ts';

export interface DispatchInput {
  orderId: Id;
  driverId: Id;
  vehicleId: Id;
  trailerId: Id;
}

export interface TripEstimate {
  emptyKm: number;
  loadedKm: number;
  driveMin: number;
  restMin: number;
  pickupEta: number;
  deliveryEta: number;
  lateMin: number;
  fuelL: number;
  fuelCost: Money;
  toll: Money;
  driverCost: Money;
  vehicleCost: Money;
  totalCost: Money;
  revenue: Money;
  profit: Money;
  /** Tankstopps unterwegs */
  fuelStops: number;
}

export interface Issue {
  level: 'error' | 'warning';
  code: string;
  text: string;
}

export const FUEL_STOP_MIN = 25;
export const FUEL_RESERVE = 0.15;
export const UNLOAD_MIN_FACTOR = 0.8;

/** Verbrauch l/km abhängig von Modell, Beladung und Fahrweise. */
export function consumptionPerKm(modelId: string, loadFrac: number, ecoDriving: number): number {
  const m = TRUCK_BY_ID[modelId];
  return ((m.consumption * (1 + 0.35 * loadFrac) * (1.08 - 0.16 * (ecoDriving / 100))) / 100);
}

export function penaltyFor(order: Order, lateMin: number): Money {
  if (lateMin <= 0) return 0;
  return Math.min(Math.ceil(lateMin / 60) * order.penaltyPerHour, Math.round(order.payment * 0.5));
}

/** Vollständige Vorkalkulation einer Fahrt inkl. Lenk-/Ruhezeiten, Wartezeit und Kosten. */
export function estimateTrip(state: GameState, ctx: SimContext, input: DispatchInput): TripEstimate | null {
  const order = state.orders[input.orderId];
  const driver = state.drivers[input.driverId];
  const vehicle = state.vehicles[input.vehicleId];
  if (!order || !driver || !vehicle) return null;
  const toPickup = ctx.net.route(vehicle.cityId, order.fromCityId);
  const loaded = ctx.net.route(order.fromCityId, order.toCityId);
  if (!toPickup || !loaded) return null;
  const cargo = CARGO_BY_ID[order.cargoId];
  const hos = { ...driver.hos };

  let t = state.time;
  let restMin = 0;
  // ausstehende Ruhezeit zuerst
  if (hos.requiredRest > 0) {
    const r = simulateDriving(hos, 0.0001);
    t += r.elapsed;
    restMin += r.restMin;
  }
  const e1 = simulateDriving(hos, toPickup.driveMin);
  t += e1.elapsed;
  restMin += e1.restMin;
  if (t < order.pickupStart) {
    // Wartezeit zählt als Ruhe (vereinfacht)
    const wait = order.pickupStart - t;
    hos.restStreak += wait;
    t = order.pickupStart;
  }
  const pickupEta = t;
  t += cargo.loadMin;
  hos.restStreak = 0;
  const e2 = simulateDriving(hos, loaded.driveMin);
  t += e2.elapsed;
  restMin += e2.restMin;
  const model = TRUCK_BY_ID[vehicle.modelId];
  const loadFrac = order.weightT / TRAILER_BY_TYPE[order.trailerType].payloadT;
  const fuelL = toPickup.km * consumptionPerKm(vehicle.modelId, 0, driver.ecoDriving) + loaded.km * consumptionPerKm(vehicle.modelId, loadFrac, driver.ecoDriving);
  const usable = model.tankL * (1 - FUEL_RESERVE);
  const fuelStops = Math.max(0, Math.ceil((fuelL - (vehicle.fuelL - model.tankL * FUEL_RESERVE)) / usable));
  t += fuelStops * FUEL_STOP_MIN;
  const deliveryEta = t + Math.round(cargo.loadMin * UNLOAD_MIN_FACTOR);
  const lateMin = Math.max(0, deliveryEta - order.deliveryEnd);
  const durationMin = deliveryEta - state.time;
  const fuelCost = Math.round(fuelL * state.market.diesel);
  const toll = toPickup.toll + loaded.toll;
  const driverCost = Math.round(((driver.salary * EMPLOYER_COST_FACTOR) / (30 * MIN_PER_DAY)) * durationMin);
  const vehicleDaily = (model.insurance + (vehicle.leaseRate ?? model.price / 72)) / 30;
  const vehicleCost = Math.round((vehicleDaily * durationMin) / MIN_PER_DAY + (toPickup.km + loaded.km) * 6); // 6 ct/km Verschleiß
  const totalCost = fuelCost + toll + driverCost + vehicleCost;
  const revenue = order.payment - penaltyFor(order, lateMin);
  return {
    emptyKm: toPickup.km,
    loadedKm: loaded.km,
    driveMin: toPickup.driveMin + loaded.driveMin,
    restMin,
    pickupEta,
    deliveryEta,
    lateMin,
    fuelL,
    fuelCost,
    toll,
    driverCost,
    vehicleCost,
    totalCost,
    revenue,
    profit: revenue - totalCost,
    fuelStops,
  };
}

/** Konfliktprüfung. Fehler blockieren die Disposition, Warnungen informieren. */
export function validateDispatch(state: GameState, ctx: SimContext, input: DispatchInput): { issues: Issue[]; estimate: TripEstimate | null } {
  const issues: Issue[] = [];
  const err = (code: string, text: string) => issues.push({ level: 'error', code, text });
  const warn = (code: string, text: string) => issues.push({ level: 'warning', code, text });
  const order = state.orders[input.orderId];
  const driver = state.drivers[input.driverId];
  const vehicle = state.vehicles[input.vehicleId];
  const trailer = state.trailers[input.trailerId];
  if (!order) err('order_missing', 'Auftrag existiert nicht.');
  if (!driver) err('driver_missing', 'Fahrer existiert nicht.');
  if (!vehicle) err('vehicle_missing', 'Fahrzeug existiert nicht.');
  if (!trailer) err('trailer_missing', 'Auflieger existiert nicht.');
  if (issues.length) return { issues, estimate: null };

  if (order.status !== 'offered' && order.status !== 'accepted') err('order_status', 'Auftrag ist nicht mehr disponierbar.');
  if (order.status === 'offered' && state.time >= order.offerExpires) err('order_expired', 'Angebot ist abgelaufen.');
  if (driver.status !== 'idle') err('driver_busy', `${driver.name} ist nicht verfügbar (bereits verplant oder abwesend).`);
  if (vehicle.status !== 'idle') err('vehicle_busy', `LKW ${vehicle.plate} ist bereits verplant oder nicht einsatzbereit.`);
  if (trailer.status !== 'idle') err('trailer_busy', `Auflieger ${trailer.plate} ist bereits verplant.`);
  if (trailer.type !== order.trailerType)
    err('trailer_type', `Ungeeigneter Auflieger: benötigt ${TRAILER_BY_TYPE[order.trailerType].name}, vorhanden ${TRAILER_BY_TYPE[trailer.type].name}.`);
  if (order.weightT > TRAILER_BY_TYPE[trailer.type].payloadT) err('overweight', `Ladung (${order.weightT} t) übersteigt die Nutzlast des Aufliegers.`);
  for (const q of order.qualifications) if (!driver.qualifications.includes(q)) err('qualification', `${driver.name} fehlt die Qualifikation ${q === 'ADR' ? 'ADR-Schein (Gefahrgut)' : q === 'heavy' ? 'Schwertransport' : q}.`);
  if (driver.cityId !== vehicle.cityId) err('location_driver', `${driver.name} befindet sich nicht am Standort des LKW (${CITY_BY_ID[vehicle.cityId].name}).`);
  if (trailer.cityId !== vehicle.cityId) err('location_trailer', `Auflieger steht nicht am Standort des LKW (${CITY_BY_ID[trailer.cityId].name}).`);
  if (vehicle.condition < 15) err('vehicle_unsafe', `LKW ${vehicle.plate} ist nicht verkehrssicher (Zustand ${Math.round(vehicle.condition)} %). Bitte zuerst warten.`);

  const estimate = estimateTrip(state, ctx, input);
  if (!estimate) {
    err('no_route', 'Keine Straßenroute gefunden.');
    return { issues, estimate };
  }
  if (driver.hos.requiredRest > 0)
    warn('driver_rest', `${driver.name} muss zuerst noch ${formatDuration(driver.hos.requiredRest)} ${REST_KIND_LABEL[driver.hos.requiredRestKind]} einhalten.`);
  if (estimate.pickupEta > order.pickupEnd) warn('pickup_late', `Abholfenster wird voraussichtlich verpasst (Ankunft ${formatDateTime(estimate.pickupEta)}).`);
  if (estimate.lateMin > 0)
    warn('delivery_late', `Lieferung voraussichtlich ${formatDuration(estimate.lateMin)} zu spät – Vertragsstrafe ca. ${formatMoney(penaltyFor(order, estimate.lateMin))}.`);
  if (estimate.fuelStops > 0) warn('fuel', `Tankfüllung reicht nicht – ${estimate.fuelStops} Tankstopp(s) eingeplant.`);
  if (vehicle.condition < 40) warn('maintenance', `LKW ${vehicle.plate} hat einen kritischen Wartungszustand (${Math.round(vehicle.condition)} %) – erhöhtes Pannenrisiko.`);
  if (estimate.profit < 0) warn('unprofitable', `Fahrt ist voraussichtlich unwirtschaftlich (${formatMoney(estimate.profit)}).`);
  return { issues, estimate };
}

function leg(ctx: SimContext, from: string, to: string, loaded: boolean): TripLeg {
  const r = ctx.net.route(from, to)!;
  return { nodes: r.nodes, km: r.km, loaded };
}

/** Legt eine Fahrt an und bindet Fahrer, LKW und Auflieger. Vorher validateDispatch aufrufen! */
export function createTrip(state: GameState, ctx: SimContext, input: DispatchInput, estimate: TripEstimate): Trip {
  const order = state.orders[input.orderId];
  const driver = state.drivers[input.driverId];
  const vehicle = state.vehicles[input.vehicleId];
  const trailer = state.trailers[input.trailerId];
  const id = newId(state, 'trp');
  const trip: Trip = {
    id,
    orderId: order.id,
    driverId: driver.id,
    vehicleId: vehicle.id,
    trailerId: trailer.id,
    legs: [leg(ctx, vehicle.cityId, order.fromCityId, false), leg(ctx, order.fromCityId, order.toCityId, true)],
    legIndex: 0,
    progressKm: 0,
    phase: 'to_pickup',
    activity: 'driving',
    activityLeft: 0,
    speedKmh: 0,
    startedAt: state.time,
    costs: { fuel: 0, toll: 0 },
    kmEmpty: 0,
    kmLoaded: 0,
    plannedArrival: estimate.deliveryEta,
    log: [{ t: state.time, text: 'Fahrt disponiert' }],
  };
  state.trips[id] = trip;
  order.status = 'planned';
  order.tripId = id;
  driver.status = 'on_trip';
  driver.tripId = id;
  vehicle.status = 'on_trip';
  vehicle.tripId = id;
  trailer.status = 'on_trip';
  trailer.tripId = id;
  addLog(state, {
    level: 'info',
    category: 'trip',
    text: `${driver.name} übernimmt ${CARGO_BY_ID[order.cargoId].name} ${CITY_BY_ID[order.fromCityId].name} → ${CITY_BY_ID[order.toCityId].name} (geplante Ankunft ${formatDateTime(estimate.deliveryEta)}).`,
    ref: { kind: 'trip', id },
  });
  return trip;
}

/** Überführungsfahrt ohne Ladung (z. B. zurück zum Betriebshof oder in eine Region mit Aufträgen). */
export function createRelocation(state: GameState, ctx: SimContext, driverId: Id, vehicleId: Id, trailerId: Id | undefined, toCityId: string): Trip {
  const driver = state.drivers[driverId];
  const vehicle = state.vehicles[vehicleId];
  const id = newId(state, 'trp');
  const l = leg(ctx, vehicle.cityId, toCityId, false);
  const trip: Trip = {
    id,
    driverId,
    vehicleId,
    trailerId,
    legs: [l],
    legIndex: 0,
    progressKm: 0,
    phase: 'to_pickup',
    activity: 'driving',
    activityLeft: 0,
    speedKmh: 0,
    startedAt: state.time,
    costs: { fuel: 0, toll: 0 },
    kmEmpty: 0,
    kmLoaded: 0,
    plannedArrival: state.time + simulateDriving({ ...driver.hos }, ctx.net.describe(l.nodes).driveMin).elapsed,
    log: [{ t: state.time, text: `Überführung nach ${CITY_BY_ID[toCityId].name}` }],
  };
  state.trips[id] = trip;
  driver.status = 'on_trip';
  driver.tripId = id;
  vehicle.status = 'on_trip';
  vehicle.tripId = id;
  if (trailerId) {
    state.trailers[trailerId].status = 'on_trip';
    state.trailers[trailerId].tripId = id;
  }
  addLog(state, { level: 'info', category: 'trip', text: `${driver.name} startet Überführungsfahrt nach ${CITY_BY_ID[toCityId].name}.`, ref: { kind: 'trip', id } });
  return trip;
}
