// MultiplayerServer: serverautoritativer Spielserver für kooperative Speditionen.
//
// - Jede Multiplayer-Firma ist ein "Room" mit genau einer GameSession (gemeinsame Simulationslogik aus @spedsim/core).
// - Nur der Server simuliert. Clients senden Befehle und erhalten zuerst den Vollzustand, danach nur Änderungen
//   (Delta-Synchronisation, `diffState`/`applyPatch`). Fremde interne Nachrichten werden je Spieler herausgefiltert.
// - Befehle werden strikt nacheinander ausgeführt → keine Doppelbelegungen oder widersprüchlichen Aktionen.
// - Persistenz: SQLite (node:sqlite) mit versionierten, prüfsummengeschützten Spielständen + rotierenden Backups.
// - Spielzeit läuft nur, solange mindestens ein Spieler verbunden ist; danach wird gespeichert und pausiert.

import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { WebSocketServer, type WebSocket } from 'ws';
import roadnet from '@spedsim/core/roadnet.json' with { type: 'json' };
import {
  GameSession, addPlayer, sanitizeAvatar, applyPatch, createNewGame, createSimContext, deserializeSave, diffState, playerView, serializeSave, sanitizeDifficulty, isScenarioId, CITY_BY_ID, LIFE_GOALS,
  type Character, type Command, type Difficulty, type DifficultyId, type RoadNetData,
} from '@spedsim/core';

export interface ServerOptions {
  port: number;
  dbPath: string;
  /** Bind-Adresse (Standard: alle Schnittstellen) */
  host?: string;
  /** maximale Spieler je Firma (Standard 8) */
  maxPlayers?: number;
  /** Abstand der Sicherungskopien je Firma in Minuten (Standard 10) */
  backupMinutes?: number;
  /** so viele Sicherungskopien je Firma behalten (Standard 10) */
  backupsKeep?: number;
  /** Programmversion für /health */
  version?: string;
  /** Intervall für Zustandsübertragung (ms) */
  broadcastMs?: number;
  /** Intervall für automatisches Speichern (ms) */
  saveMs?: number;
  log?: (msg: string, data?: Record<string, unknown>) => void;
}

interface Client {
  ws: WebSocket;
  roomId?: string;
  playerId?: string;
  /** zuletzt übertragener Zustand (Basis für das nächste Delta) */
  sent?: unknown;
  /** Zählstand der Übertragungen an diesen Client */
  rev: number;
}

export interface SyncStats {
  full: number;
  patches: number;
  fullBytes: number;
  patchBytes: number;
}

interface Room {
  id: string;
  invite: string;
  session: GameSession;
  clients: Set<Client>;
  lastBroadcastRev: number;
  lastSavedRev: number;
  lastBackup: number;
}

const ctx = createSimContext(roadnet as RoadNetData);

function inviteCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = randomBytes(6);
  let s = '';
  for (let i = 0; i < 6; i++) s += alphabet[b[i] % alphabet.length];
  return `${s.slice(0, 3)}-${s.slice(3)}`;
}

const token = () => randomBytes(18).toString('base64url');

function sanitizeCharacter(c: unknown, name: string): Partial<Character> {
  const o = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>;
  return {
    name,
    age: typeof o.age === 'number' ? Math.max(18, Math.min(80, Math.round(o.age))) : 32,
    avatar: sanitizeAvatar(o.avatar),
    ...(o.background === 'driver' || o.background === 'merchant' || o.background === 'career_changer' ? { background: o.background } : {}),
    ...(Array.isArray(o.goals) ? { goals: o.goals.filter((g): g is string => typeof g === 'string' && g in LIFE_GOALS).slice(0, 4) } : {}),
  };
}

const cleanName = (v: unknown, fallback: string) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 40) : fallback);

export function startServer(opts: ServerOptions) {
  const maxPlayers = opts.maxPlayers ?? 8;
  const backupMs = (opts.backupMinutes ?? 10) * 60_000;
  const started = Date.now();
  const log = opts.log ?? ((msg, data) => console.log(JSON.stringify({ t: new Date().toISOString(), msg, ...data })));
  mkdirSync(dirname(opts.dbPath), { recursive: true });
  const db = new DatabaseSync(opts.dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS games (id TEXT PRIMARY KEY, invite TEXT UNIQUE NOT NULL, name TEXT, created TEXT, updated TEXT, save TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS players (game_id TEXT NOT NULL, player_id TEXT NOT NULL, token TEXT NOT NULL, PRIMARY KEY (game_id, player_id));
    CREATE TABLE IF NOT EXISTS backups (id INTEGER PRIMARY KEY AUTOINCREMENT, game_id TEXT NOT NULL, created TEXT NOT NULL, save TEXT NOT NULL);
  `);
  const q = {
    insertGame: db.prepare('INSERT INTO games (id, invite, name, created, updated, save) VALUES (?, ?, ?, ?, ?, ?)'),
    updateGame: db.prepare('UPDATE games SET save = ?, updated = ?, name = ? WHERE id = ?'),
    gameByInvite: db.prepare('SELECT id, invite, save FROM games WHERE invite = ?'),
    gameById: db.prepare('SELECT id, invite, save FROM games WHERE id = ?'),
    insertPlayer: db.prepare('INSERT INTO players (game_id, player_id, token) VALUES (?, ?, ?)'),
    playerToken: db.prepare('SELECT token FROM players WHERE game_id = ? AND player_id = ?'),
    insertBackup: db.prepare('INSERT INTO backups (game_id, created, save) VALUES (?, ?, ?)'),
    pruneBackups: db.prepare('DELETE FROM backups WHERE game_id = ? AND id NOT IN (SELECT id FROM backups WHERE game_id = ? ORDER BY id DESC LIMIT ?)'),
    latestBackup: db.prepare('SELECT save FROM backups WHERE game_id = ? ORDER BY id DESC LIMIT 1'),
  };

  const rooms = new Map<string, Room>();

  function persist(room: Room, backup = false) {
    const text = serializeSave(room.session.state, room.session.state.company.name);
    const now = new Date().toISOString();
    db.exec('BEGIN');
    try {
      q.updateGame.run(text, now, room.session.state.company.name, room.id);
      if (backup) {
        q.insertBackup.run(room.id, now, text);
        q.pruneBackups.run(room.id, room.id, opts.backupsKeep ?? 10);
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    room.lastSavedRev = room.session.revision;
    if (backup) room.lastBackup = Date.now();
  }

  function loadRoom(id: string): Room | null {
    const existing = rooms.get(id);
    if (existing) return existing;
    const row = q.gameById.get(id) as { id: string; invite: string; save: string } | undefined;
    if (!row) return null;
    let state;
    try {
      state = deserializeSave(row.save);
    } catch (e) {
      log('save_corrupt_using_backup', { game: id, error: (e as Error).message });
      const b = q.latestBackup.get(id) as { save: string } | undefined;
      if (!b) throw e;
      state = deserializeSave(b.save);
    }
    const room: Room = { id, invite: row.invite, session: new GameSession(state, ctx), clients: new Set(), lastBroadcastRev: -1, lastSavedRev: 0, lastBackup: Date.now() };
    for (const p of Object.values(state.players)) p.online = false;
    rooms.set(id, room);
    return room;
  }

  function send(c: Client, msg: unknown) {
    if (c.ws.readyState === c.ws.OPEN) c.ws.send(JSON.stringify(msg));
  }

  const stats: SyncStats = { full: 0, patches: 0, fullBytes: 0, patchBytes: 0 };

  /** Zustand an einen Client: beim ersten Mal (oder nach `resync`) vollständig, sonst nur die Änderungen. */
  function syncClient(room: Room, c: Client) {
    if (c.ws.readyState !== c.ws.OPEN || !c.playerId) return;
    const view = playerView(room.session.state, c.playerId);
    const pid = JSON.stringify(c.playerId);
    if (c.sent !== undefined) {
      const ops = diffState(c.sent, view);
      if (!ops.length) return;
      const opsJson = JSON.stringify(ops);
      // sehr große Änderungen (z. B. nach langem Vorspulen): lieber den Vollzustand schicken
      if (opsJson.length < 200_000) {
        const msg = `{"t":"patch","playerId":${pid},"base":${c.rev},"rev":${c.rev + 1},"ops":${opsJson}}`;
        c.ws.send(msg);
        c.sent = applyPatch(c.sent, JSON.parse(opsJson));
        c.rev++;
        stats.patches++;
        stats.patchBytes += msg.length;
        return;
      }
    }
    const json = JSON.stringify(view);
    c.rev++;
    const msg = `{"t":"state","playerId":${pid},"rev":${c.rev},"state":${json}}`;
    c.ws.send(msg);
    c.sent = JSON.parse(json);
    stats.full++;
    stats.fullBytes += msg.length;
  }

  function broadcastState(room: Room) {
    room.lastBroadcastRev = room.session.revision;
    for (const c of room.clients) syncClient(room, c);
  }

  function attach(c: Client, room: Room, playerId: string, playerToken: string) {
    c.roomId = room.id;
    c.playerId = playerId;
    room.clients.add(c);
    const p = room.session.state.players[playerId];
    p.online = true;
    room.session.revision++;
    send(c, { t: 'welcome', gameId: room.id, playerId, inviteCode: room.invite, token: playerToken });
    broadcastState(room);
    log('player_joined', { game: room.id, player: playerId, clients: room.clients.size });
  }

  function handleCreate(c: Client, m: Record<string, unknown>) {
    const hq = typeof m.hqCityId === 'string' && CITY_BY_ID[m.hqCityId] ? m.hqCityId : 'leipzig';
    const diff = (['easy', 'normal', 'realistic', 'custom'] as DifficultyId[]).includes(m.difficulty as DifficultyId) ? (m.difficulty as DifficultyId) : 'normal';
    const name = cleanName(m.name, 'Gründer/in');
    const playerId = `pl${randomBytes(5).toString('hex')}`;
    const state = createNewGame(ctx, {
      companyName: cleanName(m.companyName, 'Koop-Spedition'),
      hqCityId: hq,
      difficulty: diff,
      customDifficulty: diff === 'custom' ? sanitizeDifficulty(m.customDifficulty as Partial<Difficulty>) : undefined,
      founder: { id: playerId, name, character: sanitizeCharacter(m.character, name) },
      scenario: isScenarioId(m.scenario) ? m.scenario : undefined,
    });
    const id = `g${randomBytes(6).toString('hex')}`;
    let invite = inviteCode();
    while (q.gameByInvite.get(invite)) invite = inviteCode();
    const now = new Date().toISOString();
    const t = token();
    q.insertGame.run(id, invite, state.company.name, now, now, serializeSave(state, state.company.name));
    q.insertPlayer.run(id, playerId, t);
    const room: Room = { id, invite, session: new GameSession(state, ctx), clients: new Set(), lastBroadcastRev: -1, lastSavedRev: 0, lastBackup: Date.now() };
    rooms.set(id, room);
    log('game_created', { game: id, invite });
    attach(c, room, playerId, t);
  }

  function handleJoin(c: Client, m: Record<string, unknown>) {
    const code = typeof m.code === 'string' ? m.code.trim().toUpperCase() : '';
    const row = q.gameByInvite.get(code) as { id: string } | undefined;
    if (!row) return send(c, { t: 'error', message: 'Einladungscode unbekannt.' });
    const room = loadRoom(row.id)!;
    // Wiederverbindung eines bestehenden Spielers
    if (typeof m.playerId === 'string') {
      const tk = q.playerToken.get(room.id, m.playerId) as { token: string } | undefined;
      if (!tk || tk.token !== m.token || !room.session.state.players[m.playerId]) return send(c, { t: 'error', message: 'Anmeldung als bestehender Spieler fehlgeschlagen.' });
      for (const other of room.clients) if (other.playerId === m.playerId && other !== c) other.ws.close(4000, 'Neu verbunden');
      return attach(c, room, m.playerId, tk.token);
    }
    if (Object.keys(room.session.state.players).length >= maxPlayers) return send(c, { t: 'error', message: 'Die Firma ist voll.' });
    const name = cleanName(m.name, 'Mitspieler/in');
    const playerId = `pl${randomBytes(5).toString('hex')}`;
    const t = token();
    addPlayer(room.session.state, { id: playerId, name, role: 'dispatcher', character: sanitizeCharacter(m.character, name) });
    q.insertPlayer.run(room.id, playerId, t);
    persist(room);
    attach(c, room, playerId, t);
  }

  function handleCommand(c: Client, m: Record<string, unknown>) {
    const room = c.roomId ? rooms.get(c.roomId) : undefined;
    if (!room || !c.playerId) return send(c, { t: 'error', message: 'Nicht mit einer Firma verbunden.' });
    const cmd = m.cmd as Command;
    if (!cmd || typeof cmd !== 'object' || typeof cmd.type !== 'string') return send(c, { t: 'result', id: m.id, result: { ok: false, error: 'Ungültiger Befehl.' } });
    const result = room.session.command(c.playerId, cmd);
    send(c, { t: 'result', id: m.id, result });
    if (result.ok) {
      log('command', { game: room.id, player: c.playerId, type: cmd.type });
      broadcastState(room); // Änderungen sofort an alle Spieler
    }
  }

  // HTTP nur für den Zustandsabruf (Monitoring, Reverse Proxy); alles andere läuft über WebSocket
  const http = createServer((req, res) => {
    if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
      const players = [...rooms.values()].reduce((n, r) => n + r.clients.size, 0);
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: true, name: 'cargovia-server', version: opts.version ?? null, uptimeSec: Math.round((Date.now() - started) / 1000), rooms: rooms.size, players }));
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Cargovia-Multiplayer-Server: Verbindung per WebSocket.');
  });
  const wss = new WebSocketServer({ server: http, maxPayload: 64 * 1024, perMessageDeflate: { threshold: 4096 } });
  // Fehler des HTTP-Servers (z. B. belegter Port) reicht ws weiter; sie werden über `ready` gemeldet
  wss.on('error', (e) => log('ws_error', { error: e.message }));

  wss.on('connection', (ws) => {
    const c: Client = { ws, rev: 0 };
    ws.on('message', (raw) => {
      let m: Record<string, unknown>;
      try {
        m = JSON.parse(String(raw));
      } catch {
        return send(c, { t: 'error', message: 'Ungültige Nachricht.' });
      }
      try {
        if (m.t === 'create' && !c.roomId) handleCreate(c, m);
        else if (m.t === 'join' && !c.roomId) handleJoin(c, m);
        else if (m.t === 'cmd') handleCommand(c, m);
        else if (m.t === 'resync' && c.roomId) {
          // Client hat ein Delta verpasst → Vollzustand
          c.sent = undefined;
          const room = rooms.get(c.roomId);
          if (room) syncClient(room, c);
        }
        else send(c, { t: 'error', message: 'Unbekannter Nachrichtentyp.' });
      } catch (e) {
        log('handler_error', { error: (e as Error).message });
        send(c, { t: 'error', message: 'Serverfehler.' });
      }
    });
    ws.on('close', () => {
      const room = c.roomId ? rooms.get(c.roomId) : undefined;
      if (!room) return;
      room.clients.delete(c);
      const stillOnline = [...room.clients].some((o) => o.playerId === c.playerId);
      if (c.playerId && !stillOnline && room.session.state.players[c.playerId]) room.session.state.players[c.playerId].online = false;
      room.session.revision++;
      log('player_left', { game: room.id, player: c.playerId, clients: room.clients.size });
      if (room.clients.size === 0) {
        persist(room, true);
        rooms.delete(room.id);
        log('room_unloaded', { game: room.id });
      } else broadcastState(room);
    });
  });

  // Simulationsschleife: nur Räume mit verbundenen Spielern laufen
  let last = performance.now();
  const broadcastMs = opts.broadcastMs ?? 250;
  let sinceBroadcast = 0;
  const tick = setInterval(() => {
    const now = performance.now();
    const dt = now - last;
    last = now;
    sinceBroadcast += dt;
    for (const room of rooms.values()) {
      if (room.clients.size === 0) continue;
      room.session.advance(dt);
      if (room.session.fault) {
        log('simulation_fault', { game: room.id, error: room.session.fault.message, stack: room.session.fault.stack, time: room.session.fault.time });
        room.session.fault = null;
      }
    }
    if (sinceBroadcast >= broadcastMs) {
      sinceBroadcast = 0;
      for (const room of rooms.values()) if (room.session.revision !== room.lastBroadcastRev && room.clients.size) broadcastState(room);
    }
  }, 50);

  const saver = setInterval(() => {
    for (const room of rooms.values()) {
      if (room.session.revision === room.lastSavedRev) continue;
      try {
        persist(room, Date.now() - room.lastBackup > backupMs);
      } catch (e) {
        log('save_failed', { game: room.id, error: (e as Error).message });
      }
    }
  }, opts.saveMs ?? 30_000);

  /** erfüllt, sobald der Port gebunden ist; abgelehnt z. B. bei belegtem Port */
  const ready = new Promise<void>((resolveReady, rejectReady) => {
    http.once('error', (e) => {
      clearInterval(tick);
      clearInterval(saver);
      db.close();
      rejectReady(e);
    });
    http.listen(opts.port, opts.host ?? '0.0.0.0', () => {
      log('server_started', { port: opts.port, host: opts.host ?? '0.0.0.0', db: opts.dbPath, version: opts.version });
      resolveReady();
    });
  });

  return {
    port: opts.port,
    ready,
    rooms,
    stats,
    async close() {
      clearInterval(tick);
      clearInterval(saver);
      for (const room of rooms.values()) persist(room, true);
      for (const c of wss.clients) c.terminate();
      await new Promise<void>((r) => wss.close(() => r()));
      http.closeAllConnections();
      await new Promise<void>((r) => http.close(() => r()));
      db.close();
    },
  };
}
