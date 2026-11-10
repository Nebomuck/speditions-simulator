// Firmenverkauf: Die Spedition wird zum Unternehmenswert verkauft (Substanz plus Kundenstamm), Kredite
// werden abgelöst, das Spiel endet. Der Erlös ist Grundlage für den Neustart-Bonus der nächsten Gründung.

import { companyValue, addLog, formatMoney } from './finance.ts';
import { vehicleMarketValue } from './generate.ts';
import { MIN_PER_DAY } from './time.ts';
import type { CompanyExit, GameState, Money } from './types.ts';

/** frühestens nach so vielen Tagen verkaufbar */
export const EXIT_MIN_DAYS = 90;

export interface ExitValuation {
  assets: Money;
  goodwill: Money;
  debts: Money;
  price: Money;
  proceeds: Money;
  /** Ø Monatsgewinn der letzten 90 Tage */
  monthlyProfit: Money;
  loyalCustomers: number;
}

export function exitValuation(state: GameState): ExitValuation {
  const assets = companyValue(state, (id) => vehicleMarketValue(state, id));
  const debts = state.company.loans.reduce((a, l) => a + l.remaining, 0);
  const days = state.stats.slice(-90);
  const profit = days.reduce((a, d) => a + d.revenue - d.costs, 0);
  const monthlyProfit = days.length ? Math.round((profit / days.length) * 30) : 0;
  const loyalCustomers = Object.values(state.customers).filter((c) => !c.lostTo && c.deliveries >= 3 && c.satisfaction >= 60).length;
  // Kundenstamm: ein Jahresgewinn, gewichtet nach Ruf, plus treue Kunden
  const goodwill = Math.max(0, Math.round(monthlyProfit * 12 * (0.5 + state.company.reputation / 200))) + loyalCustomers * 1_500_00;
  const price = Math.max(0, Math.round((assets + goodwill) / 1000_00) * 1000_00);
  return { assets, goodwill, debts, price, proceeds: Math.max(0, price - debts), monthlyProfit, loyalCustomers };
}

export function exitBlock(state: GameState): string | undefined {
  if (state.exit) return 'Die Firma ist bereits verkauft.';
  if (Object.keys(state.players).length > 1) return 'Im Multiplayer lässt sich die Firma nicht verkaufen.';
  if (state.time - state.company.founded < EXIT_MIN_DAYS * MIN_PER_DAY) return `Käufer interessieren sich erst für Firmen, die mindestens ${EXIT_MIN_DAYS} Tage am Markt sind.`;
  if (Object.values(state.trips).some((t) => t.phase !== 'done')) return 'Erst alle laufenden Fahrten abschließen – Käufer übernehmen keine halben Touren.';
  if (exitValuation(state).proceeds <= 0) return 'Die Schulden übersteigen den Firmenwert. So findet sich kein Käufer.';
  return undefined;
}

/** Verkauf abschließen: Spiel endet, Erlös fließt aufs Privatkonto des Gründers */
export function sellCompany(state: GameState): { ok: true; exit: CompanyExit } | { ok: false; error: string } {
  const block = exitBlock(state);
  if (block) return { ok: false, error: block };
  const v = exitValuation(state);
  const exit: CompanyExit = {
    t: state.time, price: v.price, assets: v.assets, goodwill: v.goodwill, debts: v.debts, proceeds: v.proceeds,
    months: Math.max(1, Math.round((state.time - state.company.founded) / (30 * MIN_PER_DAY))),
    vehicles: Object.keys(state.vehicles).length,
    deliveries: state.company.totals.deliveries,
    level: state.company.level,
  };
  state.exit = exit;
  state.paused = true;
  for (const p of Object.values(state.players)) {
    if (p.isFounder) p.character.privateAccount.balance += v.proceeds;
  }
  addLog(state, { level: 'success', category: 'company', text: `${state.company.name} ist verkauft: ${formatMoney(v.price)} Kaufpreis, nach Ablösung der Kredite ${formatMoney(v.proceeds)} Erlös.` });
  return { ok: true, exit };
}

/** Neustart-Bonus aus früheren Verkäufen: 10 % der Erlöse als zusätzliches Startkapital (max. 100.000 €), Ruf +3 je Verkauf (max. +9) */
export function legacyBonus(exits: { proceeds: Money }[]): { capital: Money; reputation: number } {
  const total = exits.reduce((a, e) => a + Math.max(0, e.proceeds), 0);
  return { capital: Math.min(100_000_00, Math.round((total * 0.1) / 1000_00) * 1000_00), reputation: Math.min(9, exits.length * 3) };
}
