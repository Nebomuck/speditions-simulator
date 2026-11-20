// Firmenauftritt: Lackierung (Farben, Logo) und Marketing – regionale Kampagnen, Messeauftritte und
// ein Online-Auftritt. Alle Messen und Marken sind erfunden.

import { CITY_BY_ID } from './data/cities.ts';
import { COUNTRY_NAMES } from './data/catalog.ts';
import type { SimContext } from './context.ts';
import { generateContractOffer } from './contracts.ts';
import { addLog, book, formatMoney } from './finance.ts';
import { customerFor } from './generate.ts';
import { newId, rand } from './rng.ts';
import { MIN_PER_DAY, dayOfMonth } from './time.ts';
import type { GameState, GameTime, Id, Money } from './types.ts';

// ---------- Lackierung ----------

export type LogoShape = 'circle' | 'shield' | 'diamond' | 'square' | 'arrow';
export interface Livery {
  primary: string;
  secondary: string;
  shape: LogoShape;
  /** Kürzel im Logo, 1–3 Zeichen */
  initials: string;
}
export const LOGO_SHAPES: { id: LogoShape; name: string }[] = [
  { id: 'circle', name: 'Kreis' }, { id: 'shield', name: 'Wappen' }, { id: 'diamond', name: 'Raute' }, { id: 'square', name: 'Quadrat' }, { id: 'arrow', name: 'Pfeil' },
];
export const LIVERY_COLORS = ['#0ea5e9', '#2563eb', '#4f46e5', '#7c3aed', '#db2777', '#dc2626', '#ea580c', '#f59e0b', '#16a34a', '#0d9488', '#334155', '#111827', '#f8fafc', '#a16207'];

const HEX = /^#[0-9a-f]{6}$/i;
/** Kürzel aus dem Firmennamen, z. B. „Testfracht Nord“ → „TN“ */
export const defaultInitials = (name: string) =>
  name.split(/[\s-]+/).filter((w) => /^[A-Za-zÄÖÜäöü]/.test(w) && !/^(GmbH|AG|KG|UG|e\.?K\.?|Co\.?|&)$/i.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || 'SP';

export function defaultLivery(state: Pick<GameState, 'company' | 'seed'>): Livery {
  const i = Math.abs(state.seed ?? 0) % LIVERY_COLORS.length;
  return { primary: LIVERY_COLORS[i === 12 ? 1 : i], secondary: '#f8fafc', shape: 'shield', initials: defaultInitials(state.company.name) };
}
export const liveryOf = (state: Pick<GameState, 'company' | 'seed'>): Livery => state.company.livery ?? defaultLivery(state);

export function setLivery(state: GameState, l: Partial<Livery>): { ok: true } | { ok: false; error: string } {
  const cur = liveryOf(state);
  const next: Livery = { ...cur, ...l };
  if (!HEX.test(next.primary) || !HEX.test(next.secondary)) return { ok: false, error: 'Ungültige Farbe.' };
  if (!LOGO_SHAPES.some((s) => s.id === next.shape)) return { ok: false, error: 'Unbekannte Logoform.' };
  next.initials = String(next.initials ?? '').replace(/[^A-Za-z0-9ÄÖÜäöü&]/g, '').slice(0, 3).toUpperCase();
  if (!next.initials) return { ok: false, error: 'Bitte ein Kürzel mit 1–3 Zeichen angeben.' };
  const first = !state.company.livery;
  state.company.livery = next;
  if (first) addLog(state, { level: 'success', category: 'company', text: `Neuer Firmenauftritt: Die Fahrzeuge von ${state.company.name} tragen jetzt das eigene Logo.` });
  return { ok: true };
}

// ---------- Marketing ----------

export interface Campaign {
  id: Id;
  kind: 'regional';
  country: string;
  start: GameTime;
  until: GameTime;
  cost: Money;
}
export interface MarketingState {
  campaigns: Campaign[];
  online?: boolean;
  lastFair?: GameTime;
  fairs: number;
}

export const CAMPAIGN_COST: Money = 5_500_00;
export const CAMPAIGN_DAYS = 30;
export const FAIR_COST: Money = 12_000_00;
export const FAIR_COOLDOWN_DAYS = 60;
export const ONLINE_MONTHLY: Money = 400_00;

/** Erfundene Fachmessen in großen Logistikstädten */
export const FAIRS: { id: string; name: string; cityId: string }[] = [
  { id: 'logimesse', name: 'LogiMesse', cityId: 'muenchen' },
  { id: 'cargoexpo', name: 'Cargo Expo Benelux', cityId: 'rotterdam' },
  { id: 'fretpro', name: 'Salon Fret & Logistique', cityId: 'paris' },
  { id: 'trasporti', name: 'Fiera dei Trasporti', cityId: 'mailand' },
  { id: 'transbaltic', name: 'TransBaltic', cityId: 'danzig' },
  { id: 'iberlog', name: 'IberLog', cityId: 'madrid' },
  { id: 'nordfrakt', name: 'NordFrakt', cityId: 'goeteborg' },
  { id: 'danubelog', name: 'Danube Logistics Days', cityId: 'wien' },
];

export const marketing = (state: GameState): MarketingState => (state.company.marketing ??= { campaigns: [], fairs: 0 });
const activeCampaigns = (state: GameState) => (state.company.marketing?.campaigns ?? []).filter((c) => c.until > state.time);

/** Herkunftsgewicht der Börsenaufträge: Kampagnenland ×2 */
export const marketingOriginFactor = (state: GameState, country: string) => (activeCampaigns(state).some((c) => c.country === country) ? 2 : 1);
/** Preisaufschlag: bekannte Marke im Kampagnenland +3 % */
export const marketingPriceFactor = (state: GameState, country: string) => (activeCampaigns(state).some((c) => c.country === country) ? 1.03 : 1);
/** Gesamtvolumen der Börse: je Kampagne +6 %, Online-Auftritt +5 % */
export const marketingVolumeFactor = (state: GameState) => 1 + 0.06 * activeCampaigns(state).length + (state.company.marketing?.online ? 0.05 : 0);

type Result = { ok: true } | { ok: false; error: string };
const afford = (state: GameState, cost: Money) => state.company.account.balance - cost >= -10_000_00;

export function startCampaign(state: GameState, country: string): Result {
  if (!COUNTRY_NAMES[country]) return { ok: false, error: 'Unbekanntes Land.' };
  if (activeCampaigns(state).some((c) => c.country === country)) return { ok: false, error: `In ${COUNTRY_NAMES[country]} läuft bereits eine Kampagne.` };
  if (!afford(state, CAMPAIGN_COST)) return { ok: false, error: 'Nicht genügend Geld.' };
  const m = marketing(state);
  book(state, 'company', -CAMPAIGN_COST, 'other', `Werbekampagne ${COUNTRY_NAMES[country]}`);
  m.campaigns.push({ id: newId(state, 'cmp'), kind: 'regional', country, start: state.time, until: state.time + CAMPAIGN_DAYS * MIN_PER_DAY, cost: CAMPAIGN_COST });
  addLog(state, { level: 'success', category: 'market', text: `Werbekampagne in ${COUNTRY_NAMES[country]} gestartet (${CAMPAIGN_DAYS} Tage, ${formatMoney(CAMPAIGN_COST)}): mehr Angebote aus dem Land, Kunden zahlen etwas besser.` });
  return { ok: true };
}

export function fairBlock(state: GameState): string | undefined {
  const last = state.company.marketing?.lastFair;
  if (last !== undefined && state.time - last < FAIR_COOLDOWN_DAYS * MIN_PER_DAY) return `Der nächste Messeauftritt ist ab ${Math.ceil((last + FAIR_COOLDOWN_DAYS * MIN_PER_DAY - state.time) / MIN_PER_DAY)} Tagen möglich.`;
  if (!afford(state, FAIR_COST)) return 'Nicht genügend Geld.';
  return undefined;
}

/** Messestand: zwei neue Großkunden im Messeland, Ruf +3 und ein Vertragsangebot */
export function attendFair(state: GameState, ctx: SimContext, fairId: string): Result & { customers?: Id[] } {
  const fair = FAIRS.find((f) => f.id === fairId);
  if (!fair || !CITY_BY_ID[fair.cityId]) return { ok: false, error: 'Unbekannte Messe.' };
  const block = fairBlock(state);
  if (block) return { ok: false, error: block };
  const m = marketing(state);
  book(state, 'company', -FAIR_COST, 'other', `Messestand ${fair.name} (${CITY_BY_ID[fair.cityId].name})`);
  m.lastFair = state.time;
  m.fairs++;
  const country = CITY_BY_ID[fair.cityId].country;
  const cities = Object.values(CITY_BY_ID).filter((c) => c.country === country && c.industries.length && c.pop > 150);
  const found: Id[] = [];
  for (let i = 0; i < 2 && cities.length; i++) {
    const city = rand.weighted(state, cities, (c) => Math.sqrt(c.pop))!;
    const before = new Set(Object.keys(state.customers));
    const cu = customerFor(state, city.id, rand.pick(state, city.industries));
    if (!before.has(cu.id)) cu.size = 'large';
    cu.satisfaction = Math.max(cu.satisfaction, 65);
    if (!found.includes(cu.id)) found.push(cu.id);
  }
  state.company.reputation = Math.min(100, state.company.reputation + 3);
  let contract = null;
  for (const id of found) if (!contract) contract = generateContractOffer(state, ctx, undefined, state.customers[id]);
  contract ??= generateContractOffer(state, ctx);
  const names = found.map((id) => state.customers[id].name).join(' und ');
  addLog(state, {
    level: 'success', category: 'market',
    text: `Messeauftritt auf der ${fair.name} in ${CITY_BY_ID[fair.cityId].name}: neue Kontakte zu ${names}${contract ? ', dazu ein Angebot für einen Rahmenvertrag' : ''}. Ruf +3.`,
  });
  return { ok: true, customers: found };
}

export function setOnlinePresence(state: GameState, on: boolean): Result {
  const m = marketing(state);
  m.online = on;
  addLog(state, { level: 'info', category: 'market', text: on ? `Online-Auftritt mit Frachtportal und Bewertungen gestartet (${formatMoney(ONLINE_MONTHLY)} im Monat).` : 'Online-Auftritt beendet.' });
  return { ok: true };
}

/** Täglich: abgelaufene Kampagnen aufräumen, am Monatsersten Ruf durch den Online-Auftritt */
export function dailyMarketing(state: GameState): void {
  const m = state.company.marketing;
  if (!m) return;
  const ended = m.campaigns.filter((c) => c.until <= state.time);
  for (const c of ended) addLog(state, { level: 'info', category: 'market', text: `Werbekampagne in ${COUNTRY_NAMES[c.country] ?? c.country} ist ausgelaufen.` });
  m.campaigns = m.campaigns.filter((c) => c.until > state.time);
  if (m.online && dayOfMonth(state.time) === 1 && state.company.reputation < 70) state.company.reputation = Math.min(70, state.company.reputation + 0.5);
}
