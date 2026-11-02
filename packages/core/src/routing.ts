// RoutingSystem: Straßennetz aus echten OSM-Routen zwischen Städten (vorberechnet, siehe tools/roadnet).
// Routing erfolgt offline per Dijkstra; Geometrien werden für Positionsberechnung und Kartendarstellung genutzt.

import { CITIES, CITY_BY_ID } from './data/cities.ts';
import { TOLL_CENT_PER_KM } from './data/catalog.ts';
import { cumulativeKm, decodePolyline, pointAlong, type LonLat } from './geo.ts';

export interface RoadNetData {
  version: number;
  attribution: string;
  edges: { a: string; b: string; km: number; min: number; ferry?: boolean; g: string }[];
}

export interface RoadEdge {
  index: number;
  a: string;
  b: string;
  km: number;
  /** LKW-Fahrzeit in Minuten (Pkw-Zeit aus OSRM, auf LKW-Geschwindigkeit begrenzt) */
  truckMin: number;
  /** durchschnittliche LKW-Geschwindigkeit km/h */
  truckKmh: number;
  ferry: boolean;
  /** Maut in Cent für die gesamte Kante */
  toll: number;
  coords: LonLat[];
  cum: Float64Array;
}

export interface Route {
  nodes: string[];
  km: number;
  /** reine Fahrzeit ohne Pausen in Minuten */
  driveMin: number;
  toll: number;
}

export const TRUCK_MAX_KMH = 80;
/** LKW fahren im Mittel langsamer als der Pkw-Durchschnitt aus OSRM */
const TRUCK_SPEED_FACTOR = 0.9;

export class RoadNetwork {
  readonly edges: RoadEdge[] = [];
  readonly attribution: string;
  readonly version: number;
  private adj = new Map<string, { to: string; edge: RoadEdge }[]>();
  private edgeByPair = new Map<string, RoadEdge>();
  private routeCache = new Map<string, Route | null>();

  constructor(data: RoadNetData) {
    this.attribution = data.attribution;
    this.version = data.version;
    for (const city of CITIES) this.adj.set(city.id, []);
    data.edges.forEach((e, index) => {
      if (!CITY_BY_ID[e.a] || !CITY_BY_ID[e.b]) return;
      const carKmh = e.km / Math.max(e.min / 60, 0.01);
      const truckKmh = e.ferry ? carKmh : Math.min(TRUCK_MAX_KMH, carKmh * TRUCK_SPEED_FACTOR);
      const coords = decodePolyline(e.g);
      const ca = CITY_BY_ID[e.a].country;
      const cb = CITY_BY_ID[e.b].country;
      const tollRate = e.ferry ? 0 : ((TOLL_CENT_PER_KM[ca] ?? 5) + (TOLL_CENT_PER_KM[cb] ?? 5)) / 2;
      const edge: RoadEdge = {
        index,
        a: e.a,
        b: e.b,
        km: e.km,
        truckMin: (e.km / truckKmh) * 60,
        truckKmh,
        ferry: !!e.ferry,
        toll: Math.round(tollRate * e.km),
        coords,
        cum: cumulativeKm(coords),
      };
      this.edges.push(edge);
      this.adj.get(e.a)!.push({ to: e.b, edge });
      this.adj.get(e.b)!.push({ to: e.a, edge });
      this.edgeByPair.set(pairKey(e.a, e.b), edge);
    });
  }

  hasCity(id: string) {
    return (this.adj.get(id)?.length ?? 0) > 0;
  }

  edgeBetween(a: string, b: string): RoadEdge | undefined {
    return this.edgeByPair.get(pairKey(a, b));
  }

  /** Schnellste LKW-Route zwischen zwei Städten (Dijkstra nach Fahrzeit). */
  route(from: string, to: string): Route | null {
    const key = `${from}>${to}`;
    if (this.routeCache.has(key)) return this.routeCache.get(key)!;
    let result: Route | null = null;
    if (from === to) result = { nodes: [from], km: 0, driveMin: 0, toll: 0 };
    else if (this.adj.has(from) && this.adj.has(to)) {
      const dist = new Map<string, number>([[from, 0]]);
      const prev = new Map<string, string>();
      const done = new Set<string>();
      // kleine Graphen: einfache Prioritätsliste genügt
      const open: string[] = [from];
      while (open.length) {
        let bi = 0;
        for (let i = 1; i < open.length; i++) if (dist.get(open[i])! < dist.get(open[bi])!) bi = i;
        const u = open.splice(bi, 1)[0];
        if (u === to) break;
        if (done.has(u)) continue;
        done.add(u);
        for (const { to: v, edge } of this.adj.get(u)!) {
          const nd = dist.get(u)! + edge.truckMin;
          if (nd < (dist.get(v) ?? Infinity)) {
            dist.set(v, nd);
            prev.set(v, u);
            open.push(v);
          }
        }
      }
      if (dist.has(to)) {
        const nodes = [to];
        while (nodes[0] !== from) nodes.unshift(prev.get(nodes[0])!);
        result = this.describe(nodes);
      }
    }
    this.routeCache.set(key, result);
    return result;
  }

  describe(nodes: string[]): Route {
    let km = 0;
    let driveMin = 0;
    let toll = 0;
    for (let i = 1; i < nodes.length; i++) {
      const e = this.edgeBetween(nodes[i - 1], nodes[i]);
      if (!e) throw new Error(`Keine Kante ${nodes[i - 1]}–${nodes[i]}`);
      km += e.km;
      driveMin += e.truckMin;
      toll += e.toll;
    }
    return { nodes, km: Math.round(km * 10) / 10, driveMin, toll };
  }

  /** Kante und Position innerhalb der Kante bei km-Fortschritt entlang einer Knotenfolge. */
  locate(nodes: string[], progressKm: number): { edge: RoadEdge; reverse: boolean; kmIntoEdge: number; segIndex: number } | null {
    let acc = 0;
    for (let i = 1; i < nodes.length; i++) {
      const edge = this.edgeBetween(nodes[i - 1], nodes[i]);
      if (!edge) return null;
      if (progressKm <= acc + edge.km || i === nodes.length - 1) {
        return { edge, reverse: edge.a !== nodes[i - 1], kmIntoEdge: Math.min(edge.km, Math.max(0, progressKm - acc)), segIndex: i - 1 };
      }
      acc += edge.km;
    }
    return null;
  }

  /** Geografische Position entlang einer Knotenfolge (folgt der echten Straßengeometrie). */
  positionAlong(nodes: string[], progressKm: number): { pos: LonLat; bearing: number } {
    if (nodes.length < 2) {
      const c = CITY_BY_ID[nodes[0]];
      return { pos: [c.lon, c.lat], bearing: 0 };
    }
    const loc = this.locate(nodes, progressKm)!;
    const { edge, reverse, kmIntoEdge } = loc;
    const geomTotal = edge.cum[edge.cum.length - 1];
    const frac = edge.km > 0 ? kmIntoEdge / edge.km : 0;
    const d = (reverse ? 1 - frac : frac) * geomTotal;
    const p = pointAlong(edge.coords, edge.cum, d);
    return { pos: p.pos, bearing: reverse ? (p.bearing + 180) % 360 : p.bearing };
  }

  /** Vollständige Geometrie einer Knotenfolge (für Routenanzeige). */
  geometry(nodes: string[]): LonLat[] {
    const out: LonLat[] = [];
    for (let i = 1; i < nodes.length; i++) {
      const e = this.edgeBetween(nodes[i - 1], nodes[i]);
      if (!e) continue;
      const seg = e.a === nodes[i - 1] ? e.coords : [...e.coords].reverse();
      out.push(...(out.length ? seg.slice(1) : seg));
    }
    return out;
  }
}

function pairKey(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
