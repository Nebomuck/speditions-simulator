import { describe, expect, it } from 'vitest';
import {
  CITIES, CITY_BY_ID, CARGO_BY_ID, GameSession, HOS_RULES, PRIVATE_LIVING_COST, TRAILER_BY_TYPE, applyCommand, book,
  deserializeSave, haversineKm, serializeSave, tickMinutes, vehicleMarker, processMonthEnd, generateOrder, SaveError, createInvoice,
  TRUCK_BY_ID, estimateTrip, vehicleSchedule, STATE_VERSION, planCoLoad, ordersOnBoard, rerouteAffected, routeNow, tripEta, updateDisruptions, disruptionLabel,
  type Disruption, type Contract, generateContractOffer, marketSalary, COURSES, dailyPersonnel, tradeInValue, MIN_PER_DAY,
  type GameState, LOCATION_DEFS, BRANCH_SETUP_COST, capacity, monthlyFixedCosts, dailyCompany, monthlyCompany, serviceCost, dispatchShortfall,
  satisfactionFactors, accountingRiskFactor, salesVolumeFactor, warehouseIncome, companyValue, runAutoDispatch, searchDepth,
  type LifeAction, dailyLife, ceoManagedVehicles, ACTIVITIES, isAway, negotiationBonus, HOMES, MOVING_COST, goalDone, privateWealth,
  monthlyPrivateCosts, LIVING_BASE, CHILD_COST, DIVIDEND_TAX,
  addPlayer, TEAM_ROLES, playerView, unreadMessages, openTasksFor, pendingInvitesFor, JOINT_ACTIVITIES, meetingBonus, hourlyTeam, voteCounts,
  diffState, applyPatch, sameJson,
  weatherWeights, tickTrip, banUntil, banApplies, validateDispatch, isCustomsBorder, startPhase, dailyEconomy, crisisPaymentFactor, setRegionalTrend, regionFactor,
  activeCompetitors, hourlyCompetition, dailyCompetition, monthlyCompetition, foundCompetitor, dailyEvents, type Trip,
  pickupWaitMin, freshHos, type StaffMember,
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

describe('Liquidität: Zahlungsmoral, Kredite, Factoring', () => {
  it('Kunden zahlen überwiegend pünktlich, Ausfälle sind selten', () => {
    const s = newGame(7);
    const order = addOrder(s, 'leipzig', 'prag');
    let onTime = 0;
    let defaults = 0;
    const n = 4000;
    const custs = Object.values(s.customers);
    for (let i = 0; i < n; i++) {
      order.customerId = custs[i % custs.length].id;
      createInvoice(s, order, 1_000_00);
    }
    for (const inv of Object.values(s.invoices)) {
      if (inv.willPayAt === null) defaults++;
      else if (inv.willPayAt <= inv.due) onTime++;
    }
    expect(onTime / n).toBeGreaterThan(0.85);
    expect(defaults / n).toBeLessThan(0.015);
  });

  it('Kredit: Auszahlung, Rahmenprüfung, monatliche Annuität bis zur vollständigen Tilgung', () => {
    const s = newGame();
    const before = s.company.account.balance;
    expect(applyCommand(s, ctx, 'p1', { type: 'takeLoan', amount: 900_000_00, months: 12 }).ok).toBe(false); // über Kreditrahmen
    const r = applyCommand(s, ctx, 'p1', { type: 'takeLoan', amount: 20_000_00, months: 12 });
    expect(r.ok).toBe(true);
    expect(s.company.account.balance).toBe(before + 20_000_00);
    const loan = s.company.loans[0];
    expect(loan.monthly).toBeGreaterThan(20_000_00 / 12);
    expect(loan.monthly).toBeLessThan((20_000_00 / 12) * 1.06);
    for (let m = 0; m < 12; m++) processMonthEnd(s);
    expect(s.company.loans.length).toBe(0);
    const paid = s.ledger.filter((e) => e.text === 'Kredittilgung').reduce((a, e) => a - e.amount, 0);
    expect(paid).toBe(20_000_00);
  });

  it('Kredit ohne Recht „Kredite aufnehmen“ wird abgelehnt', () => {
    const s = newGame();
    s.players.p2 = { ...s.players.p1, id: 'p2', isFounder: false, permissions: ['dispatch'] };
    expect(applyCommand(s, ctx, 'p2', { type: 'takeLoan', amount: 10_000_00, months: 24 }).ok).toBe(false);
  });

  it('Factoring zahlt offene Rechnungen sofort abzüglich Gebühr aus und beendet das Ausfallrisiko', () => {
    const s = newGame();
    const order = addOrder(s, 'leipzig', 'prag');
    createInvoice(s, order, 10_000_00);
    const inv = Object.values(s.invoices)[0];
    inv.willPayAt = null; // Kunde würde nie zahlen
    const before = s.company.account.balance;
    expect(applyCommand(s, ctx, 'p1', { type: 'factorInvoices' }).ok).toBe(true);
    expect(s.company.account.balance - before).toBe(9_700_00); // 3 % Gebühr
    expect(inv.status).toBe('factored');
    tickMinutes(s, ctx, 80 * 1440);
    expect(inv.status).toBe('factored'); // kein Zahlungsausfall mehr
  });

  it('Spielstände der Version 1 werden um Kredite ergänzt', () => {
    const s = newGame();
    const old = JSON.parse(JSON.stringify(s));
    delete old.company.loans;
    old.version = 1;
    const text = serializeSave(old, 'alt').replace(`"version":${STATE_VERSION}`, '"version":1');
    const loaded = deserializeSave(text);
    expect(loaded.company.loans).toEqual([]);
    expect(loaded.version).toBe(STATE_VERSION);
  });
});

describe('Vorausplanung (Tourenketten)', () => {
  it('Folgeauftrag wird während der Fahrt eingeplant und startet nach der Lieferung automatisch am Zielort', async () => {
    const s = newGame();
    const d = first(s.drivers);
    const v = first(s.vehicles);
    const t = first(s.trailers);
    const o1 = addOrder(s, 'leipzig', 'prag');
    const o2 = addOrder(s, 'prag', 'wien', { pickupStart: s.time + 12 * 60, pickupEnd: s.time + 30 * 60, deliveryEnd: s.time + 4 * 1440 });
    expect(applyCommand(s, ctx, 'p1', { type: 'queueDispatch', orderId: o2.id, vehicleId: v.id }).ok).toBe(false); // LKW noch frei
    expect(applyCommand(s, ctx, 'p1', { type: 'dispatch', orderId: o1.id, driverId: d.id, vehicleId: v.id, trailerId: t.id }).ok).toBe(true);
    const q = applyCommand(s, ctx, 'p1', { type: 'queueDispatch', orderId: o2.id, vehicleId: v.id });
    expect(q.ok).toBe(true);
    expect(o2.status).toBe('planned');
    const sched = vehicleSchedule(s, ctx, v.id);
    expect(sched.map((i) => i.kind)).toEqual(['trip', 'queued']);
    expect(sched[1].fromCityId).toBe('prag');
    expect(sched[1].pickup!).toBeGreaterThan(sched[0].end.time);

    expect(await runUntil(s, () => o1.status === 'delivered', 3 * 1440)).toBeGreaterThan(0);
    // direkt nach der Lieferung läuft die Folgefahrt mit demselben Fahrer und Auflieger
    expect(o2.status === 'planned' || o2.status === 'in_transit').toBe(true);
    const trip2 = s.trips[v.tripId!];
    expect(trip2.orderId).toBe(o2.id);
    expect(trip2.driverId).toBe(d.id);
    expect(trip2.trailerId).toBe(t.id);
    expect(v.queue).toEqual([]);
    expect(await runUntil(s, () => o2.status === 'delivered', 4 * 1440)).toBeGreaterThan(0);
    expect(v.cityId).toBe('wien');
  });

  it('Folgeauftrag kann aus der Planung genommen und dann storniert werden', () => {
    const s = newGame();
    const [d, v, t] = [first(s.drivers), first(s.vehicles), first(s.trailers)];
    const o1 = addOrder(s, 'leipzig', 'prag');
    const o2 = addOrder(s, 'prag', 'wien', { status: 'accepted' });
    applyCommand(s, ctx, 'p1', { type: 'dispatch', orderId: o1.id, driverId: d.id, vehicleId: v.id, trailerId: t.id });
    applyCommand(s, ctx, 'p1', { type: 'queueDispatch', orderId: o2.id, vehicleId: v.id });
    expect(applyCommand(s, ctx, 'p1', { type: 'unqueue', orderId: o2.id, vehicleId: v.id }).ok).toBe(true);
    expect(o2.status).toBe('accepted');
    applyCommand(s, ctx, 'p1', { type: 'queueDispatch', orderId: o2.id, vehicleId: v.id });
    expect(applyCommand(s, ctx, 'p1', { type: 'cancelOrder', orderId: o2.id }).ok).toBe(true);
    expect(o2.status).toBe('cancelled');
    expect(v.queue).toEqual([]);
  });

  it('ungeeigneter Folgeauftrag (falscher Auflieger) wird schon bei der Einplanung abgelehnt', () => {
    const s = newGame();
    const [d, v, t] = [first(s.drivers), first(s.vehicles), first(s.trailers)];
    const o1 = addOrder(s, 'leipzig', 'prag');
    const reefer = addOrder(s, 'prag', 'wien', { cargoId: 'chilled', trailerType: 'reefer' });
    applyCommand(s, ctx, 'p1', { type: 'dispatch', orderId: o1.id, driverId: d.id, vehicleId: v.id, trailerId: t.id });
    expect(applyCommand(s, ctx, 'p1', { type: 'queueDispatch', orderId: reefer.id, vehicleId: v.id }).ok).toBe(false);
  });
});

describe('Solo-LKW, Transporter und Teilladungen', () => {
  function addRigid(s: ReturnType<typeof newGame>, modelId: string) {
    const v = { ...first(s.vehicles), id: 'veh_' + modelId, modelId, fuelL: TRUCK_BY_ID[modelId].tankL, condition: 95, status: 'idle' as const, tripId: undefined };
    s.vehicles[v.id] = v;
    return v;
  }

  it('Solo-LKW fährt eine Teilladung ohne Auflieger, Nutzlast und Aufbau werden geprüft', async () => {
    const s = newGame();
    const tractorId = first(s.vehicles).id;
    const v = addRigid(s, 'nordwal-r75');
    const d = first(s.drivers);
    const ok = addOrder(s, 'leipzig', 'dresden', { cargoId: 'food', trailerType: 'box', weightT: 2.5, partial: true });
    const heavy = addOrder(s, 'leipzig', 'dresden', { cargoId: 'food', trailerType: 'box', weightT: 6 });
    const curtain = addOrder(s, 'leipzig', 'dresden', { weightT: 2 });
    expect(applyCommand(s, ctx, 'p1', { type: 'dispatch', orderId: heavy.id, driverId: d.id, vehicleId: v.id, trailerId: '' }).ok).toBe(false);
    expect(applyCommand(s, ctx, 'p1', { type: 'dispatch', orderId: curtain.id, driverId: d.id, vehicleId: v.id, trailerId: '' }).ok).toBe(false);
    expect(applyCommand(s, ctx, 'p1', { type: 'dispatch', orderId: ok.id, driverId: d.id, vehicleId: v.id, trailerId: first(s.trailers).id }).ok).toBe(false); // kein Auflieger am Solo-LKW
    expect(applyCommand(s, ctx, 'p1', { type: 'dispatch', orderId: ok.id, driverId: d.id, vehicleId: v.id, trailerId: '' }).ok).toBe(true);
    expect(first(s.trailers).status).toBe('idle');
    expect(s.vehicles[tractorId].status).toBe('idle');
    expect(await runUntil(s, () => ok.status === 'delivered', 2 * 1440)).toBeGreaterThan(0);
    expect(v.cityId).toBe('dresden');
  });

  it('Transporter zahlt keine Maut und ist bei Teilladungen günstiger als ein Sattelzug', () => {
    const s = newGame();
    const tractor = first(s.vehicles);
    const van = addRigid(s, 'trasko-v35');
    const d = first(s.drivers);
    const o = addOrder(s, 'leipzig', 'nuernberg', { cargoId: 'food', trailerType: 'box', weightT: 0.8, partial: true });
    const eVan = estimateTrip(s, ctx, { orderId: o.id, driverId: d.id, vehicleId: van.id, trailerId: '' })!;
    const eTruck = estimateTrip(s, ctx, { orderId: o.id, driverId: d.id, vehicleId: tractor.id, trailerId: first(s.trailers).id })!;
    expect(eVan.toll).toBe(0);
    expect(eTruck.toll).toBeGreaterThan(0);
    expect(eVan.totalCost).toBeLessThan(eTruck.totalCost * 0.7);
  });

  it('der Markt erzeugt Teilladungen: klein, regional, höherer Preis je Tonne', () => {
    const s = newGame(11);
    const partial = Object.values(s.orders).filter((o) => o.partial);
    const full = Object.values(s.orders).filter((o) => !o.partial && ['curtain', 'box', 'reefer'].includes(o.trailerType));
    expect(partial.length).toBeGreaterThan(20);
    for (const o of partial) {
      expect(o.weightT).toBeLessThanOrEqual(8);
      expect(['curtain', 'box', 'reefer']).toContain(o.trailerType);
    }
    const perTonKm = (l: typeof partial) => l.reduce((a, o) => a + o.payment / (o.weightT * o.distanceKm), 0) / l.length;
    expect(perTonKm(partial)).toBeGreaterThan(perTonKm(full) * 2);
    const air = (o: (typeof partial)[number]) => haversineKm([CITY_BY_ID[o.fromCityId].lon, CITY_BY_ID[o.fromCityId].lat], [CITY_BY_ID[o.toCityId].lon, CITY_BY_ID[o.toCityId].lat]);
    expect(Math.max(...partial.map(air))).toBeLessThanOrEqual(650); // Luftlinie: Verteilerverkehr in der Region
  });
});

describe('Beiladung (mehrere Aufträge auf einem Fahrzeug)', () => {
  function setup() {
    const s = newGame();
    const v = { ...first(s.vehicles), id: 'veh_r18', modelId: 'brennkraft-r18', fuelL: TRUCK_BY_ID['brennkraft-r18'].tankL, condition: 95, status: 'idle' as const, tripId: undefined };
    s.vehicles[v.id] = v;
    const d = first(s.drivers);
    const a = addOrder(s, 'leipzig', 'muenchen', { weightT: 4, partial: true, deliveryEnd: s.time + 2 * 1440 });
    expect(applyCommand(s, ctx, 'p1', { type: 'dispatch', orderId: a.id, driverId: d.id, vehicleId: v.id, trailerId: '' }).ok).toBe(true);
    return { s, v, d, a };
  }

  it('zweiter Auftrag auf der Strecke wird zugeladen, beide werden in sinnvoller Reihenfolge zugestellt', async () => {
    const { s, v, a } = setup();
    const b = addOrder(s, 'erfurt', 'nuernberg', { weightT: 3, partial: true, pickupStart: s.time, pickupEnd: s.time + 12 * 60, deliveryEnd: s.time + 2 * 1440 });
    const { plan } = planCoLoad(s, ctx, v.id, b.id);
    expect(plan).not.toBeNull();
    expect(plan!.extraKm).toBeLessThan(30); // liegt auf dem Weg
    expect(applyCommand(s, ctx, 'p1', { type: 'coLoad', orderId: b.id, vehicleId: v.id }).ok).toBe(true);
    const trip = s.trips[v.tripId!];
    expect(trip.stops!.map((st) => `${st.kind}:${st.cityId}`)).toEqual(['pickup:leipzig', 'pickup:erfurt', 'delivery:nuernberg', 'delivery:muenchen']);
    expect(b.status).toBe('planned');
    expect(b.tripId).toBe(trip.id);
    const sched = vehicleSchedule(s, ctx, v.id)[0];
    expect(sched.stops!.length).toBe(4);
    // Planung, Plantafel und tatsächlicher Ablauf passen zusammen
    const schedEta = sched.stops!.find((st) => st.kind === 'delivery' && st.orderId === b.id)!.eta;
    expect(Math.abs(schedEta - plan!.deliveryEta)).toBeLessThan(60);
    expect(await runUntil(s, () => b.status === 'delivered', 2 * 1440)).toBeGreaterThan(0);
    expect(Math.abs(b.deliveredAt! - plan!.deliveryEta)).toBeLessThan(120);
    expect(a.status).toBe('in_transit');
    expect(await runUntil(s, () => a.status === 'delivered', 2 * 1440)).toBeGreaterThan(0);
    expect(v.cityId).toBe('muenchen');
    expect(Object.values(s.invoices).filter((i) => i.orderId === a.id || i.orderId === b.id).length).toBe(2);
    expect(v.status).toBe('idle');
  });

  it('Nutzlast wird über die ganze Haltefolge eingehalten, zu schwere Beiladungen werden abgelehnt', () => {
    const { s, v } = setup();
    const b = addOrder(s, 'erfurt', 'nuernberg', { weightT: 3 });
    applyCommand(s, ctx, 'p1', { type: 'coLoad', orderId: b.id, vehicleId: v.id });
    // 6 t passen nur, wenn vorher genug abgeladen wurde
    const c = addOrder(s, 'wuerzburg', 'ingolstadt', { weightT: 6, deliveryEnd: s.time + 5 * 1440 });
    const { plan } = planCoLoad(s, ctx, v.id, c.id);
    expect(plan).not.toBeNull();
    const trip = { ...s.trips[v.tripId!], stops: plan!.stops };
    for (let i = 0; i < plan!.stops.length; i++) {
      const w = ordersOnBoard(trip, i).reduce((sum, id) => sum + s.orders[id].weightT, 0);
      expect(w).toBeLessThanOrEqual(9);
    }
    const heavy = addOrder(s, 'erfurt', 'nuernberg', { weightT: 10 });
    expect(applyCommand(s, ctx, 'p1', { type: 'coLoad', orderId: heavy.id, vehicleId: v.id }).ok).toBe(false);
    const reefer = addOrder(s, 'erfurt', 'nuernberg', { cargoId: 'chilled', trailerType: 'reefer', weightT: 1 });
    expect(applyCommand(s, ctx, 'p1', { type: 'coLoad', orderId: reefer.id, vehicleId: v.id }).ok).toBe(false);
  });

  it('noch nicht abgeholte Beiladung kann herausgenommen und storniert werden', () => {
    const { s, v, a } = setup();
    const b = addOrder(s, 'erfurt', 'nuernberg', { weightT: 3 });
    applyCommand(s, ctx, 'p1', { type: 'coLoad', orderId: b.id, vehicleId: v.id });
    expect(applyCommand(s, ctx, 'p1', { type: 'removeCoLoad', orderId: a.id }).ok).toBe(false); // Hauptauftrag bleibt
    expect(applyCommand(s, ctx, 'p1', { type: 'removeCoLoad', orderId: b.id }).ok).toBe(true);
    expect(b.status).toBe('accepted');
    expect(s.trips[v.tripId!].stops!.length).toBe(2);
    applyCommand(s, ctx, 'p1', { type: 'coLoad', orderId: b.id, vehicleId: v.id });
    expect(applyCommand(s, ctx, 'p1', { type: 'cancelOrder', orderId: b.id }).ok).toBe(true);
    expect(s.trips[v.tripId!].stops!.every((st) => st.orderId === a.id)).toBe(true);
  });
});

describe('Verkehrsstörungen und Umleitung', () => {
  function closure(s: ReturnType<typeof newGame>, a: string, b: string, hours = 6): Disruption {
    const d: Disruption = { id: 'dis_' + a + b, kind: 'closure', a, b, cause: 'Test', from: s.time, until: s.time + hours * 60, speedFactor: 0 };
    s.disruptions.push(d);
    return d;
  }

  it('Sperrung auf der Route führt zur automatischen Umleitung, die Ware kommt trotzdem an', async () => {
    const s = newGame();
    const [d, v, t] = [first(s.drivers), first(s.vehicles), first(s.trailers)];
    const o = addOrder(s, 'leipzig', 'muenchen');
    applyCommand(s, ctx, 'p1', { type: 'dispatch', orderId: o.id, driverId: d.id, vehicleId: v.id, trailerId: t.id });
    await runUntil(s, () => o.status === 'in_transit', 600);
    const trip = s.trips[v.tripId!];
    const before = trip.legs[trip.legIndex].nodes.join(' ');
    expect(before).toContain('nuernberg ingolstadt');
    closure(s, 'nuernberg', 'ingolstadt');
    rerouteAffected(s, ctx);
    const after = trip.legs[trip.legIndex].nodes.join(' ');
    expect(after).not.toContain('nuernberg ingolstadt');
    expect(after.endsWith('muenchen')).toBe(true);
    expect(s.log.some((l) => l.text.startsWith('Umleitung'))).toBe(true);
    // neue Planungen umfahren die Sperrung ebenfalls
    expect(routeNow(s, ctx, 'nuernberg', 'muenchen')!.nodes.join(' ')).not.toContain('nuernberg ingolstadt');
    expect(await runUntil(s, () => o.status === 'delivered', 2 * 1440)).toBeGreaterThan(0);
  });

  it('Stau verlängert die voraussichtliche Fahrzeit; Störungen laufen ab und entstehen neu', () => {
    const s = newGame();
    const [d, v, t] = [first(s.drivers), first(s.vehicles), first(s.trailers)];
    const o = addOrder(s, 'leipzig', 'nuernberg');
    applyCommand(s, ctx, 'p1', { type: 'dispatch', orderId: o.id, driverId: d.id, vehicleId: v.id, trailerId: t.id });
    const trip = s.trips[v.tripId!];
    const eta0 = tripEta(s, ctx, trip);
    s.disruptions.push({ id: 'dis_jam', kind: 'jam', a: 'erfurt', b: 'wuerzburg', cause: 'Stau', from: s.time, until: s.time + 600, speedFactor: 0.4 });
    expect(tripEta(s, ctx, trip)).toBeGreaterThan(eta0 + 60);
    s.time += 601;
    updateDisruptions(s, ctx);
    expect(s.disruptions.find((x) => x.id === 'dis_jam')).toBeUndefined();
    let created = 0;
    for (let h = 0; h < 200; h++) {
      s.time += 60;
      const n = s.disruptions.length;
      updateDisruptions(s, ctx);
      if (s.disruptions.length > n) created++;
    }
    expect(created).toBeGreaterThan(10);
    expect(s.disruptions.length).toBeLessThanOrEqual(6);
  });

  it('Störungen vor eigenen LKW richten sich nach der Strecke: selten, höchstens eine voraus, Stau kostet unter einer Stunde', () => {
    const s = newGame(5);
    s.difficulty.eventFactor = 1;
    const [d, v, t] = [first(s.drivers), first(s.vehicles), first(s.trailers)];
    const o = addOrder(s, 'leipzig', 'muenchen');
    applyCommand(s, ctx, 'p1', { type: 'dispatch', orderId: o.id, driverId: d.id, vehicleId: v.id, trailerId: t.id });
    const trip = s.trips[v.tripId!];
    trip.activity = 'driving';
    trip.phase = 'to_delivery';
    trip.legIndex = trip.legs.length - 1;
    trip.progressKm = 0;
    let jams = 0;
    let closures = 0;
    // 2.000 Fahrstunden ≈ 140.000 km
    for (let h = 0; h < 2000; h++) {
      s.time += 60;
      s.disruptions = [];
      updateDisruptions(s, ctx);
      const mine = s.disruptions.filter((x) => s.log.some((l) => l.ref?.id === trip.id && l.t === s.time && l.text.startsWith('Verkehr:') && l.text.includes(disruptionLabel(x))));
      expect(mine.length).toBeLessThanOrEqual(1);
      for (const x of mine) {
        if (x.kind === 'closure') closures++;
        else {
          jams++;
          const e = ctx.net.edgeBetween(x.a, x.b)!;
          expect(e.truckMin * (1 / x.speedFactor - 1)).toBeLessThan(60);
        }
      }
    }
    // erwartet ≈ 140 Staus und ≈ 17 Sperrungen
    expect(jams).toBeGreaterThan(80);
    expect(jams).toBeLessThan(220);
    expect(closures).toBeLessThan(40);
  });

  it('Spielstände der Version 2 erhalten Halte je Fahrt und eine leere Störungsliste', () => {
    const s = newGame();
    const [d, v, t] = [first(s.drivers), first(s.vehicles), first(s.trailers)];
    const o = addOrder(s, 'leipzig', 'prag');
    applyCommand(s, ctx, 'p1', { type: 'dispatch', orderId: o.id, driverId: d.id, vehicleId: v.id, trailerId: t.id });
    const old = JSON.parse(JSON.stringify(s));
    delete old.disruptions;
    for (const tr of Object.values(old.trips) as Record<string, unknown>[]) delete tr.stops;
    const loaded = deserializeSave(serializeSave(old, 'alt').replace(`"version":${STATE_VERSION}`, '"version":2'));
    expect(loaded.disruptions).toEqual([]);
    expect(loaded.trips[v.tripId!].stops!.map((st) => st.cityId)).toEqual(['leipzig', 'prag']);
  });
});

describe('Rahmenverträge', () => {
  function contract(s: ReturnType<typeof newGame>, opts: Partial<Contract> = {}): Contract {
    const cust = first(s.customers);
    const c: Contract = {
      id: 'con_test', customerId: cust.id, cargoId: 'pallets', fromCityId: 'leipzig', toCityId: 'dresden', trailerType: 'curtain', qualifications: [],
      weightT: 14, distanceKm: 115, weekdays: [0, 1, 2, 3, 4], pickupHour: 8, paymentPerTour: 600_00, penaltyMissed: 180_00, weeks: 1, regular: true,
      status: 'offered', offerExpires: s.time + 3 * MIN_PER_DAY, stats: { tours: 0, delivered: 0, late: 0, missed: 0 }, ...opts,
    };
    s.contracts[c.id] = c;
    return c;
  }

  it('Stammkunden bieten Verträge an; angenommene Verträge erzeugen ihre Touren selbst', async () => {
    const s = newGame();
    const cust = first(s.customers);
    cust.deliveries = 5;
    cust.satisfaction = 80;
    let offer: Contract | null = null;
    for (let i = 0; i < 20 && !offer?.regular; i++) offer = generateContractOffer(s, ctx);
    expect(offer).not.toBeNull();
    expect(offer!.paymentPerTour).toBeGreaterThan(0);
    expect(offer!.weekdays.length).toBeGreaterThanOrEqual(1);

    const c = contract(s);
    expect(applyCommand(s, ctx, 'p1', { type: 'acceptContract', contractId: c.id }).ok).toBe(true);
    expect(c.status).toBe('active');
    const tours = () => Object.values(s.orders).filter((o) => o.contractId === c.id);
    expect(tours().length).toBe(1); // Tour für morgen sofort angelegt
    expect(tours()[0].status).toBe('accepted');
    expect(tours()[0].payment).toBe(600_00);
  });

  it('gefahrene Touren werden gezählt, gute Erfüllung führt zur Verlängerung', async () => {
    const s = newGame();
    const [d, v, t] = [first(s.drivers), first(s.vehicles), first(s.trailers)];
    s.difficulty.eventFactor = 0; // ohne Pannen und Verkehrsstörungen: reine Vertragslogik
    const c = contract(s);
    applyCommand(s, ctx, 'p1', { type: 'acceptContract', contractId: c.id });
    const sat0 = s.customers[c.customerId].satisfaction;
    // Disponent: jede Vertragstour mit dem einzigen Fahrzeug fahren, Rückfahrt nach Leipzig
    await runUntil(s, () => c.status === 'completed', 10 * 1440, () => {
      if (v.status !== 'idle' || d.status !== 'idle') return;
      const next = Object.values(s.orders).find((o) => o.contractId === c.id && o.status === 'accepted');
      if (next && v.cityId === 'leipzig' && s.time >= next.pickupStart - 3 * 60)
        applyCommand(s, ctx, 'p1', { type: 'dispatch', orderId: next.id, driverId: d.id, vehicleId: v.id, trailerId: t.id });
      else if (v.cityId !== 'leipzig') applyCommand(s, ctx, 'p1', { type: 'relocate', driverId: d.id, vehicleId: v.id, trailerId: t.id, toCityId: 'leipzig' });
    });
    expect(c.status).toBe('completed');
    expect(c.stats.tours).toBe(5); // Mo–Fr innerhalb einer Woche ab Dienstag
    expect(c.stats.delivered).toBe(5);
    expect(c.stats.missed).toBe(0);
    expect(s.customers[c.customerId].satisfaction).toBeGreaterThan(sat0);
    const renewal = Object.values(s.contracts).find((x) => x.status === 'offered' && x.fromCityId === 'leipzig' && x.toCityId === 'dresden');
    expect(renewal?.paymentPerTour).toBeGreaterThan(600_00);
  });

  it('nicht gefahrene Touren kosten Vertragsstrafe; Kündigung kostet eine Ablöse', async () => {
    const s = newGame();
    const c = contract(s, { weeks: 2 });
    applyCommand(s, ctx, 'p1', { type: 'acceptContract', contractId: c.id });
    const bal0 = s.company.account.balance;
    const sat0 = s.customers[c.customerId].satisfaction;
    await runUntil(s, () => c.stats.missed >= 2, 4 * 1440);
    expect(c.stats.missed).toBeGreaterThanOrEqual(2);
    expect(s.ledger.filter((l) => l.text.startsWith('Vertragsstrafe')).length).toBe(c.stats.missed);
    expect(s.company.account.balance).toBeLessThan(bal0);
    expect(s.customers[c.customerId].satisfaction).toBeLessThan(sat0);
    expect(applyCommand(s, ctx, 'p1', { type: 'cancelContract', contractId: c.id }).ok).toBe(true);
    expect(c.status).toBe('cancelled');
    expect(Object.values(s.orders).some((o) => o.contractId === c.id && o.status === 'accepted')).toBe(false);
  });
});

describe('Personalmanagement', () => {
  it('Urlaub und Schulung machen den Fahrer zeitweise unverfügbar; die Schulung bringt die Qualifikation', async () => {
    const s = newGame();
    const [d, v, t] = [first(s.drivers), first(s.vehicles), first(s.trailers)];
    d.qualifications = d.qualifications.filter((q) => q !== 'ADR');
    expect(applyCommand(s, ctx, 'p1', { type: 'sendVacation', driverId: d.id, days: 40 }).ok).toBe(false); // mehr als Resturlaub
    expect(applyCommand(s, ctx, 'p1', { type: 'sendVacation', driverId: d.id, days: 3 }).ok).toBe(true);
    expect(d.status).toBe('vacation');
    expect(d.vacationLeft).toBe(27);
    const o = addOrder(s, 'leipzig', 'dresden');
    expect(applyCommand(s, ctx, 'p1', { type: 'dispatch', orderId: o.id, driverId: d.id, vehicleId: v.id, trailerId: t.id }).ok).toBe(false);
    await runUntil(s, () => d.status === 'idle', 4 * 1440);
    expect(d.status).toBe('idle');

    const bal = s.company.account.balance;
    expect(applyCommand(s, ctx, 'p1', { type: 'trainDriver', driverId: d.id, course: 'adr' }).ok).toBe(true);
    expect(s.company.account.balance).toBe(bal - COURSES.adr.cost);
    expect(d.status).toBe('training');
    await runUntil(s, () => d.status === 'idle', 5 * 1440);
    expect(d.qualifications).toContain('ADR');
    expect(applyCommand(s, ctx, 'p1', { type: 'trainDriver', driverId: d.id, course: 'adr' }).ok).toBe(false);
  });

  it('dauerhaft unzufriedene Fahrer kündigen; mehr Gehalt kann die Kündigung abwenden', () => {
    const s = newGame();
    const d = first(s.drivers);
    d.hired = s.company.founded + 60; // kein „Fahrer der ersten Stunde“
    // Gehalt deutlich unter Markt → Zufriedenheit sinkt
    const market = marketSalary(d);
    expect(applyCommand(s, ctx, 'p1', { type: 'setDriverSalary', driverId: d.id, salary: market * 0.5 }).ok).toBe(false); // außerhalb des Rahmens
    expect(applyCommand(s, ctx, 'p1', { type: 'setDriverSalary', driverId: d.id, salary: market * 0.72 }).ok).toBe(true);
    d.satisfaction = 20;
    for (let i = 0; i < 8; i++) {
      s.time += MIN_PER_DAY;
      dailyPersonnel(s);
    }
    expect(d.leavesAt).toBeDefined();
    expect(applyCommand(s, ctx, 'p1', { type: 'talkToDriver', driverId: d.id }).ok).toBe(true);
    expect(applyCommand(s, ctx, 'p1', { type: 'talkToDriver', driverId: d.id }).ok).toBe(false); // Abstand zwischen Gesprächen
    expect(s.log.at(-1)!.text).toContain('Gehalt unter dem Marktniveau');
    expect(applyCommand(s, ctx, 'p1', { type: 'setDriverSalary', driverId: d.id, salary: market * 1.2 }).ok).toBe(true);
    for (let i = 0; i < 10 && d.leavesAt !== undefined; i++) {
      s.time += MIN_PER_DAY;
      dailyPersonnel(s);
    }
    expect(d.leavesAt).toBeUndefined();
    expect(s.drivers[d.id]).toBeDefined();
  });

  it('nach Ablauf der Kündigungsfrist verlässt der Fahrer die Firma', async () => {
    const s = newGame();
    const d = first(s.drivers);
    d.leavesAt = s.time + 120;
    d.satisfaction = 10;
    await runUntil(s, () => !s.drivers[d.id], 300);
    expect(s.drivers[d.id]).toBeUndefined();
  });
});

describe('Fahrzeugfinanzierung, Miete, Inzahlungnahme', () => {
  it('Finanzierung: nur Anzahlung sofort, Kredit mit Fahrzeug als Sicherheit, Ablöse beim Verkauf', () => {
    const s = newGame();
    s.company.account.balance = 50_000_00;
    const m = TRUCK_BY_ID['nordwal-r75'];
    const r = applyCommand(s, ctx, 'p1', { type: 'buyNewVehicle', modelId: m.id, financing: 'loan', loanMonths: 48 });
    expect(r.ok).toBe(true);
    const v = s.vehicles[(r as { id: string }).id];
    expect(s.company.account.balance).toBe(50_000_00 - Math.round(m.price * 0.1));
    const loan = s.company.loans.find((l) => l.vehicleId === v.id)!;
    expect(loan.remaining).toBe(m.price - Math.round(m.price * 0.1));
    expect(v.ownership).toBe('owned');
    const before = s.company.account.balance;
    expect(applyCommand(s, ctx, 'p1', { type: 'sellVehicle', vehicleId: v.id }).ok).toBe(true);
    expect(s.company.loans.find((l) => l.vehicleId === v.id)).toBeUndefined();
    // Erlös (90 % des Marktwerts) deckt hier genau die Restschuld (90 % des Kaufpreises)
    expect(s.company.account.balance).toBeLessThanOrEqual(before);
  });

  it('Inzahlungnahme rechnet den Wert des alten LKW an; Miete wird täglich abgerechnet', async () => {
    const s = newGame();
    s.company.account.balance = 200_000_00;
    const old = first(s.vehicles);
    old.ownership = 'owned';
    const credit = tradeInValue(s, old.id);
    const m = TRUCK_BY_ID['trasko-v35'];
    const bal = s.company.account.balance;
    const r = applyCommand(s, ctx, 'p1', { type: 'buyNewVehicle', modelId: m.id, financing: 'cash', tradeInVehicleId: old.id });
    expect(r.ok).toBe(true);
    expect(s.vehicles[old.id]).toBeUndefined();
    expect(s.company.account.balance).toBe(bal - m.price + credit);

    const r2 = applyCommand(s, ctx, 'p1', { type: 'buyNewVehicle', modelId: m.id, financing: 'rent' });
    const rented = s.vehicles[(r2 as { id: string }).id];
    expect(rented.ownership).toBe('rented');
    const rentCount = () => s.ledger.filter((l) => l.text === `Miete LKW ${rented.plate}`).length;
    await runUntil(s, () => rentCount() >= 2, 3 * 1440);
    expect(rentCount()).toBe(2);
    const b2 = s.company.account.balance;
    expect(applyCommand(s, ctx, 'p1', { type: 'sellVehicle', vehicleId: rented.id }).ok).toBe(true);
    expect(s.company.account.balance).toBe(b2); // Rückgabe ohne Gebühr
  });

  it('Spielstände der Version 3 erhalten Verträge und Urlaubsanspruch', () => {
    const s = newGame();
    const old = JSON.parse(JSON.stringify(s));
    delete old.contracts;
    for (const d of Object.values(old.drivers) as Record<string, unknown>[]) {
      delete d.vacationLeft;
      delete d.lastVacation;
    }
    const loaded = deserializeSave(serializeSave(old, 'alt').replace(`"version":${STATE_VERSION}`, '"version":3'));
    expect(loaded.contracts).toEqual({});
    expect(first(loaded.drivers).vacationLeft).toBe(30);
  });
});

describe('Unternehmensausbau: Stufen, Niederlassungen, Einrichtungen, Abteilungen', () => {
  /** Fügt Kopien des Start-LKW hinzu (für Stufenanforderungen und Disposition). */
  const addTrucks = (s: GameState, n: number) => {
    const v0 = first(s.vehicles);
    for (let i = 0; i < n; i++) {
      const id = `veh-x${i}`;
      s.vehicles[id] = { ...JSON.parse(JSON.stringify(v0)), id, plate: `X-${i}` };
    }
  };
  const reachLevel2 = (s: GameState) => {
    addTrucks(s, 2);
    s.company.totals.deliveries = 30;
    s.company.reputation = 40;
    dailyCompany(s);
  };

  it('Stufenaufstieg schaltet Niederlassungen frei; neue Fahrzeuge werden am gewählten Standort geliefert', () => {
    const s = newGame();
    s.company.account.balance = 500_000_00;
    expect(s.company.level).toBe(1);
    const denied = applyCommand(s, ctx, 'p1', { type: 'openBranch', cityId: 'hamburg', kind: 'office_yard' });
    expect(denied.ok).toBe(false);
    reachLevel2(s);
    expect(s.company.level).toBe(2);
    expect(s.log.some((l) => l.text.includes('Kleinspedition'))).toBe(true);

    const bal = s.company.account.balance;
    const r = applyCommand(s, ctx, 'p1', { type: 'openBranch', cityId: 'hamburg', kind: 'office_yard' });
    expect(r.ok).toBe(true);
    expect(s.company.account.balance).toBe(bal - LOCATION_DEFS.office_yard.deposit - BRANCH_SETUP_COST);
    expect(capacity(s).parking).toBe(LOCATION_DEFS.office_small.parking + LOCATION_DEFS.office_yard.parking);
    // Stufe 2 erlaubt nur zwei Standorte
    expect(applyCommand(s, ctx, 'p1', { type: 'openBranch', cityId: 'prag', kind: 'office_small' }).ok).toBe(false);

    const loc = s.company.locations.find((l) => l.cityId === 'hamburg')!;
    const buy = applyCommand(s, ctx, 'p1', { type: 'buyNewVehicle', modelId: 'trasko-v35', financing: 'cash', locationId: loc.id });
    expect(buy.ok).toBe(true);
    expect(s.vehicles[(buy as { id: string }).id].cityId).toBe('hamburg');
    // Monatliche Fixkosten enthalten die Miete der Niederlassung
    expect(monthlyFixedCosts(s).some((i) => i.label.includes('Hamburg'))).toBe(true);

    // Aufgeben kostet eine Monatsmiete; der Firmensitz bleibt
    expect(applyCommand(s, ctx, 'p1', { type: 'closeBranch', locationId: s.company.locations[0].id }).ok).toBe(false);
    for (const v of Object.values(s.vehicles)) if (v.cityId === 'hamburg') delete s.vehicles[v.id];
    for (const id of ['veh-x0', 'veh-x1']) delete s.vehicles[id];
    const b2 = s.company.account.balance;
    expect(applyCommand(s, ctx, 'p1', { type: 'closeBranch', locationId: loc.id }).ok).toBe(true);
    expect(s.company.locations.length).toBe(1);
    expect(s.company.account.balance).toBe(b2 - LOCATION_DEFS.office_yard.rent);
  });

  it('eigene Werkstatt wartet günstiger; das Fuhrparkmanagement schickt fällige LKW automatisch hin', async () => {
    const s = newGame();
    s.company.account.balance = 500_000_00;
    reachLevel2(s);
    const hq = s.company.locations[0];
    expect(applyCommand(s, ctx, 'p1', { type: 'buildFacility', locationId: hq.id, facility: 'workshop' }).ok).toBe(false); // kleines Büro reicht nicht
    expect(applyCommand(s, ctx, 'p1', { type: 'upgradeLocation', locationId: hq.id, kind: 'depot' }).ok).toBe(false); // erst ab Stufe 3
    expect(applyCommand(s, ctx, 'p1', { type: 'upgradeLocation', locationId: hq.id, kind: 'office_yard' }).ok).toBe(true);
    const v = first(s.vehicles);
    v.condition = 50;
    const external = serviceCost(s, v).cost;
    expect(applyCommand(s, ctx, 'p1', { type: 'buildFacility', locationId: hq.id, facility: 'workshop' }).ok).toBe(true);
    const own = serviceCost(s, v);
    expect(own.own).toBe(true);
    expect(own.cost).toBe(Math.round(external * 0.65));

    expect(applyCommand(s, ctx, 'p1', { type: 'hireStaff', dept: 'fleet', locationId: hq.id }).ok).toBe(true);
    await runUntil(s, () => v.status === 'workshop', 120);
    expect(v.status).toBe('workshop');
    expect(v.condition).toBe(100);
    expect(s.log.some((l) => l.text.startsWith('Fuhrparkmanagement'))).toBe(true);
  });

  it('Betriebstankstelle tankt bei Abfahrt günstiger voll', () => {
    const s = newGame();
    s.company.account.balance = 500_000_00;
    reachLevel2(s);
    const hq = s.company.locations[0];
    applyCommand(s, ctx, 'p1', { type: 'upgradeLocation', locationId: hq.id, kind: 'office_yard' });
    expect(applyCommand(s, ctx, 'p1', { type: 'buildFacility', locationId: hq.id, facility: 'fuel' }).ok).toBe(true);
    const v = first(s.vehicles);
    const tank = TRUCK_BY_ID[v.modelId].tankL;
    v.fuelL = tank * 0.4;
    const order = addOrder(s, 'leipzig', 'prag');
    const r = applyCommand(s, ctx, 'p1', { type: 'dispatch', orderId: order.id, driverId: first(s.drivers).id, vehicleId: v.id, trailerId: first(s.trailers).id });
    expect(r.ok).toBe(true);
    expect(v.fuelL).toBe(tank);
    const entry = s.ledger.find((l) => l.category === 'fuel' && l.text.startsWith('Betriebstankstelle'))!;
    expect(entry.amount).toBe(-Math.round(tank * 0.6 * s.market.diesel * 0.91));
  });

  it('Abteilungen: Arbeitsplätze, Gehälter, Disposition und Beförderung', () => {
    const s = newGame();
    s.company.account.balance = 500_000_00;
    addTrucks(s, 7); // 8 Fahrzeuge → 3 ohne Disposition
    const d = first(s.drivers);
    expect(dispatchShortfall(s)).toBe(3);
    expect(satisfactionFactors(s, d).reasons.some((r) => r.text === 'überlastete Disposition')).toBe(true);
    const hq = s.company.locations[0];
    expect(applyCommand(s, ctx, 'p1', { type: 'hireStaff', dept: 'dispatch', locationId: hq.id }).ok).toBe(true);
    expect(dispatchShortfall(s)).toBe(0);
    expect(monthlyFixedCosts(s).some((i) => i.label.includes('(Disposition)'))).toBe(true);
    // kleines Büro: nur ein Arbeitsplatz
    expect(applyCommand(s, ctx, 'p1', { type: 'hireStaff', dept: 'accounting', locationId: hq.id }).ok).toBe(false);
    applyCommand(s, ctx, 'p1', { type: 'upgradeLocation', locationId: hq.id, kind: 'office_yard' });
    expect(applyCommand(s, ctx, 'p1', { type: 'hireStaff', dept: 'accounting', locationId: hq.id }).ok).toBe(true);
    expect(accountingRiskFactor(s)).toBeCloseTo(0.55);

    d.experience = 40;
    expect(applyCommand(s, ctx, 'p1', { type: 'promoteDriver', driverId: d.id, dept: 'sales' }).ok).toBe(false);
    d.experience = 70;
    expect(applyCommand(s, ctx, 'p1', { type: 'promoteDriver', driverId: d.id, dept: 'sales' }).ok).toBe(true);
    expect(s.drivers[d.id]).toBeUndefined();
    const m = s.company.staff.find((x) => x.name === d.name && x.promoted)!;
    expect(m.promoted).toBe(true);
    expect(m.salary).toBeGreaterThanOrEqual(d.salary);
    expect(salesVolumeFactor(s)).toBeCloseTo(1.12);
  });

  it('Lagerhalle ab Stufe 3: Auslastung steigt, Lagererlöse werden monatlich gebucht', () => {
    const s = newGame();
    s.company.account.balance = 500_000_00;
    reachLevel2(s);
    const hq = s.company.locations[0];
    applyCommand(s, ctx, 'p1', { type: 'upgradeLocation', locationId: hq.id, kind: 'office_yard' });
    expect(applyCommand(s, ctx, 'p1', { type: 'buildFacility', locationId: hq.id, facility: 'warehouse' }).ok).toBe(false);
    s.company.level = 3;
    expect(applyCommand(s, ctx, 'p1', { type: 'buildFacility', locationId: hq.id, facility: 'warehouse' }).ok).toBe(true);
    s.company.reputation = 70;
    const u0 = hq.warehouseUtil!;
    for (let i = 0; i < 30; i++) dailyCompany(s);
    expect(hq.warehouseUtil!).toBeGreaterThan(u0);
    const bal = s.company.account.balance;
    monthlyCompany(s);
    expect(s.company.account.balance - bal).toBe(warehouseIncome(hq));
    expect(s.ledger.at(-1)!.category).toBe('storage');
    expect(companyValue(s, () => 0)).toBeGreaterThan(s.company.account.balance);
  });

  it('Spielstände der Version 4 erhalten Einrichtungen, Personal und Stufe', () => {
    const s = newGame();
    const old = JSON.parse(JSON.stringify(s));
    delete old.company.staff;
    delete old.company.level;
    for (const l of old.company.locations) delete l.facilities;
    const loaded = deserializeSave(serializeSave(old, 'alt').replace(`"version":${STATE_VERSION}`, '"version":4'));
    expect(loaded.company.staff).toEqual([]);
    expect(loaded.company.level).toBe(1);
    expect(loaded.company.locations[0].facilities).toEqual([]);
  });
});

describe('KI-Disponenten (Automatiktest)', () => {
  /** Leere Börse mit kontrollierten Angeboten und einem Disponenten der gewünschten Stufe. */
  const setup = (grade: 'junior' | 'regular' | 'senior' = 'senior') => {
    const s = newGame(7);
    s.company.account.balance = 200_000_00;
    for (const o of Object.values(s.orders)) delete s.orders[o.id];
    const hq = s.company.locations[0];
    expect(applyCommand(s, ctx, 'p1', { type: 'hireStaff', dept: 'dispatch', locationId: hq.id, grade }).ok).toBe(true);
    return s;
  };

  it('ohne Disponent ist keine Automatik möglich', () => {
    const s = newGame();
    expect(applyCommand(s, ctx, 'p1', { type: 'setAutoDispatch', mode: 'auto' }).ok).toBe(false);
  });

  it('wählt anhand der Regeln den wirtschaftlich sinnvollen Auftrag und disponiert ihn', () => {
    const s = setup();
    const good = addOrder(s, 'leipzig', 'prag', { payment: 1_600_00 });
    const poor = addOrder(s, 'leipzig', 'dresden', { payment: 90_00 });
    const far = addOrder(s, 'hamburg', 'berlin', { payment: 2_400_00 });
    const better = addOrder(s, 'leipzig', 'wien', { payment: 1_900_00, cargoId: 'chemicals' }); // ADR + Tank: nicht passend
    expect(applyCommand(s, ctx, 'p1', { type: 'setAutoDispatch', mode: 'auto', rules: { maxEmptyKm: 150, minProfit: 200_00 } }).ok).toBe(true);
    runAutoDispatch(s, ctx);
    const v = first(s.vehicles);
    expect(v.status).toBe('on_trip');
    expect(s.trips[v.tripId!].orderId).toBe(good.id);
    expect(good.status).toBe('planned');
    for (const o of [poor, far, better]) expect(o.status).toBe('offered');
    expect(s.autoDispatch.stats.planned).toBe(1);
    expect(s.log.some((l) => l.text.startsWith('Disponent'))).toBe(true);
  });

  it('Regeln greifen: Ladungsart, Einsatzländer und Mindestgewinn', () => {
    const s = setup();
    addOrder(s, 'leipzig', 'prag', { payment: 1_600_00 });
    applyCommand(s, ctx, 'p1', { type: 'setAutoDispatch', mode: 'auto', rules: { countries: ['DE'] } });
    runAutoDispatch(s, ctx);
    expect(first(s.vehicles).status).toBe('idle'); // Prag liegt außerhalb der Einsatzländer
    applyCommand(s, ctx, 'p1', { type: 'setAutoDispatch', rules: { countries: [], cargoIds: ['grain'] } });
    runAutoDispatch(s, ctx);
    expect(first(s.vehicles).status).toBe('idle'); // falsche Ladungsart
    applyCommand(s, ctx, 'p1', { type: 'setAutoDispatch', rules: { cargoIds: [], minProfit: 5_000_00 } });
    runAutoDispatch(s, ctx);
    expect(first(s.vehicles).status).toBe('idle'); // Mindestgewinn nicht erreicht
    applyCommand(s, ctx, 'p1', { type: 'setAutoDispatch', rules: { minProfit: 100_00 } });
    runAutoDispatch(s, ctx);
    expect(first(s.vehicles).status).toBe('on_trip');
  });

  it('angenommene Aufträge haben Vorrang, auch wenn ein Angebot lukrativer wäre', () => {
    const s = setup();
    const committed = addOrder(s, 'leipzig', 'dresden', { payment: 400_00, status: 'accepted' });
    addOrder(s, 'leipzig', 'prag', { payment: 2_000_00 });
    applyCommand(s, ctx, 'p1', { type: 'setAutoDispatch', mode: 'auto' });
    runAutoDispatch(s, ctx);
    expect(s.trips[first(s.vehicles).tripId!].orderId).toBe(committed.id);
  });

  it('teilautomatisch: Vorschlag statt Ausführung; Übernahme disponiert', () => {
    const s = setup();
    const good = addOrder(s, 'leipzig', 'prag', { payment: 1_600_00 });
    applyCommand(s, ctx, 'p1', { type: 'setAutoDispatch', mode: 'assist' });
    runAutoDispatch(s, ctx);
    expect(first(s.vehicles).status).toBe('idle');
    expect(s.autoDispatch.suggestions.length).toBe(1);
    const sug = s.autoDispatch.suggestions[0];
    expect(sug.orderId).toBe(good.id);
    runAutoDispatch(s, ctx); // kein doppelter Vorschlag
    expect(s.autoDispatch.suggestions.length).toBe(1);
    expect(applyCommand(s, ctx, 'p1', { type: 'acceptSuggestion', suggestionId: sug.id }).ok).toBe(true);
    expect(first(s.vehicles).status).toBe('on_trip');
    expect(s.autoDispatch.suggestions.length).toBe(0);
  });

  it('plant Rückladungen als Folgeauftrag für fahrende LKW', () => {
    const s = setup();
    addOrder(s, 'leipzig', 'prag', { payment: 1_600_00 });
    applyCommand(s, ctx, 'p1', { type: 'setAutoDispatch', mode: 'auto', rules: { safeDeadlines: false } });
    runAutoDispatch(s, ctx);
    const v = first(s.vehicles);
    expect(v.status).toBe('on_trip');
    const back = addOrder(s, 'prag', 'leipzig', { payment: 1_400_00, pickupStart: s.time + 6 * 60, pickupEnd: s.time + 30 * 60, deliveryEnd: s.time + 3 * 1440 });
    runAutoDispatch(s, ctx);
    expect(v.queue?.map((j) => j.orderId)).toEqual([back.id]);
  });

  it('Kompetenz bestimmt Suchtiefe; erfahrene Disponenten wählen im Mittel profitabler', () => {
    expect(searchDepth(20)).toBeLessThan(searchDepth(90));
    const pickProfit = (grade: 'junior' | 'senior', seed: number) => {
      const s = setup(grade);
      s.rng = seed;
      // viele Angebote mit unterschiedlichem Ertrag in der Region
      const dests = ['prag', 'dresden', 'berlin', 'nuernberg', 'muenchen', 'hamburg', 'wien', 'frankfurt'];
      dests.forEach((d, i) => addOrder(s, 'leipzig', d, { payment: (600 + ((i * 37) % 9) * 160) * 100, deliveryEnd: s.time + 4 * 1440 }));
      applyCommand(s, ctx, 'p1', { type: 'setAutoDispatch', mode: 'auto', rules: { minProfit: -100_000_00 } });
      runAutoDispatch(s, ctx);
      const v = first(s.vehicles);
      const o = s.orders[s.trips[v.tripId!].orderId!];
      return estimateTrip(s, ctx, { orderId: o.id, driverId: first(s.drivers).id, vehicleId: v.id, trailerId: first(s.trailers).id }, { cityId: 'leipzig', time: s.time })?.profit ?? 0;
    };
    let junior = 0;
    let senior = 0;
    for (let i = 1; i <= 12; i++) {
      junior += pickProfit('junior', i * 7919);
      senior += pickProfit('senior', i * 7919);
    }
    expect(senior).toBeGreaterThanOrEqual(junior);
  });

  it('Spielstände der Version 5 erhalten die KI-Disposition', () => {
    const s = newGame();
    const old = JSON.parse(JSON.stringify(s));
    delete old.autoDispatch;
    old.company.staff = [{ id: 'stf-1', name: 'A', dept: 'dispatch', salary: 3_600_00, hired: 0, locationId: old.company.locations[0].id }];
    const loaded = deserializeSave(serializeSave(old, 'alt').replace(`"version":${STATE_VERSION}`, '"version":5'));
    expect(loaded.autoDispatch.mode).toBe('manual');
    expect(loaded.company.staff[0].skill).toBe(50);
  });
});

describe('Lebenssimulation: Bedürfnisse, Work-Life-Balance, Wohnen, Beziehungen', () => {
  const life = (s: GameState, action: LifeAction) => applyCommand(s, ctx, 'p1', { type: 'life', action });
  const me = (s: GameState) => s.players.p1.character;

  it('der Arbeitsstil bestimmt Stress und Energie – und wie viele Fahrzeuge die Geschäftsführung selbst disponiert', () => {
    const busy = newGame();
    const calm = newGame();
    calm.company.account.balance = 100_000_00;
    applyCommand(calm, ctx, 'p1', { type: 'hireStaff', dept: 'dispatch', locationId: calm.company.locations[0].id });
    expect(life(newGame(), { kind: 'workStyle', style: 'delegate' }).ok).toBe(false); // ohne Disponent nicht möglich
    expect(life(calm, { kind: 'workStyle', style: 'delegate' }).ok).toBe(true);
    for (let i = 0; i < 30; i++) {
      dailyLife(busy);
      dailyLife(calm);
    }
    expect(me(busy).needs.stress).toBeGreaterThan(me(calm).needs.stress + 15);
    expect(me(busy).needs.energy).toBeLessThan(me(calm).needs.energy - 15);
    expect(ceoManagedVehicles(busy)).toBeGreaterThan(ceoManagedVehicles(calm));
  });

  it('anhaltender Stress führt zur Erschöpfung; dann disponiert niemand aus der Geschäftsführung', () => {
    const s = newGame();
    expect(ceoManagedVehicles(s)).toBeGreaterThan(0);
    // lange Tage plus Geldsorgen privat und in der Firma
    me(s).privateAccount.balance = -1_000_00;
    s.company.account.balance = -20_000_00;
    for (let i = 0; i < 40 && !me(s).sickUntil; i++) {
      me(s).needs.leisure = 0;
      dailyLife(s);
    }
    expect(me(s).sickUntil).toBeGreaterThan(s.time);
    expect(ceoManagedVehicles(s)).toBe(0);
    expect(life(s, { kind: 'activity', activity: 'cinema' }).ok).toBe(false);
    expect(s.log.some((l) => l.text.includes('erschöpft'))).toBe(true);
  });

  it('Freizeitaktivitäten kosten Privatgeld, wirken auf die Bedürfnisse und belegen Zeit', () => {
    const s = newGame();
    const company0 = s.company.account.balance;
    const priv0 = me(s).privateAccount.balance;
    const stress0 = me(s).needs.stress;
    expect(life(s, { kind: 'activity', activity: 'wellness' }).ok).toBe(true);
    expect(me(s).privateAccount.balance).toBe(priv0 - ACTIVITIES.wellness.cost);
    expect(s.company.account.balance).toBe(company0);
    expect(me(s).needs.stress).toBeLessThan(stress0);
    expect(life(s, { kind: 'activity', activity: 'cinema' }).ok).toBe(false); // noch beschäftigt
    expect(isAway(s, me(s))).toBe(true);
    s.time += 9 * 60;
    expect(life(s, { kind: 'activity', activity: 'course', skill: 'negotiation' }).ok).toBe(true);
    expect(me(s).skills.negotiation).toBe(35);
    expect(negotiationBonus(s)).toBeGreaterThan(0);
  });

  it('Haus mit Immobilienkredit: Bank prüft die Rate, Monatsabrechnung bucht Zins und Tilgung privat', () => {
    const s = newGame();
    const c = me(s);
    c.privateAccount.balance = 120_000_00;
    expect(life(s, { kind: 'moveHome', home: 'house', mortgage: true }).ok).toBe(false); // Rate zu hoch für 2.400 € Gehalt
    c.salary = 6_000_00;
    expect(life(s, { kind: 'moveHome', home: 'house', mortgage: true }).ok).toBe(true);
    expect(c.home).toBe('house');
    expect(c.mortgage!.remaining).toBe(Math.round(HOMES.house.price! * 0.8));
    expect(c.privateAccount.balance).toBe(120_000_00 - HOMES.house.price! * 0.2 - MOVING_COST);
    const rest = c.mortgage!.remaining;
    const company0 = s.company.account.balance;
    processMonthEnd(s);
    expect(c.mortgage!.remaining).toBeLessThan(rest);
    expect(s.ledger.some((l) => l.account === 'private:p1' && l.text === 'Zinsen Immobilienkredit')).toBe(true);
    expect(s.ledger.some((l) => l.account === 'company' && l.text.includes('Immobilien'))).toBe(false);
    expect(s.company.account.balance).toBeLessThan(company0); // nur das GF-Gehalt
    expect(goalDone(s, c, 'own_home')).toBe(true);
    expect(privateWealth(c)).toBeGreaterThan(c.privateAccount.balance);
  });

  it('Beziehungen: Kontakt pflegt Freundschaften, aus Nähe wird Partnerschaft, Familie braucht Platz', () => {
    const s = newGame(3);
    const c = me(s);
    c.privateAccount.balance = 50_000_00;
    expect(life(s, { kind: 'activity', activity: 'friends' }).ok).toBe(true);
    const friend = c.relations.find((r) => r.kind === 'friend')!;
    expect(friend).toBeDefined();
    expect(life(s, { kind: 'relation', relationId: friend.id, action: 'propose' }).ok).toBe(false); // zu wenig Nähe
    friend.closeness = 100;
    c.needs.happiness = 100;
    let tries = 0;
    while (!c.relations.some((r) => r.kind === 'partner') && tries++ < 10) {
      friend.closeness = 100;
      life(s, { kind: 'relation', relationId: friend.id, action: 'propose' });
    }
    expect(friend.kind).toBe('partner');
    expect(life(s, { kind: 'relation', relationId: friend.id, action: 'family' }).ok).toBe(false); // kleine Wohnung
    expect(life(s, { kind: 'moveHome', home: 'apartment_large' }).ok).toBe(true);
    expect(life(s, { kind: 'relation', relationId: friend.id, action: 'family' }).ok).toBe(true);
    s.time = c.babyDue!;
    dailyLife(s);
    expect(c.relations.some((r) => r.kind === 'child')).toBe(true);
    expect(monthlyPrivateCosts(c).find((i) => i.label === 'Lebenshaltung')!.amount).toBe(LIVING_BASE + CHILD_COST);

    // ohne Kontakt kühlt eine Freundschaft ab
    const other = c.relations.find((r) => r.kind === 'friend') ?? (life(s, { kind: 'activity', activity: 'friends' }), c.relations.find((r) => r.kind === 'friend'));
    if (other) {
      const before = other.closeness;
      other.lastContact = s.time - 20 * MIN_PER_DAY;
      dailyLife(s);
      expect(other.closeness).toBeLessThan(before);
    }
  });

  it('Urlaub ohne Disponent: die Disposition bleibt liegen, die Fahrer werden unzufriedener', () => {
    const s = newGame();
    const v0 = first(s.vehicles);
    for (let i = 0; i < 4; i++) s.vehicles[`veh-l${i}`] = { ...JSON.parse(JSON.stringify(v0)), id: `veh-l${i}` };
    expect(dispatchShortfall(s)).toBe(0);
    expect(life(s, { kind: 'vacation', vacation: 'week' }).ok).toBe(true);
    expect(dispatchShortfall(s)).toBe(5);
    expect(satisfactionFactors(s, first(s.drivers)).reasons.some((r) => r.text === 'überlastete Disposition')).toBe(true);
    expect(me(s).needs.stress).toBeLessThan(30);
  });

  it('Gewinnausschüttung: Firmengeld aufs Privatkonto, abzüglich Kapitalertragsteuer, nur aus Guthaben', () => {
    const s = newGame();
    const company0 = s.company.account.balance;
    const priv0 = me(s).privateAccount.balance;
    expect(applyCommand(s, ctx, 'p1', { type: 'payDividend', amount: company0 + 100_00 }).ok).toBe(false);
    expect(applyCommand(s, ctx, 'p1', { type: 'payDividend', amount: 10_000_00 }).ok).toBe(true);
    expect(s.company.account.balance).toBe(company0 - 10_000_00);
    expect(me(s).privateAccount.balance).toBe(priv0 + 10_000_00 - Math.round(10_000_00 * DIVIDEND_TAX));
  });

  it('Spielstände der Version 6 erhalten die Lebenssimulation', () => {
    const s = newGame();
    const old = JSON.parse(JSON.stringify(s));
    for (const k of ['background', 'skills', 'goals', 'workStyle', 'furniture', 'relations']) delete old.players.p1.character[k];
    const loaded = deserializeSave(serializeSave(old, 'alt').replace(`"version":${STATE_VERSION}`, '"version":6'));
    const c = loaded.players.p1.character;
    expect(c.workStyle).toBe('hands_on');
    expect(c.relations).toEqual([]);
    expect(c.skills.logistics).toBe(30);
  });
});

describe('Multiplayer-Zusammenarbeit (Phase 9)', () => {
  const withTeam = () => {
    const s = newGame();
    addPlayer(s, { id: 'p2', name: 'Ben' });
    addPlayer(s, { id: 'p3', name: 'Cem' });
    return s;
  };

  it('Rollen setzen passende Rechte; Ausgabenlimit rollt zu teure Befehle vollständig zurück', () => {
    const s = withTeam();
    expect(s.players.p2.role).toBe('dispatcher');
    expect(s.players.p2.permissions).toEqual(['dispatch']);
    expect(applyCommand(s, ctx, 'p2', { type: 'setRole', playerId: 'p2', role: 'ceo' }).ok).toBe(false);
    expect(applyCommand(s, ctx, 'p1', { type: 'setRole', playerId: 'p2', role: 'fleet_manager' }).ok).toBe(true);
    expect(s.players.p2.permissions).toEqual(TEAM_ROLES.fleet_manager.permissions);
    expect(applyCommand(s, ctx, 'p1', { type: 'setRole', playerId: 'p1', role: 'dispatcher' }).ok).toBe(false);

    s.company.account.balance = 400_000_00;
    expect(applyCommand(s, ctx, 'p1', { type: 'setPlayerLimits', playerId: 'p2', spendLimit: 20_000_00, locationIds: [] }).ok).toBe(true);
    const before = JSON.stringify(s);
    const r = applyCommand(s, ctx, 'p2', { type: 'buyNewVehicle', modelId: 'velkor-s460', financing: 'cash' });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toMatch(/Ausgabenlimit/);
    expect(JSON.stringify(s)).toBe(before);
    // kleine Ausgabe (Auflieger leasen) bleibt erlaubt
    expect(applyCommand(s, ctx, 'p2', { type: 'buyTrailer', trailerType: 'box', financing: 'lease' }).ok).toBe(true);
  });

  it('Beschränkung auf zugewiesene Niederlassungen', () => {
    const s = withTeam();
    s.company.account.balance = 400_000_00;
    const hq = s.company.locations[0];
    s.company.locations.push({ ...structuredClone(hq), id: 'locx', cityId: 'hamburg' });
    applyCommand(s, ctx, 'p1', { type: 'setRole', playerId: 'p2', role: 'hr_manager' });
    applyCommand(s, ctx, 'p1', { type: 'setPlayerLimits', playerId: 'p2', spendLimit: null, locationIds: ['locx'] });
    expect(s.players.p2.locationIds).toEqual(['locx']);
    const denied = applyCommand(s, ctx, 'p2', { type: 'hireStaff', dept: 'dispatch', locationId: hq.id });
    expect(denied.ok === false && denied.error).toMatch(/nicht zugewiesen/);
    expect(applyCommand(s, ctx, 'p2', { type: 'hireStaff', dept: 'dispatch', locationId: 'locx' }).ok).toBe(true);
  });

  it('Interne Nachrichten sehen nur Absender und Empfänger; Aufgaben werden verteilt und erledigt', () => {
    const s = withTeam();
    expect(applyCommand(s, ctx, 'p1', { type: 'sendMessage', to: ['p2'], subject: 'Gehalt', text: 'Vertraulich' }).ok).toBe(true);
    const id = s.team.messages[0].id;
    expect(unreadMessages(s, 'p2')).toBe(1);
    expect(playerView(s, 'p3').team.messages).toHaveLength(0);
    expect(playerView(s, 'p2').team.messages).toHaveLength(1);
    expect(playerView(s, 'p1')).toBe(s);
    expect(applyCommand(s, ctx, 'p3', { type: 'readMessage', messageId: id }).ok).toBe(false);
    applyCommand(s, ctx, 'p2', { type: 'readMessage', messageId: id });
    expect(unreadMessages(s, 'p2')).toBe(0);

    const t = applyCommand(s, ctx, 'p1', { type: 'createTask', title: 'Werkstatttermine planen', area: 'fleet', assignee: 'p3' });
    expect(t.ok).toBe(true);
    const tid = t.ok ? t.id! : '';
    expect(openTasksFor(s, 'p3')).toBe(1);
    expect(applyCommand(s, ctx, 'p3', { type: 'updateTask', taskId: tid, status: 'done' }).ok).toBe(true);
    expect(openTasksFor(s, 'p3')).toBe(0);
    expect(applyCommand(s, ctx, 'p2', { type: 'deleteTask', taskId: tid }).ok).toBe(false);
    expect(applyCommand(s, ctx, 'p1', { type: 'deleteTask', taskId: tid }).ok).toBe(true);
  });

  it('Gemeinsame Aktivität: Einladung, Zusage, Wirkung für alle; Besprechung verbessert die Angebotspreise', () => {
    const s = withTeam();
    for (const p of Object.values(s.players)) p.character.needs.social = 20;
    const r = applyCommand(s, ctx, 'p1', { type: 'proposeJoint', kind: 'dinner', playerIds: ['p2', 'p3'] });
    expect(r.ok).toBe(true);
    const id = r.ok ? r.id! : '';
    expect(pendingInvitesFor(s, 'p2')).toBe(1);
    const bal = s.players.p2.character.privateAccount.balance;
    applyCommand(s, ctx, 'p2', { type: 'respondJoint', activityId: id, accept: true });
    expect(s.team.activities[0].status).toBe('pending');
    applyCommand(s, ctx, 'p3', { type: 'respondJoint', activityId: id, accept: false });
    expect(s.team.activities[0].status).toBe('done');
    expect(s.players.p2.character.privateAccount.balance).toBe(bal - JOINT_ACTIVITIES.dinner.cost);
    expect(s.players.p1.character.needs.social).toBeGreaterThan(20);
    expect(s.players.p3.character.needs.social).toBe(20);

    // Besprechung: alle sagen zu → eine Woche +2 % auf Angebote
    s.time += 3 * 60;
    expect(meetingBonus(s)).toBe(0);
    const m = applyCommand(s, ctx, 'p2', { type: 'proposeJoint', kind: 'meeting', playerIds: ['p1'] });
    applyCommand(s, ctx, 'p1', { type: 'respondJoint', activityId: m.ok ? m.id! : '', accept: true });
    expect(meetingBonus(s)).toBeCloseTo(0.02);
    s.time += 8 * MIN_PER_DAY;
    expect(meetingBonus(s)).toBe(0);

    // unbeantwortete Einladung verfällt nach 12 h
    applyCommand(s, ctx, 'p3', { type: 'proposeJoint', kind: 'leisure', playerIds: ['p1'] });
    s.time += 13 * 60;
    hourlyTeam(s);
    expect(s.team.activities.at(-1)!.status).toBe('expired');
  });

  it('Abstimmung über eine Unternehmensentscheidung', () => {
    const s = withTeam();
    const r = applyCommand(s, ctx, 'p2', { type: 'createVote', question: 'Niederlassung in Hamburg?', options: ['Ja', 'Nein'], hours: 24 });
    const id = r.ok ? r.id! : '';
    applyCommand(s, ctx, 'p1', { type: 'castVote', voteId: id, option: 0 });
    applyCommand(s, ctx, 'p2', { type: 'castVote', voteId: id, option: 0 });
    expect(s.team.votes[0].status).toBe('open');
    applyCommand(s, ctx, 'p3', { type: 'castVote', voteId: id, option: 1 });
    expect(s.team.votes[0].status).toBe('closed');
    expect(s.team.votes[0].result).toBe(0);
    expect(voteCounts(s.team.votes[0])).toEqual([2, 1]);
    // Ablauf schließt offene Abstimmungen
    applyCommand(s, ctx, 'p1', { type: 'createVote', question: 'Mehr Kühlauflieger?', options: ['Ja', 'Nein'], hours: 1 });
    s.time += 61;
    hourlyTeam(s);
    expect(s.team.votes[1].status).toBe('closed');
    expect(s.team.votes[1].result).toBe(-1);
  });

  it('Delta-Synchronisation: Diff und Patch ergeben über viele Spielstunden exakt den Serverzustand', () => {
    const s = withTeam();
    const v = first(s.vehicles), d = first(s.drivers), t = first(s.trailers);
    const o = addOrder(s, 'leipzig', 'muenchen');
    applyCommand(s, ctx, 'p1', { type: 'dispatch', orderId: o.id, driverId: d.id, vehicleId: v.id, trailerId: t.id });
    let client: GameState = JSON.parse(JSON.stringify(s));
    let full = 0;
    let delta = 0;
    for (let i = 0; i < 48; i++) {
      tickMinutes(s, ctx, 30);
      if (i % 7 === 0) applyCommand(s, ctx, 'p2', { type: 'chat', text: `Nachricht ${i}` });
      const ops = JSON.parse(JSON.stringify(diffState(client, s)));
      client = applyPatch(client, ops);
      full += JSON.stringify(s).length;
      delta += JSON.stringify(ops).length;
      expect(sameJson(client, JSON.parse(JSON.stringify(s)))).toBe(true);
    }
    expect(delta).toBeLessThan(full / 10);
    // unveränderte Teile bleiben dasselbe Objekt (strukturelles Teilen)
    const after = applyPatch(client, [{ p: ['company', 'name'], v: 'Neu' }]);
    expect(after.vehicles).toBe(client.vehicles);
    expect(after.company).not.toBe(client.company);
    expect(diffState({ a: [1, 2, 3, 4] }, { a: [3, 4, 5] })).toEqual([{ p: ['a'], drop: 2, push: [5] }]);
  });

  it('Spielstände der Version 7 erhalten den Teambereich und Rollen', () => {
    const s = newGame();
    const old = JSON.parse(JSON.stringify(s));
    delete old.team;
    delete old.players.p1.role;
    const loaded = deserializeSave(serializeSave(old, 'alt').replace(`"version":${STATE_VERSION}`, '"version":7'));
    expect(loaded.team).toEqual({ messages: [], tasks: [], activities: [], votes: [] });
    expect(loaded.players.p1.role).toBe('ceo');
  });
});

describe('Erweiterte Simulation (Phase 10)', () => {
  const SUNDAY_10 = 6 * MIN_PER_DAY + 10 * 60; // So 10.01.2027 10:00

  it('Wetter hängt von Land und Jahreszeit ab und verlangsamt die Fahrt', () => {
    const winter = weatherWeights('NO', 10 * MIN_PER_DAY);
    const summer = weatherWeights('NO', 190 * MIN_PER_DAY);
    expect(winter.snow).toBeGreaterThan(10);
    expect(summer.snow).toBe(0);
    expect(weatherWeights('ES', 10 * MIN_PER_DAY).snow).toBeLessThan(winter.snow);

    const run = (kind: 'clear' | 'snow') => {
      const s = newGame();
      const [d, v, t] = [first(s.drivers), first(s.vehicles), first(s.trailers)];
      const o = addOrder(s, 'leipzig', 'nuernberg', { pickupStart: s.time, pickupEnd: s.time + 600 });
      applyCommand(s, ctx, 'p1', { type: 'dispatch', orderId: o.id, driverId: d.id, vehicleId: v.id, trailerId: t.id });
      const trip = s.trips[v.tripId!];
      trip.activity = 'driving';
      trip.phase = 'to_delivery';
      trip.legIndex = trip.legs.length - 1;
      trip.progressKm = 0;
      s.disruptions = [];
      for (let i = 0; i < 90; i++) {
        s.weather.DE = { kind, since: s.time, until: s.time + 600 };
        s.time++;
        tickTrip(s, ctx, trip);
      }
      return trip.progressKm;
    };
    const clear = run('clear');
    const snow = run('snow');
    expect(snow).toBeLessThan(clear * 0.8);
    expect(snow).toBeGreaterThan(clear * 0.6);
  });

  it('Sonntagsfahrverbot: LKW über 7,5 t warten, Transporter und Kühlware fahren', async () => {
    expect(banUntil('DE', SUNDAY_10)).toBe(6 * MIN_PER_DAY + 22 * 60);
    expect(banUntil('DE', SUNDAY_10 - MIN_PER_DAY)).toBeNull();
    expect(banUntil('AT', 5 * MIN_PER_DAY + 16 * 60)).toBe(6 * MIN_PER_DAY + 22 * 60);
    expect(banUntil('CH', 2 * MIN_PER_DAY + 23 * 60)).toBe(3 * MIN_PER_DAY + 5 * 60);
    expect(banUntil('NL', SUNDAY_10)).toBeNull();

    const s = newGame();
    s.time = SUNDAY_10 - 120;
    const [d, v, t] = [first(s.drivers), first(s.vehicles), first(s.trailers)];
    const o = addOrder(s, 'leipzig', 'nuernberg', { pickupStart: s.time, pickupEnd: s.time + 600, deliveryEnd: s.time + 2 * MIN_PER_DAY });
    const check = validateDispatch(s, ctx, { orderId: o.id, driverId: d.id, vehicleId: v.id, trailerId: t.id });
    expect(check.issues.some((i) => i.code === 'driving_ban')).toBe(true);
    applyCommand(s, ctx, 'p1', { type: 'dispatch', orderId: o.id, driverId: d.id, vehicleId: v.id, trailerId: t.id });
    const trip = s.trips[v.tripId!];
    await runUntil(s, () => trip.activity === 'ban' || trip.phase === 'done', 600);
    expect(trip.activity).toBe('ban');
    expect(trip.log.some((l) => l.text.startsWith('Fahrverbot in Deutschland'))).toBe(true);
    await runUntil(s, () => trip.activity !== 'ban', 900);
    expect(s.time).toBeGreaterThanOrEqual(6 * MIN_PER_DAY + 22 * 60);

    // Ausnahmen: Transporter, beladener Kühltransport
    const van = { ...v, modelId: 'trasko-v35' };
    expect(banApplies(s, van)).toBe(false);
    expect(banApplies(s, v)).toBe(true);
    const r = addOrder(s, 'leipzig', 'nuernberg', { cargoId: 'frozen' });
    r.status = 'in_transit';
    expect(banApplies(s, v, { ...trip, orderId: r.id, stops: [{ kind: 'delivery', orderId: r.id, cityId: 'nuernberg' }], legIndex: 0, legs: [{ ...trip.legs[0], loaded: true }] } as Trip)).toBe(false);
  });

  it('Grenzkontrolle an der Schweizer Grenze: einmal Wartezeit, in der Planung berücksichtigt', async () => {
    const s = newGame(3, 'muenchen');
    const [d, v, t] = [first(s.drivers), first(s.vehicles), first(s.trailers)];
    const o = addOrder(s, 'muenchen', 'zuerich', { pickupStart: s.time, pickupEnd: s.time + 600, deliveryEnd: s.time + 2 * MIN_PER_DAY });
    const est = validateDispatch(s, ctx, { orderId: o.id, driverId: d.id, vehicleId: v.id, trailerId: t.id }).estimate!;
    expect(est.borderMin).toBe(35);
    expect(isCustomsBorder('DE', 'CH')).toBe(true);
    expect(isCustomsBorder('DE', 'AT')).toBe(false);
    applyCommand(s, ctx, 'p1', { type: 'dispatch', orderId: o.id, driverId: d.id, vehicleId: v.id, trailerId: t.id });
    const trip = s.trips[v.tripId!];
    s.disruptions = [];
    await runUntil(s, () => trip.phase === 'done', 3 * MIN_PER_DAY);
    expect(trip.phase).toBe('done');
    expect(trip.log.filter((l) => l.text.startsWith('Grenzkontrolle')).length).toBe(1);
  });

  it('Konjunktur: Krise senkt die Nachfrage, regionale Ereignisse verschieben die Herkunft der Aufträge', () => {
    const s = newGame();
    startPhase(s, 'crisis', 60);
    for (let i = 0; i < 40; i++) {
      s.time += MIN_PER_DAY;
      dailyEconomy(s);
    }
    expect(s.economy.cycle).toBeLessThan(0.9);
    expect(s.market.demand).toBeLessThan(0.95);
    expect(crisisPaymentFactor(s)).toBeLessThan(1);

    const share = (st: GameState) => {
      let pl = 0;
      for (let i = 0; i < 400; i++) {
        const o = generateOrder(st, ctx);
        if (o && CITY_BY_ID[o.fromCityId].country === 'PL') pl++;
      }
      return pl;
    };
    const a = newGame(9);
    const base = share(a);
    const b = newGame(9);
    setRegionalTrend(b, 'PL', 1.45, 30, 'Messe');
    for (let i = 0; i < 25; i++) {
      b.time += MIN_PER_DAY;
      dailyEconomy(b);
    }
    expect(regionFactor(b, 'PL')).toBeGreaterThan(1.3);
    expect(share(b)).toBeGreaterThan(base * 1.3);
  });

  it('KI-Konkurrenz übernimmt Aufträge, wirtschaftet, gerät in Schwierigkeiten und geht in Konkurs', () => {
    const s = newGame();
    const comps = activeCompetitors(s);
    expect(comps.length).toBe(5);
    expect(comps.some((c) => haversineKm([CITY_BY_ID[c.hqCityId].lon, CITY_BY_ID[c.hqCityId].lat], [CITY_BY_ID.leipzig.lon, CITY_BY_ID.leipzig.lat]) < 350)).toBe(true);
    for (const o of Object.values(s.orders)) o.created -= 120;
    for (let h = 0; h < 24; h++) {
      s.time += 60;
      hourlyCompetition(s);
    }
    const taken = Object.values(s.orders).filter((o) => o.takenBy);
    expect(taken.length).toBeGreaterThan(5);
    expect(comps.reduce((a, c) => a + c.month.orders, 0)).toBe(taken.length);

    // ohne Aufträge reichen die Fixkosten in den Konkurs
    const c = comps[0];
    c.cash = 5_000_00;
    const cu = Object.values(s.customers)[0];
    cu.lostTo = c.id;
    for (let m = 0; m < 6 && c.status !== 'bankrupt'; m++) {
      for (let d = 0; d < 30; d++) {
        s.time += MIN_PER_DAY;
        c.month.revenue = 0;
        dailyCompetition(s);
      }
      monthlyCompetition(s);
    }
    expect(c.status).toBe('bankrupt');
    expect(s.log.some((l) => l.text.startsWith(`Konkurs: ${c.name}`))).toBe(true);
    dailyCompetition(s);
    expect(cu.lostTo).toBeUndefined();
  });

  it('Unzufriedene Kunden wechseln zur Konkurrenz und lassen sich zurückgewinnen', () => {
    const s = newGame();
    const rival = foundCompetitor(s, { near: 'leipzig', strategy: 'regional', trucks: 10 });
    rival.cityIds = ['leipzig'];
    const cu = Object.values(s.customers).find((c) => c.cityId === 'leipzig') ?? Object.values(s.customers)[0];
    cu.cityId = 'leipzig';
    cu.deliveries = 4;
    cu.satisfaction = 20;
    for (let i = 0; i < 300 && !cu.lostTo; i++) {
      s.time += MIN_PER_DAY;
      dailyCompetition(s);
    }
    expect(cu.lostTo).toBeDefined();
    const bal = s.company.account.balance;
    s.company.reputation = 95;
    for (const c of Object.values(s.competitors)) c.reputation = 10;
    let won = false;
    for (let i = 0; i < 6 && !won; i++) {
      const r = applyCommand(s, ctx, 'p1', { type: 'winBackCustomer', customerId: cu.id });
      expect(r.ok).toBe(true);
      won = !cu.lostTo;
      expect(applyCommand(s, ctx, 'p1', { type: 'winBackCustomer', customerId: cu.id }).ok).toBe(false); // Abklingzeit oder schon zurück
      s.time += 15 * MIN_PER_DAY;
    }
    expect(won).toBe(true);
    expect(s.company.account.balance).toBeLessThan(bal);
  });

  it('Ereignisregelwerk: Abklingzeiten, keine negativen Ereignisse in der Liquiditätskrise', () => {
    const s = newGame(21);
    s.company.account.balance = -5_000_00;
    for (let i = 0; i < 200; i++) {
      s.time += MIN_PER_DAY;
      dailyEvents(s, ctx);
    }
    const company = s.events.history.filter((e) => e.category !== 'private');
    expect(company.length).toBeGreaterThan(0);
    expect(company.every((e) => e.tone !== 'bad')).toBe(true);

    const t = newGame(22);
    t.company.account.balance = 200_000_00;
    for (let i = 0; i < 365; i++) {
      t.time += MIN_PER_DAY;
      dailyEvents(t, ctx);
    }
    const tenders = t.events.history.filter((e) => e.rule === 'tender').map((e) => e.t);
    for (let i = 1; i < tenders.length; i++) expect(tenders[i] - tenders[i - 1]).toBeGreaterThanOrEqual(6 * MIN_PER_DAY);
    const bad = t.events.history.filter((e) => e.tone === 'bad' && e.category !== 'private').map((e) => e.t);
    for (let i = 1; i < bad.length; i++) expect(bad[i] - bad[i - 1]).toBeGreaterThanOrEqual(4 * MIN_PER_DAY);
    expect(new Set(t.events.history.map((e) => e.rule)).size).toBeGreaterThan(3);
    expect(Object.values(t.orders).some((o) => o.tender)).toBe(true);
  });

  it('Spielstände der Version 8 bekommen Wetter, Konjunktur, Konkurrenz und Ereignisse', () => {
    const s = newGame();
    const old = JSON.parse(JSON.stringify(s));
    for (const k of ['weather', 'economy', 'competitors', 'events']) delete old[k];
    const loaded = deserializeSave(serializeSave(old, 'alt').replace(`"version":${STATE_VERSION}`, '"version":8'));
    expect(loaded.economy.phase).toBe('normal');
    expect(loaded.events.history).toEqual([]);
    expect(loaded.competitors).toEqual({});
    loaded.time += 59;
    tickMinutes(loaded, ctx, 1);
    expect(activeCompetitors(loaded).length).toBe(5);
    expect(Object.keys(loaded.weather).length).toBeGreaterThan(20);
  });
});

describe('Feinschliff: Planung und Balancing (Phase 11)', () => {
  it('Lange Wartezeit am Ladefenster wird zur Tagesruhe, wenn sie vor Ende des Fensters endet', () => {
    const h = { ...freshHos(), drivenToday: 300 };
    expect(pickupWaitMin(h, 0, 300, 800)).toBe(HOS_RULES.DAILY_REST);
    expect(pickupWaitMin(h, 0, 300, 500)).toBe(300); // Ruhe passt nicht ins Fenster
    expect(pickupWaitMin({ ...h, drivenToday: 0 }, 0, 300, 800)).toBe(300); // ausgeruht: nur warten
    expect(pickupWaitMin(h, 400, 300, 800)).toBe(0);
  });

  it('Vorkalkulation rechnet das Sonntagsfahrverbot ein', () => {
    const s = newGame();
    s.time = 5 * MIN_PER_DAY + 21 * 60; // Sa 21:00
    s.disruptions = [];
    const [d, v, t] = [first(s.drivers), first(s.vehicles), first(s.trailers)];
    const o = addOrder(s, 'leipzig', 'muenchen', { pickupStart: s.time, pickupEnd: s.time + 120, deliveryEnd: s.time + 2 * MIN_PER_DAY });
    const est = estimateTrip(s, ctx, { orderId: o.id, driverId: d.id, vehicleId: v.id, trailerId: t.id })!;
    expect(est.deliveryEta).toBeGreaterThan(6 * MIN_PER_DAY + 22 * 60);
    s.time += 3 * MIN_PER_DAY; // gleiche Uhrzeit am Dienstag: kein Verbot
    o.pickupStart = s.time;
    o.pickupEnd = s.time + 120;
    const tue = estimateTrip(s, ctx, { orderId: o.id, driverId: d.id, vehicleId: v.id, trailerId: t.id })!;
    expect(tue.deliveryEta - s.time).toBeLessThan(est.deliveryEta - (s.time - 3 * MIN_PER_DAY) - 12 * 60);
  });

  it('Folgeaufträge werden mit dem Lenkzeitstand am Ende der laufenden Fahrt geplant', () => {
    const s = newGame();
    const [d, v, t] = [first(s.drivers), first(s.vehicles), first(s.trailers)];
    const o = addOrder(s, 'leipzig', 'mailand', { pickupStart: s.time, pickupEnd: s.time + 600, deliveryEnd: s.time + 4 * MIN_PER_DAY });
    applyCommand(s, ctx, 'p1', { type: 'dispatch', orderId: o.id, driverId: d.id, vehicleId: v.id, trailerId: t.id });
    const end = vehicleSchedule(s, ctx, v.id)[0].end;
    expect(end.hos).toBeDefined();
    expect(end.hos!.drivenWeek).toBeGreaterThan(d.hos.drivenWeek + 9 * 60);
  });

  it('KI-Disposition: Ruhezeit des Fahrers zählt nicht als Standzeit ohne Auftrag', () => {
    const s = newGame();
    s.company.staff.push({ id: 'st1', name: 'Test', dept: 'dispatch', salary: 0, hired: 0, locationId: s.company.locations[0].id, skill: 80 } as StaffMember);
    applyCommand(s, ctx, 'p1', { type: 'setAutoDispatch', mode: 'auto' });
    s.orders = {};
    const [d, v] = [first(s.drivers), first(s.vehicles)];
    d.hos.requiredRest = 600;
    d.hos.requiredRestKind = 'daily';
    runAutoDispatch(s, ctx);
    expect(s.autoDispatch.idleHours[v.id]).toBeUndefined();
    d.hos.requiredRest = 0;
    runAutoDispatch(s, ctx);
    expect(s.autoDispatch.idleHours[v.id]).toBe(1);
  });
});

