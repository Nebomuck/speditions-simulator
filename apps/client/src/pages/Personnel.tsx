// Personal: Fahrerliste mit Personalakte (Urlaub, Schulungen, Gehalt, Gespräche) und Bewerbungen.

import { useState } from 'react';
import { UserPlus, UserMinus, FolderOpen, Palmtree, GraduationCap, MessageCircle, Euro, Briefcase, TrainFront } from 'lucide-react';
import {
  COURSES, DEPARTMENTS, TRAITS, MIN_PER_DAY, PROMOTION_MIN_EXPERIENCE, TALK_COOLDOWN_DAYS, formatDate, formatDateTime, formatDuration, drivableNow, marketSalary, satisfactionFactors, staffSeats, driverTravel,
  type Department, type Driver, type GameState, type TrainingCourse,
} from '@spedsim/core';
import { sendCommand, useGame, world } from '../game/store.ts';
import { Avatar, Badge, Bar, Card, Empty, Modal, Money, PageHeader, TraitBadge } from '../ui/components.tsx';
import { cityName, km, QUAL_LABEL, tripLabel, activityLabel } from '../ui/format.ts';
import { askConfirm } from '../ui/confirm.tsx';
import { openMenu, type MenuItem } from '../ui/ContextMenu.tsx';

/** Anreise-Ziele im Kontextmenü: Standorte und Städte mit einem freien LKW ohne Fahrer */
function travelItems(s: GameState, d: Driver): MenuItem[] {
  if (d.status !== 'idle' || d.leavesAt !== undefined) return [];
  const driverless = Object.values(s.vehicles)
    .filter((v) => v.status === 'idle' && !Object.values(s.drivers).some((o) => o.status === 'idle' && o.cityId === v.cityId))
    .map((v) => v.cityId);
  const cities = [...new Set([...driverless, ...s.company.locations.map((l) => l.cityId)])].filter((c) => c !== d.cityId);
  return cities.slice(0, 6).flatMap((c, i) => {
    const t = driverTravel(world, d.cityId, c);
    if (!t) return [];
    return [{
      label: `Anreise nach ${cityName(c)}${driverless.includes(c) ? ' (LKW wartet)' : ''} · ${formatDuration(t.minutes)}, ${Math.round(t.cost / 100)} €`,
      icon: <TrainFront size={14} />, sep: i === 0,
      onClick: () => sendCommand({ type: 'sendDriver', driverId: d.id, toCityId: c }),
    }];
  });
}

export function PersonnelPage() {
  const s = useGame();
  const drivers = Object.values(s.drivers);
  const applicants = Object.values(s.applicants);
  const wages = drivers.reduce((a, d) => a + d.salary, 0);
  const [fileId, setFileId] = useState<string | null>(null);
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
                  <tr
                    key={d.id}
                    onContextMenu={(e) =>
                      openMenu(
                        e,
                        [
                          { label: 'Personalakte öffnen', icon: <FolderOpen size={14} />, onClick: () => setFileId(d.id) },
                          { label: 'Personalgespräch führen', icon: <MessageCircle size={14} />, onClick: () => sendCommand({ type: 'talkToDriver', driverId: d.id }) },
                          { label: 'Eine Woche Urlaub', icon: <Palmtree size={14} />, disabled: d.status !== 'idle' || (d.vacationLeft ?? 0) < 7, onClick: () => sendCommand({ type: 'sendVacation', driverId: d.id, days: 7 }) },
                          ...travelItems(s, d),
                          {
                            label: 'Entlassen …', icon: <UserMinus size={14} />, danger: true, sep: true, disabled: !!trip,
                            onClick: async () => (await askConfirm(`${d.name} entlassen? Abfindung: 1 Monatsgehalt.`, { title: 'Fahrer entlassen?', confirmLabel: 'Entlassen', danger: true })) && sendCommand({ type: 'fireDriver', driverId: d.id }),
                          },
                        ],
                        d.name,
                      )
                    }
                  >
                    <td>
                      <div className="row"><Avatar seed={d.name} size={36} age={d.age} /><div><b>{d.name}</b><div className="dim">{d.age} J. · aus {cityName(d.homeCityId)}</div></div></div>
                    </td>
                    <td>
                      {d.status === 'traveling' ? (
                        <Badge kind="info">Anreise nach {cityName(d.travelTo ?? d.cityId)}, an {formatDateTime(d.absentUntil ?? s.time)}</Badge>
                      ) : d.status === 'vacation' || d.status === 'sick' || d.status === 'training' ? (
                        <Badge kind={d.status === 'sick' ? 'danger' : 'warning'}>{ABSENCE[d.status]} bis {formatDate(d.absentUntil ?? s.time)}</Badge>
                      ) : (
                        <Badge kind={trip ? 'info' : 'success'}>{trip ? activityLabel(trip, '') : `frei in ${cityName(d.cityId)}`}</Badge>
                      )}
                      {d.leavesAt !== undefined && <div><Badge kind="danger">gekündigt zum {formatDate(d.leavesAt)}</Badge></div>}
                      {trip && <div className="dim" style={{ fontSize: 12 }}>{tripLabel(s, trip)}</div>}
                      {!trip && d.status === 'idle' && <div className="dim" style={{ fontSize: 12 }}>Lenkzeit verfügbar: {formatDuration(drivableNow(d.hos))}</div>}
                    </td>
                    <td><div className="row"><Bar value={d.experience} />{Math.round(d.experience)}</div></td>
                    <td><div className="row"><Bar value={d.ecoDriving} />{d.ecoDriving}</div></td>
                    <td><div className="row"><Bar value={d.reliability} />{d.reliability}</div></td>
                    <td><div className="row"><Bar value={d.satisfaction} />{Math.round(d.satisfaction)}</div></td>
                    <td><div className="row wrap"><TraitBadge trait={d.trait} />{['CE', ...d.qualifications.map((q) => QUAL_LABEL[q])].map((q) => <Badge key={q}>{q}</Badge>)}</div></td>
                    <td className="num"><Money value={d.salary} /></td>
                    <td className="num">{km(d.kmDriven)}</td>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn small" title="Personalakte: Urlaub, Schulung, Gehalt, Gespräch" onClick={() => setFileId(d.id)}>
                        <FolderOpen size={13} /> Akte
                      </button>{' '}
                      <button className="btn small danger" disabled={!!trip} title="Entlassen (Abfindung 1 Monatsgehalt)" onClick={async () => (await askConfirm(`${d.name} entlassen? Abfindung: 1 Monatsgehalt.`, { title: 'Fahrer entlassen?', confirmLabel: 'Entlassen', danger: true })) && sendCommand({ type: 'fireDriver', driverId: d.id })}>
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
      {fileId && s.drivers[fileId] && <DriverFile driver={s.drivers[fileId]} onClose={() => setFileId(null)} />}
      <Card title="Bewerbungen" sub="Neue Bewerbungen gehen täglich ein · Einstellungskosten 350 €" className="mt">
        {applicants.length === 0 && <Empty>Derzeit keine Bewerbungen.</Empty>}
        <div className="grid grid-3">
          {applicants.map((a) => (
            <div key={a.id} className="card" style={{ background: 'var(--panel-2)' }}>
              <div className="row">
                <Avatar seed={a.name} size={48} age={a.age} />
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
                <dt>Eigenschaft</dt><dd>{a.trait ? <><TraitBadge trait={a.trait} /> <small className="dim">{TRAITS[a.trait].effect}</small></> : <span className="dim">keine besondere</span>}</dd>
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

const ABSENCE = { vacation: 'Urlaub', sick: 'Krank', training: 'Schulung' } as const;

function DriverFile({ driver: d, onClose }: { driver: Driver; onClose: () => void }) {
  const s = useGame();
  const [days, setDays] = useState(5);
  const [dept, setDept] = useState<Department>('dispatch');
  const seats = staffSeats(s);
  const market = marketSalary(d);
  const [salary, setSalary] = useState(Math.round(d.salary / 100));
  const { target, reasons } = satisfactionFactors(s, d);
  const available = d.status === 'idle';
  const talkReady = d.lastTalk === undefined || s.time - d.lastTalk >= TALK_COOLDOWN_DAYS * MIN_PER_DAY;
  const left = d.vacationLeft ?? 30;
  return (
    <Modal title={<>Personalakte {d.name} <TraitBadge trait={d.trait} /></>} onClose={onClose} width={860}>
      {d.trait && <p className="dim trait-note"><b>{TRAITS[d.trait].name}:</b> {TRAITS[d.trait].effect}</p>}
      <div className="grid grid-2">
        <div>
          <div className="card-title"><MessageCircle size={15} /> Zufriedenheit</div>
          <div className="row"><Bar value={d.satisfaction} /> <b>{Math.round(d.satisfaction)}</b> <span className="dim">→ Tendenz {Math.round(target)}</span></div>
          <div className="list mt">
            {reasons.length === 0 && <div className="dim">Keine besonderen Einflüsse.</div>}
            {reasons.map((r) => (
              <div key={r.text} className="list-item"><span style={{ flex: 1 }}>{r.text}</span><b className={r.delta > 0 ? 'pos' : 'neg'}>{r.delta > 0 ? '+' : ''}{r.delta}</b></div>
            ))}
          </div>
          {d.leavesAt !== undefined && (
            <div className="card mt" style={{ background: 'var(--danger-soft, rgba(248,113,113,.12))' }}>
              <b>Gekündigt zum {formatDate(d.leavesAt)}</b>
              <div className="dim" style={{ fontSize: 12.5 }}>Steigt die Zufriedenheit auf 45, zieht {d.name} die Kündigung zurück.</div>
            </div>
          )}
          <button className="btn mt" disabled={!talkReady} onClick={() => sendCommand({ type: 'talkToDriver', driverId: d.id })}>
            <MessageCircle size={14} /> Personalgespräch führen
          </button>
          {!talkReady && <div className="dim" style={{ fontSize: 12 }}>Nächstes Gespräch ab {formatDate(d.lastTalk! + TALK_COOLDOWN_DAYS * MIN_PER_DAY)}</div>}

          <div className="card-title mt"><Euro size={15} /> Gehalt</div>
          <div className="dim" style={{ fontSize: 12.5 }}>Aktuell <Money value={d.salary} /> · marktüblich <Money value={market} /></div>
          <div className="row mt">
            <input className="input" type="number" step={50} style={{ width: 140 }} value={salary} onChange={(e) => setSalary(Number(e.target.value))} />
            <span>€/Monat</span>
            <button className="btn" disabled={salary * 100 === d.salary} onClick={() => sendCommand({ type: 'setDriverSalary', driverId: d.id, salary: salary * 100 })}>Anpassen</button>
          </div>
          <small className="dim">Rahmen 70–160 % des Marktgehalts. Erhöhungen steigern die Zufriedenheit, Kürzungen senken sie deutlich.</small>
        </div>
        <div>
          <div className="card-title"><Palmtree size={15} /> Urlaub</div>
          <div className="dim" style={{ fontSize: 12.5 }}>
            Resturlaub {left} Tage · letzter Urlaub {d.lastVacation !== undefined ? formatDate(d.lastVacation) : '–'}
          </div>
          <div className="row mt">
            <input className="input" type="number" min={1} max={left} style={{ width: 80 }} value={days} onChange={(e) => setDays(Number(e.target.value))} />
            <span>Tage</span>
            <button className="btn" disabled={!available || days < 1 || days > left} onClick={() => sendCommand({ type: 'sendVacation', driverId: d.id, days })}>In den Urlaub schicken</button>
          </div>
          <small className="dim">Lange ohne Urlaub sinkt die Zufriedenheit. Während des Urlaubs ist der Fahrer nicht disponierbar.</small>

          <div className="card-title mt"><GraduationCap size={15} /> Schulungen</div>
          <div className="list">
            {(Object.keys(COURSES) as TrainingCourse[]).map((k) => {
              const c = COURSES[k];
              const has = c.qualification ? d.qualifications.includes(c.qualification) : false;
              const blocked = has || (c.minExperience !== undefined && d.experience < c.minExperience);
              return (
                <div key={k} className="list-item" style={{ alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <b>{c.name}</b> <span className="dim">· {c.days} Tag{c.days > 1 ? 'e' : ''} · <Money value={c.cost} /></span>
                    <div className="dim" style={{ fontSize: 12 }}>{has ? 'bereits vorhanden' : c.text}{c.minExperience && !has ? ` (ab Erfahrung ${c.minExperience})` : ''}</div>
                  </div>
                  <button className="btn small" disabled={!available || blocked} onClick={() => sendCommand({ type: 'trainDriver', driverId: d.id, course: k })}>Anmelden</button>
                </div>
              );
            })}
          </div>
          {!available && <div className="dim mt" style={{ fontSize: 12 }}>Urlaub und Schulungen nur, wenn der Fahrer frei ist (nicht unterwegs, krank oder abwesend).</div>}

          <div className="card-title mt"><Briefcase size={15} /> Beförderung ins Büro</div>
          <div className="row">
            <select className="input" style={{ width: 'auto' }} value={dept} onChange={(e) => setDept(e.target.value as Department)}>
              {(Object.keys(DEPARTMENTS) as Department[]).map((k) => <option key={k} value={k}>{DEPARTMENTS[k].name}</option>)}
            </select>
            <button
              className="btn"
              disabled={!available || d.experience < PROMOTION_MIN_EXPERIENCE || seats.used >= seats.total}
              onClick={async () => (await askConfirm(`${d.name} in die ${DEPARTMENTS[dept].name} befördern? ${d.name} fährt danach nicht mehr.`, { title: 'Befördern?', confirmLabel: 'Befördern' })) && sendCommand({ type: 'promoteDriver', driverId: d.id, dept }).then((r) => r.ok && onClose())}
            >
              Befördern
            </button>
          </div>
          <small className="dim">
            Ab Erfahrung {PROMOTION_MIN_EXPERIENCE} ({d.experience} vorhanden), braucht einen freien Büroarbeitsplatz ({seats.total - seats.used} frei). Keine Einstellungskosten, +8 % Gehalt.
          </small>
        </div>
      </div>
      <div className="card-title mt">Personalereignisse</div>
      <div className="list" style={{ maxHeight: 140, overflow: 'auto' }}>
        {s.log.filter((l) => l.ref?.kind === 'driver' && l.ref.id === d.id).slice(-8).reverse().map((l) => (
          <div key={l.id} className="list-item"><time>{formatDateTime(l.t).slice(3)}</time>{l.text}</div>
        ))}
      </div>
    </Modal>
  );
}
