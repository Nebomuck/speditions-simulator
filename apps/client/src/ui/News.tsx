// Branchenblatt: wöchentliche Zeitung. Montags öffnet die neue Ausgabe als Popup (Einzelspiel hält dafür an),
// im Dashboard steht ein Anriss, unter Markt & Wettbewerb das Archiv.

import { useEffect, useState } from 'react';
import { Building2, CloudLightning, Fuel, Newspaper as NewspaperIcon, Snowflake, Swords, TrendingUp, UserRound, X } from 'lucide-react';
import { MONTH_NAMES, NEWS_NAME, WEEKDAY_NAMES, formatDate, formatMoney, liveryOf, toDate, weekday, type GameState, type NewsIssue, type NewsItem, type NewsKind } from '@spedsim/core';
import { getUi, navigate, sendCommand, setUi, useGame, useUi } from '../game/store.ts';
import { Card, Empty } from './components.tsx';
import { CompanyLogo } from './CompanyLogo.tsx';

const KIND_ICON: Record<NewsKind, typeof NewspaperIcon> = {
  market: TrendingUp, diesel: Fuel, rivals: Swords, weather: CloudLightning, season: Snowflake, company: Building2, driver: UserRound,
};
const KIND_RUBRIC: Record<NewsKind, string> = {
  market: 'Wirtschaft', diesel: 'Energie', rivals: 'Unternehmen', weather: 'Verkehr & Wetter', season: 'Ausblick', company: 'Aus den Betrieben', driver: 'Menschen',
};
const CAPTION: Record<NewsKind, string> = {
  market: 'Volle Rampen, knapper Laderaum: Die Konjunktur bestimmt das Frachtaufkommen.',
  diesel: 'Der Blick auf die Zapfsäule gehört für Disponenten zum Tagesgeschäft.',
  rivals: 'Bewegung im Markt: Fuhrparks wechseln den Besitzer.',
  weather: 'Winterdienst und Unwetter bremsen den Fernverkehr.',
  season: 'Saisongeschäft: Die Lager füllen sich.',
  company: 'Auf dem Hof: Disposition im Morgengrauen.',
  driver: 'Lange Strecken, lange Tage: Fahrer sind das Rückgrat der Branche.',
};

// ---------- gelesen / automatisch öffnen (je Spiel, lokal) ----------

const readKey = (seed: number) => `cargovia.newsRead.${seed}`;
const AUTO_KEY = 'cargovia.newsPopup';
function readNo(seed: number): number {
  try {
    return Number(localStorage.getItem(readKey(seed)) ?? 0);
  } catch {
    return 0;
  }
}
function markRead(seed: number, no: number) {
  try {
    if (no > readNo(seed)) localStorage.setItem(readKey(seed), String(no));
  } catch {
    /* ohne Speicher bleibt die Ausgabe einfach „neu“ */
  }
}
function autoOpen(): boolean {
  try {
    return localStorage.getItem(AUTO_KEY) !== 'off';
  } catch {
    return true;
  }
}
function setAutoOpen(on: boolean) {
  try {
    localStorage.setItem(AUTO_KEY, on ? 'on' : 'off');
  } catch {
    /* bleibt beim Standard */
  }
}

// ---------- Hilfen ----------

function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - y0.getTime()) / 86_400_000 + 1) / 7);
}
const longDate = (t: number) => {
  const d = toDate(t);
  return `${WEEKDAY_NAMES[weekday(t)]}, ${d.getUTCDate()}. ${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
const euro = (cents: number) => formatMoney(cents);
const signedPct = (x: number) => `${x > 0 ? '▲' : x < 0 ? '▼' : '■'} ${Math.abs(x * 100).toFixed(1).replace('.', ',')} %`;

/** „Pressefoto“: Rasterbild mit Symbol – passt zum Druck, ohne fremde Bilder */
function PressPhoto({ kind }: { kind: NewsKind }) {
  const Icon = KIND_ICON[kind];
  return (
    <figure className="paper-photo">
      <div className={`paper-photo-img k-${kind}`}>
        <svg className="paper-photo-scene" viewBox="0 0 400 200" preserveAspectRatio="none" aria-hidden>
          <path d="M0 150 L400 120 L400 200 L0 200 Z" className="ground" />
          <path d="M0 175 L400 150" className="lane" />
          <path d="M0 110 Q 80 70 150 100 T 300 80 T 400 90 L400 120 L0 150 Z" className="hills" />
        </svg>
        <Icon size={58} strokeWidth={1.4} />
      </div>
      <figcaption>{CAPTION[kind]} <span>Foto: Archiv</span></figcaption>
    </figure>
  );
}

function Article({ item, size = 'm', dropcap }: { item: NewsItem; size?: 's' | 'm'; dropcap?: boolean }) {
  return (
    <article className={`paper-article ${size} ${item.tone}`}>
      <div className="paper-rubric">{KIND_RUBRIC[item.kind]}</div>
      <h3>{item.title}</h3>
      <p className={dropcap ? 'dropcap' : undefined}>{item.text}</p>
      {size === 'm' && item.more && <p>{item.more}</p>}
    </article>
  );
}

/** Eine Ausgabe im Zeitungslayout */
export function Newspaper({ issue, s }: { issue: NewsIssue; s: GameState }) {
  const lead = issue.items[0];
  const rest = issue.items.slice(1);
  // Kurzmeldungen: die leichtesten drei, wenn genug Stoff da ist
  const briefs = rest.length > 4 ? rest.slice(-3) : [];
  const main = rest.slice(0, rest.length - briefs.length);
  const f = issue.figures;
  const d = toDate(issue.t);
  return (
    <div className="paper">
      <div className="paper-top">
        <span>Nr. {issue.no} · {d.getUTCFullYear()} · KW {isoWeek(d)}</span>
        <span>{longDate(issue.t)}</span>
        <span>2,40 €</span>
      </div>
      <div className="paper-mast">{NEWS_NAME}</div>
      <div className="paper-claim">Die Wochenzeitung für Transport, Spedition und Logistik</div>
      {f && (
        <div className="paper-ticker">
          <span><b>Diesel</b> {(f.diesel / 100).toFixed(3).replace('.', ',')} € <i className={f.dieselChange > 0 ? 'up' : f.dieselChange < 0 ? 'down' : ''}>{signedPct(f.dieselChange)}</i></span>
          <span><b>Konjunktur</b> {Math.round(f.cycle * 100)} · {f.phase}</span>
          {f.leader && <span><b>Marktführer</b> {f.leader.name} ({f.leader.trucks} LKW)</span>}
          <span><b>{s.company.name}</b> Platz {f.rank} von {f.companies}</span>
        </div>
      )}

      {lead && (
        <div className="paper-front">
          <article className={`paper-lead ${lead.tone}`}>
            <div className="paper-rubric">{KIND_RUBRIC[lead.kind]}</div>
            <h1>{issue.headline}</h1>
            <p className="paper-deck">{lead.text}</p>
            <PressPhoto kind={lead.kind} />
            {lead.more && <p className="dropcap">{lead.more}</p>}
            <div className="paper-byline">Von unserer Redaktion</div>
          </article>
          <aside className="paper-side">
            {f && (
              <div className="paper-box">
                <h4>Marktdaten der Woche</h4>
                <table>
                  <tbody>
                    <tr><td>Diesel netto</td><td>{(f.diesel / 100).toFixed(3).replace('.', ',')} €/l</td></tr>
                    <tr><td>zur Vorwoche</td><td className={f.dieselChange > 0 ? 'up' : f.dieselChange < 0 ? 'down' : ''}>{signedPct(f.dieselChange)}</td></tr>
                    <tr><td>Konjunkturindex</td><td>{Math.round(f.cycle * 100)}</td></tr>
                    <tr><td>Speditionen im Markt</td><td>{f.companies}</td></tr>
                  </tbody>
                </table>
              </div>
            )}
            {f && (
              <div className="paper-box company">
                <h4 className="paper-co"><CompanyLogo livery={liveryOf(s)} size={22} />{s.company.name}</h4>
                <table>
                  <tbody>
                    <tr><td>Lieferungen</td><td>{f.deliveries}</td></tr>
                    <tr><td>Umsatz der Woche</td><td>{euro(f.revenue)}</td></tr>
                    <tr><td>Fuhrpark</td><td>{f.fleet} {f.fleet === 1 ? 'Fahrzeug' : 'Fahrzeuge'}</td></tr>
                    <tr><td>Firmenkonto</td><td className={f.balance < 0 ? 'down' : ''}>{euro(f.balance)}</td></tr>
                  </tbody>
                </table>
              </div>
            )}
            {briefs.length > 0 && (
              <div className="paper-briefs">
                <h4>Kurz notiert</h4>
                {briefs.map((b, i) => (
                  <p key={i}><b>{b.title}.</b> {b.text}</p>
                ))}
              </div>
            )}
          </aside>
        </div>
      )}

      {main.length > 0 && (
        <div className="paper-cols">
          {main.map((it, i) => <Article key={i} item={it} dropcap={i === 0} />)}
        </div>
      )}
      <div className="paper-foot">
        <span>{NEWS_NAME} · Fachverlag für Güterverkehr</span>
        <span>Ausgabe {issue.no} · {formatDate(issue.t)}</span>
      </div>
    </div>
  );
}

// ---------- Popup ----------

/** Zeitung als Popup: montags automatisch (neue Ausgabe), sonst über „Lesen“ */
export function NewsPopup() {
  const s = useGame();
  const open = useUi((u) => u.newsOpen);
  const local = useUi((u) => u.host?.mode === 'local');
  const latest = s.news?.issues[0];
  const [auto, setAuto] = useState(autoOpen());
  const [pausedByUs, setPausedByUs] = useState(false);

  // neue Ausgabe erschienen → öffnen (nur einmal je Ausgabe)
  useEffect(() => {
    if (!latest || open) return;
    if (latest.no <= readNo(s.seed) || !autoOpen()) return;
    markRead(s.seed, latest.no);
    setUi({ newsOpen: latest.no });
    if (local && !s.paused) {
      setPausedByUs(true);
      void sendCommand({ type: 'setPaused', paused: true }, { quiet: true });
    }
  }, [latest?.no]);

  const issue = open ? s.news?.issues.find((x) => x.no === open) : undefined;
  // Esc schließt die Zeitung
  useEffect(() => {
    if (!issue) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  if (!issue) return null;
  function close() {
    if (!issue) return;
    markRead(s.seed, issue.no);
    setUi({ newsOpen: null });
    if (pausedByUs) {
      setPausedByUs(false);
      if (getUi().host?.mode === 'local') void sendCommand({ type: 'setPaused', paused: false }, { quiet: true });
    }
  }
  return (
    <div className="paper-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="paper-sheet" role="dialog" aria-label={`${NEWS_NAME} Ausgabe ${issue.no}`}>
        <button className="paper-close" onClick={close} title="Schließen (Esc)"><X size={18} /></button>
        <div className="paper-scroll">
          <Newspaper issue={issue} s={s} />
        </div>
        <div className="paper-actions">
          <label className="dim">
            <input type="checkbox" checked={auto} onChange={(e) => { setAuto(e.target.checked); setAutoOpen(e.target.checked); }} />
            Neue Ausgabe montags automatisch öffnen
          </label>
          <div className="spacer" />
          <button className="btn" onClick={() => { close(); setUi({ marketTab: 'news' }); navigate('market'); }}>Archiv</button>
          <button className="btn primary" onClick={close}>{pausedByUs ? 'Weiterspielen' : 'Schließen'}</button>
        </div>
      </div>
    </div>
  );
}

// ---------- Dashboard und Archiv ----------

/** Dashboard: Anriss der neuesten Ausgabe */
export function NewsCard() {
  const s = useGame();
  const issue = s.news?.issues[0];
  if (!issue) return null;
  const unread = issue.no > readNo(s.seed);
  const lead = issue.items[0];
  return (
    <Card
      title={<><NewspaperIcon size={15} /> {NEWS_NAME}{unread && <span className="badge info" style={{ marginLeft: 6 }}>neu</span>}</>}
      sub={`Ausgabe ${issue.no} · ${formatDate(issue.t)}`}
      className="news-card"
      actions={<button className="btn small primary" onClick={() => setUi({ newsOpen: issue.no })}>Zeitung lesen</button>}
    >
      <div className="news-teaser" onClick={() => setUi({ newsOpen: issue.no })}>
        <div className="paper-rubric">{lead ? KIND_RUBRIC[lead.kind] : 'Branche'}</div>
        <h3>{issue.headline}</h3>
        {lead && <p>{lead.text}</p>}
        <ul>
          {issue.items.slice(1, 5).map((it, i) => <li key={i}>{it.title}</li>)}
        </ul>
      </div>
    </Card>
  );
}

/** Markt & Wettbewerb → Branchenblatt: alle aufbewahrten Ausgaben */
export function NewsArchive() {
  const s = useGame();
  const issues = s.news?.issues ?? [];
  const [no, setNo] = useState(issues[0]?.no);
  const issue = issues.find((x) => x.no === no) ?? issues[0];
  useEffect(() => {
    if (issue) markRead(s.seed, issue.no);
  }, [issue?.no]);
  if (!issue) return <Card><Empty>Die erste Ausgabe des {NEWS_NAME}s erscheint am nächsten Montag.</Empty></Card>;
  return (
    <div className="grid news-archive" style={{ gridTemplateColumns: '1fr 220px' }}>
      <div className="paper-inline"><Newspaper issue={issue} s={s} /></div>
      <Card title="Ausgaben">
        <div className="list">
          {issues.map((x) => (
            <button key={x.no} className={`list-item news-pick${x.no === issue.no ? ' active' : ''}`} onClick={() => setNo(x.no)}>
              <b>Nr. {x.no}</b>
              <span className="dim">{formatDate(x.t)}</span>
              <span className="ellipsis">{x.headline}</span>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
