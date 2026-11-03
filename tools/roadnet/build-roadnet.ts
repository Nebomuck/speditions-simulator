// Erzeugt das Straßennetz der Spielwelt aus echten OpenStreetMap-Routen.
//
// Vorgehen: Zwischen benachbarten Städten (k nächste Nachbarn je Landmasse) wird einmalig eine
// Straßenroute bei einem OSRM-Server abgefragt. Die Geometrie wird vereinfacht und als
// Encoded Polyline in packages/core/src/data/roadnet.json gespeichert. Im Spiel wird danach
// vollständig offline per Dijkstra über dieses Netz geroutet.
//
// Lizenz: Routendaten © OpenStreetMap-Mitwirkende, ODbL 1.0 (Namensnennung im Spiel).
// Standard-Server: OSRM-Demo (router.project-osrm.org) – nur für diese einmalige, gedrosselte
// Erzeugung (~1 Anfrage/s). Eigener Server: OSRM_URL=http://localhost:5000 setzen.
// Fährabschnitte werden über die Routenschritte erkannt und nur bei definierten Übergängen zugelassen.
//
// Aufruf: npm run roadnet

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CITIES, CROSSINGS, type CityDef } from '../../packages/core/src/data/cities.ts';
import { decodePolyline, encodePolyline, haversineKm, simplify, type LonLat } from '../../packages/core/src/geo.ts';

const here = dirname(fileURLToPath(import.meta.url));
const CACHE = join(here, 'cache');
const OUT = join(here, '../../packages/core/src/data/roadnet.json');
const OSRM = process.env.OSRM_URL ?? 'https://router.project-osrm.org';
const K = 5;
const MAX_DETOUR = 2.2;
const SIMPLIFY_TOL = 0.0006; // ~50 m

mkdirSync(CACHE, { recursive: true });

const ll = (x: CityDef): LonLat => [x.lon, x.lat];
const key = (a: string, b: string) => (a < b ? `${a}__${b}` : `${b}__${a}`);

// 1) Kandidatenkanten bestimmen
const pairs = new Map<string, [CityDef, CityDef, boolean]>();
for (const a of CITIES) {
  const near = CITIES.filter((b) => b !== a && (b.land ?? 'main') === (a.land ?? 'main'))
    .map((b) => ({ b, d: haversineKm(ll(a), ll(b)) }))
    .sort((x, y) => x.d - y.d)
    .slice(0, K);
  for (const { b } of near) pairs.set(key(a.id, b.id), a.id < b.id ? [a, b, false] : [b, a, false]);
}
const byId = Object.fromEntries(CITIES.map((x) => [x.id, x]));
for (const [a, b] of CROSSINGS) pairs.set(key(a, b), [byId[a], byId[b], true]);
// Bisherige Kanten immer behalten: Laufende Fahrten in Spielständen bestehen aus Knotenfolgen über diese Kanten.
if (existsSync(OUT)) {
  const prev = JSON.parse(readFileSync(OUT, 'utf8')) as { edges: { a: string; b: string; ferry?: boolean }[] };
  for (const e of prev.edges) if (byId[e.a] && byId[e.b] && !pairs.has(key(e.a, e.b))) pairs.set(key(e.a, e.b), e.a < e.b ? [byId[e.a], byId[e.b], !!e.ferry] : [byId[e.b], byId[e.a], !!e.ferry]);
}

// Zusammenhang sicherstellen: Komponenten über nächstes Städtepaar verbinden (je Landmasse)
function components(edges: Iterable<[CityDef, CityDef, boolean]>) {
  const parent: Record<string, string> = {};
  const find = (x: string): string => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  for (const x of CITIES) parent[x.id] = x.id;
  for (const [a, b] of edges) parent[find(a.id)] = find(b.id);
  const groups = new Map<string, CityDef[]>();
  for (const x of CITIES) {
    const r = find(x.id);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(x);
  }
  return [...groups.values()];
}
for (;;) {
  const comps = components(pairs.values());
  if (comps.length <= 1) break;
  let best: { a: CityDef; b: CityDef; d: number } | null = null;
  const [first, ...rest] = comps;
  for (const a of first)
    for (const comp of rest)
      for (const b of comp) {
        if ((a.land ?? 'main') !== (b.land ?? 'main')) continue;
        const d = haversineKm(ll(a), ll(b));
        if (!best || d < best.d) best = { a, b, d };
      }
  if (!best) throw new Error('Komponenten nicht verbindbar');
  pairs.set(key(best.a.id, best.b.id), [best.a, best.b, false]);
}
console.log(`${CITIES.length} Städte, ${pairs.size} Kandidatenkanten`);

// 2) Routen abfragen (mit Cache)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
interface Raw {
  distance: number;
  duration: number;
  geometry: string;
  ferry: boolean;
}
interface OsrmRoute {
  distance: number;
  duration: number;
  geometry: string;
  legs: { steps: { mode: string }[] }[];
}
async function fetchRoute(a: CityDef, b: CityDef): Promise<Raw | null> {
  const file = join(CACHE, `${key(a.id, b.id)}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const url =
    `${OSRM}/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}` +
    `?overview=full&geometries=polyline6&steps=true`;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'SpeditionsSimulator-roadnet-builder/0.1 (one-time build)' } });
      if (res.status === 429) {
        await sleep(5000);
        continue;
      }
      const j = (await res.json()) as { code: string; routes?: OsrmRoute[] };
      await sleep(1100);
      if (j.code !== 'Ok' || !j.routes?.length) {
        writeFileSync(file, 'null');
        return null;
      }
      const r = j.routes[0];
      const ferry = r.legs.some((l) => l.steps.some((st) => st.mode === 'ferry'));
      const raw = { distance: r.distance, duration: r.duration, geometry: r.geometry, ferry };
      writeFileSync(file, JSON.stringify(raw));
      return raw;
    } catch (e) {
      console.warn('  Fehler, neuer Versuch:', (e as Error).message);
      await sleep(3000);
    }
  }
  return null;
}

interface OutEdge {
  a: string;
  b: string;
  km: number;
  min: number;
  ferry?: boolean;
  g: string;
}
const edges: OutEdge[] = [];
let n = 0;
for (const [a, b, crossing] of pairs.values()) {
  n++;
  const raw = await fetchRoute(a, b);
  const air = haversineKm(ll(a), ll(b));
  if (!raw) {
    console.log(`[${n}/${pairs.size}] ${a.name} – ${b.name}: keine Route`);
    continue;
  }
  const km = raw.distance / 1000;
  if (raw.ferry && !crossing) {
    console.log(`[${n}/${pairs.size}] ${a.name} – ${b.name}: Fährverbindung verworfen`);
    continue;
  }
  if (!crossing && km / air > MAX_DETOUR) {
    console.log(`[${n}/${pairs.size}] ${a.name} – ${b.name}: Umweg ${(km / air).toFixed(2)} verworfen`);
    continue;
  }
  const full = decodePolyline(raw.geometry, 6);
  const simple = simplify(full, SIMPLIFY_TOL);
  // Endpunkte exakt auf die Stadtkoordinaten setzen, damit Kanten nahtlos verbunden sind
  simple[0] = ll(a);
  simple[simple.length - 1] = ll(b);
  edges.push({
    a: a.id,
    b: b.id,
    km: Math.round(km * 10) / 10,
    min: Math.round(raw.duration / 6) / 10,
    ...(raw.ferry ? { ferry: true } : {}),
    g: encodePolyline(simple, 5),
  });
  if (n % 25 === 0) console.log(`[${n}/${pairs.size}] …`);
}

const finalComps = components(edges.map((e) => [byId[e.a], byId[e.b], false] as [CityDef, CityDef, boolean]));
if (finalComps.length > 1) {
  console.warn('WARNUNG: Netz nicht zusammenhängend:', finalComps.map((c) => c.map((x) => x.id).join(',')));
}

const out = {
  version: 1,
  generated: new Date().toISOString().slice(0, 10),
  attribution: '© OpenStreetMap-Mitwirkende (ODbL 1.0), Routen berechnet mit OSRM',
  edges,
};
writeFileSync(OUT, JSON.stringify(out));
console.log(`Fertig: ${edges.length} Kanten → ${OUT}`);
