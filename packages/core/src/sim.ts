// SimulationEngine: deterministischer Minuten-Tick. Stündliche, tägliche und monatliche Prozesse
// werden an Zeitgrenzen ausgelöst. Wird identisch im Einzelspieler-Worker und auf dem Server ausgeführt.

import { dailyLife } from './life.ts';
import { hourlyTeam } from './team.ts';
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
import type { GameState } from './types.ts';

/** Simuliert genau eine Spielminute. */
export function tickMinute(state: GameState, ctx: SimContext): void {
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
  updateOrderMarket(state, ctx);
  processInvoices(state);
  updateDisruptions(state, ctx);
  hourlyPersonnel(state);
  hourlyContracts(state);
  hourlyCompany(state);
  hourlyTeam(state);
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
  // Nachfrage: saisonal + Konjunkturrauschen
  const seasonal = [0.92, 0.94, 1.0, 1.02, 1.03, 1.02, 0.97, 0.95, 1.03, 1.06, 1.08, 1.0][month(state.time)];
  m.demand = Math.max(0.7, Math.min(1.3, m.demand + (seasonal - m.demand) * 0.1 + rand.normal(state, 0, 0.01)));

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
  }

  if (state.company.account.balance < -25_000_00) {
    addLog(state, { level: 'danger', category: 'finance', text: `Liquidität kritisch: Kontostand ${formatMoney(state.company.account.balance)}. Ausgaben reduzieren oder Forderungen eintreiben!` });
  }
  pruneTrips(state);
}
