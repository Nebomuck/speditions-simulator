// Geometrie-Hilfsfunktionen (WGS84). Koordinaten immer als [lon, lat] wie in GeoJSON.

export type LonLat = [number, number];

const R_KM = 6371.0088;
const toRad = (d: number) => (d * Math.PI) / 180;

export function haversineKm(a: LonLat, b: LonLat): number {
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Google Encoded Polyline (Präzision 5). Eingabe [lon,lat]. */
export function encodePolyline(coords: LonLat[], precision = 5): string {
  const f = 10 ** precision;
  let out = '';
  let pLat = 0;
  let pLon = 0;
  const enc = (v: number) => {
    v = v < 0 ? ~(v << 1) : v << 1;
    let s = '';
    while (v >= 0x20) {
      s += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    return s + String.fromCharCode(v + 63);
  };
  for (const [lon, lat] of coords) {
    const iLat = Math.round(lat * f);
    const iLon = Math.round(lon * f);
    out += enc(iLat - pLat) + enc(iLon - pLon);
    pLat = iLat;
    pLon = iLon;
  }
  return out;
}

export function decodePolyline(str: string, precision = 5): LonLat[] {
  const f = 10 ** precision;
  const out: LonLat[] = [];
  let i = 0;
  let lat = 0;
  let lon = 0;
  const next = () => {
    let result = 0;
    let shift = 0;
    let b: number;
    do {
      b = str.charCodeAt(i++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (i < str.length) {
    lat += next();
    lon += next();
    out.push([lon / f, lat / f]);
  }
  return out;
}

/** Douglas-Peucker-Vereinfachung; Toleranz in Grad (näherungsweise). */
export function simplify(coords: LonLat[], tol: number): LonLat[] {
  if (coords.length <= 2) return coords.slice();
  const keep = new Uint8Array(coords.length);
  keep[0] = keep[coords.length - 1] = 1;
  const stack: [number, number][] = [[0, coords.length - 1]];
  const tol2 = tol * tol;
  while (stack.length) {
    const [s, e] = stack.pop()!;
    const [x1, y1] = coords[s];
    const [x2, y2] = coords[e];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy || 1e-18;
    let maxD = -1;
    let idx = -1;
    for (let k = s + 1; k < e; k++) {
      const [px, py] = coords[k];
      let t = ((px - x1) * dx + (py - y1) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const qx = x1 + t * dx - px;
      const qy = y1 + t * dy - py;
      const d = qx * qx + qy * qy;
      if (d > maxD) {
        maxD = d;
        idx = k;
      }
    }
    if (maxD > tol2 && idx > 0) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return coords.filter((_, k) => keep[k]);
}

/** Kumulierte Distanzen (km) entlang einer Polylinie. */
export function cumulativeKm(coords: LonLat[]): Float64Array {
  const cum = new Float64Array(coords.length);
  for (let k = 1; k < coords.length; k++) cum[k] = cum[k - 1] + haversineKm(coords[k - 1], coords[k]);
  return cum;
}

/** Position bei Distanz d (km) entlang Polylinie mit kumulierten Distanzen; liefert Punkt und Richtung (Grad). */
export function pointAlong(coords: LonLat[], cum: Float64Array, d: number): { pos: LonLat; bearing: number } {
  const n = coords.length;
  if (n === 0) return { pos: [0, 0], bearing: 0 };
  if (d <= 0 || n === 1) return { pos: coords[0], bearing: n > 1 ? bearing(coords[0], coords[1]) : 0 };
  const total = cum[n - 1];
  if (d >= total) return { pos: coords[n - 1], bearing: bearing(coords[n - 2], coords[n - 1]) };
  // binäre Suche
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= d) lo = mid;
    else hi = mid;
  }
  const seg = cum[hi] - cum[lo] || 1e-9;
  const t = (d - cum[lo]) / seg;
  const a = coords[lo];
  const b = coords[hi];
  return { pos: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], bearing: bearing(a, b) };
}

export function bearing(a: LonLat, b: LonLat): number {
  const y = Math.sin(toRad(b[0] - a[0])) * Math.cos(toRad(b[1]));
  const x =
    Math.cos(toRad(a[1])) * Math.sin(toRad(b[1])) -
    Math.sin(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.cos(toRad(b[0] - a[0]));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
