// Delta-Synchronisation: Der Server schickt nach dem ersten Vollzustand nur noch die Änderungen.
// `diffState` vergleicht zwei JSON-Zustände und liefert eine Liste von Operationen, `applyPatch` wendet
// sie unveränderlich an (geänderte Pfade werden kopiert, alles andere bleibt geteilt – gut für React).
// Listen, die vorne gekürzt und hinten verlängert werden (Protokoll, Chat, Buchungen), werden als
// „vorne n entfernen, hinten anhängen“ übertragen statt komplett.

type Key = string | number;

export type PatchOp =
  /** Wert setzen */
  | { p: Key[]; v: unknown }
  /** Schlüssel löschen */
  | { p: Key[]; d: 1 }
  /** Liste: vorne `drop` Einträge entfernen, `push` anhängen */
  | { p: Key[]; drop: number; push: unknown[] };

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** Tiefer Vergleich zweier JSON-Werte (undefined-Eigenschaften zählen als nicht vorhanden). */
export function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!sameJson(a[i], b[i])) return false;
    return true;
  }
  if (isObj(a) && isObj(b)) {
    for (const k in a) if (a[k] !== undefined && !sameJson(a[k], b[k])) return false;
    for (const k in b) if (b[k] !== undefined && a[k] === undefined) return false;
    return true;
  }
  // NaN/Infinity werden in JSON zu null
  return typeof a === 'number' && typeof b === 'number' && !Number.isFinite(a) && !Number.isFinite(b);
}

/** so weit wird nach einer vorne gekürzten Liste gesucht */
const MAX_DROP = 64;

function diffArray(a: unknown[], b: unknown[], path: Key[], ops: PatchOp[]) {
  // gleiche Länge: elementweise
  if (a.length === b.length) {
    for (let i = 0; i < a.length; i++) diffValue(a[i], b[i], [...path, i], ops);
    return;
  }
  // vorne gekürzt und/oder hinten verlängert?
  for (let drop = 0; drop <= Math.min(MAX_DROP, a.length); drop++) {
    const keep = a.length - drop;
    if (keep > b.length) continue;
    if (keep > 0 && !sameJson(a[drop], b[0])) continue;
    let ok = true;
    for (let i = 1; i < keep && ok; i++) ok = sameJson(a[drop + i], b[i]);
    if (!ok) continue;
    ops.push({ p: path, drop, push: b.slice(keep) });
    return;
  }
  ops.push({ p: path, v: b });
}

function diffValue(a: unknown, b: unknown, path: Key[], ops: PatchOp[]) {
  if (a === b) return;
  if (Array.isArray(a) && Array.isArray(b)) return diffArray(a, b, path, ops);
  if (isObj(a) && isObj(b)) {
    for (const k in b) {
      if (b[k] === undefined) continue;
      if (a[k] === undefined) ops.push({ p: [...path, k], v: b[k] });
      else diffValue(a[k], b[k], [...path, k], ops);
    }
    for (const k in a) if (a[k] !== undefined && b[k] === undefined) ops.push({ p: [...path, k], d: 1 });
    return;
  }
  if (!sameJson(a, b)) ops.push({ p: path, v: b });
}

/** Änderungen von `prev` nach `next` (beides JSON-kompatible Werte). Leere Liste = unverändert. */
export function diffState(prev: unknown, next: unknown): PatchOp[] {
  const ops: PatchOp[] = [];
  diffValue(prev, next, [], ops);
  return ops;
}

function setIn(node: unknown, path: Key[], i: number, op: PatchOp): unknown {
  if (i === path.length) {
    if ('v' in op) return op.v;
    if ('drop' in op) return [...(node as unknown[]).slice(op.drop), ...op.push];
    return undefined;
  }
  const k = path[i];
  if (Array.isArray(node)) {
    const copy = node.slice();
    copy[k as number] = setIn(node[k as number], path, i + 1, op);
    return copy;
  }
  const obj = (isObj(node) ? node : {}) as Record<string, unknown>;
  const copy = { ...obj };
  if (i === path.length - 1 && 'd' in op) delete copy[k];
  else copy[k] = setIn(obj[k], path, i + 1, op);
  return copy;
}

/** Operationen unveränderlich anwenden; liefert den neuen Wert. */
export function applyPatch<T>(base: T, ops: PatchOp[]): T {
  let cur: unknown = base;
  for (const op of ops) cur = setIn(cur, op.p, 0, op);
  return cur as T;
}
