import { describe, expect, it } from 'vitest';
import {
  bottlenecks, forecastLiquidity, ledgerCsv, monthlyFixedCosts, report, reportCsv, reportTotals, recordsSince, tripsCsv, MIN_PER_DAY, dayOfMonth,
} from '../src/index.ts';
import { createBot } from './bot.ts';
import { newGame } from './helpers.ts';

/** Spielstand mit 25 Tagen Bot-Betrieb (Aufträge, Fahrten, Wachstum) */
function played(seed = 71, days = 25) {
  const s = newGame(seed);
  const bot = createBot(s);
  for (let d = 0; d < days; d++) bot.day();
  return s;
}

describe('Auswertung und Planungshilfen (Paket E, Schritt E1)', () => {
  const s = played();

  it('jede abgeschlossene Fahrt hat eine Nachkalkulation mit Deckungsbeitrag', () => {
    const recs = s.tripRecords ?? [];
    expect(recs.length).toBeGreaterThan(5);
    for (const r of recs) {
      expect(r.profit).toBe(r.revenue - r.fuel - r.toll - r.rail - r.driver - r.vehicle);
      expect(r.revenue).toBe(r.orders.reduce((a, o) => a + o.revenue, 0));
      expect(r.t).toBeGreaterThan(r.start);
      expect(r.fuel).toBeGreaterThan(0);
      expect(r.driver).toBeGreaterThan(0);
    }
    // Erlöse der Fahrten = Umsatz aus eigenen Zustellungen
    const delivered = recs.reduce((a, r) => a + r.orders.length, 0);
    expect(delivered).toBe(s.company.totals.deliveries);
    expect(recs.some((r) => r.planned !== undefined)).toBe(true);
  });

  it('Berichte nach Kunde, Fahrzeug, Fahrer und Strecke ergeben dieselben Summen', () => {
    const total = reportTotals(s, 30);
    for (const kind of ['customer', 'vehicle', 'driver', 'route'] as const) {
      const rows = report(s, kind, 30);
      expect(rows.length).toBeGreaterThan(0);
      const rev = rows.reduce((a, r) => a + r.revenue, 0);
      const cost = rows.reduce((a, r) => a + r.costs, 0);
      expect(rev).toBe(total.revenue);
      expect(Math.abs(cost - total.costs)).toBeLessThanOrEqual(rows.length);
      // absteigend nach Deckungsbeitrag
      expect(rows.map((r) => r.profit)).toEqual([...rows.map((r) => r.profit)].sort((a, b) => b - a));
    }
    for (const r of report(s, 'vehicle', 30)) {
      expect(r.extra!.utilization).toBeGreaterThan(0);
      expect(r.extra!.utilization).toBeLessThanOrEqual(1);
    }
    // kürzerer Zeitraum enthält weniger oder gleich viele Fahrten
    expect(recordsSince(s, 7).length).toBeLessThanOrEqual(recordsSince(s, 30).length);
  });

  it('Liquiditätsprognose: Fixkosten am Monatsersten, Warnung vor dem Minus', () => {
    const fc = forecastLiquidity(s, 30);
    expect(fc.days).toHaveLength(30);
    const fixedSum = monthlyFixedCosts(s).reduce((a, i) => a + i.amount, 0);
    expect(fc.monthlyFixed).toBe(fixedSum);
    for (const d of fc.days) expect(d.fixed).toBe(dayOfMonth(d.t) === 1 ? fixedSum : 0);
    // 30 Tage enthalten genau einen Monatsersten
    expect(fc.days.filter((d) => d.fixed > 0)).toHaveLength(1);
    const low = structuredClone(s);
    low.company.account.balance = 1_000_00;
    low.invoices = {};
    const f2 = forecastLiquidity(low, 30);
    expect(f2.negativeOn).toBeDefined();
    expect(f2.lowest).toBeLessThan(0);
    expect(bottlenecks(low).some((b) => b.id === 'liquidity')).toBe(true);
  });

  it('Engpass-Warnungen: Fahrzeuge ohne Fahrer, fällige Wartung', () => {
    const x = structuredClone(s);
    const v = Object.values(x.vehicles)[0];
    v.condition = 25;
    for (const d of Object.values(x.drivers)) d.status = 'sick';
    const ids = bottlenecks(x).map((b) => b.id);
    expect(ids).toContain('drivers');
    expect(ids).toContain('service');
    expect(bottlenecks(x).find((b) => b.id === 'service')?.level).toBe('danger');
    // frischer Spielstand ohne Probleme: keine Fahrer- oder Wartungswarnung
    const fresh = newGame(5);
    expect(bottlenecks(fresh).map((b) => b.id)).not.toContain('drivers');
  });

  it('CSV-Export mit Semikolon, Dezimalkomma und Kopfzeile', () => {
    const csv = reportCsv(s, 'customer', 30);
    const lines = csv.trim().split('\r\n');
    expect(lines[0].replace('﻿', '').split(';')[0]).toBe('Kunde');
    expect(lines.length).toBe(report(s, 'customer', 30).length + 1);
    expect(tripsCsv(s, 30).trim().split('\r\n').length).toBe(recordsSince(s, 30).length + 1);
    expect(ledgerCsv(s)).toMatch(/;-?\d+,\d+\r\n/);
    expect(s.time).toBeGreaterThan(20 * MIN_PER_DAY);
  });
});
