// Ereignisregelwerk: Unternehmens-, Markt-, Transport- und private Ereignisse. Jede Regel hat eine
// Bedingung, eine Abklingzeit und eine nachvollziehbare Folge. Fairness:
// - negative Ereignisse höchstens alle 4 Tage und nicht, solange das Firmenkonto im Minus ist (Schonfrist),
// - der Schwierigkeitsgrad (Ereignisfaktor) macht negative häufiger und positive seltener.
// Ergänzend wirken die Ereignisse in Fahrt, Personal und Finanzen (Pannen, Unfälle, Krankheit, Zahlungsausfälle).

import type { SimContext } from './context.ts';
import { CITY_BY_ID } from './data/cities.ts';
import { CARGO_BY_ID, COUNTRY_NAMES } from './data/catalog.ts';
import { generateContractOffer } from './contracts.ts';
import { setRegionalTrend } from './economy.ts';
import { addLog, book, formatMoney } from './finance.ts';
import { generateOrder } from './orders.ts';
import { rand } from './rng.ts';
import { tripStopEtas } from './selectors.ts';
import { MIN_PER_DAY, formatDateTime, formatDuration, month } from './time.ts';
import type { GameState, Player, Trip, WorldEvent } from './types.ts';
import { COUNTRIES } from './world.ts';

type Tone = WorldEvent['tone'];
type Category = WorldEvent['category'];

interface Rule {
  id: string;
  category: Category;
  tone: Tone;
  /** Wahrscheinlichkeit je Prüfung (täglich bzw. je Spieler täglich) */
  chance: number;
  cooldownDays: number;
  /** liefert Titel/Text oder null, wenn die Regel gerade nicht passt */
  run(state: GameState, ctx: SimContext): { title: string; text: string } | null;
}

interface PrivateRule extends Omit<Rule, 'run'> {
  run(state: GameState, p: Player): { title: string; text: string } | null;
}

const HISTORY = 60;
const BAD_GAP_DAYS = 4;

export function defaultEvents() {
  return { last: {}, history: [] };
}

function record(state: GameState, rule: { id: string; category: Category; tone: Tone }, title: string, text: string) {
  state.events.history.push({ t: state.time, rule: rule.id, title, text, category: rule.category, tone: rule.tone });
  if (state.events.history.length > HISTORY) state.events.history.shift();
  if (rule.tone === 'bad') state.events.lastBad = state.time;
  addLog(state, {
    level: rule.tone === 'good' ? 'success' : rule.tone === 'bad' ? 'warning' : 'info',
    category: rule.category === 'private' ? 'private' : rule.category === 'transport' ? 'trip' : 'market',
    text: `${title}: ${text}`,
  });
}

/** Länder, in denen der Spieler aktiv ist (Standorte, Fahrzeuge) */
function ownCountries(state: GameState): string[] {
  const s = new Set<string>();
  for (const l of state.company.locations) s.add(CITY_BY_ID[l.cityId].country);
  for (const v of Object.values(state.vehicles)) if (CITY_BY_ID[v.cityId]) s.add(CITY_BY_ID[v.cityId].country);
  return [...s];
}

const pickCountry = (state: GameState) => (rand.chance(state, 0.6) ? rand.pick(state, ownCountries(state)) : rand.pick(state, COUNTRIES));

// ---------------------------------------------------------------- Firma & Markt (täglich)

export const COMPANY_RULES: Rule[] = [
  {
    id: 'big_customer',
    category: 'company',
    tone: 'good',
    chance: 0.035,
    cooldownDays: 30,
    run(state, ctx) {
      if (state.company.reputation < 35) return null;
      const c = generateContractOffer(state, ctx);
      if (!c) return null;
      c.paymentPerTour = Math.round((c.paymentPerTour * 1.08) / 500) * 500;
      c.weeks = Math.max(c.weeks, 12);
      const cu = state.customers[c.customerId];
      return { title: 'Neuer Großkunde', text: `${cu.name} (${CITY_BY_ID[cu.cityId].name}) möchte langfristig zusammenarbeiten: Rahmenvertrag über ${c.weeks} Wochen zu je ${formatMoney(c.paymentPerTour)} pro Tour.` };
    },
  },
  {
    id: 'tender',
    category: 'company',
    tone: 'good',
    chance: 0.12,
    cooldownDays: 6,
    run(state, ctx) {
      const o = generateOrder(state, ctx, { local: true });
      if (!o || o.partial) return null;
      o.payment = Math.round((o.payment * 1.6) / 500) * 500;
      o.penaltyPerHour = Math.round((o.payment * 0.03) / 100) * 100;
      o.tender = true;
      o.offerExpires = Math.min(o.pickupStart, state.time + 12 * 60);
      return {
        title: 'Lukratives Einzelangebot',
        text: `${CARGO_BY_ID[o.cargoId].name} ${CITY_BY_ID[o.fromCityId].name} → ${CITY_BY_ID[o.toCityId].name} für ${formatMoney(o.payment)} – nur bis ${formatDateTime(o.offerExpires)} in der Auftragsbörse.`,
      };
    },
  },
  {
    id: 'diesel_spike',
    category: 'market',
    tone: 'bad',
    chance: 0.025,
    cooldownDays: 30,
    run(state) {
      const up = rand.int(state, 12, 25);
      state.market.diesel = Math.min(240, state.market.diesel + up);
      return { title: 'Dieselpreis steigt', text: `Spannungen am Ölmarkt: Diesel kostet ${up} ct/l mehr (jetzt ${(state.market.diesel / 100).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €/l). Der Preis normalisiert sich nur langsam.` };
    },
  },
  {
    id: 'diesel_drop',
    category: 'market',
    tone: 'good',
    chance: 0.025,
    cooldownDays: 30,
    run(state) {
      const down = rand.int(state, 8, 16);
      state.market.diesel = Math.max(110, state.market.diesel - down);
      return { title: 'Dieselpreis sinkt', text: `Diesel wird ${down} ct/l günstiger (jetzt ${(state.market.diesel / 100).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €/l).` };
    },
  },
  {
    id: 'market_chance',
    category: 'market',
    tone: 'good',
    chance: 0.06,
    cooldownDays: 12,
    run(state) {
      const c = pickCountry(state);
      const m = month(state.time);
      const reason = m >= 7 && m <= 9 ? 'Erntesaison' : m >= 9 && m <= 11 ? 'Weihnachtsgeschäft' : rand.pick(state, ['Bauboom', 'Messe', 'neue Werke', 'Exportnachfrage']);
      const days = rand.int(state, 14, 24);
      setRegionalTrend(state, c, rand.float(state, 1.25, 1.4), days, reason);
      return { title: 'Gute Marktchance', text: `${reason} in ${COUNTRY_NAMES[c] ?? c}: für etwa ${days} Tage deutlich mehr Transporte von dort.` };
    },
  },
  {
    id: 'regional_slump',
    category: 'market',
    tone: 'bad',
    chance: 0.04,
    cooldownDays: 18,
    run(state) {
      const c = pickCountry(state);
      const reason = rand.pick(state, ['Streik in der Industrie', 'Werksschließung', 'Hochwasser', 'Absatzflaute']);
      const days = rand.int(state, 8, 18);
      setRegionalTrend(state, c, rand.float(state, 0.65, 0.8), days, reason);
      return { title: 'Nachfrage bricht ein', text: `${reason} in ${COUNTRY_NAMES[c] ?? c}: für etwa ${days} Tage weniger Aufträge von dort.` };
    },
  },
  {
    id: 'contract_cancel',
    category: 'company',
    tone: 'bad',
    chance: 0.5,
    cooldownDays: 21,
    run(state) {
      // Vertragskündigung nur bei schlechter Erfüllung (nachvollziehbar)
      const bad = Object.values(state.contracts).find((k) => k.status === 'active' && k.stats.tours >= 3 && (k.stats.missed + k.stats.late) / k.stats.tours > 0.4);
      if (!bad) return null;
      bad.status = 'cancelled';
      bad.end = state.time;
      const cu = state.customers[bad.customerId];
      cu.satisfaction = Math.max(0, cu.satisfaction - 10);
      return { title: 'Vertrag gekündigt', text: `${cu.name} kündigt den Rahmenvertrag ${CITY_BY_ID[bad.fromCityId].name} → ${CITY_BY_ID[bad.toCityId].name}: zu viele verspätete oder ausgefallene Touren (${bad.stats.late + bad.stats.missed} von ${bad.stats.tours}).` };
    },
  },
];

// ---------------------------------------------------------------- Privat (täglich je Spieler)

const EXPENSES = ['Autoreparatur', 'Zahnarzt', 'neue Waschmaschine', 'Nachzahlung Nebenkosten', 'Handy kaputt', 'Strafzettel'];

export const PRIVATE_RULES: PrivateRule[] = [
  {
    id: 'unexpected_expense',
    category: 'private',
    tone: 'bad',
    chance: 0.04,
    cooldownDays: 20,
    run(state, p) {
      const cost = rand.int(state, 12, 90) * 1000;
      if (p.character.privateAccount.balance < cost * 2) return null;
      const what = rand.pick(state, EXPENSES);
      book(state, `private:${p.id}`, -cost, 'living', what);
      p.character.needs.stress = Math.min(100, p.character.needs.stress + 3);
      return { title: 'Unerwartete Ausgabe', text: `${p.name}: ${what} – ${formatMoney(cost)} vom Privatkonto.` };
    },
  },
  {
    id: 'friend_invite',
    category: 'private',
    tone: 'good',
    chance: 0.06,
    cooldownDays: 10,
    run(state, p) {
      const friends = p.character.relations.filter((r) => r.kind === 'friend');
      if (!friends.length) return null;
      const f = rand.pick(state, friends);
      f.closeness = Math.min(100, f.closeness + 6);
      f.lastContact = state.time;
      p.character.needs.social = Math.min(100, p.character.needs.social + 10);
      return { title: 'Einladung', text: `${f.name} lädt ${p.name} zum ${rand.pick(state, ['Grillen', 'Geburtstag', 'Fußballabend', 'Abendessen'])} ein – ein schöner Abend.` };
    },
  },
  {
    id: 'leisure_offer',
    category: 'private',
    tone: 'good',
    chance: 0.035,
    cooldownDays: 15,
    run(state, p) {
      const n = p.character.needs;
      n.happiness = Math.min(100, n.happiness + 4);
      n.stress = Math.max(0, n.stress - 4);
      return { title: 'Freizeitangebot', text: `${p.name} gewinnt ${rand.pick(state, ['Konzertkarten', 'einen Wellness-Gutschein', 'Karten fürs Stadion'])} – gute Laune.` };
    },
  },
  {
    id: 'private_appointment',
    category: 'private',
    tone: 'neutral',
    chance: 0.035,
    cooldownDays: 20,
    run(state, p) {
      const c = p.character;
      if (c.activity && state.time < c.activity.until) return null;
      const what = rand.pick(state, ['Behördengang', 'Arzttermin', 'Elternabend', 'Handwerkertermin']);
      c.activity = { id: 'appointment', until: state.time + 2 * 60, text: what };
      c.needs.stress = Math.min(100, c.needs.stress + 2);
      return { title: 'Privater Termin', text: `${p.name}: ${what} – zwei Stunden nicht im Büro.` };
    },
  },
  {
    id: 'relationship_talk',
    category: 'private',
    tone: 'neutral',
    chance: 0.5,
    cooldownDays: 30,
    run(state, p) {
      const partner = p.character.relations.find((r) => r.kind === 'partner');
      if (!partner || partner.closeness >= 50) return null;
      p.character.needs.stress = Math.min(100, p.character.needs.stress + 4);
      return { title: 'Beziehungsgespräch', text: `${partner.name} wünscht sich mehr gemeinsame Zeit mit ${p.name} (Nähe ${Math.round(partner.closeness)} %).` };
    },
  },
];

// ---------------------------------------------------------------- Transport (stündlich je Fahrt)

/** Kurzfristige Kundenänderungen an laufenden Fahrten */
function customerChange(state: GameState, ctx: SimContext, trip: Trip) {
  const stops = trip.stops ?? [];
  const idx = stops.findIndex((s, i) => i >= trip.legIndex && s.kind === 'delivery');
  if (idx < 0) return;
  const order = state.orders[stops[idx].orderId];
  if (!order || order.status === 'delivered') return;
  const cu = state.customers[order.customerId];
  if (rand.chance(state, 0.6)) {
    // Kunde verschiebt den Liefertermin nach hinten (Entlastung)
    const h = rand.int(state, 2, 8);
    order.deliveryEnd += h * 60;
    trip.log.push({ t: state.time, text: `${cu.name} verschiebt den Liefertermin um ${h} h` });
    record(state, { id: 'customer_postpone', category: 'transport', tone: 'good' }, 'Kundenänderung', `${cu.name} verschiebt die Anlieferung in ${CITY_BY_ID[order.toCityId].name} um ${h} h auf ${formatDateTime(order.deliveryEnd)}.`);
    return;
  }
  // Kunde braucht die Ware früher – gegen Aufpreis, nur wenn es zu schaffen ist
  const eta = tripStopEtas(state, ctx, trip).etas[idx];
  const pull = rand.int(state, 1, 3) * 60;
  if (eta === undefined || eta > order.deliveryEnd - pull - 60) return;
  order.deliveryEnd -= pull;
  const bonus = Math.round((order.payment * 0.08) / 100) * 100;
  order.payment += bonus;
  trip.log.push({ t: state.time, text: `${cu.name} braucht die Ware ${formatDuration(pull)} früher (+${formatMoney(bonus)})` });
  record(state, { id: 'customer_rush', category: 'transport', tone: 'neutral' }, 'Kundenänderung', `${cu.name} braucht die Ware ${formatDuration(pull)} früher (neu bis ${formatDateTime(order.deliveryEnd)}) und zahlt ${formatMoney(bonus)} Aufpreis.`);
}

// ---------------------------------------------------------------- Auswertung

const goodFactor = (state: GameState) => 1 + (1 - state.difficulty.eventFactor) * 0.5;

function allowed(state: GameState, key: string, cooldownDays: number, tone: Tone): boolean {
  const last = state.events.last[key];
  if (last !== undefined && state.time - last < cooldownDays * MIN_PER_DAY) return false;
  if (tone === 'bad') {
    if (state.company.account.balance < 0) return false;
    if (state.events.lastBad !== undefined && state.time - state.events.lastBad < BAD_GAP_DAYS * MIN_PER_DAY) return false;
  }
  return true;
}

const chanceOf = (state: GameState, tone: Tone, base: number) => base * (tone === 'bad' ? state.difficulty.eventFactor : tone === 'good' ? goodFactor(state) : 1);

/** Täglich: Firmen-, Markt- und private Ereignisse prüfen (höchstens eines je Bereich und Tag). */
export function dailyEvents(state: GameState, ctx: SimContext): void {
  state.events ??= defaultEvents();
  for (const r of COMPANY_RULES) {
    if (!allowed(state, r.id, r.cooldownDays, r.tone) || !rand.chance(state, chanceOf(state, r.tone, r.chance))) continue;
    const res = r.run(state, ctx);
    if (!res) continue;
    state.events.last[r.id] = state.time;
    record(state, r, res.title, res.text);
    break;
  }
  for (const p of Object.values(state.players)) {
    for (const r of PRIVATE_RULES) {
      const key = `${r.id}:${p.id}`;
      const last = state.events.last[key];
      if (last !== undefined && state.time - last < r.cooldownDays * MIN_PER_DAY) continue;
      if (!rand.chance(state, chanceOf(state, r.tone, r.chance))) continue;
      const res = r.run(state, p);
      if (!res) continue;
      state.events.last[key] = state.time;
      record(state, r, res.title, res.text);
      break;
    }
  }
}

/** Stündlich: Kundenänderungen an laufenden Fahrten (selten, je Fahrt höchstens einmal am Tag). */
export function hourlyEvents(state: GameState, ctx: SimContext): void {
  state.events ??= defaultEvents();
  for (const trip of Object.values(state.trips)) {
    if (trip.phase !== 'to_pickup' && trip.phase !== 'to_delivery') continue;
    if (!rand.chance(state, 0.004 * state.difficulty.eventFactor)) continue;
    const key = `customer_change:${trip.id}`;
    const last = state.events.last[key];
    if (last !== undefined && state.time - last < MIN_PER_DAY) continue;
    state.events.last[key] = state.time;
    customerChange(state, ctx, trip);
  }
  // Abklingzeiten beendeter Fahrten aufräumen
  if (state.time % (24 * 60) === 0)
    for (const k of Object.keys(state.events.last)) if (k.startsWith('customer_change:') && !state.trips[k.slice(16)]) delete state.events.last[k];
}
