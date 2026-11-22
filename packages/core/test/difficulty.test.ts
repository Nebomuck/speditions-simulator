import { describe, expect, it } from 'vitest';
import { DIFFICULTIES, STATE_VERSION, deserializeSave, serializeSave } from '../src/index.ts';
import { newGame } from './helpers.ts';

describe('Schwierigkeitsgrad Realistisch (0.15.3)', () => {
  it('hat Marktraten ohne Aufschlag und nur leicht erhöhtes Risiko', () => {
    const r = DIFFICULTIES.realistic;
    expect(r.rateFactor).toBe(1);
    // Normal zahlt seit der Konsolidierung nach Paket E 5 % mehr, Einfach 8 %
    expect(DIFFICULTIES.normal.rateFactor).toBe(1.05);
    expect(DIFFICULTIES.easy.rateFactor).toBeGreaterThan(DIFFICULTIES.normal.rateFactor);
    expect(r.eventFactor).toBeLessThanOrEqual(1.1);
    expect(r.paymentRiskFactor).toBeLessThanOrEqual(1.1);
    expect(r.startCapital).toBeLessThan(DIFFICULTIES.normal.startCapital);
  });

  it('laufende Spiele auf Realistisch bekommen beim Laden die neuen Faktoren, andere bleiben unberührt', () => {
    const s = newGame();
    s.difficulty = { id: 'realistic', startCapital: 12_000_00, rateFactor: 0.96, eventFactor: 1.4, paymentRiskFactor: 1.4, startTruckOwned: false };
    const loaded = deserializeSave(serializeSave(s, 'alt').replace(`"version":${STATE_VERSION}`, '"version":11'));
    expect(loaded.difficulty).toMatchObject({ rateFactor: 1.0, eventFactor: 1.1, paymentRiskFactor: 1.1, startCapital: 12_000_00 });

    const c = newGame();
    c.difficulty = { id: 'custom', startCapital: 12_000_00, rateFactor: 0.9, eventFactor: 1.4, paymentRiskFactor: 1.4, startTruckOwned: false };
    const loadedC = deserializeSave(serializeSave(c, 'alt').replace(`"version":${STATE_VERSION}`, '"version":11'));
    expect(loadedC.difficulty).toMatchObject({ rateFactor: 0.9, eventFactor: 1.4, paymentRiskFactor: 1.4 });
  });
});
