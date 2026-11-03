// Fehlergrenzen: Stürzt eine Ansicht ab, bleibt das Spiel bedienbar (Seite) bzw. es erscheint ein
// Notfallbildschirm mit Spielstand-Export (gesamte App). Jeder Absturz landet im Fehlerprotokoll.

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, Copy, Download, LayoutDashboard, RotateCcw } from 'lucide-react';
import { errorReport, recordError, type ErrorEntry } from '../game/errors.ts';
import { getUi, navigate, toast } from '../game/store.ts';

interface Props {
  children: ReactNode;
  /** 'page' = nur die aktuelle Ansicht ersetzen, 'app' = Notfallbildschirm */
  scope: 'page' | 'app';
  /** Wechsel des Schlüssels (z. B. Seitenname) setzt die Fehlergrenze zurück */
  resetKey?: string;
}

interface State {
  entry: ErrorEntry | null;
  resetKey?: string;
}

async function copyReport(entry: ErrorEntry) {
  try {
    await navigator.clipboard.writeText(errorReport([entry]));
    toast('success', 'Fehlerbericht in die Zwischenablage kopiert.');
  } catch {
    toast('warning', 'Kopieren nicht möglich – der Bericht steht unter Einstellungen → Fehlerprotokoll.');
  }
}

async function exportSave() {
  try {
    const host = getUi().host;
    if (!host?.exportSave) throw new Error('Export ist nur im Einzelspieler möglich.');
    const text = await host.exportSave();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = `cargovia-notfall-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (e) {
    toast('danger', (e as Error).message);
  }
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { entry: null, resetKey: this.props.resetKey };

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.resetKey ? { entry: null, resetKey: props.resetKey } : null;
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    const entry = recordError('ui', error, { stack: `${error.stack?.split('\n').slice(0, 6).join('\n') ?? ''}\nKomponenten:${info.componentStack?.split('\n').slice(0, 6).join('\n') ?? ''}` });
    this.setState({ entry });
  }

  static getDerivedStateFromError(): Partial<State> {
    // Eintrag folgt in componentDidCatch; bis dahin Platzhalter
    return { entry: { at: '', source: 'ui', message: '', version: __APP_VERSION__ } };
  }

  override render() {
    const { entry } = this.state;
    if (!entry) return this.props.children;
    if (this.props.scope === 'page')
      return (
        <div className="page">
          <div className="card crash">
            <AlertTriangle size={28} />
            <h2>Diese Ansicht ist abgestürzt</h2>
            <p className="dim">Das Spiel läuft im Hintergrund weiter, dein Spielstand ist nicht betroffen.</p>
            {entry.message && <pre className="crash-msg">{entry.message}</pre>}
            <div className="row">
              <button className="btn primary" onClick={() => this.setState({ entry: null })}><RotateCcw size={14} />Erneut versuchen</button>
              <button className="btn" onClick={() => (this.setState({ entry: null }), navigate('dashboard'))}><LayoutDashboard size={14} />Zum Dashboard</button>
              <button className="btn" onClick={() => copyReport(entry)}><Copy size={14} />Fehlerbericht kopieren</button>
            </div>
          </div>
        </div>
      );
    return (
      <div className="crash-screen">
        <div className="card crash">
          <AlertTriangle size={32} />
          <h2>Cargovia ist auf einen Fehler gestoßen</h2>
          <p className="dim">
            Die Autosaves bleiben erhalten. Sichere zur Vorsicht den aktuellen Spielstand als Datei und lade das Spiel neu.
          </p>
          {entry.message && <pre className="crash-msg">{entry.message}</pre>}
          <div className="row">
            <button className="btn primary" onClick={() => location.reload()}><RotateCcw size={14} />Neu laden</button>
            {getUi().host?.exportSave && <button className="btn" onClick={exportSave}><Download size={14} />Spielstand sichern</button>}
            <button className="btn" onClick={() => copyReport(entry)}><Copy size={14} />Fehlerbericht kopieren</button>
          </div>
        </div>
      </div>
    );
  }
}
