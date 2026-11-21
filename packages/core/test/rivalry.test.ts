import { describe, expect, it } from 'vitest';
import {
  GameSession, addCompany, companyView, dailyNews, generateOrder, generateTender, hourlyHandovers, hourlyTenders, playerView, ranking, worldOf,
  type GameState, type Order,
} from '../src/index.ts';
import { ctx, newGame } from './helpers.ts';

/** Welt mit zwei Firmen: Gründer p1 (c1, Leipzig) und k2 (c2, Hamburg) */
function arena(seed = 51) {
  const a = newGame(seed);
  const world = worldOf(a);
  const id = addCompany(world, ctx, { companyName: 'Hanse Fracht', hqCityId: 'hamburg', founder: { id: 'k2', name: 'Kim Zweit' } });
  const b = companyView(world, id);
  return { world, a, b, session: new GameSession(a, ctx) };
}

function accepted(s: GameState, session: GameSession, player: string): Order {
  for (let i = 0; i < 50; i++) {
    const o = generateOrder(s, ctx);
    if (!o) continue;
    expect(session.command(player, { type: 'acceptOrder', orderId: o.id }).ok).toBe(true);
    return o;
  }
  throw new Error('kein Auftrag');
}

describe('Wettbewerb zwischen Spielerfirmen (Paket D, Schritt D5)', () => {
  it('Rangliste: Spielerfirmen und KI nach Firmenwert, eigene Firma markiert', () => {
    const { a, b } = arena();
    b.company.account.balance += 500_000_00;
    const rk = ranking(a);
    const players = rk.filter((r) => r.kind === 'player');
    expect(players.map((p) => p.name).sort()).toEqual(['Hanse Fracht', 'Test Logistik']);
    expect(players.find((p) => p.own)?.name).toBe('Test Logistik');
    expect(rk.map((r) => r.value)).toEqual([...rk.map((r) => r.value)].sort((x, y) => y - x));
    expect(rk.indexOf(players.find((p) => p.name === 'Hanse Fracht')!)).toBeLessThan(rk.indexOf(players.find((p) => p.own)!));
    // Spielersicht trägt die Rangliste mit
    expect(playerView(a, 'k2', ctx).arena?.ranking.find((r) => r.own)?.name).toBe('Hanse Fracht');
    // Einzelspiel: eigene Firma gegen die KI
    expect(ranking(newGame(3)).filter((r) => r.kind === 'player')).toHaveLength(1);
  });

  it('Ausschreibungen: verdeckte Gebote je Firma, Zuschlag an das beste Gebot', () => {
    const { a, b, session } = arena();
    let t = null;
    for (let i = 0; i < 40 && !t; i++) t = generateTender(a, ctx);
    expect(t).toBeTruthy();
    const ref = t!.referencePrice;
    expect(session.command('p1', { type: 'bidTender', tenderId: t!.id, price: Math.round(ref * 1.4), guarantee: false }).ok).toBe(true);
    expect(session.command('k2', { type: 'bidTender', tenderId: t!.id, price: Math.ceil((ref * 0.6) / 100) * 100, guarantee: true }).ok).toBe(true);
    expect(t!.bid).toBeUndefined();
    expect(Object.keys(t!.bids!).sort()).toEqual(['c1', 'c2']);
    // jeder sieht nur das eigene Gebot
    expect(playerView(a, 'p1', ctx).tenders[t!.id].bid?.price).toBe(Math.round(ref * 1.4));
    expect(playerView(a, 'k2', ctx).tenders[t!.id].bids).toBeUndefined();
    t!.deadline = a.time;
    hourlyTenders(a, ctx);
    expect(t!.result?.winner).toBe('Hanse Fracht');
    const va = playerView(a, 'p1', ctx).tenders[t!.id];
    const vb = playerView(a, 'k2', ctx).tenders[t!.id];
    expect(va.status).toBe('lost');
    expect(va.result?.bids.filter((x) => x.player).map((x) => x.name)).toEqual(['Test Logistik']);
    if (!t!.result?.note) {
      expect(vb.status).toBe('won');
      expect(Object.values(b.contracts).some((k) => k.paymentPerTour === t!.bids!.c2.price)).toBe(true);
      expect(Object.keys(a.contracts)).toHaveLength(0);
    }
    expect(a.log.some((l) => l.text.includes('verloren') && l.text.includes('Hanse Fracht'))).toBe(true);
  });

  it('Branchenblatt: jede Firma hat ihre eigene Ausgabe mit Rangliste', () => {
    const { a, b } = arena();
    dailyNews(a);
    dailyNews(b);
    // bis zum nächsten Montag
    a.time += 7 * 1440 - (a.time % (7 * 1440)) + 4 * 1440;
    dailyNews(a);
    dailyNews(b);
    expect(a.news).not.toBe(b.news);
    const ia = a.news!.issues[0];
    const ib = b.news!.issues[0];
    if (ia && ib) {
      expect(ia.items.some((it) => it.title.includes('Test Logistik') || it.text.includes('Test Logistik'))).toBe(true);
      expect(ib.items.some((it) => it.kind === 'rivals' && /Rangliste/.test(it.title + it.text))).toBe(true);
      expect(ib.figures?.companies).toBe(ia.figures?.companies);
    }
  });

  it('Subunternehmer zwischen Spielerfirmen: anbieten, annehmen, fahren, Marge abrechnen', () => {
    const { a, b, session } = arena();
    const o = accepted(a, session, 'p1');
    const price = Math.round((o.payment * 0.8) / 100) * 100;
    // außerhalb des Rahmens und an sich selbst geht nicht
    expect(session.command('p1', { type: 'offerHandover', orderId: o.id, companyId: 'c2', price: o.payment * 2 }).ok).toBe(false);
    expect(session.command('p1', { type: 'offerHandover', orderId: o.id, companyId: 'c1', price }).ok).toBe(false);
    expect(session.command('p1', { type: 'offerHandover', orderId: o.id, companyId: 'c2', price }).ok).toBe(true);
    const inc = playerView(a, 'k2', ctx).arena!.incoming;
    expect(inc.map((x) => x.id)).toEqual([o.id]);
    expect(inc[0].payment).toBe(price);
    // die angebotene Firma sieht den Auftrag nicht als eigenen
    expect(playerView(a, 'k2', ctx).orders[o.id]).toBeUndefined();
    const r = session.command('k2', { type: 'acceptHandover', orderId: o.id });
    expect(r.ok).toBe(true);
    const childId = (r as { id: string }).id;
    const child = b.orders[childId];
    expect(child).toMatchObject({ companyId: 'c2', payment: price, status: 'accepted', parentOrderId: o.id });
    expect(o.status).toBe('in_transit');
    expect(o.subcontract?.childId).toBe(childId);
    expect(playerView(a, 'k2', ctx).orders[childId]).toBeDefined();
    expect(playerView(a, 'p1', ctx).orders[childId]).toBeUndefined();
    // Zustellung durch Hanse Fracht → Test Logistik rechnet die Marge ab
    child.status = 'delivered';
    child.deliveredAt = a.time;
    child.lateMinutes = 0;
    const invoices = Object.keys(a.invoices).length;
    hourlyHandovers(a);
    expect(o.status).toBe('delivered');
    const inv = Object.values(a.invoices).find((x) => x.orderId === o.id);
    expect(Object.keys(a.invoices).length).toBe(invoices + 1);
    expect(inv?.amount).toBe(o.payment - price);
    expect(a.company.totals.subcontracted).toBe(1);
  });

  it('Ablehnen, Verfall und nicht ausgeführte Übernahmen', () => {
    const { a, b, session } = arena();
    const o1 = accepted(a, session, 'p1');
    session.command('p1', { type: 'offerHandover', orderId: o1.id, companyId: 'c2', price: o1.payment });
    expect(session.command('k2', { type: 'declineHandover', orderId: o1.id }).ok).toBe(true);
    expect(o1.handover).toBeUndefined();
    expect(a.log.some((l) => l.text.includes('lehnt'))).toBe(true);
    // Verfall nach zwei Stunden
    session.command('p1', { type: 'offerHandover', orderId: o1.id, companyId: 'c2', price: o1.payment });
    a.time += 121;
    hourlyHandovers(a);
    expect(o1.handover).toBeUndefined();
    expect(session.command('k2', { type: 'acceptHandover', orderId: o1.id }).ok).toBe(false);
    // angenommen, aber nie gefahren: gescheitert, beide verlieren Ruf
    session.command('p1', { type: 'offerHandover', orderId: o1.id, companyId: 'c2', price: o1.payment });
    session.command('k2', { type: 'acceptHandover', orderId: o1.id });
    const repA = a.company.reputation;
    const repB = b.company.reputation;
    a.time = o1.deliveryEnd + 3 * 1440;
    hourlyHandovers(a);
    expect(o1.status).toBe('cancelled');
    expect(a.company.reputation).toBeLessThan(repA);
    expect(b.company.reputation).toBeLessThan(repB);
    // im Einzelspiel nicht möglich
    const solo = newGame(8);
    const so = new GameSession(solo, ctx);
    const os = accepted(solo, so, 'p1');
    expect(so.command('p1', { type: 'offerHandover', orderId: os.id, companyId: 'c2', price: os.payment }).ok).toBe(false);
  });
});
