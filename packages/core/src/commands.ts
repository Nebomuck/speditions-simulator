// Befehlsschnittstelle (CommandSystem): Jede Spieleraktion ist ein serialisierbarer Befehl.
// Befehle werden validiert, auf Berechtigungen geprüft und atomar auf den Zustand angewendet.
// Im Multiplayer führt ausschließlich der Server Befehle aus (serverautoritativ) – dadurch sind
// Doppelbelegungen und widersprüchliche Aktionen ausgeschlossen, da Befehle sequenziell verarbeitet werden.

import { CITY_BY_ID } from './data/cities.ts';
import { LOCATION_DEFS, TRAILER_BY_TYPE, TRUCK_BY_ID } from './data/catalog.ts';
import type { SimContext } from './context.ts';
import { createRelocation, createTrip, queueJob, unqueueJob, validateDispatch, type Issue } from './dispatch.ts';
import { addLog, book, factorInvoices, formatMoney, repayLoan, takeLoan } from './finance.ts';
import { plate, vehicleMarketValue } from './generate.ts';
import { freshHos } from './hos.ts';
import { newId } from './rng.ts';
import { SPEEDS, toDate } from './time.ts';
import type { GameState, Id, LocationKind, Permission, TrailerType } from './types.ts';

export type Command =
  | { type: 'setSpeed'; speed: number }
  | { type: 'setPaused'; paused: boolean }
  | { type: 'acceptOrder'; orderId: Id }
  | { type: 'cancelOrder'; orderId: Id }
  | { type: 'dispatch'; orderId: Id; driverId: Id; vehicleId: Id; trailerId: Id }
  | { type: 'queueDispatch'; orderId: Id; vehicleId: Id }
  | { type: 'unqueue'; orderId: Id; vehicleId: Id }
  | { type: 'relocate'; driverId: Id; vehicleId: Id; trailerId?: Id; toCityId: string }
  | { type: 'buyUsedVehicle'; offerId: Id }
  | { type: 'buyNewVehicle'; modelId: string; financing: 'cash' | 'lease' }
  | { type: 'buyTrailer'; trailerType: TrailerType; financing: 'cash' | 'lease' }
  | { type: 'sellVehicle'; vehicleId: Id }
  | { type: 'sellTrailer'; trailerId: Id }
  | { type: 'serviceVehicle'; vehicleId: Id }
  | { type: 'hireDriver'; applicantId: Id }
  | { type: 'fireDriver'; driverId: Id }
  | { type: 'setCeoSalary'; playerId: Id; salary: number }
  | { type: 'upgradeLocation'; locationId: Id; kind: LocationKind }
  | { type: 'takeLoan'; amount: number; months: number }
  | { type: 'repayLoan'; loanId: Id }
  | { type: 'factorInvoices'; invoiceId?: Id }
  | { type: 'chat'; text: string }
  | { type: 'setPermissions'; playerId: Id; permissions: Permission[] };

export type CommandResult = { ok: true; warnings?: Issue[]; id?: Id } | { ok: false; error: string; issues?: Issue[] };

export const COMMAND_PERMISSION: Record<Command['type'], Permission | null> = {
  setSpeed: 'admin',
  setPaused: 'admin',
  acceptOrder: 'dispatch',
  cancelOrder: 'dispatch',
  dispatch: 'dispatch',
  queueDispatch: 'dispatch',
  unqueue: 'dispatch',
  relocate: 'dispatch',
  buyUsedVehicle: 'purchase',
  buyNewVehicle: 'purchase',
  buyTrailer: 'purchase',
  sellVehicle: 'sellVehicles',
  sellTrailer: 'sellVehicles',
  serviceVehicle: 'fleet',
  hireDriver: 'personnel',
  fireDriver: 'fireStaff',
  setCeoSalary: 'finance',
  upgradeLocation: 'expansion',
  takeLoan: 'loans',
  repayLoan: 'loans',
  factorInvoices: 'finance',
  chat: null,
  setPermissions: 'admin',
};

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
      const cap = capacity(state);
      if (cap.vehicles >= cap.parking) return fail(`Keine freien Stellplätze (${cap.parking}). Erweitere deinen Standort.`);
      const upfront = cmd.financing === 'cash' ? m.price : m.leaseRate; // Leasing: erste Rate als Sonderzahlung
      if (!canAfford(state, upfront)) return fail('Nicht genügend Geld.');
      const id = newId(state, 'veh');
      state.vehicles[id] = {
        id, modelId: m.id, plate: plate(state, state.company.hqCityId), year: toDate(state.time).getUTCFullYear(), odometerKm: 0,
        condition: 100, fuelL: m.tankL, cityId: state.company.hqCityId, status: 'idle',
        ownership: cmd.financing === 'cash' ? 'owned' : 'leased', leaseRate: cmd.financing === 'lease' ? m.leaseRate : undefined,
        purchasePrice: m.price, bought: state.time, history: [{ t: state.time, text: cmd.financing === 'cash' ? 'Neu gekauft' : 'Neu geleast', cost: upfront }],
      };
      book(state, 'company', -upfront, cmd.financing === 'cash' ? 'vehicle_purchase' : 'leasing', `${cmd.financing === 'cash' ? 'Kauf' : 'Leasing-Sonderzahlung'} ${m.maker} ${m.name}`);
      addLog(state, { level: 'success', category: 'fleet', text: `Neuer ${m.maker} ${m.name} ${cmd.financing === 'cash' ? 'gekauft' : 'geleast'}.`, ref: { kind: 'vehicle', id } });
      return { ok: true, id };
    }
    case 'buyTrailer': {
      const def = TRAILER_BY_TYPE[cmd.trailerType];
      if (!def) return fail('Unbekannter Auflieger.');
      const cap = capacity(state);
      if (cap.trailers >= cap.trailerParking) return fail(`Keine freien Aufliegerstellplätze (${cap.trailerParking}).`);
      const upfront = cmd.financing === 'cash' ? def.price : def.leaseRate;
      if (!canAfford(state, upfront)) return fail('Nicht genügend Geld.');
      const id = newId(state, 'trl');
      state.trailers[id] = {
        id, type: def.type, plate: plate(state, state.company.hqCityId), condition: 100, cityId: state.company.hqCityId, status: 'idle',
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
      if (v.ownership === 'leased') {
        const fee = (v.leaseRate ?? 0) * 3;
        book(state, 'company', -fee, 'leasing', `Vorzeitige Leasingrückgabe ${v.plate}`);
        addLog(state, { level: 'info', category: 'fleet', text: `Leasingfahrzeug ${v.plate} vorzeitig zurückgegeben (Ablöse ${formatMoney(fee)}).` });
      } else {
        const value = Math.round(vehicleMarketValue(state, v.id) * 0.9);
        book(state, 'company', value, 'vehicle_sale', `Verkauf ${m.maker} ${m.name} ${v.plate}`);
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
      if (v.status !== 'idle') return fail('Fahrzeug ist im Einsatz.');
      if (v.condition >= 98) return fail('Fahrzeug ist bereits in Topzustand.');
      const missing = 100 - v.condition;
      const cost = Math.round(180_00 + missing * 38_00);
      const hours = Math.ceil(2 + missing / 8);
      if (!canAfford(state, cost)) return fail('Nicht genügend Geld.');
      v.condition = 100;
      v.status = 'workshop';
      v.busyUntil = state.time + hours * 60;
      v.history.push({ t: state.time, text: `Wartung & Reparatur (${hours} h)`, cost });
      book(state, 'company', -cost, 'maintenance', `Werkstatt ${v.plate}`);
      for (const t of Object.values(state.trailers)) if (t.cityId === v.cityId && t.status === 'idle' && t.condition < 90) t.condition = 100;
      addLog(state, { level: 'info', category: 'fleet', text: `LKW ${v.plate} in der Werkstatt (${hours} h, ${formatMoney(cost)}).`, ref: { kind: 'vehicle', id: v.id } });
      return { ok: true };
    }
    case 'hireDriver': {
      const a = state.applicants[cmd.applicantId];
      if (!a) return fail('Bewerbung nicht mehr verfügbar.');
      const fee = 350_00; // Einstellungskosten (Anzeige, Einarbeitung, Fahrerkarte)
      if (!canAfford(state, fee)) return fail('Nicht genügend Geld.');
      const id = newId(state, 'drv');
      state.drivers[id] = {
        id, name: a.name, age: a.age, homeCityId: a.homeCityId, cityId: state.company.hqCityId, experience: a.experience,
        licenses: a.licenses, qualifications: a.qualifications, salary: a.salary, reliability: a.reliability,
        ecoDriving: a.ecoDriving, stressResistance: a.stressResistance, satisfaction: 65, hired: state.time,
        status: 'idle', hos: freshHos(), kmDriven: 0,
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
      const loc = state.company.locations.find((l) => l.id === cmd.locationId);
      const def = LOCATION_DEFS[cmd.kind];
      if (!loc || !def) return fail('Standort nicht gefunden.');
      const order: LocationKind[] = ['office_small', 'office_yard', 'depot'];
      if (order.indexOf(cmd.kind) <= order.indexOf(loc.kind)) return fail('Nur Erweiterungen auf eine größere Stufe möglich.');
      if (!canAfford(state, def.deposit)) return fail('Nicht genügend Geld für Kaution und Einrichtung.');
      loc.kind = cmd.kind;
      book(state, 'company', -def.deposit, 'rent', `Kaution & Einrichtung ${def.name}`);
      addLog(state, { level: 'success', category: 'company', text: `Standort ${CITY_BY_ID[loc.cityId].name} erweitert: ${def.name} (${def.parking} Stellplätze).` });
      return { ok: true };
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
      addLog(state, { level: 'info', category: 'multiplayer', text: `Rechte von ${p.name} geändert.` });
      return { ok: true };
    }
  }
}
