import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { applyPatch, playerView, sameJson, type GameState } from '@spedsim/core';
import { startServer } from '../src/server.ts';
import { ConfigError, DEFAULT_CONFIG, loadConfig } from '../src/config.ts';
import { writeFileSync } from 'node:fs';

const dir = mkdtempSync(join(tmpdir(), 'spedsim-'));
const dbPath = join(dir, 'test.db');
afterAll(() => rmSync(dir, { recursive: true, force: true }));

class TestClient {
  ws: WebSocket;
  state: GameState | null = null;
  welcome: { playerId: string; inviteCode: string; token: string } | null = null;
  errors: string[] = [];
  private seq = 0;
  private pending = new Map<number, (r: { ok: boolean; error?: string }) => void>();
  private waiters: (() => void)[] = [];
  bytes = 0;
  rev = 0;
  patches = 0;

  constructor(port: number, hello: Record<string, unknown>) {
    this.ws = new WebSocket(`ws://localhost:${port}`);
    this.ws.on('open', () => this.ws.send(JSON.stringify(hello)));
    this.ws.on('message', (raw) => {
      this.bytes += String(raw).length;
      const m = JSON.parse(String(raw));
      if (m.t === 'welcome') this.welcome = m;
      if (m.t === 'state') {
        this.state = m.state;
        this.rev = m.rev;
      }
      if (m.t === 'patch') {
        // Delta muss genau auf den vorherigen Stand passen
        expect(m.base).toBe(this.rev);
        this.state = applyPatch(this.state!, m.ops);
        this.rev = m.rev;
        this.patches++;
      }
      if (m.t === 'error') this.errors.push(m.message);
      if (m.t === 'result') {
        this.pending.get(m.id)?.(m.result);
        this.pending.delete(m.id);
      }
      for (const w of this.waiters.splice(0)) w();
    });
  }

  async until(cond: () => boolean, ms = 5000) {
    const end = Date.now() + ms;
    while (!cond()) {
      if (Date.now() > end) throw new Error('Timeout');
      await new Promise<void>((r) => {
        this.waiters.push(r);
        setTimeout(r, 50);
      });
    }
  }

  cmd(cmd: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
    const id = ++this.seq;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.ws.send(JSON.stringify({ t: 'cmd', id, cmd }));
    });
  }

  close() {
    this.ws.close();
  }
}

describe('Multiplayertest', () => {
  it('zwei Spieler greifen auf dieselbe Spedition zu, sehen konsistente Daten und Konflikte werden serverseitig verhindert', async () => {
    let server = startServer({ port: 18787, dbPath, log: () => {}, broadcastMs: 100 });
    await server.ready;
    const a = new TestClient(18787, { t: 'create', companyName: 'Koop GmbH', hqCityId: 'prag', difficulty: 'easy', name: 'Anna' });
    await a.until(() => !!a.welcome && !!a.state);
    expect(a.state!.company.name).toBe('Koop GmbH');
    const code = a.welcome!.inviteCode;

    const b = new TestClient(18787, { t: 'join', code, name: 'Ben' });
    await b.until(() => !!b.welcome && !!b.state && Object.keys(b.state.players).length === 2);
    await a.until(() => Object.keys(a.state!.players).length === 2);
    const bId = b.welcome!.playerId;

    // Spieler A kauft einen LKW → Spieler B sieht ihn sofort
    const before = Object.keys(a.state!.vehicles).length;
    expect((await a.cmd({ type: 'buyNewVehicle', modelId: 'velkor-s460', financing: 'lease' })).ok).toBe(true);
    await b.until(() => Object.keys(b.state!.vehicles).length === before + 1);

    // B hat standardmäßig keine Kaufrechte
    const denied = await b.cmd({ type: 'buyNewVehicle', modelId: 'velkor-s460', financing: 'lease' });
    expect(denied.ok).toBe(false);
    expect(denied.error).toMatch(/Berechtigung/);

    // Beide disponieren gleichzeitig denselben LKW für verschiedene Aufträge → genau einer gewinnt
    const s = a.state!;
    const v = Object.values(s.vehicles)[0];
    const d = Object.values(s.drivers)[0];
    const t = Object.values(s.trailers)[0];
    const orders = Object.values(s.orders).filter((o) => o.status === 'offered' && o.trailerType === t.type && o.qualifications.length === 0).slice(0, 2);
    expect(orders.length).toBe(2);
    const [r1, r2] = await Promise.all([
      a.cmd({ type: 'dispatch', orderId: orders[0].id, driverId: d.id, vehicleId: v.id, trailerId: t.id }),
      b.cmd({ type: 'dispatch', orderId: orders[1].id, driverId: d.id, vehicleId: v.id, trailerId: t.id }),
    ]);
    expect([r1.ok, r2.ok].filter(Boolean).length).toBe(1);
    await b.until(() => Object.values(b.state!.trips).length === 1);
    await a.until(() => Object.values(a.state!.trips).length === 1);

    // Gemeinsame Spielzeit: nur der Gründer darf die Zeit steuern; beide sehen dieselbe Zeit
    expect((await b.cmd({ type: 'setPaused', paused: false })).ok).toBe(false);
    expect((await a.cmd({ type: 'setSpeed', speed: 60 })).ok).toBe(true);
    expect((await a.cmd({ type: 'setPaused', paused: false })).ok).toBe(true);
    const t0 = a.state!.time;
    await a.until(() => a.state!.time > t0 + 30);
    await b.until(() => b.state!.time >= a.state!.time - 60);

    // Chat
    expect((await b.cmd({ type: 'chat', text: 'Hallo Team!' })).ok).toBe(true);
    await a.until(() => a.state!.chat.some((m) => m.text === 'Hallo Team!' && m.playerId === bId));

    // Gründer vergibt Rechte → B darf kaufen
    expect((await a.cmd({ type: 'setPermissions', playerId: bId, permissions: ['dispatch', 'fleet', 'purchase'] })).ok).toBe(true);
    expect((await b.cmd({ type: 'buyTrailer', trailerType: 'box', financing: 'lease' })).ok).toBe(true);

    // Wiederverbindung von B mit Token → derselbe Spieler
    const bToken = b.welcome!.token;
    b.close();
    await a.until(() => a.state!.players[bId].online === false);
    const b2 = new TestClient(18787, { t: 'join', code, playerId: bId, token: bToken });
    await b2.until(() => !!b2.welcome && !!b2.state);
    expect(b2.welcome!.playerId).toBe(bId);
    expect(Object.keys(b2.state!.players).length).toBe(2);
    // falsches Token wird abgelehnt
    const evil = new TestClient(18787, { t: 'join', code, playerId: bId, token: 'falsch' });
    await evil.until(() => evil.errors.length > 0);
    evil.close();

    // Interne Nachricht und Aufgabe an B
    expect((await a.cmd({ type: 'sendMessage', to: [bId], subject: 'Tour Prag', text: 'Bitte den Kühl-Auftrag übernehmen.' })).ok).toBe(true);
    expect((await a.cmd({ type: 'createTask', title: 'Kühlauftrag disponieren', area: 'dispatch', assignee: bId })).ok).toBe(true);
    await b2.until(() => b2.state!.team.messages.some((m) => m.subject === 'Tour Prag') && b2.state!.team.tasks.length === 1);

    // Delta-Synchronisation: nach Pause stimmt der Client-Zustand exakt mit dem Server überein
    expect((await a.cmd({ type: 'setPaused', paused: true })).ok).toBe(true);
    await new Promise((r) => setTimeout(r, 400));
    const room = [...server.rooms.values()][0];
    expect(sameJson(b2.state, JSON.parse(JSON.stringify(playerView(room.session.state, bId))))).toBe(true);
    expect(sameJson(a.state, JSON.parse(JSON.stringify(playerView(room.session.state, a.welcome!.playerId))))).toBe(true);
    expect(a.patches).toBeGreaterThan(5);
    const st = server.stats;
    console.log(`Synchronisation: ${st.full} Vollzustände Ø ${Math.round(st.fullBytes / st.full / 1024)} KB, ${st.patches} Deltas Ø ${Math.round(st.patchBytes / st.patches / 1024 * 10) / 10} KB`);
    expect(st.patchBytes / st.patches).toBeLessThan(st.fullBytes / st.full / 5);

    // Persistenz: Server neu starten → Spielstand und Fahrzeugposition bleiben erhalten
    const tripBefore = Object.values(a.state!.trips)[0];
    a.close();
    b2.close();
    await new Promise((r) => setTimeout(r, 200));
    await server.close();
    server = startServer({ port: 18788, dbPath, log: () => {} });
    await server.ready;
    const a2 = new TestClient(18788, { t: 'join', code, playerId: a.welcome!.playerId, token: a.welcome!.token });
    await a2.until(() => !!a2.state);
    const tripAfter = a2.state!.trips[tripBefore.id];
    expect(tripAfter).toBeDefined();
    expect(tripAfter.progressKm).toBeGreaterThanOrEqual(tripBefore.progressKm);
    expect(a2.state!.chat.some((m) => m.text === 'Hallo Team!')).toBe(true);
    console.log(`Zustandsgröße pro Schnappschuss: ${Math.round(JSON.stringify(a2.state).length / 1024)} KB`);
    a2.close();
    await new Promise((r) => setTimeout(r, 100));
    await server.close();
  });
});

describe('Server-Konfiguration', () => {
  it('Standardwerte, Konfigurationsdatei, Umgebung und Kommandozeile in dieser Rangfolge', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'cargovia-cfg-'));
    try {
      const def = loadConfig([], {}, cwd);
      expect(def.port).toBe(DEFAULT_CONFIG.port);
      expect(def.host).toBe('0.0.0.0');
      expect(def.db).toBe(join(cwd, 'apps/server/data/spedsim.db'));

      // cargovia-server.json im Arbeitsverzeichnis wird automatisch gelesen; relative db zum Ordner der Datei
      writeFileSync(join(cwd, 'cargovia-server.json'), JSON.stringify({ $comment: 'Test', port: 9000, db: 'daten/firmen.db', maxPlayers: 4, backupsKeep: 3 }));
      const file = loadConfig([], {}, cwd);
      expect(file).toMatchObject({ port: 9000, maxPlayers: 4, backupsKeep: 3, db: join(cwd, 'daten/firmen.db') });

      // Umgebung schlägt Datei, Kommandozeile schlägt Umgebung
      expect(loadConfig([], { CARGOVIA_PORT: '9100', PORT: '1' }, cwd).port).toBe(9100);
      expect(loadConfig([], { PORT: '9200' }, cwd).port).toBe(9200);
      expect(loadConfig(['--port', '9300', '--host', '127.0.0.1'], { CARGOVIA_PORT: '9100' }, cwd)).toMatchObject({ port: 9300, host: '127.0.0.1', maxPlayers: 4 });

      // ausdrückliche Datei
      writeFileSync(join(cwd, 'andere.json'), JSON.stringify({ saveSeconds: 60 }));
      expect(loadConfig(['--config', 'andere.json'], {}, cwd)).toMatchObject({ saveSeconds: 60, port: 8787 });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('ungültige Werte werden mit verständlicher Meldung abgelehnt', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'cargovia-cfg-'));
    try {
      expect(() => loadConfig(['--port', '70000'], {}, cwd)).toThrow(/1 bis 65535/);
      expect(() => loadConfig(['--port'], {}, cwd)).toThrow(ConfigError);
      expect(() => loadConfig(['--max-players', '20'], {}, cwd)).toThrow(/max/);
      expect(() => loadConfig([], { CARGOVIA_SAVE_SECONDS: 'oft' }, cwd)).toThrow(/CARGOVIA_SAVE_SECONDS/);
      expect(() => loadConfig(['--config', 'fehlt.json'], {}, cwd)).toThrow(/nicht lesbar/);
      writeFileSync(join(cwd, 'cargovia-server.json'), JSON.stringify({ prot: 1 }));
      expect(() => loadConfig([], {}, cwd)).toThrow(/unbekannte Einstellung „prot“/);
      writeFileSync(join(cwd, 'cargovia-server.json'), '{ kaputt');
      expect(() => loadConfig([], {}, cwd)).toThrow(/nicht lesbar/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe('Server-Betrieb', () => {
  it('Health-Endpunkt, belegter Port, Spielerlimit und drei konsistente Clients', async () => {
    const db = join(dir, 'betrieb.db');
    const server = startServer({ port: 18790, dbPath: db, log: () => {}, broadcastMs: 100, maxPlayers: 3, version: '9.9.9' });
    await server.ready;

    // zweiter Server auf demselben Port: Start schlägt sauber fehl statt abzustürzen
    const clash = startServer({ port: 18790, dbPath: join(dir, 'clash.db'), log: () => {} });
    await expect(clash.ready).rejects.toMatchObject({ code: 'EADDRINUSE' });

    const health = await (await fetch('http://127.0.0.1:18790/health')).json();
    expect(health).toMatchObject({ ok: true, name: 'cargovia-server', version: '9.9.9', rooms: 0, players: 0 });

    const a = new TestClient(18790, { t: 'create', companyName: 'Drei Freunde', hqCityId: 'wien', difficulty: 'normal', name: 'Ada' });
    await a.until(() => !!a.welcome && !!a.state);
    const code = a.welcome!.inviteCode;
    const b = new TestClient(18790, { t: 'join', code, name: 'Bo' });
    const c = new TestClient(18790, { t: 'join', code, name: 'Cem' });
    await b.until(() => !!b.state && Object.keys(b.state.players).length === 3);
    await c.until(() => !!c.state && Object.keys(c.state.players).length === 3);
    const d = new TestClient(18790, { t: 'join', code, name: 'Dora' });
    await d.until(() => d.errors.length > 0);
    expect(d.errors[0]).toMatch(/voll/);
    d.close();

    expect((await fetch('http://127.0.0.1:18790/health').then((r) => r.json())).players).toBe(3);

    // Zeit laufen lassen, alle drei Clients müssen dieselbe Sicht wie der Server haben
    expect((await a.cmd({ type: 'setSpeed', speed: 60 })).ok).toBe(true);
    expect((await a.cmd({ type: 'setPaused', paused: false })).ok).toBe(true);
    await new Promise((r) => setTimeout(r, 1500));
    expect((await a.cmd({ type: 'setPaused', paused: true })).ok).toBe(true);
    await new Promise((r) => setTimeout(r, 400));
    const room = [...server.rooms.values()][0];
    expect(room.session.state.time).toBeGreaterThan(a.state!.company.founded);
    for (const cl of [a, b, c]) expect(sameJson(cl.state, JSON.parse(JSON.stringify(playerView(room.session.state, cl.welcome!.playerId))))).toBe(true);

    a.close();
    b.close();
    c.close();
    await new Promise((r) => setTimeout(r, 150));
    await server.close();
  });
});
