// Multiplayer-Verwaltung auf dem Client: gemerkte Firmen, eingebauter Server der Desktop-App,
// Verbindungsaufbau. Hostet der Spieler selbst, startet die Desktop-App den mitgelieferten
// Server automatisch (Tauri-Sidecar) – ohne Node.js oder Kommandozeile.

import { invoke, isTauri } from '@tauri-apps/api/core';
import { RemoteHost } from './host.ts';
import { DEFAULT_PORT, normalizeServerUrl } from './invite.ts';
import { getUi, localStorageSet, receiveSnapshot, setUi, toast } from './store.ts';

export { DEFAULT_PORT, inviteLine, normalizeServerUrl, parseInvite } from './invite.ts';

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Wartet, bis der neue Tunnel-Hostname öffentlich auflösbar ist. Fragt bewusst per DNS-over-HTTPS,
 *  damit ein zu früher Fehlschlag nicht im DNS-Cache von Windows oder des Routers hängen bleibt. */
async function waitForDns(hostname: string) {
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${hostname}&type=A`, { headers: { accept: 'application/dns-json' } });
      const j = await r.json();
      if (j.Status === 0 && j.Answer?.length) return true;
    } catch {
      /* nächster Versuch */
    }
    await sleep(2000);
  }
  return false;
}

/** Prüft, ob der Server über die öffentliche Adresse wirklich per WebSocket erreichbar ist. */
function probe(url: string) {
  return new Promise<boolean>((resolve) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => (ws.close(), resolve(false)), 8000);
    ws.onopen = () => (clearTimeout(timer), ws.close(), resolve(true));
    ws.onerror = () => (clearTimeout(timer), resolve(false));
  });
}

/** Internet-Zugang für die gehostete Firma öffnen (Desktop-App). Läuft im Hintergrund. */
export async function startTunnel() {
  const cur = getUi().tunnel.status;
  if (!isDesktop() || cur === 'starting' || cur === 'checking' || cur === 'ready') return;
  setUi({ tunnel: { status: 'starting' } });
  try {
    const url = await invoke<string>('start_tunnel', { port: DEFAULT_PORT });
    setUi({ tunnel: { status: 'checking', url } });
    const hostname = new URL(url).hostname;
    if (!(await waitForDns(hostname))) throw new Error('Die Tunnel-Adresse wurde nicht im DNS veröffentlicht.');
    await sleep(2000);
    const wss = normalizeServerUrl(url);
    for (let i = 0; i < 5; i++) {
      if (await probe(wss)) {
        setUi({ tunnel: { status: 'ready', url } });
        return;
      }
      await sleep(3000);
    }
    throw new Error('Der Server ist über die Tunnel-Adresse nicht erreichbar.');
  } catch (e) {
    setUi({ tunnel: { status: 'error', error: String((e as Error).message ?? e) } });
  }
}

export async function stopTunnel() {
  if (isDesktop()) await invoke('stop_tunnel');
  setUi({ tunnel: { status: 'off' } });
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
        if (hosted) startTunnel();
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

/** Neu beitreten. Kennt dieser PC die Firma schon (gleicher Code), tritt er als derselbe Spieler
 *  wieder bei – nötig, weil sich die Tunnel-Adresse des Hosts bei jedem Start ändert. */
export function joinWithCode(url: string, code: string, name: string, character: unknown) {
  const known = loadSessions().find((s) => !s.hosted && s.inviteCode.toUpperCase() === code.toUpperCase());
  if (known) return connect(url, { t: 'join', code: known.inviteCode, playerId: known.playerId, token: known.token }, false);
  return connect(url, { t: 'join', code, name, character }, false);
}

/** Gemerkte Firma fortsetzen – startet bei eigenen Firmen vorher den eingebauten Server. */
export async function resume(s: MpSession) {
  const url = s.hosted ? await ensureLocalServer() : s.url;
  connect(url, { t: 'join', code: s.inviteCode, playerId: s.playerId, token: s.token }, s.hosted);
}
