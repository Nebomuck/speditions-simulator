import { describe, expect, it } from 'vitest';
import {
  CITIES, CITY_BY_ID, CARGO_BY_ID, GameSession, HOS_RULES, PRIVATE_LIVING_COST, TRAILER_BY_TYPE, applyCommand, book,
  deserializeSave, haversineKm, serializeSave, tickMinutes, vehicleMarker, processMonthEnd, generateOrder, SaveError,
} from '../src/index.ts';
import { addOrder, ctx, first, newGame, runUntil } from './helpers.ts';

describe('Straßennetz & Routing', () => {
  it('alle Städte sind über das Straßennetz erreichbar', () => {
    for (const c of CITIES) expect(ctx.net.route('berlin', c.id), c.id).not.toBeNull();
  });

  it('Route Leipzig → Prag ist realistisch und folgt der Straßengeometrie', () => {
    const r = ctx.net.route('leipzig', 'prag')!;
    const air = haversineKm([12.375, 51.34], [14.438, 50.075]);
    expect(r.km).toBeGreaterThan(air * 1.05);
    expect(r.km).toBeLessThan(air * 1.6);
    const geom = ctx.net.geometry(r.nodes);
    expect(geom.length).toBeGreaterThan(20); // echte Straßengeometrie, keine Luftlinie
    const mid = ctx.net.positionAlong(r.nodes, r.km / 2).pos;
    // Mittelpunkt liegt auf der Geometrie (nahe einem Geometriepunkt-Segment), nicht zwingend auf der Luftlinie
    const nearest = Math.min(...geom.map((g) => haversineKm(g, mid)));
    expect(nearest).toBeLessThan(15);
  });
});

describe('Transporttest', () => {
  it('ein LKW übernimmt einen Auftrag, fährt die Route und liefert die Ware aus', async () => {
    const s = newGame();
    const order = addOrder(s, 'leipzig', 'prag');
    const d = first(s.drivers);
    const v = first(s.vehicles);
    const t = first(s.trailers);
    const odo0 = v.odometerKm;
    const fuel0 = v.fuelL;
    const res = applyCommand(s, ctx, 'p1', { type: 'dispatch', orderId: order.id, driverId: d.id, vehicleId: v.id, trailerId: t.id });
    expect(res.ok).toBe(true);
    expect(d.status).toBe('on_trip');
    expect(v.status).toBe('on_trip');

    // Position bewegt sich entlang der Route
    const p0 = vehicleMarker(s, ctx, v.id).pos;
    await runUntil(s, () => false, 120);
    const p1 = vehicleMarker(s, ctx, v.id).pos;
    expect(haversineKm(p0, p1)).toBeGreaterThan(5);

    const took = await runUntil(s, () => order.status === 'delivered', 3 * 1440);
    expect(took).toBeGreaterThan(0);
    expect(v.cityId).toBe('prag');
    expect(d.cityId).toBe('prag');
    expect(t.cityId).toBe('prag');
    expect(d.status).toBe('idle');
    expect(v.odometerKm - odo0).toBeCloseTo(order.distanceKm, 0);
    expect(v.fuelL).toBeLessThan(fuel0);
    const trip = s.trips[order.tripId!];
    expect(trip.phase).toBe('done');
    expect(trip.costs.toll).toBeGreaterThan(0);
    expect(Object.values(s.invoices).some((i) => i.orderId === order.id)).toBe(true);
  });
});

describe('Wirtschaftstest', () => {
  it('Vergütung wird als Forderung erfasst, später bezahlt, Kosten werden gebucht', async () => {
    const s = newGame(7);
    const order = addOrder(s, 'leipzig', 'dresden', { payment: 800_00 });
    const cust = s.customers[order.customerId];
    cust.paymentReliability = 0.99;
    const d = first(s.drivers), v = first(s.vehicles), t = first(s.trailers);
    applyCommand(s, ctx, 'p1', { type: 'dispatch', orderId: order.id, driverId: d.id, vehicleId: v.id, trailerId: t.id });
    await runUntil(s, () => order.status === 'delivered', 2 * 1440);
    const inv = Object.values(s.invoices).find((i) => i.orderId === order.id)!;
    expect(inv.amount).toBe(800_00); // pünktlich, keine Strafe
    expect(inv.status).toBe('open');
    const tollEntry = s.ledger.find((l) => l.category === 'toll');
    expect(tollEntry!.amount).toBeLessThan(0);
    if (inv.willPayAt === null) return; // Zahlungsausfall gezogen – anderer Test deckt Zahlung ab
    const before = s.company.account.balance;
    const ledgerLen = s.ledger.length;
    await runUntil(s, () => inv.status === 'paid', 70 * 1440);
    expect(inv.status).toBe('paid');
    const paymentEntry = s.ledger.slice(ledgerLen).find((l) => l.category === 'revenue');
    expect(paymentEntry!.amount).toBe(800_00);
    expect(s.company.account.balance).not.toBe(before);
  });

  it('Verspätung führt zu Vertragsstrafe und sinkender Kundenzufriedenheit', async () => {
    const s = newGame(11);
    const order = addOrder(s, 'leipzig', 'muenchen', { deliveryEnd: s.time + 120, payment: 1_500_00, penaltyPerHour: 30_00 });
    const cust = s.customers[order.customerId];
    const sat0 = cust.satisfaction;
    const d = first(s.drivers), v = first(s.vehicles), t = first(s.trailers);
    const res = applyCommand(s, ctx, 'p1', { type: 'dispatch', orderId: order.id, driverId: d.id, vehicleId: v.id, trailerId: t.id });
    expect(res.ok && res.warnings?.some((w) => w.code === 'delivery_late')).toBe(true);
    await runUntil(s, () => order.status === 'delivered', 3 * 1440);
    const inv = Object.values(s.invoices).find((i) => i.orderId === order.id)!;
    expect(inv.amount).toBeLessThan(1_500_00);
    expect(cust.satisfaction).toBeLessThan(sat0);
  });

  it('Monatsabrechnung bucht Löhne, Miete und Versicherung vom Firmenkonto', () => {
    const s = newGame();
    const before = s.company.account.balance;
    processMonthEnd(s);
    const cats = new Set(s.ledger.map((l) => l.category));
    expect(cats.has('wages')).toBe(true);
    expect(cats.has('rent')).toBe(true);
    expect(cats.has('insurance')).toBe(true);
    expect(cats.has('leasing')).toBe(true);
    expect(s.company.account.balance).toBeLessThan(before);
  });
});

describe('Fahrertest (Lenk- und Ruhezeiten)', () => {
  it('ein Fahrer mit notwendiger Ruhezeit fährt erst nach Ablauf der Ruhezeit los', async () => {
    const s = newGame();
    const d = first(s.drivers), v = first(s.vehicles), t = first(s.trailers);
    d.hos.drivenToday = HOS_RULES.DAILY_DRIVE;
    d.hos.requiredRest = HOS_RULES.DAILY_REST;
    d.hos.requiredRestKind = 'daily';
    d.hos.restStreak = 0;
    // Ladestelle Dresden: Leerfahrt beginnt erst nach der Ruhezeit
    const order = addOrder(s, 'dresden', 'berlin', { pickupEnd: s.time + 1440 });
    const res = applyCommand(s, ctx, 'p1', { type: 'dispatch', orderId: order.id, driverId: d.id, vehicleId: v.id, trailerId: t.id });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.warnings!.some((w) => w.code === 'driver_rest')).toBe(true);
    const trip = s.trips[order.tripId!];
    for (let i = 0; i < HOS_RULES.DAILY_REST - 2; i++) {
      tickMinutes(s, ctx, 1);
      expect(trip.progressKm).toBe(0);
    }
    await runUntil(s, () => trip.progressKm > 0, 10);
    expect(trip.progressKm).toBeGreaterThan(0);
  });

  it('auf einer Langstrecke werden Pausen und Tageslenkzeiten eingehalten', async () => {
    const s = newGame(3);
    const order = addOrder(s, 'leipzig', 'madrid', { deliveryEnd: s.time + 6 * 1440, payment: 4_000_00 });
    const d = first(s.drivers), v = first(s.vehicles), t = first(s.trailers);
    applyCommand(s, ctx, 'p1', { type: 'dispatch', orderId: order.id, driverId: d.id, vehicleId: v.id, trailerId: t.id });
    const trip = s.trips[order.tripId!];
    let maxSinceBreak = 0;
    let maxToday = 0;
    let rests = 0;
    let fuelStops = 0;
    let last = trip.activity;
    await runUntil(
      s,
      () => order.status === 'delivered',
      8 * 1440,
      () => {
        maxSinceBreak = Math.max(maxSinceBreak, d.hos.drivenSinceBreak);
        maxToday = Math.max(maxToday, d.hos.drivenToday);
        if (trip.activity !== last) {
          if (trip.activity === 'rest_daily') rests++;
          if (trip.activity === 'fueling') fuelStops++;
          last = trip.activity;
        }
      },
    );
    expect(order.status).toBe('delivered');
    expect(maxSinceBreak).toBeLessThanOrEqual(HOS_RULES.BREAK_AFTER);
    expect(maxToday).toBeLessThanOrEqual(HOS_RULES.DAILY_DRIVE);
    expect(rests).toBeGreaterThanOrEqual(2);
    expect(fuelStops).toBeGreaterThanOrEqual(1);
  });
});

describe('Dispositionstest (Konfliktprüfung)', () => {
  it('ein LKW kann nicht gleichzeitig zwei Aufträge übernehmen', () => {
    const s = newGame();
    const o1 = addOrder(s, 'leipzig', 'prag');
    const o2 = addOrder(s, 'leipzig', 'berlin');
    const d = first(s.drivers), v = first(s.vehicles), t = first(s.trailers);
    expect(applyCommand(s, ctx, 'p1', { type: 'dispatch', orderId: o1.id, driverId: d.id, vehicleId: v.id, trailerId: t.id }).ok).toBe(true);
    const r2 = applyCommand(s, ctx, 'p1', { type: 'dispatch', orderId: o2.id, driverId: d.id, vehicleId: v.id, trailerId: t.id });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.issues!.map((i) => i.code)).toEqual(expect.arrayContaining(['vehicle_busy', 'driver_busy', 'trailer_busy']));
  });

  it('ungeeigneter Auflieger und fehlende ADR-Qualifikation werden abgelehnt', () => {
    const s = newGame();
    const d = first(s.drivers), v = first(s.vehicles), t = first(s.trailers);
    d.qualifications = [];
    const reefer = addOrder(s, 'leipzig', 'prag', { cargoId: 'chilled', trailerType: 'reefer' });
    const r1 = applyCommand(s, ctx, 'p1', { type: 'dispatch', orderId: reefer.id, driverId: d.id, vehicleId: v.id, trailerId: t.id });
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.issues!.some((i) => i.code === 'trailer_type')).toBe(true);
    const adr = addOrder(s, 'leipzig', 'prag', { cargoId: 'chemicals', trailerType: 'curtain', qualifications: ['ADR'] });
    const r2 = applyCommand(s, ctx, 'p1', { type: 'dispatch', orderId: adr.id, driverId: d.id, vehicleId: v.id, trailerId: t.id });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.issues!.some((i) => i.code === 'qualification')).toBe(true);
  });

  it('Fahrzeugkapazität (Nutzlast) wird geprüft', () => {
    const s = newGame();
    const d = first(s.drivers), v = first(s.vehicles), t = first(s.trailers);
    const heavy = addOrder(s, 'leipzig', 'prag', { weightT: TRAILER_BY_TYPE.curtain.payloadT + 5 });
    const r = applyCommand(s, ctx, 'p1', { type: 'dispatch', orderId: heavy.id, driverId: d.id, vehicleId: v.id, trailerId: t.id });
    expect(r.ok).toBe(false);
  });
});

describe('Speichertest', () => {
  it('ein während der Fahrt gespeicherter Spielstand wird exakt wiederhergestellt und läuft identisch weiter', async () => {
    const s = newGame(99);
    const order = addOrder(s, 'leipzig', 'wien', { deliveryEnd: s.time + 3 * 1440 });
    const d = first(s.drivers), v = first(s.vehicles), t = first(s.trailers);
    applyCommand(s, ctx, 'p1', { type: 'dispatch', orderId: order.id, driverId: d.id, vehicleId: v.id, trailerId: t.id });
    tickMinutes(s, ctx, 200);
    const text = serializeSave(s, 'Test');
    const loaded = deserializeSave(text);
    expect(loaded).toEqual(JSON.parse(JSON.stringify(s)));
    expect(vehicleMarker(loaded, ctx, v.id).pos).toEqual(vehicleMarker(s, ctx, v.id).pos);
    // Determinismus: beide Zustände simulieren identisch weiter
    tickMinutes(s, ctx, 1500);
    tickMinutes(loaded, ctx, 1500);
    expect(JSON.stringify(loaded)).toBe(JSON.stringify(s));
  });

  it('beschädigte Spielstände werden erkannt', () => {
    const s = newGame();
    const text = serializeSave(s, 'Test').replace('"reputation":30', '"reputation":99');
    expect(text).toContain('"reputation":99');
    expect(() => deserializeSave(text)).toThrow(SaveError);
  });
});

describe('Lebenssimulationstest (Privat- und Firmenvermögen)', () => {
  it('private Ausgaben verändern das Privatvermögen, nicht das Firmenvermögen', () => {
    const s = newGame();
    const company0 = s.company.account.balance;
    const private0 = s.players.p1.character.privateAccount.balance;
    book(s, 'private:p1', -250_00, 'living', 'Restaurantbesuch');
    expect(s.company.account.balance).toBe(company0);
    expect(s.players.p1.character.privateAccount.balance).toBe(private0 - 250_00);
  });

  it('ein höheres Geschäftsführergehalt erhöht das Privateinkommen und belastet die Firma', () => {
    const s = newGame();
    applyCommand(s, ctx, 'p1', { type: 'setCeoSalary', playerId: 'p1', salary: 5_000_00 });
    const company0 = s.company.account.balance;
    const private0 = s.players.p1.character.privateAccount.balance;
    processMonthEnd(s);
    expect(s.players.p1.character.privateAccount.balance - private0).toBe(5_000_00 - PRIVATE_LIVING_COST);
    expect(s.ledger.some((l) => l.account === 'company' && l.category === 'salary' && l.amount === -5_000_00)).toBe(true);
    expect(s.company.account.balance).toBeLessThan(company0);
  });
});

describe('Berechtigungen', () => {
  it('Spieler ohne Kaufrecht kann keine Fahrzeuge kaufen', async () => {
    const s = newGame();
    const { addPlayer } = await import('../src/game.ts');
    addPlayer(s, { id: 'p2', name: 'Disponent', permissions: ['dispatch'] });
    const r = applyCommand(s, ctx, 'p2', { type: 'buyNewVehicle', modelId: 'velkor-s460', financing: 'lease' });
    expect(r.ok).toBe(false);
  });
});

describe('Auftragsgenerierung (Warenflussmodell)', () => {
  it('erzeugt wirtschaftlich plausible Aufträge', () => {
    const s = newGame(5);
    const offered = Object.values(s.orders).filter((o) => o.status === 'offered');
    expect(offered.length).toBeGreaterThan(200);
    for (const o of offered.slice(0, 100)) {
      const cargo = CARGO_BY_ID[o.cargoId];
      expect(o.trailerType).toBe(cargo.trailer);
      expect(CITY_BY_ID[o.fromCityId].industries.some((i) => cargo.producers.includes(i))).toBe(true);
      expect(o.payment).toBeGreaterThan(0);
      expect(o.deliveryEnd).toBeGreaterThan(o.pickupEnd);
      expect(ctx.net.route(o.fromCityId, o.toCityId)).not.toBeNull();
    }
    // Erlös pro km im realistischen Rahmen (1–4 €/km)
    const perKm = offered.map((o) => o.payment / 100 / o.distanceKm).sort((a, b) => a - b);
    expect(perKm[Math.floor(perKm.length / 2)]).toBeGreaterThan(1.2);
    expect(perKm[Math.floor(perKm.length / 2)]).toBeLessThan(3.5);
    expect(generateOrder(s, ctx)).not.toBeNull();
  });
});

describe('Performance-Test', () => {
  it('simuliert 300 gleichzeitig fahrende LKW über einen Spieltag performant', () => {
    const s = newGame(1);
    const baseV = first(s.vehicles), baseT = first(s.trailers), baseD = first(s.drivers);
    const dests = ['hamburg', 'muenchen', 'paris', 'warschau', 'mailand', 'wien', 'amsterdam', 'madrid', 'kopenhagen', 'budapest'];
    for (let i = 0; i < 300; i++) {
      const v = { ...structuredClone(baseV), id: `pv${i}` };
      const t = { ...structuredClone(baseT), id: `pt${i}` };
      const d = { ...structuredClone(baseD), id: `pd${i}`, hos: { ...baseD.hos } };
      s.vehicles[v.id] = v;
      s.trailers[t.id] = t;
      s.drivers[d.id] = d;
      const o = addOrder(s, 'leipzig', dests[i % dests.length], { deliveryEnd: s.time + 5 * 1440 });
      const r = applyCommand(s, ctx, 'p1', { type: 'dispatch', orderId: o.id, driverId: d.id, vehicleId: v.id, trailerId: t.id });
      expect(r.ok).toBe(true);
    }
    const session = new GameSession(s, ctx);
    const t0 = performance.now();
    tickMinutes(session.state, ctx, 1440);
    const ms = performance.now() - t0;
    // 1440 Ticks × 300 Fahrzeuge; bei 60× Geschwindigkeit entspricht ein Tag 24 s Echtzeit
    expect(ms).toBeLessThan(6000);
    const t1 = performance.now();
    for (const id of Object.keys(s.vehicles)) vehicleMarker(s, ctx, id);
    expect(performance.now() - t1).toBeLessThan(100);
  });
});
