import { describe, expect, it } from 'vitest';
import {
  GameSession, addCompany, companyIdOf, companyView, deserializeSave, generateOrder, isMultiCompany, liveryOf, pausesOnDecision, playerView, serializeSave, tickWorld, worldOf,
  type GameState,
} from '../src/index.ts';
import { ctx, newGame } from './helpers.ts';

/** Welt mit zwei Firmen: Gründer p1 (c1, Leipzig) und k2 (c2, Hamburg) */
function arena(seed = 41) {
  const a = newGame(seed);
  const world = worldOf(a);
  const id = addCompany(world, ctx, { companyName: 'Hanse Fracht', hqCityId: 'hamburg', founder: { id: 'k2', name: 'Kim Zweit' } });
  return { world, a, b: companyView(world, id) };
}

function offer(s: GameState) {
  for (let i = 0; i < 50; i++) {
    const o = generateOrder(s, ctx);
    if (o) return o;
  }
  throw new Error('kein Angebot');
}

describe('Wettbewerbswelt: Spielersicht, Abstimmung, Weltchat, Speicherformat (Paket D, Schritt D4)', () => {
  it('jeder Spieler sieht seine Firma, die Börse mit eigenem Preis und Mitbewerber nur als Zusammenfassung', () => {
    const { a, b } = arena();
    const o = offer(a);
    const vb = playerView(a, 'k2', ctx);
    expect(vb.company.name).toBe('Hanse Fracht');
    expect(vb.orders[o.id].payment).toBe(o.quotes!.c2);
    expect(vb.orders[o.id].quotes).toBeUndefined();
    expect(vb.arena?.companyId).toBe('c2');
    expect(vb.arena?.rivals.map((r) => r.name)).toEqual(['Test Logistik']);
    expect(vb.arena?.rivals[0].vehicles.length).toBe(Object.keys(a.vehicles).length);
    expect(vb.arena?.rivals[0].livery.primary).not.toBe(liveryOf(b).primary);
    expect(JSON.parse(JSON.stringify(vb)).arena.activeCompanies).toBe(2);
    // nach Übernahme durch A verschwindet der Auftrag aus Bs Sicht
    new GameSession(a, ctx).command('p1', { type: 'acceptOrder', orderId: o.id });
    expect(o.companyId).toBe('c1');
    expect(playerView(a, 'k2', ctx).orders[o.id]).toBeUndefined();
    expect(playerView(b, 'p1', ctx).orders[o.id]).toBeDefined();
  });

  it('die Sitzung führt Befehle für die Firma des Spielers aus', () => {
    const { a, b } = arena();
    const session = new GameSession(a, ctx);
    const o = offer(a);
    expect(session.command('k2', { type: 'acceptOrder', orderId: o.id }).ok).toBe(true);
    expect(o.companyId).toBe(companyIdOf(b));
    expect(session.command('p1', { type: 'acceptOrder', orderId: o.id }).ok).toBe(false);
  });

  it('Pause und Tempo ändern sich nur mit Mehrheit der Firmen', () => {
    const { a, b } = arena();
    a.paused = false;
    const s = new GameSession(a, ctx);
    expect(s.command('p1', { type: 'setPaused', paused: true }).ok).toBe(true);
    expect(a.paused).toBe(false);
    expect(b.timeVote?.by).toEqual(['c1']);
    expect(s.command('k2', { type: 'setPaused', paused: true }).ok).toBe(true);
    expect(a.paused).toBe(true);
    expect(a.timeVote).toBeUndefined();
    // anderer Vorschlag ersetzt den laufenden, Ablehnung beendet ihn
    s.command('p1', { type: 'setSpeed', speed: 60 });
    expect(a.timeVote?.speed).toBe(60);
    expect(s.command('k2', { type: 'rejectTimeVote' }).ok).toBe(true);
    expect(a.timeVote).toBeUndefined();
    expect(a.speed).not.toBe(60);
    // Entscheidungskarten halten die gemeinsame Welt nicht an
    expect(pausesOnDecision(a)).toBe(false);
  });

  it('Weltchat: alle Firmen lesen mit, mit Name und Firma des Absenders', () => {
    const { a, b } = arena();
    const s = new GameSession(a, ctx);
    expect(s.command('k2', { type: 'worldChat', text: 'Moin aus Hamburg' }).ok).toBe(true);
    expect(a.worldChat?.[0]).toMatchObject({ name: 'Kim Zweit', company: 'Hanse Fracht', companyId: 'c2', text: 'Moin aus Hamburg' });
    expect(b.worldChat).toBe(a.worldChat);
    // im Einzelspiel gibt es keinen Weltchat
    const solo = newGame(5);
    expect(new GameSession(solo, ctx).command('p1', { type: 'worldChat', text: 'Hallo' }).ok).toBe(false);
  });

  it('Spielstand einer Welt mit mehreren Firmen: speichern, laden, weiterspielen', () => {
    const { world, a } = arena();
    const o = offer(a);
    new GameSession(a, ctx).command('k2', { type: 'acceptOrder', orderId: o.id });
    for (let i = 0; i < 120; i++) tickWorld(world, ctx);
    const text = serializeSave(a, 'Wettbewerb');
    const loaded = deserializeSave(text);
    expect(isMultiCompany(loaded)).toBe(true);
    const lw = worldOf(loaded);
    expect(lw.companyOrder).toEqual(['c1', 'c2']);
    expect(lw.orders[o.id].companyId).toBe('c2');
    expect(lw.companies.c2.company.name).toBe('Hanse Fracht');
    expect(lw.time).toBe(world.time);
    for (let i = 0; i < 1440; i++) tickWorld(lw, ctx);
    expect(lw.companies.c2.stats.length).toBeGreaterThan(0);
    // Einzelspiel bleibt flach
    expect(JSON.parse(serializeSave(newGame(3), 'x')).state.companies).toBeUndefined();
  });
});
