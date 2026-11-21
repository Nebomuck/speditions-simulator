// Auswertung (Paket E, Schritt E1): Nachkalkulation der Fahrten, Berichte nach Kunde, Fahrzeug, Fahrer und Strecke,
// Liquiditätsprognose, Engpass-Warnungen und CSV-Export.

import { useState } from 'react';
import { AlertTriangle, Download, Route, Truck, User, Users, Wallet, ListOrdered } from 'lucide-react';
import {
  bottlenecks, forecastLiquidity, ledgerCsv, recordsSince, report, reportCsv, reportTotals, tripsCsv, CITY_BY_ID, formatDateTime,
  type GameState, type ReportKind, type ReportRow,
} from '@spedsim/core';
import { navigate, useGame } from '../game/store.ts';
import { Badge, Card, Empty, LineChart, Money, PageHeader, Stat } from '../ui/components.tsx';
import { km } from '../ui/format.ts';

type Tab = ReportKind | 'trips' | 'liquidity';
const PERIODS = [30, 90, 365] as const;

/** CSV als Datei speichern (Browser-Download; die Desktop-App fragt nach dem Speicherort) */
export function downloadCsv(name: string, text: string) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

const slug = (s: GameState) => s.company.name.replace(/[^\wÄÖÜäöüß-]+/g, '_');
const pct = (v: number) => `${Math.round(v * 100)} %`;

export function AnalysisPage() {
  const s = useGame();
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30);
  const [tab, setTab] = useState<Tab>('customer');
  const total = reportTotals(s, days);
  const vehicles = Object.keys(s.vehicles).length;
  const util = vehicles ? total.hours / (vehicles * Math.min(days, Math.max(1, (s.time - s.company.founded) / 1440)) * 24) : 0;
  const tabs: { id: Tab; label: string; icon: typeof Users }[] = [
    { id: 'customer', label: 'Kunden', icon: Users },
    { id: 'vehicle', label: 'Fahrzeuge', icon: Truck },
    { id: 'driver', label: 'Fahrer', icon: User },
    { id: 'route', label: 'Strecken', icon: Route },
    { id: 'trips', label: 'Fahrten', icon: ListOrdered },
    { id: 'liquidity', label: 'Liquidität', icon: Wallet },
  ];
  return (
    <div className="page">
      <PageHeader
        title="Auswertung"
        subtitle="Nachkalkulation der Fahrten, Berichte und Liquiditätsprognose"
        actions={
          <div className="seg-mini">
            {PERIODS.map((p) => <button key={p} className={days === p ? 'active' : ''} onClick={() => setDays(p)}>{p} Tage</button>)}
          </div>
        }
      />
      <Warnings />
      <div className="grid grid-4">
        <Stat label="Erlös aus Fahrten" value={<Money value={total.revenue} />} hint={`${Math.round(total.trips)} Fahrten · ${total.deliveries} Lieferungen`} />
        <Stat label="Fahrtkosten" value={<Money value={total.costs} />} hint="Kraftstoff, Maut, Bahn, Lohnanteil, Fahrzeug" />
        <Stat
          label="Deckungsbeitrag"
          value={<Money value={total.profit} colored />}
          hint={total.plannedTrips ? <>geplant <Money value={total.planned} /> ({total.plannedTrips} Fahrten)</> : 'vor Fixkosten wie Miete und Büro'}
        />
        <Stat label="Auslastung der Flotte" value={pct(Math.min(1, util))} hint={`Leerfahrtanteil ${total.kmLoaded + total.kmEmpty ? pct(total.kmEmpty / (total.kmLoaded + total.kmEmpty)) : '–'}`} />
      </div>
      <div className="tabs mt">
        {tabs.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}><t.icon size={15} />{t.label}</button>
        ))}
      </div>
      {tab === 'trips' ? <Trips days={days} /> : tab === 'liquidity' ? <Liquidity /> : <Report kind={tab} days={days} />}
    </div>
  );
}

/** Engpass-Warnungen (auch im Dashboard) */
export function Warnings({ className = 'mb' }: { className?: string }) {
  const s = useGame();
  const list = bottlenecks(s);
  if (!list.length) return null;
  return (
    <Card title={<><AlertTriangle size={15} style={{ verticalAlign: -2, marginRight: 6 }} />Engpässe und Warnungen</>} className={className}>
      <div className="list">
        {list.map((b) => (
          <div key={b.id} className="list-item">
            <Badge kind={b.level === 'danger' ? 'danger' : b.level === 'warning' ? 'warning' : 'info'}>{b.level === 'danger' ? '!' : b.level === 'warning' ? '⚠' : 'i'}</Badge>
            <span style={{ flex: 1 }}>{b.text}</span>
            <button className="btn small" onClick={() => navigate(b.page)}>Ansehen</button>
          </div>
        ))}
      </div>
    </Card>
  );
}

const TITLE: Record<ReportKind, string> = { customer: 'Kunden', vehicle: 'Fahrzeuge', driver: 'Fahrer', route: 'Strecken' };

function Report({ kind, days }: { kind: ReportKind; days: number }) {
  const s = useGame();
  const rows = report(s, kind, days);
  const extraHead = kind === 'vehicle' ? ['Auslastung', 'Kosten/km'] : kind === 'customer' ? ['Zahlung nach'] : kind === 'route' ? ['DB/km'] : [];
  const extraCells = (r: ReportRow) =>
    kind === 'vehicle'
      ? [pct(r.extra?.utilization ?? 0), <Money key="c" value={r.extra?.costPerKm ?? 0} />]
      : kind === 'customer'
        ? [r.extra?.payDays !== undefined ? `${r.extra.payDays.toLocaleString('de-DE')} Tagen` : '–']
        : kind === 'route'
          ? [<Money key="p" value={r.extra?.profitPerKm ?? 0} colored />]
          : [];
  return (
    <Card
      title={`${TITLE[kind]} nach Deckungsbeitrag (${days} Tage)`}
      actions={<button className="btn small" disabled={!rows.length} onClick={() => downloadCsv(`${slug(s)}_${TITLE[kind].toLowerCase()}_${days}d.csv`, reportCsv(s, kind, days))}><Download size={13} />CSV</button>}
    >
      {!rows.length ? <Empty>Noch keine abgeschlossenen Fahrten in diesem Zeitraum.</Empty> : (
        <div className="table-wrap" style={{ border: 'none' }}>
          <table className="table">
            <thead>
              <tr>
                <th>{kind === 'customer' ? 'Kunde' : kind === 'vehicle' ? 'Fahrzeug' : kind === 'driver' ? 'Fahrer' : 'Strecke'}</th>
                <th className="num">Touren</th><th className="num">Pünktlich</th><th className="num">Erlös</th><th className="num">Kosten</th><th className="num">Deckungsbeitrag</th>
                <th className="num">km beladen / leer</th>
                {extraHead.map((h) => <th key={h} className="num">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td><b>{r.label}</b></td>
                  <td className="num">{r.trips.toLocaleString('de-DE')}</td>
                  <td className="num">{r.deliveries ? pct(1 - r.late / r.deliveries) : '–'}</td>
                  <td className="num"><Money value={r.revenue} /></td>
                  <td className="num"><Money value={r.costs} /></td>
                  <td className="num"><b><Money value={r.profit} colored /></b></td>
                  <td className="num">{km(r.kmLoaded)} / {km(r.kmEmpty)}</td>
                  {extraCells(r).map((c, i) => <td key={i} className="num">{c}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function Trips({ days }: { days: number }) {
  const s = useGame();
  const recs = [...recordsSince(s, days)].reverse();
  const shown = recs.slice(0, 200);
  return (
    <Card
      title={`Nachkalkulation der Fahrten (${recs.length})`}
      actions={
        <div className="row" style={{ gap: 6 }}>
          <button className="btn small" disabled={!recs.length} onClick={() => downloadCsv(`${slug(s)}_fahrten_${days}d.csv`, tripsCsv(s, days))}><Download size={13} />Fahrten CSV</button>
          <button className="btn small" onClick={() => downloadCsv(`${slug(s)}_buchungsjournal.csv`, ledgerCsv(s))}><Download size={13} />Buchungsjournal CSV</button>
        </div>
      }
    >
      {!recs.length ? <Empty>Noch keine abgeschlossenen Fahrten in diesem Zeitraum.</Empty> : (
        <div className="table-wrap" style={{ border: 'none' }}>
          <table className="table">
            <thead>
              <tr><th>Ende</th><th>Strecke</th><th>Fahrzeug / Fahrer</th><th className="num">Erlös</th><th className="num">Kraftstoff</th><th className="num">Maut + Bahn</th><th className="num">Lohn</th><th className="num">Fahrzeug</th><th className="num">DB</th><th className="num">geplant</th></tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td className="nowrap">{formatDateTime(r.t).slice(3)}</td>
                  <td><b>{CITY_BY_ID[r.fromCityId]?.name ?? r.fromCityId} → {CITY_BY_ID[r.toCityId]?.name ?? r.toCityId}</b><div className="dim small">{km(r.kmLoaded)} beladen · {km(r.kmEmpty)} leer{r.orders.some((o) => o.late) ? ' · verspätet' : ''}</div></td>
                  <td>{s.vehicles[r.vehicleId]?.plate ?? '–'}<div className="dim small">{s.drivers[r.driverId]?.name ?? 'ehemaliger Fahrer'}</div></td>
                  <td className="num"><Money value={r.revenue} /></td>
                  <td className="num"><Money value={r.fuel} /></td>
                  <td className="num"><Money value={r.toll + r.rail} /></td>
                  <td className="num"><Money value={r.driver} /></td>
                  <td className="num"><Money value={r.vehicle} /></td>
                  <td className="num"><b><Money value={r.profit} colored /></b></td>
                  <td className="num">{r.planned === undefined ? '–' : <Money value={r.planned} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {recs.length > shown.length && <p className="dim small">Angezeigt: die letzten {shown.length} Fahrten. Alle stehen im CSV-Export.</p>}
        </div>
      )}
    </Card>
  );
}

function Liquidity() {
  const s = useGame();
  const fc = forecastLiquidity(s, 30);
  const receipts = fc.days.reduce((a, d) => a + d.receipts, 0);
  const ops = fc.days.reduce((a, d) => a + d.operations, 0);
  const fixed = fc.days.reduce((a, d) => a + d.fixed, 0);
  return (
    <>
      <div className="grid grid-4">
        <Stat label="Kontostand heute" value={<Money value={s.company.account.balance} colored />} />
        <Stat label="in 30 Tagen (Prognose)" value={<Money value={fc.days.at(-1)?.balance ?? 0} colored />} hint={s.company.account.balance < 0 ? 'Konto bereits im Minus' : fc.negativeOn !== undefined ? `ab Tag ${fc.negativeOn} im Minus` : `Tiefststand ${(fc.lowest / 100).toLocaleString('de-DE', { maximumFractionDigits: 0 })} €`} />
        <Stat label="Zahlungseingänge" value={<Money value={receipts} />} hint="offene Rechnungen, gewichtet mit Zahlungsmoral" />
        <Stat label="Fixkosten im Zeitraum" value={<Money value={fixed} />} hint={<>Monatlich <Money value={fc.monthlyFixed} />, laufendes Geschäft <Money value={ops} colored /></>} />
      </div>
      <Card title="Kontostand in den nächsten 30 Tagen" className="mt">
        <LineChart series={[{ label: 'Kontostand', color: fc.negativeOn !== undefined ? 'var(--danger)' : 'var(--accent)', values: [s.company.account.balance / 100, ...fc.days.map((d) => d.balance / 100)] }]} format={(v) => `${Math.round(v).toLocaleString('de-DE')} €`} />
        <p className="dim small" style={{ marginBottom: 0 }}>
          Grundlage: Fixkosten zum Monatsersten (Löhne, Mieten, Versicherungen, Leasing, Kreditraten), offene Rechnungen zum Fälligkeitstag gewichtet mit der Zahlungsmoral des Kunden,
          und das laufende Geschäft der letzten 30 Tage: Kraftstoff und Maut sofort, neue Erlöse erst nach dem üblichen Zahlungsziel.
        </p>
      </Card>
    </>
  );
}
