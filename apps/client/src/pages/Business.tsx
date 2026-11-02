// Kunden & Verträge, Standorte & Ausbau.

import { Building2, ArrowUpCircle } from 'lucide-react';
import { LOCATION_DEFS, capacity, formatDate, type LocationKind } from '@spedsim/core';
import { sendCommand, useGame } from '../game/store.ts';
import { Badge, Bar, Card, Empty, Money, PageHeader, useSort } from '../ui/components.tsx';
import { cityLabel } from '../ui/format.ts';

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
        <p className="dim" style={{ fontSize: 12.5 }}>Rahmen- und Langzeitverträge mit Stammkunden folgen in Entwicklungsphase 5 (siehe FEATURE_CHECKLIST.md).</p>
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
