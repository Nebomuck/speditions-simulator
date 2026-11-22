// Spieler-Bot für Langzeitläufe (Balancing-Messung und Abschlusstest „Gründung bis Stufe 4“):
// disponiert wie ein guter Disponent (KI-Disposition mit virtuellen Disponenten ohne Gehalt), pflegt Fahrzeuge
// und Fahrer und wächst vorsichtig – gebrauchter oder geleaster LKW + Fahrer + Auflieger, sobald genug Puffer da ist;
// Standort ausbauen, wenn die Stellplätze voll sind.

import {
  BRANCH_SETUP_COST, CITIES, CITY_BY_ID, COMPANY_LEVELS, FACILITY_DEFS, LOCATION_DEFS, LOCATION_ORDER, MIN_PER_DAY, TRUCK_BY_ID, applyCommand, campaignLock, capacity,
  haversineKm, ownBid, setAutoDispatch, tickMinutes,
  type GameState, type StaffMember, type TrailerType,
} from '../src/index.ts';
import { ctx } from './helpers.ts';

export interface BotOptions {
  /** Leasing erlauben (Standard ja) */
  lease?: boolean;
  /** Ausgabe der Wachstumsschritte */
  log?: (text: string) => void;
  /**
   * Geschäftsfelder wie ein ehrgeiziger Spieler: Rahmenverträge und Ausschreibungen, Niederlassung im Ausland,
   * Lagerhalle mit Lagerverträgen, Containerchassis. Standard aus (die Langzeittests messen das Grundspiel).
   */
  business?: boolean;
  /** Kosten senken wie ein umsichtiger Spieler: Tankkarte, günstig tanken, Spritspartraining, Aerodynamikpaket (Standard aus) */
  savvy?: boolean;
  /** abweichende Dispositionsregeln (Messungen) */
  rules?: Partial<import('../src/index.ts').DispatchRules>;
}

export function createBot(s: GameState, opts: BotOptions = {}) {
  const LEASE = opts.lease ?? true;
  const BUSINESS = opts.business ?? false;
  const SAVVY = opts.savvy ?? false;
  const say = opts.log ?? (() => {});
  const ok = (cmd: Parameters<typeof applyCommand>[3]) => applyCommand(s, ctx, 'p1', cmd).ok;

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
    const countries = new Set(s.company.locations.map((l) => CITY_BY_ID[l.cityId].country));
    // Geschäftsmodus: ins Ausland, wenn die nächste Stufe (oder die Karriere) ein weiteres Land verlangt
    const next = COMPANY_LEVELS[s.company.level];
    const abroad = BUSINESS && !campaignLock(s, 'abroad') && (countries.size < (next?.countries ?? 1) || (s.campaign?.chapter === 3 && countries.size < 2));
    const city = CITIES.filter((c) => (abroad ? !countries.has(c.country) : c.country === hqCity.country) && !used.has(c.id) && haversineKm([c.lon, c.lat], [hqCity.lon, hqCity.lat]) < (abroad ? 650 : 450)).sort((a, b) => b.pop - a.pop)[0];
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
    const wantAbroad = BUSINESS && s.campaign?.chapter === 3 && !campaignLock(s, 'abroad') && new Set(s.company.locations.map((l) => CITY_BY_ID[l.cityId].country)).size < 2;
    if ((nextLevel && s.company.locations.length < nextLevel.locations && cap.vehicles >= nextLevel.vehicles - 2 && bal > LOCATION_DEFS.office_yard.deposit + BRANCH_SETUP_COST + BUFFER) || (wantAbroad && bal > 45_000_00)) {
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

  /** Kostenhebel (einmal täglich) */
  function savvy() {
    if (!SAVVY) return;
    if (s.company.fuelPolicy !== 'cheap') ok({ type: 'setFuelPolicy', policy: 'cheap' });
    if (s.company.fuelCard !== 'premium') ok({ type: 'setFuelCard', card: 'premium' });
    const bal = s.company.account.balance;
    const d = Object.values(s.drivers).find((x) => x.status === 'idle' && x.ecoDriving < 80);
    if (d && bal > 8_000_00) ok({ type: 'trainDriver', driverId: d.id, course: 'eco' });
    const v = Object.values(s.vehicles).find((x) => x.status === 'idle' && !x.equipment?.includes('aero'));
    if (v && bal > 20_000_00) ok({ type: 'installEquipment', vehicleId: v.id, item: 'aero' });
  }

  /** Aufliegerarten im eigenen Bestand */
  const ownTrailers = () => new Set<TrailerType>(Object.values(s.trailers).map((t) => t.type));

  /** Geschäftsfelder (einmal täglich) */
  function business() {
    if (!BUSINESS) return;
    const bal = s.company.account.balance;
    const vehicles = Object.keys(s.vehicles).length;
    const types = ownTrailers();
    // Rahmenverträge: passende Angebote annehmen, höchstens einer je zwei LKW
    const active = Object.values(s.contracts).filter((c) => c.status === 'active').length;
    // nur Verträge ab einem eigenen Standort (≤ 250 km), höchstens einer je drei LKW
    const anchors = s.company.locations.map((l) => CITY_BY_ID[l.cityId]);
    const near = (cityId: string) => anchors.some((a) => haversineKm([a.lon, a.lat], [CITY_BY_ID[cityId].lon, CITY_BY_ID[cityId].lat]) <= 250);
    const offer = Object.values(s.contracts).find((c) => c.status === 'offered' && c.offerExpires > s.time && types.has(c.trailerType) && c.qualifications.length === 0 && near(c.fromCityId) && c.distanceKm <= 700);
    if (offer && active < Math.max(1, Math.floor(vehicles / 3)) && ok({ type: 'acceptContract', contractId: offer.id })) say(`Rahmenvertrag angenommen (${CITY_BY_ID[offer.fromCityId].name} → ${CITY_BY_ID[offer.toCityId].name})`);
    // Ausschreibungen: knapp unter dem Referenzpreis bieten
    if (!campaignLock(s, 'tenders')) {
      const tender = Object.values(s.tenders).find((t) => t.status === 'open' && t.deadline > s.time && !ownBid(s, t) && types.has(t.trailerType) && t.qualifications.length === 0 && t.distanceKm <= 700);
      if (tender && active < Math.floor(vehicles / 3) && near(tender.fromCityId)) ok({ type: 'bidTender', tenderId: tender.id, price: Math.round((tender.referencePrice * 0.96) / 100) * 100 });
    }
    // Containerchassis ab 5 LKW
    if (vehicles >= 5 && !types.has('container') && !campaignLock(s, 'containers') && bal > 30_000_00 && ok({ type: 'buyTrailer', trailerType: 'container', financing: 'lease' })) say('Containerchassis geleast');
    // Lagerhalle: ab Stufe 3 an einem Standort mit Betriebshof, wenn reichlich Geld da ist
    const yard = s.company.locations.find((l) => LOCATION_ORDER.indexOf(l.kind) >= LOCATION_ORDER.indexOf('office_yard'));
    const hall = s.company.locations.find((l) => l.facilities?.includes('warehouse'));
    if (!hall && yard && (s.company.level ?? 1) >= FACILITY_DEFS.warehouse.minLevel && !campaignLock(s, 'warehouse') && bal > FACILITY_DEFS.warehouse.cost + 60_000_00) {
      if (ok({ type: 'buildFacility', locationId: yard.id, facility: 'warehouse' })) {
        ok({ type: 'setWarehouseStaff', locationId: yard.id, workers: 2, lead: false });
        say(`Lagerhalle in ${CITY_BY_ID[yard.cityId].name} gebaut`);
      }
    }
    if (hall) {
      const so = Object.values(s.storageContracts ?? {}).find((c) => c.status === 'offered' && c.offerExpires > s.time);
      if (so && ok({ type: 'acceptStorageContract', contractId: so.id })) say(`Lagervertrag angenommen (${so.pallets} Paletten)`);
    }
  }

  /** KI-Disposition einschalten; in der Karriere ist sie bis Kapitel 2 gesperrt – der Bot steht für einen Spieler, der selbst disponiert */
  function autoDispatch() {
    if (s.autoDispatch.mode === 'auto') return;
    const r = setAutoDispatch(s, 'auto', { safeDeadlines: true, chains: true, ...opts.rules });
    if (!r.ok) throw new Error(r.error);
  }

  ensureDispatchers();
  autoDispatch();
  s.paused = false;

  return {
    /** stündliche Pflege ohne Simulation (für Welten mit mehreren Bots, die gemeinsam ticken) */
    tend() {
      ensureDispatchers();
      care();
    },
    /** tägliches Wachstum ohne Simulation */
    grow,
    /** einen Spieltag simulieren (stündlich pflegen, täglich wachsen); `hourly` z. B. für Invariantenprüfungen */
    day(hourly?: () => void) {
      ensureDispatchers();
      for (let h = 0; h < 24; h++) {
        tickMinutes(s, ctx, 60);
        care();
        hourly?.();
      }
      grow();
      business();
      savvy();
    },
  };
}
