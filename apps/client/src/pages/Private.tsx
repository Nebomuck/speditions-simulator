// Privatleben: Charakter und Bedürfnisse, Work-Life-Balance, Freizeit und Urlaub, Wohnen und Besitz,
// Beziehungen, persönliche Entwicklung und Privatkonto. Privat- und Firmenvermögen sind strikt getrennt.

import { Fragment, useState } from 'react';
import { Home, Heart, Briefcase, Palmtree, Car, Sofa, Target, Wallet, Users, GraduationCap, Baby, Gift } from 'lucide-react';
import {
  ACTIVITIES, BACKGROUNDS, CAR_RESALE, FAMILY_MIN_CLOSENESS, FURNITURE_LEVELS, HOBBIES, HOLIDAY_HOME, HOMES, HOME_ORDER, LIFE_GOALS, MORTGAGE, MOVING_COST,
  DIVIDEND_TAX, PRIVATE_CARS, PROPERTY_SALE_FACTOR, PROPOSE_MIN_CLOSENESS, VACATIONS, WORK_STYLES, annuity, comfort, formatDate, formatDateTime, goalDone, isAway,
  monthlyPrivateCosts, performance, privateWealth, type Character, type HomeKind, type LifeAction, type WorkStyle,
} from '@spedsim/core';
import { sendCommand, useGame, useUi } from '../game/store.ts';
import { Avatar, Badge, Bar, Card, Money, PageHeader } from '../ui/components.tsx';
import { cityName } from '../ui/format.ts';

const NEED_LABEL = { energy: 'Energie', hunger: 'Sättigung', stress: 'Stress', health: 'Gesundheit', happiness: 'Zufriedenheit', social: 'Soziale Kontakte', leisure: 'Freizeit' };
const SKILL_LABEL: Record<keyof Character['skills'], string> = { negotiation: 'Verhandlung', leadership: 'Mitarbeiterführung', logistics: 'Logistikplanung' };
const SKILL_TEXT: Record<keyof Character['skills'], string> = {
  negotiation: 'bessere Frachtpreise in der Börse (bis +4 %)',
  leadership: 'zufriedenere Fahrer',
  logistics: 'du disponierst selbst mehr Fahrzeuge',
};

type Tab = 'overview' | 'leisure' | 'home' | 'relations' | 'growth' | 'account';

const life = (action: LifeAction) => sendCommand({ type: 'life', action });

export function PrivatePage() {
  const s = useGame();
  const pid = useUi((u) => u.playerId);
  const [tab, setTab] = useState<Tab>('overview');
  const me = s.players[pid];
  if (!me) return null;
  const c = me.character;
  const away = isAway(s, c);
  const tabs: { id: Tab; label: string; icon: typeof Home }[] = [
    { id: 'overview', label: 'Überblick', icon: Heart },
    { id: 'leisure', label: 'Freizeit & Urlaub', icon: Palmtree },
    { id: 'home', label: 'Wohnen & Besitz', icon: Home },
    { id: 'relations', label: 'Beziehungen', icon: Users },
    { id: 'growth', label: 'Entwicklung & Ziele', icon: Target },
    { id: 'account', label: 'Privatkonto', icon: Wallet },
  ];
  return (
    <div className="page">
      <PageHeader
        title="Privatleben"
        subtitle={
          <>
            {c.name}, {c.age} Jahre · {HOMES[c.home].name} in {cityName(s.company.hqCityId)} · Privatkonto <Money value={c.privateAccount.balance} colored />
            {away && <> · <Badge kind="warning">{c.sickUntil && s.time < c.sickUntil ? `krank bis ${formatDate(c.sickUntil)}` : `${c.activity!.text} bis ${formatDateTime(c.activity!.until)}`}</Badge></>}
          </>
        }
      />
      <div className="tabs">
        {tabs.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}><t.icon size={15} />{t.label}</button>
        ))}
      </div>
      {tab === 'overview' && <Overview c={c} />}
      {tab === 'leisure' && <Leisure c={c} />}
      {tab === 'home' && <Possessions c={c} />}
      {tab === 'relations' && <Relations c={c} />}
      {tab === 'growth' && <Growth c={c} />}
      {tab === 'account' && <Account pid={pid} c={c} />}
    </div>
  );
}

function Overview({ c }: { c: Character }) {
  const s = useGame();
  const perf = performance(c);
  return (
    <div className="grid grid-2">
      <Card title="Befinden">
        <div className="row" style={{ gap: 14 }}>
          <Avatar avatar={c.avatar} size={72} />
          <div>
            <div style={{ fontSize: 18, fontWeight: 650 }}>{c.name}</div>
            <div className="dim">{BACKGROUNDS[c.background]?.name} · Geschäftsführung {s.company.name}</div>
            <div className="row mt"><Briefcase size={15} /> Leistungsfähigkeit <b>{Math.round(perf * 100)} %</b></div>
          </div>
        </div>
        <div className="mt">
          {Object.entries(c.needs).map(([k, v]) => (
            <div key={k} className="row" style={{ marginBottom: 6 }}>
              <span style={{ width: 130 }} className="muted">{NEED_LABEL[k as keyof typeof NEED_LABEL]}</span>
              <div style={{ flex: 1 }}><Bar value={v} invert={k === 'stress'} /></div>
              <span className="dim" style={{ width: 28, textAlign: 'right' }}>{Math.round(v)}</span>
            </div>
          ))}
        </div>
        <p className="dim" style={{ fontSize: 12.5, marginBottom: 0 }}>
          Lange Arbeitstage kosten Energie und erzeugen Stress, Geldsorgen und eine überlastete Disposition ebenso. Hält der Stress über 90 an, fällt {c.name} eine Woche aus.
          Freizeit, Freundschaften, eine gemütliche Wohnung und Urlaub gleichen aus.
        </p>
      </Card>
      <Card title={<><Briefcase size={16} /> Work-Life-Balance</>} sub="Wie viel arbeitest du selbst?">
        <div className="list">
          {(Object.keys(WORK_STYLES) as WorkStyle[]).map((k) => {
            const w = WORK_STYLES[k];
            const active = c.workStyle === k;
            return (
              <div key={k} className={`pick ${active ? 'active' : ''}`} onClick={() => !active && life({ kind: 'workStyle', style: k })}>
                <div style={{ flex: 1 }}>
                  <b>{w.name}</b> <span className="dim">· {w.hours} h/Tag · disponiert selbst bis {w.managed} Fahrzeuge</span>
                  <div className="dim" style={{ fontSize: 12 }}>{w.text}</div>
                </div>
                {active && <Badge kind="success">aktiv</Badge>}
              </div>
            );
          })}
        </div>
        <p className="dim" style={{ fontSize: 12.5, marginBottom: 0 }}>
          Fahrzeuge, die weder du noch ein Disponent betreut, machen die Fahrer unzufrieden. Während Urlaub, Aktivitäten oder Krankheit disponierst du nicht.
        </p>
      </Card>
    </div>
  );
}

function Leisure({ c }: { c: Character }) {
  const [skill, setSkill] = useState<keyof Character['skills']>('negotiation');
  const [atHoliday, setAtHoliday] = useState(false);
  return (
    <div className="grid grid-2">
      <Card title={<><Palmtree size={16} /> Freizeit</>} sub="Kostet Privatgeld und Zeit – in dieser Zeit disponierst du nicht.">
        <div className="list">
          {Object.entries(ACTIVITIES).map(([k, a]) => (
            <div key={k} className="list-item" style={{ alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <b>{a.name}</b> <span className="dim">· {a.hours} h · <Money value={a.cost} /></span>
                <div className="dim" style={{ fontSize: 12 }}>
                  {a.text}
                  {k === 'hobby' && (c.hobby ? ` · ${HOBBIES[c.hobby.id]} (Stufe ${c.hobby.level})` : ' · erst unter „Entwicklung“ ein Hobby wählen')}
                </div>
              </div>
              {k === 'course' && (
                <select className="input" style={{ width: 'auto' }} value={skill} onChange={(e) => setSkill(e.target.value as keyof Character['skills'])}>
                  {(Object.keys(SKILL_LABEL) as (keyof Character['skills'])[]).map((x) => <option key={x} value={x}>{SKILL_LABEL[x]}</option>)}
                </select>
              )}
              <button className="btn small" disabled={k === 'hobby' && !c.hobby} onClick={() => life({ kind: 'activity', activity: k, ...(k === 'course' ? { skill } : {}) })}>Los</button>
            </div>
          ))}
        </div>
        <p className="dim" style={{ fontSize: 12, marginBottom: 0 }}>Dieselbe Aktivität innerhalb von 24 Stunden wirkt nur halb so stark.</p>
      </Card>
      <Card title="Urlaub" sub="Baut Stress stark ab – ohne Disponenten bleibt die Disposition aber liegen.">
        {c.holidayHome && (
          <label className="row mb" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={atHoliday} onChange={(e) => setAtHoliday(e.target.checked)} /> im eigenen Ferienhaus (70 % günstiger)
          </label>
        )}
        <div className="list">
          {Object.entries(VACATIONS).map(([k, v]) => (
            <div key={k} className="list-item" style={{ alignItems: 'center' }}>
              <div style={{ flex: 1 }}><b>{v.name}</b> <span className="dim">· {v.days} Tage · <Money value={Math.round(v.cost * (atHoliday ? 0.3 : 1))} /></span></div>
              <button className="btn small primary" onClick={() => life({ kind: 'vacation', vacation: k, holidayHome: atHoliday })}>Buchen</button>
            </div>
          ))}
        </div>
        {c.relations.some((r) => r.kind === 'partner') && <p className="dim" style={{ fontSize: 12.5 }}>Gemeinsamer Urlaub stärkt eure Beziehung.</p>}
      </Card>
    </div>
  );
}

function Possessions({ c }: { c: Character }) {
  const [mortgage, setMortgage] = useState(true);
  const old = HOMES[c.home];
  const proceeds = old.price ? Math.round(old.price * PROPERTY_SALE_FACTOR) - (c.mortgage?.remaining ?? 0) : 0;
  const nextFurniture = FURNITURE_LEVELS[(c.furniture ?? 0) + 1];
  return (
    <div className="grid grid-2">
      <Card title={<><Home size={16} /> Wohnen</>} sub={`Wohnkomfort ${comfort(c)}`}>
        <label className="row mb" style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={mortgage} onChange={(e) => setMortgage(e.target.checked)} /> Kauf mit Immobilienkredit ({MORTGAGE.downPayment * 100} % Eigenkapital, {(MORTGAGE.ratePa * 100).toFixed(1).replace('.', ',')} %, {MORTGAGE.months / 12} Jahre)
        </label>
        <div className="list">
          {HOME_ORDER.map((k: HomeKind) => {
            const h = HOMES[k];
            const here = c.home === k;
            const rate = h.price ? annuity(Math.round(h.price * (1 - MORTGAGE.downPayment)), MORTGAGE.ratePa, MORTGAGE.months) : 0;
            return (
              <div key={k} className="list-item" style={{ alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <b>{h.name}</b> <span className="dim">· Komfort +{h.comfort}</span>
                  <div className="dim" style={{ fontSize: 12 }}>
                    {h.rent ? <>Miete <Money value={h.rent} />/Monat</> : <>Kaufpreis <Money value={h.price!} /> · Nebenkosten <Money value={h.upkeep!} />/Monat{mortgage && <> · Rate ca. <Money value={rate} />/Monat</>}</>}
                  </div>
                </div>
                {here ? <Badge kind="success">dein Zuhause</Badge> : (
                  <button
                    className="btn small"
                    onClick={() => confirm(`Umziehen in: ${h.name}? Umzug ${(MOVING_COST / 100).toLocaleString('de-DE')} €${old.price ? `, Verkauf der bisherigen Immobilie (Erlös nach Kredit ca. ${Math.round(proceeds / 100).toLocaleString('de-DE')} €)` : ''}.`) && life({ kind: 'moveHome', home: k, mortgage: !!h.price && mortgage })}
                  >
                    {h.price ? 'Kaufen' : 'Mieten'}
                  </button>
                )}
              </div>
            );
          })}
          <div className="list-item" style={{ alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <b>{HOLIDAY_HOME.name}</b> <span className="dim">· günstiger Urlaub, mehr Zufriedenheit</span>
              <div className="dim" style={{ fontSize: 12 }}>Kaufpreis <Money value={HOLIDAY_HOME.price} /> · Nebenkosten <Money value={HOLIDAY_HOME.upkeep} />/Monat</div>
            </div>
            <button className="btn small" onClick={() => confirm(c.holidayHome ? 'Ferienhaus verkaufen?' : 'Ferienhaus kaufen?') && life({ kind: 'holidayHome', buy: !c.holidayHome })}>{c.holidayHome ? 'Verkaufen' : 'Kaufen'}</button>
          </div>
        </div>
        {c.mortgage && <p className="dim" style={{ fontSize: 12.5 }}>Immobilienkredit: Rest <Money value={c.mortgage.remaining} />, Rate <Money value={c.mortgage.monthly} />/Monat.</p>}
      </Card>
      <div>
        <Card title={<><Car size={16} /> Privatwagen</>} sub={c.car ? PRIVATE_CARS[c.car].name : 'kein Auto'}>
          <div className="list">
            {Object.entries(PRIVATE_CARS).map(([k, car]) => (
              <div key={k} className="list-item" style={{ alignItems: 'center' }}>
                <div style={{ flex: 1 }}><b>{car.name}</b> <span className="dim">· <Money value={car.price} /> · Unterhalt <Money value={car.upkeep} />/Monat · Zufriedenheit +{car.happiness}</span></div>
                {c.car === k ? (
                  <button className="btn small" onClick={() => confirm(`Für ${Math.round((car.price * CAR_RESALE) / 100).toLocaleString('de-DE')} € verkaufen?`) && life({ kind: 'car', carId: null })}>Verkaufen</button>
                ) : (
                  <button className="btn small" onClick={() => life({ kind: 'car', carId: k })}>Kaufen</button>
                )}
              </div>
            ))}
          </div>
          <p className="dim" style={{ fontSize: 12 }}>Beim Wechsel wird das bisherige Auto zu {CAR_RESALE * 100} % angerechnet.</p>
        </Card>
        <Card title={<><Sofa size={16} /> Einrichtung</>} sub={FURNITURE_LEVELS[c.furniture ?? 0].name} className="mt">
          {nextFurniture ? (
            <button className="btn" onClick={() => life({ kind: 'furniture' })}>{nextFurniture.name} · <Money value={nextFurniture.cost} /></button>
          ) : (
            <span className="dim">Die Einrichtung ist vom Feinsten.</span>
          )}
          <p className="dim" style={{ fontSize: 12, marginBottom: 0 }}>Jede Stufe erhöht den Wohnkomfort (+4): mehr Erholung, weniger Stress.</p>
        </Card>
      </div>
    </div>
  );
}

function Relations({ c }: { c: Character }) {
  const partner = c.relations.find((r) => r.kind === 'partner');
  const order = { partner: 0, child: 1, friend: 2 } as const;
  const list = [...c.relations].sort((a, b) => order[a.kind] - order[b.kind] || b.closeness - a.closeness);
  return (
    <Card title={<><Users size={16} /> Beziehungen</>} sub="Beziehungen brauchen gemeinsame Zeit – ohne Kontakt kühlen sie ab.">
      {list.length === 0 && <div className="empty">Noch keine engeren Kontakte. Unter „Freizeit“ → „Freunde treffen“ lernst du Menschen kennen.</div>}
      <div className="list">
        {list.map((r) => (
          <div key={r.id} className="list-item" style={{ alignItems: 'center' }}>
            {r.kind === 'child' ? <Baby size={16} /> : r.kind === 'partner' ? <Heart size={16} /> : <Users size={16} />}
            <div style={{ flex: 1 }}>
              <b>{r.name}</b> <span className="dim">· {{ friend: 'Freundschaft', partner: 'Partnerschaft', child: 'Kind' }[r.kind]} seit {formatDate(r.since)}{r.cityId ? ` · ${cityName(r.cityId)}` : ''}</span>
              <div className="row" style={{ fontSize: 12 }}><Bar value={r.closeness} /> Nähe {Math.round(r.closeness)} · letzter Kontakt {formatDate(r.lastContact)}</div>
            </div>
            {r.kind !== 'child' && (
              <>
                <button className="btn small" title="Zeit miteinander verbringen (4 h)" onClick={() => life({ kind: 'activity', activity: 'friends', relationId: r.id })}>Treffen</button>
                <button className="btn small" title="Geschenk (120 €)" onClick={() => life({ kind: 'relation', relationId: r.id, action: 'gift' })}><Gift size={13} /></button>
              </>
            )}
            {r.kind === 'friend' && !partner && (
              <button className="btn small" disabled={r.closeness < PROPOSE_MIN_CLOSENESS} title={`ab Nähe ${PROPOSE_MIN_CLOSENESS}`} onClick={() => life({ kind: 'relation', relationId: r.id, action: 'propose' })}>Mehr als Freundschaft?</button>
            )}
            {r.kind === 'partner' && !c.babyDue && (
              <button
                className="btn small"
                disabled={r.closeness < FAMILY_MIN_CLOSENESS || c.home === 'apartment_small'}
                title={c.home === 'apartment_small' ? 'braucht eine größere Wohnung' : `ab Nähe ${FAMILY_MIN_CLOSENESS}`}
                onClick={() => confirm(`Gemeinsam mit ${r.name} eine Familie gründen?`) && life({ kind: 'relation', relationId: r.id, action: 'family' })}
              >
                Familie gründen
              </button>
            )}
          </div>
        ))}
      </div>
      {c.babyDue && <p className="mt"><Baby size={14} /> Nachwuchs erwartet am {formatDate(c.babyDue)}.</p>}
      <p className="dim" style={{ fontSize: 12.5, marginBottom: 0 }}>
        Wer jeden Tag zwölf Stunden arbeitet, hat wenig Zeit für eine Partnerschaft. Gemeinsame Abende (Essen gehen, Kino) und Urlaube stärken sie. Kinder kosten 450 € pro Monat und machen glücklich.
      </p>
    </Card>
  );
}

function Growth({ c }: { c: Character }) {
  const s = useGame();
  const goals = c.goals ?? [];
  return (
    <div className="grid grid-2">
      <Card title={<><GraduationCap size={16} /> Fähigkeiten</>} sub={BACKGROUNDS[c.background]?.text}>
        {(Object.keys(SKILL_LABEL) as (keyof Character['skills'])[]).map((k) => (
          <div key={k} style={{ marginBottom: 10 }}>
            <div className="row"><span style={{ width: 160 }}>{SKILL_LABEL[k]}</span><div style={{ flex: 1 }}><Bar value={c.skills[k]} /></div><b style={{ width: 28, textAlign: 'right' }}>{c.skills[k]}</b></div>
            <div className="dim" style={{ fontSize: 12 }}>{SKILL_TEXT[k]}</div>
          </div>
        ))}
        <p className="dim" style={{ fontSize: 12 }}>Weiterbildungen (Freizeit → Weiterbildung) steigern eine Fähigkeit um 5.</p>
        <div className="card-title mt">Hobby</div>
        <div className="row wrap">
          {Object.entries(HOBBIES).map(([k, name]) => (
            <button key={k} className={`chip ${c.hobby?.id === k ? 'active' : ''}`} onClick={() => life({ kind: 'hobby', hobby: k })}>{name}{c.hobby?.id === k ? ` · Stufe ${c.hobby.level}` : ''}</button>
          ))}
        </div>
      </Card>
      <Card title={<><Target size={16} /> Persönliche Ziele</>} sub="bis zu 4 Ziele – erreichte Ziele machen zufrieden">
        <div className="list">
          {Object.entries(LIFE_GOALS).map(([k, name]) => {
            const chosen = goals.includes(k);
            const done = goalDone(s, c, k);
            return (
              <label key={k} className="list-item" style={{ cursor: 'pointer', alignItems: 'center' }}>
                <input type="checkbox" checked={chosen} onChange={() => life({ kind: 'goals', goals: chosen ? goals.filter((g) => g !== k) : [...goals, k] })} />
                <span style={{ flex: 1 }}>{name}</span>
                {done && <Badge kind="success">erreicht</Badge>}
              </label>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function Account({ pid, c }: { pid: string; c: Character }) {
  const s = useGame();
  const [salary, setSalary] = useState(c.salary / 100);
  const [dividend, setDividend] = useState(5_000);
  const costs = monthlyPrivateCosts(c);
  const total = costs.reduce((a, i) => a + i.amount, 0);
  const ledger = s.ledger.filter((l) => l.account === `private:${pid}`).slice(-40).reverse();
  return (
    <div className="grid grid-2">
      <Card title="Privatkonto">
        <div className="stat"><div className="value"><Money value={c.privateAccount.balance} colored /></div></div>
        <dl className="kv mt">
          <dt>Privatvermögen gesamt</dt><dd><Money value={privateWealth(c)} /></dd>
          <dt>Geschäftsführergehalt</dt><dd><Money value={c.salary} /> / Monat</dd>
          {costs.map((i) => <Fragment key={i.label}><dt>{i.label}</dt><dd><Money value={-i.amount} /></dd></Fragment>)}
          <dt><b>Monatlich übrig</b></dt><dd><b><Money value={c.salary - total} colored /></b></dd>
        </dl>
        <div className="field mt">
          <label>Geschäftsführergehalt festlegen (zahlt die Firma am Monatsersten)</label>
          <div className="row">
            <input className="input" type="number" min={0} max={50000} step={100} value={salary} onChange={(e) => setSalary(Number(e.target.value))} />
            <button className="btn primary" onClick={() => sendCommand({ type: 'setCeoSalary', playerId: pid, salary: Math.round(salary * 100) })}>Übernehmen</button>
          </div>
          <span className="dim" style={{ fontSize: 12 }}>Ein hohes Gehalt erhöht deinen Wohlstand, belastet aber die Liquidität der Firma.</span>
        </div>
        <div className="field mt">
          <label>Gewinnausschüttung (Firmenkonto <Money value={s.company.account.balance} />)</label>
          <div className="row">
            <input className="input" type="number" min={100} step={500} value={dividend} onChange={(e) => setDividend(Number(e.target.value))} />
            <button className="btn" onClick={() => confirm(`${dividend.toLocaleString('de-DE')} € ausschütten? Netto ca. ${Math.round(dividend * (1 - DIVIDEND_TAX)).toLocaleString('de-DE')} € nach Kapitalertragsteuer.`) && sendCommand({ type: 'payDividend', amount: Math.round(dividend * 100) })}>Ausschütten</button>
          </div>
          <span className="dim" style={{ fontSize: 12 }}>Nur aus vorhandenem Guthaben, {(DIVIDEND_TAX * 100).toFixed(3).replace('.', ',')} % Kapitalertragsteuer. Das Geld fehlt danach der Firma.</span>
        </div>
      </Card>
      <Card title="Private Buchungen">
        <div className="list">
          {ledger.length === 0 && <div className="empty">Noch keine Buchungen – Gehalt und Lebenshaltung werden am Monatsersten gebucht.</div>}
          {ledger.map((l, i) => (
            <div key={i} className="list-item"><time>{formatDateTime(l.t).slice(3, 13)}</time><span style={{ flex: 1 }}>{l.text}</span><Money value={l.amount} colored /></div>
          ))}
        </div>
      </Card>
    </div>
  );
}
