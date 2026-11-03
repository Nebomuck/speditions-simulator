import { Wallet, TrendingUp, Truck, AlertTriangle, Fuel, Users, Smile, Receipt } from 'lucide-react';
import { formatDateTime, receivables, isTripLate } from '@spedsim/core';
import { navigate, useGame } from '../game/store.ts';
import { Badge, Card, Money, PageHeader, Stat } from '../ui/components.tsx';
import { MapView } from '../ui/MapView.tsx';

export function Dashboard() {
  const s = useGame();
  const trips = Object.values(s.trips).filter((t) => t.phase !== 'done');
  const late = trips.filter((t) => isTripLate(s, t));
  const vehicles = Object.values(s.vehicles);
  const idle = vehicles.filter((v) => v.status === 'idle');
  const last30 = s.stats.slice(-30);
  const rev30 = last30.reduce((a, d) => a + d.revenue, 0) + s.today.revenue;
  const cost30 = last30.reduce((a, d) => a + d.costs, 0) + s.today.costs;
  const fuel30 = s.ledger.filter((l) => l.category === 'fuel' && s.time - l.t < 30 * 1440).reduce((a, l) => a - l.amount, 0);
  const customers = Object.values(s.customers).filter((c) => c.deliveries > 0);
  const avgSat = customers.length ? customers.reduce((a, c) => a + c.satisfaction, 0) / customers.length : 0;
  const accepted = Object.values(s.orders).filter((o) => o.status === 'accepted');
  const important = [...s.log].reverse().filter((l) => l.level !== 'info').slice(0, 8);
  return (
    <div className="page">
      <PageHeader title="Unternehmensübersicht" subtitle={`${s.company.name} · gegründet ${formatDateTime(s.company.founded).slice(3, 13)}`} />
      <div className="grid grid-4">
        <Stat icon={<Wallet size={15} />} label="Firmenkonto" value={<Money value={s.company.account.balance} colored />} hint={<>Offene Forderungen: <Money value={receivables(s)} /></>} />
        <Stat icon={<TrendingUp size={15} />} label="Gewinn/Verlust (30 Tage)" value={<Money value={rev30 - cost30} colored />} hint={<>Einnahmen <Money value={rev30} /> · Ausgaben <Money value={cost30} /></>} />
        <Stat icon={<Truck size={15} />} label="Laufende Aufträge" value={trips.filter((t) => t.orderId).length} hint={`${idle.length} von ${vehicles.length} Fahrzeugen verfügbar`} />
        <Stat icon={<AlertTriangle size={15} />} label="Verspätete Transporte" value={<span className={late.length ? 'neg' : ''}>{late.length}</span>} hint={`${s.company.totals.lateDeliveries} von ${s.company.totals.deliveries} Lieferungen verspätet`} />
        <Stat icon={<Fuel size={15} />} label="Kraftstoffkosten (30 Tage)" value={<Money value={fuel30} />} hint={`Diesel aktuell ${(s.market.diesel / 100).toLocaleString('de-DE', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} €/l`} />
        <Stat icon={<Users size={15} />} label="Mitarbeiter" value={Object.keys(s.drivers).length + (s.company.staff?.length ?? 0)} hint={`${Object.keys(s.drivers).length} Fahrer · ${s.company.staff?.length ?? 0} im Büro`} />
        <Stat icon={<Smile size={15} />} label="Kundenzufriedenheit" value={customers.length ? `${Math.round(avgSat)} %` : '–'} hint={`Reputation ${Math.round(s.company.reputation)} / 100`} />
        <Stat icon={<Receipt size={15} />} label="Angenommene Aufträge" value={accepted.length} hint={accepted.length ? 'warten auf Disposition' : 'Auftragsbörse prüfen'} />
      </div>
      <div className="grid mt" style={{ gridTemplateColumns: '1.3fr 1fr' }}>
        <Card title="Live-Karte" actions={<button className="btn small" onClick={() => navigate('map')}>Vollbild</button>}>
          <div style={{ position: 'relative', height: 380, borderRadius: 8, overflow: 'hidden' }}>
            <MapView mini />
          </div>
        </Card>
        <Card title="Wichtigste Meldungen">
          {important.length === 0 && <div className="empty">Noch keine Meldungen. Nimm einen Auftrag in der Auftragsbörse an!</div>}
          <div className="list">
            {important.map((l) => (
              <div key={l.id} className="list-item">
                <time>{formatDateTime(l.t).slice(3)}</time>
                <Badge kind={l.level === 'danger' ? 'danger' : l.level === 'warning' ? 'warning' : 'success'}>{l.level === 'danger' ? '!' : l.level === 'warning' ? '⚠' : '✓'}</Badge>
                <span>{l.text}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
      {s.company.totals.deliveries === 0 && (
        <Card title="Erste Schritte" className="mt">
          <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8, color: 'var(--text-2)' }}>
            <li>Öffne die <a href="#" onClick={() => navigate('orders')}>Auftragsbörse</a> und filtere nach Aufträgen in der Nähe deines LKW mit passendem Auflieger (Planenauflieger).</li>
            <li>Prüfe Vergütung, Entfernung, Diesel, Maut und Lieferfrist – die Börse zeigt dir den voraussichtlichen Gewinn.</li>
            <li>Klicke auf <b>Disponieren</b>, wähle Fahrer, LKW und Auflieger und starte die Fahrt.</li>
            <li>Starte die Zeit oben (▶) und verfolge deinen LKW live auf der <a href="#" onClick={() => navigate('map')}>Europakarte</a>.</li>
            <li>Nach der Lieferung wird eine Rechnung gestellt – das Geld kommt erst nach dem Zahlungsziel. Achte auf deine Liquidität!</li>
          </ol>
        </Card>
      )}
    </div>
  );
}
