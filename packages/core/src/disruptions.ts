// Verkehrsstörungen: Sperrungen und Staus auf Straßenkanten. Laufende Fahrten werden bei Sperrungen
// automatisch umgeleitet; Planung und Vorkalkulation berücksichtigen die aktuelle Verkehrslage.

import { CITY_BY_ID } from './data/cities.ts';
import type { SimContext } from './context.ts';
import { addLog } from './finance.ts';
import { newId, rand } from './rng.ts';
import type { RoadEdge, Route, Traffic } from './routing.ts';
import { formatDateTime, formatDuration } from './time.ts';
import type { Disruption, GameState, Trip } from './types.ts';

export const MAX_DISRUPTIONS = 6;
const CLOSURE_CAUSES = ['Unfall mit Vollsperrung', 'Bauarbeiten', 'Brückensperrung', 'Unwetter', 'Gefahrgutunfall'];
const JAM_CAUSES = ['Stau', 'Baustelle', 'Unfall', 'Hohes Verkehrsaufkommen', 'Spurensperrung'];

export function disruptionLabel(d: Disruption): string {
  return `${d.kind === 'closure' ? 'Sperrung' : 'Stau'} ${CITY_BY_ID[d.a]?.name ?? d.a} – ${CITY_BY_ID[d.b]?.name ?? d.b} (${d.cause})`;
}

/** Aktuelle Verkehrslage als Routing-Gewichte. */
export function trafficOf(state: GameState, ctx: SimContext): Traffic {
  const factor = new Map<number, number>();
  for (const d of state.disruptions ?? []) {
    const e = ctx.net.edgeBetween(d.a, d.b);
    if (e) factor.set(e.index, d.kind === 'closure' ? Infinity : 1 / Math.max(0.1, d.speedFactor));
  }
  return { key: (state.disruptions ?? []).map((d) => d.id).join(','), factor };
}

/** Schnellste Route nach aktueller Verkehrslage. Ohne Ausweichroute wird die normale Route geliefert (Fahrzeug wartet an der Sperrung). */
export function routeNow(state: GameState, ctx: SimContext, from: string, to: string): Route | null {
  return ctx.net.route(from, to, trafficOf(state, ctx)) ?? ctx.net.route(from, to);
}

export function disruptionOnEdge(state: GameState, edge: RoadEdge): Disruption | undefined {
  return (state.disruptions ?? []).find((d) => (d.a === edge.a && d.b === edge.b) || (d.a === edge.b && d.b === edge.a));
}

/** Kanten, die eine laufende Fahrt noch befahren wird (aktuelles Leg ab Position, folgende Legs). */
function edgesAhead(ctx: SimContext, trip: Trip): RoadEdge[] {
  const out: RoadEdge[] = [];
  for (let li = trip.legIndex; li < trip.legs.length; li++) {
    const nodes = trip.legs[li].nodes;
    let acc = 0;
    for (let i = 1; i < nodes.length; i++) {
      const e = ctx.net.edgeBetween(nodes[i - 1], nodes[i]);
      if (!e) continue;
      acc += e.km;
      if (li === trip.legIndex && acc <= trip.progressKm) continue;
      out.push(e);
    }
  }
  return out;
}

/** Aktuelles Leg ab dem nächsten Knoten neu berechnen. Liefert die Mehr-km, wenn sich die Route geändert hat. */
export function rerouteTrip(state: GameState, ctx: SimContext, trip: Trip): number | null {
  if (trip.phase !== 'to_pickup' && trip.phase !== 'to_delivery') return null;
  const leg = trip.legs[trip.legIndex];
  if (leg.nodes.length < 2) return null;
  const loc = ctx.net.locate(leg.nodes, trip.progressKm);
  if (!loc) return null;
  // bereits befahrene Kante wird zu Ende gefahren; Umleitung ab dem nächsten Knoten
  const keep = leg.nodes.slice(0, loc.segIndex + 2);
  const next = keep[keep.length - 1];
  const target = leg.nodes[leg.nodes.length - 1];
  const tail = routeNow(state, ctx, next, target);
  if (!tail) return null;
  const nodes = [...keep, ...tail.nodes.slice(1)];
  if (nodes.join('>') === leg.nodes.join('>')) return null;
  const km = ctx.net.describe(nodes).km;
  const diff = km - leg.km;
  trip.legs[trip.legIndex] = { ...leg, nodes, km };
  return diff;
}

/** Fahrten, deren weiterer Weg über eine Sperrung führt, umleiten. */
export function rerouteAffected(state: GameState, ctx: SimContext): void {
  const closed = (state.disruptions ?? []).filter((d) => d.kind === 'closure');
  if (!closed.length) return;
  for (const trip of Object.values(state.trips)) {
    if (trip.phase === 'done') continue;
    const hit = closed.find((d) => {
      const leg = trip.legs[trip.legIndex];
      const nodes = leg.nodes;
      // nur das aktuelle Leg betrachten; spätere Legs werden beim Start neu geroutet
      for (let i = 1; i < nodes.length; i++) {
        if ((nodes[i - 1] === d.a && nodes[i] === d.b) || (nodes[i - 1] === d.b && nodes[i] === d.a)) {
          const loc = ctx.net.locate(nodes, trip.progressKm);
          return !loc || i - 1 > loc.segIndex;
        }
      }
      return false;
    });
    if (!hit) continue;
    const diff = rerouteTrip(state, ctx, trip);
    const vehicle = state.vehicles[trip.vehicleId];
    if (diff !== null) {
      trip.log.push({ t: state.time, text: `Umleitung wegen ${disruptionLabel(hit)} (${diff >= 0 ? '+' : ''}${Math.round(diff)} km)` });
      addLog(state, {
        level: 'warning',
        category: 'trip',
        text: `Umleitung: LKW ${vehicle?.plate ?? ''} umfährt die ${disruptionLabel(hit)} – ${diff >= 0 ? `${Math.round(diff)} km Umweg` : `${Math.round(-diff)} km kürzer`}.`,
        ref: { kind: 'trip', id: trip.id },
      });
    }
  }
}

/** Stündlich: abgelaufene Störungen aufheben, neue erzeugen (bevorzugt auf Strecken eigener Fahrten). */
export function updateDisruptions(state: GameState, ctx: SimContext): void {
  state.disruptions ??= [];
  const lifted = state.disruptions.filter((d) => d.until <= state.time && d.kind === 'closure');
  state.disruptions = state.disruptions.filter((d) => d.until > state.time);
  // aufgehobene Sperrung: umgeleitete Fahrten nehmen wieder den kürzeren Weg
  if (lifted.length)
    for (const trip of Object.values(state.trips)) {
      if (trip.phase === 'done') continue;
      const diff = rerouteTrip(state, ctx, trip);
      if (diff !== null && diff < 0) trip.log.push({ t: state.time, text: `Sperrung aufgehoben – zurück auf die kürzere Route (${Math.round(diff)} km)` });
    }

  let created: Disruption | undefined;
  if (state.disruptions.length < MAX_DISRUPTIONS && rand.chance(state, 0.45 * state.difficulty.eventFactor)) {
    const ahead = Object.values(state.trips)
      .filter((t) => t.phase !== 'done')
      .flatMap((t) => edgesAhead(ctx, t));
    const pool = (ahead.length && rand.chance(state, 0.6) ? ahead : ctx.net.edges).filter((e) => !e.ferry && !disruptionOnEdge(state, e));
    if (pool.length) {
      const edge = rand.pick(state, pool);
      const closure = rand.chance(state, 0.3);
      created = {
        id: newId(state, 'dis'),
        kind: closure ? 'closure' : 'jam',
        a: edge.a,
        b: edge.b,
        cause: rand.pick(state, closure ? CLOSURE_CAUSES : JAM_CAUSES),
        from: state.time,
        until: state.time + (closure ? rand.int(state, 2, 8) : rand.int(state, 1, 3)) * 60,
        speedFactor: closure ? 0 : Math.round(rand.float(state, 0.3, 0.6) * 100) / 100,
      };
      state.disruptions.push(created);
      const affects = ahead.includes(edge);
      if (closure || affects)
        addLog(state, {
          level: affects ? 'warning' : 'info',
          category: 'trip',
          text: `Verkehr: ${disruptionLabel(created)} bis ca. ${formatDateTime(created.until)}${created.kind === 'jam' ? ` – Zeitverlust bis ${formatDuration(Math.round((ctx.net.edgeBetween(edge.a, edge.b)!.truckMin * (1 / created.speedFactor - 1))))}` : ''}.`,
        });
    }
  }
  if (created?.kind === 'closure') rerouteAffected(state, ctx);
}
