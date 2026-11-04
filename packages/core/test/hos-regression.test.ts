import { describe, expect, it } from 'vitest';
import { HOS_RULES, applyCommand, drivableNow, freshHos, hosRest, hosWork, simulateDriving, tickMinutes } from '../src/index.ts';
import { addOrder, ctx, first, newGame } from './helpers.ts';

/** Fahrer mit erschöpfter Tageslenkzeit, der seine Tagesruhe unterbrochen ableistet (Warten → Beladen → Rest) */
function interruptedDailyRest() {
  const h = freshHos();
  h.drivenToday = HOS_RULES.DAILY_DRIVE;
  h.drivenSinceBreak = 120;
  h.drivenWeek = 1500;
  h.restStreak = 0;
  h.requiredRest = HOS_RULES.DAILY_REST;
  h.requiredRestKind = 'daily';
  hosRest(h, 300); // Warten am Ladefenster
  hosWork(h, 60); // Beladen unterbricht die Ruhe
  hosRest(h, HOS_RULES.DAILY_REST - 300); // Rest der Tagesruhe
  return h;
}

describe('Lenk- und Ruhezeiten: unterbrochene Pflichtruhe (0.15.1)', () => {
  it('nach abgeleisteter, unterbrochener Tagesruhe darf der Fahrer wieder fahren', () => {
    const h = interruptedDailyRest();
    expect(h.requiredRest).toBe(0);
    expect(drivableNow(h)).toBeGreaterThan(0);
    expect(h.drivenToday).toBe(0);
  });

  it('die Planung bricht bei erschöpfter Lenkzeit ohne Ruhepflicht nicht ab', () => {
    const h = freshHos();
    h.drivenToday = HOS_RULES.DAILY_DRIVE; // Zustand aus älteren Spielständen: Grenze erreicht, keine Ruhe verlangt
    const r = simulateDriving(h, 300);
    expect(r.restMin).toBeGreaterThanOrEqual(HOS_RULES.DAILY_REST);
    expect(r.elapsed).toBeGreaterThanOrEqual(300 + HOS_RULES.DAILY_REST);
  });

  it('ein Fahrer im Pendelzustand (Lenkzeit erschöpft, keine Ruhe) legt eine Ruhe ein und fährt dann weiter', () => {
    const s = newGame();
    const o = addOrder(s, 'leipzig', 'berlin');
    const v = first(s.vehicles);
    const d = first(s.drivers);
    expect(applyCommand(s, ctx, 'p1', { type: 'dispatch', orderId: o.id, vehicleId: v.id, driverId: d.id, trailerId: first(s.trailers).id }).ok).toBe(true);
    const trip = s.trips[v.tripId!];
    // bis zur Fahrt zum Empfänger laufen lassen
    for (let i = 0; i < 24 * 60 && trip.phase !== 'to_delivery'; i++) tickMinutes(s, ctx, 1);
    expect(trip.phase).toBe('to_delivery');
    // Fehlerzustand herstellen
    d.hos.drivenToday = HOS_RULES.DAILY_DRIVE;
    d.hos.requiredRest = 0;
    d.hos.requiredRestKind = 'none';
    const km = trip.progressKm;
    tickMinutes(s, ctx, HOS_RULES.DAILY_REST + 120);
    expect(trip.progressKm > km || trip.phase !== 'to_delivery').toBe(true);
  });
});
