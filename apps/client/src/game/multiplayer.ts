// Multiplayer-Verwaltung auf dem Client: gemerkte Firmen, eingebauter Server der Desktop-App,
// Verbindungsaufbau. Hostet der Spieler selbst, startet die Desktop-App den mitgelieferten
// Server automatisch (Tauri-Sidecar) – ohne Node.js oder Kommandozeile.

import { invoke, isTauri } from '@tauri-apps/api/core';
import { RemoteHost } from './host.ts';
import { localStorageSet, receiveSnapshot, setUi, toast } from './store.ts';

export const DEFAULT_PORT = 8787;
const SESSIONS_KEY = 'spedsim.mpSessions';

export interface MpSession {
  gameId: string;
  inviteCode: string;
  playerId: string;
  token: string;
  url: string;
  company: string;
  /** auf diesem PC gehostet (Server wird automatisch gestartet) */
  hosted: boolean;
  lastPlayed: string;
}

export const isDesktop = () => isTauri();

export function loadSessions(): MpSession[] {
  try {
    const list = JSON.parse(localStorage.getItem(SESSIONS_KEY) ?? '[]') as MpSession[];
    // Übernahme der einzelnen gemerkten Sitzung aus Version 0.1.0
    const legacy = localStorage.getItem('spedsim.mp');
    if (legacy && !list.length) {
      const l = JSON.parse(legacy);
      list.push({ ...l, company: 'Multiplayer-Firma', hosted: /localhost|127\.0\.0\.1/.test(l.url), lastPlayed: new Date().toISOString() });
    }
    return list.sort((a, b) => b.lastPlayed.localeCompare(a.lastPlayed));
  } catch {
    return [];
  }
}

function saveSession(s: MpSession) {
  const list = loadSessions().filter((x) => x.gameId !== s.gameId);
  list.unshift(s);
  localStorageSet(SESSIONS_KEY, JSON.stringify(list));
}

export function forgetSession(gameId: string) {
  localStorageSet(SESSIONS_KEY, JSON.stringify(loadSessions().filter((x) => x.gameId !== gameId)));
}

/** Eingabe wie "192.168.1.20", "meinserver.de:9000" oder "ws://…" in eine WebSocket-URL umwandeln. */
export function normalizeServerUrl(input: string): string {
  let s = input.trim();
  if (!s) return `ws://localhost:${DEFAULT_PORT}`;
  if (!/^wss?:\/\//i.test(s)) s = `ws://${s}`;
  const u = new URL(s);
  if (!u.port && u.protocol === 'ws:') u.port = String(DEFAULT_PORT);
  return u.toString().replace(/\/$/, '');
}

/** Eingebauten Server starten (Desktop-App). Im Browser muss er per `npm run server` laufen. */
export async function ensureLocalServer(): Promise<string> {
  const url = `ws://localhost:${DEFAULT_PORT}`;
  if (!isDesktop()) return url;
  setUi({ connection: 'Server wird gestartet …' });
  const info = await invoke<{ port: number; status: string }>('start_server', { port: DEFAULT_PORT });
  return `ws://localhost:${info.port}`;
}

export async function localAddress(): Promise<string | null> {
  if (!isDesktop()) return null;
  try {
    return await invoke<string | null>('local_address');
  } catch {
    return null;
  }
}

export async function stopLocalServer() {
  if (isDesktop()) await invoke('stop_server');
}

/** Verbindung zu einer Firma aufbauen. `hello` ist create- oder join-Nachricht. */
export function connect(url: string, hello: Record<string, unknown>, hosted: boolean) {
  let started = false;
  const host: RemoteHost = new RemoteHost(url, hello, {
    onSnapshot: (s) => {
      receiveSnapshot(s.state, s.at, s.playerId);
      if (!started) {
        started = true;
        setUi({ host, page: 'dashboard', hosting: hosted, connection: 'verbunden' });
      }
    },
    onError: (m) => toast('danger', m),
    onStatus: (st) => setUi({ connection: st }),
    onWelcome: (w) => {
      saveSession({ ...w, url, hosted, company: String(hello.companyName ?? ''), lastPlayed: new Date().toISOString() });
    },
    onCompany: (gameId, company) => {
      const s = loadSessions().find((x) => x.gameId === gameId);
      if (s && s.company !== company) saveSession({ ...s, company });
    },
  });
  return host;
}

/** Gemerkte Firma fortsetzen – startet bei eigenen Firmen vorher den eingebauten Server. */
export async function resume(s: MpSession) {
  const url = s.hosted ? await ensureLocalServer() : s.url;
  connect(url, { t: 'join', code: s.inviteCode, playerId: s.playerId, token: s.token }, s.hosted);
}
