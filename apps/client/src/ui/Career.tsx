// Karriere-Kampagne (Paket E4): Kapitelkarte im Dashboard und Nachrichten von Mentorin und Rivale.

import { useEffect } from 'react';
import { Flag, GraduationCap, Lock, Swords } from 'lucide-react';
import { CHAPTERS, FEATURE_CHAPTER, FEATURE_LABEL, MENTOR, campaignGoals, campaignLock, campaignStars, formatDate, type CampaignFeature, type GameState } from '@spedsim/core';
import { sendCommand, useGame } from '../game/store.ts';
import { Badge, Bar, Card } from './components.tsx';

const KEY = 'cargovia.career';

/** Beste Sterne je Kapitel über alle Karrieren (nur in diesem Browser) */
export function careerBest(): Record<number, number> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<number, number>;
  } catch {
    return {};
  }
}

function rememberBest(s: GameState) {
  const results = s.campaign?.results ?? [];
  if (!results.length) return;
  try {
    const best = careerBest();
    let changed = false;
    for (const r of results) if ((best[r.chapter] ?? 0) < r.stars) { best[r.chapter] = r.stars; changed = true; }
    if (changed) localStorage.setItem(KEY, JSON.stringify(best));
  } catch {
    // ohne Speicher nur keine Bestwerte
  }
}

export const starText = (n: number) => '★'.repeat(n) + '☆'.repeat(3 - n);

/** Kapitelkarte im Dashboard; ohne Karriere nichts */
export function CareerCard({ s }: { s: GameState }) {
  const c = s.campaign;
  const resultsLen = c?.results.length ?? 0;
  useEffect(() => rememberBest(s), [resultsLen]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!c) return null;
  if (c.done)
    return (
      <Card title={<><Flag size={15} /> Karriere</>} actions={<Badge kind="success">Geschafft</Badge>}>
        <p className="goal-note" style={{ marginTop: 0 }}>Alle fünf Kapitel geschafft{c.finishedAt ? ` am ${formatDate(c.finishedAt)}` : ''} – {campaignStars(s)} von 15 Sternen.</p>
        <ChapterList s={s} />
        <p className="dim goal-note">Das Spiel läuft als freies Spiel weiter.</p>
      </Card>
    );
  const def = CHAPTERS[c.chapter - 1];
  const left = Math.ceil((c.deadline - s.time) / 1440);
  const half = c.chapterStart + (def.days / 2) * 1440;
  return (
    <Card
      title={<><Flag size={15} /> Kapitel {c.chapter}: {def.title}</>}
      actions={<span className="dim" style={{ fontSize: 12 }}>{campaignStars(s)} ★</span>}
    >
      <p className="dim goal-head">
        Karriere · {left > 0 ? `noch ${left} Tage (bis ${formatDate(c.deadline)})` : 'Frist abgelaufen – höchstens ein Stern'}
        {s.time < half && ` · ★★★ bis ${formatDate(half)}`}
      </p>
      {campaignGoals(s).map((g) => (
        <div key={g.id} className="goal-row">
          <div className="row">
            <span>{g.label}</span>
            <span className="spacer" />
            <span className={g.met ? 'pos' : 'dim'}>{g.have} <span className="dim">/ {g.need}</span></span>
            {g.met && <Badge kind="success">✓</Badge>}
          </div>
          <Bar value={Math.round(g.share * 100)} />
        </div>
      ))}
      <ChapterList s={s} />
    </Card>
  );
}

function ChapterList({ s }: { s: GameState }) {
  const c = s.campaign!;
  return (
    <div className="career-chapters">
      {CHAPTERS.map((ch) => {
        const r = c.results.find((x) => x.chapter === ch.n);
        return (
          <span key={ch.n} className={r ? 'done' : ch.n === c.chapter && !c.done ? 'current' : ''} title={`Kapitel ${ch.n}: ${ch.title}${r ? ` – ${r.days} Tage` : ''}`}>
            {ch.n} {r ? starText(r.stars) : ch.n === c.chapter && !c.done ? '…' : ''}
          </span>
        );
      })}
    </div>
  );
}

/** Hinweis auf ein noch gesperrtes System (Karriere) */
export function CareerLock({ feature }: { feature: CampaignFeature }) {
  const s = useGame();
  const text = campaignLock(s, feature);
  if (!text) return null;
  return <p className="career-lock"><Lock size={13} /> {text}</p>;
}

/** Ungelesene Nachricht von Mentorin oder Rivale */
export function CampaignMessageCard() {
  const s = useGame();
  const unread = (s.campaign?.messages ?? []).filter((m) => !m.read);
  if (!unread.length) return null;
  const m = unread[0];
  const mentor = m.from === 'mentor';
  return (
    <div className="career-msg-backdrop">
      <div className={`career-msg ${m.from}`} role="dialog" aria-label={m.title}>
        <div className="career-msg-head">
          {mentor ? <GraduationCap size={18} /> : <Swords size={18} />}
          <div>
            <b>{m.title}</b>
            <div className="dim">{mentor ? `${MENTOR.name}, ${MENTOR.role}` : 'Dein Rivale'} · {formatDate(m.t)}</div>
          </div>
        </div>
        {m.text.split('\n\n').map((p, i) => <p key={i}>{p}</p>)}
        <div className="row">
          {unread.length > 1 && <span className="dim">{unread.length - 1} weitere</span>}
          <span className="spacer" />
          {unread.length > 1 && <button className="btn small ghost" onClick={() => sendCommand({ type: 'readCampaignMessage' }, { quiet: true })}>Alle gelesen</button>}
          <button className="btn small primary" onClick={() => sendCommand({ type: 'readCampaignMessage', id: m.id }, { quiet: true })}>Weiter</button>
        </div>
      </div>
    </div>
  );
}

export const CAREER_UNLOCKS = (Object.keys(FEATURE_CHAPTER) as CampaignFeature[]).map((f) => ({ feature: f, label: FEATURE_LABEL[f], chapter: FEATURE_CHAPTER[f] }));
