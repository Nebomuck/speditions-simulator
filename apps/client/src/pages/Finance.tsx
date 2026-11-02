import { useState } from 'react';
import { formatDate, formatDateTime, monthlyFixedCosts, receivables, companyValue, vehicleMarketValue, type LedgerCategory } from '@spedsim/core';
import { useGame } from '../game/store.ts';
import { Badge, Card, Empty, LineChart, Money, PageHeader, Stat } from '../ui/components.tsx';

const CAT_LABEL: Record<LedgerCategory, string> = {
  revenue: 'Erlöse', fuel: 'Diesel', toll: 'Maut', wages: 'Löhne', rent: 'Miete', insurance: 'Versicherung', leasing: 'Leasing',
  maintenance: 'Wartung', repair: 'Reparatur', vehicle_purchase: 'Fahrzeugkauf', vehicle_sale: 'Fahrzeugverkauf', penalty: 'Strafen',
  hiring: 'Personalgewinnung', salary: 'GF-Gehalt', living: 'Lebenshaltung', loan: 'Kredit', interest: 'Zinsen', tax: 'Steuern', other: 'Sonstiges',
};

export function FinancePage() {
  const s = useGame();
  const [tab, setTab] = useState<'overview' | 'invoices' | 'ledger'>('overview');
  const invoices = Object.values(s.invoices).sort((a, b) => b.issued - a.issued);
  const open = invoices.filter((i) => i.status === 'open' || i.status === 'overdue');
  const fixed = monthlyFixedCosts(s);
  const fixedSum = fixed.reduce((a, f) => a + f.amount, 0);
  const since = s.time - 30 * 1440;
  const byCat = new Map<LedgerCategory, number>();
  for (const l of s.ledger) if (l.account === 'company' && l.t >= since) byCat.set(l.category, (byCat.get(l.category) ?? 0) + l.amount);
  const vehValue = Object.values(s.vehicles).filter((v) => v.ownership === 'owned').reduce((a, v) => a + vehicleMarketValue(s, v.id), 0);
  return (
    <div className="page">
      <PageHeader title="Finanzen" subtitle="Firmenkonto · Forderungen · Hauptbuch" />
      <div className="grid grid-4">
        <Stat label="Kontostand" value={<Money value={s.company.account.balance} colored />} hint="Kontokorrentrahmen 10.000 € · 12 % p. a. Überziehungszins" />
        <Stat label="Offene Forderungen" value={<Money value={receivables(s)} />} hint={`${open.length} Rechnungen · ${open.filter((i) => i.status === 'overdue').length} überfällig`} />
        <Stat label="Monatliche Fixkosten" value={<Money value={fixedSum} />} hint="Löhne, Mieten, Versicherung, Leasing, GF-Gehalt" />
        <Stat label="Unternehmenswert" value={<Money value={companyValue(s, (id) => vehicleMarketValue(s, id))} />} hint={<>davon Fahrzeugwert <Money value={vehValue} /></>} />
      </div>
      <div className="tabs mt">
        <button className={`tab ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}>Übersicht</button>
        <button className={`tab ${tab === 'invoices' ? 'active' : ''}`} onClick={() => setTab('invoices')}>Rechnungen ({open.length} offen)</button>
        <button className={`tab ${tab === 'ledger' ? 'active' : ''}`} onClick={() => setTab('ledger')}>Hauptbuch</button>
      </div>
      {tab === 'overview' && (
        <div className="grid grid-2">
          <Card title="Kontoverlauf" sub="Tagesendstände">
            <LineChart series={[{ label: 'Kontostand', color: 'var(--accent)', values: s.stats.map((d) => d.balance / 100) }]} format={(v) => `${Math.round(v).toLocaleString('de-DE')} €`} />
          </Card>
          <Card title="Einnahmen & Ausgaben (30 Tage)">
            {byCat.size === 0 && <Empty>Noch keine Buchungen.</Empty>}
            <div className="list">
              {[...byCat.entries()].sort((a, b) => a[1] - b[1]).map(([c, v]) => (
                <div key={c} className="list-item"><span style={{ flex: 1 }}>{CAT_LABEL[c]}</span><Money value={v} colored /></div>
              ))}
            </div>
          </Card>
          <Card title="Laufende Verpflichtungen (monatlich am 1.)">
            <div className="list">
              {fixed.map((f, i) => (
                <div key={i} className="list-item"><span style={{ flex: 1 }}>{f.label}</span><span className="dim">{CAT_LABEL[f.category]}</span><Money value={-f.amount} /></div>
              ))}
            </div>
          </Card>
          <Card title="Dieselpreis (180 Tage)">
            <LineChart series={[{ label: 'Diesel €/l netto', color: 'var(--warning)', values: s.market.dieselHistory.map((d) => d.v / 100) }]} format={(v) => `${v.toFixed(3)} €`} />
          </Card>
        </div>
      )}
      {tab === 'invoices' && (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Kunde</th><th>Gestellt</th><th>Fällig</th><th>Status</th><th>Mahnungen</th><th className="num">Betrag</th></tr></thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id}>
                  <td>{s.customers[i.customerId]?.name}</td>
                  <td>{formatDate(i.issued)}</td>
                  <td>{formatDate(i.due)}</td>
                  <td>
                    <Badge kind={i.status === 'paid' ? 'success' : i.status === 'overdue' ? 'warning' : i.status === 'defaulted' ? 'danger' : 'info'}>
                      {{ open: 'Offen', paid: `Bezahlt ${i.paid ? formatDate(i.paid) : ''}`, overdue: 'Überfällig', defaulted: 'Ausgefallen' }[i.status]}
                    </Badge>
                  </td>
                  <td>{i.reminders || '–'}</td>
                  <td className="num"><Money value={i.amount} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {invoices.length === 0 && <Empty>Noch keine Rechnungen – nach jeder Lieferung wird eine Rechnung gestellt.</Empty>}
        </div>
      )}
      {tab === 'ledger' && (
        <div className="table-wrap" style={{ maxHeight: 'calc(100vh - 330px)' }}>
          <table className="table">
            <thead><tr><th>Zeit</th><th>Konto</th><th>Kategorie</th><th>Buchungstext</th><th className="num">Betrag</th></tr></thead>
            <tbody>
              {[...s.ledger].reverse().slice(0, 400).map((l, i) => (
                <tr key={i}>
                  <td className="nowrap dim">{formatDateTime(l.t)}</td>
                  <td>{l.account === 'company' ? 'Firma' : `Privat (${s.players[l.account.slice(8)]?.name ?? '?'})`}</td>
                  <td>{CAT_LABEL[l.category]}</td>
                  <td>{l.text}</td>
                  <td className="num"><Money value={l.amount} colored cents /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
