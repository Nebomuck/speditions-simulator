// Branchenblatt: wöchentliche Ausgabe (Dashboard-Karte mit der neuesten, Archiv unter Markt & Wettbewerb).

import { useState } from 'react';
import { Building2, CloudLightning, Fuel, Newspaper, Snowflake, Swords, TrendingUp, UserRound } from 'lucide-react';
import { NEWS_NAME, formatDate, type NewsIssue, type NewsKind } from '@spedsim/core';
import { navigate, setUi, useGame } from '../game/store.ts';
import { Card, Empty } from './components.tsx';

const KIND_ICON: Record<NewsKind, typeof Newspaper> = {
  market: TrendingUp, diesel: Fuel, rivals: Swords, weather: CloudLightning, season: Snowflake, company: Building2, driver: UserRound,
};

const readKey = (seed: number) => `cargovia.newsRead.${seed}`;
function readNo(seed: number): number {
  try {
    return Number(localStorage.getItem(readKey(seed)) ?? 0);
  } catch {
    return 0;
  }
}
function markRead(seed: number, no: number) {
  try {
    localStorage.setItem(readKey(seed), String(no));
  } catch {
    /* ohne Speicher bleibt die Ausgabe einfach „neu“ */
  }
}

function Issue({ issue, compact }: { issue: NewsIssue; compact?: boolean }) {
  // der Aufmacher steht als Schlagzeile mit Vorspann oben, der Rest in Spalten
  const lead = issue.items[0]?.title === issue.headline ? issue.items[0] : undefined;
  const rest = lead ? issue.items.slice(1) : issue.items;
  const items = compact ? rest.slice(0, 4) : rest;
  return (
    <div className="news-issue">
      <div className="news-masthead">
        <span className="news-name">{NEWS_NAME}</span>
        <span className="dim">Ausgabe {issue.no} · {formatDate(issue.t)}</span>
      </div>
      <h3 className="news-headline">{issue.headline}</h3>
      {lead && <p className="news-lead">{lead.text}</p>}
      <div className={`news-items${compact ? ' compact' : ''}`}>
        {items.map((it, i) => {
          const Icon = KIND_ICON[it.kind];
          return (
            <article key={i} className={`news-item ${it.tone}`}>
              <h4><Icon size={13} />{it.title}</h4>
              <p>{it.text}</p>
            </article>
          );
        })}
      </div>
    </div>
  );
}

/** Dashboard: neueste Ausgabe (gekürzt) */
export function NewsCard() {
  const s = useGame();
  const issue = s.news?.issues[0];
  if (!issue) return null;
  const unread = issue.no > readNo(s.seed);
  return (
    <Card
      title={<><Newspaper size={15} /> {NEWS_NAME}{unread && <span className="badge info" style={{ marginLeft: 6 }}>neu</span>}</>}
      className="mb news-card"
      actions={<button className="btn small" onClick={() => { markRead(s.seed, issue.no); setUi({ marketTab: 'news' }); navigate('market'); }}>Ganze Ausgabe</button>}
    >
      <Issue issue={issue} compact />
    </Card>
  );
}

/** Markt & Wettbewerb → Branchenblatt: alle aufbewahrten Ausgaben */
export function NewsArchive() {
  const s = useGame();
  const issues = s.news?.issues ?? [];
  const [no, setNo] = useState(issues[0]?.no);
  const issue = issues.find((x) => x.no === no) ?? issues[0];
  if (issue && issue.no > readNo(s.seed)) markRead(s.seed, issue.no);
  if (!issue) return <Card><Empty>Die erste Ausgabe des {NEWS_NAME}s erscheint am nächsten Montag.</Empty></Card>;
  return (
    <div className="grid news-archive" style={{ gridTemplateColumns: '1fr 220px' }}>
      <Card><Issue issue={issue} /></Card>
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
