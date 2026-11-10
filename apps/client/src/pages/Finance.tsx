import { useState } from 'react';
import { LOAN_TERMS, annuity, factoringPayout, formatDate, formatDateTime, formatMoney, loanLimit, loanRate, monthlyFixedCosts, ratingLabel, receivables, companyValue, vehicleMarketValue, exitBlock, exitValuation, EXIT_MIN_DAYS, type LedgerCategory } from '@spedsim/core';
import { Landmark, HandCoins, Handshake } from 'lucide-react';
import { askConfirm } from '../ui/confirm.tsx';
import { sendCommand, useGame } from '../game/store.ts';
import { Badge, Card, Empty, LineChart, Money, PageHeader, Stat } from '../ui/components.tsx';

const CAT_LABEL: Record<LedgerCategory, string> = {
  revenue: 'Erlöse', fuel: 'Diesel', toll: 'Maut', wages: 'Löhne', rent: 'Miete', insurance: 'Versicherung', leasing: 'Leasing',
  maintenance: 'Wartung', repair: 'Reparatur', vehicle_purchase: 'Fahrzeugkauf', vehicle_sale: 'Fahrzeugverkauf', storage: 'Lagerlogistik', penalty: 'Strafen',
  hiring: 'Personalgewinnung', salary: 'GF-Gehalt', living: 'Lebenshaltung', loan: 'Kredit', interest: 'Zinsen', tax: 'Steuern', subcontract: 'Subunternehmer', acquisition: 'Übernahmen', other: 'Sonstiges',
};

export function FinancePage() {
  const s = useGame();
  const [tab, setTab] = useState<'overview' | 'invoices' | 'credit' | 'ledger'>('overview');
  const [loanAmount, setLoanAmount] = useState(20_000);
  const [loanMonths, setLoanMonths] = useState<number>(24);
  const invoices = Object.values(s.invoices).sort((a, b) => b.issued - a.issued);
  const open = invoices.filter((i) => i.status === 'open' || i.status === 'overdue');
  const fixed = monthlyFixedCosts(s);
  const fixedSum = fixed.reduce((a, f) => a + f.amount, 0);
  const since = s.time - 30 * 1440;
  const byCat = new Map<LedgerCategory, number>();
  for (const l of s.ledger) if (l.account === 'company' && l.t >= since) byCat.set(l.category, (byCat.get(l.category) ?? 0) + l.amount);
  const limit = loanLimit(s, (id) => vehicleMarketValue(s, id));
  const rate = loanRate(s, loanMonths);
  const factorAll = open.reduce((a, i) => a + factoringPayout(s, i), 0);
  const vehValue = Object.values(s.vehicles).filter((v) => v.ownership === 'owned').reduce((a, v) => a + vehicleMarketValue(s, v.id), 0);
  return (
    <div className="page">
      <PageHeader title="Finanzen" subtitle="Firmenkonto · Forderungen · Hauptbuch" />
      <div className="grid grid-4">
        <Stat label="Kontostand" value={<Money value={s.company.account.balance} colored />} hint={s.company.account.balance < 0 ? <>Im Minus – Hilfe unter <a href="#" onClick={(e) => { e.preventDefault(); setTab('credit'); }}>Kredite &amp; Factoring</a></> : 'Kontokorrentrahmen 10.000 € · 12 % p. a. Überziehungszins'} />
        <Stat label="Offene Forderungen" value={<Money value={receivables(s)} />} hint={`${open.length} Rechnungen · ${open.filter((i) => i.status === 'overdue').length} überfällig`} />
        <Stat label="Monatliche Fixkosten" value={<Money value={fixedSum} />} hint="Löhne, Mieten, Versicherung, Leasing, GF-Gehalt" />
        <Stat label="Unternehmenswert" value={<Money value={companyValue(s, (id) => vehicleMarketValue(s, id))} />} hint={<>davon Fahrzeugwert <Money value={vehValue} /></>} />
      </div>
      <div className="tabs mt">
        <button className={`tab ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}>Übersicht</button>
        <button className={`tab ${tab === 'invoices' ? 'active' : ''}`} onClick={() => setTab('invoices')}>Rechnungen ({open.length} offen)</button>
        <button className={`tab ${tab === 'credit' ? 'active' : ''}`} onClick={() => setTab('credit')}>Kredite & Factoring</button>
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
            <LineChart series={[{ label: 'Diesel €/l netto', color: 'var(--warning)', values: s.market.dieselHistory.map((d) => d.v / 100) }]} format={(v) => `${v.toLocaleString('de-DE', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} €`} />
          </Card>
        </div>
      )}
      {tab === 'invoices' && (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Kunde</th><th>Gestellt</th><th>Fällig</th><th>Status</th><th>Mahnungen</th><th className="num">Betrag</th><th></th></tr></thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id}>
                  <td>{s.customers[i.customerId]?.name}</td>
                  <td>{formatDate(i.issued)}</td>
                  <td>{formatDate(i.due)}</td>
                  <td>
                    <Badge kind={i.status === 'paid' || i.status === 'factored' ? 'success' : i.status === 'overdue' ? 'warning' : i.status === 'defaulted' ? 'danger' : 'info'}>
                      {{ open: 'Offen', paid: `Bezahlt ${i.paid ? formatDate(i.paid) : ''}`, overdue: 'Überfällig', defaulted: 'Ausgefallen', factored: `Verkauft ${i.paid ? formatDate(i.paid) : ''}` }[i.status]}
                    </Badge>
                  </td>
                  <td>{i.reminders || '–'}</td>
                  <td className="num"><Money value={i.amount} /></td>
                  <td>
                    {(i.status === 'open' || i.status === 'overdue') && (
                      <button className="btn small" title="Rechnung an Factoring-Gesellschaft verkaufen" onClick={() => sendCommand({ type: 'factorInvoices', invoiceId: i.id })}>
                        Verkaufen ({formatMoney(factoringPayout(s, i))})
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {invoices.length === 0 && <Empty>Noch keine Rechnungen – nach jeder Lieferung wird eine Rechnung gestellt.</Empty>}
        </div>
      )}
      {tab === 'credit' && (
        <div className="grid grid-2">
          <Card title={<><Landmark size={16} /> Bankkredit</>} sub={`Kreditrahmen ${formatMoney(limit)} · Bonität ${ratingLabel(s)}`}>
            <div className="field">
              <label>Betrag (€)</label>
              <input className="input" type="number" min={5000} step={1000} value={loanAmount} onChange={(e) => setLoanAmount(Number(e.target.value))} />
            </div>
            <div className="field">
              <label>Laufzeit</label>
              <div className="row wrap" style={{ gap: 6 }}>
                {LOAN_TERMS.map((m) => (
                  <button key={m} className={`chip ${loanMonths === m ? 'active' : ''}`} onClick={() => setLoanMonths(m)}>{m} Monate</button>
                ))}
              </div>
            </div>
            <p className="dim" style={{ fontSize: 12.5 }}>
              Zins {(rate * 100).toFixed(1).replace('.', ',')} % p. a. · Monatsrate <b>{formatMoney(annuity(loanAmount * 100, rate, loanMonths))}</b>, abgebucht am Monatsersten.
              Der Rahmen richtet sich nach Fuhrpark und offenen Forderungen. Im Minus verlangt die Bank 2 % Aufschlag.
            </p>
            <button className="btn primary" disabled={loanAmount * 100 > limit || loanAmount < 5000} onClick={() => sendCommand({ type: 'takeLoan', amount: loanAmount * 100, months: loanMonths })}>
              <Landmark size={15} /> Kredit aufnehmen
            </button>
            <div className="card-title mt">Laufende Kredite</div>
            {s.company.loans.length === 0 && <Empty>Keine laufenden Kredite.</Empty>}
            <div className="list">
              {s.company.loans.map((l) => (
                <div key={l.id} className="list-item" style={{ alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    {l.label && <b>{l.label}: </b>}<b><Money value={l.principal} /></b> über {l.months} Monate · {(l.ratePa * 100).toFixed(1).replace('.', ',')} %
                    <div className="dim" style={{ fontSize: 12 }}>Restschuld <Money value={l.remaining} /> · Rate <Money value={l.monthly} /> · seit {formatDate(l.taken)}</div>
                  </div>
                  <button className="btn small" onClick={() => sendCommand({ type: 'repayLoan', loanId: l.id })}>Ablösen (+1 %)</button>
                </div>
              ))}
            </div>
          </Card>
          <Card title={<><HandCoins size={16} /> Factoring</>} sub="Rechnungen sofort zu Geld machen">
            <p className="dim" style={{ fontSize: 12.5 }}>
              Eine Factoring-Gesellschaft kauft offene Rechnungen und zahlt sofort aus. Gebühr 3 %, bei überfälligen Rechnungen zusätzlich 0,15 % je Verzugstag (höchstens 15 %).
              Das Ausfallrisiko trägt danach die Factoring-Gesellschaft.
            </p>
            <div className="row" style={{ alignItems: 'center' }}>
              <span style={{ flex: 1 }}>{open.length} offene Rechnungen über <Money value={receivables(s)} /></span>
              <button className="btn primary" disabled={!open.length} onClick={() => sendCommand({ type: 'factorInvoices' })}>
                <HandCoins size={15} /> Alle verkaufen ({formatMoney(factorAll)})
              </button>
            </div>
            <p className="dim" style={{ fontSize: 12.5 }}>Einzelne Rechnungen verkaufst du im Reiter „Rechnungen“.</p>
          </Card>
          <ExitCard />
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

/** Firma verkaufen: Bewertung, Bedingungen und Verkauf (beendet das Spiel) */
function ExitCard() {
  const s = useGame();
  const v = exitValuation(s);
  const block = exitBlock(s);
  const sell = async () => {
    const ok = await askConfirm(
      <div>
        <p style={{ marginTop: 0 }}>Ein Käufer übernimmt {s.company.name} für <b><Money value={v.price} /></b>. Nach Ablösung der Kredite bleiben <b><Money value={v.proceeds} /></b> für dich.</p>
        <p style={{ marginBottom: 0 }}>Damit endet dieses Spiel. Der Spielstand bleibt erhalten, die Zeit läuft aber nicht weiter. Bei deiner nächsten Gründung bekommst du einen Neustart-Bonus.</p>
      </div>,
      { title: 'Firma wirklich verkaufen?', confirmLabel: 'Verkaufen', danger: true },
    );
    if (ok) await sendCommand({ type: 'sellCompany' });
  };
  return (
    <Card title={<><Handshake size={16} /> Firma verkaufen</>} sub="Exit zum Unternehmenswert">
      <div className="exit-kv">
        <span>Substanz (Konto, Forderungen, eigene Fahrzeuge und Anlagen)</span><b><Money value={v.assets} /></b>
        <span>Kundenstamm ({v.loyalCustomers} treue Kunden, Ø Monatsgewinn <Money value={v.monthlyProfit} />)</span><b><Money value={v.goodwill} /></b>
        <span>Kaufpreis</span><b><Money value={v.price} /></b>
        <span>Kredite ablösen</span><b><Money value={v.debts ? -v.debts : 0} colored /></b>
        <span>Erlös für dich</span><b><Money value={v.proceeds} /></b>
      </div>
      <p className="dim" style={{ fontSize: 12.5 }}>
        Nur im Einzelspiel und frühestens nach {EXIT_MIN_DAYS} Tagen. Der Erlös geht aufs Privatkonto. Bei der nächsten Gründung gibt es 10 % davon als zusätzliches Startkapital (höchstens 100.000 €) und mehr Ruf.
      </p>
      <div className="row" style={{ alignItems: 'center' }}>
        <span className="dim" style={{ flex: 1, fontSize: 12.5 }}>{block ?? 'Ein Käufer ist interessiert.'}</span>
        <button className="btn danger" disabled={!!block} onClick={sell}><Handshake size={15} />Verkaufen</button>
      </div>
    </Card>
  );
}
