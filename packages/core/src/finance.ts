// FinanceSystem: Buchungen, Rechnungen, Zahlungseingänge, Monatsabrechnung.
// Firmenkonto und Privatkonten der Spieler sind strikt getrennt (LedgerAccount).

import { TRAILER_BY_TYPE, TRUCK_BY_ID, LOCATION_DEFS, PRIVATE_LIVING_COST } from './data/catalog.ts';
import { rand, newId } from './rng.ts';
import { MIN_PER_DAY, formatDate } from './time.ts';
import type { Customer, GameState, Id, LedgerAccount, LedgerCategory, LogEntry, Money, Order } from './types.ts';

export const EMPLOYER_COST_FACTOR = 1.21; // Arbeitgeberanteil Sozialversicherung (Spielwert)
export const OVERDRAFT_INTEREST_PA = 0.12;
const LEDGER_LIMIT = 2000;
const LOG_LIMIT = 400;

export function formatMoney(cents: Money, withCents = false): string {
  const v = cents / 100;
  return v.toLocaleString('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: withCents ? 2 : 0,
    maximumFractionDigits: withCents ? 2 : 0,
  });
}

export function addLog(state: GameState, entry: Omit<LogEntry, 'id' | 't'>): void {
  state.log.push({ id: state.nextId++, t: state.time, ...entry });
  if (state.log.length > LOG_LIMIT) state.log.splice(0, state.log.length - LOG_LIMIT);
}

export function accountOf(state: GameState, account: LedgerAccount) {
  if (account === 'company') return state.company.account;
  const pid = account.slice('private:'.length);
  const p = state.players[pid];
  if (!p) throw new Error(`Unbekanntes Konto ${account}`);
  return p.character.privateAccount;
}

/** Bucht einen Betrag (positiv = Eingang) auf ein Konto und protokolliert ihn im Hauptbuch. */
export function book(state: GameState, account: LedgerAccount, amount: Money, category: LedgerCategory, text: string): void {
  amount = Math.round(amount);
  if (amount === 0) return;
  accountOf(state, account).balance += amount;
  state.ledger.push({ t: state.time, account, amount, category, text });
  if (state.ledger.length > LEDGER_LIMIT) state.ledger.splice(0, state.ledger.length - LEDGER_LIMIT);
  if (account === 'company') {
    if (amount > 0) state.today.revenue += amount;
    else state.today.costs -= amount;
  }
}

/** Rechnung nach Lieferung erstellen. Zahlungszeitpunkt wird deterministisch vorab bestimmt. */
export function createInvoice(state: GameState, order: Order, amount: Money): void {
  const cust = state.customers[order.customerId];
  const term = cust.paymentTermDays;
  const due = state.time + term * MIN_PER_DAY;
  const reliability = Math.max(0.05, Math.min(0.99, cust.paymentReliability));
  let willPayAt: number | null;
  const defaultRisk = (1 - reliability) * 0.08 * state.difficulty.paymentRiskFactor;
  if (rand.chance(state, defaultRisk)) willPayAt = null;
  else if (rand.chance(state, reliability)) willPayAt = state.time + Math.round(term * rand.float(state, 0.55, 1.0) * MIN_PER_DAY);
  else willPayAt = due + Math.round(rand.float(state, 2, 35) * MIN_PER_DAY);
  const id = newId(state, 'inv');
  state.invoices[id] = { id, orderId: order.id, customerId: cust.id, amount, issued: state.time, due, willPayAt, status: 'open', reminders: 0 };
  addLog(state, {
    level: 'info',
    category: 'finance',
    text: `Rechnung über ${formatMoney(amount)} an ${cust.name} gestellt (Zahlungsziel ${term} Tage, fällig ${formatDate(due)}).`,
    ref: { kind: 'invoice', id },
  });
}

/** Stündlich: Zahlungseingänge, Mahnungen, Zahlungsausfälle. */
export function processInvoices(state: GameState): void {
  for (const inv of Object.values(state.invoices)) {
    if (inv.status === 'paid' || inv.status === 'defaulted') continue;
    const cust = state.customers[inv.customerId];
    if (inv.willPayAt !== null && state.time >= inv.willPayAt) {
      inv.status = 'paid';
      inv.paid = state.time;
      book(state, 'company', inv.amount, 'revenue', `Zahlungseingang ${cust.name}`);
      addLog(state, { level: 'success', category: 'finance', text: `Zahlungseingang: ${formatMoney(inv.amount)} von ${cust.name}.`, ref: { kind: 'invoice', id: inv.id } });
      continue;
    }
    if (state.time > inv.due) {
      if (inv.status === 'open') inv.status = 'overdue';
      const overdueDays = (state.time - inv.due) / MIN_PER_DAY;
      const remindersDue = Math.floor(overdueDays / 10) + 1;
      if (inv.reminders < Math.min(3, remindersDue)) {
        inv.reminders++;
        addLog(state, { level: 'warning', category: 'finance', text: `${inv.reminders}. Mahnung an ${cust.name} (${formatMoney(inv.amount)} seit ${Math.floor(overdueDays)} Tagen überfällig).`, ref: { kind: 'invoice', id: inv.id } });
      }
      if (inv.willPayAt === null && overdueDays > 60) {
        inv.status = 'defaulted';
        cust.paymentReliability = Math.max(0.05, cust.paymentReliability - 0.3);
        addLog(state, { level: 'danger', category: 'finance', text: `Zahlungsausfall: ${cust.name} begleicht ${formatMoney(inv.amount)} nicht mehr. Forderung abgeschrieben.`, ref: { kind: 'invoice', id: inv.id } });
      }
    }
  }
}

export function receivables(state: GameState): Money {
  let sum = 0;
  for (const inv of Object.values(state.invoices)) if (inv.status === 'open' || inv.status === 'overdue') sum += inv.amount;
  return sum;
}

export function monthlyFixedCosts(state: GameState): { label: string; amount: Money; category: LedgerCategory }[] {
  const items: { label: string; amount: Money; category: LedgerCategory }[] = [];
  for (const d of Object.values(state.drivers)) items.push({ label: `Lohn ${d.name}`, amount: Math.round(d.salary * EMPLOYER_COST_FACTOR), category: 'wages' });
  for (const loc of state.company.locations) items.push({ label: `Miete ${LOCATION_DEFS[loc.kind].name}`, amount: LOCATION_DEFS[loc.kind].rent, category: 'rent' });
  for (const v of Object.values(state.vehicles)) {
    const m = TRUCK_BY_ID[v.modelId];
    items.push({ label: `Versicherung ${v.plate}`, amount: m.insurance, category: 'insurance' });
    if (v.ownership === 'leased' && v.leaseRate) items.push({ label: `Leasing ${v.plate}`, amount: v.leaseRate, category: 'leasing' });
  }
  for (const t of Object.values(state.trailers)) {
    items.push({ label: `Versicherung ${t.plate}`, amount: TRAILER_BY_TYPE[t.type].insurance, category: 'insurance' });
    if (t.ownership === 'leased' && t.leaseRate) items.push({ label: `Leasing ${t.plate}`, amount: t.leaseRate, category: 'leasing' });
  }
  for (const p of Object.values(state.players)) if (p.character.salary > 0) items.push({ label: `Geschäftsführergehalt ${p.character.name}`, amount: p.character.salary, category: 'salary' });
  items.push({ label: 'Software, Telefon, Verwaltung', amount: 120_00 + 25_00 * Object.keys(state.vehicles).length, category: 'other' });
  return items;
}

/** Am Monatsersten: Löhne, Mieten, Versicherungen, Leasing, GF-Gehalt, private Lebenshaltung, Zinsen. */
export function processMonthEnd(state: GameState): void {
  for (const item of monthlyFixedCosts(state)) {
    book(state, 'company', -item.amount, item.category, item.label);
  }
  for (const p of Object.values(state.players)) {
    if (p.character.salary > 0) book(state, `private:${p.id}`, p.character.salary, 'salary', 'Geschäftsführergehalt');
    book(state, `private:${p.id}`, -PRIVATE_LIVING_COST, 'living', 'Miete Wohnung & Lebenshaltung');
  }
  if (state.company.account.balance < 0) {
    const interest = Math.round((-state.company.account.balance * OVERDRAFT_INTEREST_PA) / 12);
    book(state, 'company', -interest, 'interest', 'Überziehungszinsen Geschäftskonto');
    addLog(state, { level: 'danger', category: 'finance', text: `Geschäftskonto im Minus – ${formatMoney(interest)} Überziehungszinsen fällig.` });
  }
  addLog(state, { level: 'info', category: 'finance', text: 'Monatsabrechnung durchgeführt: Löhne, Mieten, Versicherungen und Leasingraten gebucht.' });
}

export function adjustSatisfaction(c: Customer, delta: number) {
  c.satisfaction = Math.max(0, Math.min(100, c.satisfaction + delta));
}

export function companyValue(state: GameState, vehicleValue: (id: Id) => Money): Money {
  let v = state.company.account.balance + receivables(state);
  for (const id of Object.keys(state.vehicles)) if (state.vehicles[id].ownership === 'owned') v += vehicleValue(id);
  for (const t of Object.values(state.trailers)) if (t.ownership === 'owned') v += Math.round(t.purchasePrice * 0.6 * (t.condition / 100));
  return v;
}
