import { describe, expect, it } from 'vitest';
import {
  applyCommand, bottlenecks, contractThroughput, crossDockPlan, dailyStorage, deserializeSave, hourlyStorage, monthlyFixedCosts, monthlyStorage, occupiedSlots,
  onStorageDelivery, serializeSave, stageOf, throughput, BASE_THROUGHPUT, CROSSDOCK_FEE, MIN_PER_DAY, WORKER_THROUGHPUT, STATE_VERSION,
  type GameState, type StorageContract,
} from '../src/index.ts';
import { addOrder, ctx, newGame } from './helpers.ts';

/** Spiel mit Lagerhalle am Firmensitz (Leipzig) */
function withWarehouse(seed = 7) {
  const s = newGame(seed);
  s.company.account.balance = 900_000_00;
  s.company.level = 3;
  const hq = s.company.locations[0];
  expect(applyCommand(s, ctx, 'p1', { type: 'upgradeLocation', locationId: hq.id, kind: 'office_yard' }).ok).toBe(true);
  expect(applyCommand(s, ctx, 'p1', { type: 'buildFacility', locationId: hq.id, facility: 'warehouse' }).ok).toBe(true);
  return { s, hq };
}

/** Tage vorspulen: nur die Lagerschritte (schnell, ohne volle Simulation) */
function days(s: GameState, n: number) {
  for (let d = 0; d < n; d++) {
    s.time += MIN_PER_DAY;
    dailyStorage(s, ctx);
  }
}

function offer(s: GameState): StorageContract {
  for (let i = 0; i < 60; i++) {
    const o = Object.values(s.storageContracts ?? {}).find((c) => c.status === 'offered');
    if (o) return o;
    days(s, 1);
  }
  throw new Error('kein Angebot');
}

describe('Lager & Kontraktlogistik (Paket E, Schritt E2)', () => {
  it('Lagervertrag: Angebot, Annahme, Lagergeld und Belegung', () => {
    const { s, hq } = withWarehouse();
    const c = offer(s);
    expect(c.pallets).toBeGreaterThanOrEqual(100);
    expect(c.pallets).toBeLessThanOrEqual(800);
    expect(c.locationId).toBe(hq.id);
    const n = s.ledger.length;
    expect(applyCommand(s, ctx, 'p1', { type: 'acceptStorageContract', contractId: c.id }).ok).toBe(true);
    expect(c.status).toBe('active');
    expect(c.stock).toBe(Math.round(c.pallets * 0.5));
    // Lagergeld für den angebrochenen Monat
    expect(s.ledger.slice(n).some((e) => e.category === 'storage' && e.amount > 0)).toBe(true);
    expect(occupiedSlots(s, hq.id)).toBe(c.pallets);
    s.time = c.start!;
    const bal = s.company.account.balance;
    monthlyStorage(s);
    expect(s.company.account.balance - bal).toBe(Math.round(c.pallets * c.ratePerPallet));
  });

  it('Warenfluss: Einlagerungen als Komplettladungen, Auslagerungen als Teilladungen, nur für die eigene Firma', () => {
    const { s, hq } = withWarehouse(11);
    const c = offer(s);
    applyCommand(s, ctx, 'p1', { type: 'acceptStorageContract', contractId: c.id });
    // drei Wochen; Einlagerungen werden pünktlich zugestellt (wie von einer eigenen Fahrt)
    const delivered = new Set<string>();
    for (let d = 0; d < 21; d++) {
      days(s, 1);
      for (const o of Object.values(s.orders))
        if (o.storage?.flow === 'in' && o.pickupStart < s.time && !delivered.has(o.id)) {
          delivered.add(o.id);
          onStorageDelivery(s, o, 0);
        }
    }
    expect(c.status).toBe('active');
    const orders = Object.values(s.orders).filter((o) => o.storage?.contractId === c.id);
    const inb = orders.filter((o) => o.storage!.flow === 'in');
    const out = orders.filter((o) => o.storage!.flow === 'out');
    expect(inb.length).toBeGreaterThan(0);
    expect(out.length).toBeGreaterThan(inb.length);
    for (const o of orders) {
      expect(o.status).toBe('accepted');
      expect(o.customerId).toBe(c.customerId);
    }
    for (const o of inb) {
      expect(o.fromCityId).toBe(c.fromCityId);
      expect(o.toCityId).toBe(hq.cityId);
      expect(o.storage!.pallets).toBeGreaterThanOrEqual(10);
    }
    for (const o of out) {
      expect(o.fromCityId).toBe(hq.cityId);
      expect(o.partial).toBe(true);
      expect(o.distanceKm).toBeLessThanOrEqual(320);
    }
    // erwarteter Umschlag ungefähr eingehalten (drei Wochen ≈ 15 Werktage)
    const expectedOut = (c.pallets * c.turnover * 15) / 12 / 21.7;
    expect(out.length).toBeGreaterThanOrEqual(Math.floor(expectedOut * 0.5));
    expect(out.length).toBeLessThanOrEqual(Math.ceil(expectedOut) + 1);
    // Auslagerungen verringern den Bestand, Einlagerung erhöht ihn
    const before = c.stock;
    const n = s.ledger.length;
    inb[0].status = 'delivered';
    onStorageDelivery(s, inb[0], 0);
    expect(c.stock).toBe(Math.min(c.pallets, before + inb[0].storage!.pallets));
    expect(s.ledger.slice(n).find((e) => e.category === 'storage')!.amount).toBe(inb[0].storage!.pallets * c.handlingFee);
  });

  it('nicht gefahrene Lagertouren kosten Strafe und Zufriedenheit, zu viele Pannen kosten den Vertrag', () => {
    const { s } = withWarehouse(13);
    const c = offer(s);
    c.pallets = 600;
    applyCommand(s, ctx, 'p1', { type: 'acceptStorageContract', contractId: c.id });
    days(s, 4);
    const o = Object.values(s.orders).find((x) => x.storage?.contractId === c.id)!;
    expect(o).toBeDefined();
    const cust = s.customers[c.customerId];
    const sat = cust.satisfaction;
    s.time = o.pickupEnd + 6 * 60 + 1;
    const bal = s.company.account.balance;
    hourlyStorage(s, ctx);
    expect(o.status).toBe('cancelled');
    expect(c.stats.missed).toBeGreaterThanOrEqual(1);
    expect(s.company.account.balance).toBeLessThan(bal);
    expect(cust.satisfaction).toBeLessThan(sat);
    // Kunde verärgert, mehrere Pannen: Kündigung durch den Kunden
    cust.satisfaction = 10;
    c.stats.missed = 5;
    days(s, 1);
    expect(c.status).toBe('lost');
    expect(Object.values(s.orders).filter((x) => x.storage?.contractId === c.id && x.status === 'accepted')).toHaveLength(0);
  });

  it('Touren, die niemand fährt, gehen rechtzeitig an Subunternehmer (abschaltbar)', () => {
    const { s } = withWarehouse(37);
    const c = offer(s);
    c.pallets = 600;
    applyCommand(s, ctx, 'p1', { type: 'acceptStorageContract', contractId: c.id });
    expect(c.autoSubcontract).toBe(true);
    days(s, 4);
    const [a, b] = Object.values(s.orders).filter((x) => x.storage?.contractId === c.id && x.status === 'accepted');
    expect(b).toBeDefined();
    // abgeschaltet: Tour bleibt liegen
    expect(applyCommand(s, ctx, 'p1', { type: 'setStorageAutoSubcontract', contractId: c.id, on: false }).ok).toBe(true);
    s.time = a.pickupEnd - 2 * 60;
    hourlyStorage(s, ctx);
    expect(a.status).toBe('accepted');
    // eingeschaltet: Subunternehmer übernimmt, keine Strafe
    applyCommand(s, ctx, 'p1', { type: 'setStorageAutoSubcontract', contractId: c.id, on: true });
    hourlyStorage(s, ctx);
    expect(a.status).toBe('in_transit');
    expect(a.subcontract).toBeDefined();
    expect(c.stats.subcontracted).toBeGreaterThanOrEqual(1);
    expect(c.stats.missed).toBe(0);
  });

  it('Lagerpersonal: Durchsatz, Überlastung verschiebt Auslagerungen, Lohn in den Fixkosten', () => {
    const { s, hq } = withWarehouse(17);
    expect(throughput(hq)).toBe(BASE_THROUGHPUT);
    expect(applyCommand(s, ctx, 'p1', { type: 'setWarehouseStaff', locationId: hq.id, workers: 3, lead: false }).ok).toBe(true);
    expect(throughput(hq)).toBe(BASE_THROUGHPUT + 3 * WORKER_THROUGHPUT);
    expect(applyCommand(s, ctx, 'p1', { type: 'setWarehouseStaff', locationId: hq.id, workers: 3, lead: true }).ok).toBe(true);
    expect(throughput(hq)).toBe(Math.round((BASE_THROUGHPUT + 3 * WORKER_THROUGHPUT) * 1.2));
    expect(applyCommand(s, ctx, 'p1', { type: 'setWarehouseStaff', locationId: hq.id, workers: 9, lead: true }).ok).toBe(false);
    expect(monthlyFixedCosts(s).some((i) => i.label.startsWith('Lagerpersonal'))).toBe(true);
    expect(monthlyFixedCosts(s).some((i) => i.label.startsWith('Lagerleitung'))).toBe(true);
    // Überlastung: großer Vertrag ohne Personal
    applyCommand(s, ctx, 'p1', { type: 'setWarehouseStaff', locationId: hq.id, workers: 0, lead: false });
    const c = offer(s);
    c.pallets = 1500;
    c.turnover = 1.2;
    applyCommand(s, ctx, 'p1', { type: 'acceptStorageContract', contractId: c.id });
    expect(contractThroughput(c)).toBeGreaterThan(throughput(hq) * 1.3);
    days(s, 7);
    expect(hq.warehouse!.demand).toBeGreaterThan(throughput(hq));
    expect(s.log.some((l) => l.text.includes('überlastet'))).toBe(true);
    expect(bottlenecks(s).some((b) => b.id === `warehouse-${hq.id}`)).toBe(true);
  });

  it('Hallenausbau: 5.000 Plätze ab Stufe 4, 10.000 ab Stufe 5, höhere Betriebskosten', () => {
    const { s, hq } = withWarehouse(19);
    expect(applyCommand(s, ctx, 'p1', { type: 'upgradeWarehouse', locationId: hq.id }).ok).toBe(false);
    s.company.level = 4;
    // Stufe bleibt nur erhalten, wenn die Anforderungen erfüllt sind; für den Test direkt ausbauen
    expect(applyCommand(s, ctx, 'p1', { type: 'upgradeWarehouse', locationId: hq.id }).ok).toBe(true);
    expect(stageOf(hq).slots).toBe(5000);
    expect(monthlyFixedCosts(s).find((i) => i.label.startsWith('Betrieb Logistikzentrum'))!.amount).toBe(stageOf(hq).monthly);
    expect(applyCommand(s, ctx, 'p1', { type: 'upgradeWarehouse', locationId: hq.id }).ok).toBe(false);
    s.company.level = 5;
    expect(applyCommand(s, ctx, 'p1', { type: 'upgradeWarehouse', locationId: hq.id }).ok).toBe(true);
    expect(stageOf(hq).slots).toBe(10000);
  });

  it('Umschlag über das Lager: Vorlauf ins Lager, Weiterlauf als Teilladung ab Lager, Umschlaggebühr', () => {
    const { s, hq } = withWarehouse(23);
    // Teilladung Hamburg → Dresden (Dresden liegt nahe am Lager Leipzig)
    const o = addOrder(s, 'hamburg', 'dresden', { status: 'accepted', partial: true, weightT: 3, pickupStart: s.time + 120, pickupEnd: s.time + 8 * 60, deliveryEnd: s.time + 2 * MIN_PER_DAY });
    const direct = { payment: o.payment, deliveryEnd: o.deliveryEnd };
    const { plan } = crossDockPlan(s, ctx, o.id);
    expect(plan).not.toBeNull();
    expect(plan!.viaCityId).toBe(hq.cityId);
    expect(plan!.pay1 + plan!.pay2).toBe(direct.payment);
    expect(applyCommand(s, ctx, 'p1', { type: 'crossDock', orderId: o.id }).ok).toBe(true);
    expect(o.toCityId).toBe(hq.cityId);
    expect(o.storage?.flow).toBe('xin');
    // Vollladungen lassen sich nicht umschlagen
    const full = addOrder(s, 'hamburg', 'dresden', { status: 'accepted' });
    expect(crossDockPlan(s, ctx, full.id).plan).toBeNull();
    // Vorlauf zugestellt → Umschlaggebühr, nach 2 Stunden Weiterlauf ab Lager
    const n = s.ledger.length;
    o.status = 'delivered';
    o.deliveredAt = s.time;
    onStorageDelivery(s, o, 0);
    expect(s.ledger.slice(n).find((e) => e.category === 'storage')!.amount).toBe(plan!.pallets * CROSSDOCK_FEE);
    s.time += 120;
    hourlyStorage(s, ctx);
    const next = s.orders[o.storage!.nextId!];
    expect(next).toBeDefined();
    expect(next.fromCityId).toBe(hq.cityId);
    expect(next.toCityId).toBe('dresden');
    expect(next.payment).toBe(plan!.pay2);
    expect(next.deliveryEnd).toBeGreaterThanOrEqual(direct.deliveryEnd);
    expect(next.status).toBe('accepted');
    expect(next.partial).toBe(true);
  });

  it('Bestandshalle aus 0.21.0: Startvertrag in Höhe der alten Auslastung, Spielstand-Version 14', () => {
    const { s, hq } = withWarehouse(29);
    // Zustand wie vor 0.22.0: pauschale Auslastung, kein Lagerzustand, Spielstand-Version 13
    delete hq.warehouse;
    hq.warehouseUtil = 0.42;
    delete s.storageContracts;
    // Die Prüfsumme gilt nur für den Zustand, die Version steht im Kopf
    const save = serializeSave(s, 'alt').replace(`"version":${STATE_VERSION},`, '"version":13,');
    expect(save).toContain('"version":13,');
    const loaded = deserializeSave(save);
    expect(loaded.version).toBe(14);
    expect(loaded.storageContracts).toEqual({});
    dailyStorage(loaded, ctx);
    const lhq = loaded.company.locations[0];
    const starter = Object.values(loaded.storageContracts!).find((c) => c.starter);
    expect(starter).toBeDefined();
    expect(starter!.status).toBe('active');
    expect(starter!.pallets).toBe(850);
    expect(starter!.turnover).toBe(0.5);
    expect(lhq.warehouse?.slots).toBe(2000);
    expect(lhq.warehouseUtil).toBeUndefined();
  });

  it('ohne Lagerhalle bleibt alles beim Alten', () => {
    const s = newGame(31);
    const before = JSON.stringify(s);
    dailyStorage(s, ctx);
    hourlyStorage(s, ctx);
    expect(JSON.stringify(s)).toBe(before);
  });
});
