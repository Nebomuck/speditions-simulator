// Client-Zustand: letzter Spiel-Schnappschuss, Navigation, Auswahl, Benachrichtigungen.
// Minimaler Store auf Basis von useSyncExternalStore (kein zusätzliches Framework nötig).

import { useSyncExternalStore } from 'react';
import roadnet from '@spedsim/core/roadnet.json';
import { createSimContext, type Command, type CommandResult, type GameState, type LogEntry, type RoadNetData } from '@spedsim/core';
import type { GameHost } from './host.ts';
import { playSound } from '../ui/sound.ts';

/** Clientseitiger Weltkontext (Straßennetz) für Positionsberechnung und Kartendarstellung. */
export const world = createSimContext(roadnet as RoadNetData);

export type Page =
  | 'dashboard' | 'map' | 'dispatch' | 'orders' | 'personnel' | 'fleet' | 'finance'
  | 'customers' | 'locations' | 'private' | 'multiplayer' | 'stats' | 'settings';

export interface Toast {
  id: number;
  level: LogEntry['level'];
  text: string;
}

interface UiState {
  host: GameHost | null;
  state: GameState | null;
  playerId: string;
  snapshotAt: number;
  page: Page;
  selectedVehicleId: string | null;
  followVehicle: boolean;
  focusOrderId: string | null;
  toasts: Toast[];
  connection: string;
  theme: 'dark' | 'light';
  sound: boolean;
  dispatchDraft: { orderId?: string; vehicleId?: string } | null;
}

let ui: UiState = {
  host: null,
  state: null,
  playerId: '',
  snapshotAt: 0,
  page: 'dashboard',
  selectedVehicleId: null,
  followVehicle: false,
  focusOrderId: null,
  toasts: [],
  connection: '',
  theme: (localStorageGet('spedsim.theme') as 'dark' | 'light') ?? 'dark',
  sound: localStorageGet('spedsim.sound') !== 'off',
  dispatchDraft: null,
};

const listeners = new Set<() => void>();
let lastLogId = -1;
let toastSeq = 0;

function localStorageGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

export function localStorageSet(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* privater Modus */
  }
}

export function setUi(patch: Partial<UiState>) {
  ui = { ...ui, ...patch };
  for (const l of listeners) l();
}

export function getUi() {
  return ui;
}

export function useUi<T>(sel: (u: UiState) => T): T {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => sel(ui),
  );
}

/** Aktueller Spielzustand – nur innerhalb des Spiels (nach Spielstart) verwenden. */
export function useGame(): GameState {
  return useUi((u) => u.state!);
}

export function receiveSnapshot(state: GameState, at: number, playerId: string) {
  // neue Ereignisse als Benachrichtigungen anzeigen
  const fresh = lastLogId < 0 ? [] : state.log.filter((l) => l.id > lastLogId);
  lastLogId = state.log.length ? state.log[state.log.length - 1].id : lastLogId === -1 ? 0 : lastLogId;
  setUi({ state, snapshotAt: at, playerId });
  for (const l of fresh) if (l.level !== 'info') toast(l.level, l.text);
  if (fresh.some((l) => l.level === 'danger')) playSound('alert');
  else if (fresh.some((l) => l.level === 'success' && l.category === 'order')) playSound('success');
  else if (fresh.some((l) => l.level === 'warning')) playSound('warning');
}

export function resetGameUi() {
  lastLogId = -1;
  setUi({ state: null, host: null, page: 'dashboard', selectedVehicleId: null, dispatchDraft: null, toasts: [] });
}

export function toast(level: Toast['level'], text: string) {
  const id = ++toastSeq;
  setUi({ toasts: [...ui.toasts.slice(-4), { id, level, text }] });
  setTimeout(() => setUi({ toasts: ui.toasts.filter((t) => t.id !== id) }), level === 'danger' ? 9000 : 6000);
}

export async function sendCommand(cmd: Command, opts: { quiet?: boolean } = {}): Promise<CommandResult> {
  const host = ui.host;
  if (!host) return { ok: false, error: 'Kein Spiel aktiv.' };
  const r = await host.command(cmd);
  if (!r.ok && !opts.quiet) {
    toast('danger', r.error);
    playSound('error');
  } else if (r.ok && !opts.quiet) playSound('click');
  return r;
}

export function navigate(page: Page) {
  setUi({ page });
}
