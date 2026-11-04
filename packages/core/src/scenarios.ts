// Szenarien: Spielstart mit eigener Ausgangslage, einem klaren Ziel und einer Frist.
// Nach Ablauf (gewonnen oder nicht) läuft das Spiel als freies Spiel weiter.

import { TRAILER_BY_TYPE, TRUCK_BY_ID } from './data/catalog.ts';
import { addLog, annuity, formatMoney } from './finance.ts';
import { makeApplicant, plate, usedValue } from './generate.ts';
import { freshHos } from './hos.ts';
import { newId } from './rng.ts';
import { MIN_PER_DAY, formatDate, toDate } from './time.ts';
import type { GameState, ScenarioId } from './types.ts';

export interface ScenarioCheck {
  label: string;
  value: string;
  target: string;
  share: number;
  met: boolean;
}

export interface ScenarioDef {
  id: ScenarioId;
  name: string;
  /** Ausgangslage */
  intro: string;
  /** Ziel in einem Satz */
  goal: string;
  months: number;
  setup?(state: GameState): void;
  checks?(state: GameState): ScenarioCheck[];
}

const MONTH = 30 * MIN_PER_DAY;
const pct = (v: number, of: number) => Math.max(0, Math.min(1, of ? v / of : 0));
const vehicles = (s: GameState) => Object.keys(s.vehicles).length;
const base = (s: GameState, k: string) => s.scenario?.base[k] ?? 0;

/** älteres Fahrzeug mit Auflieger und Fahrer für den Familienbetrieb */
function addOldRig(state: GameState, modelId: string, age: number, km: number, condition: number) {
  const hq = state.company.hqCityId;
  const model = TRUCK_BY_ID[modelId];
  const id = newId(state, 'veh');
  state.vehicles[id] = {
    id, modelId, plate: plate(state, hq), year: toDate(state.time).getUTCFullYear() - age, odometerKm: km, condition, fuelL: model.tankL * 0.6,
    cityId: hq, status: 'idle', ownership: 'owned', purchasePrice: usedValue(model.price, age, km, condition), bought: state.time,
    history: [{ t: state.time, text: 'Aus dem Familienbetrieb übernommen', cost: 0 }],
  };
  const trlId = newId(state, 'trl');
  state.trailers[trlId] = {
    id: trlId, type: 'curtain', plate: plate(state, hq), condition: condition + 5, cityId: hq, status: 'idle', ownership: 'owned',
    purchasePrice: Math.round(TRAILER_BY_TYPE.curtain.price * 0.4), bought: state.time,
  };
  const a = makeApplicant(state, hq);
  const drvId = newId(state, 'drv');
  state.drivers[drvId] = {
    id: drvId, name: a.name, age: Math.max(48, a.age), homeCityId: a.homeCityId, cityId: hq, experience: Math.max(60, a.experience), licenses: ['C', 'CE'],
    qualifications: a.qualifications, salary: Math.min(3_500_00, Math.max(3_100_00, a.salary)), reliability: Math.max(65, a.reliability), ecoDriving: a.ecoDriving,
    stressResistance: a.stressResistance, satisfaction: 62, hired: state.company.founded, status: 'idle', hos: freshHos(), kmDriven: 0, vacationLeft: 30, lastVacation: state.time, trait: a.trait,
  };
}

export const SCENARIOS: Record<ScenarioId, ScenarioDef> = {
  free: { id: 'free', name: 'Freies Spiel', intro: 'Ein LKW, ein Fahrer, ein kleines Büro – der Rest liegt bei dir.', goal: 'Kein festes Ziel.', months: 0 },
  restart: {
    id: 'restart',
    name: 'Neustart mit Altlasten',
    intro: 'Die alte Firma ist knapp an der Pleite vorbeigeschrammt. Übrig sind ein Kredit über 60.000 €, wenig Geld auf dem Konto und ein treuer Fahrer.',
    goal: 'In 24 Monaten schuldenfrei sein und 50.000 € auf dem Geschäftskonto haben.',
    months: 24,
    setup(state) {
      state.company.account.balance = 8_000_00;
      const principal = 60_000_00;
      const ratePa = 0.085;
      state.company.loans.push({ id: newId(state, 'loan'), principal, remaining: principal, ratePa, monthly: annuity(principal, ratePa, 60), months: 60, taken: state.time, label: 'Altkredit' });
      state.company.rating = 3;
      state.company.reputation = 25;
    },
    checks(state) {
      const debt = state.company.loans.reduce((s, l) => s + l.remaining, 0);
      const bal = state.company.account.balance;
      return [
        { label: 'Restschuld', value: formatMoney(debt), target: '0 €', share: 1 - pct(debt, 60_000_00), met: debt <= 0 },
        { label: 'Geschäftskonto', value: formatMoney(bal), target: formatMoney(50_000_00), share: pct(bal, 50_000_00), met: bal >= 50_000_00 },
      ];
    },
  },
  family: {
    id: 'family',
    name: 'Familienbetrieb übernehmen',
    intro: 'Du übernimmst den Betrieb deiner Tante: drei ältere Sattelzüge, drei erfahrene Fahrer und ein guter Name in der Region – aber kaum Rücklagen.',
    goal: 'In 18 Monaten auf 8 Fahrzeuge wachsen und dabei mindestens 90 % pünktlich liefern (ab 100 Lieferungen).',
    months: 18,
    setup(state) {
      state.company.account.balance = Math.min(state.company.account.balance, 15_000_00);
      state.company.reputation = 45;
      // Startzug gehört der Firma
      for (const v of Object.values(state.vehicles)) {
        v.ownership = 'owned';
        v.leaseRate = undefined;
      }
      for (const t of Object.values(state.trailers)) {
        t.ownership = 'owned';
        t.leaseRate = undefined;
      }
      addOldRig(state, 'trasko-m380', 9, 960_000, 58);
      addOldRig(state, 'nordwal-tx420', 7, 780_000, 63);
    },
    checks(state) {
      const t = state.company.totals;
      const n = t.deliveries - base(state, 'deliveries');
      const late = t.lateDeliveries - base(state, 'late');
      const onTime = n ? Math.round(((n - late) / n) * 100) : 0;
      return [
        { label: 'Fahrzeuge', value: String(vehicles(state)), target: '8', share: pct(vehicles(state), 8), met: vehicles(state) >= 8 },
        { label: 'Pünktlichkeit', value: n ? `${onTime} % bei ${n} Lieferungen` : 'noch keine Lieferung', target: '90 % ab 100 Lieferungen', share: n >= 100 ? pct(onTime, 90) : pct(n, 100) * 0.9, met: n >= 100 && onTime >= 90 },
      ];
    },
  },
  reefer: {
    id: 'reefer',
    name: 'Kühlspezialist',
    intro: 'Ein Lebensmittelgroßhändler sucht einen verlässlichen Partner für die Kühlkette. Du startest mit einem Kühlauflieger statt einer Plane.',
    goal: 'In 12 Monaten 120 Kühltransporte zustellen.',
    months: 12,
    setup(state) {
      for (const t of Object.values(state.trailers)) {
        t.type = 'reefer';
        t.purchasePrice = Math.round(TRAILER_BY_TYPE.reefer.price * 0.55);
        if (t.leaseRate) t.leaseRate = Math.round(TRAILER_BY_TYPE.reefer.leaseRate * 0.6);
      }
    },
    checks(state) {
      const n = (state.progress?.counts.reefer ?? 0) - base(state, 'reefer');
      return [{ label: 'Kühltransporte', value: String(n), target: '120', share: pct(n, 120), met: n >= 120 }];
    },
  },
  tycoon: {
    id: 'tycoon',
    name: 'Großes Ziel',
    intro: 'Klein anfangen, groß werden: dieselbe Ausgangslage wie im freien Spiel, aber mit Frist.',
    goal: 'In 36 Monaten Unternehmensstufe 5 erreichen.',
    months: 36,
    checks(state) {
      const l = state.company.level;
      return [{ label: 'Unternehmensstufe', value: String(l), target: '5', share: pct(l, 5), met: l >= 5 }];
    },
  },
};

export const SCENARIO_IDS = Object.keys(SCENARIOS) as ScenarioId[];

export function isScenarioId(v: unknown): v is ScenarioId {
  return typeof v === 'string' && v in SCENARIOS;
}

/** Beim Spielstart: Ausgangslage herstellen und Ziel festhalten. */
export function applyScenario(state: GameState, id: ScenarioId): void {
  const def = SCENARIOS[id];
  if (!def || id === 'free') return;
  def.setup?.(state);
  const t = state.company.totals;
  state.scenario = {
    id,
    started: state.time,
    deadline: state.time + def.months * MONTH,
    status: 'running',
    base: { deliveries: t.deliveries, late: t.lateDeliveries, reefer: state.progress?.counts.reefer ?? 0 },
  };
  addLog(state, { level: 'info', category: 'company', text: `Szenario „${def.name}“: ${def.goal} Frist bis ${formatDate(state.scenario.deadline)}.` });
}

export function scenarioChecks(state: GameState): ScenarioCheck[] {
  const s = state.scenario;
  return s ? (SCENARIOS[s.id]?.checks?.(state) ?? []) : [];
}

/** Täglich: Ziel erreicht oder Frist abgelaufen? */
export function dailyScenario(state: GameState): void {
  const s = state.scenario;
  if (!s || s.status !== 'running') return;
  const def = SCENARIOS[s.id];
  const checks = scenarioChecks(state);
  if (checks.length && checks.every((c) => c.met)) {
    s.status = 'won';
    s.finishedAt = state.time;
    state.company.reputation = Math.min(100, state.company.reputation + 5);
    addLog(state, { level: 'success', category: 'company', text: `Szenario „${def.name}“ geschafft! ${def.goal} Das Spiel läuft frei weiter.` });
  } else if (state.time >= s.deadline) {
    s.status = 'failed';
    s.finishedAt = state.time;
    addLog(state, { level: 'warning', category: 'company', text: `Die Frist für „${def.name}“ ist abgelaufen – Ziel knapp verfehlt. Du kannst frei weiterspielen.` });
  }
}
