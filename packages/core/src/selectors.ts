// Abgeleitete Ansichten auf den Spielzustand (für UI, Server-Snapshots und Tests).

import { CITIES, CITY_BY_ID } from './data/cities.ts';
import { CARGO_BY_ID } from './data/catalog.ts';
import type { SimContext } from './context.ts';
import { UNLOAD_MIN_FACTOR, ordersOnBoard, speedFactor } from './dispatch.ts';
import { banAppliesTo, routeSegments, simulateRoute } from './world.ts';
import { haversineKm, type LonLat } from './geo.ts';
import { hosRest, hosWork, pickupWaitMin } from './hos.ts';
import type { GameState, HoursOfService, Id, Trip } from './types.ts';

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
  const main = state.orders[trip.orderId];
  if (main.status !== 'delivered' && trip.plannedArrival > main.deliveryEnd) return true;
  for (const st of trip.stops ?? []) {
    const o = state.orders[st.orderId];
    if (st.kind === 'delivery' && o.status !== 'delivered' && state.time > o.deliveryEnd) return true;
  }
  return false;
}

/** Verbleibende Strecke einer Fahrt in km (alle Legs). */
export function remainingKm(trip: Trip): number {
  let km = trip.legs[trip.legIndex].km - trip.progressKm;
  for (let i = trip.legIndex + 1; i < trip.legs.length; i++) km += trip.legs[i].km;
  return Math.max(0, km);
}

/** Geschätztes Ende von Beladung bzw. Entladung je noch offenem Halt (Index wie trip.stops) und Fahrtende.
 *  Berücksichtigt Lenk-/Ruhezeiten, Ladefenster, Verkehrsstörungen, Wetter, Grenzen und Fahrverbote auf der Route. */
export function tripStopEtas(state: GameState, ctx: SimContext, trip: Trip): { etas: number[]; end: number; hos: HoursOfService } {
  const driver = state.drivers[trip.driverId];
  if (trip.phase === 'done') return { etas: [], end: trip.finishedAt ?? state.time, hos: { ...driver.hos } };
  const hos = { ...driver.hos };
  const vehicle = state.vehicles[trip.vehicleId];
  const sf = speedFactor(vehicle?.modelId ?? '');
  let t = state.time;
  const stationary = trip.activity !== 'driving' && trip.activity !== 'ferry';
  if (stationary) {
    t += trip.activityLeft;
    if (['break', 'rest_daily', 'rest_weekly', 'waiting', 'blocked', 'ban'].includes(trip.activity)) hosRest(hos, trip.activityLeft);
  }
  const atStop = trip.phase === 'loading' || trip.phase === 'unloading';
  const etas: number[] = [];
  for (let li = trip.legIndex; li < trip.legs.length; li++) {
    const stop = trip.stops?.[li];
    const cargo = stop ? CARGO_BY_ID[state.orders[stop.orderId].cargoId] : undefined;
    if (li === trip.legIndex && atStop) {
      // Tätigkeit am Halt läuft bereits (Restdauer oben gezählt)
      if (cargo && trip.activity === 'waiting') t += cargo.loadMin;
      hosWork(hos, 0);
      etas[li] = Math.round(t);
      continue;
    }
    const leg = trip.legs[li];
    const from = li === trip.legIndex ? trip.progressKm : 0;
    const reefer = leg.loaded ? ordersOnBoard(trip, li).find((id) => CARGO_BY_ID[state.orders[id]?.cargoId]?.trailer === 'reefer') : undefined;
    const banned = !!vehicle && banAppliesTo(vehicle, reefer ? state.orders[reefer].cargoId : undefined);
    t += simulateRoute(hos, t, routeSegments(state, ctx, leg.nodes, from, sf), banned).elapsed;
    if (stop && cargo) {
      const o = state.orders[stop.orderId];
      // wie in der Simulation: Warten aufs Ladefenster zählt als Ruhe, Be-/Entladen als Arbeit
      if (stop.kind === 'pickup') {
        const wait = pickupWaitMin(hos, t, o.pickupStart, o.pickupEnd);
        hosRest(hos, wait);
        t += wait;
        t += cargo.loadMin;
      } else t += Math.round(cargo.loadMin * UNLOAD_MIN_FACTOR);
      hosWork(hos, 0);
      etas[li] = Math.round(t);
    }
  }
  return { etas, end: Math.round(t), hos };
}

/** Voraussichtliches Ende einer laufenden Fahrt unter Berücksichtigung der Lenk-/Ruhezeiten. */
export function tripEta(state: GameState, ctx: SimContext, trip: Trip): number {
  return tripStopEtas(state, ctx, trip).end;
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
