// SimulationEngine: deterministischer Minuten-Tick. Stündliche, tägliche und monatliche Prozesse
// werden an Zeitgrenzen ausgelöst. Wird identisch im Einzelspieler-Worker und auf dem Server ausgeführt.

import { dailyLife, hourlyLife } from './life.ts';
import { dailyDecisions, hourlyDecisions } from './decisions.ts';
import { dailyTenders, hourlyTenders } from './tenders.ts';
import { dailyPremium, hourlyPremium } from './premium.ts';
import { dailyGoals } from './goals.ts';
import { dailyScenario } from './scenarios.ts';
import { dailyProgress } from './progress.ts';
import { hourlyTeam } from './team.ts';
import { hourlyPartners } from './partners.ts';
import { dailyNews } from './news.ts';
import type { SimContext } from './context.ts';
import { addLog, book, formatMoney, processInvoices, processMonthEnd } from './finance.ts';
import { makeApplicant, makeVehicleOffer } from './generate.ts';
import { hosRest } from './hos.ts';
import { updateOrderMarket } from './orders.ts';
import { rand } from './rng.ts';
import { dayIndex, dayOfMonth, holidayName, minuteOfDay, month } from './time.ts';
import { pruneTrips, tickTrip } from './trips.ts';
import { updateDisruptions } from './disruptions.ts';
import { dailyContracts, hourlyContracts } from './contracts.ts';
import { dailyPersonnel, hourlyPersonnel } from './personnel.ts';
import { dailyCompany, hourlyCompany, monthlyCompany } from './company.ts';
import { runAutoDispatch } from './autodispatch.ts';
import { updateWeather } from './world.ts';
import { dailyEconomy } from './economy.ts';
import { dailyCompetition, hourlyCompetition, monthlyCompetition } from './competition.ts';
import { dailyEvents, hourlyEvents } from './events.ts';
import type { GameState } from './types.ts';

/** Simuliert genau eine Spielminute. */
export function tickMinute(state: GameState, ctx: SimContext): void {
  // Firma verkauft: die Zeit steht still
  if (state.exit) return;
  state.time += 1;

  for (const trip of Object.values(state.trips)) if (trip.phase !== 'done') tickTrip(state, ctx, trip);

  for (const d of Object.values(state.drivers)) if (d.status !== 'on_trip') hosRest(d.hos, 1);

  for (const v of Object.values(state.vehicles)) {
    if (v.status === 'workshop' && v.busyUntil !== undefined && state.time >= v.busyUntil) {
      v.status = 'idle';
      v.busyUntil = undefined;
      addLog(state, { level: 'success', category: 'fleet', text: `LKW ${v.plate} ist aus der Werkstatt zurück (Zustand ${Math.round(v.condition)} %).`, ref: { kind: 'vehicle', id: v.id } });
    }
  }

  if (state.time % 60 === 0) hourly(state, ctx);
  if (minuteOfDay(state.time) === 0) daily(state, ctx);
}

export function tickMinutes(state: GameState, ctx: SimContext, minutes: number): void {
  for (let i = 0; i < minutes; i++) tickMinute(state, ctx);
}

function hourly(state: GameState, ctx: SimContext) {
  updateWeather(state, ctx);
  hourlyCompetition(state);
  updateOrderMarket(state, ctx);
  processInvoices(state);
  updateDisruptions(state, ctx);
  hourlyEvents(state, ctx);
  hourlyDecisions(state, ctx);
  hourlyTenders(state, ctx);
  hourlyPremium(state);
  hourlyLife(state, ctx);
  hourlyPersonnel(state);
  hourlyContracts(state);
  hourlyCompany(state);
  hourlyTeam(state);
  hourlyPartners(state);
  runAutoDispatch(state, ctx);
}

function daily(state: GameState, ctx: SimContext) {
  // Tagesstatistik abschließen
  state.stats.push({ day: dayIndex(state.time) - 1, balance: state.company.account.balance, revenue: state.today.revenue, costs: state.today.costs });
  if (state.stats.length > 400) state.stats.shift();
  state.today = { revenue: 0, costs: 0 };

  // Dieselpreis: Random Walk mit Rückkehr zum Mittelwert
  const m = state.market;
  const mean = 155;
  m.diesel = Math.round(Math.max(110, Math.min(240, m.diesel + (mean - m.diesel) * 0.03 + rand.normal(state, 0, 1.6))) * 10) / 10;
  m.dieselHistory.push({ t: state.time, v: m.diesel });
  if (m.dieselHistory.length > 180) m.dieselHistory.shift();
  // Nachfrage: Saison × Konjunktur, regionale Nachfrage, Konkurrenz und Ereignisse
  dailyEconomy(state);
  dailyCompetition(state);
  dailyEvents(state, ctx);
  dailyDecisions(state, ctx);

  const hq = state.company.hqCityId;
  // Bewerber und Gebrauchtfahrzeuge
  for (const a of Object.values(state.applicants)) if (state.time >= a.expires) delete state.applicants[a.id];
  while (Object.keys(state.applicants).length < 6) {
    const a = makeApplicant(state, rand.pick(state, state.company.locations).cityId);
    state.applicants[a.id] = a;
  }
  for (const o of Object.values(state.vehicleOffers)) if (state.time >= o.expires) delete state.vehicleOffers[o.id];
  while (Object.keys(state.vehicleOffers).length < 8) {
    const o = makeVehicleOffer(state, hq);
    state.vehicleOffers[o.id] = o;
  }

  // Personal (Zufriedenheit, Krankheit, Kündigungen) und Rahmenverträge
  dailyPersonnel(state);
  dailyContracts(state, ctx);
  dailyTenders(state, ctx);
  dailyPremium(state, ctx);
  // Unternehmensstufe, Lagerauslastung
  dailyCompany(state);
  // Lebenssimulation der Spielercharaktere
  dailyLife(state);
  // Kurzzeitmiete wird täglich abgerechnet
  for (const v of Object.values(state.vehicles)) if (v.ownership === 'rented' && v.rentPerDay) book(state, 'company', -v.rentPerDay, 'leasing', `Miete LKW ${v.plate}`);

  const holiday = holidayName(state.time);
  if (holiday) addLog(state, { level: 'info', category: 'market', text: `Feiertag: ${holiday} – deutlich weniger Transportaufträge.` });

  if (dayOfMonth(state.time) === 1) {
    processMonthEnd(state);
    monthlyCompany(state);
    monthlyCompetition(state);
  }

  if (state.company.account.balance < -25_000_00) {
    addLog(state, { level: 'danger', category: 'finance', text: `Liquidität kritisch: Kontostand ${formatMoney(state.company.account.balance)}. Ausgaben reduzieren oder Forderungen eintreiben!` });
  }
  // Quartalsziele, Szenario, Erfolge (nach Monatsabrechnung und Tagesstatistik)
  dailyGoals(state);
  dailyScenario(state);
  dailyProgress(state);
  dailyNews(state);
  pruneTrips(state);
}
