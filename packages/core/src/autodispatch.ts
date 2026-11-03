// KI-Disposition: angestellte Disponenten prüfen Aufträge, wählen Fahrer, Fahrzeug und Auflieger,
// kalkulieren mit estimateTrip/validateDispatch und entscheiden anhand der Spielerregeln.
// Teilautomatisch entstehen Vorschläge, vollautomatisch wird direkt disponiert.
// Die Planungsqualität hängt von der Kompetenz des Disponenten ab (Suchtiefe, Kalkulationsfehler, Priorisierung).

import { CITY_BY_ID } from './data/cities.ts';
import { CARGO_BY_ID, TRUCK_BY_ID, loadSpace } from './data/catalog.ts';
import type { SimContext } from './context.ts';
import { VEHICLES_PER_DISPATCHER } from './company.ts';
import { createRelocation, createTrip, planEnd, queueJob, unqueueJob, validateDispatch, vehicleSchedule, type DispatchInput, type TripEstimate } from './dispatch.ts';
import { addLog, formatMoney } from './finance.ts';
import { driverTravel, sendDriver } from './personnel.ts';
import { haversineKm } from './geo.ts';
import { newId, rand } from './rng.ts';
import type { AutoDispatchState, DispatchRules, DispatchSuggestion, Driver, GameState, Id, Order, StaffMember, Trailer, Vehicle } from './types.ts';

export const DEFAULT_RULES: DispatchRules = {
  minProfit: 150_00,
  maxEmptyKm: 250,
  cargoIds: [],
  countries: [],
  regularsFirst: true,
  safeDeadlines: true,
  nearestFirst: false,
  chains: true,
  returnToBase: true,
  excludedVehicles: [],
};

export function defaultAutoDispatch(): AutoDispatchState {
  return { mode: 'manual', rules: { ...DEFAULT_RULES }, suggestions: [], idleHours: {}, stats: { planned: 0, profit: 0, relocations: 0 } };
}

/** Puffer bis zum Liefertermin bei „keine riskanten Termine“ */
export const SAFE_BUFFER_MIN = 120;
/** ab dieser Kompetenz plant der Disponent Folgeaufträge und reagiert auf Verspätungen */
export const CHAIN_MIN_SKILL = 40;
export const REACT_MIN_SKILL = 60;
const SUGGESTION_TTL = 3 * 60;
const RETURN_AFTER_HOURS = 24;
/** ohne Fahrer vor Ort: nach so vielen Stunden einen Fahrer per Bahn holen, höchstens aus dieser Entfernung */
const FETCH_DRIVER_AFTER_HOURS = 2;
const MAX_FETCH_KM = 1200;

const ll = (cityId: string): [number, number] => [CITY_BY_ID[cityId].lon, CITY_BY_ID[cityId].lat];

export function dispatchers(state: GameState): StaffMember[] {
  return (state.company.staff ?? []).filter((m) => m.dept === 'dispatch').sort((a, b) => b.skill - a.skill || a.id.localeCompare(b.id));
}

/** Welche Fahrzeuge betreut welcher Disponent? Je Disponent 8 Fahrzeuge, die besten zuerst. */
export function managedVehicles(state: GameState): { vehicle: Vehicle; staff: StaffMember }[] {
  const staff = dispatchers(state);
  const excluded = new Set(state.autoDispatch?.rules.excludedVehicles ?? []);
  const list = Object.values(state.vehicles).filter((v) => !excluded.has(v.id));
  const out: { vehicle: Vehicle; staff: StaffMember }[] = [];
  for (let i = 0; i < list.length && i < staff.length * VEHICLES_PER_DISPATCHER; i++) out.push({ vehicle: list[i], staff: staff[Math.floor(i / VEHICLES_PER_DISPATCHER)] });
  return out;
}

/** Suchtiefe: wie viele Aufträge ein Disponent je Fahrzeug durchrechnet */
export const searchDepth = (skill: number) => Math.round(4 + (skill / 100) * 26);

interface Candidate {
  order: Order;
  input: DispatchInput;
  queued: boolean;
  estimate: TripEstimate;
  /** vom Disponenten wahrgenommener Gewinn (mit Kalkulationsfehler) */
  perceived: number;
  score: number;
}

interface Reserved {
  orders: Set<Id>;
  drivers: Set<Id>;
  trailers: Set<Id>;
  vehicles: Set<Id>;
}

function passesRules(rules: DispatchRules, o: Order): boolean {
  if (rules.cargoIds.length && !rules.cargoIds.includes(o.cargoId)) return false;
  if (rules.countries.length && !(rules.countries.includes(CITY_BY_ID[o.fromCityId].country) && rules.countries.includes(CITY_BY_ID[o.toCityId].country))) return false;
  return true;
}

/** Bester Auftrag für ein Fahrzeug nach den Regeln – oder null. */
function bestFor(state: GameState, ctx: SimContext, vehicle: Vehicle, staff: StaffMember, reserved: Reserved): Candidate | null {
  const rules = state.autoDispatch.rules;
  const skill = staff.skill;
  const err = 1 - skill / 100;
  const model = TRUCK_BY_ID[vehicle.modelId];
  const queued = vehicle.status === 'on_trip';
  let startCity = vehicle.cityId;
  let startTime = state.time;
  let fixedDriver: Driver | undefined;
  let fixedTrailer: Trailer | undefined;
  if (queued) {
    const trip = vehicle.tripId ? state.trips[vehicle.tripId] : undefined;
    const end = planEnd(state, ctx, vehicle.id);
    if (!trip || !end) return null;
    startCity = end.cityId;
    startTime = end.time;
    fixedDriver = state.drivers[trip.driverId];
    fixedTrailer = trip.trailerId ? state.trailers[trip.trailerId] : undefined;
  }
  const drivers = fixedDriver
    ? [fixedDriver]
    : Object.values(state.drivers).filter((d) => d.status === 'idle' && d.cityId === vehicle.cityId && d.leavesAt === undefined && !reserved.drivers.has(d.id));
  if (!drivers.length) return null;
  const trailers = model.body
    ? []
    : fixedTrailer
      ? [fixedTrailer]
      : Object.values(state.trailers).filter((t) => t.status === 'idle' && t.cityId === vehicle.cityId && !reserved.trailers.has(t.id));
  if (!model.body && !trailers.length) return null;

  // Steht der LKW schon länger, nimmt der Disponent auch weitere Anfahrten in Kauf (bis zum Vierfachen) –
  // besser als leer zum Standort zurück. Ein unerfahrener Disponent unterschätzt Leerfahrten.
  const maxEmpty = rules.maxEmptyKm * (queued ? 1 : Math.min(4, 1 + (state.autoDispatch.idleHours[vehicle.id] ?? 0) / 4));
  const emptyLimit = maxEmpty * (1 + err * 0.4);
  const pool = Object.values(state.orders).filter((o) => {
    if (reserved.orders.has(o.id)) return false;
    if (o.status === 'accepted') {
      if (o.tripId) return false;
    } else if (o.status !== 'offered' || state.time >= o.offerExpires) return false;
    if (o.status === 'offered' && !passesRules(rules, o)) return false;
    if (o.pickupEnd < startTime) return false;
    const space = loadSpace(vehicle.modelId, model.body ? undefined : o.trailerType);
    if (!space || space.type !== o.trailerType || space.payloadT < o.weightT) return false;
    if (!model.body && !trailers.some((t) => t.type === o.trailerType)) return false;
    if (!drivers.some((d) => o.qualifications.every((q) => d.qualifications.includes(q)))) return false;
    // Straßen-km ≥ Luftlinie: alles, was schon per Luftlinie zu weit ist, fällt heraus (angenommene Aufträge nicht)
    return o.status === 'accepted' || haversineKm(ll(startCity), ll(o.fromCityId)) <= emptyLimit;
  });
  // Vorsortierung nach grober Wirtschaftlichkeit, dann die besten `depth` genau kalkulieren
  const rough = (o: Order) => (o.status === 'accepted' ? 1e12 : 0) + o.payment - haversineKm(ll(startCity), ll(o.fromCityId)) * 150;
  const shortlist = pool.sort((a, b) => rough(b) - rough(a)).slice(0, searchDepth(skill));

  const out: Candidate[] = [];
  for (const o of shortlist) {
    const committed = o.status === 'accepted';
    const driver = drivers
      .filter((d) => o.qualifications.every((q) => d.qualifications.includes(q)))
      .sort((a, b) => (skill >= 50 ? a.hos.drivenWeek - b.hos.drivenWeek : 0) || a.id.localeCompare(b.id))[0];
    const trailer = model.body ? undefined : trailers.filter((t) => t.type === o.trailerType).sort((a, b) => b.condition - a.condition)[0];
    if (!driver || (!model.body && !trailer)) continue;
    const input: DispatchInput = { orderId: o.id, driverId: driver.id, vehicleId: vehicle.id, trailerId: trailer?.id ?? '' };
    const { issues, estimate } = validateDispatch(state, ctx, input, { queued });
    if (!estimate || issues.some((i) => i.level === 'error')) continue;
    // Abholfenster nicht erreichbar: einem anderen Fahrzeug überlassen
    if (committed && issues.some((i) => i.code === 'pickup_late')) continue;
    // als Folgeauftrag zu spät: nicht wieder einplanen (wurde gerade deshalb freigegeben)
    if (committed && queued && estimate.lateMin > 60) continue;
    // Kalkulationsfehler: ±25 % bei Kompetenz 0, exakt bei 100
    const perceived = estimate.profit * (1 + rand.normal(state, 0, err * 0.25));
    const perceivedEmpty = estimate.emptyKm * (1 - err * 0.3 * rand.float(state, 0, 1));
    if (!committed) {
      if (perceived < rules.minProfit) continue;
      if (perceivedEmpty > maxEmpty) continue;
      if (issues.some((i) => i.code === 'pickup_late')) continue;
      // Unerfahrene Disponenten schätzen Fahrzeiten zu optimistisch ein
      const optimism = skill < 50 ? rand.float(state, 0, 90) * err : 0;
      const slack = o.deliveryEnd - estimate.deliveryEta + optimism;
      if (rules.safeDeadlines ? slack < SAFE_BUFFER_MIN : estimate.lateMin > 0 && skill >= 30) continue;
    }
    const cust = state.customers[o.customerId];
    let score = rules.nearestFirst ? 100_000_00 - estimate.emptyKm * 1_00 * 100 + perceived / 100 : perceived;
    if (rules.regularsFirst && cust?.deliveries > 0) score += Math.abs(score) * 0.15 + 50_00;
    if (o.contractId) score += 200_00;
    if (committed) score += 1e12; // bereits zugesagte Aufträge haben Vorrang
    out.push({ order: o, input, queued, estimate, perceived, score });
  }
  if (!out.length) return null;
  out.sort((a, b) => b.score - a.score);
  // Falsche Priorisierung: unerfahrene Disponenten greifen manchmal zum zweitbesten Auftrag
  if (out.length > 1 && out[1].score < 1e11 === out[0].score < 1e11 && rand.chance(state, err * 0.3)) return out[1];
  return out[0];
}

function describe(c: { order: Order; estimate: TripEstimate }, queued: boolean): string {
  const o = c.order;
  return `${CARGO_BY_ID[o.cargoId].name} ${CITY_BY_ID[o.fromCityId].name} → ${CITY_BY_ID[o.toCityId].name}${queued ? ' als Folgeauftrag' : ''} · ${Math.round(c.estimate.emptyKm)} km leer · Gewinn ca. ${formatMoney(c.estimate.profit)}`;
}

/** Vorschlag bzw. Entscheidung ausführen. Liefert eine Fehlermeldung, wenn es (inzwischen) nicht mehr geht. */
function execute(state: GameState, ctx: SimContext, s: Pick<DispatchSuggestion, 'kind' | 'orderId' | 'vehicleId' | 'driverId' | 'trailerId' | 'toCityId'>, staff: StaffMember | undefined): string | null {
  const who = staff ? `Disponent ${staff.name}` : 'Disposition';
  const vehicle = state.vehicles[s.vehicleId];
  if (!vehicle) return 'Fahrzeug nicht mehr vorhanden.';
  if (s.kind === 'relocate') {
    const d = state.drivers[s.driverId];
    if (!d || d.status !== 'idle' || vehicle.status !== 'idle' || d.cityId !== vehicle.cityId || !s.toCityId) return 'Fahrer oder LKW nicht mehr verfügbar.';
    const t = s.trailerId ? state.trailers[s.trailerId] : undefined;
    createRelocation(state, ctx, d.id, vehicle.id, t && t.status === 'idle' && t.cityId === vehicle.cityId ? t.id : undefined, s.toCityId);
    state.autoDispatch.stats.relocations++;
    addLog(state, { level: 'info', category: 'trip', text: `${who}: ${vehicle.plate} fährt ohne Anschlussauftrag zurück zum Standort ${CITY_BY_ID[s.toCityId].name}.`, ref: { kind: 'vehicle', id: vehicle.id } });
    return null;
  }
  const order = s.orderId ? state.orders[s.orderId] : undefined;
  if (!order) return 'Auftrag nicht mehr vorhanden.';
  const wasOffered = order.status === 'offered';
  const input: DispatchInput = { orderId: order.id, driverId: s.driverId, vehicleId: vehicle.id, trailerId: s.trailerId ?? '' };
  let estimate: TripEstimate | null;
  if (s.kind === 'queue') {
    estimate = validateDispatch(state, ctx, input, { queued: true }).estimate;
    const r = queueJob(state, ctx, vehicle.id, order.id);
    if (!r.ok) return r.error;
  } else {
    const v = validateDispatch(state, ctx, input);
    const e = v.issues.find((i) => i.level === 'error');
    if (e || !v.estimate) return e?.text ?? 'Disposition nicht möglich.';
    if (order.status === 'offered') order.status = 'accepted';
    createTrip(state, ctx, input, v.estimate);
    estimate = v.estimate;
  }
  const st = state.autoDispatch.stats;
  st.planned++;
  st.profit += estimate?.profit ?? 0;
  if (staff) staff.skill = Math.min(95, staff.skill + 0.05);
  addLog(state, {
    level: 'info',
    category: 'trip',
    text: `${who}: ${vehicle.plate} übernimmt ${estimate ? describe({ order, estimate }, s.kind === 'queue') : `${CITY_BY_ID[order.fromCityId].name} → ${CITY_BY_ID[order.toCityId].name}`}${wasOffered ? ' (Angebot angenommen)' : ''}.`,
    ref: { kind: 'order', id: order.id },
  });
  return null;
}

function nearestLocation(state: GameState, cityId: string): string | null {
  let best: string | null = null;
  let bestKm = Infinity;
  for (const l of state.company.locations) {
    const km = haversineKm(ll(cityId), ll(l.cityId));
    if (km < bestKm) [best, bestKm] = [l.cityId, km];
  }
  return best;
}

/** Stündlich: Disponenten planen bzw. schlagen vor. */
export function runAutoDispatch(state: GameState, ctx: SimContext): void {
  const ad = (state.autoDispatch ??= defaultAutoDispatch());
  // Vorschläge verfallen oder werden ungültig
  ad.suggestions = ad.suggestions.filter((s) => {
    if (state.time >= s.expires) return false;
    const o = s.orderId ? state.orders[s.orderId] : undefined;
    if (s.orderId && (!o || (o.status !== 'offered' && o.status !== 'accepted') || o.tripId || (o.status === 'offered' && state.time >= o.offerExpires))) return false;
    return !!state.vehicles[s.vehicleId];
  });
  if (ad.mode === 'manual') return;
  const managed = managedVehicles(state);
  if (!managed.length) return;

  const reserved: Reserved = { orders: new Set(), drivers: new Set(), trailers: new Set(), vehicles: new Set() };
  for (const s of ad.suggestions) {
    if (s.orderId) reserved.orders.add(s.orderId);
    reserved.drivers.add(s.driverId);
    if (s.trailerId) reserved.trailers.add(s.trailerId);
    reserved.vehicles.add(s.vehicleId);
  }

  for (const { vehicle, staff } of managed) {
    // Auf Verspätungen reagieren: verspätete Folgeaufträge wieder freigeben, damit ein anderer LKW sie übernimmt
    if (ad.mode === 'auto' && staff.skill >= REACT_MIN_SKILL && vehicle.queue?.length) {
      for (const item of vehicleSchedule(state, ctx, vehicle.id))
        if (item.kind === 'queued' && item.orderId && item.lateMin > 60 && unqueueJob(state, vehicle.id, item.orderId))
          addLog(state, { level: 'warning', category: 'trip', text: `Disponent ${staff.name}: Folgeauftrag von ${vehicle.plate} käme zu spät und wird neu vergeben.`, ref: { kind: 'order', id: item.orderId } });
    }
    if (reserved.vehicles.has(vehicle.id)) continue;
    const idle = vehicle.status === 'idle';
    const chain = vehicle.status === 'on_trip' && ad.rules.chains && staff.skill >= CHAIN_MIN_SKILL && !vehicle.queue?.length;
    if (!idle && !chain) continue;
    if (idle && vehicle.condition < 15) continue;

    const c = bestFor(state, ctx, vehicle, staff, reserved);
    if (c) {
      if (idle) delete ad.idleHours[vehicle.id];
      reserved.orders.add(c.order.id);
      reserved.drivers.add(c.input.driverId);
      if (c.input.trailerId) reserved.trailers.add(c.input.trailerId);
      reserved.vehicles.add(vehicle.id);
      const base = { kind: c.queued ? ('queue' as const) : ('dispatch' as const), orderId: c.order.id, vehicleId: vehicle.id, driverId: c.input.driverId, trailerId: c.input.trailerId || undefined };
      if (ad.mode === 'auto') execute(state, ctx, base, staff);
      else
        ad.suggestions.push({
          ...base, id: newId(state, 'sug'), profit: c.estimate.profit, emptyKm: c.estimate.emptyKm, staffId: staff.id,
          reason: describe(c, c.queued), created: state.time, expires: Math.min(state.time + SUGGESTION_TTL, c.order.status === 'offered' ? c.order.offerExpires : Infinity),
        });
      continue;
    }

    // Kein Auftrag: nach 24 h zurück zum nächsten Standort
    if (!idle) continue;
    // Ruhezeit des Fahrers ist keine Standzeit ohne Auftrag
    const here = Object.values(state.drivers).filter((d) => d.status === 'idle' && d.cityId === vehicle.cityId);
    if (here.length && here.every((d) => d.hos.requiredRest > 0)) continue;
    ad.idleHours[vehicle.id] = (ad.idleHours[vehicle.id] ?? 0) + 1;
    // Kein Fahrer vor Ort: einen überzähligen freien Fahrer per Bahn holen (statt den LKW stehen zu lassen)
    if (!here.length && ad.mode === 'auto' && ad.idleHours[vehicle.id] >= FETCH_DRIVER_AFTER_HOURS && fetchDriver(state, ctx, vehicle, staff, reserved)) continue;
    if (!ad.rules.returnToBase || ad.idleHours[vehicle.id] < RETURN_AFTER_HOURS) continue;
    if (state.company.locations.some((l) => l.cityId === vehicle.cityId)) continue;
    const to = nearestLocation(state, vehicle.cityId);
    const driver = Object.values(state.drivers).find((d) => d.status === 'idle' && d.cityId === vehicle.cityId && !reserved.drivers.has(d.id));
    if (!to || !driver || !ctx.net.route(vehicle.cityId, to)) continue;
    const trailer = Object.values(state.trailers).find((t) => t.status === 'idle' && t.cityId === vehicle.cityId && !reserved.trailers.has(t.id));
    reserved.drivers.add(driver.id);
    reserved.vehicles.add(vehicle.id);
    if (trailer) reserved.trailers.add(trailer.id);
    delete ad.idleHours[vehicle.id];
    const base = { kind: 'relocate' as const, vehicleId: vehicle.id, driverId: driver.id, trailerId: trailer?.id, toCityId: to };
    if (ad.mode === 'auto') execute(state, ctx, base, staff);
    else
      ad.suggestions.push({
        ...base, id: newId(state, 'sug'), profit: 0, emptyKm: ctx.net.route(vehicle.cityId, to)!.km, staffId: staff.id,
        reason: `Seit ${RETURN_AFTER_HOURS} h kein passender Auftrag – Überführung nach ${CITY_BY_ID[to].name}`, created: state.time, expires: state.time + SUGGESTION_TTL,
      });
  }
}

/**
 * Fahrer für einen LKW ohne Fahrer holen: nur Fahrer, die dort, wo sie sind, keinen freien LKW haben
 * (überzählig), und die nächstgelegenen zuerst. Unterwegs befindliche Fahrer zum selben Ort zählen mit.
 */
function fetchDriver(state: GameState, ctx: SimContext, vehicle: Vehicle, staff: StaffMember, reserved: Reserved): boolean {
  const idleVehicles = (city: string) => Object.values(state.vehicles).filter((v) => v.status === 'idle' && v.cityId === city).length;
  const drivers = Object.values(state.drivers);
  const incoming = drivers.filter((d) => d.status === 'traveling' && d.travelTo === vehicle.cityId).length;
  const present = drivers.filter((d) => d.status === 'idle' && d.cityId === vehicle.cityId).length;
  if (incoming + present >= idleVehicles(vehicle.cityId)) return false;
  const surplus = (d: Driver) => drivers.filter((o) => o.status === 'idle' && o.cityId === d.cityId && !reserved.drivers.has(o.id)).length > idleVehicles(d.cityId);
  const best = drivers
    .filter((d) => d.status === 'idle' && d.cityId !== vehicle.cityId && d.leavesAt === undefined && !reserved.drivers.has(d.id))
    .filter(surplus)
    .map((d) => ({ d, t: driverTravel(ctx, d.cityId, vehicle.cityId) }))
    .filter((x) => x.t && x.t.km <= MAX_FETCH_KM)
    .sort((a, b) => a.t!.km - b.t!.km || a.d.id.localeCompare(b.d.id))[0];
  if (!best) return false;
  const r = sendDriver(state, ctx, best.d.id, vehicle.cityId);
  if (!r.ok) return false;
  reserved.drivers.add(best.d.id);
  state.autoDispatch.stats.relocations++;
  addLog(state, { level: 'info', category: 'trip', text: `Disponent ${staff.name}: ${best.d.name} reist zu ${vehicle.plate} nach ${CITY_BY_ID[vehicle.cityId].name}.`, ref: { kind: 'vehicle', id: vehicle.id } });
  return true;
}

// ---------------------------------------------------------------- Befehle

export function setAutoDispatch(state: GameState, mode: AutoDispatchState['mode'] | undefined, rules: Partial<DispatchRules> | undefined): { ok: true } | { ok: false; error: string } {
  const ad = (state.autoDispatch ??= defaultAutoDispatch());
  if (mode !== undefined) {
    if (!['manual', 'assist', 'auto'].includes(mode)) return { ok: false, error: 'Unbekannter Modus.' };
    if (mode !== 'manual' && dispatchers(state).length === 0) return { ok: false, error: 'Für die automatische Disposition zuerst einen Disponenten einstellen (Standorte & Ausbau → Abteilungen).' };
    if (mode !== ad.mode)
      addLog(state, { level: 'info', category: 'company', text: `Disposition: ${{ manual: 'manuell', assist: 'teilautomatisch (Vorschläge)', auto: 'vollautomatisch' }[mode]}.` });
    ad.mode = mode;
    if (mode !== 'assist') ad.suggestions = [];
  }
  if (rules) {
    const r = { ...ad.rules, ...rules };
    r.minProfit = Math.round(Math.max(-100_000_00, Math.min(100_000_00, Number(r.minProfit) || 0)));
    r.maxEmptyKm = Math.round(Math.max(0, Math.min(3000, Number(r.maxEmptyKm) || 0)));
    r.cargoIds = (r.cargoIds ?? []).filter((c) => CARGO_BY_ID[c]);
    r.countries = (r.countries ?? []).filter((c) => typeof c === 'string' && c.length === 2);
    r.excludedVehicles = (r.excludedVehicles ?? []).filter((id) => state.vehicles[id]);
    for (const k of ['regularsFirst', 'safeDeadlines', 'nearestFirst', 'chains', 'returnToBase'] as const) r[k] = !!r[k];
    ad.rules = r;
  }
  return { ok: true };
}

export function acceptSuggestion(state: GameState, ctx: SimContext, id: Id): { ok: true } | { ok: false; error: string } {
  const ad = state.autoDispatch;
  const s = ad?.suggestions.find((x) => x.id === id);
  if (!s) return { ok: false, error: 'Vorschlag ist nicht mehr aktuell.' };
  ad.suggestions = ad.suggestions.filter((x) => x !== s);
  const staff = (state.company.staff ?? []).find((m) => m.id === s.staffId);
  const error = execute(state, ctx, s, staff);
  return error ? { ok: false, error } : { ok: true };
}

export function dismissSuggestion(state: GameState, id: Id): { ok: true } | { ok: false; error: string } {
  const ad = state.autoDispatch;
  if (!ad?.suggestions.some((x) => x.id === id)) return { ok: false, error: 'Vorschlag nicht gefunden.' };
  ad.suggestions = ad.suggestions.filter((x) => x.id !== id);
  return { ok: true };
}
