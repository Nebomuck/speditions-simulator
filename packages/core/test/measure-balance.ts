// Messung (kein Test): Balancing über eine lange Spielzeit mit einem einfachen Spieler-Bot.
// Der Bot disponiert wie ein guter Disponent (KI-Disposition, ohne Gehalt) und wächst vorsichtig:
// gebrauchter LKW + Fahrer + Auflieger, sobald genug Puffer da ist; Standort ausbauen, wenn die Stellplätze voll sind.
// Aufruf: node packages/core/test/measure-balance.ts [Tage] [Schwierigkeit] [Seed]

import { MIN_PER_DAY, createNewGame, type DifficultyId, type GameState } from '../src/index.ts';
import { createBot } from './bot.ts';
import { ctx } from './helpers.ts';

const DAYS = Number(process.argv[2] ?? 365);
const DIFF = (process.argv[3] ?? 'normal') as DifficultyId;
const SEED = Number(process.argv[4] ?? 11);
const s: GameState = createNewGame(ctx, { seed: SEED, companyName: 'Bot Logistik', hqCityId: 'leipzig', difficulty: DIFF, founder: { id: 'p1', name: 'Bot' } });
if (process.env.NOCOMP) for (const c of Object.values(s.competitors)) { c.status = 'bankrupt'; c.trucks = 0; }
const eur = (c: number) => `${Math.round(c / 100).toLocaleString('de-DE')} €`;

const day = () => Math.floor(s.time / MIN_PER_DAY);
const bot = createBot(s, { lease: !process.env.NOLEASE, log: (t) => console.log(`  Tag ${day()}: ${t}`) });

let lastBal = s.company.account.balance;
let minBal = lastBal;
let lastTotals = { ...s.company.totals };
console.log(`${DIFF}, Seed ${SEED}: Start ${eur(lastBal)}, ${Object.keys(s.vehicles).length} LKW, ${Object.keys(s.drivers).length} Fahrer`);
for (let d = 1; d <= DAYS; d++) {
  bot.day(() => (minBal = Math.min(minBal, s.company.account.balance)));
  if (d % 30 === 0) {
    const t = s.company.totals;
    const del = t.deliveries - lastTotals.deliveries;
    const late = t.lateDeliveries - lastTotals.lateDeliveries;
    const loaded = t.kmLoaded - lastTotals.kmLoaded;
    const empty = t.kmEmpty - lastTotals.kmEmpty;
    const recv = Object.values(s.invoices).filter((i) => i.status === 'open' || i.status === 'overdue').reduce((a, i) => a + i.amount, 0);
    const bal = s.company.account.balance;
    console.log(
      `Monat ${String(d / 30).padStart(2)}: Konto ${eur(bal).padStart(11)} (${bal - lastBal >= 0 ? '+' : ''}${eur(bal - lastBal)}), Forderungen ${eur(recv)}, ` +
        `${Object.keys(s.vehicles).length} LKW, ${del} Lieferungen (${del ? Math.round((late / del) * 100) : 0} % verspätet), ` +
        `${Math.round((loaded + empty) / 1000)}k km, Leer ${loaded + empty ? Math.round((empty / (loaded + empty)) * 100) : 0} %, ${loaded ? ((t.revenue - lastTotals.revenue) / loaded / 100).toFixed(2) : '–'} €/Last-km, Umsatz/LKW ${eur((t.revenue - lastTotals.revenue) / Math.max(1, Object.keys(s.vehicles).length))}, Stufe ${s.company.level}, Ruf ${Math.round(s.company.reputation)}, ${s.economy.phase}`,
    );
    lastBal = bal;
    lastTotals = { ...t };
  }
}
for (const v of Object.values(s.vehicles)) console.log(`  ${v.plate}: ${v.status}, Zustand ${Math.round(v.condition)} %, ${Math.round(v.odometerKm / 1000)}k km`);
for (const d of Object.values(s.drivers)) console.log(`  ${d.name}: ${d.status}, Zufriedenheit ${Math.round(d.satisfaction)}, Urlaub übrig ${d.vacationLeft}${d.leavesAt ? ', kündigt' : ''}`);
console.log(s.log.filter((l) => /kündig|verlässt|Werkstatt|Wartung|Panne|krank/i.test(l.text)).slice(-8).map((l) => l.text));
console.log(`Überführungen ${s.autoDispatch.stats.relocations}, geplant ${s.autoDispatch.stats.planned}`);
console.log(`Tiefster Kontostand ${eur(minBal)} · Ende ${eur(s.company.account.balance)} · Kredite ${s.company.loans.length}`);
const byCat: Record<string, number> = {};
for (const l of s.ledger.filter((l) => l.account === 'company')) byCat[l.category] = (byCat[l.category] ?? 0) + l.amount / (DAYS / 30);
console.log('Ø je Monat nach Kategorie:', Object.fromEntries(Object.entries(byCat).sort((a, b) => a[1] - b[1]).map(([k, v]) => [k, eur(v)])));
