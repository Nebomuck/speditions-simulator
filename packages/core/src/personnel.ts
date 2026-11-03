// Personalmanagement: Urlaub, Krankheit, Schulungen, Gehalt, Personalgespräche, Zufriedenheit und Kündigungen.

import { CITY_BY_ID } from './data/cities.ts';
import { addLog, book, formatMoney } from './finance.ts';
import { wageLevel } from './generate.ts';
import { dispatchShortfall } from './company.ts';
import { rand } from './rng.ts';
import { MIN_PER_DAY, formatDate, toDate } from './time.ts';
import type { Driver, GameState, Id, Money, Qualification, TrainingCourse } from './types.ts';

export const VACATION_DAYS_PER_YEAR = 30;
export const TALK_COOLDOWN_DAYS = 14;
/** ab dieser Zufriedenheit droht eine Kündigung, wenn sie länger anhält */
export const RESIGN_THRESHOLD = 25;
const RESIGN_AFTER_DAYS = 7;
const NOTICE_DAYS = 14;
const WITHDRAW_AT = 45;

export interface CourseDef {
  id: TrainingCourse;
  name: string;
  days: number;
  cost: Money;
  qualification?: Qualification;
  minExperience?: number;
  text: string;
}

export const COURSES: Record<TrainingCourse, CourseDef> = {
  adr: { id: 'adr', name: 'ADR-Schein (Gefahrgut)', days: 4, cost: 890_00, qualification: 'ADR', text: 'Berechtigt zu Gefahrguttransporten.' },
  reefer: { id: 'reefer', name: 'Kühltransport-Schulung', days: 2, cost: 420_00, qualification: 'reefer', text: 'Temperaturgeführte Ware sicher transportieren.' },
  heavy: { id: 'heavy', name: 'Schwertransport-Lehrgang', days: 5, cost: 1_350_00, qualification: 'heavy', minExperience: 35, text: 'Für Schwer- und Sondertransporte; setzt Erfahrung voraus.' },
  eco: { id: 'eco', name: 'Spritspartraining', days: 1, cost: 380_00, text: 'Sparsamere Fahrweise (+15), senkt Verbrauch und Verschleiß.' },
};

/** Marktübliches Gehalt nach Erfahrung, Qualifikationen und Lohnniveau des Herkunftslandes (wie bei Bewerbern). */
export function marketSalary(d: Pick<Driver, 'experience' | 'qualifications' | 'homeCityId'>): Money {
  return Math.round(((2_850_00 + d.experience * 16_00 + d.qualifications.length * 140_00) * wageLevel(CITY_BY_ID[d.homeCityId]?.country ?? 'DE')) / 1000) * 1000;
}

/** Zielwert der Zufriedenheit und die Gründe dafür (für Personalgespräch und Anzeige). */
export function satisfactionFactors(state: GameState, d: Driver): { target: number; reasons: { text: string; delta: number }[] } {
  const reasons: { text: string; delta: number }[] = [];
  // ±6 % Abweichung vom Marktgehalt sind normal und wirken sich nicht aus
  const pay = d.salary / marketSalary(d) - 1;
  const payDelta = Math.round(Math.max(-30, Math.min(20, Math.sign(pay) * Math.max(0, Math.abs(pay) - 0.06) * 110)));
  if (Math.abs(payDelta) >= 3) reasons.push({ text: payDelta > 0 ? 'Gehalt über dem Marktniveau' : 'Gehalt unter dem Marktniveau', delta: payDelta });
  const sinceVacation = (state.time - (d.lastVacation ?? d.hired)) / MIN_PER_DAY;
  if (sinceVacation > 100) reasons.push({ text: `seit ${Math.round(sinceVacation)} Tagen kein Urlaub`, delta: -Math.min(20, Math.round((sinceVacation - 100) / 6)) });
  if (d.hos.drivenWeek > 45 * 60) reasons.push({ text: 'hohe Wochenlenkzeit', delta: -6 });
  if (state.company.reputation > 70) reasons.push({ text: 'Firma mit gutem Ruf', delta: 4 });
  const short = dispatchShortfall(state);
  if (short > 0) reasons.push({ text: 'überlastete Disposition', delta: -Math.min(12, 2 + short) });
  if (d.hired <= state.company.founded) reasons.push({ text: 'Fahrer der ersten Stunde', delta: 8 });
  else {
    const months = (state.time - d.hired) / (30 * MIN_PER_DAY);
    if (months >= 3) reasons.push({ text: 'lange im Betrieb', delta: Math.min(6, Math.floor(months / 3)) });
  }
  const target = Math.max(5, Math.min(95, 60 + reasons.reduce((s, r) => s + r.delta, 0)));
  return { target, reasons };
}

function available(d: Driver): string | null {
  if (d.status === 'on_trip') return `${d.name} ist unterwegs.`;
  if (d.status !== 'idle') return `${d.name} ist derzeit nicht verfügbar.`;
  return null;
}

export function sendOnVacation(state: GameState, driverId: Id, days: number): { ok: true } | { ok: false; error: string } {
  const d = state.drivers[driverId];
  if (!d) return { ok: false, error: 'Fahrer nicht gefunden.' };
  const busy = available(d);
  if (busy) return { ok: false, error: busy };
  days = Math.round(days);
  const left = d.vacationLeft ?? VACATION_DAYS_PER_YEAR;
  if (days < 1 || days > left) return { ok: false, error: `Urlaub: 1 bis ${left} Tage möglich (Resturlaub).` };
  d.status = 'vacation';
  d.absentUntil = state.time + days * MIN_PER_DAY;
  d.vacationLeft = left - days;
  d.lastVacation = d.absentUntil;
  d.satisfaction = Math.min(100, d.satisfaction + Math.min(15, days * 1.2));
  d.unhappyDays = 0;
  addLog(state, { level: 'info', category: 'personnel', text: `${d.name} ist bis ${formatDate(d.absentUntil)} im Urlaub (${days} Tage, Resturlaub ${d.vacationLeft}).`, ref: { kind: 'driver', id: d.id } });
  return { ok: true };
}

export function startTraining(state: GameState, driverId: Id, course: TrainingCourse): { ok: true } | { ok: false; error: string } {
  const d = state.drivers[driverId];
  const def = COURSES[course];
  if (!d || !def) return { ok: false, error: 'Fahrer oder Kurs nicht gefunden.' };
  const busy = available(d);
  if (busy) return { ok: false, error: busy };
  if (def.qualification && d.qualifications.includes(def.qualification)) return { ok: false, error: `${d.name} hat diese Qualifikation bereits.` };
  if (course === 'eco' && d.ecoDriving >= 95) return { ok: false, error: `${d.name} fährt bereits sehr sparsam.` };
  if (def.minExperience && d.experience < def.minExperience) return { ok: false, error: `Setzt mindestens ${def.minExperience} Erfahrungspunkte voraus.` };
  if (state.company.account.balance - def.cost < -10_000_00) return { ok: false, error: 'Nicht genügend Geld.' };
  book(state, 'company', -def.cost, 'other', `${def.name} – ${d.name}`);
  d.status = 'training';
  d.trainingCourse = course;
  d.absentUntil = state.time + def.days * MIN_PER_DAY;
  d.satisfaction = Math.min(100, d.satisfaction + 4);
  addLog(state, { level: 'info', category: 'personnel', text: `${d.name} besucht ${def.name} bis ${formatDate(d.absentUntil)} (${formatMoney(def.cost)}).`, ref: { kind: 'driver', id: d.id } });
  return { ok: true };
}

export function setDriverSalary(state: GameState, driverId: Id, salary: Money): { ok: true } | { ok: false; error: string } {
  const d = state.drivers[driverId];
  if (!d) return { ok: false, error: 'Fahrer nicht gefunden.' };
  const market = marketSalary(d);
  salary = Math.round(salary / 1000) * 1000;
  if (salary < market * 0.7 || salary > market * 1.6) return { ok: false, error: `Gehalt muss zwischen ${formatMoney(market * 0.7)} und ${formatMoney(market * 1.6)} liegen.` };
  const change = salary / d.salary - 1;
  if (Math.abs(change) < 0.001) return { ok: false, error: 'Gehalt unverändert.' };
  // Erhöhungen freuen sofort, Kürzungen treffen härter
  d.satisfaction = Math.max(0, Math.min(100, d.satisfaction + (change > 0 ? change * 120 : change * 200)));
  addLog(state, {
    level: change > 0 ? 'success' : 'warning',
    category: 'personnel',
    text: `Gehalt von ${d.name} ${change > 0 ? 'erhöht' : 'gekürzt'}: ${formatMoney(d.salary)} → ${formatMoney(salary)} pro Monat.`,
    ref: { kind: 'driver', id: d.id },
  });
  d.salary = salary;
  return { ok: true };
}

/** Personalgespräch: hebt die Zufriedenheit etwas und nennt, was den Fahrer beschäftigt. */
export function talkToDriver(state: GameState, driverId: Id): { ok: true; text: string } | { ok: false; error: string } {
  const d = state.drivers[driverId];
  if (!d) return { ok: false, error: 'Fahrer nicht gefunden.' };
  if (d.lastTalk !== undefined && state.time - d.lastTalk < TALK_COOLDOWN_DAYS * MIN_PER_DAY)
    return { ok: false, error: `Das letzte Gespräch mit ${d.name} ist noch keine ${TALK_COOLDOWN_DAYS} Tage her.` };
  d.lastTalk = state.time;
  d.satisfaction = Math.min(100, d.satisfaction + (d.satisfaction < 40 ? 10 : 5));
  const { reasons } = satisfactionFactors(state, d);
  const worries = reasons.filter((r) => r.delta < 0).map((r) => r.text);
  const likes = reasons.filter((r) => r.delta > 0).map((r) => r.text);
  const text = worries.length
    ? `Gespräch mit ${d.name}: Unzufrieden wegen ${worries.join(', ')}.${likes.length ? ` Positiv: ${likes.join(', ')}.` : ''}`
    : `Gespräch mit ${d.name}: fühlt sich wohl in der Firma${likes.length ? ` (${likes.join(', ')})` : ''}.`;
  addLog(state, { level: worries.length ? 'warning' : 'success', category: 'personnel', text, ref: { kind: 'driver', id: d.id } });
  return { ok: true, text };
}

/** Stündlich: Rückkehr aus Urlaub, Krankheit und Schulung; Austritte nach Kündigungsfrist. */
export function hourlyPersonnel(state: GameState): void {
  for (const d of Object.values(state.drivers)) {
    if (d.absentUntil !== undefined && state.time >= d.absentUntil && (d.status === 'vacation' || d.status === 'sick' || d.status === 'training')) {
      const was = d.status;
      d.status = 'idle';
      d.absentUntil = undefined;
      if (was === 'training' && d.trainingCourse) {
        const def = COURSES[d.trainingCourse];
        if (def.qualification && !d.qualifications.includes(def.qualification)) d.qualifications.push(def.qualification);
        if (d.trainingCourse === 'eco') d.ecoDriving = Math.min(100, d.ecoDriving + 15);
        addLog(state, { level: 'success', category: 'personnel', text: `${d.name} hat ${def.name} erfolgreich abgeschlossen.`, ref: { kind: 'driver', id: d.id } });
        d.trainingCourse = undefined;
      } else
        addLog(state, { level: 'info', category: 'personnel', text: `${d.name} ist ${was === 'sick' ? 'wieder gesund' : 'aus dem Urlaub zurück'} und verfügbar in ${CITY_BY_ID[d.cityId].name}.`, ref: { kind: 'driver', id: d.id } });
    }
    if (d.leavesAt !== undefined && state.time >= d.leavesAt && d.status !== 'on_trip') {
      delete state.drivers[d.id];
      addLog(state, { level: 'danger', category: 'personnel', text: `${d.name} hat die Firma verlassen.` });
    }
  }
}

/** Täglich: Krankheit, Zufriedenheit, Kündigungen, Jahresurlaub. */
export function dailyPersonnel(state: GameState): void {
  const newYear = toDate(state.time).getUTCMonth() === 0 && toDate(state.time).getUTCDate() === 1;
  for (const d of Object.values(state.drivers)) {
    if (newYear) d.vacationLeft = VACATION_DAYS_PER_YEAR;

    // Krankheit: nur zwischen den Fahrten (unterwegs wird die Tour zu Ende gefahren)
    if (d.status === 'idle' && rand.chance(state, 0.004 * (1.3 - d.stressResistance / 100) * state.difficulty.eventFactor)) {
      const days = rand.int(state, 1, 6);
      d.status = 'sick';
      d.absentUntil = state.time + days * MIN_PER_DAY;
      addLog(state, { level: 'warning', category: 'personnel', text: `${d.name} ist krank gemeldet (voraussichtlich ${days} Tag${days > 1 ? 'e' : ''}). Lohnfortzahlung läuft weiter.`, ref: { kind: 'driver', id: d.id } });
    }

    // Zufriedenheit nähert sich dem Zielwert
    const { target } = satisfactionFactors(state, d);
    d.satisfaction += (target - d.satisfaction) * 0.04;

    // Kündigung bei anhaltender Unzufriedenheit
    if (d.satisfaction < RESIGN_THRESHOLD) d.unhappyDays = (d.unhappyDays ?? 0) + 1;
    else if (d.satisfaction >= RESIGN_THRESHOLD + 10) d.unhappyDays = 0;
    if (d.leavesAt === undefined && (d.unhappyDays ?? 0) >= RESIGN_AFTER_DAYS) {
      d.leavesAt = state.time + NOTICE_DAYS * MIN_PER_DAY;
      addLog(state, {
        level: 'danger',
        category: 'personnel',
        text: `${d.name} hat gekündigt und verlässt die Firma am ${formatDate(d.leavesAt)}. Ein Gespräch, mehr Gehalt oder Urlaub können die Kündigung noch abwenden.`,
        ref: { kind: 'driver', id: d.id },
      });
    } else if (d.leavesAt !== undefined && d.satisfaction >= WITHDRAW_AT) {
      d.leavesAt = undefined;
      d.unhappyDays = 0;
      addLog(state, { level: 'success', category: 'personnel', text: `${d.name} zieht die Kündigung zurück und bleibt.`, ref: { kind: 'driver', id: d.id } });
    }
  }
}
