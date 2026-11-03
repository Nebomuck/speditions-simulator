// Anpassbare Panelgrößen: Ziehgriff, der eine CSS-Variable (--panel-<name>) verändert.
// Die Breite wird je Panel im localStorage gemerkt; Doppelklick setzt sie zurück.

import { useRef, type PointerEvent } from 'react';
import { localStorageSet } from '../game/store.ts';

export const PANELS = {
  sidebar: { def: 220, min: 168, max: 360 },
  dispatch: { def: 360, min: 280, max: 640 },
  vehicle: { def: 380, min: 300, max: 640 },
} as const;
export type PanelName = keyof typeof PANELS;

const key = (p: PanelName) => `cargovia.panel.${p}`;
const apply = (p: PanelName, px: number) => document.documentElement.style.setProperty(`--panel-${p}`, `${px}px`);
const clamp = (p: PanelName, px: number) => Math.round(Math.max(PANELS[p].min, Math.min(PANELS[p].max, px)));

/** gespeicherte Breiten beim Start übernehmen */
export function initPanelSizes() {
  for (const p of Object.keys(PANELS) as PanelName[]) {
    let px: number = PANELS[p].def;
    try {
      px = Number(localStorage.getItem(key(p))) || px;
    } catch {
      /* privater Modus */
    }
    apply(p, clamp(p, px));
  }
}

/**
 * Ziehgriff am Rand eines Panels. `edge`: Seite des Panels, an der der Griff sitzt –
 * 'right' (Panel wächst nach rechts) oder 'left' (Panel am rechten Bildrand, wächst nach links).
 */
export function Resizer({ panel, edge = 'right', className = '' }: { panel: PanelName; edge?: 'left' | 'right'; className?: string }) {
  const drag = useRef<{ x: number; w: number } | null>(null);
  const current = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(`--panel-${panel}`)) || PANELS[panel].def;
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, w: current() };
    document.body.classList.add('resizing');
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    apply(panel, clamp(panel, drag.current.w + (edge === 'right' ? dx : -dx)));
  };
  const onUp = () => {
    if (!drag.current) return;
    drag.current = null;
    document.body.classList.remove('resizing');
    localStorageSet(key(panel), String(current()));
    // Karten u. Ä. passen sich an die neue Fläche an
    window.dispatchEvent(new Event('resize'));
  };
  return (
    <div
      className={`resizer resizer-${edge} ${className}`}
      title="Ziehen zum Ändern der Breite, Doppelklick setzt zurück"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onDoubleClick={() => {
        apply(panel, PANELS[panel].def);
        localStorageSet(key(panel), String(PANELS[panel].def));
        window.dispatchEvent(new Event('resize'));
      }}
    />
  );
}
