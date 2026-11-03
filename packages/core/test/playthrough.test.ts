// Abschlusstest (Phase 12): ein kompletter Spielablauf von der Gründung bis Unternehmensstufe 4 mit dem
// Spieler-Bot. Stündlich werden die Grundregeln der Simulation geprüft, vierteljährlich Speichern/Laden.
// Eigene Datei, damit der lange Lauf parallel zu den übrigen Tests läuft.

import { describe, expect, it } from 'vitest';
import { HOS_RULES, createNewGame, deserializeSave, serializeSave, type GameState } from '../src/index.ts';
import { createBot } from './bot.ts';
import { ctx } from './helpers.ts';

/** Grundregeln, die zu jedem Zeitpunkt gelten müssen; liefert die erste Verletzung */
function violation(s: GameState): string | null {
  if (!Number.isSafeInteger(s.company.account.balance)) return `Kontostand ungültig: ${s.company.account.balance}`;
  for (const p of Object.values(s.players)) if (!Number.isSafeInteger(p.character.privateAccount.balance)) return `Privatkonto ungültig (${p.name})`;
  const busy = { vehicle: new Set<string>(), driver: new Set<string>(), trailer: new Set<string>() };
  for (const t of Object.values(s.trips)) {
    if (t.phase === 'done') continue;
    const v = s.vehicles[t.vehicleId];
    const d = s.drivers[t.driverId];
    if (!v || !d) return `Fahrt ${t.id} ohne Fahrzeug oder Fahrer`;
    if (v.tripId !== t.id || d.tripId !== t.id) return `Fahrt ${t.id}: Fahrzeug/Fahrer verweisen auf eine andere Fahrt`;
    if (busy.vehicle.has(v.id) || busy.driver.has(d.id) || (t.trailerId && busy.trailer.has(t.trailerId))) return `Doppelbelegung in Fahrt ${t.id}`;
    busy.vehicle.add(v.id);
    busy.driver.add(d.id);
    if (t.trailerId) busy.trailer.add(t.trailerId);
  }
  for (const v of Object.values(s.vehicles)) {
    if (v.status === 'on_trip' && !busy.vehicle.has(v.id)) return `${v.plate} unterwegs ohne aktive Fahrt`;
    if (!(v.condition >= 0 && v.condition <= 100)) return `${v.plate}: Zustand ${v.condition}`;
    if (!(v.fuelL >= 0)) return `${v.plate}: Tank ${v.fuelL}`;
  }
  for (const d of Object.values(s.drivers)) {
    if (d.status === 'on_trip' && !busy.driver.has(d.id)) return `${d.name} unterwegs ohne aktive Fahrt`;
    if (d.hos.drivenToday > HOS_RULES.DAILY_DRIVE) return `${d.name}: ${d.hos.drivenToday} min Tageslenkzeit`;
    if (d.hos.drivenSinceBreak > HOS_RULES.BREAK_AFTER) return `${d.name}: ${d.hos.drivenSinceBreak} min ohne Pause`;
    if (d.hos.drivenWeek > HOS_RULES.WEEKLY_DRIVE) return `${d.name}: ${d.hos.drivenWeek} min Wochenlenkzeit`;
  }
  return null;
}

describe('Abschlusstest: Spielablauf von der Gründung bis Stufe 4', () => {
  it('der Bot gründet, wächst bis zur überregionalen Spedition, alle Grundregeln halten', async () => {
    const s = createNewGame(ctx, { seed: 11, companyName: 'Abschluss Logistik', hqCityId: 'leipzig', difficulty: 'easy', founder: { id: 'p1', name: 'Bot' } });
    const bot = createBot(s);
    const reached: Record<number, number> = {};
    let problem: string | null = null;
    let day = 0;
    for (; day < 600 && (s.company.level ?? 1) < 4 && !problem; day++) {
      bot.day(() => {
        problem ??= violation(s);
      });
      reached[s.company.level] ??= day;
      // dem Test-Runner regelmäßig Luft lassen (sonst läuft dessen interne Kommunikation in einen Timeout)
      if (day % 10 === 0) await new Promise((r) => setImmediate(r));
      if (day % 90 === 89) {
        // Speichertest mitten im laufenden Betrieb: verlustfrei und mit identischer Fortsetzung
        const loaded = deserializeSave(serializeSave(s, 'Abschluss'));
        expect(JSON.stringify(loaded)).toBe(JSON.stringify(s));
      }
    }
    console.log(`Stufen erreicht (Spieltag): ${JSON.stringify(reached)} · ${Object.keys(s.vehicles).length} LKW, ${s.company.locations.length} Standorte, ${s.company.totals.deliveries} Lieferungen`);
    expect(problem).toBeNull();
    expect(s.company.level).toBeGreaterThanOrEqual(4);
    expect(day).toBeLessThan(600);
    expect(s.company.totals.deliveries).toBeGreaterThanOrEqual(400);
    // über 80 % der Lieferungen pünktlich
    expect(s.company.totals.lateDeliveries / s.company.totals.deliveries).toBeLessThan(0.2);
  }, 400_000);
});
