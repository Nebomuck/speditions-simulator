// Spielzeit & Kalender. GameTime = Minuten seit EPOCH (Montag, 4. Januar 2027, 00:00).

import type { GameTime } from './types.ts';

export const EPOCH_MS = Date.UTC(2027, 0, 4);
export const MIN_PER_HOUR = 60;
export const MIN_PER_DAY = 1440;

/** Verfügbare Simulationsgeschwindigkeiten: Spielminuten pro Echtzeitsekunde. */
export const SPEEDS = [1, 2, 5, 10, 30, 60] as const;

export function toDate(t: GameTime): Date {
  return new Date(EPOCH_MS + Math.floor(t) * 60_000);
}

export function fromDate(d: Date): GameTime {
  return Math.round((d.getTime() - EPOCH_MS) / 60_000);
}

export const dayIndex = (t: GameTime) => Math.floor(t / MIN_PER_DAY);
export const minuteOfDay = (t: GameTime) => ((Math.floor(t) % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY;
export const hourOfDay = (t: GameTime) => Math.floor(minuteOfDay(t) / 60);
/** 0 = Montag … 6 = Sonntag */
export const weekday = (t: GameTime) => ((dayIndex(t) % 7) + 7) % 7;
export const month = (t: GameTime) => toDate(t).getUTCMonth();
export const dayOfMonth = (t: GameTime) => toDate(t).getUTCDate();

export type Season = 'winter' | 'spring' | 'summer' | 'autumn';
export function season(t: GameTime): Season {
  const m = month(t);
  if (m === 11 || m <= 1) return 'winter';
  if (m <= 4) return 'spring';
  if (m <= 7) return 'summer';
  return 'autumn';
}

export const SEASON_NAMES: Record<Season, string> = { winter: 'Winter', spring: 'Frühling', summer: 'Sommer', autumn: 'Herbst' };
export const WEEKDAY_NAMES = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
export const WEEKDAY_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
export const MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

function easterSunday(year: number): Date {
  // Anonymer Gregorianischer Algorithmus
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mon = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, mon - 1, day));
}

/** Europaweit weitgehend einheitliche Feiertage (Spielvereinfachung). */
export function holidayName(t: GameTime): string | null {
  const d = toDate(t);
  const y = d.getUTCFullYear();
  const md = `${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
  const fixed: Record<string, string> = {
    '1-1': 'Neujahr',
    '5-1': 'Tag der Arbeit',
    '12-24': 'Heiligabend',
    '12-25': '1. Weihnachtstag',
    '12-26': '2. Weihnachtstag',
    '12-31': 'Silvester',
  };
  if (fixed[md]) return fixed[md];
  const easter = easterSunday(y).getTime();
  const diffDays = Math.round((Date.UTC(y, d.getUTCMonth(), d.getUTCDate()) - easter) / 86_400_000);
  if (diffDays === -2) return 'Karfreitag';
  if (diffDays === 1) return 'Ostermontag';
  if (diffDays === 39) return 'Christi Himmelfahrt';
  if (diffDays === 50) return 'Pfingstmontag';
  return null;
}

export const pad2 = (n: number) => String(n).padStart(2, '0');

export function formatTime(t: GameTime): string {
  return `${pad2(hourOfDay(t))}:${pad2(minuteOfDay(t) % 60)}`;
}

export function formatDate(t: GameTime): string {
  const d = toDate(t);
  return `${pad2(d.getUTCDate())}.${pad2(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
}

export function formatDateTime(t: GameTime): string {
  return `${WEEKDAY_SHORT[weekday(t)]} ${formatDate(t)} ${formatTime(t)}`;
}

export function formatDuration(min: number): string {
  min = Math.max(0, Math.round(min));
  const d = Math.floor(min / MIN_PER_DAY);
  const h = Math.floor((min % MIN_PER_DAY) / 60);
  const m = min % 60;
  if (d > 0) return `${d} T ${h} h`;
  if (h > 0) return `${h} h ${pad2(m)} min`;
  return `${m} min`;
}

/** Dauer immer in Stunden, ohne Umrechnung in Tage (z. B. Wochenlenkzeit „42 h 18 min“). */
export function formatHours(min: number): string {
  min = Math.max(0, Math.round(min));
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h} h ${pad2(m)} min` : `${m} min`;
}
