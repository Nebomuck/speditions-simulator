// Welt und Firmen-Shards (Grundlage für den Wettbewerbs-Multiplayer, siehe KONZEPT_WETTBEWERB.md).
//
// Der Spielzustand teilt sich in eine gemeinsame Welt (Zeit, Wetter, Konjunktur, Börse, Kunden, Konkurrenz …)
// und je Firma einen Shard (Firma, Fuhrpark, Personal, Fahrten, Finanzen …). Die Simulation arbeitet weiter auf
// einem `GameState`: `companyView` liefert dafür ein Objekt, dessen Felder per Getter/Setter auf Welt bzw. Shard
// zeigen. Bestehender Code (`state.company`, `state.vehicles`, `state.market` …) läuft so unverändert.

import type { Customer, GameState, Id, Order } from './types.ts';

/** Felder der gemeinsamen Welt */
export const WORLD_KEYS = [
  'format', 'version', 'seed', 'rng', 'nextId', 'time', 'speed', 'paused', 'difficulty', 'pauseOnDecision', 'pausedForDecision',
  'market', 'economy', 'weather', 'disruptions', 'competitors', 'events', 'news', 'vehicleOffers', 'orders', 'tenders',
] as const satisfies readonly (keyof GameState)[];

/** Felder einer Firma */
export const COMPANY_KEYS = [
  'company', 'players', 'customers', 'drivers', 'applicants', 'vehicles', 'trailers', 'trips', 'invoices', 'ledger', 'log', 'chat', 'stats', 'today',
  'contracts', 'autoDispatch', 'team', 'decisions', 'scenario', 'quarter', 'quarterHistory', 'progress', 'exit',
] as const satisfies readonly (keyof GameState)[];

type WorldKey = (typeof WORLD_KEYS)[number];
type CompanyKey = (typeof COMPANY_KEYS)[number];

// Vollständigkeit zur Übersetzungszeit: jedes Feld von GameState gehört genau einer Seite an
type Missing = Exclude<keyof GameState, WorldKey | CompanyKey>;
type Both = Extract<WorldKey, CompanyKey>;
const exhaustive: [Missing, Both] extends [never, never] ? true : { missing: Missing; both: Both } = true;
void exhaustive;

export type WorldFields = Pick<GameState, WorldKey>;
export type CompanyShard = Pick<GameState, CompanyKey>;

export interface WorldState extends WorldFields {
  /** Firmen der Welt, simuliert in der Reihenfolge von `companyOrder` */
  companies: Record<Id, CompanyShard>;
  companyOrder: Id[];
}

/** Kennung der einzigen Firma im Einzelspiel und in kooperativen Spielen */
export const MAIN_COMPANY: Id = 'c1';

const VIEW = Symbol('companyView');
interface ViewMeta {
  world: WorldState;
  companyId: Id;
}

/** Zerlegt einen flachen Spielzustand in Welt und einen Shard (mit denselben Objekten, ohne Kopie). */
export function splitState(state: GameState, companyId: Id = MAIN_COMPANY): WorldState {
  const meta = viewMeta(state);
  if (meta) return meta.world;
  const world = { companies: {}, companyOrder: [companyId] } as unknown as WorldState;
  const shard = {} as CompanyShard;
  const w = world as unknown as Record<string, unknown>;
  const sh = shard as unknown as Record<string, unknown>;
  const src = state as unknown as Record<string, unknown>;
  for (const k of WORLD_KEYS) if (k in src) w[k] = src[k];
  for (const k of COMPANY_KEYS) if (k in src) sh[k] = src[k];
  world.companies[companyId] = shard;
  return world;
}

/**
 * Ansicht einer Firma: verhält sich wie ein flacher `GameState`. Lesen und Schreiben gehen direkt an Welt bzw. Shard.
 * Ein einfaches Objekt mit Accessoren (kein Proxy), damit `structuredClone` und `postMessage` funktionieren.
 * Felder ohne Wert (z. B. `exit` vor einem Firmenverkauf) liefern `undefined` und fallen bei JSON und Deltas weg.
 */
export function companyView(world: WorldState, companyId: Id = MAIN_COMPANY): GameState {
  const shard = world.companies[companyId];
  if (!shard) throw new Error(`Unbekannte Firma ${companyId}`);
  const view = {} as Record<string | symbol, unknown>;
  const define = (key: string, target: Record<string, unknown>) =>
    Object.defineProperty(view, key, {
      get: () => target[key],
      set: (v: unknown) => {
        if (v === undefined) delete target[key];
        else target[key] = v;
      },
      enumerable: true,
      // austauschbar für Tests; die Simulation löscht keine Felder der obersten Ebene (siehe restoreState)
      configurable: true,
    });
  const w = world as unknown as Record<string, unknown>;
  const sh = shard as unknown as Record<string, unknown>;
  for (const k of WORLD_KEYS) define(k, w);
  for (const k of COMPANY_KEYS) define(k, sh);
  Object.defineProperty(view, VIEW, { value: { world, companyId } satisfies ViewMeta, enumerable: false });
  return view as unknown as GameState;
}

function viewMeta(state: GameState): ViewMeta | undefined {
  return (state as unknown as Record<symbol, ViewMeta | undefined>)[VIEW];
}

/** Ist der Zustand eine Firmenansicht auf eine Welt? */
export const isCompanyView = (state: GameState) => !!viewMeta(state);
/** Welt hinter einer Ansicht (bei flachem Zustand: neu zerlegt) */
export const worldOf = (state: GameState): WorldState => viewMeta(state)?.world ?? splitState(state);
/** Kennung der Firma hinter einer Ansicht */
export const companyIdOf = (state: GameState): Id => viewMeta(state)?.companyId ?? MAIN_COMPANY;

/**
 * Zustand auf eine frühere Kopie zurücksetzen (z. B. Rücknahme eines Befehls). Weist nur Werte zu, damit eine
 * Firmenansicht mit Welt und Shard verbunden bleibt; Felder, die es vorher nicht gab, werden geleert.
 */
export function restoreState(state: GameState, before: GameState): void {
  const s = state as unknown as Record<string, unknown>;
  const b = before as unknown as Record<string, unknown>;
  for (const k of Object.keys(s)) if (b[k] === undefined && s[k] !== undefined) s[k] = undefined;
  for (const k of Object.keys(b)) s[k] = b[k];
}

/** Flacher Zustand aus einer Ansicht oder Welt (für Speichern und Übertragung; tiefe Kopie über JSON) */
export function flatten(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

/** Ansichten der Firmen einer Welt in Simulationsreihenfolge (je Welt zwischengespeichert) */
const viewCache = new WeakMap<WorldState, Map<string, GameState>>();
export function companyViews(world: WorldState): GameState[] {
  let m = viewCache.get(world);
  if (!m) viewCache.set(world, (m = new Map()));
  const out: GameState[] = [];
  for (const id of world.companyOrder) {
    if (!world.companies[id]) continue;
    let v = m.get(id);
    if (!v) m.set(id, (v = companyView(world, id)));
    out.push(v);
  }
  return out;
}

// ---------------------------------------------------------------- Gemeinsame Börse und Kunden (D3)

/** Hat die Welt dieses Zustands mehrere Firmen? (Einzelspiel: nein – dort bleibt alles wie bisher) */
export function isMultiCompany(state: GameState): boolean {
  const meta = viewMeta(state);
  return !!meta && meta.world.companyOrder.length > 1;
}

/** Eigentümer eines Auftrags (fehlt: die erste Firma der Welt) */
export const orderOwner = (o: Order): Id => o.companyId ?? MAIN_COMPANY;

/** Sieht diese Firma den Auftrag? Offene Börsenangebote sehen alle, übernommene nur ihr Eigentümer. */
export const orderVisible = (state: GameState, o: Order | undefined): boolean =>
  !!o && (o.status === 'offered' || !isMultiCompany(state) || orderOwner(o) === companyIdOf(state));

/** Preis, den diese Firma für ein Börsenangebot bekommt (je Firma eigene Aufschläge für Treue, Vertrieb, Kampagnen) */
export const offerPayment = (state: GameState, o: Order): number => o.quotes?.[companyIdOf(state)] ?? o.payment;

/** Auftrag für die Firma übernehmen: Status, Eigentümer und Firmenpreis (Einzelspiel: nur der Status). */
export function claimOrder(state: GameState, o: Order): void {
  if (o.status === 'offered') o.status = 'accepted';
  if (!isMultiCompany(state)) return;
  const id = companyIdOf(state);
  if (o.companyId === undefined) {
    if (o.quotes?.[id] !== undefined) o.payment = o.quotes[id];
    o.companyId = id;
  }
  delete o.quotes;
}

/** Sicherheitsnetz nach Firmenschritten und Befehlen: übernommene Aufträge ohne Eigentümer gehören dieser Firma. */
export function tagClaimedOrders(state: GameState): void {
  if (!isMultiCompany(state)) return;
  for (const o of Object.values(state.orders)) if (o.status !== 'offered' && o.companyId === undefined) claimOrder(state, o);
}

/** Neuer Kunde: Stammdaten in alle Firmen spiegeln, Beziehung (Zufriedenheit, Lieferungen) beginnt je Firma neu. */
export function mirrorCustomer(state: GameState, c: Customer): void {
  const meta = viewMeta(state);
  if (!meta) return;
  for (const [id, shard] of Object.entries(meta.world.companies)) {
    if (id === meta.companyId || shard.customers[c.id]) continue;
    shard.customers[c.id] = freshRelation(c);
  }
}

/** Kunde mit neuer, neutraler Beziehung (für eine andere Firma) */
export function freshRelation(c: Customer): Customer {
  const { lostTo: _l, lostAt: _a, winBackAt: _w, ...base } = c;
  return { ...base, satisfaction: 50, deliveries: 0 };
}
