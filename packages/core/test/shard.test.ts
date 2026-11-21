import { describe, expect, it } from 'vitest';
import {
  COMPANY_KEYS, MAIN_COMPANY, WORLD_KEYS, addPlayer, applyCommand, companyIdOf, companyView, deserializeSave, flatten, isCompanyView, serializeSave, splitState,
  applyPatch, diffState, playerView, tickMinutes, worldOf,
} from '../src/index.ts';
import { ctx, first, newGame } from './helpers.ts';

const text = (s: Parameters<typeof serializeSave>[0]) => serializeSave(s, 'x').replace(/"savedAt":"[^"]*"/, '');

describe('Welt und Firmen-Shards (Paket D, Schritt D1)', () => {
  it('neue und geladene Spiele sind Firmenansichten auf eine Welt mit einer Firma', () => {
    const s = newGame();
    expect(isCompanyView(s)).toBe(true);
    expect(companyIdOf(s)).toBe(MAIN_COMPANY);
    const w = worldOf(s);
    expect(w.companyOrder).toEqual([MAIN_COMPANY]);
    expect(w.companies[MAIN_COMPANY].company).toBe(s.company);
    expect(w.market).toBe(s.market);
    const loaded = deserializeSave(serializeSave(s, 'x'));
    expect(isCompanyView(loaded)).toBe(true);
    expect(text(loaded)).toBe(text(s));
  });

  it('Welt- und Firmenfelder sind getrennt und vollständig', () => {
    const s = newGame();
    const w = worldOf(s);
    const shard = w.companies[MAIN_COMPANY] as unknown as Record<string, unknown>;
    for (const k of WORLD_KEYS) expect(k in shard).toBe(false);
    for (const k of COMPANY_KEYS) expect(k in (w as unknown as Record<string, unknown>)).toBe(false);
    // Schreiben über die Ansicht landet an der richtigen Stelle
    s.time += 60;
    expect(w.time).toBe(s.time);
    s.ledger = [];
    expect(w.companies[MAIN_COMPANY].ledger).toBe(s.ledger);
    s.exit = undefined;
    expect('exit' in shard).toBe(false);
  });

  it('Vergleichslauf: Ansicht und flacher Zustand simulieren identisch', () => {
    const view = newGame(5);
    const flat = flatten(newGame(5));
    expect(isCompanyView(flat)).toBe(false);
    tickMinutes(view, ctx, 10 * 1440);
    tickMinutes(flat, ctx, 10 * 1440);
    expect(text(view)).toBe(text(flat));
  });

  it('structuredClone und Rücknahme (Ausgabenlimit) halten die Ansicht mit der Welt verbunden', () => {
    const s = newGame();
    const copy = structuredClone(s);
    expect(copy.company.name).toBe(s.company.name);
    addPlayer(s, { id: 'p2', name: 'Kim' });
    expect(applyCommand(s, ctx, 'p1', { type: 'setPlayerLimits', playerId: 'p2', spendLimit: 1_000_00, locationIds: [] }).ok).toBe(true);
    const before = s.company.account.balance;
    const offer = first(s.vehicleOffers);
    s.players.p2.permissions.push('purchase');
    expect(applyCommand(s, ctx, 'p2', { type: 'buyUsedVehicle', offerId: offer.id }).ok).toBe(false);
    expect(s.company.account.balance).toBe(before);
    const w = worldOf(s);
    expect(w.companies[MAIN_COMPANY].company).toBe(s.company);
    expect(w.vehicleOffers).toBe(s.vehicleOffers);
  });

  it('Delta-Synchronisation (Server) funktioniert auf der Ansicht', () => {
    const s = newGame();
    // wie über das Netz: der Client bekommt eine Kopie, keine geteilten Objekte
    let client = applyPatch({}, structuredClone(diffState({}, playerView(s, 'p1'))));
    expect(JSON.stringify(client)).toBe(JSON.stringify(flatten(s)));
    const sent = structuredClone(playerView(s, 'p1'));
    tickMinutes(s, ctx, 6 * 60);
    client = applyPatch(client, diffState(sent, playerView(s, 'p1')));
    expect(JSON.stringify(client)).toBe(JSON.stringify(flatten(s)));
  });

  it('splitState teilt ohne Kopie, companyView verbindet mehrere Firmen mit derselben Welt', () => {
    const flat = flatten(newGame());
    const w = splitState(flat);
    w.companies.c2 = structuredClone(w.companies[MAIN_COMPANY]);
    w.companyOrder.push('c2');
    const a = companyView(w, MAIN_COMPANY);
    const b = companyView(w, 'c2');
    expect(a.market).toBe(b.market);
    expect(a.company).not.toBe(b.company);
    a.time += 1;
    expect(b.time).toBe(a.time);
    b.company.name = 'Zweite Spedition';
    expect(a.company.name).not.toBe('Zweite Spedition');
  });
});
