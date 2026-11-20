// Fahrzeugausstattung: Nachrüstungen in der Werkstatt mit spürbarer Wirkung auf Fahrer, Verschleiß,
// Unfälle und Verbrauch. Die Ausstattung steigert den Wiederverkaufswert.

import { hasFacility } from './company.ts';
import { addLog, book, formatMoney } from './finance.ts';
import type { GameState, Id, Money, Vehicle } from './types.ts';

export type EquipmentId = 'aircon' | 'fridge' | 'retarder' | 'assist' | 'aero';

export interface EquipmentDef {
  id: EquipmentId;
  name: string;
  price: Money;
  /** Einbauzeit in Stunden */
  hours: number;
  effect: string;
}

export const EQUIPMENT: Record<EquipmentId, EquipmentDef> = {
  aircon: { id: 'aircon', name: 'Standklimaanlage', price: 2_900_00, hours: 6, effect: 'Ruhige Nächte im Sommer: Fahrer sind zufriedener (bis +6, je nach Anteil im Fuhrpark).' },
  fridge: { id: 'fridge', name: 'Kühlschrank und Kaffeemaschine', price: 650_00, hours: 2, effect: 'Kleiner Komfort, der sich herumspricht: bis +2 Zufriedenheit.' },
  retarder: { id: 'retarder', name: 'Retarder', price: 3_800_00, hours: 8, effect: 'Verschleißfreies Bremsen: 12 % weniger Verschleiß.' },
  assist: { id: 'assist', name: 'Notbrems- und Spurhalteassistent', price: 2_400_00, hours: 5, effect: 'Unfallrisiko −40 %.' },
  aero: { id: 'aero', name: 'Aerodynamikpaket', price: 3_200_00, hours: 6, effect: 'Dachspoiler, Seitenverkleidung, Heckklappen: 4 % weniger Verbrauch.' },
};
export const EQUIPMENT_IDS = Object.keys(EQUIPMENT) as EquipmentId[];

export const hasEquipment = (v: Vehicle | undefined, id: EquipmentId) => !!v?.equipment?.includes(id);

/** Faktoren für die Simulation */
export const equipFuelFactor = (v: Vehicle | undefined) => (hasEquipment(v, 'aero') ? 0.96 : 1);
export const equipWearFactor = (v: Vehicle | undefined) => (hasEquipment(v, 'retarder') ? 0.88 : 1);
export const equipAccidentFactor = (v: Vehicle | undefined) => (hasEquipment(v, 'assist') ? 0.6 : 1);

/** Zufriedenheitsbonus aus dem Fahrerkomfort im Fuhrpark (Fahrer wechseln die Fahrzeuge) */
export function comfortBonus(state: GameState): number {
  const vs = Object.values(state.vehicles);
  if (!vs.length) return 0;
  const share = (id: EquipmentId) => vs.filter((v) => hasEquipment(v, id)).length / vs.length;
  return Math.round(share('aircon') * 6 + share('fridge') * 2);
}

/** Zusätzlicher Wiederverkaufswert: die Hälfte des Einbaupreises */
export const equipmentValue = (v: Vehicle) => (v.equipment ?? []).reduce((a, id) => a + Math.round(EQUIPMENT[id].price * 0.5), 0);

/** Einbau in der Werkstatt (eigene Werkstatt: 10 % günstiger) */
export function installEquipment(state: GameState, vehicleId: Id, id: EquipmentId): { ok: true } | { ok: false; error: string } {
  const v = state.vehicles[vehicleId];
  const def = EQUIPMENT[id];
  if (!v) return { ok: false, error: 'Fahrzeug nicht gefunden.' };
  if (!def) return { ok: false, error: 'Unbekannte Ausstattung.' };
  if (hasEquipment(v, id)) return { ok: false, error: `${def.name} ist bereits eingebaut.` };
  if (v.status !== 'idle') return { ok: false, error: 'Das Fahrzeug ist im Einsatz oder in der Werkstatt.' };
  if (v.ownership === 'rented') return { ok: false, error: 'Mietfahrzeuge lassen sich nicht umrüsten.' };
  const own = hasFacility(state, v.cityId, 'workshop');
  const cost = Math.round(def.price * (own ? 0.9 : 1));
  if (state.company.account.balance - cost < -10_000_00) return { ok: false, error: 'Nicht genügend Geld.' };
  book(state, 'company', -cost, 'vehicle_purchase', `${def.name} für ${v.plate}`);
  v.equipment = [...(v.equipment ?? []), id];
  v.status = 'workshop';
  v.busyUntil = state.time + def.hours * 60;
  v.history.push({ t: state.time, text: `Nachrüstung: ${def.name}${own ? ' (eigene Werkstatt)' : ''}`, cost });
  addLog(state, { level: 'info', category: 'fleet', text: `${def.name} wird in LKW ${v.plate} eingebaut (${def.hours} h, ${formatMoney(cost)}).`, ref: { kind: 'vehicle', id: v.id } });
  return { ok: true };
}
