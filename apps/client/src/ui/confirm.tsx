// Eigener Bestätigungsdialog statt window.confirm (der in der Desktop-App „tauri.localhost meldet …“ zeigt).
// `askConfirm` öffnet den Dialog und liefert true (bestätigt) oder false (abgebrochen, Esc, Klick daneben).

import { useSyncExternalStore, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from './components.tsx';

export interface ConfirmOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** rot hervorgehobene, nicht umkehrbare Aktion (Löschen, Entlassen …) */
  danger?: boolean;
  /** Ergebnis bei Esc, ✕ oder Klick neben den Dialog (Standard: false). null = „gar nichts tun“ */
  dismissResult?: false | null;
}

interface Pending extends ConfirmOptions {
  message: ReactNode;
  resolve: (ok: boolean | null) => void;
}

let pending: Pending | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function askConfirm(message: ReactNode, opts?: ConfirmOptions & { dismissResult?: false }): Promise<boolean>;
export function askConfirm(message: ReactNode, opts: ConfirmOptions & { dismissResult: null }): Promise<boolean | null>;
export function askConfirm(message: ReactNode, opts: ConfirmOptions = {}): Promise<boolean | null> {
  // ein offener Dialog wird durch den neuen ersetzt (als abgebrochen gewertet)
  pending?.resolve(pending.dismissResult ?? false);
  return new Promise((resolve) => {
    pending = { message, ...opts, resolve };
    emit();
  });
}

function close(ok: boolean | null) {
  const p = pending;
  pending = null;
  emit();
  p?.resolve(ok);
}

export function ConfirmHost() {
  const p = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => pending,
  );
  if (!p) return null;
  return (
    <Modal
      title={p.title ?? 'Bitte bestätigen'}
      width={440}
      onClose={() => close(p.dismissResult ?? false)}
      footer={
        <>
          <button className="btn" onClick={() => close(false)}>{p.cancelLabel ?? 'Abbrechen'}</button>
          <button className={`btn ${p.danger ? 'danger' : 'primary'}`} autoFocus onClick={() => close(true)}>{p.confirmLabel ?? 'Bestätigen'}</button>
        </>
      }
    >
      <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
        {p.danger && <AlertTriangle size={22} style={{ color: 'var(--danger)', flexShrink: 0 }} />}
        <div style={{ lineHeight: 1.5 }}>{p.message}</div>
      </div>
    </Modal>
  );
}
