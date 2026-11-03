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
  | 'customers' | 'market' | 'locations' | 'private' | 'multiplayer' | 'stats' | 'settings';

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
  /** Karte auf diesen Punkt zentrieren (z. B. Verkehrsstörung) */
  mapFocus: [number, number] | null;
  toasts: Toast[];
  connection: string;
  /** Multiplayer-Firma wird auf diesem PC gehostet */
  hosting: boolean;
  /** Internet-Zugang des Hosts (Cloudflare-Tunnel) */
  tunnel: { status: 'off' | 'starting' | 'checking' | 'ready' | 'error'; url?: string; error?: string };
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
  mapFocus: null,
  toasts: [],
  connection: '',
  hosting: false,
  tunnel: { status: 'off' },
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

/** Team-Benachrichtigungen, die der Spieler schon gesehen hat (Nachrichten, Aufgaben, Einladungen, Abstimmungen) */
let seenTeam: Set<string> | null = null;

function teamNotices(state: GameState, pid: string): { key: string; text: string }[] {
  const team = state.team;
  if (!team) return [];
  const name = (id: string) => state.players[id]?.name ?? '?';
  return [
    ...team.messages.filter((m) => m.to.includes(pid) && !m.readBy.includes(pid)).map((m) => ({ key: m.id, text: `Neue Nachricht von ${name(m.from)}: ${m.subject}` })),
    ...team.tasks.filter((t) => t.assignee === pid && t.status !== 'done' && t.createdBy !== pid).map((t) => ({ key: `${t.id}:${pid}`, text: `Neue Aufgabe von ${name(t.createdBy)}: ${t.title}` })),
    ...team.activities.filter((a) => a.status === 'pending' && a.invited.includes(pid)).map((a) => ({ key: a.id, text: `${name(a.host)} lädt dich ein – siehe Team & Kommunikation → Gemeinsam.` })),
    ...team.votes.filter((v) => v.status === 'open' && v.createdBy !== pid).map((v) => ({ key: v.id, text: `Abstimmung: ${v.question}` })),
  ];
}

export function receiveSnapshot(state: GameState, at: number, playerId: string) {
  const notices = teamNotices(state, playerId);
  if (seenTeam) for (const n of notices) if (!seenTeam.has(n.key)) toast('info', n.text);
  seenTeam = new Set([...(seenTeam ?? []), ...notices.map((n) => n.key)]);
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
  seenTeam = null;
  setUi({ state: null, host: null, page: 'dashboard', selectedVehicleId: null, dispatchDraft: null, toasts: [], hosting: false, connection: '' });
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
