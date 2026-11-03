// Kunden & Verträge, Standorte & Ausbau.

import { useMemo, useState } from 'react';
import { Building2, ArrowUpCircle, FileSignature, ArrowRight, Award, Wrench, Fuel, Warehouse, MapPin, Briefcase, UserPlus, UserMinus } from 'lucide-react';
import {
  BRANCH_SETUP_COST, CARGO_BY_ID, CITIES, COMPANY_LEVELS, DEPARTMENTS, STAFF_GRADES, DEPOT_MIN_LEVEL, FACILITY_DEFS, LOCATION_DEFS, LOCATION_ORDER, VEHICLES_PER_DISPATCHER,
  capacity, contractVolume, contractWeekdays, dispatchShortfall, formatDate, levelProgress, seatsAt, staffSalary, staffSeats, warehouseIncome,
  type Contract, type Department, type FacilityKind, type Location, type StaffGrade,
} from '@spedsim/core';
import { sendCommand, useGame } from '../game/store.ts';
import { Badge, Bar, Card, Empty, Money, PageHeader, useSort } from '../ui/components.tsx';
import { cityLabel, cityName, countryName, km, tons, trailerName, QUAL_LABEL } from '../ui/format.ts';
import { askConfirm } from '../ui/confirm.tsx';

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

export function LocationsPage() {
  const s = useGame();
  const cap = capacity(s);
  const seats = staffSeats(s);
  return (
    <div className="page">
      <PageHeader
        title="Standorte & Unternehmensausbau"
        subtitle={`Stellplätze ${cap.vehicles}/${cap.parking} · Aufliegerplätze ${cap.trailers}/${cap.trailerParking} · Büroarbeitsplätze ${seats.used}/${seats.total}`}
      />
      <LevelCard />
      <div className="grid grid-2 mt">
        {s.company.locations.map((l) => <LocationCard key={l.id} loc={l} />)}
        <NewBranch />
      </div>
      <Departments />
    </div>
  );
}

function LevelCard() {
  const s = useGame();
  const { def, next, checks } = levelProgress(s);
  return (
    <Card title={<><Award size={16} /> Unternehmensstufe {def.level}: {def.name}</>} sub={`bis zu ${def.maxLocations} Standort${def.maxLocations > 1 ? 'e' : ''}`}>
      <div className="level-steps">
        {COMPANY_LEVELS.map((l) => (
          <div key={l.level} className={`level-step ${l.level <= def.level ? 'done' : ''} ${l.level === def.level ? 'current' : ''}`} title={l.name}>
            <b>{l.level}</b>
            <small>{l.name}</small>
          </div>
        ))}
      </div>
      {next ? (
        <>
          <div className="card-title mt">Für Stufe {next.level} „{next.name}“</div>
          <div className="row wrap">
            {checks.map((c) => (
              <Badge key={c.label} kind={c.ok ? 'success' : ''}>{c.ok ? '✓' : '○'} {c.label} {c.have.toLocaleString('de-DE')}/{c.need.toLocaleString('de-DE')}</Badge>
            ))}
          </div>
          <p className="dim" style={{ fontSize: 12.5, marginBottom: 0 }}>{LEVEL_UNLOCKS[next.level]}</p>
        </>
      ) : (
        <p className="dim" style={{ marginBottom: 0 }}>Höchste Stufe erreicht.</p>
      )}
    </Card>
  );
}

const LEVEL_UNLOCKS: Record<number, string> = {
  2: 'Schaltet eine erste Niederlassung, die eigene Werkstatt und die Betriebstankstelle frei.',
  3: 'Schaltet bis zu 3 Standorte, den Großen Betriebshof und Lagerhallen frei.',
  4: 'Bis zu 5 Standorte.',
  5: 'Bis zu 8 Standorte.',
  6: 'Bis zu 15 Standorte.',
};

function LocationCard({ loc: l }: { loc: Location }) {
  const s = useGame();
  const def = LOCATION_DEFS[l.kind];
  const next = LOCATION_ORDER.slice(LOCATION_ORDER.indexOf(l.kind) + 1);
  const hq = l.cityId === s.company.hqCityId;
  const here = seatsAt(s, l.id);
  const vehiclesHere = Object.values(s.vehicles).filter((v) => !v.tripId && v.cityId === l.cityId).length;
  const level = s.company.level ?? 1;
  return (
    <Card
      title={<><Building2 size={16} />{cityLabel(l.cityId)}</>}
      sub={hq ? 'Firmensitz' : 'Niederlassung'}
      actions={
        !hq && (
          <button className="btn small danger" onClick={async () => (await askConfirm(`Niederlassung ${cityName(l.cityId)} aufgeben? Aufhebung kostet eine Monatsmiete, Einrichtungen verfallen.`, { title: 'Niederlassung aufgeben?', confirmLabel: 'Aufgeben', danger: true })) && sendCommand({ type: 'closeBranch', locationId: l.id })}>
            Aufgeben
          </button>
        )
      }
    >
      <dl className="kv">
        <dt>Standorttyp</dt><dd>{def.name}</dd>
        <dt>Miete</dt><dd><Money value={def.rent} /> / Monat</dd>
        <dt>Stellplätze LKW / Auflieger</dt><dd>{def.parking} / {def.trailerParking}</dd>
        <dt>Büroarbeitsplätze</dt><dd>{here.used}/{here.total} belegt</dd>
        <dt>Fahrzeuge vor Ort</dt><dd>{vehiclesHere}</dd>
        <dt>Seit</dt><dd>{formatDate(l.since)}</dd>
      </dl>

      <div className="card-title mt">Einrichtungen</div>
      <div className="list">
        {(Object.keys(FACILITY_DEFS) as FacilityKind[]).map((k) => {
          const f = FACILITY_DEFS[k];
          const built = l.facilities?.includes(k);
          const reason = level < f.minLevel ? `ab Stufe ${f.minLevel}` : LOCATION_ORDER.indexOf(l.kind) < LOCATION_ORDER.indexOf(f.minKind) ? 'braucht Betriebshof' : '';
          const Icon = FACILITY_ICON[k];
          return (
            <div key={k} className="list-item" style={{ alignItems: 'center' }}>
              <Icon size={16} />
              <div style={{ flex: 1 }}>
                <b>{f.name}</b>
                <div className="dim" style={{ fontSize: 12 }}>{f.text}</div>
                {built && k === 'warehouse' && (
                  <div className="row" style={{ fontSize: 12 }}>
                    <Bar value={(l.warehouseUtil ?? 0) * 100} /> {Math.round((l.warehouseUtil ?? 0) * 100)} % belegt · Erlös ca. <Money value={warehouseIncome(l)} />/Monat
                  </div>
                )}
              </div>
              {built ? (
                <Badge kind="success">in Betrieb · <Money value={f.monthly} />/Monat</Badge>
              ) : (
                <button
                  className="btn small"
                  disabled={!!reason}
                  title={reason || `Betrieb ${(f.monthly / 100).toLocaleString('de-DE')} €/Monat`}
                  onClick={async () => (await askConfirm(`${f.name} für ${(f.cost / 100).toLocaleString('de-DE')} € bauen? Betrieb ${(f.monthly / 100).toLocaleString('de-DE')} €/Monat.`, { title: 'Einrichtung bauen?', confirmLabel: 'Bauen' })) && sendCommand({ type: 'buildFacility', locationId: l.id, facility: k })}
                >
                  {reason || <>Bauen · <Money value={f.cost} /></>}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {next.length > 0 && <div className="card-title mt">Erweiterung</div>}
      {next.map((k) => {
        const n = LOCATION_DEFS[k];
        const locked = k === 'depot' && level < DEPOT_MIN_LEVEL;
        return (
          <div key={k} className="pick" style={{ cursor: 'default' }}>
            <ArrowUpCircle size={18} />
            <div style={{ flex: 1 }}>
              <b>{n.name}</b>
              <div><small>{n.parking} LKW-Stellplätze · {n.trailerParking} Aufliegerplätze · {n.staff} Büroplätze · Miete <Money value={n.rent} />/Monat · einmalig <Money value={n.deposit} /></small></div>
            </div>
            <button
              className="btn small primary"
              disabled={locked}
              onClick={async () => (await askConfirm(`${n.name} anmieten? Einmalig ${(n.deposit / 100).toLocaleString('de-DE')} € Kaution & Einrichtung.`, { title: 'Standort ausbauen?', confirmLabel: 'Anmieten' })) && sendCommand({ type: 'upgradeLocation', locationId: l.id, kind: k })}
            >
              {locked ? `ab Stufe ${DEPOT_MIN_LEVEL}` : 'Anmieten'}
            </button>
          </div>
        );
      })}
    </Card>
  );
}

const FACILITY_ICON: Record<FacilityKind, typeof Wrench> = { workshop: Wrench, fuel: Fuel, warehouse: Warehouse };

function NewBranch() {
  const s = useGame();
  const taken = new Set(s.company.locations.map((l) => l.cityId));
  const cities = useMemo(() => [...CITIES].sort((a, b) => a.country.localeCompare(b.country) || a.name.localeCompare(b.name)), []);
  const [cityId, setCityId] = useState('');
  const [kind, setKind] = useState<'office_small' | 'office_yard'>('office_yard');
  const max = levelProgress(s).def.maxLocations;
  const full = s.company.locations.length >= max;
  const def = LOCATION_DEFS[kind];
  return (
    <Card title={<><MapPin size={16} /> Neue Niederlassung</>} sub={`${s.company.locations.length}/${max} Standorte`}>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        Jede Niederlassung bringt Stellplätze, Büroarbeitsplätze, Bewerber und Aufträge aus ihrer Region sowie kürzere Leerfahrten.
        Neue Fahrzeuge können direkt dorthin geliefert werden.
      </p>
      <div className="field">
        <label>Stadt</label>
        <select className="input" value={cityId} onChange={(e) => setCityId(e.target.value)}>
          <option value="">– Stadt wählen –</option>
          {cities.filter((c) => !taken.has(c.id)).map((c) => <option key={c.id} value={c.id}>{countryName(c.country)} – {c.name}</option>)}
        </select>
      </div>
      <div className="field">
        <label>Standorttyp</label>
        <div className="seg" style={{ display: 'inline-flex' }}>
          {(['office_small', 'office_yard'] as const).map((k) => (
            <button key={k} className={kind === k ? 'active' : ''} onClick={() => setKind(k)}>{LOCATION_DEFS[k].name}</button>
          ))}
        </div>
      </div>
      <dl className="kv">
        <dt>Einmalig</dt><dd><Money value={def.deposit + BRANCH_SETUP_COST} /> <span className="dim">(Kaution & Einrichtung)</span></dd>
        <dt>Miete</dt><dd><Money value={def.rent} />/Monat</dd>
        <dt>Kapazität</dt><dd>{def.parking} LKW · {def.trailerParking} Auflieger · {def.staff} Büroplätze</dd>
      </dl>
      <button className="btn primary mt" disabled={!cityId || full} onClick={() => sendCommand({ type: 'openBranch', cityId, kind }).then((r) => r.ok && setCityId(''))}>
        <MapPin size={14} /> {full ? `Auf Stufe ${s.company.level ?? 1} keine weiteren Standorte` : 'Niederlassung eröffnen'}
      </button>
    </Card>
  );
}

function Departments() {
  const s = useGame();
  const staff = s.company.staff ?? [];
  const free = s.company.locations.filter((l) => seatsAt(s, l.id).used < seatsAt(s, l.id).total);
  const [locId, setLocId] = useState('');
  const [grade, setGrade] = useState<StaffGrade>('regular');
  const target = free.find((l) => l.id === locId) ?? free[0];
  const short = dispatchShortfall(s);
  return (
    <Card
      title={<><Briefcase size={16} /> Abteilungen</>}
      sub="Büropersonal entlastet die Geschäftsführung. Erfahrene Fahrer lassen sich in der Personalakte ins Büro befördern."
      className="mt"
      actions={
        <div className="row">
          <select className="input" style={{ width: 'auto' }} value={grade} onChange={(e) => setGrade(e.target.value as StaffGrade)} title="Erfahrungsstufe für Neueinstellungen">
            {(Object.keys(STAFF_GRADES) as StaffGrade[]).map((g) => <option key={g} value={g}>{STAFF_GRADES[g].name} (Kompetenz {STAFF_GRADES[g].skill.join('–')})</option>)}
          </select>
          {free.length > 1 && (
            <select className="input" style={{ width: 'auto' }} value={target?.id ?? ''} onChange={(e) => setLocId(e.target.value)} title="Arbeitsplatz für Neueinstellungen">
              {free.map((l) => <option key={l.id} value={l.id}>Arbeitsplatz: {cityName(l.cityId)}</option>)}
            </select>
          )}
        </div>
      }
    >
      {short > 0 && (
        <div className="card mb" style={{ background: 'var(--warning-soft, rgba(251,191,36,.12))', fontSize: 13 }}>
          <b>Disposition überlastet:</b> {short} Fahrzeug{short > 1 ? 'e' : ''} ohne Betreuung – die Fahrerzufriedenheit sinkt. Ein Disponent betreut {VEHICLES_PER_DISPATCHER} Fahrzeuge.
        </div>
      )}
      <div className="grid grid-2">
        {(Object.keys(DEPARTMENTS) as Department[]).map((k) => {
          const d = DEPARTMENTS[k];
          const members = staff.filter((m) => m.dept === k);
          return (
            <div key={k} className="card" style={{ background: 'var(--panel-2)' }}>
              <div className="row">
                <b style={{ flex: 1 }}>{d.name}</b>
                <Badge kind={members.length ? 'info' : ''}>{members.length} Mitarbeiter{members.length > d.maxEffective ? ` (${d.maxEffective} wirksam)` : ''}</Badge>
              </div>
              <div className="dim" style={{ fontSize: 12.5, margin: '6px 0' }}>{d.text}</div>
              <div className="list">
                {members.map((m) => (
                  <div key={m.id} className="list-item" style={{ alignItems: 'center' }}>
                    <span style={{ flex: 1 }}>{m.name} <Badge kind={m.skill >= 70 ? 'success' : m.skill >= 45 ? 'info' : 'warning'} title="Kompetenz">{Math.round(m.skill)}</Badge>{m.promoted && <span className="dim"> · ehem. Fahrer</span>}<div className="dim" style={{ fontSize: 12 }}>{cityName(s.company.locations.find((l) => l.id === m.locationId)?.cityId ?? '')} · seit {formatDate(m.hired)}</div></span>
                    <Money value={m.salary} />
                    <button className="btn small danger" onClick={async () => (await askConfirm(`${m.name} entlassen? Abfindung ein Monatsgehalt.`, { title: 'Entlassen?', confirmLabel: 'Entlassen', danger: true })) && sendCommand({ type: 'fireStaff', staffId: m.id })}><UserMinus size={13} /></button>
                  </div>
                ))}
              </div>
              <button className="btn small mt" disabled={!target} onClick={() => target && sendCommand({ type: 'hireStaff', dept: k, locationId: target.id, grade })} title={target ? '' : 'Keine freien Büroarbeitsplätze – Standort erweitern'}>
                <UserPlus size={13} /> Einstellen · ca. <Money value={target ? staffSalary(k, target, grade) : d.salary} />/Monat
              </button>
            </div>
          );
        })}
      </div>
      {!target && <p className="dim" style={{ fontSize: 12.5, marginBottom: 0 }}>Alle Büroarbeitsplätze sind belegt – ein Betriebshof oder eine weitere Niederlassung schafft Platz.</p>}
    </Card>
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
          <button className="btn small danger" onClick={async () => (await askConfirm(`Vertrag vorzeitig kündigen? Ablöse ${Math.round((c.penaltyMissed * 3) / 100).toLocaleString('de-DE')} €, der Kunde wird verärgert sein.`, { title: 'Vertrag kündigen?', confirmLabel: 'Kündigen', danger: true })) && sendCommand({ type: 'cancelContract', contractId: c.id })}>
            Kündigen
          </button>
        )}
      </div>
    </div>
  );
}
