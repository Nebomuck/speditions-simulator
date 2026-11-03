// Markt & Wettbewerb: Konjunktur, regionale Nachfrage, Wetter und Fahrverbote je Land, KI-Konkurrenz, Ereignisse.

import { useState } from 'react';
import { TrendingUp, Map as MapIcon, Swords, Zap, Sun, CloudRain, CloudFog, Snowflake, ThermometerSnowflake, Wind, ThermometerSun, Ban } from 'lucide-react';
import {
  BAN_RULES, CITY_BY_ID, COUNTRIES, PHASE_LABEL, STRATEGY_LABEL, WEATHER, activeCompetitors, banUntil, competitionPressure, competitorShare, formatDateTime,
  regionFactor, weatherIn, type GameState, type WeatherKind, type WorldEvent,
} from '@spedsim/core';
import { useGame } from '../game/store.ts';
import { Badge, Bar, Card, Empty, LineChart, Money, PageHeader, Stat } from '../ui/components.tsx';
import { cityName, countryName } from '../ui/format.ts';

type Tab = 'overview' | 'regions' | 'competition' | 'events';

export const WEATHER_ICON: Record<WeatherKind, typeof Sun> = { clear: Sun, rain: CloudRain, fog: CloudFog, snow: Snowflake, ice: ThermometerSnowflake, storm: Wind, heat: ThermometerSun };

const pct = (f: number) => `${f >= 1 ? '+' : '−'}${Math.abs(Math.round((f - 1) * 100))} %`;
const CAT: Record<WorldEvent['category'], string> = { transport: 'Transport', company: 'Firma', market: 'Markt', private: 'Privat' };

export function MarketPage() {
  const s = useGame();
  const [tab, setTab] = useState<Tab>('overview');
  const tabs: { id: Tab; label: string; icon: typeof Sun }[] = [
    { id: 'overview', label: 'Überblick', icon: TrendingUp },
    { id: 'regions', label: 'Regionen & Wetter', icon: MapIcon },
    { id: 'competition', label: 'Konkurrenz', icon: Swords },
    { id: 'events', label: 'Ereignisse', icon: Zap },
  ];
  return (
    <div className="page">
      <PageHeader title="Markt & Wettbewerb" subtitle={`${PHASE_LABEL[s.economy.phase]} · ${activeCompetitors(s).length} Konkurrenten im Markt`} />
      <div className="tabs">
        {tabs.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}><t.icon size={15} />{t.label}</button>
        ))}
      </div>
      {tab === 'overview' && <Overview />}
      {tab === 'regions' && <Regions />}
      {tab === 'competition' && <Competition />}
      {tab === 'events' && <Events />}
    </div>
  );
}

function EventList({ events }: { events: WorldEvent[] }) {
  if (!events.length) return <Empty>Noch keine Ereignisse.</Empty>;
  return (
    <div className="list">
      {events.map((e, i) => (
        <div key={`${e.t}-${i}`} className="list-item">
          <time>{formatDateTime(e.t).slice(3)}</time>
          <Badge kind={e.tone === 'good' ? 'success' : e.tone === 'bad' ? 'warning' : ''}>{CAT[e.category]}</Badge>
          <span><b>{e.title}:</b> {e.text}</span>
        </div>
      ))}
    </div>
  );
}

function Overview() {
  const s = useGame();
  const e = s.economy;
  const hqCountry = countryOf(s.company.hqCityId);
  return (
    <>
      <div className="grid grid-4 mb">
        <Stat label="Konjunktur" value={<Badge kind={e.phase === 'crisis' ? 'danger' : e.phase === 'boom' ? 'success' : 'info'}>{PHASE_LABEL[e.phase]}</Badge>} hint={`Index ${Math.round(e.cycle * 100)}${e.phase !== 'normal' ? ` · bis ca. ${formatDateTime(e.phaseUntil).slice(3, 13)}` : ''}`} icon={<TrendingUp size={15} />} />
        <Stat label="Transportnachfrage" value={`${Math.round(s.market.demand * 100)} %`} hint="Saison × Konjunktur" />
        <Stat label="Diesel (netto)" value={`${(s.market.diesel / 100).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €/l`} hint="beeinflusst Kosten und Frachtzuschläge" />
        <Stat label={`Konkurrenzdruck ${countryName(hqCountry)}`} value={`${Math.round(competitionPressure(s, hqCountry) * 100)} %`} hint="drückt die Frachtraten um bis zu 4 %" icon={<Swords size={15} />} />
      </div>
      <div className="grid grid-2">
        <Card title="Dieselpreis (letzte 180 Tage)">
          <LineChart series={[{ label: 'Diesel', color: 'var(--accent)', values: s.market.dieselHistory.map((d) => d.v) }]} height={180} format={(v) => `${(v / 100).toFixed(2)} €`} />
        </Card>
        <Card title="Aktuelle Ereignisse">
          <EventList events={[...s.events.history].reverse().slice(0, 8)} />
        </Card>
      </div>
      <p className="dim mt" style={{ fontSize: 12.5 }}>
        Konjunktur, regionale Nachfrage und Konkurrenz wirken auf Anzahl, Herkunft und Preis der Aufträge in der Börse. In einer Krise zahlen Kunden außerdem schleppender.
      </p>
    </>
  );
}

const countryOf = (cityId: string) => CITY_BY_ID[cityId]?.country ?? 'DE';

function ownCountries(s: GameState): Set<string> {
  const set = new Set<string>();
  for (const l of s.company.locations) set.add(countryOf(l.cityId));
  for (const v of Object.values(s.vehicles)) set.add(countryOf(v.cityId));
  return set;
}

function Regions() {
  const s = useGame();
  const own = ownCountries(s);
  const list = [...COUNTRIES].sort((a, b) => Number(own.has(b)) - Number(own.has(a)) || countryName(a).localeCompare(countryName(b)));
  return (
    <Card title="Regionen" sub="Nachfrage, Wetter und Fahrverbote je Land – deine Länder zuerst">
      <div className="table-wrap" style={{ border: 'none', maxHeight: 'calc(100vh - 250px)' }}>
        <table className="table">
          <thead>
            <tr><th>Land</th><th>Nachfrage</th><th>Grund</th><th>Wetter</th><th>Fahrverbot</th><th>Konkurrenzdruck</th></tr>
          </thead>
          <tbody>
            {list.map((c) => {
              const f = regionFactor(s, c);
              const r = s.economy.regions[c];
              const wk = weatherIn(s, c);
              const w = s.weather[c];
              const Icon = WEATHER_ICON[wk];
              const ban = banUntil(c, s.time);
              return (
                <tr key={c}>
                  <td><b>{countryName(c)}</b> {own.has(c) && <Badge kind="info">aktiv</Badge>}</td>
                  <td><Badge kind={f > 1.08 ? 'success' : f < 0.92 ? 'warning' : ''}>{pct(f)}</Badge></td>
                  <td className="dim">{r?.reason ? `${r.reason}${r.until ? ` bis ${formatDateTime(r.until).slice(3, 9)}` : ''}` : '–'}</td>
                  <td>
                    <span className="row" style={{ gap: 6 }}>
                      <Icon size={15} style={{ color: wk === 'clear' ? 'var(--warning)' : WEATHER[wk].risk >= 2.5 ? 'var(--danger)' : 'var(--text-2)' }} />
                      {WEATHER[wk].name}
                      {WEATHER[wk].speed < 1 && <span className="dim">({pct(WEATHER[wk].speed)} Tempo)</span>}
                    </span>
                    {w && <div className="dim" style={{ fontSize: 11.5 }}>bis {formatDateTime(w.until).slice(3)}</div>}
                  </td>
                  <td title={BAN_RULES[c] ?? 'kein generelles LKW-Fahrverbot'}>
                    {ban !== null ? <Badge kind="danger"><Ban size={11} />bis {formatDateTime(ban).slice(3)}</Badge> : BAN_RULES[c] ? <span className="dim" style={{ fontSize: 12 }}>{BAN_RULES[c]}</span> : <span className="dim">–</span>}
                  </td>
                  <td><div className="row"><Bar value={competitionPressure(s, c) * 100} invert />{Math.round(competitionPressure(s, c) * 100)} %</div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="dim" style={{ fontSize: 12.5, marginBottom: 0 }}>
        Fahrverbote gelten für LKW über 7,5 t; Transporter, leichte Solo-LKW und beladene Kühltransporte (Frischdienst) sind ausgenommen.
        An Grenzen zu Ländern außerhalb der EU (Schweiz, Norwegen, Großbritannien, Westbalkan) wird kontrolliert und verzollt.
      </p>
    </Card>
  );
}

function Competition() {
  const s = useGame();
  const comps = Object.values(s.competitors).sort((a, b) => Number(a.status === 'bankrupt') - Number(b.status === 'bankrupt') || b.trucks - a.trucks);
  const lostBy = (id: string) => Object.values(s.customers).filter((c) => c.lostTo === id).length;
  return (
    <Card title="KI-Speditionen" sub="Sie übernehmen Aufträge aus der Börse im Umkreis ihrer Standorte, wachsen mit Gewinn und können in Konkurs gehen.">
      <div className="table-wrap" style={{ border: 'none' }}>
        <table className="table">
          <thead>
            <tr><th>Spedition</th><th>Strategie</th><th>Standorte</th><th className="num">LKW</th><th>Ruf</th><th>Preise</th><th className="num">Aufträge (lfd. Monat)</th><th className="num">Anteil</th><th className="num">Ergebnis (Vormonat)</th><th>Status</th></tr>
          </thead>
          <tbody>
            <tr style={{ background: 'var(--accent-soft)' }}>
              <td><b>{s.company.name}</b> <Badge kind="info">Du</Badge></td>
              <td>–</td>
              <td>{s.company.locations.map((l) => cityName(l.cityId)).join(', ')}</td>
              <td className="num">{Object.keys(s.vehicles).length}</td>
              <td><div className="row"><Bar value={s.company.reputation} />{Math.round(s.company.reputation)}</div></td>
              <td>Markt</td>
              <td className="num">–</td>
              <td className="num">–</td>
              <td className="num">–</td>
              <td>–</td>
            </tr>
            {comps.map((c) => (
              <tr key={c.id} style={c.status === 'bankrupt' ? { opacity: 0.5 } : undefined}>
                <td><b>{c.name}</b>{lostBy(c.id) > 0 && <div className="dim" style={{ fontSize: 11.5 }}>{lostBy(c.id)} deiner Kunden</div>}</td>
                <td>{STRATEGY_LABEL[c.strategy]}</td>
                <td>{c.cityIds.map(cityName).join(', ')}</td>
                <td className="num">{c.trucks}</td>
                <td><div className="row"><Bar value={c.reputation} />{Math.round(c.reputation)}</div></td>
                <td>{c.priceLevel === 1 ? 'Markt' : pct(c.priceLevel)}</td>
                <td className="num" title={`Vormonat: ${c.lastMonth.orders}`}>{c.month.orders}</td>
                <td className="num">{c.status === 'bankrupt' ? '–' : `${Math.round(competitorShare(s, c) * 100)} %`}</td>
                <td className="num">{c.lastMonth.revenue || c.lastMonth.costs ? <Money value={c.lastMonth.revenue - c.lastMonth.costs} colored /> : '–'}</td>
                <td><Badge kind={c.status === 'bankrupt' ? 'danger' : c.status === 'trouble' ? 'warning' : 'success'}>{c.status === 'bankrupt' ? 'Konkurs' : c.status === 'trouble' ? 'Schwierigkeiten' : 'aktiv'}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="dim" style={{ fontSize: 12.5, marginBottom: 0 }}>
        Angebote stehen zuerst 90 Minuten nur dir zur Verfügung; ein eigener Vertrieb hält sie länger zurück. Unzufriedene Kunden (unter 40 %) können zur Konkurrenz wechseln –
        unter „Kunden &amp; Verträge“ lassen sie sich mit einem Vertriebsbesuch zurückgewinnen.
      </p>
    </Card>
  );
}

function Events() {
  const s = useGame();
  const [cat, setCat] = useState<'' | WorldEvent['category']>('');
  const list = [...s.events.history].reverse().filter((e) => !cat || e.category === cat);
  return (
    <Card
      title="Ereignisse"
      sub="Ausgelöst durch ein Regelwerk mit Abklingzeiten; negative Ereignisse höchstens alle 4 Tage und nicht, solange das Firmenkonto im Minus ist."
      actions={
        <select className="input" style={{ width: 150, padding: '4px 8px' }} value={cat} onChange={(e) => setCat(e.target.value as typeof cat)}>
          <option value="">Alle Bereiche</option>
          {Object.entries(CAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      }
    >
      <EventList events={list} />
    </Card>
  );
}
