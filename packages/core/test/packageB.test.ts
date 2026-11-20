import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN_COST, CAMPAIGN_DAYS, EQUIPMENT, FAIRS, FAIR_COST, MIN_PER_DAY, ONLINE_MONTHLY, applyCommand, comfortBonus, dailyMarketing, defaultInitials, estimateTrip,
  liveryOf, marketingOriginFactor, marketingVolumeFactor, monthlyFixedCosts, satisfactionFactors, tickMinute, vehicleMarketValue,
} from '../src/index.ts';
import { addOrder, ctx, first, newGame } from './helpers.ts';

describe('Fahrzeugausstattung', () => {
  it('Einbau kostet Geld, bindet das Fahrzeug in der Werkstatt und steigert den Wert', () => {
    const s = newGame();
    const v = first(s.vehicles);
    const bal = s.company.account.balance;
    const value = vehicleMarketValue(s, v.id);
    expect(applyCommand(s, ctx, 'p1', { type: 'installEquipment', vehicleId: v.id, item: 'retarder' }).ok).toBe(true);
    expect(s.company.account.balance).toBe(bal - EQUIPMENT.retarder.price);
    expect(v.status).toBe('workshop');
    expect(v.equipment).toEqual(['retarder']);
    expect(vehicleMarketValue(s, v.id)).toBe(value + EQUIPMENT.retarder.price / 2);
    // doppelt oder während der Werkstatt nicht möglich
    expect(applyCommand(s, ctx, 'p1', { type: 'installEquipment', vehicleId: v.id, item: 'aero' }).ok).toBe(false);
    for (let i = 0; i < EQUIPMENT.retarder.hours * 60 + 61; i++) tickMinute(s, ctx);
    expect(v.status).toBe('idle');
    expect(applyCommand(s, ctx, 'p1', { type: 'installEquipment', vehicleId: v.id, item: 'retarder' }).ok).toBe(false);
  });

  it('Aerodynamikpaket senkt die Kraftstoffkosten der Vorkalkulation', () => {
    const s = newGame();
    const v = first(s.vehicles);
    const d = first(s.drivers);
    const o = addOrder(s, 'leipzig', 'hamburg');
    const t = first(s.trailers);
    const before = estimateTrip(s, ctx, { orderId: o.id, vehicleId: v.id, driverId: d.id, trailerId: t.id })!;
    v.equipment = ['aero'];
    const after = estimateTrip(s, ctx, { orderId: o.id, vehicleId: v.id, driverId: d.id, trailerId: t.id })!;
    expect(after.fuelL).toBeCloseTo(before.fuelL * 0.96, 1);
    expect(after.fuelCost).toBeLessThan(before.fuelCost);
  });

  it('Komfortausstattung macht Fahrer zufriedener', () => {
    const s = newGame();
    const d = first(s.drivers);
    const base = satisfactionFactors(s, d).target;
    for (const v of Object.values(s.vehicles)) v.equipment = ['aircon', 'fridge'];
    expect(comfortBonus(s)).toBe(8);
    expect(satisfactionFactors(s, d).target).toBe(Math.min(95, base + 8));
  });
});

describe('Firmenlackierung', () => {
  it('Standardlackierung mit Kürzel und gültige Änderung', () => {
    const s = newGame();
    expect(defaultInitials('Testfracht Nord GmbH')).toBe('TN');
    const l = liveryOf(s);
    expect(l.initials.length).toBeGreaterThan(0);
    expect(applyCommand(s, ctx, 'p1', { type: 'setLivery', livery: { primary: '#dc2626', shape: 'diamond', initials: 'x-y z!' } }).ok).toBe(true);
    expect(s.company.livery).toMatchObject({ primary: '#dc2626', shape: 'diamond', initials: 'XYZ' });
    expect(applyCommand(s, ctx, 'p1', { type: 'setLivery', livery: { primary: 'rot' } }).ok).toBe(false);
    expect(applyCommand(s, ctx, 'p1', { type: 'setLivery', livery: { initials: '---' } }).ok).toBe(false);
  });
});

describe('Marketing und Messen', () => {
  it('Regionale Kampagne: Kosten, mehr Angebote aus dem Land, Ablauf nach 30 Tagen', () => {
    const s = newGame();
    const bal = s.company.account.balance;
    expect(applyCommand(s, ctx, 'p1', { type: 'startCampaign', country: 'PL' }).ok).toBe(true);
    expect(s.company.account.balance).toBe(bal - CAMPAIGN_COST);
    expect(marketingOriginFactor(s, 'PL')).toBe(2);
    expect(marketingOriginFactor(s, 'DE')).toBe(1);
    expect(marketingVolumeFactor(s)).toBeCloseTo(1.06);
    expect(applyCommand(s, ctx, 'p1', { type: 'startCampaign', country: 'PL' }).ok).toBe(false);
    s.time += CAMPAIGN_DAYS * MIN_PER_DAY;
    dailyMarketing(s);
    expect(s.company.marketing!.campaigns).toHaveLength(0);
    expect(marketingOriginFactor(s, 'PL')).toBe(1);
  });

  it('Messestand bringt neue Kunden und Ruf, danach Sperrfrist', () => {
    const s = newGame();
    s.company.account.balance = 100_000_00;
    const rep = s.company.reputation;
    const customers = Object.keys(s.customers).length;
    const r = applyCommand(s, ctx, 'p1', { type: 'attendFair', fairId: FAIRS[0].id });
    expect(r.ok).toBe(true);
    expect(s.company.account.balance).toBe(100_000_00 - FAIR_COST);
    expect(s.company.reputation).toBe(Math.min(100, rep + 3));
    expect(Object.keys(s.customers).length).toBeGreaterThan(customers);
    expect(applyCommand(s, ctx, 'p1', { type: 'attendFair', fairId: FAIRS[1].id }).ok).toBe(false);
  });

  it('Online-Auftritt kostet monatlich und erhöht das Volumen', () => {
    const s = newGame();
    expect(applyCommand(s, ctx, 'p1', { type: 'setOnlinePresence', on: true }).ok).toBe(true);
    expect(monthlyFixedCosts(s).find((x) => x.label.startsWith('Online-Auftritt'))?.amount).toBe(ONLINE_MONTHLY);
    expect(marketingVolumeFactor(s)).toBeCloseTo(1.05);
  });
});
