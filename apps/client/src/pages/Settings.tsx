import { useState } from 'react';
import { Save, Download, LogOut, Sun, Moon, Volume2, VolumeX } from 'lucide-react';
import { DIFFICULTY_LABEL } from '@spedsim/core';
import { getUi, localStorageSet, resetGameUi, setUi, toast, useGame, useUi } from '../game/store.ts';
import { Card, PageHeader } from '../ui/components.tsx';
import { askConfirm } from '../ui/confirm.tsx';

export function SettingsPage() {
  const s = useGame();
  const host = useUi((u) => u.host);
  const theme = useUi((u) => u.theme);
  const sound = useUi((u) => u.sound);
  const [name, setName] = useState(s.company.name);

  return (
    <div className="page">
      <PageHeader title="Einstellungen" />
      <div className="grid grid-2">
        <Card title="Darstellung & Ton">
          <div className="row">
            <button className={`btn ${theme === 'dark' ? 'primary' : ''}`} onClick={() => { setUi({ theme: 'dark' }); localStorageSet('spedsim.theme', 'dark'); }}><Moon size={15} />Dunkel</button>
            <button className={`btn ${theme === 'light' ? 'primary' : ''}`} onClick={() => { setUi({ theme: 'light' }); localStorageSet('spedsim.theme', 'light'); }}><Sun size={15} />Hell</button>
            <button className="btn" onClick={() => { setUi({ sound: !sound }); localStorageSet('spedsim.sound', sound ? 'off' : 'on'); }}>
              {sound ? <Volume2 size={15} /> : <VolumeX size={15} />} Klänge {sound ? 'an' : 'aus'}
            </button>
          </div>
          <p className="dim" style={{ fontSize: 12.5 }}>Tastenkürzel: Leertaste = Pause/Weiter, 1–6 = Geschwindigkeit, M = Karte, D = Disposition, A = Auftragsbörse.</p>
        </Card>
        <Card title="Spielstand">
          {host?.mode === 'local' ? (
            <>
              <div className="field">
                <label>Name des Spielstands</label>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="row wrap">
                <button className="btn primary" onClick={async () => { await host.save!(name); toast('success', `Gespeichert: ${name}`); }}><Save size={15} />Speichern</button>
                <button
                  className="btn"
                  onClick={async () => {
                    const text = await host.exportSave!();
                    const blob = new Blob([text], { type: 'application/json' });
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = `${s.company.name.replace(/[^\w-]+/g, '_')}.spedsim.json`;
                    a.click();
                    URL.revokeObjectURL(a.href);
                  }}
                >
                  <Download size={15} />Als Datei exportieren
                </button>
              </div>
              <p className="dim" style={{ fontSize: 12.5 }}>Automatisches Speichern jeden Spieltag in drei rotierenden Slots. Jeder Spielstand ist versioniert und prüfsummengeschützt; beim Überschreiben bleibt eine Sicherungskopie erhalten.</p>
            </>
          ) : (
            <p className="muted">Multiplayer-Spielstände werden vom Server automatisch gespeichert und gesichert.</p>
          )}
          <button
            className="btn danger mt"
            onClick={async () => {
              if (host?.mode === 'local') {
                const save = await askConfirm('Möchtest du vor dem Beenden speichern?', { title: 'Zum Hauptmenü', confirmLabel: 'Speichern', cancelLabel: 'Ohne Speichern', dismissResult: null });
                if (save === null) return;
                if (save) await host.save!(name);
              }
              getUi().host?.close();
              resetGameUi();
            }}
          >
            <LogOut size={15} />Zum Hauptmenü
          </button>
        </Card>
        <Card title="Spiel">
          <dl className="kv">
            <dt>Schwierigkeit</dt><dd>{DIFFICULTY_LABEL[s.difficulty.id]}</dd>
            <dt>Seed</dt><dd>{s.seed}</dd>
            <dt>Speicherformat</dt><dd>Version {s.version}</dd>
          </dl>
        </Card>
        <Card title="Lizenzen & Datenquellen">
          <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-2)', lineHeight: 1.7, fontSize: 13 }}>
            <li>Kartendaten & Straßennetz © OpenStreetMap-Mitwirkende (ODbL 1.0)</li>
            <li>Grundkarte: OpenFreeMap / OpenMapTiles (BSD/CC-BY)</li>
            <li>Routenberechnung beim Erzeugen des Netzes: OSRM (BSD-2)</li>
            <li>MapLibre GL JS (BSD-3), React (MIT), Lucide Icons (ISC)</li>
            <li>Alle Fahrzeughersteller, Firmen und Personen sind frei erfunden.</li>
            <li>Cargovia © {new Date().getFullYear()} Nebomuck. Alle Rechte vorbehalten.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
