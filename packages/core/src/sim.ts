// SimulationEngine: deterministischer Minuten-Tick. Stündliche, tägliche und monatliche Prozesse
// werden an Zeitgrenzen ausgelöst. Wird identisch im Einzelspieler-Worker und auf dem Server ausgeführt.

import { dailyLife, hourlyLife } from './life.ts';
import { dailyContainers, hourlyContainers } from './containers.ts';
import { dailyDecisions, hourlyDecisions } from './decisions.ts';
import { dailyTenders, hourlyTenders } from './tenders.ts';
import { dailyPremium, hourlyPremium } from './premium.ts';
import { dailyGoals } from './goals.ts';
import { dailyScenario } from './scenarios.ts';
import { dailyProgress } from './progress.ts';
import { hourlyTeam } from './team.ts';
import { hourlyPartners } from './partners.ts';
import { hourlyHandovers } from './handover.ts';
import { dailyNews } from './news.ts';
import { dailyMarketing } from './branding.ts';
import type { SimContext } from './context.ts';
import { addLog, book, formatMoney, processInvoices, processMonthEnd } from './finance.ts';
import { makeApplicant, makeVehicleOffer } from './generate.ts';
import { hosRest } from './hos.ts';
import { updateOrderMarket } from './orders.ts';
import { rand } from './rng.ts';
import { dayIndex, dayOfMonth, holidayName, minuteOfDay, month } from './time.ts';
import { pruneTrips, tickTrip } from './trips.ts';
import { pruneRecords } from './analytics.ts';
import { companyDisruptions, expireDisruptions } from './disruptions.ts';
import { dailyContracts, hourlyContracts } from './contracts.ts';
import { dailyStorage, hourlyStorage } from './storage.ts';
import { dailyPersonnel, hourlyPersonnel } from './personnel.ts';
import { dailyCompany, hourlyCompany, monthlyCompany } from './company.ts';
import { runAutoDispatch } from './autodispatch.ts';
import { updateWeather } from './world.ts';
import { dailyEconomy } from './economy.ts';
import { dailyCompetitorCosts, dailyCustomerChurn, hourlyCompetition, monthlyCompetition } from './competition.ts';
import { dailyEvents, hourlyEvents } from './events.ts';
import type { Disruption, GameState } from './types.ts';
import { MAIN_COMPANY, companyViews, isCompanyView, tagClaimedOrders, worldOf, type WorldState } from './shard.ts';

// ---------------------------------------------------------------- Welt und Firmen
//
// Eine Welt kann mehrere Firmen haben (Wettbewerbs-Multiplayer). Jeder Schritt läuft entweder einmal für die Welt
// oder für jede Firma, in fester Reihenfolge der Firmen. Die Reihenfolge der Schritte ist die bisherige: Eine Welt
// mit einer Firma simuliert damit exakt wie zuvor.
//
// „Welt (gemischt)“: Diese Schritte arbeiten auf Weltdaten, lesen aber noch Werte einer Firma (Preise, Kunden,
// Gebote). Sie laufen mit der ersten aktiven Firma, bis Börse und Wettbewerb getrennt sind (Schritte D3 und D5).

type Scope = 'world' | 'company';
interface Step {
  scope: Scope;
  run: (state: GameState, ctx: SimContext, tick: TickScratch) => void;
}
/** Zwischenwerte eines Ticks (von Welt- an Firmenschritte) */
interface TickScratch {
  lifted: Disruption[];
}

const MINUTE: Step[] = [
  { scope: 'company', run: (state, ctx) => {
    for (const trip of Object.values(state.trips)) if (trip.phase !== 'done') tickTrip(state, ctx, trip);
    for (const d of Object.values(state.drivers)) if (d.status !== 'on_trip') hosRest(d.hos, 1);
    for (const v of Object.values(state.vehicles)) {
      if (v.status === 'workshop' && v.busyUntil !== undefined && state.time >= v.busyUntil) {
        v.status = 'idle';
        v.busyUntil = undefined;
        addLog(state, { level: 'success', category: 'fleet', text: `LKW ${v.plate} ist aus der Werkstatt zurück (Zustand ${Math.round(v.condition)} %).`, ref: { kind: 'vehicle', id: v.id } });
      }
    }
  } },
];

const HOURLY: Step[] = [
  { scope: 'world', run: (s, ctx) => updateWeather(s, ctx) },
  { scope: 'world', run: (s) => hourlyCompetition(s) }, // KI übernimmt liegengebliebene Börsenangebote
  { scope: 'world', run: (s, ctx) => updateOrderMarket(s, ctx) }, // gemischt: Preise mit Treue/Vertrieb der Firma
  { scope: 'company', run: (s) => processInvoices(s) },
  { scope: 'world', run: (s, _ctx, t) => { t.lifted = expireDisruptions(s); } },
  { scope: 'company', run: (s, ctx, t) => companyDisruptions(s, ctx, t.lifted) },
  { scope: 'company', run: (s, ctx) => hourlyEvents(s, ctx) },
  { scope: 'company', run: (s, ctx) => hourlyDecisions(s, ctx) },
  { scope: 'world', run: (s, ctx) => hourlyTenders(s, ctx) }, // gemischt: Gebote der Firma
  { scope: 'company', run: (s) => hourlyPremium(s) },
  { scope: 'company', run: (s, ctx) => hourlyLife(s, ctx) },
  { scope: 'company', run: (s) => hourlyPersonnel(s) },
  { scope: 'company', run: (s) => hourlyContracts(s) },
  { scope: 'company', run: (s, ctx) => hourlyStorage(s, ctx) },
  { scope: 'company', run: (s, ctx) => hourlyContainers(s, ctx) },
  { scope: 'company', run: (s) => hourlyCompany(s) },
  { scope: 'company', run: (s) => hourlyTeam(s) },
  { scope: 'company', run: (s) => hourlyPartners(s) },
  { scope: 'company', run: (s) => hourlyHandovers(s) },
  { scope: 'company', run: (s, ctx) => runAutoDispatch(s, ctx) },
];

const DAILY: Step[] = [
  // Tagesstatistik abschließen
  { scope: 'company', run: (state) => {
    state.stats.push({ day: dayIndex(state.time) - 1, balance: state.company.account.balance, revenue: state.today.revenue, costs: state.today.costs });
    if (state.stats.length > 400) state.stats.shift();
    state.today = { revenue: 0, costs: 0 };
  } },
  // Dieselpreis: Random Walk mit Rückkehr zum Mittelwert
  { scope: 'world', run: (state) => {
    const m = state.market;
    const mean = 155;
    m.diesel = Math.round(Math.max(110, Math.min(240, m.diesel + (mean - m.diesel) * 0.03 + rand.normal(state, 0, 1.6))) * 10) / 10;
    m.dieselHistory.push({ t: state.time, v: m.diesel });
    if (m.dieselHistory.length > 180) m.dieselHistory.shift();
  } },
  // Nachfrage: Saison × Konjunktur, regionale Nachfrage, Konkurrenz und Ereignisse
  { scope: 'world', run: (s) => dailyEconomy(s) },
  { scope: 'world', run: (s) => dailyCompetitorCosts(s) },
  { scope: 'company', run: (s) => dailyCustomerChurn(s) }, // je Firma: Kunden wechseln zur KI und zurück
  { scope: 'company', run: (s, ctx) => dailyEvents(s, ctx) },
  { scope: 'company', run: (s, ctx) => dailyDecisions(s, ctx) },
  // Bewerber (je Firma) und Gebrauchtfahrzeuge (Welt, am Sitz der ersten Firma)
  { scope: 'company', run: (state) => {
    for (const a of Object.values(state.applicants)) if (state.time >= a.expires) delete state.applicants[a.id];
    while (Object.keys(state.applicants).length < 6) {
      const a = makeApplicant(state, rand.pick(state, state.company.locations).cityId);
      state.applicants[a.id] = a;
    }
  } },
  { scope: 'world', run: (state) => {
    for (const o of Object.values(state.vehicleOffers)) if (state.time >= o.expires) delete state.vehicleOffers[o.id];
    while (Object.keys(state.vehicleOffers).length < 8) {
      const o = makeVehicleOffer(state, state.company.hqCityId);
      state.vehicleOffers[o.id] = o;
    }
  } },
  // Personal (Zufriedenheit, Krankheit, Kündigungen) und Rahmenverträge
  { scope: 'company', run: (s) => dailyPersonnel(s) },
  { scope: 'company', run: (s, ctx) => dailyContracts(s, ctx) },
  { scope: 'company', run: (s, ctx) => dailyStorage(s, ctx) },
  { scope: 'company', run: (s) => dailyContainers(s) },
  { scope: 'world', run: (s, ctx) => dailyTenders(s, ctx) }, // gemischt: Zuschlag an die Firma
  { scope: 'world', run: (s, ctx) => dailyPremium(s, ctx) },
  // Unternehmensstufe, Lagerauslastung, Lebenssimulation, Kurzzeitmiete
  { scope: 'company', run: (state) => {
    dailyCompany(state);
    dailyLife(state);
    for (const v of Object.values(state.vehicles)) if (v.ownership === 'rented' && v.rentPerDay) book(state, 'company', -v.rentPerDay, 'leasing', `Miete LKW ${v.plate}`);
    const holiday = holidayName(state.time);
    if (holiday) addLog(state, { level: 'info', category: 'market', text: `Feiertag: ${holiday} – deutlich weniger Transportaufträge.` });
  } },
  // Monatsende
  { scope: 'company', run: (state) => {
    if (dayOfMonth(state.time) !== 1) return;
    processMonthEnd(state);
    monthlyCompany(state);
  } },
  { scope: 'world', run: (state) => {
    if (dayOfMonth(state.time) === 1) monthlyCompetition(state);
  } },
  { scope: 'company', run: (state) => {
    if (state.company.account.balance < -25_000_00) {
      addLog(state, { level: 'danger', category: 'finance', text: `Liquidität kritisch: Kontostand ${formatMoney(state.company.account.balance)}. Ausgaben reduzieren oder Forderungen eintreiben!` });
    }
    // Quartalsziele, Szenario, Erfolge (nach Monatsabrechnung und Tagesstatistik)
    dailyGoals(state);
    dailyScenario(state);
    dailyProgress(state);
  } },
  { scope: 'company', run: (s) => dailyNews(s) }, // jede Firma liest ihre eigene Ausgabe (mit ihrer Firmenwoche)
  { scope: 'company', run: (s) => {
    dailyMarketing(s);
    pruneTrips(s);
    pruneRecords(s);
  } },
];

/**
 * `tag`: nach jedem Firmenschritt Aufträge ohne Eigentümer der Firma zuordnen (Sicherheitsnetz für Annahmewege).
 * Im Minutentakt nicht nötig – dort laufen nur Fahrten bereits übernommener Aufträge – und zu teuer.
 */
function runSteps(steps: Step[], views: GameState[], ctx: SimContext, tick: TickScratch, tag = true) {
  const primary = views[0];
  const multi = tag && views.length > 1;
  for (const step of steps) {
    if (step.scope === 'world') step.run(primary, ctx, tick);
    else
      for (const v of views) {
        step.run(v, ctx, tick);
        if (multi) tagClaimedOrders(v);
      }
  }
}

/** Eine Spielminute für alle aktiven Firmen der Welt. Verkaufte Firmen ruhen; sind alle verkauft, steht die Zeit. */
function tickViews(views: GameState[], ctx: SimContext): void {
  const active = views.filter((v) => !v.exit);
  if (!active.length) return;
  active[0].time += 1;
  const tick: TickScratch = { lifted: [] };
  runSteps(MINUTE, active, ctx, tick, false);
  if (active[0].time % 60 === 0) runSteps(HOURLY, active, ctx, tick);
  if (minuteOfDay(active[0].time) === 0) runSteps(DAILY, active, ctx, tick);
}

/** Simuliert genau eine Spielminute – für die ganze Welt, zu der der Zustand gehört. */
export function tickMinute(state: GameState, ctx: SimContext): void {
  if (!isCompanyView(state)) return tickViews([state], ctx);
  const world = worldOf(state);
  tickViews(world.companyOrder.length === 1 && world.companies[MAIN_COMPANY] ? [state] : companyViews(world), ctx);
}

export function tickMinutes(state: GameState, ctx: SimContext, minutes: number): void {
  for (let i = 0; i < minutes; i++) tickMinute(state, ctx);
}

/** Simuliert eine Spielminute für eine Welt mit beliebig vielen Firmen. */

export function tickWorld(world: WorldState, ctx: SimContext): void {
  tickViews(companyViews(world), ctx);
}
