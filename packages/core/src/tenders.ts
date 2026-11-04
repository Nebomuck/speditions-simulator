// Ausschreibungen: Große Verlader vergeben Rahmenverträge (3–6 Monate) per verdecktem Gebot. Der Spieler
// bietet einen Preis je Tour, optional mit Pünktlichkeitsgarantie; KI-Speditionen mit Standort in der Nähe
// bieten mit. Den Zuschlag bekommt das beste Verhältnis aus Preis und Ruf (der Ruf wiegt höchstens gut 6 %). Gewonnene Ausschreibungen
// werden zu laufenden Rahmenverträgen, verlorene zeigen, wer zu welchem Preis gewonnen hat.

import type { SimContext } from './context.ts';
import { activeCompetitors, nearCompetitor } from './competition.ts';
import { deptCount } from './company.ts';
import { acceptContract } from './contracts.ts';
import { CITIES, CITY_BY_ID } from './data/cities.ts';
import { CARGOS, CARGO_BY_ID, TRUCK_BY_ID } from './data/catalog.ts';
import { addLog, formatMoney } from './finance.ts';
import { customerFor } from './generate.ts';
import { haversineKm } from './geo.ts';
import { baseRate, pickDestination } from './orders.ts';
import { newId, rand } from './rng.ts';
import { MIN_PER_DAY, formatDateTime } from './time.ts';
import type { Contract, GameState, Id, Money, Tender } from './types.ts';

/** so viele offene Ausschreibungen gibt es (plus eine je Vertriebsmitarbeiter) */
export const TENDER_TARGET = 2;
/** Gebote außerhalb dieser Spanne um den Marktpreis werden nicht angenommen */
export const BID_RANGE = [0.6, 1.5] as const;
/** Garantie: Gebot wiegt 5 % besser, jede verspätete Tour kostet die halbe Vertragsstrafe */
export const GUARANTEE_BONUS = 0.05;

/** wie stark der Ruf in die Bewertung eingeht: ±6,25 % bei Ruf 25 bzw. 75 */
export const reputationFactor = (rep: number) => 1 - (rep - 50) / 400;
/** Bewertung eines Gebots (kleiner ist besser) */
export const bidScore = (price: Money, reputation: number, guarantee = false) => price * reputationFactor(reputation) * (guarantee ? 1 - GUARANTEE_BONUS : 1);

export const tenderVolume = (t: Tender) => t.referencePrice * t.weekdays.length * t.weeks;

/** Neue Ausschreibung im Umkreis der eigenen Standorte */
export function generateTender(state: GameState, ctx: SimContext): Tender | null {
  // bevorzugt Ladungen, die die eigene Flotte fahren kann
  const spaces = new Set<string>(Object.values(state.trailers).map((t) => t.type));
  for (const v of Object.values(state.vehicles)) {
    const body = TRUCK_BY_ID[v.modelId]?.body;
    if (body) spaces.add(body);
  }
  const cargo = rand.weighted(state, CARGOS, (g) => g.freq * (spaces.has(g.trailer) ? 3 : 1) * (g.qualifications.length ? 0.5 : 1));
  if (!cargo) return null;
  const anchors = state.company.locations.map((l) => CITY_BY_ID[l.cityId]);
  const near = CITIES.filter((c) => ctx.net.hasCity(c.id) && c.pop >= 150 && c.industries.some((i) => cargo.producers.includes(i)) && anchors.some((a) => haversineKm([a.lon, a.lat], [c.lon, c.lat]) <= 450));
  const origin = rand.weighted(state, near, (c) => Math.sqrt(c.pop));
  if (!origin) return null;
  const dest = pickDestination(state, ctx, origin, cargo, 1100, 150);
  const route = dest ? ctx.net.route(origin.id, dest.id) : null;
  if (!dest || !route) return null;
  const customer = customerFor(state, origin.id, origin.industries.find((i) => cargo.producers.includes(i))!);
  if (customer.lostTo) return null;
  const perWeek = rand.weighted(state, [2, 3, 5], (n) => (n === 5 ? 1 : 2))!;
  const patterns: Record<number, number[][]> = { 2: [[0, 3], [1, 4]], 3: [[0, 2, 4]], 5: [[0, 1, 2, 3, 4]] };
  const t: Tender = {
    id: newId(state, 'tnd'),
    customerId: customer.id,
    cargoId: cargo.id,
    fromCityId: origin.id,
    toCityId: dest.id,
    trailerType: cargo.trailer,
    qualifications: cargo.qualifications,
    weightT: Math.round(((cargo.weight[0] + cargo.weight[1]) / 2) * 10) / 10,
    distanceKm: route.km,
    weekdays: rand.pick(state, patterns[perWeek]),
    pickupHour: rand.int(state, 5, 13),
    weeks: rand.pick(state, [13, 13, 26]),
    referencePrice: Math.round(baseRate(state, cargo, route.km) / 500) * 500,
    created: state.time,
    deadline: state.time + rand.int(state, 3, 5) * MIN_PER_DAY + 12 * 60,
    status: 'open',
  };
  state.tenders[t.id] = t;
  addLog(state, {
    level: 'info',
    category: 'order',
    text: `Ausschreibung: ${customer.name} vergibt ${CARGO_BY_ID[cargo.id].name} ${origin.name} → ${dest.name} (${t.weekdays.length}× pro Woche, ${t.weeks} Wochen). Gebote bis ${formatDateTime(t.deadline)} unter „Kunden & Verträge“.`,
  });
  return t;
}

/** laufende Verträge plus gewonnene, noch nicht begonnene – gegen die Kapazitätsgrenze */
function contractCapacity(state: GameState) {
  const active = Object.values(state.contracts).filter((x) => x.status === 'active').length;
  const bids = Object.values(state.tenders).filter((t) => t.status === 'open' && t.bid).length;
  return { used: active + bids, max: Math.max(2, Object.keys(state.vehicles).length * 2) };
}

export function placeBid(state: GameState, playerId: Id, tenderId: Id, price: number, guarantee: boolean): { ok: true } | { ok: false; error: string } {
  const t = state.tenders[tenderId];
  if (!t || t.status !== 'open') return { ok: false, error: 'Diese Ausschreibung läuft nicht mehr.' };
  if (state.time >= t.deadline) return { ok: false, error: 'Die Angebotsfrist ist abgelaufen.' };
  price = Math.round(Number(price) / 100) * 100;
  if (!Number.isFinite(price) || price < t.referencePrice * BID_RANGE[0] || price > t.referencePrice * BID_RANGE[1])
    return { ok: false, error: `Gebote zwischen ${formatMoney(Math.ceil((t.referencePrice * BID_RANGE[0]) / 100) * 100)} und ${formatMoney(Math.floor((t.referencePrice * BID_RANGE[1]) / 100) * 100)} je Tour.` };
  const cap = contractCapacity(state);
  if (!t.bid && cap.used >= cap.max) return { ok: false, error: `Mit der aktuellen Flotte sind höchstens ${cap.max} Verträge und Gebote gleichzeitig möglich.` };
  const changed = !!t.bid;
  t.bid = { price, guarantee: !!guarantee, by: playerId, at: state.time };
  addLog(state, { level: 'info', category: 'order', text: `${changed ? 'Gebot geändert' : 'Gebot abgegeben'}: ${formatMoney(price)} je Tour ${CITY_BY_ID[t.fromCityId].name} → ${CITY_BY_ID[t.toCityId].name}${guarantee ? ' mit Pünktlichkeitsgarantie' : ''}.` });
  return { ok: true };
}

export function withdrawBid(state: GameState, tenderId: Id): { ok: true } | { ok: false; error: string } {
  const t = state.tenders[tenderId];
  if (!t || t.status !== 'open' || !t.bid) return { ok: false, error: 'Kein offenes Gebot.' };
  t.bid = undefined;
  return { ok: true };
}

/** Zuschlag: Gebote der Konkurrenz würfeln, bestes Gebot gewinnt. */
function award(state: GameState, ctx: SimContext, t: Tender) {
  const from = CITY_BY_ID[t.fromCityId];
  let rivals = activeCompetitors(state).filter((c) => nearCompetitor(c, from));
  // zu wenig Konkurrenz vor Ort: überregionale Speditionen bieten mit
  const others = activeCompetitors(state).filter((c) => !rivals.includes(c));
  while (rivals.length < 2 && others.length) rivals = [...rivals, others.splice(rand.int(state, 0, others.length - 1), 1)[0]];
  const bids: { name: string; price: Money; score: number; id: string; player?: boolean }[] = rivals.map((c) => {
    // Preisbrecher bieten knapp, Premium höher; wer in Not ist, unterbietet
    const price = Math.round((t.referencePrice * c.priceLevel * rand.float(state, 0.92, 1.06) * (c.status === 'trouble' ? 0.95 : 1)) / 100) * 100;
    return { name: c.name, price, score: bidScore(price, c.reputation), id: c.id };
  });
  if (t.bid) bids.push({ name: state.company.name, price: t.bid.price, score: bidScore(t.bid.price, state.company.reputation, t.bid.guarantee), id: 'player', player: true });
  bids.sort((a, b) => a.score - b.score);
  const best = bids[0];
  const cu = state.customers[t.customerId];
  const route = `${CITY_BY_ID[t.fromCityId].name} → ${CITY_BY_ID[t.toCityId].name}`;
  const list = bids.map((b) => ({ name: b.name, price: b.price, ...(b.player ? { player: true } : {}) }));
  if (!best) {
    t.status = 'expired';
    return;
  }
  if (!best.player) {
    t.status = t.bid ? 'lost' : 'expired';
    t.result = { winner: best.name, price: best.price, bids: list };
    const c = state.competitors[best.id];
    if (c) c.reputation = Math.min(95, c.reputation + 0.5);
    if (t.bid) {
      const mine = bids.find((b) => b.player)!;
      const why = mine.price > best.price ? `dein Preis lag ${formatMoney(mine.price - best.price)} darüber` : 'der bessere Ruf hat entschieden';
      addLog(state, { level: 'warning', category: 'order', text: `Ausschreibung ${route} verloren: Zuschlag an ${best.name} für ${formatMoney(best.price)} je Tour (${why}).` });
    }
    return;
  }
  // gewonnen: als laufenden Rahmenvertrag anlegen
  const k: Contract = {
    id: newId(state, 'con'),
    customerId: t.customerId,
    cargoId: t.cargoId,
    fromCityId: t.fromCityId,
    toCityId: t.toCityId,
    trailerType: t.trailerType,
    qualifications: t.qualifications,
    weightT: t.weightT,
    distanceKm: t.distanceKm,
    weekdays: t.weekdays,
    pickupHour: t.pickupHour,
    paymentPerTour: t.bid!.price,
    penaltyMissed: Math.round((t.bid!.price * 0.3) / 100) * 100,
    weeks: t.weeks,
    regular: false,
    status: 'offered',
    offerExpires: state.time + 60,
    stats: { tours: 0, delivered: 0, late: 0, missed: 0 },
    ...(t.bid!.guarantee ? { guarantee: true } : {}),
  };
  state.contracts[k.id] = k;
  // die Kapazität wurde beim Gebot geprüft; das Gebot selbst zählt nicht mehr mit
  t.status = 'won';
  if (state.progress) state.progress.counts.tendersWon++;
  const r = acceptContract(state, ctx, k.id);
  if (!r.ok) {
    delete state.contracts[k.id];
    t.status = 'lost';
    t.result = { winner: bids[1]?.name ?? '–', price: bids[1]?.price ?? 0, bids: list, note: r.error };
    addLog(state, { level: 'danger', category: 'order', text: `Ausschreibung ${route} gewonnen, aber nicht übernehmbar: ${r.error}` });
    return;
  }
  t.result = { winner: state.company.name, price: t.bid!.price, bids: list };
  if (cu) cu.satisfaction = Math.max(cu.satisfaction, 60);
  state.company.reputation = Math.min(100, state.company.reputation + 1);
  addLog(state, {
    level: 'success',
    category: 'order',
    text: `Zuschlag! ${cu?.name ?? 'Der Kunde'} vergibt ${route} an dich: ${t.weekdays.length}× pro Woche für ${t.weeks} Wochen zu ${formatMoney(t.bid!.price)} je Tour (${bids.length - 1} Mitbewerber).`,
  });
}

/** Täglich: Fristen auswerten, alte Ausschreibungen aufräumen, neue ausschreiben. */
export function dailyTenders(state: GameState, ctx: SimContext): void {
  state.tenders ??= {};
  for (const t of Object.values(state.tenders)) {
    if (t.status === 'open' && state.time >= t.deadline) award(state, ctx, t);
    else if (t.status !== 'open' && state.time - t.deadline > 30 * MIN_PER_DAY) delete state.tenders[t.id];
  }
  // erst, wenn die Firma Verträge stemmen kann
  if (Object.keys(state.vehicles).length < 2) return;
  const open = Object.values(state.tenders).filter((t) => t.status === 'open').length;
  if (open < TENDER_TARGET + deptCount(state, 'sales') && rand.chance(state, 0.3)) generateTender(state, ctx);
}

/** Stündlich: Zuschläge zur Frist (nicht erst um Mitternacht) */
export function hourlyTenders(state: GameState, ctx: SimContext): void {
  for (const t of Object.values(state.tenders ?? {})) if (t.status === 'open' && state.time >= t.deadline) award(state, ctx, t);
}

/**
 * Grobe Kosten je Tour als Orientierung für das Gebot: Diesel (28 l/100 km), Maut und Verschleiß,
 * ein Drittel Leerfahrt für die Rückfahrt und Fahrerstunden (Fahrt mit Ø 62 km/h plus 3 h Laden und Anfahrt).
 */
export function tenderCostEstimate(state: GameState, t: Pick<Tender, 'distanceKm'>): Money {
  const perKm = 0.28 * state.market.diesel + 18 + 8;
  const hours = t.distanceKm / 62 + 3;
  return Math.round((t.distanceKm * 1.35 * perKm + hours * 22_00) / 100) * 100;
}
