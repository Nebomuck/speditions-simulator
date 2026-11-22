// Insolvenz: Die Bank beobachtet die Liquidität (Kontostand plus offene Forderungen). Liegt sie unter dem
// Kontokorrentrahmen, warnt die Bank; hält das an, kündigt sie den Rahmen und setzt eine Sanierungsfrist.
// Wer die Frist verstreichen lässt, ist zahlungsunfähig – das Spiel endet. Ein kurzes Minus beim Wachsen
// (Fahrzeugkauf, Rechnungen noch offen) zählt nicht.

import { companyValue, addLog, book, formatMoney, receivables } from './finance.ts';
import { vehicleMarketValue } from './generate.ts';
import { isMultiCompany } from './shard.ts';
import { MIN_PER_DAY, formatDate } from './time.ts';
import type { CompanyCrisis, GameState, Id, Money } from './types.ts';

/** Kontokorrentrahmen der Hausbank */
export const CREDIT_LINE: Money = -10_000_00;
/** offene Forderungen zählt die Bank zu diesem Anteil (Ausfallrisiko) */
export const RECEIVABLES_SHARE = 0.9;
/** so lange darf die Liquidität unter dem Rahmen liegen, bevor die Bank kündigt */
export const WARNING_DAYS = 14;
/** Sanierungsfrist nach der Kündigung */
export const RESCUE_DAYS = 45;

/** Liquidität aus Sicht der Bank */
export function bankLiquidity(state: GameState): Money {
  return state.company.account.balance + Math.round(receivables(state) * RECEIVABLES_SHARE);
}

export const crisisOf = (state: GameState): CompanyCrisis | undefined => state.company.crisis;

/** Neue Kredite gibt es nach der Kündigung des Rahmens nicht mehr */
export function crisisLoanBlock(state: GameState): string | undefined {
  return state.company.crisis?.stage === 'notice' ? 'Die Bank hat den Kontokorrentrahmen gekündigt und gibt keine neuen Kredite. Erst muss die Liquidität wieder stimmen.' : undefined;
}

/** Täglich: Liquidität prüfen, Krise eröffnen, verschärfen, beenden – oder Insolvenz */
export function dailyInsolvency(state: GameState): void {
  if (state.exit) return;
  const c = state.company;
  const liq = bankLiquidity(state);
  if (liq >= CREDIT_LINE) {
    if (c.crisis) {
      addLog(state, { level: 'success', category: 'finance', text: c.crisis.stage === 'notice' ? `Sanierung gelungen: Die Liquidität liegt wieder im Rahmen (${formatMoney(liq)}). Die Bank stellt den Kontokorrent wieder bereit.` : `Die Liquidität liegt wieder im Rahmen (${formatMoney(liq)}). Die Bank ist beruhigt.` });
      delete c.crisis;
    }
    return;
  }
  if (!c.crisis) {
    c.crisis = { since: state.time, stage: 'warning' };
    addLog(state, {
      level: 'danger',
      category: 'finance',
      text: `Warnung der Hausbank: Kontostand und offene Forderungen ergeben ${formatMoney(liq)} – unter dem Kontokorrentrahmen von ${formatMoney(CREDIT_LINE)}. Bleibt das ${WARNING_DAYS} Tage so, kündigt die Bank den Rahmen.`,
    });
    return;
  }
  if (c.crisis.stage === 'warning' && state.time - c.crisis.since >= WARNING_DAYS * MIN_PER_DAY) {
    c.crisis.stage = 'notice';
    c.crisis.deadline = state.time + RESCUE_DAYS * MIN_PER_DAY;
    addLog(state, {
      level: 'danger',
      category: 'finance',
      text: `Die Hausbank kündigt den Kontokorrentrahmen. Bis ${formatDate(c.crisis.deadline)} muss die Liquidität wieder über ${formatMoney(CREDIT_LINE)} liegen – sonst droht die Insolvenz. Möglich: Fahrzeuge verkaufen, Forderungen verkaufen (Factoring), Privatgeld einlegen.`,
    });
    return;
  }
  if (c.crisis.stage === 'notice' && c.crisis.deadline !== undefined && state.time >= c.crisis.deadline) declareInsolvency(state);
}

/** Zahlungsunfähig: Das Spiel endet */
export function declareInsolvency(state: GameState): void {
  const debts = state.company.loans.reduce((a, l) => a + l.remaining, 0) + Math.max(0, -state.company.account.balance);
  state.exit = {
    kind: 'insolvency',
    t: state.time,
    price: 0,
    assets: companyValue(state, (id) => vehicleMarketValue(state, id)),
    goodwill: 0,
    debts,
    proceeds: 0,
    months: Math.max(1, Math.round((state.time - state.company.founded) / (30 * MIN_PER_DAY))),
    vehicles: Object.keys(state.vehicles).length,
    deliveries: state.company.totals.deliveries,
    level: state.company.level,
  };
  // Wettbewerbswelt: die Welt läuft für die anderen Firmen weiter
  if (!isMultiCompany(state)) state.paused = true;
  addLog(state, { level: 'danger', category: 'company', text: `${state.company.name} ist zahlungsunfähig. Die Sanierungsfrist ist verstrichen, das Insolvenzverfahren beginnt.` });
}

/** Privateinlage: Geld vom Privatkonto des Spielers in die Firma */
export function injectCapital(state: GameState, playerId: Id, amount: Money): { ok: true } | { ok: false; error: string } {
  const p = state.players[playerId];
  if (!p) return { ok: false, error: 'Unbekannter Spieler.' };
  amount = Math.round(Number(amount) / 100_00) * 100_00;
  if (!Number.isFinite(amount) || amount < 100_00) return { ok: false, error: 'Mindestens 100 €.' };
  const priv = p.character.privateAccount;
  if (priv.balance < amount) return { ok: false, error: `Auf dem Privatkonto liegen nur ${formatMoney(Math.max(0, priv.balance))}.` };
  book(state, `private:${p.id}`, -amount, 'capital', `Einlage in ${state.company.name}`);
  book(state, 'company', amount, 'capital', `Privateinlage ${p.character.name}`);
  addLog(state, { level: 'info', category: 'finance', text: `${p.character.name} legt ${formatMoney(amount)} aus dem Privatvermögen in die Firma ein.` });
  return { ok: true };
}
