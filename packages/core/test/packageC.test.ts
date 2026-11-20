import { describe, expect, it } from 'vitest';
import {
  CHARGE_STOP_MIN, LNG_FACTOR, POWER_DEPOT, TRUCK_BY_ID, applyCommand, co2Class, depotRefuel, dieselPriceIn, energyPriceIn, estimateTrip, isGreenCustomer,
  lowEmissionShare, shouldRefuel, tollFactor, validateDispatch, type GameState,
} from '../src/index.ts';
import { addOrder, ctx, first, newGame, runUntil } from './helpers.ts';

const electrify = (s: GameState, modelId = 'velkor-es600') => {
  const v = first(s.vehicles);
  v.modelId = modelId;
  v.fuelL = TRUCK_BY_ID[modelId].tankL;
  return v;
};

describe('Alternative Antriebe', () => {
  it('CO₂-Klasse senkt die Maut: Elektro −75 %, LNG −20 %, Euro V teurer', () => {
    expect(co2Class(TRUCK_BY_ID['nordwal-tx420'])).toBe(2);
    expect(co2Class(TRUCK_BY_ID['trasko-m380'])).toBe(1);
    expect(co2Class(TRUCK_BY_ID['brennkraft-g460'])).toBe(4);
    expect(co2Class(TRUCK_BY_ID['velkor-es600'])).toBe(5);
    expect(tollFactor('velkor-es600')).toBeCloseTo(0.25);
    expect(tollFactor('brennkraft-g460')).toBeCloseTo(0.8);
    expect(tollFactor('trasko-m380')).toBeGreaterThan(tollFactor('nordwal-tx420'));
  });

  it('Energiepreise je Antrieb, E-LKW tanken nicht „günstig“ nach', () => {
    const s = newGame();
    expect(energyPriceIn(s, 'brennkraft-g460', 'DE')).toBeCloseTo(dieselPriceIn(s, 'DE') * LNG_FACTOR);
    expect(energyPriceIn(s, 'velkor-es600', 'LU')).toBeCloseTo(energyPriceIn(s, 'velkor-es600', 'CH'));
    const v = electrify(s);
    v.fuelL = TRUCK_BY_ID[v.modelId].tankL * 0.5;
    s.company.fuelPolicy = 'cheap';
    expect(shouldRefuel(s, v, TRUCK_BY_ID[v.modelId].tankL, 0.15, 'LU')).toBe(false);
  });

  it('E-LKW: Ladestopps in der Vorkalkulation und unterwegs, niedrige Maut', async () => {
    const s = newGame();
    const d = first(s.drivers);
    const t = first(s.trailers);
    const o = addOrder(s, 'leipzig', 'mailand', { deliveryEnd: s.time + 4 * 1440 });
    const diesel = estimateTrip(s, ctx, { orderId: o.id, driverId: d.id, vehicleId: first(s.vehicles).id, trailerId: t.id })!;
    const v = electrify(s);
    const e = estimateTrip(s, ctx, { orderId: o.id, driverId: d.id, vehicleId: v.id, trailerId: t.id })!;
    expect(e.fuelStops).toBeGreaterThanOrEqual(1);
    expect(e.toll).toBeLessThan(diesel.toll * 0.3);
    expect(applyCommand(s, ctx, 'p1', { type: 'dispatch', orderId: o.id, driverId: d.id, vehicleId: v.id, trailerId: t.id }).ok).toBe(true);
    const trip = s.trips[v.tripId!];
    let charged = false;
    await runUntil(s, () => trip.phase === 'done', 4 * 1440, () => { if (trip.activity === 'charging') charged = true; });
    expect(trip.phase).toBe('done');
    expect(charged).toBe(true);
    expect(s.ledger.some((l) => l.category === 'fuel' && l.text.startsWith('Strom'))).toBe(true);
    expect(CHARGE_STOP_MIN).toBeGreaterThanOrEqual(45);
  });

  it('Ladepark am Standort lädt bei Abfahrt günstig voll', () => {
    const s = newGame();
    const v = electrify(s);
    v.fuelL = 100;
    const trip = { costs: { fuel: 0, toll: 0 }, log: [] } as never;
    depotRefuel(s, v, trip);
    expect(v.fuelL).toBe(100);
    s.company.locations[0].facilities.push('charger');
    depotRefuel(s, v, trip);
    expect(v.fuelL).toBe(TRUCK_BY_ID[v.modelId].tankL);
    expect(s.ledger.at(-1)!.amount).toBe(-Math.round((TRUCK_BY_ID[v.modelId].tankL - 100) * POWER_DEPOT));
  });
});

describe('Grüne Kunden', () => {
  it('verlangen ein emissionsarmes Fahrzeug oder einen emissionsarmen Fuhrpark', () => {
    const s = newGame();
    const d = first(s.drivers);
    const t = first(s.trailers);
    const o = addOrder(s, 'leipzig', 'berlin', { green: true });
    const input = { orderId: o.id, driverId: d.id, vehicleId: first(s.vehicles).id, trailerId: t.id };
    expect(validateDispatch(s, ctx, input).issues.some((i) => i.code === 'green_vehicle')).toBe(true);
    electrify(s, 'brennkraft-g460');
    expect(lowEmissionShare(s)).toBe(1);
    expect(validateDispatch(s, ctx, input).issues.some((i) => i.code === 'green_vehicle')).toBe(false);
  });

  it('grüne Kunden sind fest bestimmt und nur in passenden Branchen', () => {
    const ids = Array.from({ length: 400 }, (_, i) => `cus${i}`);
    const share = ids.filter((id) => isGreenCustomer({ id, industry: 'retail' })).length / ids.length;
    expect(share).toBeGreaterThan(0.15);
    expect(share).toBeLessThan(0.35);
    expect(ids.some((id) => isGreenCustomer({ id, industry: 'steel' }))).toBe(false);
    expect(isGreenCustomer({ id: 'cus7', industry: 'food' })).toBe(isGreenCustomer({ id: 'cus7', industry: 'food' }));
  });
});

describe('Kombinierter Verkehr', () => {
  it('Routensuche nutzt Bahnverbindungen nur auf Wunsch', () => {
    const road = ctx.net.route('freiburg', 'mailand')!;
    const rail = ctx.net.route('freiburg', 'mailand', undefined, { rail: true })!;
    expect(road.rail).toHaveLength(0);
    expect(rail.rail).toEqual(['Rollende Landstraße Freiburg–Mailand']);
    expect(rail.fare).toBeGreaterThan(0);
    expect(rail.driveMin).toBeLessThan(road.driveMin);
  });

  it('Fahrt mit Bahn: Fahrpreis, Ruhe auf dem Zug, Ankunft', async () => {
    const s = newGame();
    const d = first(s.drivers);
    const v = first(s.vehicles);
    const t = first(s.trailers);
    const o = addOrder(s, 'freiburg', 'mailand', { deliveryEnd: s.time + 4 * 1440 });
    const input = { orderId: o.id, driverId: d.id, vehicleId: v.id, trailerId: t.id };
    const road = estimateTrip(s, ctx, input)!;
    const rail = estimateTrip(s, ctx, { ...input, rail: true })!;
    expect(rail.rail.length).toBe(1);
    expect(rail.railFare).toBe(520_00);
    expect(rail.toll).toBeLessThan(road.toll);
    expect(rail.fuelL).toBeLessThan(road.fuelL - 100); // auf der Bahn wird kein Diesel verbraucht (Leerfahrt bleibt)
    expect(applyCommand(s, ctx, 'p1', { type: 'dispatch', ...input, rail: true }).ok).toBe(true);
    const trip = s.trips[v.tripId!];
    expect(trip.rail).toBe(true);
    let onTrain = false;
    let restedOnTrain = false;
    await runUntil(s, () => trip.phase === 'done', 4 * 1440, () => {
      if (trip.activity === 'rail') {
        onTrain = true;
        if (d.hos.drivenSinceBreak === 0) restedOnTrain = true;
      }
    });
    expect(trip.phase).toBe('done');
    expect(onTrain).toBe(true);
    expect(restedOnTrain).toBe(true);
    expect(trip.costs.rail).toBe(520_00);
    expect(s.ledger.some((l) => l.text.startsWith('Bahn: Rollende Landstraße'))).toBe(true);
  });
});
