// Entscheidungskarten: offene Ereignisse mit Wahl, unten rechts über den Meldungen.
// Die Karte lässt sich einklappen („Später“); dann bleibt ein kleiner Hinweis mit der Anzahl.

import { useState } from 'react';
import { Briefcase, ChevronUp, Clock, Heart, Pause, TrendingUp, Users } from 'lucide-react';
import { formatDuration, mayDecide, type Decision } from '@spedsim/core';
import { sendCommand, useGame, useUi } from '../game/store.ts';

const ICON: Record<Decision['category'], typeof Heart> = { company: Briefcase, personnel: Users, market: TrendingUp, private: Heart };
const LABEL: Record<Decision['category'], string> = { company: 'Firma', personnel: 'Personal', market: 'Markt', private: 'Privat' };

export function DecisionCard() {
  const s = useGame();
  const pid = useUi((u) => u.playerId);
  const [hidden, setHidden] = useState<string | null>(null);
  const mine = (s.decisions ?? []).filter((d) => mayDecide(s, pid, d)).sort((a, b) => a.expires - b.expires);
  if (!mine.length) return null;
  const d = mine[0];
  // eingeklappt, bis eine neue Karte vorne liegt
  if (hidden === d.id)
    return (
      <button className="decision-pill" onClick={() => setHidden(null)}>
        <ChevronUp size={14} /> {mine.length} Entscheidung{mine.length > 1 ? 'en' : ''} offen
      </button>
    );
  const Icon = ICON[d.category];
  const left = d.expires - s.time;
  return (
    <div className="decision-card" role="dialog" aria-label={d.title}>
      <div className="decision-head">
        <span className={`decision-cat ${d.category}`}><Icon size={13} /> {LABEL[d.category]}</span>
        <b>{d.title}</b>
        <span className="spacer" />
        <span className="dim" title="Danach gilt die Vorgabe"><Clock size={12} /> {formatDuration(Math.max(0, left))}</span>
      </div>
      <p className="decision-text">{d.text}</p>
      {s.pausedForDecision && <p className="decision-paused"><Pause size={12} /> Spiel angehalten – es läuft nach deiner Wahl weiter.</p>}
      <div className="decision-options">
        {d.options.map((o) => (
          <button key={o.id} className={`decision-option ${o.id === d.defaultOption ? 'default' : ''}`} onClick={() => sendCommand({ type: 'decide', decisionId: d.id, optionId: o.id })}>
            <b>{o.label}</b>
            <span>{o.hint}</span>
          </button>
        ))}
      </div>
      <div className="row decision-foot">
        <span className="dim">Ohne Entscheidung: „{d.options.find((o) => o.id === d.defaultOption)?.label}“{mine.length > 1 ? ` · ${mine.length - 1} weitere` : ''}</span>
        <span className="spacer" />
        <button
          className="btn small ghost"
          title={s.pausedForDecision ? 'Karte einklappen und weiterspielen' : 'Karte einklappen'}
          onClick={() => {
            setHidden(d.id);
            // eingeklappt läuft das Spiel weiter (sonst stünde es ohne sichtbaren Grund)
            if (s.pausedForDecision) sendCommand({ type: 'setPaused', paused: false }, { quiet: true });
          }}
        >
          {s.pausedForDecision ? 'Später, weiterspielen' : 'Später'}
        </button>
      </div>
    </div>
  );
}
