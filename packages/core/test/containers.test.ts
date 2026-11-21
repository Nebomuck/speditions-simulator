import { describe, expect, it } from 'vitest';
import {
  applyCommand, containerBlock, dailyContainers, hourlyContainers, onContainerDelivery, streetTurnCandidates, tagContainerOrder, terminalEvent, terminalStatus, terminalWait,
  updateOrderMarket, validateDispatch, isTerminal, CONTAINER_LOST_FEE, DETENTION_PER_DAY, FREE_DAYS, MIN_PER_DAY, SLOT_MIN, STREET_TURN_BONUS, TERMINALS,
  type GameState, type Order,
} from '../src/index.ts';
import { addOrder, ctx, first, newGame, runUntil } from './helpers.ts';

/** Containerauftrag wie aus der Börse (mit Kreislauf), bereits angenommen */
function containerOrder(s: GameState, from: string, to: string, cargoId: 'container' | 'container_export', opts: Partial<Order> = {}): Order {
  const o = addOrder(s, from, to, { cargoId, trailerType: 'container', status: 'accepted', weightT: 18, ...opts });
  tagContainerOrder(o);
  return o;
}

function deliver(s: GameState, o: Order, lateMin = 0) {
  o.status = 'delivered';
  o.deliveredAt = s.time;
  onContainerDelivery(s, o, lateMin);
}

describe('Häfen & Container (Paket E, Schritt E3)', () => {
  it('Terminals: Wartezeit 0,5–6 h, Ampel, Ereignisse – deterministisch aus Weltsamen und Zeit', () => {
    const s = newGame(5);
    expect(TERMINALS).toHaveLength(14);
    expect(isTerminal('hamburg')).toBe(true);
    expect(isTerminal('leipzig')).toBe(false);
    expect(terminalWait(s, 'leipzig')).toBe(0);
    let events = 0;
    const kinds = new Set<string>();
    for (let d = 0; d < 365; d++) {
      const t = s.time + d * MIN_PER_DAY + 10 * 60;
      for (const term of TERMINALS) {
        const w = terminalWait(s, term.cityId, t);
        expect(w).toBeGreaterThanOrEqual(30);
        expect(w).toBeLessThanOrEqual(360);
        const ev = terminalEvent(s, term.cityId, t);
        if (ev) {
          events++;
          kinds.add(ev.kind);
          expect(w).toBeGreaterThanOrEqual(120);
        }
      }
    }
    expect(events).toBeGreaterThan(50);
    expect([...kinds].sort()).toEqual(['ship', 'storm', 'strike']);
    // gleiche Welt, gleiche Zeit → gleiche Lage; Abfrage verbraucht keinen Zufall
    const rng = s.rng;
    expect(terminalStatus(s, 'rotterdam')).toEqual(terminalStatus(s, 'rotterdam'));
    expect(s.rng).toBe(rng);
  });

  it('Börse: Seecontainer nur ab Terminal mit 2-Stunden-Slot, Exporte nur zum Terminal', () => {
    const s = newGame(9);
    for (let i = 0; i < 3; i++) updateOrderMarket(s, ctx, true);
    const imports = Object.values(s.orders).filter((o) => o.cargoId === 'container');
    const exports = Object.values(s.orders).filter((o) => o.cargoId === 'container_export');
    expect(imports.length).toBeGreaterThan(3);
    expect(exports.length).toBeGreaterThan(1);
    for (const o of imports) {
      expect(isTerminal(o.fromCityId)).toBe(true);
      expect(o.container?.phase).toBe('import');
      expect(o.pickupEnd - o.pickupStart).toBeLessThanOrEqual(SLOT_MIN);
    }
    for (const o of exports) {
      expect(isTerminal(o.toCityId)).toBe(true);
      expect(o.container?.phase).toBe('export');
    }
  });

  it('Import: Leerrückgabe mit Gratistagen, danach Standgeld, nach 21 Tagen gilt der Container als verloren', () => {
    const s = newGame(11);
    const imp = containerOrder(s, 'hamburg', 'leipzig', 'container');
    expect(imp.container?.phase).toBe('import');
    deliver(s, imp);
    hourlyContainers(s, ctx);
    const ret = s.orders[imp.container!.linkedId!];
    expect(ret.container?.phase).toBe('return');
    expect(ret.fromCityId).toBe('leipzig');
    expect(ret.toCityId).toBe('hamburg');
    expect(ret.status).toBe('accepted');
    expect(ret.cargoId).toBe('container_empty');
    expect(ret.container!.freeUntil).toBe(s.time + FREE_DAYS * MIN_PER_DAY);
    // innerhalb der Gratistage kein Standgeld
    s.time += 4 * MIN_PER_DAY;
    let bal = s.company.account.balance;
    dailyContainers(s);
    expect(s.company.account.balance).toBe(bal);
    // danach je Tag Standgeld
    s.time = ret.container!.freeUntil! + 60;
    bal = s.company.account.balance;
    dailyContainers(s);
    expect(bal - s.company.account.balance).toBe(DETENTION_PER_DAY);
    expect(ret.container!.detention).toBe(DETENTION_PER_DAY);
    // nie zurückgebracht
    s.time = ret.container!.freeUntil! + 22 * MIN_PER_DAY;
    bal = s.company.account.balance;
    dailyContainers(s);
    expect(ret.status).toBe('cancelled');
    expect(bal - s.company.account.balance).toBe(CONTAINER_LOST_FEE);
  });

  it('Export: erst nach der Gestellung disponierbar, verpasster Annahmeschluss kostet extra', () => {
    const s = newGame(13);
    const exp = containerOrder(s, 'leipzig', 'hamburg', 'container_export', { status: 'offered' });
    expect(containerBlock(s, exp)).toMatch(/erst annehmen/);
    expect(applyCommand(s, ctx, 'p1', { type: 'acceptOrder', orderId: exp.id }).ok).toBe(true);
    const pos = s.orders[exp.container!.positionId!];
    expect(pos.container?.phase).toBe('position');
    expect(pos.fromCityId).toBe('hamburg');
    expect(pos.toCityId).toBe('leipzig');
    expect(pos.deliveryEnd).toBeLessThanOrEqual(Math.max(exp.pickupStart, pos.pickupEnd + 24 * 60));
    const d = first(s.drivers);
    const v = first(s.vehicles);
    const t = first(s.trailers);
    const r = validateDispatch(s, ctx, { orderId: exp.id, driverId: d.id, vehicleId: v.id, trailerId: t.id });
    expect(r.issues.some((i) => i.code === 'container')).toBe(true);
    // Leercontainer ist beim Verlader
    pos.status = 'delivered';
    expect(containerBlock(s, exp)).toBeUndefined();
    // Schiff verpasst
    const bal = s.company.account.balance;
    deliver(s, exp, 90);
    expect(bal - s.company.account.balance).toBe(Math.round((exp.payment * 0.35) / 100) * 100);
  });

  it('Street-Turn: Leercontainer direkt zum Exporteur in der Nähe, Gestellung entfällt, Prämie', () => {
    const s = newGame(17);
    const imp = containerOrder(s, 'hamburg', 'leipzig', 'container');
    deliver(s, imp);
    const exp = containerOrder(s, 'halle', 'hamburg', 'container_export', { pickupStart: s.time + MIN_PER_DAY, pickupEnd: s.time + MIN_PER_DAY + 4 * 60, deliveryEnd: s.time + 3 * MIN_PER_DAY });
    hourlyContainers(s, ctx);
    const ret = s.orders[imp.container!.linkedId!];
    const pos = s.orders[exp.container!.positionId!];
    expect(pos.status).toBe('accepted');
    expect(streetTurnCandidates(s, ret.id).map((o) => o.id)).toContain(exp.id);
    expect(applyCommand(s, ctx, 'p1', { type: 'streetTurn', returnId: ret.id, exportId: exp.id }).ok).toBe(true);
    expect(pos.status).toBe('cancelled');
    expect(ret.toCityId).toBe('halle');
    expect(ret.deliveryEnd).toBeLessThanOrEqual(exp.pickupStart);
    expect(containerBlock(s, exp)).toBeDefined();
    const bal = s.company.account.balance;
    deliver(s, ret);
    expect(s.company.account.balance - bal).toBe(STREET_TURN_BONUS);
    expect(containerBlock(s, exp)).toBeUndefined();
    // ohne Gratistage-Überwachung: kein Standgeld für den umgeleiteten Container
    s.time += 10 * MIN_PER_DAY;
    const b2 = s.company.account.balance;
    dailyContainers(s);
    expect(s.company.account.balance).toBe(b2);
  });

  it('Fahrt zum Terminal: Wartezeit am Tor und Slot, verpasster Slot kostet Umbuchung', async () => {
    const s = newGame(19, 'hamburg');
    const d = first(s.drivers);
    const v = first(s.vehicles);
    const t = first(s.trailers);
    t.type = 'container';
    // Import ab Hamburg (Firmensitz), Slot ist schon vorbei → Umbuchung
    const imp = containerOrder(s, 'hamburg', 'bremen', 'container', { pickupStart: s.time - 4 * 60, pickupEnd: s.time - 2 * 60, deliveryEnd: s.time + 2 * MIN_PER_DAY });
    const res = applyCommand(s, ctx, 'p1', { type: 'dispatch', orderId: imp.id, driverId: d.id, vehicleId: v.id, trailerId: t.id });
    expect(res.ok).toBe(true);
    const bal = s.company.account.balance;
    const trip = s.trips[v.tripId!];
    await runUntil(s, () => trip.activity === 'waiting' || trip.phase !== 'to_pickup', 600);
    expect(trip.log.some((l) => l.text.includes('Wartezeit am Tor'))).toBe(true);
    expect(s.log.some((l) => l.text.includes('Slot am'))).toBe(true);
    expect(bal - s.company.account.balance).toBeGreaterThanOrEqual(60_00);
    // Fahrt geht weiter: beladen, zugestellt
    await runUntil(s, () => imp.status === 'delivered', 3 * MIN_PER_DAY);
    expect(imp.status).toBe('delivered');
    hourlyContainers(s, ctx);
    expect(imp.container!.linkedId).toBeDefined();
  });
});
