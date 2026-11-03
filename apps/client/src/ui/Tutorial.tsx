// Tutorial „Erste Schritte“: geführte Liste, die den Fortschritt am Spielzustand erkennt und das nächste Bedienelement hervorhebt.
// Der Fortschritt liegt je Spiel im localStorage (reine Oberfläche, nicht im Spielstand).

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Circle, GraduationCap, X, ChevronDown, ChevronUp, ArrowRight } from 'lucide-react';
import type { GameState } from '@spedsim/core';
import { localStorageSet, navigate, setUi, useGame, useUi, type Page } from '../game/store.ts';

interface Progress {
  done: string[];
  visited: Page[];
  help: boolean;
  closed: boolean;
}

interface Step {
  id: string;
  title: string;
  text: string;
  /** Seite, zu der „Zeigen“ führt */
  page?: Page;
  /** data-tour-Ziel, das hervorgehoben wird (abhängig von der aktuellen Seite) */
  target?: (page: Page) => string | undefined;
  check: (s: GameState, p: Progress) => boolean;
}

const STEPS: Step[] = [
  {
    id: 'orders', title: 'Auftragsbörse öffnen', page: 'orders', target: () => 'nav-orders',
    text: 'Hier findest du Frachtaufträge aus ganz Europa. Achte auf Abholort, Termin und Vergütung – Angebote in der Nähe deines LKW sparen Leerkilometer.',
    check: (_s, p) => p.visited.includes('orders'),
  },
  {
    id: 'dispatch', title: 'Ersten Auftrag disponieren', page: 'orders', target: (page) => (page === 'orders' ? 'order-dispatch' : 'nav-orders'),
    text: 'Klicke bei einem Auftrag auf „Disponieren“ und wähle Fahrer, LKW und Auflieger. Die Vorkalkulation zeigt Ankunft, Kosten und Ergebnis; gelbe Warnungen sind erlaubt, rote Fehler nicht.',
    check: (s) => Object.values(s.trips).some((t) => t.orderId) || s.company.totals.deliveries > 0,
  },
  {
    id: 'time', title: 'Zeit laufen lassen', target: () => 'speed',
    text: 'Starte die Simulation mit Play oder der Leertaste. Mit 1–6 wählst du das Tempo – bei 60× vergeht ein Spieltag in 24 Sekunden.',
    check: (s) => !s.paused,
  },
  {
    id: 'map', title: 'Fahrt auf der Karte verfolgen', page: 'map', target: () => 'nav-map',
    text: 'Auf der Europakarte siehst du deinen LKW live. Ein Klick auf das Fahrzeug zeigt Fahrer, Lenkzeit, Wetter und voraussichtliche Ankunft.',
    check: (_s, p) => p.visited.includes('map'),
  },
  {
    id: 'delivery', title: 'Erste Lieferung abschließen',
    text: 'Pünktlich liefern hält Kunden zufrieden. Nach der Lieferung entsteht eine Rechnung – bezahlt wird erst nach dem Zahlungsziel von 14–60 Tagen.',
    check: (s) => s.company.totals.deliveries > 0,
  },
  {
    id: 'finance', title: 'Liquidität im Blick behalten', page: 'finance', target: () => 'nav-finance',
    text: 'Unter „Finanzen“ stehen Kontostand, offene Forderungen und Fixkosten. Am Monatsersten werden Löhne, Miete und Leasing fällig – halte einen Puffer.',
    check: (_s, p) => p.visited.includes('finance'),
  },
  {
    id: 'fleet', title: 'Fuhrpark und Wartung', page: 'fleet', target: () => 'nav-fleet',
    text: 'Fahrzeuge verschleißen. Unter 45 % Zustand drohen Pannen – plane die Wartung zwischen zwei Touren ein.',
    check: (_s, p) => p.visited.includes('fleet'),
  },
  {
    id: 'grow', title: 'Zweites Fahrzeug beschaffen', page: 'fleet', target: () => 'nav-fleet',
    text: 'Ein LKW trägt die Fixkosten kaum. Leasing braucht kaum Kapital, ein Gebrauchter ist günstiger im Unterhalt. Denk an einen Fahrer und einen Auflieger dazu.',
    check: (s) => Object.keys(s.vehicles).length >= 2,
  },
  {
    id: 'help', title: 'Hilfe kennenlernen', target: () => 'help',
    text: 'F1 oder das Fragezeichen oben rechts öffnet die Hilfe zur aktuellen Seite – mit Lenkzeiten, Fahrverboten, Finanzen und allen Tastenkürzeln.',
    check: (_s, p) => p.help,
  },
];

const keyOf = (s: GameState) => `cargovia.tutorial.${s.seed}.${s.company.founded}`;

function load(s: GameState): Progress | null {
  try {
    const raw = localStorage.getItem(keyOf(s));
    return raw ? (JSON.parse(raw) as Progress) : null;
  } catch {
    return null;
  }
}

export function Tutorial() {
  const s = useGame();
  const page = useUi((u) => u.page);
  const show = useUi((u) => u.tutorial);
  const helpOpen = useUi((u) => u.help !== null);
  const [p, setP] = useState<Progress>(() => load(s) ?? { done: [], visited: [], help: false, closed: false });
  const [collapsed, setCollapsed] = useState(false);
  const [list, setList] = useState(false);
  const started = useRef(false);

  // neues Spiel: Tutorial automatisch einblenden
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!load(s) && s.company.totals.deliveries === 0) setUi({ tutorial: true });
    else if (!p.closed && p.done.length < STEPS.length) setUi({ tutorial: true });
  }, [s, p]);

  // Fortschritt erkennen
  useEffect(() => {
    let next = p;
    if (!next.visited.includes(page)) next = { ...next, visited: [...next.visited, page] };
    if (helpOpen && !next.help) next = { ...next, help: true };
    const done = STEPS.filter((st) => next.done.includes(st.id) || st.check(s, next)).map((st) => st.id);
    if (done.length !== next.done.length) next = { ...next, done };
    if (next !== p) {
      setP(next);
      localStorageSet(keyOf(s), JSON.stringify(next));
    }
  }, [s, page, helpOpen, p]);

  const current = STEPS.find((st) => !p.done.includes(st.id));
  const target = show && !collapsed && current?.target?.(page);

  // nächstes Bedienelement hervorheben
  useEffect(() => {
    if (!target) return;
    const apply = () => {
      document.querySelectorAll('.tour-target').forEach((el) => el.getAttribute('data-tour') !== target && el.classList.remove('tour-target'));
      document.querySelector(`[data-tour="${target}"]`)?.classList.add('tour-target');
    };
    apply();
    const id = window.setInterval(apply, 400);
    return () => {
      window.clearInterval(id);
      document.querySelectorAll('.tour-target').forEach((el) => el.classList.remove('tour-target'));
    };
  }, [target]);

  if (!show) return null;
  const close = () => {
    const next = { ...p, closed: true };
    setP(next);
    localStorageSet(keyOf(s), JSON.stringify(next));
    setUi({ tutorial: false });
  };
  const count = p.done.length;
  return (
    <div className={`tutorial ${collapsed ? 'collapsed' : ''}`}>
      <div className="tutorial-head">
        <GraduationCap size={16} />
        <b>Erste Schritte</b>
        <span className="dim">{count}/{STEPS.length}</span>
        <div className="spacer" />
        <button className="icon-btn" title={collapsed ? 'Aufklappen' : 'Einklappen'} onClick={() => setCollapsed(!collapsed)}>{collapsed ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</button>
        <button className="icon-btn" title="Ausblenden (über die Hilfe wieder einblendbar)" onClick={close}><X size={15} /></button>
      </div>
      <div className="tutorial-bar"><span style={{ width: `${(count / STEPS.length) * 100}%` }} /></div>
      {!collapsed && (
        <>
          {current ? (
            <div className="tutorial-step">
              <div className="tutorial-title">{current.title}</div>
              <p>{current.text}</p>
              <div className="row">
                {current.page && page !== current.page && (
                  <button className="btn small primary" onClick={() => navigate(current.page!)}>Zeigen<ArrowRight size={13} /></button>
                )}
                <div className="spacer" />
                <button className="link-btn" onClick={() => setList(!list)}>{list ? 'Liste ausblenden' : 'Alle Schritte'}</button>
              </div>
            </div>
          ) : (
            <div className="tutorial-step">
              <div className="tutorial-title">Geschafft!</div>
              <p>Du kennst jetzt die Grundlagen. Weitere Tipps findest du jederzeit in der Hilfe (F1). Viel Erfolg mit deiner Spedition!</p>
              <button className="btn small primary" onClick={close}>Schließen</button>
            </div>
          )}
          {(list || !current) && <ul className="tutorial-list">
            {STEPS.map((st) => (
              <li key={st.id} className={p.done.includes(st.id) ? 'done' : st === current ? 'current' : ''}>
                {p.done.includes(st.id) ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                {st.title}
              </li>
            ))}
          </ul>}
        </>
      )}
    </div>
  );
}
