// Abgeleitete Ansichten auf den Spielzustand (für UI, Server-Snapshots und Tests).

import { CITIES, CITY_BY_ID } from './data/cities.ts';
import { CARGO_BY_ID } from './data/catalog.ts';
import type { SimContext } from './context.ts';
import { UNLOAD_MIN_FACTOR, speedFactor } from './dispatch.ts';
import { disruptionOnEdge } from './disruptions.ts';
import { haversineKm, type LonLat } from './geo.ts';
import { hosRest, hosWork, simulateDriving } from './hos.ts';
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

/** Restliche reine Fahrzeit (min) ab aktueller Position bis zum Ende einer Knotenfolge. */
function remainingDriveMin(state: GameState, ctx: SimContext, nodes: string[], fromKm: number): number {
  let acc = 0;
  let min = 0;
  for (let i = 1; i < nodes.length; i++) {
    const e = ctx.net.edgeBetween(nodes[i - 1], nodes[i]);
    if (!e) continue;
    const start = acc;
    acc += e.km;
    if (acc <= fromKm) continue;
    const part = (acc - Math.max(start, fromKm)) / e.km;
    // Stau verlangsamt, Sperrung kostet die Wartezeit bis zur Freigabe
    const d = disruptionOnEdge(state, e);
    min += (e.truckMin * part) / (d?.kind === 'jam' ? d.speedFactor : 1) + (d?.kind === 'closure' ? Math.max(0, d.until - state.time) : 0);
  }
  return min;
}

/** Geschätztes Ende von Beladung bzw. Entladung je noch offenem Halt (Index wie trip.stops) und Fahrtende.
 *  Berücksichtigt Lenk-/Ruhezeiten, Ladefenster und Verkehrsstörungen auf der Route. */
export function tripStopEtas(state: GameState, ctx: SimContext, trip: Trip): { etas: number[]; end: number } {
  if (trip.phase === 'done') return { etas: [], end: trip.finishedAt ?? state.time };
  const driver = state.drivers[trip.driverId];
  const hos = { ...driver.hos };
  const sf = speedFactor(state.vehicles[trip.vehicleId]?.modelId ?? '');
  let t = state.time;
  const stationary = trip.activity !== 'driving' && trip.activity !== 'ferry';
  if (stationary) {
    t += trip.activityLeft;
    if (['break', 'rest_daily', 'rest_weekly', 'waiting', 'blocked'].includes(trip.activity)) hosRest(hos, trip.activityLeft);
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
    t += simulateDriving(hos, remainingDriveMin(state, ctx, leg.nodes, from) / sf).elapsed;
    if (stop && cargo) {
      const o = state.orders[stop.orderId];
      // wie in der Simulation: Warten aufs Ladefenster zählt als Ruhe, Be-/Entladen als Arbeit
      if (stop.kind === 'pickup') {
        if (t < o.pickupStart) {
          hosRest(hos, o.pickupStart - t);
          t = o.pickupStart;
        }
        t += cargo.loadMin;
      } else t += Math.round(cargo.loadMin * UNLOAD_MIN_FACTOR);
      hosWork(hos, 0);
      etas[li] = Math.round(t);
    }
  }
  return { etas, end: Math.round(t) };
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
