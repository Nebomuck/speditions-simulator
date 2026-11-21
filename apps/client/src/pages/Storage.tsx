// Lager & Kontraktlogistik (Paket E, Schritt E2): Hallen, Lagerpersonal, Lagerverträge und Warenfluss.

import { ArrowDownToLine, ArrowUpFromLine, ArrowUpCircle, Repeat, Users, Warehouse } from 'lucide-react';
import {
  CARGO_BY_ID, MIN_PER_DAY, contractMonthly, formatDate, maxWorkers, nextStage, occupiedSlots, stageOf, stockAt, storageContracts, throughput, toursPerWeek, warehouses,
  workerSalary, type GameState, type Location, type StorageContract,
} from '@spedsim/core';
import { sendCommand, useGame } from '../game/store.ts';
import { Badge, Bar, Card, Empty, Money } from '../ui/components.tsx';
import { cityName } from '../ui/format.ts';
import { askConfirm } from '../ui/confirm.tsx';

const STATUS: Record<StorageContract['status'], string> = { offered: 'Angebot', active: 'läuft', completed: 'erfüllt', cancelled: 'gekündigt', expired: 'abgelaufen', lost: 'vom Kunden gekündigt' };

export function StoragePanel() {
  const s = useGame();
  const halls = warehouses(s);
  const all = storageContracts(s);
  const offers = all.filter((c) => c.status === 'offered' && c.offerExpires > s.time);
  const done = all.filter((c) => c.status !== 'offered' && c.status !== 'active' && c.status !== 'expired').sort((a, b) => (b.end ?? 0) - (a.end ?? 0)).slice(0, 5);
  if (!halls.length)
    return (
      <Card title={<><Warehouse size={16} /> Lager & Kontraktlogistik</>}>
        <Empty>Noch keine Lagerhalle. Ab Unternehmensstufe 3 lässt sich an einem Standort mit Betriebshof eine Lagerhalle bauen (Reiter „Standorte“). Dann bieten Kunden Lagerverträge an.</Empty>
      </Card>
    );
  return (
    <>
      <FlowCard />
      <div className="grid grid-2 mt">
        {halls.map((l) => <HallCard key={l.id} l={l} />)}
      </div>
      <Card title="Angebote für Lagerverträge" sub="Kunden suchen Palettenplätze. Jeder Vertrag bringt Lagergeld, Umschlaggebühren und eigene Ein- und Auslagerungstouren." className="mt">
        {!offers.length ? <Empty>Gerade kein Angebot. Neue kommen alle paar Tage, mit Vertriebsmitarbeitern öfter und größer.</Empty> : (
          <div className="list">{offers.map((c) => <ContractRow key={c.id} c={c} />)}</div>
        )}
      </Card>
      {done.length > 0 && (
        <Card title="Beendete Lagerverträge" className="mt">
          <div className="list">{done.map((c) => <ContractRow key={c.id} c={c} />)}</div>
        </Card>
      )}
    </>
  );
}

/** Warenfluss der letzten 7 Tage und Lagererlöse der letzten 30 Tage */
function FlowCard() {
  const s = useGame();
  const since = s.time - 7 * MIN_PER_DAY;
  const flows = { in: { done: 0, open: 0, pallets: 0 }, out: { done: 0, open: 0, pallets: 0 }, xin: { done: 0, open: 0, pallets: 0 }, xout: { done: 0, open: 0, pallets: 0 } };
  for (const o of Object.values(s.orders)) {
    if (!o.storage || o.created < since) continue;
    const f = flows[o.storage.flow];
    if (o.status === 'delivered') {
      f.done++;
      f.pallets += o.storage.pallets;
    } else if (o.status !== 'cancelled') f.open++;
  }
  const revenue = s.ledger.filter((e) => e.category === 'storage' && e.t >= s.time - 30 * MIN_PER_DAY).reduce((a, e) => a + e.amount, 0);
  const active = storageContracts(s).filter((c) => c.status === 'active');
  const sub = active.reduce((a, c) => a + (c.stats.subcontracted ?? 0), 0);
  const items = [
    { label: 'Einlagerungen', icon: ArrowDownToLine, f: flows.in },
    { label: 'Auslagerungen', icon: ArrowUpFromLine, f: flows.out },
    { label: 'Umschlag (Vor- und Weiterlauf)', icon: Repeat, f: { done: flows.xin.done + flows.xout.done, open: flows.xin.open + flows.xout.open, pallets: flows.xin.pallets } },
  ];
  return (
    <div className="grid grid-4">
      {items.map((x) => (
        <div key={x.label} className="card stat">
          <div className="label"><x.icon size={15} />{x.label} (7 Tage)</div>
          <div className="value">{x.f.done}</div>
          <div className="hint">{x.f.pallets.toLocaleString('de-DE')} Paletten · {x.f.open} offen</div>
        </div>
      ))}
      <div className="card stat">
        <div className="label"><Warehouse size={15} />Lagererlöse (30 Tage)</div>
        <div className="value"><Money value={revenue} /></div>
        <div className="hint">{active.length} laufende Verträge{sub ? ` · ${sub} Touren an Subunternehmer` : ''}</div>
      </div>
    </div>
  );
}

function HallCard({ l }: { l: Location }) {
  const s = useGame();
  const stage = stageOf(l);
  const next = nextStage(l);
  const w = l.warehouse ?? { slots: stage.slots, workers: 0, lead: false, handled: 0, demand: 0 };
  const occ = occupiedSlots(s, l.id);
  const stock = stockAt(s, l.id);
  const cap = throughput(l);
  const contracts = storageContracts(s).filter((c) => c.locationId === l.id && c.status === 'active');
  const setStaff = (workers: number, lead: boolean) => sendCommand({ type: 'setWarehouseStaff', locationId: l.id, workers, lead });
  const level = s.company.level ?? 1;
  return (
    <Card title={<><Warehouse size={16} /> {stage.name} {cityName(l.cityId)}</>} sub={`${stage.slots.toLocaleString('de-DE')} Palettenplätze · Betrieb ${(stage.monthly / 100).toLocaleString('de-DE')} €/Monat`}>
      <dl className="kv">
        <dt>Belegt (Verträge)</dt>
        <dd><div className="row" style={{ gap: 8 }}><Bar value={(occ / stage.slots) * 100} /> {occ.toLocaleString('de-DE')} / {stage.slots.toLocaleString('de-DE')}</div></dd>
        <dt>Bestand im Lager</dt><dd>{stock.toLocaleString('de-DE')} Paletten</dd>
        <dt>Umschlag je Werktag</dt>
        <dd>
          <span className={w.demand > cap ? 'neg' : ''}>{w.demand} Paletten</span> bei {cap} Leistung {w.demand > cap && <Badge kind={w.demand > cap * 1.3 ? 'danger' : 'warning'}>überlastet</Badge>}
        </dd>
        <dt>Heute umgeschlagen</dt><dd>{w.handled} Paletten</dd>
      </dl>
      <div className="card-title mt"><Users size={14} style={{ verticalAlign: -2 }} /> Lagerpersonal</div>
      <div className="row wrap" style={{ gap: 8 }}>
        <button className="btn small" disabled={w.workers <= 0} onClick={() => setStaff(w.workers - 1, w.lead)}>−</button>
        <b>{w.workers} Lagerarbeiter</b>
        <button className="btn small" disabled={w.workers >= maxWorkers(l)} onClick={() => setStaff(w.workers + 1, w.lead)}>+</button>
        <span className="dim small">je <Money value={workerSalary(l)} />/Monat, +45 Paletten am Tag (höchstens {maxWorkers(l)})</span>
      </div>
      <label className="row mt" style={{ gap: 8, fontSize: 13 }}>
        <input type="checkbox" checked={w.lead} onChange={(e) => setStaff(w.workers, e.target.checked)} />
        Lagerleitung (<Money value={workerSalary(l, true)} />/Monat): +20 % Durchsatz, halb so viele Fehlmengen
      </label>
      <p className="dim small" style={{ marginBottom: 0 }}>Die Grundbesetzung der Halle schafft 40 Paletten am Tag. Wird mehr umgeschlagen, starten Auslagerungen später, und es drohen Fehlmengen.</p>
      {next && (
        <div className="pick mt" style={{ cursor: 'default' }}>
          <ArrowUpCircle size={18} />
          <div style={{ flex: 1 }}>
            <b>Ausbau: {next.name}</b>
            <div><small>{next.slots.toLocaleString('de-DE')} Palettenplätze · Betrieb <Money value={next.monthly} />/Monat · einmalig <Money value={next.cost} /></small></div>
          </div>
          <button
            className="btn small primary"
            disabled={level < next.minLevel}
            onClick={async () => (await askConfirm(`Lager ${cityName(l.cityId)} zum ${next.name} ausbauen? Einmalig ${(next.cost / 100).toLocaleString('de-DE')} €, Betrieb ${(next.monthly / 100).toLocaleString('de-DE')} €/Monat.`, { title: 'Lager ausbauen?', confirmLabel: 'Ausbauen' })) && sendCommand({ type: 'upgradeWarehouse', locationId: l.id })}
          >
            {level < next.minLevel ? `ab Stufe ${next.minLevel}` : 'Ausbauen'}
          </button>
        </div>
      )}
      <div className="card-title mt">Laufende Verträge ({contracts.length})</div>
      {!contracts.length ? <Empty>Noch keine Verträge in dieser Halle.</Empty> : <div className="list">{contracts.map((c) => <ContractRow key={c.id} c={c} />)}</div>}
    </Card>
  );
}

function ContractRow({ c }: { c: StorageContract }) {
  const s = useGame();
  const cust = s.customers[c.customerId];
  const tours = toursPerWeek(c);
  const hall = s.company.locations.find((l) => l.id === c.locationId);
  return (
    <div className="list-item" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
      <div style={{ flex: 1, minWidth: 220 }}>
        <b>{cust?.name ?? 'Kunde'}</b> <span className="dim">· {cityName(c.fromCityId)} → Lager {hall ? cityName(hall.cityId) : '–'}</span>
        <div className="dim small">
          {c.pallets} Palettenplätze · {CARGO_BY_ID[c.cargoId]?.name} · <Money value={c.ratePerPallet} cents /> je Platz und Monat · Umschlag <Money value={c.handlingFee} cents /> je Palette
        </div>
        <div className="dim small">
          ca. {tours.in.toLocaleString('de-DE')} Einlagerungen und {tours.out.toLocaleString('de-DE')} Auslagerungen je Woche · {c.months} Monate
          {c.status === 'active' && <> · bis {formatDate(c.end!)} · Bestand {c.stock} Paletten</>}
        </div>
        {c.status !== 'offered' && (
          <div className="dim small">
            {c.stats.delivered} zugestellt · {c.stats.late} verspätet · {c.stats.missed} nicht gefahren · {c.stats.shortages} Fehlmengen{c.stats.subcontracted ? ` · ${c.stats.subcontracted} an Subunternehmer` : ''}
          </div>
        )}
        {c.status === 'active' && (
          <label className="row small" style={{ gap: 6, marginTop: 4 }}>
            <input type="checkbox" checked={!!c.autoSubcontract} onChange={(e) => sendCommand({ type: 'setStorageAutoSubcontract', contractId: c.id, on: e.target.checked })} />
            Touren, die niemand fährt, 3 Stunden vor Ladeschluss an Subunternehmer geben
          </label>
        )}
      </div>
      <div style={{ textAlign: 'right' }}>
        <div><b><Money value={contractMonthly(c)} /></b><span className="dim small"> /Monat</span></div>
        {c.status === 'offered' ? (
          <div className="row" style={{ gap: 6, justifyContent: 'flex-end', marginTop: 4 }}>
            <span className="dim small">bis {formatDate(c.offerExpires)}</span>
            <button className="btn small primary" onClick={() => sendCommand({ type: 'acceptStorageContract', contractId: c.id })}>Annehmen</button>
          </div>
        ) : c.status === 'active' ? (
          <button
            className="btn small danger mt"
            onClick={async () => (await askConfirm(`Lagervertrag mit ${cust?.name ?? 'Kunde'} kündigen? Strafe zwei Monate Lagergeld (${Math.round((c.pallets * c.ratePerPallet * 2) / 100).toLocaleString('de-DE')} €).`, { title: 'Lagervertrag kündigen?', confirmLabel: 'Kündigen', danger: true })) && sendCommand({ type: 'cancelStorageContract', contractId: c.id })}
          >
            Kündigen
          </button>
        ) : (
          <Badge kind={c.status === 'completed' ? 'success' : 'warning'}>{STATUS[c.status]}</Badge>
        )}
      </div>
    </div>
  );
}

/** Kurzinfo für die Standortkarte */
export function hallSummary(s: GameState, l: Location): { occ: number; slots: number } {
  return { occ: occupiedSlots(s, l.id), slots: stageOf(l).slots };
}
