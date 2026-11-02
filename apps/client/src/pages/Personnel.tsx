import { UserPlus, UserMinus } from 'lucide-react';
import { formatDateTime, formatDuration, drivableNow } from '@spedsim/core';
import { sendCommand, useGame } from '../game/store.ts';
import { Avatar, Badge, Bar, Card, Empty, Money, PageHeader } from '../ui/components.tsx';
import { cityName, km, QUAL_LABEL, tripLabel, activityLabel } from '../ui/format.ts';

export function PersonnelPage() {
  const s = useGame();
  const drivers = Object.values(s.drivers);
  const applicants = Object.values(s.applicants);
  const wages = drivers.reduce((a, d) => a + d.salary, 0);
  return (
    <div className="page">
      <PageHeader title="Fahrer & Personal" subtitle={`${drivers.length} Fahrer · Lohnsumme ${Math.round(wages / 100).toLocaleString('de-DE')} € brutto/Monat (+21 % Arbeitgeberanteil)`} />
      <Card title="Fahrer" sub="Erfahrung senkt Verschleiß und erhöht das Tempo, sparsame Fahrweise senkt den Verbrauch">
        <div className="table-wrap" style={{ border: 'none' }}>
          <table className="table">
            <thead>
              <tr><th>Name</th><th>Status</th><th>Erfahrung</th><th>Sparsamkeit</th><th>Zuverlässigkeit</th><th>Zufriedenheit</th><th>Qualifikationen</th><th className="num">Gehalt</th><th className="num">km</th><th /></tr>
            </thead>
            <tbody>
              {drivers.map((d) => {
                const trip = d.tripId ? s.trips[d.tripId] : undefined;
                return (
                  <tr key={d.id}>
                    <td>
                      <div className="row"><Avatar seed={d.name} size={32} /><div><b>{d.name}</b><div className="dim">{d.age} J. · aus {cityName(d.homeCityId)}</div></div></div>
                    </td>
                    <td>
                      <Badge kind={trip ? 'info' : 'success'}>{trip ? activityLabel(trip, '') : `frei in ${cityName(d.cityId)}`}</Badge>
                      {trip && <div className="dim" style={{ fontSize: 12 }}>{tripLabel(s, trip)}</div>}
                      {!trip && <div className="dim" style={{ fontSize: 12 }}>Lenkzeit verfügbar: {formatDuration(drivableNow(d.hos))}</div>}
                    </td>
                    <td><div className="row"><Bar value={d.experience} />{Math.round(d.experience)}</div></td>
                    <td><div className="row"><Bar value={d.ecoDriving} />{d.ecoDriving}</div></td>
                    <td><div className="row"><Bar value={d.reliability} />{d.reliability}</div></td>
                    <td><div className="row"><Bar value={d.satisfaction} />{Math.round(d.satisfaction)}</div></td>
                    <td><div className="row wrap">{['CE', ...d.qualifications.map((q) => QUAL_LABEL[q])].map((q) => <Badge key={q}>{q}</Badge>)}</div></td>
                    <td className="num"><Money value={d.salary} /></td>
                    <td className="num">{km(d.kmDriven)}</td>
                    <td className="num">
                      <button className="btn small danger" disabled={!!trip} title="Entlassen (Abfindung 1 Monatsgehalt)" onClick={() => confirm(`${d.name} entlassen? Abfindung: 1 Monatsgehalt.`) && sendCommand({ type: 'fireDriver', driverId: d.id })}>
                        <UserMinus size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Bewerbungen" sub="Neue Bewerbungen gehen täglich ein · Einstellungskosten 350 €" className="mt">
        {applicants.length === 0 && <Empty>Derzeit keine Bewerbungen.</Empty>}
        <div className="grid grid-3">
          {applicants.map((a) => (
            <div key={a.id} className="card" style={{ background: 'var(--panel-2)' }}>
              <div className="row">
                <Avatar seed={a.name} size={40} />
                <div style={{ flex: 1 }}>
                  <b>{a.name}</b>
                  <div className="dim" style={{ fontSize: 12 }}>{a.age} Jahre · {cityName(a.homeCityId)}</div>
                </div>
                <b><Money value={a.salary} /></b>
              </div>
              <dl className="kv mt" style={{ gridTemplateColumns: '110px 1fr' }}>
                <dt>Erfahrung</dt><dd><div className="row"><Bar value={a.experience} />{a.experience}</div></dd>
                <dt>Sparsamkeit</dt><dd><div className="row"><Bar value={a.ecoDriving} />{a.ecoDriving}</div></dd>
                <dt>Zuverlässigkeit</dt><dd><div className="row"><Bar value={a.reliability} />{a.reliability}</div></dd>
                <dt>Belastbarkeit</dt><dd><div className="row"><Bar value={a.stressResistance} />{a.stressResistance}</div></dd>
                <dt>Qualifikationen</dt><dd>{a.qualifications.length ? a.qualifications.map((q) => QUAL_LABEL[q]).join(', ') : '–'}</dd>
                <dt>Verfügbar bis</dt><dd>{formatDateTime(a.expires)}</dd>
              </dl>
              <button className="btn primary mt" style={{ width: '100%', justifyContent: 'center' }} onClick={() => sendCommand({ type: 'hireDriver', applicantId: a.id })}>
                <UserPlus size={14} /> Einstellen
              </button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
