import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import type { GameState } from '@spedsim/core';
import { startServer } from '../src/server.ts';

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

  constructor(port: number, hello: Record<string, unknown>) {
    this.ws = new WebSocket(`ws://localhost:${port}`);
    this.ws.on('open', () => this.ws.send(JSON.stringify(hello)));
    this.ws.on('message', (raw) => {
      this.bytes += String(raw).length;
      const m = JSON.parse(String(raw));
      if (m.t === 'welcome') this.welcome = m;
      if (m.t === 'state') this.state = m.state;
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

    // Persistenz: Server neu starten → Spielstand und Fahrzeugposition bleiben erhalten
    const tripBefore = Object.values(a.state!.trips)[0];
    a.close();
    b2.close();
    await new Promise((r) => setTimeout(r, 200));
    await server.close();
    server = startServer({ port: 18788, dbPath, log: () => {} });
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
