// Fehlerprotokoll: sammelt Abstürze der Oberfläche, unbehandelte Fehler und Simulationsfehler
// (die letzten 30 Einträge im localStorage), damit Spieler einen Fehlerbericht kopieren können.

import { getUi, localStorageSet, toast } from './store.ts';

export interface ErrorEntry {
  at: string;
  source: 'ui' | 'global' | 'simulation' | 'worker' | 'server';
  message: string;
  stack?: string;
  page?: string;
  gameTime?: number;
  version: string;
}

const KEY = 'cargovia.errors';
const LIMIT = 30;
let lastToast = 0;

export function getErrors(): ErrorEntry[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as ErrorEntry[];
  } catch {
    return [];
  }
}

export function clearErrors() {
  localStorageSet(KEY, '[]');
}

export function recordError(source: ErrorEntry['source'], err: unknown, extra: Partial<ErrorEntry> = {}): ErrorEntry {
  const e = err instanceof Error ? err : new Error(typeof err === 'string' ? err : JSON.stringify(err));
  const ui = getUi();
  const entry: ErrorEntry = {
    at: new Date().toISOString(),
    source,
    message: e.message || String(err),
    stack: e.stack?.split('\n').slice(0, 12).join('\n'),
    page: ui.state ? ui.page : 'welcome',
    gameTime: ui.state?.time,
    version: __APP_VERSION__,
    ...extra,
  };
  localStorageSet(KEY, JSON.stringify([...getErrors(), entry].slice(-LIMIT)));
  return entry;
}

/** Text für die Zwischenablage (Fehlermeldung im Forum/Issue) */
export function errorReport(entries = getErrors()): string {
  const head = `Cargovia ${__APP_VERSION__} · ${navigator.userAgent}`;
  return [head, ...entries.map((e) => `\n[${e.at}] ${e.source} · Seite ${e.page ?? '–'}${e.gameTime !== undefined ? ` · Spielzeit ${e.gameTime}` : ''}\n${e.message}${e.stack ? `\n${e.stack}` : ''}`)].join('\n');
}

/** unbehandelte Fehler aufzeichnen und dezent melden (höchstens alle 10 s eine Meldung) */
export function installGlobalErrorHandlers() {
  const report = (err: unknown) => {
    recordError('global', err);
    if (Date.now() - lastToast > 10_000) {
      lastToast = Date.now();
      toast('warning', 'Ein unerwarteter Fehler ist aufgetreten. Details stehen unter Einstellungen → Fehlerprotokoll.');
    }
  };
  window.addEventListener('error', (ev) => {
    // Ladefehler von Bildern/Kacheln (ev.error leer) sind keine Programmfehler
    if (ev.error) report(ev.error);
  });
  window.addEventListener('unhandledrejection', (ev) => report(ev.reason));
}
