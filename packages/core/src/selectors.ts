// Abgeleitete Ansichten auf den Spielzustand (für UI, Server-Snapshots und Tests).

import { CITIES, CITY_BY_ID } from './data/cities.ts';
import { CARGO_BY_ID } from './data/catalog.ts';
import type { SimContext } from './context.ts';
import { UNLOAD_MIN_FACTOR, speedFactor } from './dispatch.ts';
import { haversineKm, type LonLat } from './geo.ts';
import { hosRest, simulateDriving } from './hos.ts';
import type { GameState, Id, Trip } from './types.ts';

export interface VehicleMarker {
  vehicleId: Id;
  tripId?: Id;
  pos: LonLat;
  bearing: number;
  activity: Trip['activity'] | 'idle' | 'workshop';
  late: boolean;
  loaded: boolean;
}

/** Position eines Fahrzeugs – unterwegs entlang der Route, sonst am Standort. */
export function vehicleMarker(state: GameState, ctx: SimContext, vehicleId: Id, extraKm = 0): VehicleMarker {
  const v = state.vehicles[vehicleId];
  const trip = v.tripId ? state.trips[v.tripId] : undefined;
  if (trip && trip.phase !== 'done') {
    const leg = trip.legs[trip.legIndex];
    const moving = trip.activity === 'driving' || trip.activity === 'ferry';
    const km = Math.min(leg.km, trip.progressKm + (moving ? extraKm : 0));
    const p = ctx.net.positionAlong(leg.nodes, km);
    return { vehicleId, tripId: trip.id, pos: p.pos, bearing: p.bearing, activity: trip.activity, late: isTripLate(state, trip), loaded: leg.loaded };
  }
  const c = CITY_BY_ID[v.cityId];
  return { vehicleId, pos: [c.lon, c.lat], bearing: 0, activity: v.status === 'workshop' ? 'workshop' : 'idle', late: false, loaded: false };
}

export function isTripLate(state: GameState, trip: Trip): boolean {
  if (!trip.orderId) return false;
  const o = state.orders[trip.orderId];
  return state.time > o.deliveryEnd || trip.plannedArrival > o.deliveryEnd;
}

/** Verbleibende Strecke einer Fahrt in km (alle Legs). */
export function remainingKm(trip: Trip): number {
  let km = trip.legs[trip.legIndex].km - trip.progressKm;
  for (let i = trip.legIndex + 1; i < trip.legs.length; i++) km += trip.legs[i].km;
  return Math.max(0, km);
}

/** Restliche reine Fahrzeit (min) ab aktueller Position bis zum Ende einer Knotenfolge. */
function remainingDriveMin(ctx: SimContext, nodes: string[], fromKm: number): number {
  let acc = 0;
  let min = 0;
  for (let i = 1; i < nodes.length; i++) {
    const e = ctx.net.edgeBetween(nodes[i - 1], nodes[i]);
    if (!e) continue;
    const start = acc;
    acc += e.km;
    if (acc <= fromKm) continue;
    const part = (acc - Math.max(start, fromKm)) / e.km;
    min += e.truckMin * part;
  }
  return min;
}

/** Voraussichtliche Ankunft am Ziel einer laufenden Fahrt unter Berücksichtigung der Lenk-/Ruhezeiten. */
export function tripEta(state: GameState, ctx: SimContext, trip: Trip): number {
  if (trip.phase === 'done') return trip.finishedAt ?? state.time;
  const driver = state.drivers[trip.driverId];
  const hos = { ...driver.hos };
  let t = state.time;
  const stationary = trip.activity !== 'driving' && trip.activity !== 'ferry';
  if (stationary) {
    t += trip.activityLeft;
    if (['break', 'rest_daily', 'rest_weekly', 'waiting'].includes(trip.activity)) hosRest(hos, trip.activityLeft);
  }
  const order = trip.orderId ? state.orders[trip.orderId] : undefined;
  const cargo = order ? CARGO_BY_ID[order.cargoId] : undefined;
  if (cargo && trip.activity === 'waiting') t += cargo.loadMin;
  for (let li = trip.legIndex; li < trip.legs.length; li++) {
    const leg = trip.legs[li];
    const from = li === trip.legIndex ? trip.progressKm : 0;
    t += simulateDriving(hos, remainingDriveMin(ctx, leg.nodes, from) / speedFactor(state.vehicles[trip.vehicleId]?.modelId ?? '')).elapsed;
    if (order && cargo && li === 0 && trip.phase === 'to_pickup') {
      if (t < order.pickupStart) t = order.pickupStart;
      t += cargo.loadMin;
    }
  }
  if (cargo && trip.phase !== 'unloading') t += Math.round(cargo.loadMin * UNLOAD_MIN_FACTOR);
  return Math.round(t);
}

/** Nächstgelegene Stadt zu einer Position (für "Aktuelle Position"). */
export function nearestCity(pos: LonLat): { id: string; km: number } {
  let best = { id: CITIES[0].id, km: Infinity };
  for (const c of CITIES) {
    const km = haversineKm(pos, [c.lon, c.lat]);
    if (km < best.km) best = { id: c.id, km };
  }
  return best;
}
