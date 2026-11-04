// Ziele und Erfolge: Quartalsziele der Hausbank, Szenario-Fortschritt, Erfolge und Rekorde.

import { Award, Flag, Landmark, Lock, Trophy } from 'lucide-react';
import { ACHIEVEMENTS, RATING_LABEL, SCENARIOS, formatDate, goalProgress, rating, scenarioChecks, type GameState } from '@spedsim/core';
import { Badge, Bar, Card, Money } from './components.tsx';
import { km } from './format.ts';

const pct = (share: number) => Math.round(Math.max(0, Math.min(1, share)) * 100);

function GoalRow({ label, value, target, share, met }: { label: string; value: string; target: string; share: number; met: boolean }) {
  return (
    <div className="goal-row">
      <div className="row">
        <span>{label}</span>
        <span className="spacer" />
        <span className={met ? 'pos' : 'dim'}>
          {value} <span className="dim">/ {target}</span>
        </span>
        {met && <Badge kind="success">✓</Badge>}
      </div>
      <Bar value={met ? 100 : pct(share)} />
    </div>
  );
}

/** Quartalsziele der Hausbank mit Bonität */
export function QuarterCard({ s }: { s: GameState }) {
  const q = s.quarter;
  const r = rating(s);
  const last = s.quarterHistory?.[s.quarterHistory.length - 1];
  return (
    <Card
      title={<><Landmark size={15} /> Quartalsziele</>}
      actions={<Badge kind={r <= 1 ? 'success' : r >= 3 ? 'danger' : 'info'} title="Bonität A–E: bestimmt Zins (±1 %) und Kreditrahmen (±20 %)">Bonität {RATING_LABEL[r]}</Badge>}
    >
      {!q && <div className="empty">Die Bank stellt die ersten Ziele mit dem nächsten Tageswechsel.</div>}
      {q && <p className="dim goal-head">Hausbank · Quartal {q.index} bis {formatDate(q.end)} · noch {Math.max(0, Math.ceil((q.end - s.time) / 1440))} Tage</p>}
      {q?.goals.map((g, i) => <GoalRow key={i} {...goalProgress(s, g)} />)}
      <p className="dim goal-note">
        Alle Ziele erreicht: Bonität steigt, Ansehen +3. Ein Ziel verfehlt: Bonität bleibt. Mehr verfehlt: Bonität sinkt, Ansehen −2.
        {last && ` Letztes Quartal: ${last.met} von ${last.of} Zielen.`}
      </p>
    </Card>
  );
}

/** Szenario-Ziel; ohne Szenario nichts */
export function ScenarioCard({ s }: { s: GameState }) {
  const sc = s.scenario;
  if (!sc) return null;
  const def = SCENARIOS[sc.id];
  const checks = scenarioChecks(s);
  return (
    <Card
      title={<><Flag size={15} /> {def.name}</>}
      actions={sc.status === 'won' ? <Badge kind="success">Geschafft</Badge> : sc.status === 'failed' ? <Badge kind="warning">Verfehlt</Badge> : undefined}
    >
      <p className="dim goal-head">Szenario · {sc.status === 'running' ? `Frist bis ${formatDate(sc.deadline)}` : sc.status === 'won' ? `geschafft am ${formatDate(sc.finishedAt ?? s.time)}` : 'Frist abgelaufen'}</p>
      <p className="goal-note" style={{ marginTop: 0, marginBottom: 8 }}>{def.goal}</p>
      {checks.map((c, i) => <GoalRow key={i} {...c} />)}
      {sc.status !== 'running' && <p className="dim goal-note">Das Spiel läuft als freies Spiel weiter.</p>}
    </Card>
  );
}

/** nächste offene Erfolge mit Fortschritt (für das Dashboard) */
export function NextAchievements({ s, count = 4 }: { s: GameState; count?: number }) {
  const p = s.progress;
  const open = ACHIEVEMENTS.filter((a) => !p?.achievements[a.id])
    .map((a) => ({ a, pr: a.progress?.(s, p) }))
    .sort((x, y) => (y.pr ? y.pr[0] / y.pr[1] : 0) - (x.pr ? x.pr[0] / x.pr[1] : 0))
    .slice(0, count);
  const done = p ? Object.keys(p.achievements).length : 0;
  return (
    <Card title={<><Trophy size={15} /> Nächste Erfolge</>} actions={<span className="dim" style={{ fontSize: 12 }}>{done} von {ACHIEVEMENTS.length}</span>}>
      {open.map(({ a, pr }) => (
        <GoalRow key={a.id} label={a.title} value={pr ? String(pr[0]) : '–'} target={pr ? String(pr[1]) : a.text} share={pr ? pr[0] / pr[1] : 0} met={false} />
      ))}
      {!open.length && <div className="empty">Alle Erfolge freigeschaltet – Respekt!</div>}
    </Card>
  );
}

/** vollständige Liste der Erfolge und Rekorde (Statistik) */
export function AchievementsCard({ s }: { s: GameState }) {
  const p = s.progress;
  const r = p?.records;
  const groups = ['Touren', 'Firma', 'Spezial'] as const;
  return (
    <>
      {r && (
        <Card title={<><Award size={15} /> Rekorde</>} className="mt">
          <div className="records">
            <div><span className="dim">Längste Tour</span><b>{r.longestKm ? km(r.longestKm) : '–'}</b></div>
            <div><span className="dim">Bestbezahlter Auftrag</span><b>{r.bestPayment ? <Money value={r.bestPayment} /> : '–'}</b></div>
            <div><span className="dim">Bester Monat (Ergebnis)</span><b>{r.bestMonth ? <Money value={r.bestMonth} colored /> : '–'}</b></div>
            <div><span className="dim">Pünktlich in Folge</span><b>{r.onTimeStreak} <span className="dim">(Bestwert {r.bestStreak})</span></b></div>
            <div><span className="dim">Größter Fuhrpark</span><b>{r.maxVehicles} Fahrzeug{r.maxVehicles === 1 ? '' : 'e'}</b></div>
            <div><span className="dim">Höchster Kontostand</span><b><Money value={r.maxBalance} /></b></div>
            <div><span className="dim">Länder beliefert</span><b>{p.countries.length}</b></div>
            <div><span className="dim">Premium-Aufträge pünktlich</span><b>{p.counts.premium}</b></div>
          </div>
        </Card>
      )}
      <Card title={<><Trophy size={15} /> Erfolge</>} sub={`${p ? Object.keys(p.achievements).length : 0} von ${ACHIEVEMENTS.length}`} className="mt">
        {groups.map((g) => (
          <div key={g} className="achievement-group">
            <h4>{g}</h4>
            <div className="achievements">
              {ACHIEVEMENTS.filter((a) => a.group === g).map((a) => {
                const at = p?.achievements[a.id];
                const pr = !at ? a.progress?.(s, p) : undefined;
                return (
                  <div key={a.id} className={`achievement ${at !== undefined ? 'done' : ''}`} title={at !== undefined ? `freigeschaltet am ${formatDate(at)}` : a.text}>
                    {at !== undefined ? <Trophy size={18} /> : <Lock size={18} />}
                    <div>
                      <b>{a.title}</b>
                      <small>{a.text}{pr ? ` (${pr[0]}/${pr[1]})` : ''}</small>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </Card>
    </>
  );
}
