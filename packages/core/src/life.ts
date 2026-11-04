// Lebenssimulation: Bedürfnisse, Wohnen und Besitz, Freizeit, Urlaub, Beziehungen, persönliche Entwicklung
// und die Work-Life-Balance. Privat- und Berufsleben beeinflussen sich gegenseitig: Der Arbeitsstil bestimmt,
// wie viel der Charakter selbst disponiert (und wie viel Stress er hat), Erschöpfung fällt auf die Firma zurück.

import type { SimContext } from './context.ts';
import { CITY_BY_ID } from './data/cities.ts';
import { dispatchers } from './autodispatch.ts';
import { dispatchShortfall } from './company.ts';
import { addLog, annuity, book, formatMoney } from './finance.ts';
import { personName } from './generate.ts';
import { newId, rand } from './rng.ts';
import { MIN_PER_DAY, formatDate, minuteOfDay, toDate, weekday } from './time.ts';
import type { Character, CharacterBackground, GameState, HomeKind, Id, Money, Needs, Player, Relation, WorkStyle } from './types.ts';

type Result = { ok: true; text?: string } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });

// ---------------------------------------------------------------- Kataloge

export const BACKGROUNDS: Record<CharacterBackground, { name: string; text: string; skills: Character['skills'] }> = {
  driver: { name: 'Berufskraftfahrer/in', text: 'Kennt Straßen und Lenkzeiten aus eigener Erfahrung – disponiert selbst mehr Fahrzeuge.', skills: { negotiation: 25, leadership: 35, logistics: 55 } },
  merchant: { name: 'Speditionskaufmann/-frau', text: 'Kaufmännisch geschult – verhandelt bessere Frachtpreise.', skills: { negotiation: 55, leadership: 35, logistics: 35 } },
  career_changer: { name: 'Quereinsteiger/in', text: 'Ausgewogener Start ohne besondere Stärken – lernt durch Weiterbildung.', skills: { negotiation: 30, leadership: 30, logistics: 30 } },
};

export interface HomeDef {
  name: string;
  /** Miete pro Monat (Mietwohnung) */
  rent?: Money;
  /** Kaufpreis (Eigentum) */
  price?: Money;
  /** Nebenkosten/Instandhaltung bei Eigentum */
  upkeep?: Money;
  comfort: number;
}

export const HOMES: Record<HomeKind, HomeDef> = {
  apartment_small: { name: 'Kleine Mietwohnung', rent: 650_00, comfort: 0 },
  apartment_large: { name: 'Große Mietwohnung', rent: 1_350_00, comfort: 10 },
  house: { name: 'Einfamilienhaus', price: 420_000_00, upkeep: 450_00, comfort: 20 },
  villa: { name: 'Villa', price: 1_350_000_00, upkeep: 1_400_00, comfort: 32 },
};
export const HOME_ORDER: HomeKind[] = ['apartment_small', 'apartment_large', 'house', 'villa'];
export const HOLIDAY_HOME = { name: 'Ferienhaus', price: 260_000_00, upkeep: 320_00 };
export const MOVING_COST: Money = 1_500_00;
/** Lebensmittel, Versicherungen, Telefon usw. (ohne Wohnen) */
export const LIVING_BASE: Money = 800_00;
export const CHILD_COST: Money = 450_00;
export const MORTGAGE = { downPayment: 0.2, ratePa: 0.039, months: 300, maxShareOfSalary: 0.4 };
/** Verkaufserlös von Immobilien (nach Maklerkosten) */
export const PROPERTY_SALE_FACTOR = 0.92;

export const PRIVATE_CARS: Record<string, { name: string; price: Money; upkeep: Money; happiness: number }> = {
  compact: { name: 'Kleinwagen', price: 18_000_00, upkeep: 220_00, happiness: 3 },
  estate: { name: 'Mittelklasse-Kombi', price: 38_000_00, upkeep: 380_00, happiness: 5 },
  premium: { name: 'Oberklasse-Limousine', price: 72_000_00, upkeep: 650_00, happiness: 8 },
  sports: { name: 'Sportwagen', price: 135_000_00, upkeep: 1_100_00, happiness: 11 },
};
export const CAR_RESALE = 0.6;

export const FURNITURE_LEVELS = [
  { name: 'Grundausstattung', cost: 0 },
  { name: 'Gemütlich eingerichtet', cost: 3_000_00 },
  { name: 'Hochwertige Einrichtung', cost: 9_000_00 },
  { name: 'Designermöbel', cost: 25_000_00 },
];

export const HOBBIES: Record<string, string> = {
  angling: 'Angeln', music: 'Musik', cooking: 'Kochen', photo: 'Fotografie', hiking: 'Wandern', models: 'Modellbau',
};

export interface ActivityDef {
  name: string;
  hours: number;
  cost: Money;
  effects: Partial<Needs>;
  text: string;
}

export const ACTIVITIES: Record<string, ActivityDef> = {
  eat_out: { name: 'Essen gehen', hours: 2, cost: 45_00, effects: { hunger: 25, social: 6, leisure: 8, happiness: 3 }, text: 'Sättigung, etwas Geselligkeit' },
  cinema: { name: 'Kino oder Konzert', hours: 3, cost: 35_00, effects: { leisure: 18, stress: -6, happiness: 4 }, text: 'Freizeit, Abschalten' },
  sport: { name: 'Sport treiben', hours: 2, cost: 15_00, effects: { health: 6, stress: -10, energy: -6, leisure: 6 }, text: 'Gesundheit, baut Stress ab' },
  friends: { name: 'Freunde treffen', hours: 4, cost: 60_00, effects: { social: 22, leisure: 10, stress: -6, happiness: 4 }, text: 'Soziale Kontakte, pflegt Freundschaften' },
  shopping: { name: 'Einkaufsbummel', hours: 3, cost: 150_00, effects: { happiness: 6, leisure: 6, stress: -3 }, text: 'Zufriedenheit' },
  wellness: { name: 'Wellness-Tag', hours: 8, cost: 220_00, effects: { stress: -25, energy: 15, health: 4, leisure: 10 }, text: 'Starker Stressabbau, Erholung' },
  hobby: { name: 'Hobby', hours: 3, cost: 40_00, effects: { leisure: 15, stress: -8, happiness: 3 }, text: 'Freizeit; das Hobby wird mit der Zeit erfüllender' },
  course: { name: 'Weiterbildung', hours: 8, cost: 900_00, effects: { stress: 4, energy: -8 }, text: '+5 auf eine Fähigkeit' },
};

export const VACATIONS: Record<string, { name: string; days: number; cost: Money }> = {
  short: { name: 'Kurzurlaub', days: 3, cost: 600_00 },
  week: { name: 'Urlaubswoche', days: 7, cost: 1_800_00 },
  far: { name: 'Fernreise', days: 14, cost: 4_500_00 },
};

export interface WorkStyleDef {
  name: string;
  /** Arbeitsstunden pro Tag */
  hours: number;
  /** Fahrzeuge, die der Charakter selbst disponiert (bei voller Leistungsfähigkeit) */
  managed: number;
  text: string;
  minDispatchers?: number;
  minLevel?: number;
  /** Kosten für die Firma (externe Geschäftsführung) */
  monthly?: Money;
}

export const WORK_STYLES: Record<WorkStyle, WorkStyleDef> = {
  hands_on: { name: 'Jeden Tag selbst disponieren', hours: 12, managed: 5, text: 'Volle Kontrolle, aber lange Tage: wenig Energie, viel Stress.' },
  key_accounts: { name: 'Nur wichtige Geschäftskunden betreuen', hours: 9, managed: 3, text: 'Stammkunden werden täglich etwas zufriedener.' },
  strategy: { name: 'Auf Unternehmensentwicklung konzentrieren', hours: 8, managed: 2, text: 'Die Reputation steigt langsam.' },
  delegate: { name: 'Geschäftsführung teilweise delegieren', hours: 5, managed: 1, minDispatchers: 1, text: 'Viel Freizeit; braucht mindestens einen Disponenten.' },
  ceo: { name: 'Geschäftsführer einsetzen und Freizeit genießen', hours: 2, managed: 0, minLevel: 3, monthly: 8_500_00, text: 'Ein angestellter Geschäftsführer (8.500 €/Monat) leitet die Firma.' },
};

export const LIFE_GOALS: Record<string, string> = {
  own_home: 'Eigenes Haus besitzen',
  partner: 'Feste Partnerschaft',
  family: 'Familie gründen',
  millionaire: 'Privatvermögen von 1 Mio. €',
  konzern: 'Europäischer Logistikkonzern (Stufe 6)',
  balance: 'Work-Life-Balance (Stress unter 30, Zufriedenheit über 75)',
  sports_car: 'Einen Sportwagen fahren',
};

export const PROPOSE_MIN_CLOSENESS = 70;
export const FAMILY_MIN_CLOSENESS = 75;
const PREGNANCY_DAYS = 270;
const MAX_FRIENDS = 8;

// ---------------------------------------------------------------- Abfragen

const clamp = (v: number) => Math.max(0, Math.min(100, v));

export function isAway(state: GameState, c: Character): boolean {
  return (c.activity !== undefined && state.time < c.activity.until) || (c.sickUntil !== undefined && state.time < c.sickUntil);
}

export function comfort(c: Character): number {
  return HOMES[c.home].comfort + (c.furniture ?? 0) * 4 + (c.holidayHome ? 3 : 0);
}

/** Leistungsfähigkeit 0,3–1 aus Energie, Gesundheit und Stress */
export function performance(c: Character): number {
  const n = c.needs;
  return Math.max(0.3, Math.min(1, 0.35 + n.energy / 300 + n.health / 300 - Math.max(0, n.stress - 70) / 80));
}

/** Fahrzeuge, die die Spieler selbst disponieren (ersetzt bei Abwesenheit/Erschöpfung die Disposition nicht). */
export function ceoManagedVehicles(state: GameState): number {
  let n = 0;
  for (const p of Object.values(state.players)) {
    const c = p.character;
    if (isAway(state, c)) continue;
    const ws = WORK_STYLES[c.workStyle ?? 'hands_on'];
    n += Math.round(ws.managed * performance(c)) + Math.floor((c.skills?.logistics ?? 30) / 40);
  }
  return n;
}

const bestSkill = (state: GameState, k: keyof Character['skills']) => Math.max(30, ...Object.values(state.players).map((p) => p.character.skills?.[k] ?? 30));
/** Verhandlungsgeschick: Aufschlag auf Börsenpreise (0 bei 30, bis +4 % bei 100) */
export const negotiationBonus = (state: GameState) => ((bestSkill(state, 'negotiation') - 30) / 70) * 0.04;
/** Führungsstärke: Zufriedenheitsbonus der Fahrer */
export const leadershipBonus = (state: GameState) => Math.floor((bestSkill(state, 'leadership') - 30) / 10);

export function goalDone(state: GameState, c: Character, id: string): boolean {
  switch (id) {
    case 'own_home': return c.home === 'house' || c.home === 'villa';
    case 'partner': return c.relations.some((r) => r.kind === 'partner');
    case 'family': return c.relations.some((r) => r.kind === 'child');
    case 'millionaire': return privateWealth(c) >= 1_000_000_00;
    case 'konzern': return (state.company.level ?? 1) >= 6;
    case 'balance': return c.needs.stress < 30 && c.needs.happiness > 75;
    case 'sports_car': return c.car === 'sports';
    default: return false;
  }
}

/** Privatvermögen: Konto + Immobilien (abzüglich Kredit) + Auto */
export function privateWealth(c: Character): Money {
  let v = c.privateAccount.balance;
  const h = HOMES[c.home];
  if (h.price) v += Math.round(h.price * PROPERTY_SALE_FACTOR) - (c.mortgage?.remaining ?? 0);
  if (c.holidayHome) v += Math.round(HOLIDAY_HOME.price * PROPERTY_SALE_FACTOR);
  if (c.car) v += Math.round(PRIVATE_CARS[c.car].price * CAR_RESALE);
  return v;
}

/** Monatliche Privatausgaben (für Anzeige und Monatsabrechnung) */
export function monthlyPrivateCosts(c: Character): { label: string; amount: Money }[] {
  const items: { label: string; amount: Money }[] = [];
  const h = HOMES[c.home];
  if (h.rent) items.push({ label: `Miete ${h.name}`, amount: h.rent });
  if (h.upkeep) items.push({ label: `Nebenkosten ${h.name}`, amount: h.upkeep });
  if (c.mortgage) items.push({ label: 'Immobilienkredit (Rate)', amount: Math.min(c.mortgage.monthly, c.mortgage.remaining + Math.round((c.mortgage.remaining * c.mortgage.ratePa) / 12)) });
  if (c.holidayHome) items.push({ label: `Nebenkosten ${HOLIDAY_HOME.name}`, amount: HOLIDAY_HOME.upkeep });
  if (c.car) items.push({ label: `Unterhalt ${PRIVATE_CARS[c.car].name}`, amount: PRIVATE_CARS[c.car].upkeep });
  const kids = c.relations.filter((r) => r.kind === 'child').length;
  items.push({ label: 'Lebenshaltung', amount: LIVING_BASE + kids * CHILD_COST });
  return items;
}

// ---------------------------------------------------------------- Simulation

/** Am Monatsersten: Wohnen, Lebenshaltung, Auto, Immobilienkredit vom Privatkonto. */
export function monthlyLife(state: GameState, p: Player): void {
  const c = p.character;
  const acc = `private:${p.id}` as const;
  for (const item of monthlyPrivateCosts(c)) {
    if (item.label.startsWith('Immobilienkredit')) continue;
    book(state, acc, -item.amount, 'living', item.label);
  }
  const m = c.mortgage;
  if (m) {
    const interest = Math.round((m.remaining * m.ratePa) / 12);
    const principal = Math.min(m.remaining, m.monthly - interest);
    book(state, acc, -interest, 'interest', 'Zinsen Immobilienkredit');
    book(state, acc, -principal, 'loan', 'Tilgung Immobilienkredit');
    m.remaining -= principal;
    if (m.remaining <= 0) {
      c.mortgage = undefined;
      addLog(state, { level: 'success', category: 'private', text: `${c.name}: Immobilienkredit vollständig abbezahlt – das ${HOMES[c.home].name} gehört dir.` });
    }
  }
  if (c.privateAccount.balance < 0)
    addLog(state, { level: 'danger', category: 'private', text: `${c.name}: Privatkonto im Minus (${formatMoney(c.privateAccount.balance)}). Geldsorgen erhöhen den Stress.` });
}

/** Täglich: Bedürfnisse, Erschöpfung, Beziehungen, Ereignisse und Rückwirkung auf die Firma. */
export function dailyLife(state: GameState): void {
  for (const p of Object.values(state.players)) dailyCharacter(state, p);
}

function dailyCharacter(state: GameState, p: Player): void {
  const c = p.character;
  const n = c.needs;
  const t = state.time;
  // Geburtstag am Gründungstag
  const d = toDate(t);
  const f = toDate(state.company.founded);
  if (t - state.company.founded > 300 * MIN_PER_DAY && d.getUTCMonth() === f.getUTCMonth() && d.getUTCDate() === f.getUTCDate()) {
    c.age++;
    n.happiness = clamp(n.happiness + 5);
    addLog(state, { level: 'info', category: 'private', text: `${c.name} feiert den ${c.age}. Geburtstag.` });
  }
  if (c.activity && t >= c.activity.until) c.activity = undefined;
  if (c.sickUntil !== undefined && t >= c.sickUntil) {
    c.sickUntil = undefined;
    addLog(state, { level: 'success', category: 'private', text: `${c.name} ist wieder bei Kräften.` });
  }

  const ws = WORK_STYLES[c.workStyle ?? 'hands_on'];
  const hours = isAway(state, c) ? 0 : ws.hours;
  const cf = comfort(c);
  const partner = c.relations.find((r) => r.kind === 'partner');
  const kids = c.relations.filter((r) => r.kind === 'child').length;
  let worries = 0;
  if (c.privateAccount.balance < 0) worries += 20;
  if (state.company.account.balance < -10_000_00) worries += 12;
  if (dispatchShortfall(state) > 0) worries += 8;

  n.energy += (100 - hours * 4.5 + cf * 0.4 - n.energy) * 0.35;
  n.hunger += (72 - n.hunger) * 0.3;
  n.stress += (10 + hours * 5 + worries - n.leisure * 0.15 - cf * 0.3 - (partner ? 5 : 0) - n.stress) * 0.25;
  n.leisure = n.leisure - 5 + (hours <= 5 ? 4 : 0);
  n.social -= partner ? 1.5 : 3;
  n.health += (92 - Math.max(0, n.stress - 55) * 0.9 - Math.max(0, 40 - n.energy) * 0.5 - n.health) * 0.06;
  const car = c.car ? PRIVATE_CARS[c.car].happiness : 0;
  const goals = (c.goals ?? []).filter((g) => goalDone(state, c, g)).length;
  const happyTarget =
    45 + (n.leisure - 50) * 0.2 + (n.social - 50) * 0.2 - (n.stress - 40) * 0.35 + cf * 0.5 + car + (partner ? 8 : 0) + kids * 5 + goals * 2 + (c.hobby?.level ?? 0) * 0.5 - (c.privateAccount.balance < 0 ? 10 : 0);
  n.happiness += (happyTarget - n.happiness) * 0.12;
  for (const k of Object.keys(n) as (keyof Needs)[]) n[k] = clamp(n[k]);

  // Erschöpfung: anhaltend hoher Stress oder schlechte Gesundheit legt den Charakter lahm
  c.burnoutDays = n.stress >= 90 ? (c.burnoutDays ?? 0) + 1 : 0;
  if (c.burnoutDays === 2)
    addLog(state, {
      level: 'danger',
      category: 'private',
      text: `${c.name} steht kurz vor dem Burnout (Stress ${Math.round(n.stress)}). In drei Tagen fällt die Geschäftsführung eine Woche aus – Urlaub, Wellness oder ein ruhigerer Arbeitsstil helfen jetzt.`,
    });
  if (!c.sickUntil && (c.burnoutDays >= 5 || n.health < 20)) {
    const days = c.burnoutDays >= 5 ? 7 : 4;
    c.sickUntil = t + days * MIN_PER_DAY;
    c.activity = undefined;
    c.burnoutDays = 0;
    n.stress = 55;
    n.happiness = clamp(n.happiness - 10);
    addLog(state, {
      level: 'danger',
      category: 'private',
      text: `${c.name} ist ${days === 7 ? 'völlig erschöpft' : 'krank'} und fällt ${days} Tage aus. In dieser Zeit disponiert niemand aus der Geschäftsführung – Disponenten oder ein ruhigerer Arbeitsstil helfen.`,
    });
  }

  // Beziehungen: ohne Kontakt kühlen sie ab
  for (const r of [...c.relations]) {
    if (r.kind === 'child') continue;
    if (t - r.lastContact > (r.kind === 'partner' ? 10 : 18) * MIN_PER_DAY) r.closeness -= r.kind === 'partner' ? 1 + (ws.hours >= 12 ? 0.5 : 0) : 0.7;
    else if (r.kind === 'partner' && ws.hours <= 8) r.closeness += 0.3;
    r.closeness = clamp(r.closeness);
    if (r.kind === 'friend' && r.closeness < 5) {
      c.relations = c.relations.filter((x) => x !== r);
      addLog(state, { level: 'warning', category: 'private', text: `${c.name} und ${r.name} haben sich aus den Augen verloren.` });
    } else if (r.kind === 'partner' && r.closeness < 15) {
      r.kind = 'friend';
      r.closeness = 20;
      n.happiness = clamp(n.happiness - 20);
      addLog(state, { level: 'danger', category: 'private', text: `${c.name} und ${r.name} haben sich getrennt – zu wenig gemeinsame Zeit.` });
    }
  }
  if (c.babyDue !== undefined && t >= c.babyDue) {
    c.babyDue = undefined;
    const child: Relation = { id: newId(state, 'rel'), name: personName(state, CITY_BY_ID[state.company.hqCityId]?.country ?? 'DE').split(' ')[0], kind: 'child', closeness: 90, since: t, lastContact: t };
    c.relations.push(child);
    n.happiness = clamp(n.happiness + 15);
    addLog(state, { level: 'success', category: 'private', text: `Familienzuwachs: ${child.name} ist da! Herzlichen Glückwunsch, ${c.name}.` });
  }
  // gelegentlich meldet sich ein alter Bekannter
  if (c.relations.filter((r) => r.kind === 'friend').length < MAX_FRIENDS && rand.chance(state, 0.015)) {
    const r = newFriend(state, c, 30);
    addLog(state, { level: 'info', category: 'private', text: `${r.name}, eine alte Bekanntschaft aus der Schulzeit, hat sich bei ${c.name} gemeldet.` });
  }

  // Rückwirkung auf die Firma
  if (!isAway(state, c)) {
    if (c.workStyle === 'key_accounts') for (const cu of Object.values(state.customers)) if (cu.deliveries > 0) cu.satisfaction = Math.min(100, cu.satisfaction + 0.3 * performance(c));
    if (c.workStyle === 'strategy') state.company.reputation = Math.min(100, state.company.reputation + 0.05 * performance(c));
  }
}

/** Uhrzeit, zu der Routine und „Fokus Firma“ die Freizeit planen */
export const ROUTINE_HOUR = 19;
/** Aktivitäten, die in der Wochenroutine wählbar sind (Weiterbildung braucht eine Auswahl, Urlaub plant „Fokus Firma“) */
export const ROUTINE_ACTIVITIES = ['eat_out', 'cinema', 'sport', 'friends', 'shopping', 'wellness', 'hobby'];

/** Was „Fokus Firma“ heute Abend unternimmt (oder null). Erst das dringendste Bedürfnis, dann Kontakte. */
export function autopilotChoice(state: GameState, c: Character): LifeAction | null {
  const n = c.needs;
  const covered = dispatchers(state).length > 0 || (c.workStyle ?? 'hands_on') === 'ceo';
  const sinceVacation = state.time - (c.lastActivity?.vacation ?? state.company.founded);
  const day = weekday(state.time);
  if (n.stress >= 78 && sinceVacation > 30 * MIN_PER_DAY && (covered || day >= 4)) {
    const v = c.holidayHome ? 'week' : 'short';
    if (c.privateAccount.balance >= VACATIONS[v].cost * (c.holidayHome ? 0.3 : 1) + 1_000_00) return { kind: 'vacation', vacation: v, holidayHome: c.holidayHome || undefined };
  }
  const partner = c.relations.find((r) => r.kind === 'partner');
  const stale = c.relations.filter((r) => r.kind === 'friend' && state.time - r.lastContact > 14 * MIN_PER_DAY).sort((a, b) => a.lastContact - b.lastContact)[0];
  const options: [number, LifeAction][] = [
    [(n.stress - 55) * (day >= 5 ? 1.2 : 0.6), { kind: 'activity', activity: day >= 5 ? 'wellness' : 'sport' }],
    [55 - n.social + (stale ? 10 : 0), { kind: 'activity', activity: 'friends', relationId: stale?.id }],
    [52 - n.leisure, { kind: 'activity', activity: c.hobby ? 'hobby' : 'cinema' }],
    [62 - n.health, { kind: 'activity', activity: 'sport' }],
    [55 - n.hunger + (partner && state.time - partner.lastContact > 6 * MIN_PER_DAY ? 15 : 0), { kind: 'activity', activity: 'eat_out' }],
  ];
  const [score, action] = options.sort((a, b) => b[0] - a[0])[0];
  if (score <= 0) return null;
  const def = action.kind === 'activity' ? ACTIVITIES[action.activity] : undefined;
  if (def && c.privateAccount.balance < def.cost + 500_00) return null;
  return action;
}

/** Stündlich: um 19 Uhr Wochenroutine bzw. „Fokus Firma“ ausführen. */
export function hourlyLife(state: GameState, ctx: SimContext): void {
  if (minuteOfDay(state.time) !== ROUTINE_HOUR * 60) return;
  const day = weekday(state.time);
  for (const p of Object.values(state.players)) {
    const c = p.character;
    if (isAway(state, c)) continue;
    let action: LifeAction | null = null;
    if (c.autopilot) action = autopilotChoice(state, c);
    else {
      const entry = c.routine?.find((r) => r.day === day);
      if (entry && ACTIVITIES[entry.activity]) action = { kind: 'activity', activity: entry.activity };
    }
    if (!action) continue;
    const r = applyLife(state, ctx, p.id, action);
    if (!r.ok && !c.autopilot) addLog(state, { level: 'info', category: 'private', text: `Routine (${ACTIVITIES[(action as { activity: string }).activity]?.name}) fällt heute aus: ${r.error}` });
  }
}

function newFriend(state: GameState, c: Character, closeness: number): Relation {
  const near = Object.values(CITY_BY_ID).filter((x) => x.country === (CITY_BY_ID[state.company.hqCityId]?.country ?? 'DE'));
  const city = rand.pick(state, near.length ? near : Object.values(CITY_BY_ID));
  const r: Relation = { id: newId(state, 'rel'), name: personName(state, city.country), kind: 'friend', closeness, since: state.time, lastContact: state.time, cityId: city.id };
  c.relations.push(r);
  return r;
}

// ---------------------------------------------------------------- Gewinnausschüttung

/** Kapitalertragsteuer inkl. Solidaritätszuschlag */
export const DIVIDEND_TAX = 0.26375;

/** Gewinnausschüttung: Firmengeld aufs Privatkonto (abzüglich Kapitalertragsteuer), nur aus echtem Guthaben. */
export function payDividend(state: GameState, playerId: Id, amount: Money): Result {
  const p = state.players[playerId];
  if (!p) return fail('Spieler nicht gefunden.');
  amount = Math.round(amount / 100) * 100;
  if (amount < 100_00) return fail('Mindestens 100 € ausschütten.');
  if (amount > state.company.account.balance) return fail(`Ausschüttung nur aus vorhandenem Guthaben (${formatMoney(Math.max(0, state.company.account.balance))}).`);
  const tax = Math.round(amount * DIVIDEND_TAX);
  book(state, 'company', -amount, 'other', `Gewinnausschüttung an ${p.character.name}`);
  book(state, `private:${p.id}`, amount, 'salary', 'Gewinnausschüttung');
  book(state, `private:${p.id}`, -tax, 'tax', 'Kapitalertragsteuer auf Ausschüttung');
  addLog(state, { level: 'info', category: 'finance', text: `${p.character.name} lässt sich ${formatMoney(amount)} Gewinn ausschütten (netto ${formatMoney(amount - tax)}).` });
  return { ok: true };
}

// ---------------------------------------------------------------- Aktionen

export type LifeAction =
  | { kind: 'activity'; activity: string; skill?: keyof Character['skills']; relationId?: Id }
  | { kind: 'vacation'; vacation: string; holidayHome?: boolean }
  | { kind: 'workStyle'; style: WorkStyle }
  | { kind: 'moveHome'; home: HomeKind; mortgage?: boolean }
  | { kind: 'holidayHome'; buy: boolean }
  | { kind: 'car'; carId: string | null }
  | { kind: 'furniture' }
  | { kind: 'hobby'; hobby: string }
  | { kind: 'goals'; goals: string[] }
  | { kind: 'relation'; relationId: Id; action: 'gift' | 'propose' | 'family' }
  | { kind: 'routine'; routine: { day: number; activity: string }[] }
  | { kind: 'autopilot'; on: boolean };

function pay(state: GameState, p: Player, amount: Money, text: string): boolean {
  if (p.character.privateAccount.balance < amount) return false;
  book(state, `private:${p.id}`, -amount, 'living', text);
  return true;
}

function apply(n: Needs, eff: Partial<Needs>, factor = 1) {
  for (const [k, v] of Object.entries(eff) as [keyof Needs, number][]) n[k] = clamp(n[k] + v * factor);
}

export function applyLife(state: GameState, ctx: SimContext, playerId: Id, a: LifeAction): Result {
  void ctx;
  const p = state.players[playerId];
  if (!p) return fail('Spieler nicht gefunden.');
  const c = p.character;
  const busy = () => (c.sickUntil !== undefined && state.time < c.sickUntil ? 'Du bist gerade krank.' : c.activity && state.time < c.activity.until ? `Du bist noch beschäftigt (${c.activity.text}) bis ${formatDate(c.activity.until)}.` : null);

  switch (a.kind) {
    case 'activity': {
      const def = ACTIVITIES[a.activity];
      if (!def) return fail('Unbekannte Aktivität.');
      const b = busy();
      if (b) return fail(b);
      if (a.activity === 'hobby' && !c.hobby) return fail('Wähle zuerst ein Hobby.');
      if (a.activity === 'course' && (!a.skill || !(a.skill in c.skills))) return fail('Welche Fähigkeit soll geschult werden?');
      if (a.activity === 'course' && c.skills[a.skill!] >= 95) return fail('Diese Fähigkeit ist bereits ausgereizt.');
      if (!pay(state, p, def.cost, def.name)) return fail('Nicht genügend Geld auf dem Privatkonto.');
      // Wiederholung innerhalb von 24 h wirkt nur halb
      const last = c.lastActivity?.[a.activity];
      const factor = last !== undefined && state.time - last < MIN_PER_DAY ? 0.5 : 1;
      (c.lastActivity ??= {})[a.activity] = state.time;
      apply(c.needs, def.effects, factor);
      c.activity = { id: a.activity, until: state.time + def.hours * 60, text: def.name };
      let text = `${c.name}: ${def.name}.`;
      if (a.activity === 'friends') {
        const friends = c.relations.filter((r) => r.kind !== 'child');
        const r = (a.relationId && friends.find((x) => x.id === a.relationId)) || [...friends].sort((x, y) => x.lastContact - y.lastContact)[0];
        if (r) {
          r.closeness = clamp(r.closeness + 12 * factor);
          r.lastContact = state.time;
          text = `${c.name} verbringt Zeit mit ${r.name}.`;
        }
        if (c.relations.filter((x) => x.kind === 'friend').length < MAX_FRIENDS && rand.chance(state, r ? 0.25 : 0.8)) {
          const nf = newFriend(state, c, 25);
          text += ` Dabei lernst du ${nf.name} kennen.`;
        }
      }
      if (a.activity === 'eat_out' || a.activity === 'cinema') {
        const partner = c.relations.find((r) => r.kind === 'partner');
        if (partner) {
          partner.closeness = clamp(partner.closeness + 5 * factor);
          partner.lastContact = state.time;
        }
      }
      if (a.activity === 'hobby' && c.hobby && rand.chance(state, 0.35)) c.hobby.level = Math.min(10, c.hobby.level + 1);
      if (a.activity === 'course') {
        c.skills[a.skill!] = Math.min(95, c.skills[a.skill!] + 5);
        text = `${c.name} besucht eine Weiterbildung (${{ negotiation: 'Verhandlung', leadership: 'Mitarbeiterführung', logistics: 'Logistikplanung' }[a.skill!]} jetzt ${c.skills[a.skill!]}).`;
      }
      addLog(state, { level: 'info', category: 'private', text });
      return { ok: true, text };
    }
    case 'vacation': {
      const v = VACATIONS[a.vacation];
      if (!v) return fail('Unbekannte Reise.');
      const b = busy();
      if (b) return fail(b);
      if (a.holidayHome && !c.holidayHome) return fail('Du besitzt kein Ferienhaus.');
      const cost = Math.round(v.cost * (a.holidayHome ? 0.3 : 1));
      if (!pay(state, p, cost, `${v.name}${a.holidayHome ? ' im Ferienhaus' : ''}`)) return fail('Nicht genügend Geld auf dem Privatkonto.');
      apply(c.needs, { stress: -v.days * 5, energy: 30, leisure: v.days * 6, happiness: v.days + (a.holidayHome ? 5 : 0), health: v.days, social: v.days });
      const partner = c.relations.find((r) => r.kind === 'partner');
      if (partner) {
        partner.closeness = clamp(partner.closeness + v.days * 2);
        partner.lastContact = state.time + v.days * MIN_PER_DAY;
      }
      for (const r of c.relations) if (r.kind === 'child') r.lastContact = state.time;
      c.activity = { id: 'vacation', until: state.time + v.days * MIN_PER_DAY, text: v.name };
      (c.lastActivity ??= {}).vacation = state.time;
      const covered = dispatchers(state).length > 0;
      addLog(state, {
        level: 'info',
        category: 'private',
        text: `${c.name} ist bis ${formatDate(c.activity.until)} im ${v.name}${partner ? ` mit ${partner.name}` : ''}.${covered ? '' : ' Ohne Disponenten bleibt die Disposition in dieser Zeit liegen.'}`,
      });
      return { ok: true };
    }
    case 'workStyle': {
      const ws = WORK_STYLES[a.style];
      if (!ws) return fail('Unbekannter Arbeitsstil.');
      if (ws.minDispatchers && dispatchers(state).length < ws.minDispatchers) return fail('Zum Delegieren braucht es mindestens einen Disponenten (Standorte & Ausbau → Abteilungen).');
      if (ws.minLevel && (state.company.level ?? 1) < ws.minLevel) return fail(`Ein angestellter Geschäftsführer ab Unternehmensstufe ${ws.minLevel}.`);
      c.workStyle = a.style;
      addLog(state, { level: 'info', category: 'private', text: `${c.name}: ${ws.name}.` });
      return { ok: true };
    }
    case 'moveHome': {
      const h = HOMES[a.home];
      if (!h) return fail('Unbekannte Wohnform.');
      if (a.home === c.home) return fail('Du wohnst bereits so.');
      const oldKind = c.home;
      const old = HOMES[oldKind];
      // Erlös der bisherigen Immobilie
      const proceeds = old.price ? Math.round(old.price * PROPERTY_SALE_FACTOR) - (c.mortgage?.remaining ?? 0) : 0;
      const available = c.privateAccount.balance + proceeds;
      let mortgage: Character['mortgage'];
      let upfront = MOVING_COST;
      if (h.price) {
        if (a.mortgage) {
          const principal = Math.round(h.price * (1 - MORTGAGE.downPayment));
          const monthly = annuity(principal, MORTGAGE.ratePa, MORTGAGE.months);
          if (monthly > c.salary * MORTGAGE.maxShareOfSalary)
            return fail(`Die Bank lehnt ab: Rate ${formatMoney(monthly)} wäre mehr als ${MORTGAGE.maxShareOfSalary * 100} % deines Geschäftsführergehalts.`);
          mortgage = { principal, remaining: principal, monthly, ratePa: MORTGAGE.ratePa };
          upfront += h.price - principal;
        } else upfront += h.price;
      }
      if (available < upfront) return fail(`Nicht genügend Privatvermögen (benötigt ${formatMoney(upfront)}, verfügbar ${formatMoney(available)}).`);
      const acc = `private:${p.id}` as const;
      if (old.price) {
        book(state, acc, Math.round(old.price * PROPERTY_SALE_FACTOR), 'other', `Verkauf ${old.name}`);
        if (c.mortgage) book(state, acc, -c.mortgage.remaining, 'loan', 'Ablösung Immobilienkredit');
        c.mortgage = undefined;
      }
      book(state, acc, -MOVING_COST, 'living', 'Umzug');
      if (h.price) {
        book(state, acc, -h.price, 'other', `Kauf ${h.name}`);
        if (mortgage) book(state, acc, mortgage.principal, 'loan', 'Immobilienkredit');
        c.mortgage = mortgage;
      }
      c.home = a.home;
      c.needs.happiness = clamp(c.needs.happiness + (HOME_ORDER.indexOf(a.home) > HOME_ORDER.indexOf(oldKind) ? 8 : -4));
      addLog(state, { level: 'success', category: 'private', text: `${c.name} zieht um: ${h.name}${mortgage ? ` (Kreditrate ${formatMoney(mortgage.monthly)}/Monat)` : ''}.` });
      return { ok: true };
    }
    case 'holidayHome': {
      const acc = `private:${p.id}` as const;
      if (a.buy) {
        if (c.holidayHome) return fail('Du besitzt bereits ein Ferienhaus.');
        if (!pay(state, p, HOLIDAY_HOME.price, `Kauf ${HOLIDAY_HOME.name}`)) return fail(`Nicht genügend Geld (${formatMoney(HOLIDAY_HOME.price)}).`);
        c.holidayHome = true;
        addLog(state, { level: 'success', category: 'private', text: `${c.name} hat ein Ferienhaus gekauft – Urlaube dort kosten nur noch einen Bruchteil.` });
      } else {
        if (!c.holidayHome) return fail('Kein Ferienhaus vorhanden.');
        book(state, acc, Math.round(HOLIDAY_HOME.price * PROPERTY_SALE_FACTOR), 'other', `Verkauf ${HOLIDAY_HOME.name}`);
        c.holidayHome = false;
      }
      return { ok: true };
    }
    case 'car': {
      const acc = `private:${p.id}` as const;
      const resale = c.car ? Math.round(PRIVATE_CARS[c.car].price * CAR_RESALE) : 0;
      if (a.carId === null) {
        if (!c.car) return fail('Kein Auto vorhanden.');
        book(state, acc, resale, 'other', `Verkauf ${PRIVATE_CARS[c.car].name}`);
        c.car = undefined;
        return { ok: true };
      }
      const car = PRIVATE_CARS[a.carId];
      if (!car) return fail('Unbekanntes Fahrzeug.');
      if (c.car === a.carId) return fail('Dieses Auto fährst du bereits.');
      if (c.privateAccount.balance + resale < car.price) return fail(`Nicht genügend Geld (${formatMoney(car.price)}${resale ? `, Inzahlungnahme ${formatMoney(resale)}` : ''}).`);
      if (c.car) book(state, acc, resale, 'other', `Inzahlungnahme ${PRIVATE_CARS[c.car].name}`);
      book(state, acc, -car.price, 'other', `Kauf ${car.name}`);
      c.car = a.carId;
      c.needs.happiness = clamp(c.needs.happiness + 4);
      addLog(state, { level: 'success', category: 'private', text: `${c.name} fährt jetzt einen ${car.name}.` });
      return { ok: true };
    }
    case 'furniture': {
      const next = FURNITURE_LEVELS[(c.furniture ?? 0) + 1];
      if (!next) return fail('Die Einrichtung ist bereits vom Feinsten.');
      if (!pay(state, p, next.cost, `Möbel: ${next.name}`)) return fail(`Nicht genügend Geld (${formatMoney(next.cost)}).`);
      c.furniture = (c.furniture ?? 0) + 1;
      c.needs.happiness = clamp(c.needs.happiness + 3);
      return { ok: true };
    }
    case 'hobby': {
      if (!HOBBIES[a.hobby]) return fail('Unbekanntes Hobby.');
      c.hobby = { id: a.hobby, level: c.hobby?.id === a.hobby ? c.hobby.level : 0 };
      return { ok: true };
    }
    case 'routine': {
      const seen = new Set<number>();
      c.routine = (Array.isArray(a.routine) ? a.routine : [])
        .filter((r) => Number.isInteger(r?.day) && r.day >= 0 && r.day <= 6 && ROUTINE_ACTIVITIES.includes(r.activity) && !seen.has(r.day) && seen.add(r.day))
        .map((r) => ({ day: r.day, activity: r.activity }));
      return { ok: true };
    }
    case 'autopilot': {
      c.autopilot = !!a.on;
      addLog(state, { level: 'info', category: 'private', text: c.autopilot ? `${c.name}: Fokus Firma – Freizeit, Kontakte und Urlaub plant das Spiel.` : `${c.name} plant das Privatleben wieder selbst.` });
      return { ok: true };
    }
    case 'goals': {
      c.goals = [...new Set(a.goals.filter((g) => LIFE_GOALS[g]))].slice(0, 4);
      return { ok: true };
    }
    case 'relation': {
      const r = c.relations.find((x) => x.id === a.relationId);
      if (!r) return fail('Person nicht gefunden.');
      if (a.action === 'gift') {
        if (r.kind === 'child') return fail('Kinder freuen sich lieber über gemeinsame Zeit im Urlaub.');
        if (!pay(state, p, 120_00, `Geschenk für ${r.name}`)) return fail('Nicht genügend Geld.');
        r.closeness = clamp(r.closeness + 6);
        r.lastContact = state.time;
        return { ok: true };
      }
      if (a.action === 'propose') {
        if (r.kind !== 'friend') return fail('Nur aus einer Freundschaft kann eine Partnerschaft werden.');
        if (c.relations.some((x) => x.kind === 'partner')) return fail('Du bist bereits in einer Partnerschaft.');
        if (r.closeness < PROPOSE_MIN_CLOSENESS) return fail(`Dafür kennt ihr euch noch nicht gut genug (Nähe ${Math.round(r.closeness)}/${PROPOSE_MIN_CLOSENESS}).`);
        const chance = Math.min(0.95, 0.35 + (r.closeness - PROPOSE_MIN_CLOSENESS) / 60 + c.needs.happiness / 400);
        if (rand.chance(state, chance)) {
          r.kind = 'partner';
          r.closeness = clamp(r.closeness + 10);
          r.lastContact = state.time;
          c.needs.happiness = clamp(c.needs.happiness + 15);
          addLog(state, { level: 'success', category: 'private', text: `${c.name} und ${r.name} sind jetzt ein Paar.` });
          return { ok: true, text: 'partner' };
        }
        r.closeness = clamp(r.closeness - 15);
        c.needs.happiness = clamp(c.needs.happiness - 5);
        addLog(state, { level: 'warning', category: 'private', text: `${r.name} möchte lieber befreundet bleiben.` });
        return { ok: true, text: 'friend' };
      }
      // Familie gründen
      if (r.kind !== 'partner') return fail('Eine Familie gründest du gemeinsam mit deinem Partner bzw. deiner Partnerin.');
      if (c.babyDue !== undefined) return fail('Ihr erwartet bereits Nachwuchs.');
      if (r.closeness < FAMILY_MIN_CLOSENESS) return fail(`Eure Beziehung braucht dafür mehr Nähe (${Math.round(r.closeness)}/${FAMILY_MIN_CLOSENESS}).`);
      if (c.home === 'apartment_small') return fail('Für eine Familie ist die kleine Wohnung zu eng.');
      c.babyDue = state.time + PREGNANCY_DAYS * MIN_PER_DAY;
      addLog(state, { level: 'success', category: 'private', text: `${c.name} und ${r.name} erwarten Nachwuchs (voraussichtlich ${formatDate(c.babyDue)}).` });
      return { ok: true };
    }
  }
}
