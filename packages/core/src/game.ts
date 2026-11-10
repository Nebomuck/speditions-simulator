// GameCore: Neues Spiel anlegen, Spieler hinzufügen.

import { CITY_BY_ID } from './data/cities.ts';
import { TRAILER_BY_TYPE, TRUCK_BY_ID } from './data/catalog.ts';
import type { SimContext } from './context.ts';
import { ALL_PERMISSIONS } from './commands.ts';
import { addLog, formatMoney } from './finance.ts';
import { makeApplicant, makeVehicleOffer, plate, usedValue } from './generate.ts';
import { freshHos } from './hos.ts';
import { updateOrderMarket } from './orders.ts';
import { defaultAutoDispatch } from './autodispatch.ts';
import { BACKGROUNDS } from './life.ts';
import { TEAM_ROLES } from './team.ts';
import { updateWeather } from './world.ts';
import { defaultEconomy } from './economy.ts';
import { seedCompetitors } from './competition.ts';
import { defaultEvents } from './events.ts';
import { startQuarter } from './goals.ts';
import { defaultProgress } from './progress.ts';
import { applyScenario, isScenarioId } from './scenarios.ts';
import { newId } from './rng.ts';
import { defaultNews } from './news.ts';
import { toDate } from './time.ts';
import type { Character, Difficulty, DifficultyId, GameState, Id, Permission, Player, ScenarioId, TeamRole } from './types.ts';

export const STATE_VERSION = 13;

export const DIFFICULTIES: Record<Exclude<DifficultyId, 'custom'>, Difficulty> = {
  easy: { id: 'easy', startCapital: 60_000_00, rateFactor: 1.08, eventFactor: 0.5, paymentRiskFactor: 0.5, startTruckOwned: true },
  normal: { id: 'normal', startCapital: 25_000_00, rateFactor: 1.0, eventFactor: 1.0, paymentRiskFactor: 1.0, startTruckOwned: false },
  realistic: { id: 'realistic', startCapital: 18_000_00, rateFactor: 1.0, eventFactor: 1.1, paymentRiskFactor: 1.1, startTruckOwned: false },
};

/** Grenzen des benutzerdefinierten Schwierigkeitsgrads */
export const CUSTOM_LIMITS = {
  startCapital: [5_000_00, 250_000_00],
  rateFactor: [0.8, 1.3],
  eventFactor: [0, 2],
  paymentRiskFactor: [0, 2],
} as const;

/** Benutzerdefinierte Werte auf zulässige Bereiche begrenzen (auch für Eingaben vom Netzwerk). */
export function sanitizeDifficulty(p: Partial<Difficulty> | undefined): Partial<Difficulty> {
  const out: Partial<Difficulty> = {};
  if (!p || typeof p !== 'object') return out;
  for (const k of Object.keys(CUSTOM_LIMITS) as (keyof typeof CUSTOM_LIMITS)[]) {
    const v = Number(p[k]);
    if (Number.isFinite(v)) out[k] = Math.min(CUSTOM_LIMITS[k][1], Math.max(CUSTOM_LIMITS[k][0], v));
  }
  if (out.startCapital !== undefined) out.startCapital = Math.round(out.startCapital / 100) * 100;
  if (typeof p.startTruckOwned === 'boolean') out.startTruckOwned = p.startTruckOwned;
  return out;
}

export const DIFFICULTY_LABEL: Record<DifficultyId, string> = { easy: 'Einfach', normal: 'Normal', realistic: 'Realistisch', custom: 'Benutzerdefiniert' };

export interface NewGameOptions {
  seed?: number;
  companyName: string;
  hqCityId: string;
  difficulty: DifficultyId;
  customDifficulty?: Partial<Difficulty>;
  founder: { id?: Id; name: string; character?: Partial<Character> };
  /** Szenario mit eigenem Ziel (fehlt: freies Spiel) */
  scenario?: ScenarioId;
  /** Neustart-Bonus aus früheren Firmenverkäufen (siehe legacyBonus) */
  legacy?: { capital: number; reputation: number; exits: number };
}

export function makeCharacter(name: string, partial: Partial<Character> = {}): Character {
  const c: Character = {
    name,
    age: 32,
    avatar: { skin: 1, hair: 2, hairColor: 1, shirt: 0 },
    privateAccount: { balance: 6_000_00 },
    salary: 2_400_00,
    home: 'apartment_small',
    needs: { energy: 80, hunger: 70, stress: 30, health: 90, happiness: 65, social: 60, leisure: 50 },
    background: 'career_changer',
    skills: { ...BACKGROUNDS.career_changer.skills },
    goals: [],
    workStyle: 'hands_on',
    furniture: 0,
    relations: [],
    ...partial,
  };
  // Startfähigkeiten folgen dem Hintergrund, wenn keine eigenen angegeben sind
  if (partial.background && !partial.skills) c.skills = { ...BACKGROUNDS[c.background].skills };
  return c;
}

export function createNewGame(ctx: SimContext, opts: NewGameOptions): GameState {
  const hq = CITY_BY_ID[opts.hqCityId];
  if (!hq || !ctx.net.hasCity(hq.id)) throw new Error('Ungültiger Firmensitz.');
  const base = opts.difficulty === 'custom' ? DIFFICULTIES.normal : DIFFICULTIES[opts.difficulty];
  const difficulty: Difficulty = { ...base, ...(opts.difficulty === 'custom' ? sanitizeDifficulty(opts.customDifficulty) : {}), id: opts.difficulty };
  const seed = (opts.seed ?? Math.floor(Math.random() * 2 ** 31)) | 0;
  const startTime = 6 * 60; // Montag 06:00

  const state: GameState = {
    format: 'spedsim-state',
    version: STATE_VERSION,
    seed,
    rng: seed,
    nextId: 1,
    time: startTime,
    speed: 5,
    paused: true,
    difficulty,
    company: {
      name: opts.companyName.trim() || 'Meine Spedition',
      hqCityId: hq.id,
      account: { balance: difficulty.startCapital + Math.max(0, Math.min(100_000_00, Math.round(opts.legacy?.capital ?? 0))) },
      loans: [],
      founded: startTime,
      locations: [],
      staff: [],
      level: 1,
      reputation: 30 + Math.max(0, Math.min(9, Math.round(opts.legacy?.reputation ?? 0))),
      totals: { deliveries: 0, lateDeliveries: 0, revenue: 0, kmLoaded: 0, kmEmpty: 0 },
    },
    players: {},
    drivers: {},
    applicants: {},
    vehicles: {},
    trailers: {},
    vehicleOffers: {},
    customers: {},
    orders: {},
    trips: {},
    invoices: {},
    ledger: [],
    log: [],
    chat: [],
    market: { diesel: 155, demand: 1, dieselHistory: [{ t: startTime, v: 155 }] },
    stats: [],
    today: { revenue: 0, costs: 0 },
    disruptions: [],
    contracts: {},
    autoDispatch: defaultAutoDispatch(),
    team: { messages: [], tasks: [], activities: [], votes: [] },
    weather: {},
    economy: defaultEconomy(startTime),
    competitors: {},
    events: defaultEvents(),
    decisions: [],
    tenders: {},
    quarterHistory: [],
    progress: defaultProgress(),
    news: defaultNews(),
  };

  const founderId = opts.founder.id ?? newId(state, 'pl');
  addPlayer(state, { id: founderId, name: opts.founder.name, isFounder: true, permissions: ALL_PERMISSIONS, character: opts.founder.character });

  state.company.locations.push({ id: newId(state, 'loc'), cityId: hq.id, kind: 'office_small', since: startTime, facilities: [] });

  // Startfahrzeug: gebrauchte Zugmaschine (geleast oder gekauft je nach Schwierigkeit)
  const model = TRUCK_BY_ID['nordwal-tx420'];
  const year = toDate(startTime).getUTCFullYear() - 5;
  const vehId = newId(state, 'veh');
  const value = usedValue(model.price, 5, 540_000, 72);
  state.vehicles[vehId] = {
    id: vehId, modelId: model.id, plate: plate(state, hq.id), year, odometerKm: 540_000, condition: 72, fuelL: model.tankL * 0.8,
    cityId: hq.id, status: 'idle', ownership: difficulty.startTruckOwned ? 'owned' : 'leased',
    leaseRate: difficulty.startTruckOwned ? undefined : 1_290_00, purchasePrice: value, bought: startTime,
    history: [{ t: startTime, text: difficulty.startTruckOwned ? 'Gebraucht übernommen' : 'Gebraucht geleast', cost: 0 }],
  };
  const trlId = newId(state, 'trl');
  const tdef = TRAILER_BY_TYPE.curtain;
  state.trailers[trlId] = {
    id: trlId, type: 'curtain', plate: plate(state, hq.id), condition: 80, cityId: hq.id, status: 'idle',
    ownership: difficulty.startTruckOwned ? 'owned' : 'leased', leaseRate: difficulty.startTruckOwned ? undefined : 390_00,
    purchasePrice: Math.round(tdef.price * 0.55), bought: startTime,
  };

  // Erster Fahrer
  const app = makeApplicant(state, hq.id);
  const drvId = newId(state, 'drv');
  state.drivers[drvId] = {
    id: drvId, name: app.name, age: app.age, homeCityId: app.homeCityId, cityId: hq.id, experience: Math.max(35, app.experience),
    licenses: ['C', 'CE'], qualifications: app.qualifications, salary: Math.min(app.salary, 3_300_00), reliability: Math.max(55, app.reliability),
    ecoDriving: app.ecoDriving, stressResistance: app.stressResistance, satisfaction: 70, hired: startTime, status: 'idle', hos: freshHos(), kmDriven: 0, vacationLeft: 30, lastVacation: startTime, trait: app.trait,
  };

  for (let i = 0; i < 6; i++) {
    const a = makeApplicant(state, hq.id);
    state.applicants[a.id] = a;
  }
  for (let i = 0; i < 8; i++) {
    const o = makeVehicleOffer(state, hq.id);
    state.vehicleOffers[o.id] = o;
  }
  // Szenario vor dem Markt anwenden: Fuhrpark und Auflieger bestimmen die passenden Angebote
  if (isScenarioId(opts.scenario)) applyScenario(state, opts.scenario);
  startQuarter(state);
  updateWeather(state, ctx);
  seedCompetitors(state);
  updateOrderMarket(state, ctx, true);

  addLog(state, {
    level: 'success',
    category: 'company',
    text: `${state.company.name} wurde in ${hq.name} gegründet. Startkapital: ${formatMoney(state.company.account.balance)}. Viel Erfolg!`,
  });
  return state;
}

export function addPlayer(
  state: GameState,
  p: { id: Id; name: string; isFounder?: boolean; permissions?: Permission[]; role?: TeamRole; character?: Partial<Character> },
): Player {
  const role: TeamRole = p.isFounder ? 'ceo' : (p.role ?? (p.permissions ? 'custom' : 'dispatcher'));
  const player: Player = {
    id: p.id,
    name: p.name,
    isFounder: !!p.isFounder,
    permissions: p.permissions ?? (role === 'custom' ? [] : [...TEAM_ROLES[role].permissions]),
    character: makeCharacter(p.name, p.character),
    role,
  };
  state.players[p.id] = player;
  if (!p.isFounder) addLog(state, { level: 'info', category: 'multiplayer', text: `${p.name} ist der Firma beigetreten.` });
  return player;
}
