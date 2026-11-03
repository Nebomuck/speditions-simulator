// PersistenceSystem: versioniertes Speicherformat mit Prüfsumme und Migrationskette.

import { STATE_VERSION } from './game.ts';
import { defaultAutoDispatch } from './autodispatch.ts';
import type { GameState } from './types.ts';

export const SAVE_FORMAT = 'spedsim-save';

export interface SaveFile {
  format: typeof SAVE_FORMAT;
  version: number;
  savedAt: string;
  name: string;
  checksum: string;
  meta: { company: string; time: number; balance: number };
  state: GameState;
}

/** FNV-1a 32 bit über den JSON-Text – erkennt beschädigte oder manipulierte Spielstände. */
export function checksum(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function serializeSave(state: GameState, name: string): string {
  const stateJson = JSON.stringify(state);
  const meta = { company: state.company.name, time: state.time, balance: state.company.account.balance };
  // state als Rohtext einbetten, damit die Prüfsumme exakt über den gespeicherten Text läuft
  return `{"format":"${SAVE_FORMAT}","version":${STATE_VERSION},"savedAt":${JSON.stringify(new Date().toISOString())},"name":${JSON.stringify(name)},"checksum":"${checksum(stateJson)}","meta":${JSON.stringify(meta)},"state":${stateJson}}`;
}

export class SaveError extends Error {}

type Migration = (s: Record<string, unknown>) => Record<string, unknown>;
/** MIGRATIONS[n] hebt einen Zustand von Version n auf n+1. */
export const MIGRATIONS: Record<number, Migration> = {
  // 0.4.0: Bankkredite
  1: (s) => {
    const company = s.company as Record<string, unknown>;
    company.loans ??= [];
    return s;
  },
  // 0.6.0: Mehrfachbeladung (Halte je Fahrt) und Verkehrsstörungen
  2: (s) => {
    const orders = s.orders as Record<string, { fromCityId: string; toCityId: string }>;
    for (const t of Object.values(s.trips as Record<string, Record<string, unknown>>)) {
      const o = typeof t.orderId === 'string' ? orders[t.orderId] : undefined;
      if (o && !t.stops)
        t.stops = [
          { kind: 'pickup', orderId: t.orderId, cityId: o.fromCityId },
          { kind: 'delivery', orderId: t.orderId, cityId: o.toCityId },
        ];
    }
    s.disruptions ??= [];
    return s;
  },
  // 0.6.0: Rahmenverträge und Personalverwaltung
  3: (s) => {
    s.contracts ??= {};
    for (const d of Object.values(s.drivers as Record<string, Record<string, unknown>>)) {
      d.vacationLeft ??= 30;
      d.lastVacation ??= d.hired;
    }
    return s;
  },
  // 0.7.0: Unternehmensausbau (Einrichtungen, Abteilungen, Unternehmensstufen)
  4: (s) => {
    const company = s.company as Record<string, unknown>;
    for (const l of company.locations as Record<string, unknown>[]) l.facilities ??= [];
    company.staff ??= [];
    company.level ??= 1;
    return s;
  },
  // 0.7.0: KI-Disponenten
  5: (s) => {
    const company = s.company as Record<string, unknown>;
    for (const m of company.staff as Record<string, unknown>[]) m.skill ??= 50;
    s.autoDispatch ??= defaultAutoDispatch();
    return s;
  },
  // 0.8.0: Lebenssimulation
  6: (s) => {
    for (const p of Object.values(s.players as Record<string, { character: Record<string, unknown> }>)) {
      const c = p.character;
      c.background ??= 'career_changer';
      c.skills ??= { negotiation: 30, leadership: 30, logistics: 30 };
      c.goals ??= [];
      c.workStyle ??= 'hands_on';
      c.furniture ??= 0;
      c.relations ??= [];
    }
    return s;
  },
  // 0.9.0: Multiplayer-Zusammenarbeit
  7: (s) => {
    s.team ??= { messages: [], tasks: [], activities: [], votes: [] };
    for (const p of Object.values(s.players as Record<string, Record<string, unknown>>)) p.role ??= p.isFounder ? 'ceo' : 'custom';
    return s;
  },
};

export function deserializeSave(text: string): GameState {
  let parsed: SaveFile;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new SaveError('Spielstand ist beschädigt (kein gültiges JSON).');
  }
  if (parsed?.format !== SAVE_FORMAT) throw new SaveError('Unbekanntes Dateiformat.');
  const stateStart = text.indexOf('"state":') + '"state":'.length;
  const stateJson = text.slice(stateStart, text.length - 1);
  if (checksum(stateJson) !== parsed.checksum) throw new SaveError('Prüfsumme stimmt nicht – Spielstand beschädigt.');
  let state = parsed.state as unknown as Record<string, unknown>;
  let v = parsed.version;
  if (v > STATE_VERSION) throw new SaveError(`Spielstand stammt aus einer neueren Spielversion (${v}).`);
  while (v < STATE_VERSION) {
    const m = MIGRATIONS[v];
    if (!m) throw new SaveError(`Keine Migration von Version ${v} verfügbar.`);
    state = m(state);
    v++;
  }
  (state as unknown as GameState).version = STATE_VERSION;
  return state as unknown as GameState;
}
