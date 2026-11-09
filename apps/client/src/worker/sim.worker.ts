// Einzelspieler-Host: führt die gemeinsame Simulationslogik (GameSession) in einem Web Worker aus,
// damit Simulation und Darstellung voneinander entkoppelt sind.

import roadnet from '@spedsim/core/roadnet.json';
import {
  GameSession, createNewGame, createSimContext, dayIndex, deserializeSave, serializeSave, formatDate, type RoadNetData, SaveError,
} from '@spedsim/core';
import type { HostRequest, HostResponse, SaveMeta } from '../game/protocol.ts';
import { deleteSave, listSaves, readSave, writeSave } from './storage.ts';

const ctx = createSimContext(roadnet as RoadNetData);
let session: GameSession | null = null;
let currentSaveName = '';
let lastAutosaveDay = -1;
let autosaveSlot = 0;
let lastTick = performance.now();
let lastSnapshot = 0;
let lastRevision = -1;

const SNAPSHOT_MS = 200;

function post(msg: unknown) {
  (self as unknown as Worker).postMessage(msg);
}

function snapshot(force = false) {
  if (!session) return;
  if (!force && session.revision === lastRevision) return;
  lastRevision = session.revision;
  post({ type: 'snapshot', snapshot: { state: session.state, at: Date.now(), playerId: founderId() } });
}

function founderId() {
  return Object.values(session!.state.players).find((p) => p.isFounder)!.id;
}

async function save(name: string, auto: boolean) {
  if (!session) throw new Error('Kein Spiel aktiv.');
  const s = session.state;
  const meta: SaveMeta = {
    name, savedAt: new Date().toISOString(), company: s.company.name, time: s.time, balance: s.company.account.balance, auto,
    seed: s.seed, vehicles: Object.keys(s.vehicles).length, level: s.company.level, scenario: s.scenario?.id, difficulty: s.difficulty.id,
    founder: Object.values(s.players).find((p) => p.isFounder)?.name,
  };
  await writeSave(meta, serializeSave(s, name));
}

function loop() {
  const now = performance.now();
  const dt = now - lastTick;
  lastTick = now;
  if (session) {
    session.advance(dt);
    if (session.fault) {
      const f = session.fault;
      session.fault = null;
      post({ type: 'fault', message: f.message, stack: f.stack, time: f.time });
      // Notfall-Spielstand vom Zeitpunkt des Fehlers (die rotierenden Autosaves bleiben unangetastet)
      save(`Notfall – ${session.state.company.name}`, true).catch(() => {});
    }
    const day = dayIndex(session.state.time);
    if (lastAutosaveDay === -1) lastAutosaveDay = day;
    if (day !== lastAutosaveDay) {
      lastAutosaveDay = day;
      autosaveSlot = (autosaveSlot % 3) + 1;
      save(`Autosave ${autosaveSlot} – ${session.state.company.name}`, true).catch((e) => post({ type: 'error', message: `Autosave fehlgeschlagen: ${e.message}` }));
    }
    if (now - lastSnapshot >= SNAPSHOT_MS) {
      lastSnapshot = now;
      snapshot();
    }
  }
}
setInterval(loop, 50);

function start(s: GameSession, name: string) {
  session = s;
  currentSaveName = name;
  lastAutosaveDay = -1;
  lastRevision = -1;
  snapshot(true);
}

async function handle(req: HostRequest): Promise<HostResponse> {
  switch (req.kind) {
    case 'new': {
      const state = createNewGame(ctx, req.options);
      start(new GameSession(state, ctx), state.company.name);
      await save(state.company.name, false);
      return { ok: true };
    }
    case 'load': {
      const { text, backup } = await readSave(req.name);
      let state;
      try {
        state = deserializeSave(text);
      } catch (e) {
        if (!(e instanceof SaveError) || !backup) throw e;
        state = deserializeSave(backup);
        post({ type: 'error', message: `Spielstand beschädigt – Sicherungskopie geladen (${(e as Error).message})` });
      }
      state.paused = true;
      start(new GameSession(state, ctx), req.name.replace(/^Autosave \d – /, ''));
      return { ok: true };
    }
    case 'import': {
      const state = deserializeSave(req.text);
      state.paused = true;
      start(new GameSession(state, ctx), state.company.name);
      return { ok: true };
    }
    case 'save': {
      await save(req.name || currentSaveName, false);
      return { ok: true };
    }
    case 'listSaves':
      return { ok: true, saves: await listSaves() };
    case 'deleteSave':
      await deleteSave(req.name);
      return { ok: true };
    case 'export': {
      if (!session) throw new Error('Kein Spiel aktiv.');
      return { ok: true, text: serializeSave(session.state, `${session.state.company.name} ${formatDate(session.state.time)}`) };
    }
    case 'command': {
      if (!session) throw new Error('Kein Spiel aktiv.');
      const result = session.command(founderId(), req.cmd);
      snapshot();
      return { ok: true, result };
    }
    case 'close':
      session = null;
      return { ok: true };
  }
}

self.onmessage = async (ev: MessageEvent<{ id: number; req: HostRequest }>) => {
  const { id, req } = ev.data;
  try {
    post({ type: 'response', id, res: await handle(req) });
  } catch (e) {
    post({ type: 'response', id, res: { ok: false, error: (e as Error).message } satisfies HostResponse });
  }
};
