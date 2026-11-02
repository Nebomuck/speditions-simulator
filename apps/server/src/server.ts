// MultiplayerServer: serverautoritativer Spielserver für kooperative Speditionen.
//
// - Jede Multiplayer-Firma ist ein "Room" mit genau einer GameSession (gemeinsame Simulationslogik aus @spedsim/core).
// - Nur der Server simuliert. Clients senden Befehle und erhalten Zustandsschnappschüsse.
// - Befehle werden strikt nacheinander ausgeführt → keine Doppelbelegungen oder widersprüchlichen Aktionen.
// - Persistenz: SQLite (node:sqlite) mit versionierten, prüfsummengeschützten Spielständen + rotierenden Backups.
// - Spielzeit läuft nur, solange mindestens ein Spieler verbunden ist; danach wird gespeichert und pausiert.

import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { WebSocketServer, type WebSocket } from 'ws';
import roadnet from '@spedsim/core/roadnet.json' with { type: 'json' };
import {
  GameSession, addPlayer, createNewGame, createSimContext, deserializeSave, serializeSave, CITY_BY_ID,
  type Character, type Command, type DifficultyId, type RoadNetData,
} from '@spedsim/core';

export interface ServerOptions {
  port: number;
  dbPath: string;
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
const MAX_PLAYERS = 8;

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
  const av = (o.avatar && typeof o.avatar === 'object' ? o.avatar : {}) as Record<string, unknown>;
  const n = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.round(v))) : 0);
  return {
    name,
    age: typeof o.age === 'number' ? Math.max(18, Math.min(80, Math.round(o.age))) : 32,
    avatar: { skin: n(av.skin, 10), hair: n(av.hair, 10), hairColor: n(av.hairColor, 10), shirt: n(av.shirt, 10) },
  };
}

const cleanName = (v: unknown, fallback: string) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 40) : fallback);

export function startServer(opts: ServerOptions) {
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
    pruneBackups: db.prepare('DELETE FROM backups WHERE game_id = ? AND id NOT IN (SELECT id FROM backups WHERE game_id = ? ORDER BY id DESC LIMIT 10)'),
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
        q.pruneBackups.run(room.id, room.id);
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

  function broadcastState(room: Room) {
    room.lastBroadcastRev = room.session.revision;
    const stateJson = JSON.stringify(room.session.state);
    for (const c of room.clients) {
      if (c.ws.readyState === c.ws.OPEN) c.ws.send(`{"t":"state","playerId":${JSON.stringify(c.playerId)},"state":${stateJson}}`);
    }
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
    const diff = (['easy', 'normal', 'realistic'] as DifficultyId[]).includes(m.difficulty as DifficultyId) ? (m.difficulty as DifficultyId) : 'normal';
    const name = cleanName(m.name, 'Gründer/in');
    const playerId = `pl${randomBytes(5).toString('hex')}`;
    const state = createNewGame(ctx, {
      companyName: cleanName(m.companyName, 'Koop-Spedition'),
      hqCityId: hq,
      difficulty: diff,
      founder: { id: playerId, name, character: sanitizeCharacter(m.character, name) },
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
    if (Object.keys(room.session.state.players).length >= MAX_PLAYERS) return send(c, { t: 'error', message: 'Die Firma ist voll.' });
    const name = cleanName(m.name, 'Mitspieler/in');
    const playerId = `pl${randomBytes(5).toString('hex')}`;
    const t = token();
    addPlayer(room.session.state, { id: playerId, name, permissions: ['dispatch', 'fleet'], character: sanitizeCharacter(m.character, name) });
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

  const wss = new WebSocketServer({ port: opts.port, maxPayload: 64 * 1024, perMessageDeflate: { threshold: 4096 } });

  wss.on('connection', (ws) => {
    const c: Client = { ws };
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
        persist(room, Date.now() - room.lastBackup > 10 * 60_000);
      } catch (e) {
        log('save_failed', { game: room.id, error: (e as Error).message });
      }
    }
  }, opts.saveMs ?? 30_000);

  log('server_started', { port: opts.port, db: opts.dbPath });

  return {
    port: opts.port,
    rooms,
    async close() {
      clearInterval(tick);
      clearInterval(saver);
      for (const room of rooms.values()) persist(room, true);
      for (const c of wss.clients) c.terminate();
      await new Promise<void>((r) => wss.close(() => r()));
      db.close();
    },
  };
}
