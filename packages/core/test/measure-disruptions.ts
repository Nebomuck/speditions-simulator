// Messung (kein Test): Wie oft trifft ein LKW im Dauereinsatz auf Staus und Sperrungen?
// Aufruf: node packages/core/test/measure-disruptions.ts [Tage] [LKW]

import { applyCommand, disruptionOnEdge, tickMinute } from '../src/index.ts';
import { addOrder, ctx, first, newGame } from './helpers.ts';

const DAYS = Number(process.argv[2] ?? 15);
const TRUCKS = Number(process.argv[3] ?? 1);
const DESTS = ['muenchen', 'hamburg', 'wien', 'prag', 'frankfurt', 'berlin', 'nuernberg', 'dresden', 'hannover', 'koeln'];

const s = newGame(11);
// zusätzliche LKW mit Fahrer und Auflieger am Firmensitz
const v0 = first(s.vehicles), d0 = first(s.drivers), t0 = first(s.trailers);
for (let i = 1; i < TRUCKS; i++) {
  s.vehicles[`veh-m${i}`] = { ...structuredClone(v0), id: `veh-m${i}` };
  s.drivers[`drv-m${i}`] = { ...structuredClone(d0), id: `drv-m${i}` };
  s.trailers[`trl-m${i}`] = { ...structuredClone(t0), id: `trl-m${i}` };
}
s.difficulty.eventFactor = 1;
const pairs = Object.keys(s.vehicles).map((id, i) => ({ v: id, d: Object.keys(s.drivers)[i], t: Object.keys(s.trailers)[i] }));

let n = 0;
const jams = new Set<string>();
let jamMin = 0;
let blockedMin = 0;
let drivingMin = 0;
let reroutes = 0;
let active = 0;
let km = 0;
for (let m = 0; m < DAYS * 1440; m++) {
  for (const p of pairs) {
    const v = s.vehicles[p.v];
    if (v.status === 'idle' && s.drivers[p.d].status === 'idle') {
      const to = DESTS[n++ % DESTS.length];
      if (to === v.cityId) continue;
      const o = addOrder(s, v.cityId, to, { pickupStart: s.time, pickupEnd: s.time + 600, deliveryEnd: s.time + 4 * 1440 });
      applyCommand(s, ctx, 'p1', { type: 'dispatch', orderId: o.id, driverId: p.d, vehicleId: p.v, trailerId: p.t });
    }
  }
  const odo = pairs.reduce((a, p) => a + s.vehicles[p.v].odometerKm, 0);
  tickMinute(s, ctx);
  km += pairs.reduce((a, p) => a + s.vehicles[p.v].odometerKm, 0) - odo;
  active += s.disruptions.length;
  for (const t of Object.values(s.trips)) {
    if (t.phase === 'done') continue;
    if (t.activity === 'blocked') blockedMin++;
    if (t.activity !== 'driving') continue;
    drivingMin++;
    const leg = t.legs[t.legIndex];
    const loc = ctx.net.locate(leg.nodes, t.progressKm);
    const dis = loc && disruptionOnEdge(s, loc.edge);
    if (dis?.kind === 'jam') {
      jams.add(t.id + dis.id);
      jamMin += 1 - dis.speedFactor; // Zeitverlust-Anteil dieser Minute
    }
  }
}
for (const t of Object.values(s.trips)) reroutes += t.log.filter((l) => l.text.startsWith('Umleitung')).length;
const perK = (x: number) => ((x / km) * 1000).toFixed(2);
console.log(`${DAYS} Tage, ${TRUCKS} LKW, ${Math.round(km)} km gefahren`);
console.log(`Staus durchfahren: ${jams.size} (${perK(jams.size)} je 1000 km), Zeitverlust ca. ${Math.round(jamMin / 60)} h`);
console.log(`Umleitungen wegen Sperrung: ${reroutes} (${perK(reroutes)} je 1000 km), Warten an Sperrungen: ${Math.round(blockedMin / 60)} h`);
console.log(`Fahrzeit: ${Math.round(drivingMin / 60)} h, Anteil Stauverlust: ${((jamMin / drivingMin) * 100).toFixed(1)} %`);
console.log(`Ø gleichzeitig aktive Störungen: ${(active / (DAYS * 1440)).toFixed(1)}`);
