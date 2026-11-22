import { describe, expect, it } from 'vitest';
import {
  applyCommand, bankLiquidity, dailyInsolvency, deserializeSave, serializeSave, CREDIT_LINE, MIN_PER_DAY, RESCUE_DAYS, WARNING_DAYS, type GameState,
} from '../src/index.ts';
import { ctx, newGame } from './helpers.ts';

/** Tage vergehen lassen und täglich prüfen (ohne Simulation: nur die Bank) */
function days(s: GameState, n: number) {
  for (let i = 0; i < n; i++) {
    s.time += MIN_PER_DAY;
    dailyInsolvency(s);
  }
}

describe('Insolvenz', () => {
  it('kurzes Minus mit offenen Forderungen zählt nicht – die Bank rechnet Forderungen zu 90 % mit', () => {
    const s = newGame();
    s.company.account.balance = -15_000_00;
    s.invoices.test = { id: 'test', customerId: Object.keys(s.customers)[0], orderId: 'x', amount: 10_000_00, issued: s.time, due: s.time + 30 * MIN_PER_DAY, status: 'open', willPayAt: null, reminders: 0 };
    expect(bankLiquidity(s)).toBe(-6_000_00);
    days(s, 30);
    expect(s.company.crisis).toBeUndefined();
  });

  it('Warnung, Kündigung mit Sanierungsfrist, dann Insolvenz – das Spiel endet', () => {
    const s = newGame();
    s.company.account.balance = CREDIT_LINE - 5_000_00;
    days(s, 1);
    expect(s.company.crisis?.stage).toBe('warning');
    expect(s.log.some((l) => l.text.startsWith('Warnung der Hausbank'))).toBe(true);
    days(s, WARNING_DAYS);
    expect(s.company.crisis?.stage).toBe('notice');
    expect(s.company.crisis?.deadline).toBeGreaterThan(s.time);
    // keine neuen Kredite nach der Kündigung
    const loan = applyCommand(s, ctx, 'p1', { type: 'takeLoan', amount: 10_000_00, months: 24 });
    expect(loan.ok).toBe(false);
    days(s, RESCUE_DAYS + 1);
    expect(s.exit?.kind).toBe('insolvency');
    expect(s.exit?.debts).toBeGreaterThanOrEqual(-CREDIT_LINE);
    expect(s.paused).toBe(true);
    // nach der Insolvenz ist nichts mehr zu tun
    expect(applyCommand(s, ctx, 'p1', { type: 'setPaused', paused: false }).ok).toBe(false);
  });

  it('Sanierung: Privateinlage hebt die Liquidität, die Krise endet', () => {
    const s = newGame();
    s.company.account.balance = CREDIT_LINE - 3_000_00;
    days(s, WARNING_DAYS + 1);
    expect(s.company.crisis?.stage).toBe('notice');
    const founder = Object.values(s.players)[0];
    const priv0 = founder.character.privateAccount.balance;
    expect(applyCommand(s, ctx, 'p1', { type: 'injectCapital', amount: priv0 + 100_00 }).ok).toBe(false);
    expect(applyCommand(s, ctx, 'p1', { type: 'injectCapital', amount: 5_000_00 }).ok).toBe(true);
    expect(founder.character.privateAccount.balance).toBe(priv0 - 5_000_00);
    expect(s.today.revenue).toBe(0); // eine Einlage ist kein Umsatz
    days(s, 1);
    expect(s.company.crisis).toBeUndefined();
    expect(s.exit).toBeUndefined();
    expect(s.log.some((l) => l.text.startsWith('Sanierung gelungen'))).toBe(true);
  });

  it('die Krise übersteht Speichern und Laden', () => {
    const s = newGame();
    s.company.account.balance = CREDIT_LINE - 1_000_00;
    days(s, WARNING_DAYS + 1);
    const loaded = deserializeSave(serializeSave(s, 'Krise'));
    expect(loaded.company.crisis).toEqual(s.company.crisis);
  });
});
