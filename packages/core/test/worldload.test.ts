import { describe, expect, it } from 'vitest';
import { CITY_BY_ID, activeCompetitors, addCompany, companyView, dailyCustomerChurn, nearCompetitor, playerView, serializeSave, deserializeSave, tickWorld, worldOf } from '../src/index.ts';
import { createBot } from './bot.ts';
import { ctx, newGame } from './helpers.ts';

describe('KI-Konkurrenz je Firma und Last (Paket D, Schritt D6)', () => {
  it('die KI wirbt Kunden je Firma ab: wer schlecht liefert, verliert ihn – die andere Firma nicht', () => {
    const a = newGame(61);
    const world = worldOf(a);
    const b = companyView(world, addCompany(world, ctx, { companyName: 'Hanse Fracht', hqCityId: 'hamburg', founder: { id: 'k2', name: 'Kim' } }));
    const comps = activeCompetitors(a);
    const cu = Object.values(b.customers).find((c) => comps.some((k) => nearCompetitor(k, CITY_BY_ID[c.cityId])));
    expect(cu).toBeDefined();
    Object.assign(cu!, { deliveries: 5, satisfaction: 10 });
    Object.assign(a.customers[cu!.id], { deliveries: 5, satisfaction: 10 });
    // A ist zufrieden genug: nur B riskiert den Wechsel
    a.customers[cu!.id].satisfaction = 80;
    for (let i = 0; i < 2000 && !cu!.lostTo; i++) dailyCustomerChurn(b);
    expect(cu!.lostTo).toBeDefined();
    expect(a.customers[cu!.id].lostTo).toBeUndefined();
    expect(b.log.some((l) => l.text.includes(cu!.name) && l.text.includes('wechselt'))).toBe(true);
    expect(a.log.some((l) => l.text.includes(cu!.name) && l.text.includes('wechselt'))).toBe(false);
  });

  it('vier Firmen mit Bots: 5 Tage gemeinsame Welt, Eigentum eindeutig, Spielstand und Sichten in Ordnung', () => {
    const a = newGame(62);
    const world = worldOf(a);
    const views = [a];
    for (const city of ['hamburg', 'muenchen', 'koeln']) views.push(companyView(world, addCompany(world, ctx, { companyName: `Bot ${city}`, hqCityId: city, founder: { id: 'p1', name: 'Bot' } })));
    const bots = views.map((v) => createBot(v));
    const t0 = performance.now();
    for (let d = 0; d < 5; d++) {
      for (let h = 0; h < 24; h++) {
        for (let m = 0; m < 60; m++) tickWorld(world, ctx);
        for (const bot of bots) bot.tend();
      }
      for (const bot of bots) bot.grow();
    }
    const msPerDay = (performance.now() - t0) / 5;
    // Server bei 60× Zeitraffer: ein Spieltag in 24 s Echtzeit – die Rechenzeit muss weit darunter liegen
    expect(msPerDay).toBeLessThan(4000);
    const ids = ['c1', 'c2', 'c3', 'c4'];
    for (const o of Object.values(world.orders)) if (o.status !== 'offered' && o.status !== 'expired') expect(ids).toContain(o.companyId);
    for (const v of views) {
      expect(v.stats.length).toBe(5);
      const view = playerView(v, 'p1', ctx);
      expect(view.arena?.rivals).toHaveLength(3);
      expect(view.arena?.ranking.filter((r) => r.kind === 'player')).toHaveLength(4);
      for (const o of Object.values(view.orders)) expect(o.status === 'offered' || o.companyId === view.arena?.companyId).toBe(true);
    }
    expect(views.reduce((n, v) => n + v.company.totals.deliveries, 0)).toBeGreaterThan(0);
    const loaded = worldOf(deserializeSave(serializeSave(a, 'Last')));
    expect(loaded.companyOrder).toEqual(ids);
    expect(loaded.time).toBe(world.time);
  }, 120_000);
});
