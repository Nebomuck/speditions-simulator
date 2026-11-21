import { describe, expect, it } from 'vitest';
import {
  addCompany, applyCommand, companyIdOf, companyView, generateOrder, offerPayment, orderVisible, tickWorld, worldOf, type GameState,
} from '../src/index.ts';
import { createBot } from './bot.ts';
import { ctx, first, newGame } from './helpers.ts';

/** Welt mit zwei Firmen; beide Gründer heißen p1 (Spieler gehören zu ihrer Firma) */
function twoCompanies(seed = 31) {
  const a = newGame(seed);
  const world = worldOf(a);
  const id = addCompany(world, ctx, { companyName: 'Zweite Spedition', hqCityId: 'leipzig', founder: { id: 'p1', name: 'Kim Zweit' } });
  return { world, a, b: companyView(world, id) };
}

/** neues Börsenangebot erzeugen (über die erste Firma, wie in der Simulation) */
function freshOffer(a: GameState) {
  for (let i = 0; i < 50; i++) {
    const o = generateOrder(a, ctx);
    if (o) return o;
  }
  throw new Error('kein Angebot');
}

describe('Gemeinsame Börse und Kunden (Paket D, Schritt D3)', () => {
  it('Kunden haben gemeinsame Stammdaten, aber eine eigene Beziehung je Firma', () => {
    const { a, b } = twoCompanies();
    expect(Object.keys(b.customers).sort()).toEqual(Object.keys(a.customers).sort());
    const o = freshOffer(a);
    const ca = a.customers[o.customerId];
    const cb = b.customers[o.customerId];
    expect(cb).toBeDefined();
    expect(cb).not.toBe(ca);
    expect(cb.name).toBe(ca.name);
    ca.satisfaction = 90;
    expect(cb.satisfaction).toBe(50);
  });

  it('jede Firma bekommt ihren eigenen Preis: Stammkunden zahlen besser', () => {
    const { a, b } = twoCompanies();
    const probe = freshOffer(a);
    const cid = probe.customerId;
    b.customers[cid].satisfaction = 100;
    b.customers[cid].deliveries = 20;
    let found = 0;
    for (let i = 0; i < 3000 && found < 3; i++) {
      const o = generateOrder(a, ctx);
      if (!o || o.customerId !== cid) continue;
      found++;
      expect(o.quotes).toBeDefined();
      expect(offerPayment(a, o)).toBe(o.quotes![companyIdOf(a)]);
      expect(offerPayment(b, o)).toBeGreaterThan(offerPayment(a, o));
    }
    expect(found).toBeGreaterThan(0);
  });

  it('wer zuerst annimmt, bekommt den Auftrag – zum eigenen Preis', () => {
    const { a, b } = twoCompanies();
    const o = freshOffer(a);
    const priceB = offerPayment(b, o);
    expect(orderVisible(a, o) && orderVisible(b, o)).toBe(true);
    expect(applyCommand(b, ctx, 'p1', { type: 'acceptOrder', orderId: o.id }).ok).toBe(true);
    expect(o.companyId).toBe(companyIdOf(b));
    expect(o.payment).toBe(priceB);
    expect(o.quotes).toBeUndefined();
    expect(orderVisible(a, o)).toBe(false);
    const r = applyCommand(a, ctx, 'p1', { type: 'acceptOrder', orderId: o.id });
    expect(r.ok).toBe(false);
    const d = applyCommand(a, ctx, 'p1', { type: 'dispatch', orderId: o.id, driverId: first(a.drivers).id, vehicleId: first(a.vehicles).id, trailerId: first(a.trailers).id });
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.error).toMatch(/anderen Spedition/);
  });

  it('zwei Bots konkurrieren 30 Tage um dieselbe Börse, ohne sich Aufträge zu teilen', () => {
    const { world, a, b } = twoCompanies(7);
    const bots = [createBot(a), createBot(b)];
    for (let day = 0; day < 30; day++) {
      for (let h = 0; h < 24; h++) {
        for (let m = 0; m < 60; m++) tickWorld(world, ctx);
        for (const bot of bots) bot.tend();
      }
      for (const bot of bots) bot.grow();
    }
    const orders = Object.values(world.orders);
    // jeder übernommene Auftrag hat genau einen Eigentümer
    for (const o of orders) if (o.status !== 'offered') expect(['c1', 'c2']).toContain(o.companyId);
    // Fahrten und Rechnungen beziehen sich nur auf eigene Aufträge
    for (const [s, id] of [[a, 'c1'], [b, 'c2']] as const) {
      for (const t of Object.values(s.trips)) for (const st of t.stops ?? []) expect(world.orders[st.orderId]?.companyId ?? id).toBe(id);
      for (const inv of Object.values(s.invoices)) if (world.orders[inv.orderId]) expect(world.orders[inv.orderId].companyId).toBe(id);
    }
    expect(a.company.totals.deliveries).toBeGreaterThan(5);
    expect(b.company.totals.deliveries).toBeGreaterThan(5);
  }, 120_000);
});
