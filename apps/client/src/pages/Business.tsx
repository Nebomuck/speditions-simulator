// Kunden & Verträge, Standorte & Ausbau.

import { Building2, ArrowUpCircle, FileSignature, ArrowRight } from 'lucide-react';
import { CARGO_BY_ID, LOCATION_DEFS, capacity, contractVolume, contractWeekdays, formatDate, type Contract, type LocationKind } from '@spedsim/core';
import { sendCommand, useGame } from '../game/store.ts';
import { Badge, Bar, Card, Empty, Money, PageHeader, useSort } from '../ui/components.tsx';
import { cityLabel, cityName, km, tons, trailerName, QUAL_LABEL } from '../ui/format.ts';

const INDUSTRY: Record<string, string> = {
  port: 'Hafen', chemical: 'Chemie', automotive: 'Automobil', food: 'Lebensmittel', agriculture: 'Landwirtschaft', steel: 'Stahl',
  retail: 'Handel', logistics: 'Logistik', electronics: 'Elektronik', pharma: 'Pharma', machinery: 'Maschinenbau', timber: 'Holz', construction: 'Bau',
};
const SIZE = { small: 'Klein', medium: 'Mittel', large: 'Groß' };

export function CustomersPage() {
  const s = useGame();
  const { key, dir, th } = useSort<'deliveries' | 'satisfaction' | 'name'>('deliveries');
  const customers = Object.values(s.customers).sort((a, b) => {
    const v = (c: typeof a) => (key === 'name' ? 0 : c[key]);
    return key === 'name' ? a.name.localeCompare(b.name) * dir : (v(a) - v(b)) * dir;
  });
  return (
    <div className="page">
      <PageHeader title="Kunden & Verträge" subtitle={`${customers.length} bekannte Unternehmen · Reputation ${Math.round(s.company.reputation)}/100`} />
      <Contracts />
      <Card title="Kundenbeziehungen" sub="Pünktliche Lieferungen steigern die Zufriedenheit; Verspätungen und Stornierungen senken sie.">
        <div className="table-wrap" style={{ border: 'none', maxHeight: 'calc(100vh - 260px)' }}>
          <table className="table">
            <thead>
              <tr>{th('name', 'Unternehmen')}<th>Branche</th><th>Größe</th><th>Standort</th>{th('satisfaction', 'Zufriedenheit')}<th>Zahlungsziel</th><th>Zahlungsmoral</th>{th('deliveries', 'Lieferungen', 'num')}</tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id}>
                  <td><b>{c.name}</b></td>
                  <td>{INDUSTRY[c.industry] ?? c.industry}</td>
                  <td>{SIZE[c.size]}</td>
                  <td>{cityLabel(c.cityId)}</td>
                  <td><div className="row"><Bar value={c.satisfaction} />{Math.round(c.satisfaction)}</div></td>
                  <td>{c.paymentTermDays} Tage</td>
                  <td>{c.deliveries > 0 || c.paymentReliability < 0.7 ? <Badge kind={c.paymentReliability > 0.85 ? 'success' : c.paymentReliability > 0.7 ? 'warning' : 'danger'}>{c.paymentReliability > 0.85 ? 'gut' : c.paymentReliability > 0.7 ? 'mittel' : 'schlecht'}</Badge> : <span className="dim">unbekannt</span>}</td>
                  <td className="num">{c.deliveries}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {customers.length === 0 && <Empty>Noch keine Kunden.</Empty>}
        </div>
        <p className="dim" style={{ fontSize: 12.5 }}>Zufriedene Stammkunden zahlen in der Börse etwas besser und bieten Rahmenverträge an.</p>
      </Card>
    </div>
  );
}

const ORDER: LocationKind[] = ['office_small', 'office_yard', 'depot'];

export function LocationsPage() {
  const s = useGame();
  const cap = capacity(s);
  return (
    <div className="page">
      <PageHeader title="Standorte & Unternehmensausbau" subtitle={`Stellplätze ${cap.vehicles}/${cap.parking} · Aufliegerplätze ${cap.trailers}/${cap.trailerParking}`} />
      <div className="grid grid-2">
        {s.company.locations.map((l) => {
          const def = LOCATION_DEFS[l.kind];
          const next = ORDER.slice(ORDER.indexOf(l.kind) + 1);
          return (
            <Card key={l.id} title={<><Building2 size={16} />{cityLabel(l.cityId)}</>} sub={l.cityId === s.company.hqCityId ? 'Firmensitz' : ''}>
              <dl className="kv">
                <dt>Standorttyp</dt><dd>{def.name}</dd>
                <dt>Miete</dt><dd><Money value={def.rent} /> / Monat</dd>
                <dt>Stellplätze LKW</dt><dd>{def.parking}</dd>
                <dt>Aufliegerplätze</dt><dd>{def.trailerParking}</dd>
                <dt>Büroarbeitsplätze</dt><dd>{def.staff}</dd>
                <dt>Seit</dt><dd>{formatDate(l.since)}</dd>
              </dl>
              {next.length > 0 && <div className="card-title mt">Erweiterung</div>}
              {next.map((k) => {
                const n = LOCATION_DEFS[k];
                return (
                  <div key={k} className="pick" style={{ cursor: 'default' }}>
                    <ArrowUpCircle size={18} />
                    <div style={{ flex: 1 }}>
                      <b>{n.name}</b>
                      <div><small>{n.parking} LKW-Stellplätze · {n.trailerParking} Aufliegerplätze · Miete <Money value={n.rent} />/Monat · einmalig <Money value={n.deposit} /></small></div>
                    </div>
                    <button className="btn small primary" onClick={() => confirm(`${n.name} anmieten? Einmalig ${(n.deposit / 100).toLocaleString('de-DE')} € Kaution & Einrichtung.`) && sendCommand({ type: 'upgradeLocation', locationId: l.id, kind: k })}>
                      Anmieten
                    </button>
                  </div>
                );
              })}
            </Card>
          );
        })}
        <Card title="Weitere Niederlassungen">
          <p className="muted" style={{ marginTop: 0 }}>
            Niederlassungen in anderen europäischen Städten (z. B. Hamburg, Prag, Mailand), Werkstätten, Lagerhallen und Abteilungen
            werden in Entwicklungsphase 6 freigeschaltet. Jede Niederlassung wird zusätzliche Stellplätze, regionale Aufträge und
            kürzere Leerfahrten bringen.
          </p>
        </Card>
      </div>
    </div>
  );
}

const CONTRACT_STATUS: Record<Contract['status'], string> = { offered: 'Angebot', active: 'läuft', completed: 'erfüllt', cancelled: 'gekündigt', expired: 'abgelaufen' };

function Contracts() {
  const s = useGame();
  const all = Object.values(s.contracts ?? {});
  const offers = all.filter((c) => c.status === 'offered').sort((a, b) => a.offerExpires - b.offerExpires);
  const active = all.filter((c) => c.status === 'active');
  const past = all.filter((c) => c.status === 'completed' || c.status === 'cancelled').sort((a, b) => (b.end ?? 0) - (a.end ?? 0)).slice(0, 5);
  return (
    <Card
      title={<><FileSignature size={16} /> Rahmenverträge</>}
      sub="Regelmäßige Touren zu festem Preis. Die Touren erscheinen am Vortag als angenommene Aufträge in der Disposition. Nicht gefahrene Touren kosten eine Vertragsstrafe."
      className="mb"
    >
      {offers.length === 0 && active.length === 0 && <Empty>Noch keine Vertragsangebote – zufriedene Stammkunden und Ausschreibungen aus der Region melden sich mit der Zeit.</Empty>}
      {active.length > 0 && <div className="card-title">Laufende Verträge</div>}
      <div className="grid grid-2">
        {active.map((c) => <ContractCard key={c.id} c={c} />)}
      </div>
      {offers.length > 0 && <div className="card-title mt">Angebote</div>}
      <div className="grid grid-2">
        {offers.map((c) => <ContractCard key={c.id} c={c} />)}
      </div>
      {past.length > 0 && (
        <>
          <div className="card-title mt">Beendet</div>
          <div className="list">
            {past.map((c) => (
              <div key={c.id} className="list-item">
                <Badge kind={c.status === 'completed' ? 'success' : 'danger'}>{CONTRACT_STATUS[c.status]}</Badge>
                <span style={{ flex: 1 }}>{s.customers[c.customerId]?.name} · {cityName(c.fromCityId)} → {cityName(c.toCityId)}</span>
                <span className="dim">{c.stats.delivered}/{c.stats.tours} Touren · {c.stats.missed} verpasst</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

function ContractCard({ c }: { c: Contract }) {
  const s = useGame();
  const cust = s.customers[c.customerId];
  const fits = Object.values(s.trailers).some((t) => t.type === c.trailerType);
  const progress = c.start && c.end ? Math.min(100, ((s.time - c.start) / (c.end - c.start)) * 100) : 0;
  return (
    <div className="card" style={{ background: 'var(--panel-2)' }}>
      <div className="row">
        <b style={{ flex: 1 }}>{cust?.name ?? 'Kunde'}</b>
        <Badge kind={c.regular ? 'success' : 'info'}>{c.regular ? 'Stammkunde' : 'Ausschreibung'}</Badge>
        {c.status === 'active' && <Badge kind="violet">{CONTRACT_STATUS[c.status]}</Badge>}
      </div>
      <div className="row mt" style={{ fontWeight: 600 }}>{cityName(c.fromCityId)} <ArrowRight size={14} /> {cityName(c.toCityId)} <span className="dim" style={{ fontWeight: 400 }}>· {km(c.distanceKm)}</span></div>
      <dl className="kv mt" style={{ gridTemplateColumns: '120px 1fr' }}>
        <dt>Ladung</dt><dd>{CARGO_BY_ID[c.cargoId].name}, {tons(c.weightT)} · {trailerName(c.trailerType)}{!fits && <Badge kind="warning">kein passender Auflieger</Badge>}</dd>
        <dt>Touren</dt><dd>{contractWeekdays(c)} · Ladefenster ab {String(c.pickupHour).padStart(2, '0')}:00 · {c.weeks} Wochen</dd>
        <dt>Je Tour</dt><dd><Money value={c.paymentPerTour} /> · Strafe bei Ausfall <Money value={c.penaltyMissed} /></dd>
        <dt>Volumen</dt><dd>ca. <Money value={contractVolume(c)} /></dd>
        {c.qualifications.length > 0 && <><dt>Voraussetzung</dt><dd>{c.qualifications.map((q) => QUAL_LABEL[q]).join(', ')}</dd></>}
        {c.status === 'offered' && <><dt>Angebot bis</dt><dd>{formatDate(c.offerExpires)}</dd></>}
        {c.status === 'active' && (
          <>
            <dt>Laufzeit</dt><dd><div className="row"><Bar value={progress} /> bis {formatDate(c.end!)}</div></dd>
            <dt>Bilanz</dt><dd>{c.stats.delivered}/{c.stats.tours} gefahren · {c.stats.late} verspätet · {c.stats.missed} verpasst</dd>
          </>
        )}
      </dl>
      <div className="row mt" style={{ justifyContent: 'flex-end' }}>
        {c.status === 'offered' && <button className="btn primary small" onClick={() => sendCommand({ type: 'acceptContract', contractId: c.id })}><FileSignature size={13} /> Vertrag annehmen</button>}
        {c.status === 'active' && (
          <button className="btn small danger" onClick={() => confirm(`Vertrag vorzeitig kündigen? Ablöse ${Math.round((c.penaltyMissed * 3) / 100).toLocaleString('de-DE')} €, der Kunde wird verärgert sein.`) && sendCommand({ type: 'cancelContract', contractId: c.id })}>
            Kündigen
          </button>
        )}
      </div>
    </div>
  );
}
