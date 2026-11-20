import { describe, expect, it } from 'vitest';
import {
  FUEL_CARDS, HOS_RULES, TEAM_ALLOWANCE_PER_DAY, TRUCK_BY_ID, applyCommand, countryDieselFactor, dieselPriceIn, estimateTrip, freshHos, hosDrive, hosRide,
  maybeInspect, monthlyFixedCosts, rollInspection, shouldRefuel, simulateDriving, tickMinute, type GameState,
} from '../src/index.ts';
import { addOrder, ctx, first, newGame } from './helpers.ts';

const secondDriver = (s: GameState) => {
  const base = first(s.drivers);
  const d = { ...structuredClone(base), id: 'drv2', name: 'Kim Zweit', hos: freshHos() };
  s.drivers[d.id] = d;
  return d;
};

describe('Tankstrategie', () => {
  it('Länderpreise und Tankkarte wirken auf den Literpreis', () => {
    const s = newGame();
    expect(countryDieselFactor('LU')).toBeLessThan(countryDieselFactor('DE'));
    expect(countryDieselFactor('CH')).toBeGreaterThan(countryDieselFactor('DE'));
    const de = dieselPriceIn(s, 'DE');
    expect(applyCommand(s, ctx, 'p1', { type: 'setFuelCard', card: 'premium' }).ok).toBe(true);
    expect(dieselPriceIn(s, 'DE')).toBeCloseTo(de * (1 - FUEL_CARDS.premium.discount));
    const fee = monthlyFixedCosts(s).find((x) => x.label.startsWith('Tankkarte'));
    expect(fee?.amount).toBe(FUEL_CARDS.premium.monthlyPerVehicle * Object.keys(s.vehicles).length);
  });

  it('„Günstig tanken“ füllt in billigen Ländern früher nach', () => {
    const s = newGame();
    const v = first(s.vehicles);
    const tank = TRUCK_BY_ID[v.modelId].tankL;
    v.fuelL = tank * 0.5;
    expect(shouldRefuel(s, v, tank, 0.2, 'LU')).toBe(false);
    expect(applyCommand(s, ctx, 'p1', { type: 'setFuelPolicy', policy: 'cheap' }).ok).toBe(true);
    expect(shouldRefuel(s, v, tank, 0.2, 'LU')).toBe(true);
    expect(shouldRefuel(s, v, tank, 0.2, 'CH')).toBe(false);
    v.fuelL = tank * 0.1;
    expect(shouldRefuel(s, v, tank, 0.2, 'CH')).toBe(true);
  });
});

describe('Straßenkontrollen', () => {
  it('schlechter Zustand führt oft zur Stilllegung, gepflegter LKW mit erfahrenem Fahrer meist nicht', () => {
    const s = newGame();
    const v = first(s.vehicles);
    const d = first(s.drivers);
    v.condition = 20;
    let grounded = 0;
    for (let i = 0; i < 200; i++) if (rollInspection(s, v, d, false, 'DE').findings.includes('grounded')) grounded++;
    expect(grounded).toBeGreaterThan(100);
    v.condition = 90;
    d.experience = 90;
    d.reliability = 90;
    d.trait = undefined;
    let clean = 0;
    for (let i = 0; i < 200; i++) if (!rollInspection(s, v, d, true, 'DE').findings.length) clean++;
    expect(clean).toBeGreaterThan(160);
  });

  it('eine Kontrolle hält die Fahrt an und bucht das Bußgeld', () => {
    const s = newGame();
    const d = first(s.drivers);
    const v = first(s.vehicles);
    const t = first(s.trailers);
    const o = addOrder(s, 'leipzig', 'hamburg');
    expect(applyCommand(s, ctx, 'p1', { type: 'dispatch', orderId: o.id, driverId: d.id, vehicleId: v.id, trailerId: t.id }).ok).toBe(true);
    const trip = s.trips[o.tripId!];
    v.condition = 20;
    // so viele km, dass die Kontrolle sicher kommt
    expect(maybeInspect(s, trip, 1e6, 'DE', true)).toBe(true);
    expect(trip.activity).toBe('inspection');
    expect(trip.activityLeft).toBeGreaterThan(20);
    expect(s.company.totals.inspections).toBe(1);
  });
});

describe('Doppelbesatzung', () => {
  it('Beifahrer-Zeit zählt als Pause, aber nicht als Tagesruhe', () => {
    const h = freshHos();
    h.restStreak = 0;
    hosDrive(h, HOS_RULES.BREAK_AFTER);
    expect(h.requiredRestKind).toBe('break');
    hosRide(h, HOS_RULES.BREAK);
    expect(h.requiredRest).toBe(0);
    expect(h.drivenSinceBreak).toBe(0);
    expect(h.drivenToday).toBe(HOS_RULES.BREAK_AFTER);
    hosRide(h, 12 * 60);
    expect(h.drivenToday).toBe(HOS_RULES.BREAK_AFTER);
  });

  it('Team ist auf langer Strecke deutlich schneller als ein einzelner Fahrer', () => {
    const s = newGame();
    const d = first(s.drivers);
    const co = secondDriver(s);
    const v = first(s.vehicles);
    const t = first(s.trailers);
    const o = addOrder(s, 'leipzig', 'madrid', { deliveryEnd: s.time + 6 * 1440 });
    const solo = estimateTrip(s, ctx, { orderId: o.id, driverId: d.id, vehicleId: v.id, trailerId: t.id })!;
    const team = estimateTrip(s, ctx, { orderId: o.id, driverId: d.id, vehicleId: v.id, trailerId: t.id, coDriverId: co.id })!;
    expect(team.deliveryEta).toBeLessThan(solo.deliveryEta - 8 * 60);
    expect(team.totalCost).toBeGreaterThan(solo.totalCost);
    // Plausibilität gegen das Einzelfahrer-Modell
    expect(simulateDriving(freshHos(), 20 * 60).elapsed).toBeGreaterThan(20 * 60);
  });

  it('Fahrt mit Doppelbesatzung: Fahrerwechsel, Lenkzeiten eingehalten, Spesen, beide wieder frei', () => {
    const s = newGame();
    const d = first(s.drivers);
    const co = secondDriver(s);
    const v = first(s.vehicles);
    const t = first(s.trailers);
    v.fuelL = TRUCK_BY_ID[v.modelId].tankL;
    v.condition = 95;
    const o = addOrder(s, 'leipzig', 'madrid', { deliveryEnd: s.time + 6 * 1440 });
    const r = applyCommand(s, ctx, 'p1', { type: 'dispatch', orderId: o.id, driverId: d.id, vehicleId: v.id, trailerId: t.id, coDriverId: co.id });
    expect(r.ok).toBe(true);
    expect(co.status).toBe('on_trip');
    const trip = s.trips[o.tripId!];
    s.paused = false;
    let swaps = 0;
    let last = trip.driverId;
    for (let i = 0; i < 6 * 1440 && trip.phase !== 'done'; i++) {
      tickMinute(s, ctx);
      if (trip.driverId !== last) {
        swaps++;
        last = trip.driverId;
      }
      for (const x of [d, co]) expect(x.hos.drivenToday).toBeLessThanOrEqual(HOS_RULES.DAILY_DRIVE);
    }
    expect(trip.phase).toBe('done');
    expect(swaps).toBeGreaterThan(0);
    expect(d.status).toBe('idle');
    expect(co.status).toBe('idle');
    expect(co.cityId).toBe('madrid');
    expect(s.ledger.some((l) => l.text.startsWith('Spesen Doppelbesatzung') && -l.amount >= TEAM_ALLOWANCE_PER_DAY)).toBe(true);
  });

  it('zweiter Fahrer muss frei und vor Ort sein', () => {
    const s = newGame();
    const d = first(s.drivers);
    const co = secondDriver(s);
    co.cityId = 'hamburg';
    const o = addOrder(s, 'leipzig', 'paris');
    const r = applyCommand(s, ctx, 'p1', { type: 'dispatch', orderId: o.id, driverId: d.id, vehicleId: first(s.vehicles).id, trailerId: first(s.trailers).id, coDriverId: co.id });
    expect(r.ok).toBe(false);
    const same = applyCommand(s, ctx, 'p1', { type: 'dispatch', orderId: o.id, driverId: d.id, vehicleId: first(s.vehicles).id, trailerId: first(s.trailers).id, coDriverId: d.id });
    expect(same.ok).toBe(false);
  });
});
