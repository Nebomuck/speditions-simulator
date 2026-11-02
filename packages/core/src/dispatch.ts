// DispatchSystem: Planung, Kalkulation und Konfliktprüfung von Fahrten.

import { CITY_BY_ID } from './data/cities.ts';
import { CARGO_BY_ID, TRAILER_BY_TYPE, TRUCK_BY_ID, loadSpace } from './data/catalog.ts';
import type { SimContext } from './context.ts';
import { EMPLOYER_COST_FACTOR, addLog, formatMoney } from './finance.ts';
import { REST_KIND_LABEL, simulateDriving } from './hos.ts';
import { newId } from './rng.ts';
import { tripEta } from './selectors.ts';
import { MIN_PER_DAY, formatDateTime, formatDuration } from './time.ts';
import type { GameState, HoursOfService, Id, Money, Order, Trip, TripLeg, Vehicle } from './types.ts';

export interface DispatchInput {
  orderId: Id;
  driverId: Id;
  vehicleId: Id;
  /** leer bei Solo-LKW/Transporter (fester Aufbau) */
  trailerId: Id;
}

/** Startpunkt einer Planung: jetzt am Standort des Fahrzeugs oder später (Vorausplanung nach laufender Fahrt). */
export interface PlanStart {
  cityId: string;
  time: number;
  hos?: HoursOfService;
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

/** Mautanteil und Geschwindigkeit je Fahrzeugklasse (Transporter mautfrei und schneller). */
export function tollFactor(modelId: string) {
  return TRUCK_BY_ID[modelId]?.tollFactor ?? 1;
}
export function speedFactor(modelId: string) {
  return TRUCK_BY_ID[modelId]?.speedFactor ?? 1;
}

/** Beladungsgrad 0–1 für Verbrauch und Verschleiß. */
export function loadFraction(state: GameState, vehicle: Vehicle, trailerId: Id | undefined, order: Order | undefined): number {
  if (!order) return 0;
  const space = loadSpace(vehicle.modelId, trailerId ? state.trailers[trailerId]?.type : order.trailerType);
  return space && space.payloadT > 0 ? Math.min(1, order.weightT / space.payloadT) : 0;
}

/** Vollständige Vorkalkulation einer Fahrt inkl. Lenk-/Ruhezeiten, Wartezeit und Kosten. */
export function estimateTrip(state: GameState, ctx: SimContext, input: DispatchInput, from?: PlanStart): TripEstimate | null {
  const order = state.orders[input.orderId];
  const driver = state.drivers[input.driverId];
  const vehicle = state.vehicles[input.vehicleId];
  if (!order || !driver || !vehicle) return null;
  const startCity = from?.cityId ?? vehicle.cityId;
  const startTime = from?.time ?? state.time;
  const toPickupRaw = ctx.net.route(startCity, order.fromCityId);
  const loadedRaw = ctx.net.route(order.fromCityId, order.toCityId);
  if (!toPickupRaw || !loadedRaw) return null;
  const sf = speedFactor(vehicle.modelId);
  const toPickup = { ...toPickupRaw, driveMin: toPickupRaw.driveMin / sf };
  const loaded = { ...loadedRaw, driveMin: loadedRaw.driveMin / sf };
  const cargo = CARGO_BY_ID[order.cargoId];
  const hos = { ...(from?.hos ?? driver.hos) };

  let t = startTime;
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
  const loadFrac = loadFraction(state, vehicle, input.trailerId || undefined, order);
  const fuelL = toPickup.km * consumptionPerKm(vehicle.modelId, 0, driver.ecoDriving) + loaded.km * consumptionPerKm(vehicle.modelId, loadFrac, driver.ecoDriving);
  const usable = model.tankL * (1 - FUEL_RESERVE);
  const tankNow = from ? model.tankL * 0.6 : vehicle.fuelL; // Vorausplanung: Tankstand unbekannt → Annahme
  const fuelStops = Math.max(0, Math.ceil((fuelL - (tankNow - model.tankL * FUEL_RESERVE)) / usable));
  t += fuelStops * FUEL_STOP_MIN;
  const deliveryEta = t + Math.round(cargo.loadMin * UNLOAD_MIN_FACTOR);
  const lateMin = Math.max(0, deliveryEta - order.deliveryEnd);
  const durationMin = deliveryEta - startTime;
  const fuelCost = Math.round(fuelL * state.market.diesel);
  const toll = Math.round((toPickup.toll + loaded.toll) * tollFactor(vehicle.modelId));
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

/** Konfliktprüfung. Fehler blockieren die Disposition, Warnungen informieren.
 *  Mit `queued` wird ein Folgeauftrag für ein Fahrzeug geprüft, das noch unterwegs ist (Vorausplanung). */
export function validateDispatch(state: GameState, ctx: SimContext, input: DispatchInput, opts: { queued?: boolean } = {}): { issues: Issue[]; estimate: TripEstimate | null } {
  const issues: Issue[] = [];
  const err = (code: string, text: string) => issues.push({ level: 'error', code, text });
  const warn = (code: string, text: string) => issues.push({ level: 'warning', code, text });
  const order = state.orders[input.orderId];
  const driver = state.drivers[input.driverId];
  const vehicle = state.vehicles[input.vehicleId];
  const model = vehicle ? TRUCK_BY_ID[vehicle.modelId] : undefined;
  const solo = !!model?.body;
  const trailer = input.trailerId ? state.trailers[input.trailerId] : undefined;
  if (!order) err('order_missing', 'Auftrag existiert nicht.');
  if (!driver) err('driver_missing', 'Fahrer existiert nicht.');
  if (!vehicle) err('vehicle_missing', 'Fahrzeug existiert nicht.');
  if (!solo && !trailer) err('trailer_missing', 'Bitte einen Auflieger wählen.');
  if (issues.length) return { issues, estimate: null };

  if (order.status !== 'offered' && order.status !== 'accepted') err('order_status', 'Auftrag ist nicht mehr disponierbar.');
  if (order.status === 'offered' && state.time >= order.offerExpires) err('order_expired', 'Angebot ist abgelaufen.');
  if (solo && trailer) err('solo_trailer', `${model!.name} hat einen festen Aufbau und zieht keinen Auflieger.`);
  if (!opts.queued) {
    if (driver.status !== 'idle') err('driver_busy', `${driver.name} ist nicht verfügbar (bereits verplant oder abwesend).`);
    if (vehicle.status !== 'idle') err('vehicle_busy', `LKW ${vehicle.plate} ist bereits unterwegs – Folgeauftrag über „Vorausplanen“ einplanen.`);
    if (trailer && trailer.status !== 'idle') err('trailer_busy', `Auflieger ${trailer.plate} ist bereits verplant.`);
    if (driver.cityId !== vehicle.cityId) err('location_driver', `${driver.name} befindet sich nicht am Standort des LKW (${CITY_BY_ID[vehicle.cityId].name}).`);
    if (trailer && trailer.cityId !== vehicle.cityId) err('location_trailer', `Auflieger steht nicht am Standort des LKW (${CITY_BY_ID[trailer.cityId].name}).`);
  } else if (vehicle.status !== 'on_trip') err('vehicle_not_busy', `LKW ${vehicle.plate} ist frei – bitte direkt disponieren.`);
  const space = loadSpace(vehicle.modelId, trailer?.type);
  if (space && space.type !== order.trailerType)
    err('trailer_type', `Ungeeigneter Laderaum: benötigt ${TRAILER_BY_TYPE[order.trailerType].name}, vorhanden ${solo ? `Aufbau ${TRAILER_BY_TYPE[space.type].name.replace('auflieger', '')}` : TRAILER_BY_TYPE[space.type].name}.`);
  if (space && order.weightT > space.payloadT) err('overweight', `Ladung (${order.weightT} t) übersteigt die Nutzlast (${space.payloadT} t).`);
  for (const q of order.qualifications) if (!driver.qualifications.includes(q)) err('qualification', `${driver.name} fehlt die Qualifikation ${q === 'ADR' ? 'ADR-Schein (Gefahrgut)' : q === 'heavy' ? 'Schwertransport' : q}.`);
  if (vehicle.condition < 15) err('vehicle_unsafe', `LKW ${vehicle.plate} ist nicht verkehrssicher (Zustand ${Math.round(vehicle.condition)} %). Bitte zuerst warten.`);

  const from = opts.queued ? planEnd(state, ctx, vehicle.id) ?? undefined : undefined;
  if (opts.queued && !from) err('no_plan', 'Ende der laufenden Fahrt kann nicht bestimmt werden.');
  const estimate = estimateTrip(state, ctx, input, from);
  if (!estimate) {
    err('no_route', 'Keine Straßenroute gefunden.');
    return { issues, estimate };
  }
  if (opts.queued && from)
    warn('queued', `Vorausplanung: Start nach der laufenden Fahrt ca. ${formatDateTime(from.time)} in ${CITY_BY_ID[from.cityId].name}. Lenkzeiten und Tankstopps werden beim Start neu berechnet.`);
  if (!opts.queued && driver.hos.requiredRest > 0)
    warn('driver_rest', `${driver.name} muss zuerst noch ${formatDuration(driver.hos.requiredRest)} ${REST_KIND_LABEL[driver.hos.requiredRestKind]} einhalten.`);
  if (order.partial && space && space.payloadT > 12)
    warn('partial_big', `Teilladung (${order.weightT} t) mit großem Fahrzeug – ein Solo-LKW oder Transporter wäre deutlich günstiger.`);
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
  const trailer = input.trailerId ? state.trailers[input.trailerId] : undefined;
  const id = newId(state, 'trp');
  const trip: Trip = {
    id,
    orderId: order.id,
    driverId: driver.id,
    vehicleId: vehicle.id,
    ...(trailer ? { trailerId: trailer.id } : {}),
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
  if (trailer) {
    trailer.status = 'on_trip';
    trailer.tripId = id;
  }
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

// ---------- Vorausplanung (Tourenketten) ----------

/** Wo und wann ist das Fahrzeug nach laufender Fahrt und allen eingeplanten Folgeaufträgen frei? */
export function planEnd(state: GameState, ctx: SimContext, vehicleId: Id): PlanStart | null {
  return vehicleSchedule(state, ctx, vehicleId).at(-1)?.end ?? null;
}

export interface ScheduleItem {
  kind: 'trip' | 'queued';
  orderId?: Id;
  tripId?: Id;
  queueId?: Id;
  start: number;
  pickup?: number;
  fromCityId: string;
  toCityId: string;
  end: PlanStart;
  lateMin: number;
}

/** Laufende Fahrt und Folgeaufträge eines Fahrzeugs mit geschätzten Zeiten (Grundlage für Kalender und Plantafel). */
export function vehicleSchedule(state: GameState, ctx: SimContext, vehicleId: Id): ScheduleItem[] {
  const vehicle = state.vehicles[vehicleId];
  if (!vehicle?.tripId) return [];
  const trip = state.trips[vehicle.tripId];
  if (!trip || trip.phase === 'done') return [];
  const lastLeg = trip.legs[trip.legs.length - 1];
  const dest = lastLeg.nodes[lastLeg.nodes.length - 1];
  const order = trip.orderId ? state.orders[trip.orderId] : undefined;
  const eta = tripEta(state, ctx, trip);
  const items: ScheduleItem[] = [
    {
      kind: 'trip',
      tripId: trip.id,
      orderId: trip.orderId,
      start: trip.startedAt,
      fromCityId: trip.legs[0].nodes[0],
      toCityId: dest,
      end: { cityId: dest, time: eta },
      lateMin: order ? Math.max(0, eta - order.deliveryEnd) : 0,
    },
  ];
  let cursor: PlanStart = { cityId: dest, time: eta };
  for (const job of vehicle.queue ?? []) {
    const o = state.orders[job.orderId];
    if (!o) continue;
    const est = estimateTrip(state, ctx, { orderId: o.id, driverId: trip.driverId, vehicleId, trailerId: trip.trailerId ?? '' }, cursor);
    if (!est) continue;
    const end: PlanStart = { cityId: o.toCityId, time: est.deliveryEta };
    items.push({ kind: 'queued', orderId: o.id, queueId: job.id, start: cursor.time, pickup: est.pickupEta, fromCityId: cursor.cityId, toCityId: o.toCityId, end, lateMin: est.lateMin });
    cursor = end;
  }
  return items;
}

/** Folgeauftrag für ein Fahrzeug einplanen, das gerade unterwegs ist. Fahrer und Auflieger bleiben gleich. */
export function queueJob(state: GameState, ctx: SimContext, vehicleId: Id, orderId: Id): { ok: true; issues: Issue[] } | { ok: false; error: string; issues: Issue[] } {
  const vehicle = state.vehicles[vehicleId];
  const trip = vehicle?.tripId ? state.trips[vehicle.tripId] : undefined;
  if (!vehicle || !trip) return { ok: false, error: 'Fahrzeug ist nicht unterwegs – bitte direkt disponieren.', issues: [] };
  if ((vehicle.queue?.length ?? 0) >= 5) return { ok: false, error: 'Höchstens 5 Folgeaufträge je Fahrzeug.', issues: [] };
  const input: DispatchInput = { orderId, driverId: trip.driverId, vehicleId, trailerId: trip.trailerId ?? '' };
  const { issues, estimate } = validateDispatch(state, ctx, input, { queued: true });
  const errors = issues.filter((i) => i.level === 'error');
  if (errors.length || !estimate) return { ok: false, error: errors[0]?.text ?? 'Einplanung nicht möglich.', issues };
  const order = state.orders[orderId];
  order.status = 'planned';
  (vehicle.queue ??= []).push({ id: newId(state, 'job'), orderId, queuedAt: state.time });
  addLog(state, {
    level: 'info',
    category: 'trip',
    text: `Folgeauftrag ${CITY_BY_ID[order.fromCityId].name} → ${CITY_BY_ID[order.toCityId].name} für ${vehicle.plate} eingeplant (Abholung ca. ${formatDateTime(estimate.pickupEta)}).`,
    ref: { kind: 'order', id: orderId },
  });
  return { ok: true, issues };
}

/** Folgeauftrag aus der Planung nehmen – der Auftrag bleibt angenommen. */
export function unqueueJob(state: GameState, vehicleId: Id, orderId: Id): boolean {
  const vehicle = state.vehicles[vehicleId];
  const idx = vehicle?.queue?.findIndex((j) => j.orderId === orderId) ?? -1;
  if (!vehicle || idx < 0) return false;
  vehicle.queue!.splice(idx, 1);
  const order = state.orders[orderId];
  if (order && order.status === 'planned') order.status = 'accepted';
  return true;
}

/** Nach Fahrtende: nächsten eingeplanten Folgeauftrag mit aktuellem Stand prüfen und starten. */
export function startNextQueued(state: GameState, ctx: SimContext, vehicleId: Id, driverId: Id, trailerId: Id | undefined): void {
  const vehicle = state.vehicles[vehicleId];
  while (vehicle?.queue?.length) {
    const job = vehicle.queue.shift()!;
    const order = state.orders[job.orderId];
    if (!order || order.status !== 'planned') continue;
    order.status = 'accepted';
    const input: DispatchInput = { orderId: order.id, driverId, vehicleId, trailerId: trailerId ?? '' };
    const { issues, estimate } = validateDispatch(state, ctx, input);
    const error = issues.find((i) => i.level === 'error');
    if (!error && estimate) {
      createTrip(state, ctx, input, estimate);
      return;
    }
    addLog(state, {
      level: 'danger',
      category: 'trip',
      text: `Folgeauftrag ${CITY_BY_ID[order.fromCityId].name} → ${CITY_BY_ID[order.toCityId].name} konnte nicht automatisch starten: ${error?.text ?? 'keine Route'} Der Auftrag liegt wieder in der Disposition.`,
      ref: { kind: 'order', id: order.id },
    });
  }
}
