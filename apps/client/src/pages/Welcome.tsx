// Startbildschirm: Firma gründen, Spielstand laden, Multiplayer-Firma erstellen oder beitreten.

import { useEffect, useMemo, useState } from 'react';
import { Truck, Map, Users, Wallet, Home, Network, Upload, Trash2, Play, LogIn, Plus, Server, Download, Pencil, Dices } from 'lucide-react';
import { BACKGROUNDS, CITIES, CUSTOM_LIMITS, DIFFICULTIES, DIFFICULTY_LABEL, formatDateTime, formatMoney, type AvatarLook, type CharacterBackground, type Difficulty, type DifficultyId } from '@spedsim/core';
import { LocalHost } from '../game/host.ts';
import { appVersion, checkForUpdate, installUpdate, type Update } from '../game/updater.ts';
import { connect, ensureLocalServer, forgetSession, isDesktop, joinWithCode, loadSessions, normalizeServerUrl, parseInvite, resume, type MpSession } from '../game/multiplayer.ts';
import type { SaveMeta } from '../game/protocol.ts';
import { localStorageSet, receiveSnapshot, setUi, toast } from '../game/store.ts';
import { Avatar, Modal } from '../ui/components.tsx';
import { CharacterEditor, DEFAULT_LOOK, randomLook } from '../ui/CharacterEditor.tsx';
import { countryName } from '../ui/format.ts';
import { askConfirm } from '../ui/confirm.tsx';

const DIFF_TEXT: Record<Exclude<DifficultyId, 'custom'>, string> = {
  easy: 'Mehr Startkapital, höhere Margen, weniger Pannen',
  normal: 'Ausgewogene, realistische Herausforderung',
  realistic: 'Knappes Kapital, harte Liquidität, mehr Risiko',
};

let localHost: LocalHost | null = null;
/** „Später“ gilt bis zum nächsten Programmstart (nicht bei jeder Rückkehr ins Hauptmenü erneut fragen) */
let updatePostponed = false;

/** Release-Notes (Markdown-Auszug aus dem Changelog): Aufzählungen mit Einrückung und **fett** */
function ReleaseNotes({ text }: { text: string }) {
  const inline = (t: string) => t.split(/(\*\*[^*]+\*\*)/).map((part, i) => (/^\*\*[^*]+\*\*$/.test(part) ? <b key={i}>{part.slice(2, -2)}</b> : part));
  return (
    <ul className="notes-list">
      {text.split('\n').filter((l) => l.trim()).map((line, i) => {
        const m = line.match(/^(\s*)[-*]\s+(.*)$/);
        const depth = m ? Math.floor(m[1].length / 2) : 0;
        return <li key={i} style={{ marginLeft: depth * 18, listStyle: m ? (depth ? 'circle' : 'disc') : 'none' }}>{inline(m ? m[2] : line)}</li>;
      })}
    </ul>
  );
}
function getLocalHost() {
  localHost ??= new LocalHost({
    onSnapshot: (s) => receiveSnapshot(s.state, s.at, s.playerId),
    onError: (m) => toast('danger', m),
  });
  return localHost;
}

export function Welcome() {
  const [tab, setTab] = useState<'new' | 'load' | 'mp'>('new');
  const [company, setCompany] = useState('Mustermann Logistik');
  const [player, setPlayer] = useState('Alex Mustermann');
  const [hq, setHq] = useState('leipzig');
  const [difficulty, setDifficulty] = useState<DifficultyId>('normal');
  const [custom, setCustom] = useState<Partial<Difficulty>>({ ...DIFFICULTIES.normal });
  const [avatar, setAvatar] = useState<AvatarLook>(DEFAULT_LOOK);
  const [editLook, setEditLook] = useState(false);
  const [age, setAge] = useState(32);
  const [background, setBackground] = useState<CharacterBackground>('career_changer');
  const [saves, setSaves] = useState<SaveMeta[]>([]);
  const [busy, setBusy] = useState(false);
  const [mpMode, setMpMode] = useState<'list' | 'host' | 'join'>('list');
  const [sessions, setSessions] = useState<MpSession[]>(() => loadSessions());
  const [serverAddr, setServerAddr] = useState(() => {
    try {
      return localStorage.getItem('spedsim.joinAddr') ?? '';
    } catch {
      return '';
    }
  });
  const [externalServer, setExternalServer] = useState('');
  const [code, setCode] = useState('');
  const desktop = isDesktop();
  const [version, setVersion] = useState<string | null>(null);
  const [update, setUpdate] = useState<Update | null>(null);
  const [updateProgress, setUpdateProgress] = useState<number | null | undefined>(undefined);
  /** Update-Fenster geschlossen („Später“) → nur noch Hinweis in der Fußzeile */
  const [updateLater, setUpdateLaterState] = useState(updatePostponed);
  const setUpdateLater = (v: boolean) => {
    updatePostponed = v;
    setUpdateLaterState(v);
  };

  useEffect(() => {
    appVersion().then(setVersion);
    checkForUpdate().then(setUpdate);
  }, []);

  async function runUpdate() {
    if (!update) return;
    setUpdateProgress(null);
    try {
      await installUpdate(update, setUpdateProgress);
    } catch (e) {
      setUpdateProgress(undefined);
      toast('danger', `Update fehlgeschlagen: ${(e as Error).message ?? e}`);
    }
  }

  const cities = useMemo(() => [...CITIES].sort((a, b) => a.country.localeCompare(b.country) || a.name.localeCompare(b.name)), []);

  useEffect(() => {
    if (tab === 'load') getLocalHost().listSaves().then(setSaves).catch((e) => toast('danger', e.message));
  }, [tab]);

  async function startNew() {
    setBusy(true);
    try {
      const host = getLocalHost();
      await host.newGame({ companyName: company, hqCityId: hq, difficulty, customDifficulty: difficulty === 'custom' ? custom : undefined, founder: { name: player, character: { name: player, age, avatar, background } } });
      setUi({ host, page: 'dashboard' });
    } catch (e) {
      toast('danger', (e as Error).message);
    }
    setBusy(false);
  }

  async function load(name: string) {
    setBusy(true);
    try {
      const host = getLocalHost();
      await host.load(name);
      setUi({ host, page: 'dashboard' });
    } catch (e) {
      toast('danger', (e as Error).message);
    }
    setBusy(false);
  }

  async function importFile(file: File) {
    try {
      const host = getLocalHost();
      await host.importSave(await file.text());
      setUi({ host, page: 'dashboard' });
    } catch (e) {
      toast('danger', (e as Error).message);
    }
  }

  const character = { name: player, age, avatar, background };

  async function hostNew() {
    setBusy(true);
    try {
      const external = externalServer.trim();
      const url = external ? normalizeServerUrl(external) : await ensureLocalServer();
      connect(url, { t: 'create', companyName: company, hqCityId: hq, difficulty, customDifficulty: difficulty === 'custom' ? custom : undefined, name: player, character }, !external);
    } catch (e) {
      toast('danger', `Server konnte nicht gestartet werden: ${(e as Error).message ?? e}`);
      setUi({ connection: '' });
    }
    setBusy(false);
  }

  function joinNew() {
    let url: string;
    try {
      url = normalizeServerUrl(serverAddr);
    } catch {
      toast('danger', 'Ungültige Server-Adresse.');
      return;
    }
    localStorageSet('spedsim.joinAddr', serverAddr);
    joinWithCode(url, code.trim(), player, character);
  }

  async function resumeSession(s: MpSession) {
    setBusy(true);
    try {
      await resume(s);
    } catch (e) {
      toast('danger', `Server konnte nicht gestartet werden: ${(e as Error).message ?? e}`);
      setUi({ connection: '' });
    }
    setBusy(false);
  }

  return (
    <div className="welcome">
      <div className="welcome-card">
        <div className="card hero" style={{ padding: 28 }}>
          <img src="/icon.svg" alt="" width={72} height={72} style={{ marginBottom: 14 }} />
          <h1 className="wordmark">Cargo<span>via</span></h1>
          <div className="dim" style={{ marginTop: -4, marginBottom: 12, letterSpacing: 0.4 }}>Logistik-Simulation Europa</div>
          <p>
            Gründe deine eigene Spedition mit einem gebrauchten LKW, einem Fahrer und wenig Kapital. Finde lohnende Aufträge,
            disponiere Fahrten über echte europäische Straßen, verfolge deine LKW live auf der Karte und baue Schritt für Schritt
            ein internationales Logistikunternehmen auf – allein oder gemeinsam mit Freunden.
          </p>
          <div className="feature-list">
            <div className="feature"><Map size={18} />Live-Europakarte mit echten Straßenrouten (OpenStreetMap)</div>
            <div className="feature"><Truck size={18} />Disposition mit Lenk- und Ruhezeiten, Konfliktprüfung</div>
            <div className="feature"><Wallet size={18} />Rechnungen, Zahlungsziele, Liquidität, Maut, Diesel</div>
            <div className="feature"><Users size={18} />Fahrer mit Erfahrung, Qualifikationen und Zufriedenheit</div>
            <div className="feature"><Home size={18} />Getrenntes Privat- und Firmenvermögen</div>
            <div className="feature"><Network size={18} />Kooperativer Multiplayer (serverautoritativ)</div>
          </div>
        </div>

        <div className="card" style={{ padding: 22 }}>
          <div className="tabs">
            <button className={`tab ${tab === 'new' ? 'active' : ''}`} onClick={() => setTab('new')}><Plus size={15} />Neue Firma</button>
            <button className={`tab ${tab === 'load' ? 'active' : ''}`} onClick={() => setTab('load')}><Play size={15} />Laden</button>
            <button className={`tab ${tab === 'mp' ? 'active' : ''}`} onClick={() => { setTab('mp'); setMpMode('list'); setSessions(loadSessions()); }}><Network size={15} />Multiplayer</button>
          </div>

          {(tab === 'new' || (tab === 'mp' && mpMode !== 'list')) && (
            <>
              {editLook && <CharacterEditor value={avatar} name={player} onSave={setAvatar} onClose={() => setEditLook(false)} />}
              <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
                <button className="avatar-edit" title="Aussehen gestalten" onClick={() => setEditLook(true)}>
                  <Avatar size={84} avatar={avatar} />
                  <span><Pencil size={12} /> Aussehen</span>
                </button>
                <div style={{ flex: 1 }}>
                  <div className="field">
                    <label>Dein Name (Geschäftsführer/in)</label>
                    <input className="input" value={player} onChange={(e) => setPlayer(e.target.value)} />
                  </div>
                  <div className="row wrap" style={{ gap: 6 }}>
                    <button className="btn small" onClick={() => setEditLook(true)}><Pencil size={13} />Aussehen gestalten</button>
                    <button className="btn small" title="Zufälliges Aussehen" onClick={() => setAvatar(randomLook())}><Dices size={13} /></button>
                    <label className="dim" style={{ fontSize: 12.5 }}>Alter</label>
                    <input className="input" type="number" min={21} max={65} value={age} onChange={(e) => setAge(Number(e.target.value))} style={{ width: 80 }} title="Alter" />
                  </div>
                  <div className="field mt">
                    <label>Hintergrund</label>
                    <select className="input" value={background} onChange={(e) => setBackground(e.target.value as CharacterBackground)} title={BACKGROUNDS[background].text}>
                      {(Object.keys(BACKGROUNDS) as CharacterBackground[]).map((b) => <option key={b} value={b}>{BACKGROUNDS[b].name}</option>)}
                    </select>
                    <small className="dim">{BACKGROUNDS[background].text}</small>
                  </div>
                </div>
              </div>
              {tab === 'new' || mpMode === 'host' ? (
                <>
                  <div className="field mt">
                    <label>Firmenname</label>
                    <input className="input" value={company} onChange={(e) => setCompany(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Firmensitz</label>
                    <select className="input" value={hq} onChange={(e) => setHq(e.target.value)}>
                      {cities.map((c) => (
                        <option key={c.id} value={c.id}>{countryName(c.country)} – {c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Schwierigkeitsgrad</label>
                    <div className="seg">
                      {(['easy', 'normal', 'realistic'] as const).map((d) => (
                        <button key={d} className={difficulty === d ? 'active' : ''} onClick={() => setDifficulty(d)}>
                          <b>{DIFFICULTY_LABEL[d]}</b>
                          <small>{formatMoney(DIFFICULTIES[d].startCapital)} · {DIFF_TEXT[d]}</small>
                        </button>
                      ))}
                      <button className={difficulty === 'custom' ? 'active' : ''} onClick={() => setDifficulty('custom')}>
                        <b>{DIFFICULTY_LABEL.custom}</b>
                        <small>Startkapital, Margen, Ereignisse und Zahlungsrisiko selbst festlegen</small>
                      </button>
                    </div>
                    {difficulty === 'custom' && <CustomDifficulty value={custom} onChange={setCustom} />}
                  </div>
                </>
              ) : null}
            </>
          )}

          {tab === 'new' && (
            <button className="btn primary" style={{ width: '100%', justifyContent: 'center', padding: 11 }} disabled={busy || !company.trim() || !player.trim()} onClick={startNew}>
              <Truck size={16} /> Spedition gründen
            </button>
          )}

          {tab === 'load' && (
            <>
              {saves.length === 0 && <div className="empty">Noch keine Spielstände vorhanden.</div>}
              <div className="list">
                {saves.map((s) => (
                  <div key={s.name} className="list-item" style={{ alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <b>{s.name}</b> {s.auto && <span className="badge">Auto</span>}
                      <div className="dim" style={{ fontSize: 12 }}>
                        Spielzeit {formatDateTime(s.time)} · Konto {formatMoney(s.balance)} · gespeichert {new Date(s.savedAt).toLocaleString('de-DE')}
                      </div>
                    </div>
                    <button className="btn small primary" disabled={busy} onClick={() => load(s.name)}><Play size={14} />Laden</button>
                    <button className="icon-btn" title="Löschen" onClick={async () => {
                      if (!(await askConfirm(<>Der Spielstand <b>„{s.name}“</b> wird endgültig gelöscht. Das lässt sich nicht rückgängig machen.</>, { title: 'Spielstand löschen?', confirmLabel: 'Löschen', danger: true }))) return;
                      await getLocalHost().deleteSave(s.name);
                      setSaves(await getLocalHost().listSaves());
                    }}><Trash2 size={16} /></button>
                  </div>
                ))}
              </div>
              <label className="btn mt" style={{ cursor: 'pointer' }}>
                <Upload size={15} /> Spielstand-Datei importieren
                <input type="file" accept=".json,.spedsim" hidden onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
              </label>
            </>
          )}

          {tab === 'mp' && mpMode === 'list' && (
            <>
              <div className="row">
                <button className="btn primary" onClick={() => setMpMode('host')}><Server size={15} />Neue Firma hosten</button>
                <button className="btn" onClick={() => setMpMode('join')}><LogIn size={15} />Einer Firma beitreten</button>
              </div>
              <div className="card-title mt">Meine Multiplayer-Firmen</div>
              {sessions.length === 0 && <div className="empty">Noch keine Multiplayer-Firmen. Hoste eine neue Firma oder tritt mit einem Einladungscode bei.</div>}
              <div className="list">
                {sessions.map((s) => (
                  <div key={s.gameId} className="list-item" style={{ alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <b>{s.company || 'Multiplayer-Firma'}</b>{' '}
                      {s.hosted ? <span className="badge info">auf diesem PC</span> : <span className="badge">beigetreten</span>}
                      <div className="dim" style={{ fontSize: 12 }}>
                        Code {s.inviteCode} · {s.hosted ? 'Server startet automatisch' : /trycloudflare/.test(s.url) ? 'Internet – Adresse des Hosts wird automatisch gesucht' : s.url.replace(/^wss?:\/\//, '')} · zuletzt {new Date(s.lastPlayed).toLocaleString('de-DE')}
                      </div>
                    </div>
                    <button className="btn small primary" disabled={busy} onClick={() => resumeSession(s)}><Play size={14} />Fortsetzen</button>
                    <button className="icon-btn" title="Aus der Liste entfernen" onClick={async () => {
                      if (!(await askConfirm(<><b>„{s.company || 'Multiplayer-Firma'}“</b> wird aus der Liste entfernt. Der Spielstand bleibt auf dem Server, ohne die gemerkten Zugangsdaten kannst du ihn aber nicht mehr als dieser Spieler öffnen.</>, { title: 'Firma entfernen?', confirmLabel: 'Entfernen', danger: true }))) return;
                      forgetSession(s.gameId);
                      setSessions(loadSessions());
                    }}><Trash2 size={16} /></button>
                  </div>
                ))}
              </div>
              {!desktop && <p className="dim" style={{ fontSize: 12.5 }}>Browser-Version: Zum Hosten muss der Server laufen (<code>npm run server</code>). In der Desktop-App startet er automatisch.</p>}
            </>
          )}

          {tab === 'mp' && mpMode === 'host' && (
            <>
              <details className="mb">
                <summary className="dim" style={{ cursor: 'pointer', fontSize: 12.5 }}>Erweitert: auf einem externen Server gründen</summary>
                <div className="field mt">
                  <label>Server-Adresse (leer = auf diesem PC hosten)</label>
                  <input className="input" value={externalServer} onChange={(e) => setExternalServer(e.target.value)} placeholder="z. B. meinserver.de:8787" />
                </div>
              </details>
              <div className="row">
                <button className="btn" onClick={() => setMpMode('list')}>Zurück</button>
                <button className="btn primary" style={{ flex: 1, justifyContent: 'center' }} disabled={busy || !company.trim() || !player.trim()} onClick={hostNew}>
                  <Server size={15} /> {externalServer.trim() ? 'Firma auf Server gründen' : 'Firma gründen & Server starten'}
                </button>
              </div>
              <p className="dim" style={{ fontSize: 12.5 }}>
                {desktop
                  ? 'Der Spielserver läuft auf deinem PC, solange das Spiel geöffnet ist. Freunde verbinden sich mit deiner Adresse und dem Einladungscode (siehe „Team & Kommunikation“).'
                  : 'Browser-Version: Der Server muss bereits laufen (npm run server).'}
              </p>
            </>
          )}

          {tab === 'mp' && mpMode === 'join' && (
            <>
              <div className="field mt">
                <label>Einladung oder Adresse des Hosts</label>
                <input
                  className="input"
                  value={serverAddr}
                  onChange={(e) => {
                    // eingefügte Internet-Einladung "adresse/CODE" automatisch aufteilen
                    const inv = parseInvite(e.target.value);
                    if (inv) {
                      setServerAddr(inv.addr);
                      setCode(inv.code);
                    } else setServerAddr(e.target.value);
                  }}
                  placeholder="Einladung einfügen, z. B. abc-xyz.trycloudflare.com/K7Q-2MX"
                />
              </div>
              <div className="field">
                <label>Einladungscode</label>
                <input className="input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="z. B. K7Q-2MX" />
              </div>
              <div className="row">
                <button className="btn" onClick={() => setMpMode('list')}>Zurück</button>
                <button className="btn primary" style={{ flex: 1, justifyContent: 'center' }} disabled={!code.trim() || !player.trim()} onClick={joinNew}><LogIn size={15} />Beitreten</button>
              </div>
              <p className="dim" style={{ fontSize: 12.5 }}>
                Die Einladung bekommst du vom Host (Team &amp; Kommunikation → „Internet-Einladung kopieren“). Bist du der Firma schon einmal beigetreten,
                spielst du mit einer neuen Einladung als derselbe Spieler weiter.
              </p>
            </>
          )}
        </div>
      </div>
      <footer className="welcome-footer">
        <span>© {new Date().getFullYear()} Nebomuck · Alle Rechte vorbehalten</span>
        {(version || update) && (
          <span>
            {version && `Version ${version}`}
            {update ? (
              <button className="link-btn" onClick={() => setUpdateLater(false)}><Download size={12} />Update {update.version} verfügbar</button>
            ) : (
              ' · aktuell'
            )}
          </span>
        )}
      </footer>
      {update && !updateLater && (
        <Modal
          title={<><Download size={18} style={{ verticalAlign: -3, marginRight: 8 }} />Update verfügbar</>}
          width={560}
          onClose={() => updateProgress === undefined && setUpdateLater(true)}
          footer={
            <>
              <button className="btn" disabled={updateProgress !== undefined} onClick={() => setUpdateLater(true)}>Später</button>
              <button className="btn primary" disabled={updateProgress !== undefined} onClick={runUpdate}>
                {updateProgress === undefined ? 'Jetzt aktualisieren' : updateProgress === null ? 'Wird geladen …' : updateProgress >= 1 ? 'Wird installiert …' : `Wird geladen … ${Math.round(updateProgress * 100)} %`}
              </button>
            </>
          }
        >
          <p style={{ marginTop: 0 }}>
            <b>Cargovia {update.version}</b> ist verfügbar{version && <span className="dim"> (installiert: {version})</span>}.
          </p>
          {update.body && (
            <div className="update-notes">
              <div className="dim mb" style={{ fontSize: 12 }}>Neu in dieser Version</div>
              <ReleaseNotes text={update.body} />
            </div>
          )}
          {updateProgress !== undefined && (
            <>
              <div className="bar good mt" style={{ height: 6 }}><div style={{ width: `${Math.round((updateProgress ?? 0) * 100)}%` }} /></div>
              <p className="dim" style={{ fontSize: 12, marginBottom: 0 }}>Das Spiel schließt sich kurz und startet nach der Installation neu. Spielstände bleiben erhalten.</p>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}

/** Benutzerdefinierter Schwierigkeitsgrad */
function CustomDifficulty({ value, onChange }: { value: Partial<Difficulty>; onChange: (v: Partial<Difficulty>) => void }) {
  const pct = (v = 1) => `${Math.round(v * 100)} %`;
  const rows: { key: 'startCapital' | 'rateFactor' | 'eventFactor' | 'paymentRiskFactor'; label: string; step: number; fmt: (v?: number) => string; hint: string }[] = [
    { key: 'startCapital', label: 'Startkapital', step: 5_000_00, fmt: (v = 0) => formatMoney(v), hint: '' },
    { key: 'rateFactor', label: 'Frachtraten', step: 0.02, fmt: pct, hint: 'Marge je Auftrag' },
    { key: 'eventFactor', label: 'Ereignisse & Pannen', step: 0.1, fmt: pct, hint: 'Pannen, Unfälle, Störungen, negative Ereignisse' },
    { key: 'paymentRiskFactor', label: 'Zahlungsrisiko', step: 0.1, fmt: pct, hint: 'verspätete Zahlungen und Ausfälle' },
  ];
  return (
    <div className="custom-diff mt">
      {rows.map((r) => (
        <label key={r.key} title={r.hint}>
          <span>{r.label}</span>
          <input
            type="range"
            min={CUSTOM_LIMITS[r.key][0]}
            max={CUSTOM_LIMITS[r.key][1]}
            step={r.step}
            value={value[r.key] ?? 0}
            onChange={(e) => onChange({ ...value, [r.key]: Number(e.target.value) })}
          />
          <b>{r.fmt(value[r.key])}</b>
        </label>
      ))}
      <label className="check">
        <input type="checkbox" checked={!!value.startTruckOwned} onChange={(e) => onChange({ ...value, startTruckOwned: e.target.checked })} />
        Start-LKW gehört der Firma (sonst geleast)
      </label>
    </div>
  );
}

