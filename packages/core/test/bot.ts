// Spieler-Bot für Langzeitläufe (Balancing-Messung und Abschlusstest „Gründung bis Stufe 4“):
// disponiert wie ein guter Disponent (KI-Disposition mit virtuellen Disponenten ohne Gehalt), pflegt Fahrzeuge
// und Fahrer und wächst vorsichtig – gebrauchter oder geleaster LKW + Fahrer + Auflieger, sobald genug Puffer da ist;
// Standort ausbauen, wenn die Stellplätze voll sind.

import {
  BRANCH_SETUP_COST, CITIES, CITY_BY_ID, COMPANY_LEVELS, LOCATION_DEFS, LOCATION_ORDER, MIN_PER_DAY, TRUCK_BY_ID, applyCommand, capacity, haversineKm, tickMinutes,
  type GameState, type StaffMember,
} from '../src/index.ts';
import { ctx } from './helpers.ts';

export interface BotOptions {
  /** Leasing erlauben (Standard ja) */
  lease?: boolean;
  /** Ausgabe der Wachstumsschritte */
  log?: (text: string) => void;
}

export function createBot(s: GameState, opts: BotOptions = {}) {
  const LEASE = opts.lease ?? true;
  const say = opts.log ?? (() => {});

  /** virtuelle Disponenten ohne Gehalt: ersetzen den Spieler, der selbst disponiert */
  function ensureDispatchers() {
    const need = Math.ceil(Object.keys(s.vehicles).length / 8);
    const bots = s.company.staff.filter((m) => m.id.startsWith('bot'));
    for (let i = bots.length; i < need; i++)
      s.company.staff.push({ id: `bot${i}`, name: `Bot ${i}`, dept: 'dispatch', salary: 0, hired: s.time, locationId: s.company.locations[0].id, skill: 80 } as StaffMember);
  }
  /** Pflege wie ein umsichtiger Spieler: Wartung unter 50 % Zustand, Urlaub alle drei Monate */
  function care() {
    for (const v of Object.values(s.vehicles))
      if (v.status === 'idle' && v.condition < 50) applyCommand(s, ctx, 'p1', { type: 'serviceVehicle', vehicleId: v.id });
    for (const d of Object.values(s.drivers))
      if (d.status === 'idle' && (d.vacationLeft ?? 0) >= 7 && s.time - (d.lastVacation ?? d.hired) > 90 * MIN_PER_DAY) applyCommand(s, ctx, 'p1', { type: 'sendVacation', driverId: d.id, days: 7 });
  }

  const BUFFER = 18_000_00;

  /** Büro mit Betriebshof in der größten noch freien Stadt im Land des Firmensitzes (nahe genug für Rückführungen) */
  function openBranch(): boolean {
    const hqCity = CITY_BY_ID[s.company.hqCityId];
    const used = new Set(s.company.locations.map((l) => l.cityId));
    const city = CITIES.filter((c) => c.country === hqCity.country && !used.has(c.id) && haversineKm([c.lon, c.lat], [hqCity.lon, hqCity.lat]) < 450).sort((a, b) => b.pop - a.pop)[0];
    if (!city) return false;
    const r = applyCommand(s, ctx, 'p1', { type: 'openBranch', cityId: city.id, kind: 'office_yard' });
    if (r.ok) say(`Niederlassung ${city.name} eröffnet`);
    return r.ok;
  }
  let lastLease = -Infinity;
  function grow() {
    const bal = s.company.account.balance;
    const cap = capacity(s);
    const hq = s.company.locations[0];
    // nächste Unternehmensstufe verlangt mehr Standorte: Niederlassung eröffnen, sobald Fahrzeuge und Geld reichen
    const nextLevel = COMPANY_LEVELS[s.company.level];
    if (nextLevel && s.company.locations.length < nextLevel.locations && cap.vehicles >= nextLevel.vehicles - 2 && bal > 60_000_00) {
      if (openBranch()) return;
    }
    if (cap.vehicles >= cap.parking || cap.trailers >= cap.trailerParking) {
      const next = LOCATION_ORDER[LOCATION_ORDER.indexOf(hq.kind) + 1];
      if (next && bal > LOCATION_DEFS[next].deposit + BUFFER * 1.5) {
        const r = applyCommand(s, ctx, 'p1', { type: 'upgradeLocation', locationId: hq.id, kind: next });
        if (r.ok) return say(`Standort → ${next}`);
      }
      // Firmensitz kann (noch) nicht wachsen, z. B. Großer Betriebshof erst ab Stufe 3 → weitere Niederlassung
      if (bal > LOCATION_DEFS.office_yard.deposit + BRANCH_SETUP_COST + BUFFER * 1.5) openBranch();
      return;
    }
    const idleDrivers = Object.values(s.drivers).filter((d) => d.status === 'idle').length;
    const offers = Object.values(s.vehicleOffers)
      .filter((o) => !TRUCK_BY_ID[o.modelId].body && o.condition >= 55)
      .sort((a, b) => a.price - b.price);
    const off = offers[0];
    const app = Object.values(s.applicants).sort((a, b) => a.salary - b.salary)[0];
    if (!app && idleDrivers === 0) return;
    if (off && bal >= off.price + BUFFER) {
      if (!applyCommand(s, ctx, 'p1', { type: 'buyUsedVehicle', offerId: off.id }).ok) return;
    } else if (LEASE && bal >= 10_000_00 && s.time - lastLease > 30 * MIN_PER_DAY) {
      // Leasing: kein Kapital nötig, aber 1.500 € Rate im Monat
      if (!applyCommand(s, ctx, 'p1', { type: 'buyNewVehicle', modelId: 'trasko-m380', financing: 'lease' }).ok) return;
      lastLease = s.time;
      say(`+1 LKW geleast`);
    } else return;
    if (app) applyCommand(s, ctx, 'p1', { type: 'hireDriver', applicantId: app.id });
    applyCommand(s, ctx, 'p1', { type: 'buyTrailer', trailerType: 'curtain', financing: 'lease' });
    say(`jetzt ${Object.keys(s.vehicles).length} LKW`);
  }

  ensureDispatchers();
  const ad = applyCommand(s, ctx, 'p1', { type: 'setAutoDispatch', mode: 'auto', rules: { safeDeadlines: true, chains: true } });
  if (!ad.ok) throw new Error(ad.error);
  s.paused = false;

  return {
    /** einen Spieltag simulieren (stündlich pflegen, täglich wachsen); `hourly` z. B. für Invariantenprüfungen */
    day(hourly?: () => void) {
      ensureDispatchers();
      for (let h = 0; h < 24; h++) {
        tickMinutes(s, ctx, 60);
        care();
        hourly?.();
      }
      grow();
    },
  };
}
