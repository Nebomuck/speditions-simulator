// KI-Konkurrenz: Speditionen mit eigener Flotte, Kasse und Standorten. Sie übernehmen stündlich Aufträge
// aus der Börse im Umkreis ihrer Standorte, zahlen Fahrzeug- und Betriebskosten, wachsen bei Gewinn,
// verkleinern sich bei Verlust und können in Konkurs gehen. Unzufriedene Kunden wechseln zu ihnen –
// mit Vertriebsarbeit lassen sie sich zurückgewinnen.

import { CITIES, CITY_BY_ID, type CityDef } from './data/cities.ts';
import { COUNTRY_NAMES } from './data/catalog.ts';
import { salesVolumeFactor } from './company.ts';
import { regionFactor } from './economy.ts';
import { addLog, book, formatMoney } from './finance.ts';
import { haversineKm } from './geo.ts';
import { newId, rand } from './rng.ts';
import { MIN_PER_DAY } from './time.ts';
import type { Competitor, CompetitorStrategy, Customer, GameState, Id, Money, Order } from './types.ts';
// Kosten skalieren mit dem Frachtratenniveau, damit die Margen der Konkurrenz gleich bleiben
import { RATE_LEVEL } from './orders.ts';

type Result = { ok: true; won?: boolean } | { ok: false; error: string };

export const STRATEGY_LABEL: Record<CompetitorStrategy, string> = { budget: 'Preisbrecher', premium: 'Premium', regional: 'Regional' };

/** Einzugsgebiet eines Standorts (km Luftlinie) */
export const COMPETITOR_RADIUS_KM = 450;
/** einsetzbare Stunden je LKW und Tagesstunde (Lenk- und Ruhezeiten, Standzeiten) */
const TRUCK_HOURS_PER_HOUR = 0.55;
/** Zeitbedarf einer Tour: Fahrt mit Ø 62 km/h plus 3 h Laden, Entladen und Anfahrt */
const orderHours = (km: number) => km / 62 + 3;
/** Fixkosten je LKW und Tag (Fahrer, Fahrzeug, Versicherung, Verwaltung, Leerfahrten) */
export const TRUCK_DAY_COST: Money = 360_00;
/** variable Kosten je Tour-km (Diesel, Maut, Verschleiß) */
const COST_PER_KM: Money = 1_35;
/** Anteil des Monatsgewinns, den die Inhaber entnehmen */
const OWNER_WITHDRAWAL = 0.4;
/** Kostenniveau je Strategie (Preisbrecher fahren mit günstigeren Fahrern und älteren Fahrzeugen) */
const COST_LEVEL: Record<CompetitorStrategy, number> = { budget: 0.9, premium: 1.04, regional: 1 };
const TRUCK_DOWN_PAYMENT: Money = 18_000_00;
const TRUCK_RESALE: Money = 32_000_00;
const BRANCH_COST: Money = 60_000_00;
/** so viele Konkurrenten gibt es höchstens gleichzeitig */
export const MAX_COMPETITORS = 7;
export const WIN_BACK_COST: Money = 1_500_00;

// frei erfundene Markennamen aus Silben (keine realen Unternehmen)
const NAME_A = ['Vel', 'Nor', 'Kar', 'Mir', 'Tal', 'Rhen', 'Bal', 'Ost', 'Lum', 'Sar', 'Dor', 'Var', 'Tren', 'Ilk', 'Fen', 'Brav'];
const NAME_B = ['avo', 'ex', 'ion', 'ata', 'ova', 'ix', 'una', 'eon', 'ari', 'ondo'];
const SUFFIX = ['Logistik', 'Transporte', 'Spedition', 'Cargo', 'Frachtdienst', 'Freight'];
const ll = (c: CityDef): [number, number] => [c.lon, c.lat];

function brandName(state: GameState): string {
  const used = new Set(Object.values(state.competitors ?? {}).map((c) => c.name.split(' ')[0]));
  for (let i = 0; i < 20; i++) {
    const n = rand.pick(state, NAME_A) + rand.pick(state, NAME_B);
    if (!used.has(n)) return n;
  }
  return rand.pick(state, NAME_A) + rand.pick(state, NAME_B) + rand.int(state, 2, 9);
}

/** Neue KI-Spedition gründen (Firmensitz gewichtet nach Größe, nicht direkt am Spieler) */
export function foundCompetitor(state: GameState, opts: { near?: string; strategy?: CompetitorStrategy; trucks?: number } = {}): Competitor {
  const taken = new Set(Object.values(state.competitors).filter((c) => c.status !== 'bankrupt').map((c) => c.hqCityId));
  let pool = CITIES.filter((c) => c.pop > 300 && !taken.has(c.id) && c.id !== state.company.hqCityId);
  if (opts.near) {
    const n = CITY_BY_ID[opts.near];
    const near = pool.filter((c) => haversineKm(ll(c), ll(n)) < 350);
    if (near.length) pool = near;
  }
  const hq = rand.weighted(state, pool, (c) => Math.sqrt(c.pop) * regionFactor(state, c.country))!;
  const strategy = opts.strategy ?? rand.pick(state, ['budget', 'premium', 'regional'] as CompetitorStrategy[]);
  const trucks = opts.trucks ?? rand.int(state, 6, 30);
  const c: Competitor = {
    id: newId(state, 'cmp'),
    name: `${brandName(state)} ${rand.pick(state, SUFFIX)}`,
    hqCityId: hq.id,
    cityIds: [hq.id],
    trucks,
    cash: trucks * rand.int(state, 8_000, 16_000) * 100,
    reputation: strategy === 'premium' ? rand.int(state, 55, 75) : strategy === 'budget' ? rand.int(state, 35, 55) : rand.int(state, 45, 65),
    priceLevel: strategy === 'budget' ? 0.92 : strategy === 'premium' ? 1.04 : 1,
    strategy,
    founded: state.time,
    status: 'active',
    carry: 0,
    month: { revenue: 0, costs: 0, orders: 0, hours: 0 },
    lastMonth: { revenue: 0, costs: 0, orders: 0, hours: 0 },
    totals: { orders: 0, revenue: 0 },
  };
  state.competitors[c.id] = c;
  return c;
}

/** Startaufstellung: ein Wettbewerber in der Nähe des Spielers, weitere in Europa verteilt */
export function seedCompetitors(state: GameState): void {
  state.competitors ??= {};
  if (Object.keys(state.competitors).length) return;
  foundCompetitor(state, { near: state.company.hqCityId, strategy: 'regional', trucks: rand.int(state, 5, 10) });
  for (let i = 0; i < 4; i++) foundCompetitor(state);
}

export const activeCompetitors = (state: GameState) => Object.values(state.competitors ?? {}).filter((c) => c.status !== 'bankrupt');

export function nearCompetitor(c: Competitor, city: CityDef): boolean {
  return c.cityIds.some((id) => haversineKm(ll(CITY_BY_ID[id]), ll(city)) <= COMPETITOR_RADIUS_KM);
}

/** Konkurrenzdruck in einem Land 0–1 (Flottengröße der Wettbewerber mit Standort dort) */
export function competitionPressure(state: GameState, country: string): number {
  let trucks = 0;
  for (const c of activeCompetitors(state)) {
    const here = c.cityIds.filter((id) => CITY_BY_ID[id].country === country).length;
    if (here) trucks += (c.trucks * here) / c.cityIds.length / (c.strategy === 'budget' ? 0.7 : 1);
  }
  return Math.min(1, trucks / 80);
}

/** Preisabschlag durch Konkurrenzdruck (bis −4 %) */
export const competitionPriceFactor = (state: GameState, country: string) => 1 - 0.04 * competitionPressure(state, country);

function addRevenue(c: Competitor, payment: Money, km: number) {
  const revenue = Math.round(payment * c.priceLevel);
  const cost = Math.round((km * COST_PER_KM + 40_00) * COST_LEVEL[c.strategy] * RATE_LEVEL);
  c.cash += revenue - cost;
  c.month.revenue += revenue;
  c.month.costs += cost;
  c.month.orders++;
  c.month.hours += orderHours(km);
  c.totals.orders++;
  c.totals.revenue += revenue;
}

/** Auftrag eines abgeworbenen Kunden geht direkt an den Konkurrenten (statt in die Börse). */
export function competitorTakesCustomerOrder(state: GameState, customer: Customer, payment: Money, km: number): boolean {
  const c = customer.lostTo ? state.competitors[customer.lostTo] : undefined;
  if (!c || c.status === 'bankrupt') return false;
  addRevenue(c, payment, km);
  return true;
}

/** Stündlich: Konkurrenten übernehmen passende Angebote aus der Börse. */
export function hourlyCompetition(state: GameState): void {
  // ältere Spielstände: Konkurrenz beim ersten Stundentakt anlegen
  if (!Object.keys(state.competitors ??= {}).length) seedCompetitors(state);
  const comps = activeCompetitors(state);
  if (!comps.length) return;
  // Angebote, die schon eine Weile in der Börse stehen (der Spieler hat zuerst die Chance)
  const offers = Object.values(state.orders).filter((o) => o.status === 'offered' && !o.tender && state.time - o.created >= 90);
  if (!offers.length) return;
  // eigener Vertrieb hält Angebote länger für den Spieler zurück
  const share = 1 / Math.max(1, salesVolumeFactor(state));
  for (const c of comps) {
    // Kapazität in LKW-Stunden; eine Tour belegt Stunden je nach Länge
    c.carry += c.trucks * TRUCK_HOURS_PER_HOUR * (c.status === 'trouble' ? 0.8 : 1) * share;
    while (c.carry > 0) {
      const pick = rand.weighted(state, offers, (o: Order) => {
        if (o.status !== 'offered') return 0;
        const from = CITY_BY_ID[o.fromCityId];
        if (!nearCompetitor(c, from)) return 0;
        const perKm = o.payment / Math.max(50, o.distanceKm);
        return c.strategy === 'premium' ? perKm * (o.express ? 1.4 : 1) : c.strategy === 'regional' ? perKm * (o.distanceKm < 500 ? 2 : 0.5) : perKm;
      });
      if (!pick) {
        // ungenutzte Kapazität verfällt (höchstens ein halber Tag Vorrat)
        c.carry = Math.min(c.carry, c.trucks * 6);
        break;
      }
      c.carry -= orderHours(pick.distanceKm);
      pick.status = 'expired';
      pick.takenBy = c.id;
      addRevenue(c, pick.payment, pick.distanceKm);
    }
  }
}

/** Täglich: Fixkosten, Kundenwechsel und Rückkehr von Kunden. */
export function dailyCompetition(state: GameState): void {
  const comps = activeCompetitors(state);
  for (const c of comps) {
    const cost = Math.round(c.trucks * TRUCK_DAY_COST * COST_LEVEL[c.strategy] * RATE_LEVEL * (0.95 + 0.05 * c.cityIds.length));
    c.cash -= cost;
    c.month.costs += cost;
  }
  if (!comps.length) return;
  const ef = state.difficulty.eventFactor;
  const protectedIds = new Set(Object.values(state.contracts).filter((k) => k.status === 'active').map((k) => k.customerId));
  for (const cu of Object.values(state.customers)) {
    if (cu.lostTo) {
      const c = state.competitors[cu.lostTo];
      // Konkurrent pleite → Kunde sucht wieder; sonst langsame Rückkehr bei gutem eigenem Ruf
      if (!c || c.status === 'bankrupt' || (state.company.reputation > c.reputation + 10 && rand.chance(state, 0.005))) {
        delete cu.lostTo;
        delete cu.lostAt;
        cu.satisfaction = Math.max(cu.satisfaction, 50);
        addLog(state, { level: 'success', category: 'market', text: `${cu.name} vergibt wieder Aufträge an dich${c ? ` (zuvor bei ${c.name})` : ''}.` });
      }
      continue;
    }
    if (cu.deliveries === 0 || cu.satisfaction >= 40 || protectedIds.has(cu.id)) continue;
    if (!rand.chance(state, 0.03 * ef)) continue;
    const city = CITY_BY_ID[cu.cityId];
    const rival = rand.weighted(state, comps.filter((c) => nearCompetitor(c, city)), (c) => c.reputation);
    if (!rival) continue;
    cu.lostTo = rival.id;
    cu.lostAt = state.time;
    addLog(state, { level: 'warning', category: 'market', text: `${cu.name} wechselt zu ${rival.name} – zu unzufrieden mit deinem Service (${Math.round(cu.satisfaction)} %). Rückgewinnung unter „Kunden & Verträge“.` });
  }
}

/** Monatlich: Wachstum, Schrumpfen, Konkurs; Lücken füllt eine neue Spedition. */
export function monthlyCompetition(state: GameState): void {
  for (const c of activeCompetitors(state)) {
    const m = c.month;
    c.lastMonth = m;
    c.month = { revenue: 0, costs: 0, orders: 0, hours: 0 };
    const profit = m.revenue - m.costs;
    const utilization = (m.hours ?? 0) / Math.max(1, c.trucks * TRUCK_HOURS_PER_HOUR * 24 * 30);
    if (profit > 0) c.cash -= Math.round(profit * OWNER_WITHDRAWAL);
    // Ruf: Premium pflegt ihn, Preisbrecher weniger
    c.reputation = Math.max(10, Math.min(95, c.reputation + (profit > 0 ? 1 : -1) + (c.strategy === 'premium' ? 0.5 : c.strategy === 'budget' ? -0.3 : 0)));

    if (c.cash < 0) {
      if (c.status !== 'trouble') {
        c.status = 'trouble';
        c.troubleSince = state.time;
        addLog(state, { level: 'info', category: 'market', text: `${c.name} steckt in finanziellen Schwierigkeiten und verkleinert die Flotte.` });
      }
      const sell = Math.max(1, Math.round(c.trucks * 0.15));
      c.trucks = Math.max(1, c.trucks - sell);
      c.cash += sell * TRUCK_RESALE;
      c.priceLevel = Math.max(0.85, c.priceLevel - 0.02);
      if (c.cash < -c.trucks * 25_000_00 || (c.trucks <= 2 && c.cash < 0) || state.time - (c.troubleSince ?? state.time) > 120 * MIN_PER_DAY) {
        c.status = 'bankrupt';
        c.bankruptAt = state.time;
        addLog(state, { level: 'success', category: 'market', text: `Konkurs: ${c.name} (${CITY_BY_ID[c.hqCityId].name}) stellt den Betrieb ein – ihre Kunden suchen neue Partner.` });
      }
      continue;
    }
    if (c.status === 'trouble' && c.cash > c.trucks * 5_000_00) {
      c.status = 'active';
      delete c.troubleSince;
      c.priceLevel = c.strategy === 'budget' ? 0.92 : c.strategy === 'premium' ? 1.04 : 1;
    }
    // Wachstum bei Gewinn und hoher Auslastung
    if (profit > 0 && utilization > 0.8 && c.cash > c.trucks * 20_000_00) {
      const buy = Math.max(1, Math.round(c.trucks * 0.1));
      c.trucks += buy;
      c.cash -= buy * TRUCK_DOWN_PAYMENT;
    }
    // neue Niederlassung bei großer Flotte und voller Kasse
    if (c.cash > 300_000_00 && c.trucks >= 12 * c.cityIds.length) {
      const candidates = CITIES.filter((x) => x.pop > 250 && c.cityIds.every((id) => haversineKm(ll(CITY_BY_ID[id]), ll(x)) > 300));
      const city = rand.weighted(state, candidates, (x) => Math.sqrt(x.pop) * regionFactor(state, x.country) / (1 + Math.min(...c.cityIds.map((id) => haversineKm(ll(CITY_BY_ID[id]), ll(x)))) / 800));
      if (city) {
        c.cityIds.push(city.id);
        c.cash -= BRANCH_COST;
        addLog(state, { level: 'info', category: 'market', text: `${c.name} eröffnet eine Niederlassung in ${city.name} (${COUNTRY_NAMES[city.country] ?? city.country}).` });
      }
    }
  }
  // Marktlücke: neue Spedition (frühestens einen Monat nach einem Konkurs)
  const active = activeCompetitors(state).length;
  const recentBankrupt = Object.values(state.competitors).some((c) => c.bankruptAt !== undefined && state.time - c.bankruptAt < 30 * MIN_PER_DAY);
  if (active < MAX_COMPETITORS && !recentBankrupt && rand.chance(state, active < 4 ? 0.6 : 0.15)) {
    const c = foundCompetitor(state);
    addLog(state, { level: 'warning', category: 'market', text: `Neue Konkurrenz: ${c.name} startet in ${CITY_BY_ID[c.hqCityId].name} mit ${c.trucks} LKW (${STRATEGY_LABEL[c.strategy]}).` });
  }
}

/** Marktanteil an den Börsenaufträgen des letzten Monats (Spieler und Konkurrenz) */
export function competitorShare(state: GameState, c: Competitor): number {
  // Vormonat; im ersten Monat der laufende
  const active = activeCompetitors(state);
  const key = active.some((x) => x.lastMonth.orders) ? 'lastMonth' : 'month';
  const total = active.reduce((a, x) => a + x[key].orders, 0);
  return total ? c[key].orders / total : 0;
}

/** Vertriebsbesuch: abgewanderten Kunden zurückgewinnen (Kosten, Erfolg nach Ruf und Lage des Konkurrenten). */
export function winBackCustomer(state: GameState, customerId: Id): Result {
  const cu = state.customers[customerId];
  if (!cu?.lostTo) return { ok: false, error: 'Dieser Kunde arbeitet mit dir zusammen.' };
  if (cu.winBackAt !== undefined && state.time - cu.winBackAt < 14 * MIN_PER_DAY) return { ok: false, error: 'Der letzte Besuch ist noch keine zwei Wochen her.' };
  if (state.company.account.balance - WIN_BACK_COST < -10_000_00) return { ok: false, error: 'Nicht genügend Geld.' };
  const rival = state.competitors[cu.lostTo];
  const chance = winBackChance(state, cu);
  cu.winBackAt = state.time;
  book(state, 'company', -WIN_BACK_COST, 'other', `Vertriebsbesuch ${cu.name}`);
  if (rand.chance(state, chance)) {
    delete cu.lostTo;
    delete cu.lostAt;
    cu.satisfaction = 55;
    addLog(state, { level: 'success', category: 'market', text: `Vertriebsbesuch erfolgreich: ${cu.name} vergibt wieder Aufträge an dich.` });
    return { ok: true, won: true };
  }
  addLog(state, { level: 'info', category: 'market', text: `${cu.name} bleibt vorerst bei ${rival?.name ?? 'der Konkurrenz'} (Besuch ${formatMoney(WIN_BACK_COST)}).` });
  return { ok: true, won: false };
}

/** Erfolgschance eines Vertriebsbesuchs: eigener Ruf gegen den des Konkurrenten, Vertrieb, Lage des Konkurrenten */
export const winBackChance = (state: GameState, cu: Customer) => {
  const rival = cu.lostTo ? state.competitors[cu.lostTo] : undefined;
  return Math.max(0.1, Math.min(0.9, 0.3 + (state.company.reputation - (rival?.reputation ?? 50)) / 100 + (rival?.status === 'trouble' ? 0.25 : 0) + (salesVolumeFactor(state) - 1)));
};
