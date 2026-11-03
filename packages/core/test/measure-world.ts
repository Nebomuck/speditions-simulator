// Messung (kein Test): Wirtschaft, Konkurrenz, Wetter und Ereignisse über eine längere Spielzeit.
// Aufruf: node packages/core/test/measure-world.ts [Tage]

import { WEATHER, activeCompetitors, tickMinutes, type WeatherKind } from '../src/index.ts';
import { ctx, newGame } from './helpers.ts';

const DAYS = Number(process.argv[2] ?? 120);
const s = newGame(7);
s.difficulty.eventFactor = 1;
const weather: Record<string, Record<WeatherKind, number>> = {};
const offered: number[] = [];
for (let d = 0; d < DAYS; d++) {
  for (let h = 0; h < 24; h++) {
    tickMinutes(s, ctx, 60);
    for (const c of ['DE', 'NO', 'IT', 'ES']) {
      const k = s.weather[c].kind;
      (weather[c] ??= { clear: 0, rain: 0, fog: 0, snow: 0, ice: 0, storm: 0, heat: 0 })[k]++;
    }
  }
  offered.push(Object.values(s.orders).filter((o) => o.status === 'offered').length);
}
console.log(`${DAYS} Tage · Konjunktur ${s.economy.phase} (${s.economy.cycle.toFixed(3)}), Nachfrage ${s.market.demand.toFixed(2)}, Diesel ${s.market.diesel}`);
console.log(`Börse: Ø ${Math.round(offered.reduce((a, b) => a + b, 0) / offered.length)} offene Angebote`);
const taken = Object.values(s.orders).filter((o) => o.takenBy).length;
console.log(`von Konkurrenz übernommen (noch in der Historie): ${taken}`);
for (const c of Object.values(s.competitors))
  console.log(`  ${c.name.padEnd(28)} ${c.status.padEnd(9)} ${String(c.trucks).padStart(3)} LKW  ${c.cityIds.length} Standorte  Kasse ${Math.round(c.cash / 100).toLocaleString('de-DE').padStart(10)} €  Monat ${c.lastMonth.orders} Aufträge, Gewinn ${Math.round((c.lastMonth.revenue - c.lastMonth.costs) / 100).toLocaleString('de-DE')} €`);
console.log(`aktive Konkurrenten: ${activeCompetitors(s).length}`);
for (const [c, w] of Object.entries(weather)) {
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  console.log(`Wetter ${c}: ${Object.entries(w).filter(([, n]) => n).map(([k, n]) => `${WEATHER[k as WeatherKind].name} ${Math.round((n / total) * 100)} %`).join(', ')}`);
}
const byRule: Record<string, number> = {};
for (const e of s.events.history) byRule[e.rule] = (byRule[e.rule] ?? 0) + 1;
console.log(`Ereignisse (letzte ${s.events.history.length}):`, byRule);
const lost = Object.values(s.customers).filter((c) => c.lostTo).length;
console.log(`abgeworbene Kunden: ${lost}`);
