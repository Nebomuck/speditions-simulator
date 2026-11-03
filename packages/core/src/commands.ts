// Befehlsschnittstelle (CommandSystem): Jede Spieleraktion ist ein serialisierbarer Befehl.
// Befehle werden validiert, auf Berechtigungen geprüft und atomar auf den Zustand angewendet.
// Im Multiplayer führt ausschließlich der Server Befehle aus (serverautoritativ) – dadurch sind
// Doppelbelegungen und widersprüchliche Aktionen ausgeschlossen, da Befehle sequenziell verarbeitet werden.

import { applyLife, payDividend, type LifeAction } from './life.ts';
import { CITY_BY_ID } from './data/cities.ts';
import { LOCATION_DEFS, TRAILER_BY_TYPE, TRUCK_BY_ID } from './data/catalog.ts';
import type { SimContext } from './context.ts';
import { addCoLoad, createRelocation, createTrip, queueJob, removeCoLoad, unqueueJob, validateDispatch, type Issue } from './dispatch.ts';
import { acceptContract, cancelContract } from './contracts.ts';
import { VEHICLE_DOWN_PAYMENT, VEHICLE_LOAN_TERMS, addLog, annuity, book, factorInvoices, formatMoney, repayLoan, takeLoan, vehicleLoanRate, vehicleRentPerDay } from './finance.ts';
import { plate, tradeInValue, vehicleMarketValue } from './generate.ts';
import { sendDriver, sendOnVacation, setDriverSalary, startTraining, talkToDriver } from './personnel.ts';
import { buildFacility, closeBranch, fireStaff, hireStaff, openBranch, promoteDriver, serviceFleet, serviceVehicle, upgradeLocation } from './company.ts';
import { freshHos } from './hos.ts';
import { newId } from './rng.ts';
import { SPEEDS, toDate } from './time.ts';
import type {
  Department, DispatchMode, DispatchRules, FacilityKind, GameState, Id, InternalMessage, JointKind, LocationKind, Permission, Player, StaffGrade, TaskArea, TaskStatus, TeamRole, TrailerType,
  TrainingCourse, Vehicle,
} from './types.ts';
import { acceptSuggestion, dismissSuggestion, setAutoDispatch } from './autodispatch.ts';
import { winBackCustomer } from './competition.ts';
import {
  cancelJoint, castVote, closeVote, createTask, createVote, deleteTask, mayManageLocation, proposeJoint, readMessage, respondJoint, sendMessage, setPlayerLimits, setRole, updateTask,
} from './team.ts';

export type Command =
  | { type: 'setSpeed'; speed: number }
  | { type: 'setPaused'; paused: boolean }
  | { type: 'acceptOrder'; orderId: Id }
  | { type: 'cancelOrder'; orderId: Id }
  | { type: 'dispatch'; orderId: Id; driverId: Id; vehicleId: Id; trailerId: Id }
  | { type: 'queueDispatch'; orderId: Id; vehicleId: Id }
  | { type: 'unqueue'; orderId: Id; vehicleId: Id }
  | { type: 'coLoad'; orderId: Id; vehicleId: Id }
  | { type: 'removeCoLoad'; orderId: Id }
  | { type: 'relocate'; driverId: Id; vehicleId: Id; trailerId?: Id; toCityId: string }
  | { type: 'buyUsedVehicle'; offerId: Id }
  | { type: 'buyNewVehicle'; modelId: string; financing: 'cash' | 'lease' | 'loan' | 'rent'; loanMonths?: number; tradeInVehicleId?: Id; locationId?: Id }
  | { type: 'buyTrailer'; trailerType: TrailerType; financing: 'cash' | 'lease'; locationId?: Id }
  | { type: 'sellVehicle'; vehicleId: Id }
  | { type: 'sellTrailer'; trailerId: Id }
  | { type: 'serviceVehicle'; vehicleId: Id }
  | { type: 'serviceFleet'; below: number }
  | { type: 'hireDriver'; applicantId: Id }
  | { type: 'fireDriver'; driverId: Id }
  | { type: 'setCeoSalary'; playerId: Id; salary: number }
  | { type: 'upgradeLocation'; locationId: Id; kind: LocationKind }
  | { type: 'openBranch'; cityId: string; kind: LocationKind }
  | { type: 'closeBranch'; locationId: Id }
  | { type: 'buildFacility'; locationId: Id; facility: FacilityKind }
  | { type: 'hireStaff'; dept: Department; locationId: Id; grade?: StaffGrade }
  | { type: 'setAutoDispatch'; mode?: DispatchMode; rules?: Partial<DispatchRules> }
  | { type: 'acceptSuggestion'; suggestionId: Id }
  | { type: 'dismissSuggestion'; suggestionId: Id }
  | { type: 'fireStaff'; staffId: Id }
  | { type: 'promoteDriver'; driverId: Id; dept: Department }
  | { type: 'takeLoan'; amount: number; months: number }
  | { type: 'repayLoan'; loanId: Id }
  | { type: 'factorInvoices'; invoiceId?: Id }
  | { type: 'acceptContract'; contractId: Id }
  | { type: 'cancelContract'; contractId: Id }
  | { type: 'sendVacation'; driverId: Id; days: number }
  | { type: 'sendDriver'; driverId: Id; toCityId: string }
  | { type: 'trainDriver'; driverId: Id; course: TrainingCourse }
  | { type: 'setDriverSalary'; driverId: Id; salary: number }
  | { type: 'talkToDriver'; driverId: Id }
  | { type: 'life'; action: LifeAction }
  | { type: 'payDividend'; amount: number }
  | { type: 'chat'; text: string }
  | { type: 'setPermissions'; playerId: Id; permissions: Permission[] }
  | { type: 'setRole'; playerId: Id; role: TeamRole }
  | { type: 'setPlayerLimits'; playerId: Id; spendLimit: number | null; locationIds: Id[] }
  | { type: 'sendMessage'; to: Id[]; subject: string; text: string; ref?: InternalMessage['ref'] }
  | { type: 'readMessage'; messageId: Id }
  | { type: 'createTask'; title: string; note?: string; area?: TaskArea; assignee?: Id; due?: number }
  | { type: 'updateTask'; taskId: Id; status?: TaskStatus; assignee?: Id | null }
  | { type: 'deleteTask'; taskId: Id }
  | { type: 'proposeJoint'; kind: JointKind; playerIds: Id[] }
  | { type: 'respondJoint'; activityId: Id; accept: boolean }
  | { type: 'cancelJoint'; activityId: Id }
  | { type: 'createVote'; question: string; options: string[]; hours: number }
  | { type: 'castVote'; voteId: Id; option: number }
  | { type: 'closeVote'; voteId: Id }
  | { type: 'winBackCustomer'; customerId: Id };

export type CommandResult = { ok: true; warnings?: Issue[]; id?: Id } | { ok: false; error: string; issues?: Issue[] };

export const COMMAND_PERMISSION: Record<Command['type'], Permission | null> = {
  setSpeed: 'admin',
  setPaused: 'admin',
  acceptOrder: 'dispatch',
  cancelOrder: 'dispatch',
  dispatch: 'dispatch',
  queueDispatch: 'dispatch',
  unqueue: 'dispatch',
  coLoad: 'dispatch',
  removeCoLoad: 'dispatch',
  relocate: 'dispatch',
  sendDriver: 'dispatch',
  buyUsedVehicle: 'purchase',
  buyNewVehicle: 'purchase',
  buyTrailer: 'purchase',
  sellVehicle: 'sellVehicles',
  acceptContract: 'dispatch',
  cancelContract: 'dispatch',
  sendVacation: 'personnel',
  trainDriver: 'personnel',
  setDriverSalary: 'personnel',
  talkToDriver: 'personnel',
  sellTrailer: 'sellVehicles',
  serviceVehicle: 'fleet',
  serviceFleet: 'fleet',
  hireDriver: 'personnel',
  fireDriver: 'fireStaff',
  setCeoSalary: 'finance',
  upgradeLocation: 'expansion',
  openBranch: 'expansion',
  closeBranch: 'expansion',
  buildFacility: 'expansion',
  hireStaff: 'personnel',
  setAutoDispatch: 'dispatch',
  acceptSuggestion: 'dispatch',
  dismissSuggestion: 'dispatch',
  fireStaff: 'fireStaff',
  promoteDriver: 'personnel',
  takeLoan: 'loans',
  repayLoan: 'loans',
  factorInvoices: 'finance',
  chat: null,
  life: null,
  payDividend: 'finance',
  setPermissions: 'admin',
  setRole: 'admin',
  setPlayerLimits: 'admin',
  sendMessage: null,
  readMessage: null,
  createTask: null,
  updateTask: null,
  deleteTask: null,
  proposeJoint: null,
  respondJoint: null,
  cancelJoint: null,
  createVote: null,
  castVote: null,
  closeVote: null,
  winBackCustomer: 'dispatch',
};

/** Befehle, die Geld vom Firmenkonto ausgeben können (unterliegen dem Ausgabenlimit eines Spielers) */
const SPENDING: ReadonlySet<Command['type']> = new Set<Command['type']>([
  'buyUsedVehicle', 'buyNewVehicle', 'buyTrailer', 'winBackCustomer', 'upgradeLocation', 'openBranch', 'buildFacility', 'serviceVehicle', 'serviceFleet', 'payDividend', 'trainDriver', 'hireDriver', 'hireStaff',
]);

/** Standort, den ein Befehl verwaltet (für die Beschränkung auf zugewiesene Niederlassungen); null = neuer Standort */
function commandLocation(state: GameState, cmd: Command): Id | undefined | null {
  switch (cmd.type) {
    case 'buyNewVehicle':
    case 'buyTrailer':
      return cmd.locationId ?? state.company.locations.find((l) => l.cityId === state.company.hqCityId)?.id;
    case 'upgradeLocation':
    case 'closeBranch':
    case 'buildFacility':
    case 'hireStaff':
      return cmd.locationId;
    case 'openBranch':
      return null;
    default:
      return undefined;
  }
}

export const ALL_PERMISSIONS: Permission[] = ['dispatch', 'fleet', 'purchase', 'sellVehicles', 'personnel', 'fireStaff', 'finance', 'loans', 'expansion', 'admin'];

export const PERMISSION_LABEL: Record<Permission, string> = {
  dispatch: 'Disposition',
  fleet: 'Fuhrpark & Wartung',
  purchase: 'Fahrzeuge beschaffen',
  sellVehicles: 'Fahrzeuge verkaufen',
  personnel: 'Personal einstellen',
  fireStaff: 'Personal entlassen',
  finance: 'Finanzen & Gehälter',
  loans: 'Kredite aufnehmen',
  expansion: 'Standorte & Investitionen',
  admin: 'Spielleitung & Rechte',
};

const fail = (error: string, issues?: Issue[]): CommandResult => ({ ok: false, error, issues });

export function capacity(state: GameState) {
  let parking = 0;
  let trailerParking = 0;
  for (const l of state.company.locations) {
    parking += LOCATION_DEFS[l.kind].parking;
    trailerParking += LOCATION_DEFS[l.kind].trailerParking;
  }
  return { parking, trailerParking, vehicles: Object.keys(state.vehicles).length, trailers: Object.keys(state.trailers).length };
}

function canAfford(state: GameState, amount: number) {
  // Kontokorrentrahmen 10.000 €
  return state.company.account.balance - amount >= -10_000_00;
}

export function applyCommand(state: GameState, ctx: SimContext, actorId: Id, cmd: Command): CommandResult {
  const actor = state.players[actorId];
  if (!actor) return fail('Unbekannter Spieler.');
  const perm = COMMAND_PERMISSION[cmd.type];
  if (perm === undefined) return fail('Unbekannter Befehl.');
  if (perm && !actor.permissions.includes(perm)) return fail(`Keine Berechtigung: ${PERMISSION_LABEL[perm]}.`);
  const loc = commandLocation(state, cmd);
  if (loc === null && actor.locationIds?.length) return fail('Keine Berechtigung: Du verwaltest nur zugewiesene Niederlassungen.');
  if (loc && !mayManageLocation(actor, loc)) return fail('Keine Berechtigung: Dieser Standort ist dir nicht zugewiesen.');
  if (actor.spendLimit === undefined || !SPENDING.has(cmd.type)) return execute(state, ctx, actor, cmd);

  // Ausgabenlimit: Befehl ausführen und zurückrollen, wenn er mehr kostet als erlaubt
  const before = structuredClone(state);
  const balance = state.company.account.balance;
  const result = execute(state, ctx, actor, cmd);
  const spent = balance - state.company.account.balance;
  if (result.ok && spent > actor.spendLimit) {
    for (const k of Object.keys(state) as (keyof GameState)[]) delete state[k];
    Object.assign(state, before);
    return fail(`Ausgabenlimit überschritten: ${formatMoney(spent)} – du darfst höchstens ${formatMoney(actor.spendLimit)} je Ausgabe freigeben.`);
  }
  return result;
}

function execute(state: GameState, ctx: SimContext, actor: Player, cmd: Command): CommandResult {
  const actorId = actor.id;
  switch (cmd.type) {
    case 'setSpeed': {
      if (!SPEEDS.includes(cmd.speed as (typeof SPEEDS)[number])) return fail('Ungültige Geschwindigkeit.');
      state.speed = cmd.speed;
      return { ok: true };
    }
    case 'setPaused': {
      state.paused = !!cmd.paused;
      return { ok: true };
    }
    case 'acceptOrder': {
      const o = state.orders[cmd.orderId];
      if (!o || o.status !== 'offered') return fail('Auftrag ist nicht mehr verfügbar.');
      if (state.time >= o.offerExpires) return fail('Angebot ist abgelaufen.');
      o.status = 'accepted';
      addLog(state, { level: 'info', category: 'order', text: `Auftrag angenommen: ${CITY_BY_ID[o.fromCityId].name} → ${CITY_BY_ID[o.toCityId].name} (${formatMoney(o.payment)}).`, ref: { kind: 'order', id: o.id } });
      return { ok: true };
    }
    case 'cancelOrder': {
      const o = state.orders[cmd.orderId];
      // eingeplante Folgeaufträge vorher aus der Planung nehmen
      if (o?.status === 'planned' && !o.tripId) for (const v of Object.values(state.vehicles)) unqueueJob(state, v.id, o.id);
      // noch nicht abgeholte Beiladung vorher aus der Fahrt nehmen
      if (o?.status === 'planned' && o.tripId && state.trips[o.tripId]?.orderId !== o.id) removeCoLoad(state, ctx, o.id);
      if (!o || o.status !== 'accepted') return fail('Nur angenommene, noch nicht disponierte Aufträge können storniert werden.');
      const fee = Math.round(o.payment * 0.15);
      o.status = 'cancelled';
      book(state, 'company', -fee, 'penalty', 'Stornogebühr Auftrag');
      const c = state.customers[o.customerId];
      c.satisfaction = Math.max(0, c.satisfaction - 10);
      state.company.reputation = Math.max(0, state.company.reputation - 1);
      addLog(state, { level: 'warning', category: 'order', text: `Auftrag storniert – Stornogebühr ${formatMoney(fee)}, ${c.name} ist verärgert.`, ref: { kind: 'order', id: o.id } });
      return { ok: true };
    }
    case 'dispatch': {
      const { issues, estimate } = validateDispatch(state, ctx, cmd);
      const errors = issues.filter((i) => i.level === 'error');
      if (errors.length || !estimate) return fail(errors[0]?.text ?? 'Disposition nicht möglich.', issues);
      const order = state.orders[cmd.orderId];
      if (order.status === 'offered') order.status = 'accepted';
      const trip = createTrip(state, ctx, cmd, estimate);
      return { ok: true, id: trip.id, warnings: issues };
    }
    case 'queueDispatch': {
      const order = state.orders[cmd.orderId];
      const wasOffered = order?.status === 'offered';
      const r = queueJob(state, ctx, cmd.vehicleId, cmd.orderId);
      if (!r.ok) return fail(r.error, r.issues);
      if (wasOffered) addLog(state, { level: 'info', category: 'order', text: 'Angebot angenommen und direkt eingeplant.', ref: { kind: 'order', id: cmd.orderId } });
      return { ok: true, warnings: r.issues };
    }
    case 'coLoad': {
      const order = state.orders[cmd.orderId];
      const wasOffered = order?.status === 'offered';
      const r = addCoLoad(state, ctx, cmd.vehicleId, cmd.orderId);
      if (!r.ok) return fail(r.error);
      if (wasOffered) addLog(state, { level: 'info', category: 'order', text: 'Angebot angenommen und als Beiladung eingeplant.', ref: { kind: 'order', id: cmd.orderId } });
      return { ok: true };
    }
    case 'removeCoLoad': {
      const r = removeCoLoad(state, ctx, cmd.orderId);
      if (!r.ok) return fail(r.error);
      addLog(state, { level: 'info', category: 'trip', text: 'Beiladung aus der Fahrt genommen – der Auftrag liegt wieder bei den angenommenen Aufträgen.', ref: { kind: 'order', id: cmd.orderId } });
      return { ok: true };
    }
    case 'unqueue': {
      if (!unqueueJob(state, cmd.vehicleId, cmd.orderId)) return fail('Folgeauftrag nicht gefunden.');
      addLog(state, { level: 'info', category: 'trip', text: 'Folgeauftrag aus der Planung genommen – er liegt wieder bei den angenommenen Aufträgen.', ref: { kind: 'order', id: cmd.orderId } });
      return { ok: true };
    }
    case 'relocate': {
      const d = state.drivers[cmd.driverId];
      const v = state.vehicles[cmd.vehicleId];
      const t = cmd.trailerId ? state.trailers[cmd.trailerId] : undefined;
      if (!d || !v || (cmd.trailerId && !t)) return fail('Fahrer, LKW oder Auflieger nicht gefunden.');
      if (!CITY_BY_ID[cmd.toCityId] || !ctx.net.hasCity(cmd.toCityId)) return fail('Unbekanntes Ziel.');
      if (d.status !== 'idle' || v.status !== 'idle' || (t && t.status !== 'idle')) return fail('Fahrer, LKW oder Auflieger ist nicht verfügbar.');
      if (d.cityId !== v.cityId || (t && t.cityId !== v.cityId)) return fail('Fahrer, LKW und Auflieger müssen am selben Ort sein.');
      if (v.cityId === cmd.toCityId) return fail('Fahrzeug befindet sich bereits am Ziel.');
      if (!ctx.net.route(v.cityId, cmd.toCityId)) return fail('Keine Route gefunden.');
      const trip = createRelocation(state, ctx, d.id, v.id, t?.id, cmd.toCityId);
      return { ok: true, id: trip.id };
    }
    case 'buyUsedVehicle': {
      const off = state.vehicleOffers[cmd.offerId];
      if (!off) return fail('Angebot nicht mehr verfügbar.');
      const cap = capacity(state);
      if (cap.vehicles >= cap.parking) return fail(`Keine freien Stellplätze (${cap.parking}). Erweitere deinen Standort.`);
      if (!canAfford(state, off.price)) return fail('Nicht genügend Geld (Kontokorrentrahmen 10.000 € ausgeschöpft).');
      const id = newId(state, 'veh');
      const m = TRUCK_BY_ID[off.modelId];
      state.vehicles[id] = {
        id, modelId: off.modelId, plate: plate(state, state.company.hqCityId), year: off.year, odometerKm: off.odometerKm,
        condition: off.condition, fuelL: m.tankL * 0.5, cityId: off.cityId, status: 'idle', ownership: 'owned',
        purchasePrice: off.price, bought: state.time, history: [{ t: state.time, text: 'Gebraucht gekauft', cost: off.price }],
      };
      delete state.vehicleOffers[off.id];
      book(state, 'company', -off.price, 'vehicle_purchase', `Kauf ${m.maker} ${m.name} (gebraucht)`);
      addLog(state, { level: 'success', category: 'fleet', text: `Gebrauchter ${m.maker} ${m.name} für ${formatMoney(off.price)} gekauft.`, ref: { kind: 'vehicle', id } });
      return { ok: true, id };
    }
    case 'buyNewVehicle': {
      const m = TRUCK_BY_ID[cmd.modelId];
      if (!m) return fail('Unbekanntes Modell.');
      const fin = cmd.financing;
      if (!['cash', 'lease', 'loan', 'rent'].includes(fin)) return fail('Unbekannte Finanzierungsart.');
      const trade = cmd.tradeInVehicleId ? state.vehicles[cmd.tradeInVehicleId] : undefined;
      if (cmd.tradeInVehicleId) {
        if (!trade) return fail('Fahrzeug für die Inzahlungnahme nicht gefunden.');
        if (trade.status !== 'idle') return fail('Das in Zahlung gegebene Fahrzeug ist im Einsatz.');
        if (trade.ownership !== 'owned') return fail('Nur eigene Fahrzeuge können in Zahlung gegeben werden.');
      }
      const home = cmd.locationId ? state.company.locations.find((l) => l.id === cmd.locationId) : undefined;
      if (cmd.locationId && !home) return fail('Standort nicht gefunden.');
      const homeCity = home?.cityId ?? state.company.hqCityId;
      const cap = capacity(state);
      if (cap.vehicles - (trade ? 1 : 0) >= cap.parking) return fail(`Keine freien Stellplätze (${cap.parking}). Erweitere deinen Standort.`);
      const months = cmd.loanMonths ?? 48;
      if (fin === 'loan' && !VEHICLE_LOAN_TERMS.includes(months as (typeof VEHICLE_LOAN_TERMS)[number])) return fail('Ungültige Laufzeit der Finanzierung.');
      const rentPerDay = vehicleRentPerDay(m.leaseRate);
      // Sofort fällig: Kaufpreis, erste Leasingrate, Anzahlung oder erster Miettag
      const upfront = fin === 'cash' ? m.price : fin === 'lease' ? m.leaseRate : fin === 'loan' ? Math.round(m.price * VEHICLE_DOWN_PAYMENT) : rentPerDay;
      const credit = trade ? tradeInValue(state, trade.id) - openVehicleLoan(state, trade) : 0;
      if (!canAfford(state, upfront - credit)) return fail('Nicht genügend Geld.');
      const tradeValue = trade ? tradeInValue(state, trade.id) : 0;
      if (trade) {
        settleVehicleLoan(state, trade);
        book(state, 'company', tradeValue, 'vehicle_sale', `Inzahlungnahme ${TRUCK_BY_ID[trade.modelId].name} ${trade.plate}`);
        delete state.vehicles[trade.id];
      }
      const id = newId(state, 'veh');
      const vehicle: Vehicle = {
        id, modelId: m.id, plate: plate(state, homeCity), year: toDate(state.time).getUTCFullYear(), odometerKm: 0,
        condition: 100, fuelL: m.tankL, cityId: homeCity, status: 'idle',
        ownership: fin === 'lease' ? 'leased' : fin === 'rent' ? 'rented' : 'owned',
        ...(fin === 'lease' ? { leaseRate: m.leaseRate } : {}),
        ...(fin === 'rent' ? { rentPerDay } : {}),
        purchasePrice: m.price, bought: state.time,
        history: [{ t: state.time, text: { cash: 'Neu gekauft', lease: 'Neu geleast', loan: 'Neu gekauft (finanziert)', rent: 'Gemietet' }[fin], cost: upfront }],
      };
      state.vehicles[id] = vehicle;
      const name = `${m.maker} ${m.name}`;
      let how = fin === 'cash' ? 'gekauft' : fin === 'lease' ? 'geleast' : `gemietet (${formatMoney(rentPerDay)}/Tag)`;
      if (fin === 'loan') {
        const principal = m.price - upfront;
        const ratePa = vehicleLoanRate(months);
        const loan = { id: newId(state, 'loan'), principal, remaining: principal, ratePa, monthly: annuity(principal, ratePa, months), months, taken: state.time, vehicleId: id, label: `Fahrzeugfinanzierung ${vehicle.plate}` };
        state.company.loans.push(loan);
        vehicle.loanId = loan.id;
        book(state, 'company', -m.price, 'vehicle_purchase', `Kauf ${name} (finanziert)`);
        book(state, 'company', principal, 'loan', `Fahrzeugfinanzierung ${months} Monate, ${(ratePa * 100).toFixed(1).replace('.', ',')} %`);
        how = `finanziert gekauft (Rate ${formatMoney(loan.monthly)}/Monat)`;
      } else book(state, 'company', -upfront, fin === 'cash' ? 'vehicle_purchase' : 'leasing', `${{ cash: 'Kauf', lease: 'Leasing-Sonderzahlung', rent: 'Miete (1. Tag)' }[fin]} ${name}`);
      addLog(state, {
        level: 'success',
        category: 'fleet',
        text: `Neuer ${name} ${how}${trade ? ` – ${trade.plate} für ${formatMoney(tradeValue)} in Zahlung gegeben` : ''}.`,
        ref: { kind: 'vehicle', id },
      });
      return { ok: true, id };
    }
    case 'buyTrailer': {
      const def = TRAILER_BY_TYPE[cmd.trailerType];
      if (!def) return fail('Unbekannter Auflieger.');
      const home = cmd.locationId ? state.company.locations.find((l) => l.id === cmd.locationId) : undefined;
      if (cmd.locationId && !home) return fail('Standort nicht gefunden.');
      const homeCity = home?.cityId ?? state.company.hqCityId;
      const cap = capacity(state);
      if (cap.trailers >= cap.trailerParking) return fail(`Keine freien Aufliegerstellplätze (${cap.trailerParking}).`);
      const upfront = cmd.financing === 'cash' ? def.price : def.leaseRate;
      if (!canAfford(state, upfront)) return fail('Nicht genügend Geld.');
      const id = newId(state, 'trl');
      state.trailers[id] = {
        id, type: def.type, plate: plate(state, homeCity), condition: 100, cityId: homeCity, status: 'idle',
        ownership: cmd.financing === 'cash' ? 'owned' : 'leased', leaseRate: cmd.financing === 'lease' ? def.leaseRate : undefined,
        purchasePrice: def.price, bought: state.time,
      };
      book(state, 'company', -upfront, cmd.financing === 'cash' ? 'vehicle_purchase' : 'leasing', `${def.name} ${cmd.financing === 'cash' ? 'gekauft' : 'geleast'}`);
      addLog(state, { level: 'success', category: 'fleet', text: `${def.name} ${cmd.financing === 'cash' ? 'gekauft' : 'geleast'}.` });
      return { ok: true, id };
    }
    case 'sellVehicle': {
      const v = state.vehicles[cmd.vehicleId];
      if (!v) return fail('Fahrzeug nicht gefunden.');
      if (v.status !== 'idle') return fail('Fahrzeug ist im Einsatz.');
      if (Object.keys(state.vehicles).length <= 1 && Object.values(state.trips).some((t) => t.phase !== 'done')) return fail('Letztes Fahrzeug ist noch verplant.');
      const m = TRUCK_BY_ID[v.modelId];
      if (v.ownership === 'rented') {
        addLog(state, { level: 'info', category: 'fleet', text: `Mietfahrzeug ${v.plate} zurückgegeben.` });
      } else if (v.ownership === 'leased') {
        const fee = (v.leaseRate ?? 0) * 3;
        book(state, 'company', -fee, 'leasing', `Vorzeitige Leasingrückgabe ${v.plate}`);
        addLog(state, { level: 'info', category: 'fleet', text: `Leasingfahrzeug ${v.plate} vorzeitig zurückgegeben (Ablöse ${formatMoney(fee)}).` });
      } else {
        const value = Math.round(vehicleMarketValue(state, v.id) * 0.9);
        book(state, 'company', value, 'vehicle_sale', `Verkauf ${m.maker} ${m.name} ${v.plate}`);
        settleVehicleLoan(state, v);
        addLog(state, { level: 'success', category: 'fleet', text: `${m.maker} ${m.name} (${v.plate}) für ${formatMoney(value)} verkauft.` });
      }
      delete state.vehicles[v.id];
      return { ok: true };
    }
    case 'sellTrailer': {
      const t = state.trailers[cmd.trailerId];
      if (!t) return fail('Auflieger nicht gefunden.');
      if (t.status !== 'idle') return fail('Auflieger ist im Einsatz.');
      if (t.ownership === 'leased') book(state, 'company', -(t.leaseRate ?? 0) * 3, 'leasing', `Vorzeitige Leasingrückgabe ${t.plate}`);
      else book(state, 'company', Math.round(t.purchasePrice * 0.55 * (t.condition / 100)), 'vehicle_sale', `Verkauf Auflieger ${t.plate}`);
      delete state.trailers[t.id];
      return { ok: true };
    }
    case 'serviceVehicle': {
      const v = state.vehicles[cmd.vehicleId];
      if (!v) return fail('Fahrzeug nicht gefunden.');
      const r = serviceVehicle(state, v);
      return r.ok ? { ok: true } : fail(r.error);
    }
    case 'serviceFleet': {
      const r = serviceFleet(state, Number(cmd.below));
      return r.ok ? { ok: true } : fail(r.error);
    }
    case 'hireDriver': {
      const a = state.applicants[cmd.applicantId];
      if (!a) return fail('Bewerbung nicht mehr verfügbar.');
      const fee = 350_00; // Einstellungskosten (Anzeige, Einarbeitung, Fahrerkarte)
      if (!canAfford(state, fee)) return fail('Nicht genügend Geld.');
      const id = newId(state, 'drv');
      state.drivers[id] = {
        id, name: a.name, age: a.age, homeCityId: a.homeCityId, cityId: state.company.locations.some((l) => l.cityId === a.cityId) ? a.cityId : state.company.hqCityId, experience: a.experience,
        licenses: a.licenses, qualifications: a.qualifications, salary: a.salary, reliability: a.reliability,
        ecoDriving: a.ecoDriving, stressResistance: a.stressResistance, satisfaction: 65, hired: state.time,
        status: 'idle', hos: freshHos(), kmDriven: 0, vacationLeft: 30, lastVacation: state.time,
      };
      delete state.applicants[a.id];
      book(state, 'company', -fee, 'hiring', `Einstellung ${a.name}`);
      addLog(state, { level: 'success', category: 'personnel', text: `${a.name} als Fahrer eingestellt (${formatMoney(a.salary)}/Monat).`, ref: { kind: 'driver', id } });
      return { ok: true, id };
    }
    case 'fireDriver': {
      const d = state.drivers[cmd.driverId];
      if (!d) return fail('Fahrer nicht gefunden.');
      if (d.status === 'on_trip') return fail('Fahrer ist unterwegs.');
      const severance = d.salary;
      book(state, 'company', -severance, 'wages', `Abfindung ${d.name}`);
      delete state.drivers[d.id];
      for (const o of Object.values(state.drivers)) o.satisfaction = Math.max(0, o.satisfaction - 3);
      addLog(state, { level: 'warning', category: 'personnel', text: `${d.name} wurde entlassen (Abfindung ${formatMoney(severance)}).` });
      return { ok: true };
    }
    case 'setCeoSalary': {
      const p = state.players[cmd.playerId];
      if (!p) return fail('Spieler nicht gefunden.');
      if (cmd.salary < 0 || cmd.salary > 50_000_00) return fail('Gehalt außerhalb des zulässigen Rahmens (0–50.000 €).');
      p.character.salary = Math.round(cmd.salary / 100) * 100;
      addLog(state, { level: 'info', category: 'finance', text: `Geschäftsführergehalt von ${p.character.name} auf ${formatMoney(p.character.salary)}/Monat festgelegt.` });
      return { ok: true };
    }
    case 'takeLoan': {
      const r = takeLoan(state, Number(cmd.amount), Number(cmd.months), (id) => vehicleMarketValue(state, id));
      return r.ok ? { ok: true, id: r.loan.id } : fail(r.error);
    }
    case 'repayLoan': {
      const r = repayLoan(state, cmd.loanId);
      return r.ok ? { ok: true } : fail(r.error);
    }
    case 'factorInvoices': {
      const r = factorInvoices(state, cmd.invoiceId);
      return r.ok ? { ok: true } : fail(r.error);
    }
    case 'upgradeLocation': {
      const r = upgradeLocation(state, cmd.locationId, cmd.kind);
      return r.ok ? { ok: true } : fail(r.error);
    }
    case 'openBranch': {
      const r = openBranch(state, ctx, cmd.cityId, cmd.kind);
      return r.ok ? { ok: true, id: r.id } : fail(r.error);
    }
    case 'closeBranch': {
      const r = closeBranch(state, cmd.locationId);
      return r.ok ? { ok: true } : fail(r.error);
    }
    case 'buildFacility': {
      const r = buildFacility(state, cmd.locationId, cmd.facility);
      return r.ok ? { ok: true } : fail(r.error);
    }
    case 'hireStaff': {
      const r = hireStaff(state, cmd.dept, cmd.locationId, cmd.grade);
      return r.ok ? { ok: true, id: r.id } : fail(r.error);
    }
    case 'setAutoDispatch': {
      const r = setAutoDispatch(state, cmd.mode, cmd.rules);
      return r.ok ? { ok: true } : fail(r.error);
    }
    case 'acceptSuggestion': {
      const r = acceptSuggestion(state, ctx, cmd.suggestionId);
      return r.ok ? { ok: true } : fail(r.error);
    }
    case 'dismissSuggestion': {
      const r = dismissSuggestion(state, cmd.suggestionId);
      return r.ok ? { ok: true } : fail(r.error);
    }
    case 'fireStaff': {
      const r = fireStaff(state, cmd.staffId);
      return r.ok ? { ok: true } : fail(r.error);
    }
    case 'promoteDriver': {
      const r = promoteDriver(state, cmd.driverId, cmd.dept);
      return r.ok ? { ok: true, id: r.id } : fail(r.error);
    }
    case 'life': {
      // wirkt immer nur auf den eigenen Charakter
      const r = applyLife(state, ctx, actorId, cmd.action);
      return r.ok ? { ok: true } : fail(r.error);
    }
    case 'payDividend': {
      const r = payDividend(state, actorId, Number(cmd.amount));
      return r.ok ? { ok: true } : fail(r.error);
    }
    case 'acceptContract': {
      const r = acceptContract(state, ctx, cmd.contractId);
      return r.ok ? { ok: true } : fail(r.error);
    }
    case 'cancelContract': {
      const r = cancelContract(state, cmd.contractId);
      return r.ok ? { ok: true } : fail(r.error);
    }
    case 'sendDriver': {
      const r = sendDriver(state, ctx, cmd.driverId, String(cmd.toCityId));
      return r.ok ? { ok: true } : fail(r.error);
    }
    case 'sendVacation': {
      const r = sendOnVacation(state, cmd.driverId, Number(cmd.days));
      return r.ok ? { ok: true } : fail(r.error);
    }
    case 'trainDriver': {
      const r = startTraining(state, cmd.driverId, cmd.course);
      return r.ok ? { ok: true } : fail(r.error);
    }
    case 'setDriverSalary': {
      const r = setDriverSalary(state, cmd.driverId, Number(cmd.salary));
      return r.ok ? { ok: true } : fail(r.error);
    }
    case 'talkToDriver': {
      const r = talkToDriver(state, cmd.driverId);
      return r.ok ? { ok: true } : fail(r.error);
    }
    case 'chat': {
      const text = String(cmd.text ?? '').trim().slice(0, 500);
      if (!text) return fail('Leere Nachricht.');
      state.chat.push({ id: state.nextId++, t: state.time, playerId: actorId, text });
      if (state.chat.length > 300) state.chat.shift();
      return { ok: true };
    }
    case 'setPermissions': {
      const p = state.players[cmd.playerId];
      if (!p) return fail('Spieler nicht gefunden.');
      if (p.isFounder) return fail('Rechte des Firmengründers können nicht geändert werden.');
      p.permissions = cmd.permissions.filter((x) => ALL_PERMISSIONS.includes(x));
      p.role = 'custom';
      addLog(state, { level: 'info', category: 'multiplayer', text: `Rechte von ${p.name} geändert.` });
      return { ok: true };
    }
    case 'setRole':
      return setRole(state, cmd.playerId, cmd.role);
    case 'setPlayerLimits':
      return setPlayerLimits(state, cmd.playerId, cmd.spendLimit, cmd.locationIds ?? []);
    case 'sendMessage':
      return sendMessage(state, actorId, cmd.to ?? [], cmd.subject, cmd.text, cmd.ref);
    case 'readMessage':
      return readMessage(state, actorId, cmd.messageId);
    case 'createTask':
      return createTask(state, actorId, cmd);
    case 'updateTask':
      return updateTask(state, actorId, cmd.taskId, { status: cmd.status, assignee: cmd.assignee });
    case 'deleteTask':
      return deleteTask(state, actorId, cmd.taskId);
    case 'proposeJoint':
      return proposeJoint(state, actorId, cmd.kind, cmd.playerIds ?? []);
    case 'respondJoint':
      return respondJoint(state, actorId, cmd.activityId, !!cmd.accept);
    case 'cancelJoint':
      return cancelJoint(state, actorId, cmd.activityId);
    case 'createVote':
      return createVote(state, actorId, cmd.question, cmd.options, cmd.hours);
    case 'castVote':
      return castVote(state, actorId, cmd.voteId, cmd.option);
    case 'closeVote':
      return closeVote(state, actorId, cmd.voteId);
    case 'winBackCustomer': {
      const r = winBackCustomer(state, cmd.customerId);
      return r.ok ? { ok: true } : r;
    }
  }
}

/** Restschuld einer Fahrzeugfinanzierung. */
export function openVehicleLoan(state: GameState, v: Vehicle): number {
  return v.loanId ? (state.company.loans.find((l) => l.id === v.loanId)?.remaining ?? 0) : 0;
}

/** Beim Verkauf oder bei Inzahlungnahme: Restschuld der Finanzierung aus dem Erlös ablösen. */
function settleVehicleLoan(state: GameState, v: Vehicle) {
  const loan = v.loanId ? state.company.loans.find((l) => l.id === v.loanId) : undefined;
  if (!loan) return;
  book(state, 'company', -loan.remaining, 'loan', `Ablöse ${loan.label ?? 'Fahrzeugfinanzierung'}`);
  state.company.loans = state.company.loans.filter((l) => l !== loan);
  v.loanId = undefined;
}
