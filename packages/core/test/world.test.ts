import { describe, expect, it } from 'vitest';
import { MAIN_COMPANY, addCompany, applyCommand, companyView, companyViews, tickWorld, worldOf, type GameState } from '../src/index.ts';
import { addOrder, ctx, first, newGame, runUntil } from './helpers.ts';

/** Welt mit zwei Firmen: „Test Logistik“ in Leipzig (c1) und „Zweite Spedition“ in Hamburg (c2) */
function twoCompanies() {
  const a = newGame(21);
  const world = worldOf(a);
  const id = addCompany(world, ctx, { companyName: 'Zweite Spedition', hqCityId: 'hamburg', founder: { id: 'p2', name: 'Kim Zweit' } });
  const b = companyView(world, id);
  return { world, a, b, id };
}

const ids = (s: GameState) =>
  [...Object.keys(s.vehicles), ...Object.keys(s.drivers), ...Object.keys(s.trailers), ...Object.keys(s.applicants), ...s.company.locations.map((l) => l.id)];

describe('Welt mit mehreren Firmen (Paket D, Schritt D2)', () => {
  it('eine zweite Firma teilt Zeit, Markt und Wetter, hat aber eigene Firma, Fuhrpark und Konto', () => {
    const { world, a, b, id } = twoCompanies();
    expect(id).toBe('c2');
    expect(world.companyOrder).toEqual([MAIN_COMPANY, 'c2']);
    expect(b.company.name).toBe('Zweite Spedition');
    expect(b.company.hqCityId).toBe('hamburg');
    expect(b.players.p2?.isFounder).toBe(true);
    expect(b.market).toBe(a.market);
    expect(b.weather).toBe(a.weather);
    expect(b.time).toBe(a.time);
    expect(b.vehicles).not.toBe(a.vehicles);
    expect(b.company.account).not.toBe(a.company.account);
    // IDs sind weltweit eindeutig (gemeinsamer Zähler)
    const both = [...ids(a), ...ids(b)];
    expect(new Set(both).size).toBe(both.length);
  });

  it('tickWorld: die Zeit läuft einmal je Minute, beide Firmen werden täglich abgerechnet', () => {
    const { world, a, b } = twoCompanies();
    const t0 = world.time;
    for (let i = 0; i < 3 * 1440; i++) tickWorld(world, ctx);
    expect(world.time).toBe(t0 + 3 * 1440);
    expect(a.stats.length).toBe(3);
    expect(b.stats.length).toBe(3);
    expect(Object.keys(b.applicants).length).toBeGreaterThanOrEqual(6);
    // tickMinute über eine Ansicht simuliert die ganze Welt
    const t1 = world.time;
    expect(companyViews(world)).toHaveLength(2);
    for (let i = 0; i < 60; i++) tickWorld(world, ctx);
    expect(b.time).toBe(t1 + 60);
  });

  it('Fahrten und Buchungen bleiben in der eigenen Firma', async () => {
    const { world, a, b } = twoCompanies();
    const o = addOrder(b, 'hamburg', 'bremen');
    const v = first(b.vehicles);
    const r = applyCommand(b, ctx, 'p2', { type: 'dispatch', orderId: o.id, driverId: first(b.drivers).id, vehicleId: v.id, trailerId: first(b.trailers).id });
    expect(r.ok).toBe(true);
    expect(Object.keys(a.trips)).toHaveLength(0);
    const ledgerA = a.ledger.length;
    // runUntil tickt über die Ansicht – also die ganze Welt
    await runUntil(b, () => o.status === 'delivered', 2 * 1440);
    expect(o.status).toBe('delivered');
    expect(b.company.totals.deliveries).toBe(1);
    expect(a.company.totals.deliveries).toBe(0);
    expect(b.invoices[Object.keys(b.invoices)[0]]?.orderId).toBe(o.id);
    expect(a.ledger.slice(ledgerA).some((l) => l.text.includes('Bremen'))).toBe(false);
    expect(world.time).toBe(a.time);
  });

  it('Spieler handeln nur in ihrer Firma', () => {
    const { b } = twoCompanies();
    // p1 gehört zur ersten Firma und ist in der zweiten unbekannt
    const r = applyCommand(b, ctx, 'p1', { type: 'setPaused', paused: false });
    expect(r.ok).toBe(false);
  });

  it('verkaufte Firmen ruhen, die Welt läuft für die anderen weiter', () => {
    const { world, a, b } = twoCompanies();
    a.exit = { t: a.time, price: 0, assets: 0, goodwill: 0, debts: 0 } as never;
    const statsA = a.stats.length;
    for (let i = 0; i < 1440; i++) tickWorld(world, ctx);
    expect(a.stats.length).toBe(statsA);
    expect(b.stats.length).toBe(1);
  });
});
