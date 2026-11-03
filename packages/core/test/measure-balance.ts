// Messung (kein Test): Balancing über eine lange Spielzeit mit einem einfachen Spieler-Bot.
// Der Bot disponiert wie ein guter Disponent (KI-Disposition, ohne Gehalt) und wächst vorsichtig:
// gebrauchter LKW + Fahrer + Auflieger, sobald genug Puffer da ist; Standort ausbauen, wenn die Stellplätze voll sind.
// Aufruf: node packages/core/test/measure-balance.ts [Tage] [Schwierigkeit] [Seed]

import {
  LOCATION_DEFS, LOCATION_ORDER, MIN_PER_DAY, TRUCK_BY_ID, applyCommand, capacity, createNewGame, tickMinutes,
  type DifficultyId, type GameState, type StaffMember,
} from '../src/index.ts';
import { ctx } from './helpers.ts';

const DAYS = Number(process.argv[2] ?? 365);
const DIFF = (process.argv[3] ?? 'normal') as DifficultyId;
const SEED = Number(process.argv[4] ?? 11);
const s: GameState = createNewGame(ctx, { seed: SEED, companyName: 'Bot Logistik', hqCityId: 'leipzig', difficulty: DIFF, founder: { id: 'p1', name: 'Bot' } });
s.paused = false;
if (process.env.NOCOMP) for (const c of Object.values(s.competitors)) { c.status = 'bankrupt'; c.trucks = 0; }
const eur = (c: number) => `${Math.round(c / 100).toLocaleString('de-DE')} €`;

/** virtuelle Disponenten ohne Gehalt: ersetzen den Spieler, der selbst disponiert */
function ensureDispatchers() {
  const need = Math.ceil(Object.keys(s.vehicles).length / 8);
  const bots = s.company.staff.filter((m) => m.id.startsWith('bot'));
  for (let i = bots.length; i < need; i++)
    s.company.staff.push({ id: `bot${i}`, name: `Bot ${i}`, dept: 'dispatch', salary: 0, hired: s.time, locationId: s.company.locations[0].id, skill: 80 } as StaffMember);
}
ensureDispatchers();
const ad = applyCommand(s, ctx, 'p1', { type: 'setAutoDispatch', mode: 'auto', rules: { safeDeadlines: true, chains: true } });
if (!ad.ok) throw new Error(ad.error);

/** Pflege wie ein umsichtiger Spieler: Wartung unter 50 % Zustand, Urlaub alle drei Monate */
function care() {
  for (const v of Object.values(s.vehicles))
    if (v.status === 'idle' && v.condition < 50) applyCommand(s, ctx, 'p1', { type: 'serviceVehicle', vehicleId: v.id });
  for (const d of Object.values(s.drivers))
    if (d.status === 'idle' && (d.vacationLeft ?? 0) >= 7 && s.time - (d.lastVacation ?? d.hired) > 90 * MIN_PER_DAY) applyCommand(s, ctx, 'p1', { type: 'sendVacation', driverId: d.id, days: 7 });
}

const BUFFER = 18_000_00;
const LEASE = !process.env.NOLEASE;
let lastLease = -Infinity;
function grow() {
  const bal = s.company.account.balance;
  const cap = capacity(s);
  const hq = s.company.locations[0];
  if (cap.vehicles >= cap.parking || cap.trailers >= cap.trailerParking) {
    const next = LOCATION_ORDER[LOCATION_ORDER.indexOf(hq.kind) + 1];
    if (next && bal > LOCATION_DEFS[next].deposit + BUFFER * 1.5) {
      const r = applyCommand(s, ctx, 'p1', { type: 'upgradeLocation', locationId: hq.id, kind: next });
      if (r.ok) console.log(`  Tag ${day()}: Standort → ${next}`);
    }
    return;
  }
  const idleDrivers = Object.values(s.drivers).filter((d) => d.status === 'idle').length;
  const offers = Object.values(s.vehicleOffers)
    .filter((o) => !TRUCK_BY_ID[o.modelId].body && o.condition >= 55)
    .sort((a, b) => a.price - b.price);
  const off = offers[0];
  const app = Object.values(s.applicants).sort((a, b) => a.salary - b.salary)[0];
  if (!app && idleDrivers === 0) return;
  if (off && bal >= off.price + BUFFER) {
    if (!applyCommand(s, ctx, 'p1', { type: 'buyUsedVehicle', offerId: off.id }).ok) return;
  } else if (LEASE && bal >= 10_000_00 && s.time - lastLease > 30 * MIN_PER_DAY) {
    // Leasing: kein Kapital nötig, aber 1.500 € Rate im Monat
    if (!applyCommand(s, ctx, 'p1', { type: 'buyNewVehicle', modelId: 'trasko-m380', financing: 'lease' }).ok) return;
    lastLease = s.time;
    console.log(`  Tag ${day()}: +1 LKW geleast`);
  } else return;
  if (app) applyCommand(s, ctx, 'p1', { type: 'hireDriver', applicantId: app.id });
  applyCommand(s, ctx, 'p1', { type: 'buyTrailer', trailerType: 'curtain', financing: 'lease' });
  console.log(`  Tag ${day()}: jetzt ${Object.keys(s.vehicles).length} LKW`);
}
const day = () => Math.floor(s.time / MIN_PER_DAY);

let lastBal = s.company.account.balance;
let minBal = lastBal;
let lastTotals = { ...s.company.totals };
console.log(`${DIFF}, Seed ${SEED}: Start ${eur(lastBal)}, ${Object.keys(s.vehicles).length} LKW, ${Object.keys(s.drivers).length} Fahrer`);
for (let d = 1; d <= DAYS; d++) {
  ensureDispatchers();
  for (let h = 0; h < 24; h++) {
    tickMinutes(s, ctx, 60);
    care();
  }
  minBal = Math.min(minBal, s.company.account.balance);
  grow();
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
