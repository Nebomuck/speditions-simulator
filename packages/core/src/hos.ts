// DriverSystem / Lenk- und Ruhezeiten – vereinfachtes Modell der VO (EG) Nr. 561/2006.
//
// Abgebildet:
//  - nach 4,5 h Lenkzeit 45 min Fahrtunterbrechung
//  - max. 9 h Tageslenkzeit, danach 11 h Tagesruhe
//  - max. 56 h Wochenlenkzeit bzw. nach 6 Tageslenkzeiten 45 h Wochenruhe
// Vereinfachungen (dokumentiert in GAME_DESIGN.md): keine Splittung (15+30), keine 10-h-Tage,
// keine verkürzten Ruhezeiten, Doppelwoche 90 h nicht separat geprüft, Wartezeit zählt als Ruhe.

import type { HoursOfService } from './types.ts';

export const HOS_RULES = {
  BREAK_AFTER: 270,
  BREAK: 45,
  DAILY_DRIVE: 540,
  DAILY_REST: 660,
  WEEKLY_DRIVE: 3360,
  WEEKLY_REST: 2700,
  DAYS_BEFORE_WEEKLY: 6,
} as const;

export function freshHos(): HoursOfService {
  return {
    drivenSinceBreak: 0,
    drivenToday: 0,
    drivenWeek: 0,
    restStreak: HOS_RULES.WEEKLY_REST,
    daysSinceWeeklyRest: 0,
    requiredRest: 0,
    requiredRestKind: 'none',
  };
}

/** Wie viele Minuten darf der Fahrer ab jetzt maximal am Stück fahren? 0 = muss ruhen. */
export function drivableNow(h: HoursOfService): number {
  if (h.requiredRest > 0) return 0;
  return Math.max(
    0,
    Math.min(
      HOS_RULES.BREAK_AFTER - h.drivenSinceBreak,
      HOS_RULES.DAILY_DRIVE - h.drivenToday,
      HOS_RULES.WEEKLY_DRIVE - h.drivenWeek,
    ),
  );
}

/** Fahrzeit verbuchen. Darf nur mit min <= drivableNow(h) aufgerufen werden. */
export function hosDrive(h: HoursOfService, min: number): void {
  h.drivenSinceBreak += min;
  h.drivenToday += min;
  h.drivenWeek += min;
  h.restStreak = 0;
  checkLimits(h);
}

function checkLimits(h: HoursOfService) {
  if (h.requiredRest > 0) return;
  if (h.drivenWeek >= HOS_RULES.WEEKLY_DRIVE || (h.drivenToday >= HOS_RULES.DAILY_DRIVE && h.daysSinceWeeklyRest + 1 >= HOS_RULES.DAYS_BEFORE_WEEKLY)) {
    h.requiredRest = HOS_RULES.WEEKLY_REST;
    h.requiredRestKind = 'weekly';
  } else if (h.drivenToday >= HOS_RULES.DAILY_DRIVE) {
    h.requiredRest = HOS_RULES.DAILY_REST;
    h.requiredRestKind = 'daily';
  } else if (h.drivenSinceBreak >= HOS_RULES.BREAK_AFTER) {
    h.requiredRest = HOS_RULES.BREAK;
    h.requiredRestKind = 'break';
  }
}

/** Ruhe verbuchen (Pause, Ruhezeit, Wartezeit, Standzeit ohne Arbeit). */
export function hosRest(h: HoursOfService, min: number): void {
  const before = h.restStreak;
  h.restStreak += min;
  if (h.requiredRest > 0) {
    h.requiredRest = Math.max(0, h.requiredRest - min);
    if (h.requiredRest === 0) h.requiredRestKind = 'none';
  }
  if (h.restStreak >= HOS_RULES.BREAK) h.drivenSinceBreak = 0;
  if (before < HOS_RULES.DAILY_REST && h.restStreak >= HOS_RULES.DAILY_REST) {
    if (h.drivenToday > 0) h.daysSinceWeeklyRest += 1;
    h.drivenToday = 0;
  }
  if (h.restStreak >= HOS_RULES.WEEKLY_REST) {
    h.drivenWeek = 0;
    h.daysSinceWeeklyRest = 0;
    h.drivenToday = 0;
  }
}

/** Arbeitszeit ohne Lenken (Be-/Entladen, Tanken): unterbricht die Ruhe, zählt nicht als Lenkzeit. */
export function hosWork(h: HoursOfService, _min: number): void {
  h.restStreak = 0;
}

/**
 * Schätzt die vergangene Zeit, um `driveMin` Minuten zu fahren, unter Einhaltung der Lenk- und Ruhezeiten.
 * Verändert `h` (vorher kopieren!). Liefert die Gesamtdauer inklusive Pausen/Ruhezeiten.
 */
export function simulateDriving(h: HoursOfService, driveMin: number): { elapsed: number; restMin: number } {
  let elapsed = 0;
  let restMin = 0;
  let left = driveMin;
  let guard = 0;
  while (left > 0.001 && guard++ < 1000) {
    if (h.requiredRest > 0) {
      const r = h.requiredRest;
      hosRest(h, r);
      elapsed += r;
      restMin += r;
      continue;
    }
    const chunk = Math.min(left, drivableNow(h));
    hosDrive(h, chunk);
    elapsed += chunk;
    left -= chunk;
  }
  return { elapsed, restMin };
}

export const REST_KIND_LABEL: Record<HoursOfService['requiredRestKind'], string> = {
  none: '–',
  break: 'Fahrtunterbrechung',
  daily: 'Tagesruhezeit',
  weekly: 'Wochenruhezeit',
};
