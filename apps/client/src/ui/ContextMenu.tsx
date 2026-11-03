// Kontextmenü (Rechtsklick) für Tabellenzeilen: openMenu(e, items) zeigt es an der Mausposition, <ContextMenuHost/> rendert es.

import { useEffect, useState, useSyncExternalStore, type MouseEvent, type ReactNode } from 'react';

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  /** Trennlinie vor diesem Eintrag */
  sep?: boolean;
}

let menu: { x: number; y: number; title?: string; items: MenuItem[] } | null = null;
const listeners = new Set<() => void>();
const set = (m: typeof menu) => {
  menu = m;
  for (const l of listeners) l();
};

export function openMenu(e: MouseEvent, items: MenuItem[], title?: string) {
  e.preventDefault();
  e.stopPropagation();
  set({ x: e.clientX, y: e.clientY, title, items });
}

export function ContextMenuHost() {
  const m = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => menu,
  );
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useEffect(() => {
    if (!m) return;
    const close = () => set(null);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('mousedown', close);
    window.addEventListener('blur', close);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    // innerhalb des Fensters halten
    const h = 34 * m.items.length + (m.title ? 30 : 8);
    setPos({ left: Math.min(m.x, window.innerWidth - 230), top: Math.min(m.y, window.innerHeight - h - 8) });
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
    };
  }, [m]);
  if (!m || !pos) return null;
  return (
    <div className="ctx-menu" style={pos} onMouseDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
      {m.title && <div className="ctx-title">{m.title}</div>}
      {m.items.map((it, i) => (
        <div key={i}>
          {it.sep && <div className="ctx-sep" />}
          <button
            className={`ctx-item ${it.danger ? 'danger' : ''}`}
            disabled={it.disabled}
            onClick={() => {
              set(null);
              it.onClick?.();
            }}
          >
            <span className="ctx-icon">{it.icon}</span>
            {it.label}
          </button>
        </div>
      ))}
    </div>
  );
}
