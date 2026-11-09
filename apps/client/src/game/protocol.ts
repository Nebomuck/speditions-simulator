// Nachrichten zwischen UI und Spiel-Host (lokaler Worker oder Multiplayer-Server).

import type { Command, CommandResult, GameState, NewGameOptions } from '@spedsim/core';

export interface SaveMeta {
  name: string;
  savedAt: string;
  company: string;
  time: number;
  balance: number;
  auto: boolean;
  /** Kennung des Spiels (Startwert des Zufallsgenerators) – fasst Spielstände einer Firma zusammen; fehlt bei alten Spielständen */
  seed?: number;
  vehicles?: number;
  level?: number;
  scenario?: string;
  difficulty?: string;
  founder?: string;
}

export type HostRequest =
  | { kind: 'new'; options: NewGameOptions }
  | { kind: 'load'; name: string }
  | { kind: 'import'; text: string }
  | { kind: 'save'; name: string }
  | { kind: 'listSaves' }
  | { kind: 'deleteSave'; name: string }
  | { kind: 'export' }
  | { kind: 'command'; cmd: Command }
  | { kind: 'close' };

export type HostResponse =
  | { ok: true; result?: CommandResult; saves?: SaveMeta[]; text?: string }
  | { ok: false; error: string };

/** Zustandsschnappschuss; `at` = Echtzeit (ms) beim Versand für Interpolation. */
export interface Snapshot {
  state: GameState;
  at: number;
  playerId: string;
}
