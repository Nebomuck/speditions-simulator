// FinanceSystem: Buchungen, Rechnungen, Zahlungseingänge, Monatsabrechnung.
// Firmenkonto und Privatkonten der Spieler sind strikt getrennt (LedgerAccount).

import { TRAILER_BY_TYPE, TRUCK_BY_ID, LOCATION_DEFS, PRIVATE_LIVING_COST } from './data/catalog.ts';
import { rand, newId } from './rng.ts';
import { MIN_PER_DAY, formatDate } from './time.ts';
import type { Customer, GameState, Id, Invoice, LedgerAccount, LedgerCategory, Loan, LogEntry, Money, Order } from './types.ts';

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
  const risk = state.difficulty.paymentRiskFactor;
  let willPayAt: number | null;
  // Balancing 0.4.0: Die meisten Kunden zahlen fristgerecht (Normal ≈ 90–96 %), Verzug meist nur einige Tage,
  // echte Ausfälle sind selten (≈ 0,3–0,8 % der Rechnungen). Schlechte Zahler erkennt man an der Zahlungsmoral.
  const defaultRisk = (1 - reliability) * 0.025 * risk;
  const onTime = Math.min(0.99, 0.6 + 0.4 * reliability - 0.05 * (risk - 1));
  if (rand.chance(state, defaultRisk)) willPayAt = null;
  else if (rand.chance(state, onTime)) willPayAt = state.time + Math.round(term * rand.float(state, 0.55, 1.0) * MIN_PER_DAY);
  else willPayAt = due + Math.round(rand.float(state, 1, reliability > 0.8 ? 10 : 21) * MIN_PER_DAY);
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
    if (inv.status === 'paid' || inv.status === 'defaulted' || inv.status === 'factored') continue;
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
      if (inv.willPayAt === null && overdueDays > 45) {
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
  for (const l of state.company.loans) items.push({ label: `Kreditrate (Rest ${formatMoney(l.remaining)})`, amount: Math.min(l.monthly, l.remaining + loanInterest(l)), category: 'loan' });
  items.push({ label: 'Software, Telefon, Verwaltung', amount: 120_00 + 25_00 * Object.keys(state.vehicles).length, category: 'other' });
  return items;
}

/** Am Monatsersten: Löhne, Mieten, Versicherungen, Leasing, GF-Gehalt, private Lebenshaltung, Zinsen. */
export function processMonthEnd(state: GameState): void {
  for (const item of monthlyFixedCosts(state)) {
    if (item.category === 'loan') continue; // Kreditraten unten getrennt nach Zins und Tilgung
    book(state, 'company', -item.amount, item.category, item.label);
  }
  for (const l of state.company.loans) {
    const interest = loanInterest(l);
    const principal = Math.min(l.remaining, l.monthly - interest);
    book(state, 'company', -interest, 'interest', 'Kreditzinsen');
    book(state, 'company', -principal, 'loan', 'Kredittilgung');
    l.remaining -= principal;
  }
  const repaid = state.company.loans.filter((l) => l.remaining <= 0);
  state.company.loans = state.company.loans.filter((l) => l.remaining > 0);
  for (const l of repaid) addLog(state, { level: 'success', category: 'finance', text: `Kredit über ${formatMoney(l.principal)} vollständig getilgt.` });
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

// ---------- Kredite ----------

export const LOAN_TERMS = [12, 24, 36, 60] as const;
const LOAN_MIN = 5_000_00;

export function loanInterest(l: Loan): Money {
  return Math.round((l.remaining * l.ratePa) / 12);
}

/** Zinssatz: 6,5 % Basis, Aufschlag bei hoher Verschuldung oder Minus auf dem Konto. */
export function loanRate(state: GameState, months: number): number {
  const minus = state.company.account.balance < 0 ? 0.02 : 0;
  return 0.065 + (months > 36 ? 0.01 : 0) + minus;
}

/** Kreditrahmen der Bank: Sockel + Beleihung von Fahrzeugen und Forderungen, abzüglich bestehender Kredite. */
export function loanLimit(state: GameState, vehicleValue: (id: Id) => Money): Money {
  let collateral = 0;
  for (const id of Object.keys(state.vehicles)) if (state.vehicles[id].ownership === 'owned') collateral += vehicleValue(id) * 0.5;
  for (const t of Object.values(state.trailers)) if (t.ownership === 'owned') collateral += t.purchasePrice * 0.6 * (t.condition / 100) * 0.5;
  collateral += receivables(state) * 0.3;
  const base = 20_000_00 + Object.keys(state.vehicles).length * 5_000_00;
  const debt = state.company.loans.reduce((s, l) => s + l.remaining, 0);
  return Math.max(0, Math.round(Math.min(300_000_00, base + collateral - debt) / 1000_00) * 1000_00);
}

export function annuity(amount: Money, ratePa: number, months: number): Money {
  const r = ratePa / 12;
  return Math.ceil((amount * r) / (1 - Math.pow(1 + r, -months)));
}

export function takeLoan(state: GameState, amount: Money, months: number, vehicleValue: (id: Id) => Money): { ok: true; loan: Loan } | { ok: false; error: string } {
  if (!LOAN_TERMS.includes(months as (typeof LOAN_TERMS)[number])) return { ok: false, error: 'Ungültige Laufzeit.' };
  amount = Math.round(amount / 100_00) * 100_00;
  if (amount < LOAN_MIN) return { ok: false, error: `Mindestbetrag ${formatMoney(LOAN_MIN)}.` };
  const limit = loanLimit(state, vehicleValue);
  if (amount > limit) return { ok: false, error: `Die Bank gewährt derzeit höchstens ${formatMoney(limit)}.` };
  const ratePa = loanRate(state, months);
  const loan: Loan = { id: newId(state, 'loan'), principal: amount, remaining: amount, ratePa, monthly: annuity(amount, ratePa, months), months, taken: state.time };
  state.company.loans.push(loan);
  book(state, 'company', amount, 'loan', `Kreditauszahlung (${months} Monate, ${(ratePa * 100).toFixed(1).replace('.', ',')} %)`);
  addLog(state, { level: 'info', category: 'finance', text: `Kredit über ${formatMoney(amount)} aufgenommen – Rate ${formatMoney(loan.monthly)} pro Monat.` });
  return { ok: true, loan };
}

export function repayLoan(state: GameState, loanId: Id): { ok: true } | { ok: false; error: string } {
  const l = state.company.loans.find((x) => x.id === loanId);
  if (!l) return { ok: false, error: 'Kredit nicht gefunden.' };
  const fee = Math.round(l.remaining * 0.01); // Vorfälligkeitsentschädigung 1 %
  if (state.company.account.balance < l.remaining + fee) return { ok: false, error: `Für die Ablöse werden ${formatMoney(l.remaining + fee)} benötigt.` };
  book(state, 'company', -l.remaining, 'loan', 'Sondertilgung Kredit');
  book(state, 'company', -fee, 'interest', 'Vorfälligkeitsentschädigung');
  state.company.loans = state.company.loans.filter((x) => x !== l);
  addLog(state, { level: 'success', category: 'finance', text: `Kredit vorzeitig abgelöst (${formatMoney(l.remaining)} + ${formatMoney(fee)} Gebühr).` });
  return { ok: true };
}

// ---------- Factoring ----------

/** Auszahlung beim Verkauf einer Rechnung: 3 % Gebühr, bei Überfälligkeit 3 % + 0,15 % je Verzugstag (max. 15 %). */
export function factoringPayout(state: GameState, inv: Invoice): Money {
  const overdueDays = Math.max(0, (state.time - inv.due) / MIN_PER_DAY);
  const fee = Math.min(0.15, 0.03 + overdueDays * 0.0015);
  return Math.round(inv.amount * (1 - fee));
}

export function factorInvoices(state: GameState, invoiceId?: Id): { ok: true; count: number; payout: Money } | { ok: false; error: string } {
  const list = Object.values(state.invoices).filter((i) => (i.status === 'open' || i.status === 'overdue') && (!invoiceId || i.id === invoiceId));
  if (!list.length) return { ok: false, error: 'Keine offenen Rechnungen zum Verkauf.' };
  let payout = 0;
  for (const inv of list) {
    const p = factoringPayout(state, inv);
    payout += p;
    inv.status = 'factored';
    inv.paid = state.time;
    book(state, 'company', p, 'revenue', `Factoring ${state.customers[inv.customerId]?.name ?? ''}`.trim());
  }
  addLog(state, { level: 'success', category: 'finance', text: `${list.length} Rechnung${list.length > 1 ? 'en' : ''} an Factoring-Gesellschaft verkauft – ${formatMoney(payout)} sofort gutgeschrieben.` });
  return { ok: true, count: list.length, payout };
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
