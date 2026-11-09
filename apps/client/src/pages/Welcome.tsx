// Startbildschirm: Übersicht der eigenen Speditionen (Einzelspieler-Spielstände und Multiplayer-Firmen
// mit Online-Status), dazu Gründen, Hosten, Beitreten und Importieren.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowLeft, ChevronDown, ChevronUp, Dices, Download, Flag, Globe, LogIn, Map, Network, Pencil, Play, Plus, RefreshCw, Server, Trash2, Truck, Upload, User, Users, Wallet,
} from 'lucide-react';
import {
  BACKGROUNDS, CITIES, CUSTOM_LIMITS, DIFFICULTIES, DIFFICULTY_LABEL, SCENARIOS, SCENARIO_IDS, formatDateTime, formatMoney,
  type AvatarLook, type CharacterBackground, type Difficulty, type DifficultyId, type ScenarioId,
} from '@spedsim/core';
import { LocalHost } from '../game/host.ts';
import { appVersion, checkForUpdate, installUpdate, type Update } from '../game/updater.ts';
import { checkOnline, connect, ensureLocalServer, forgetSession, isDesktop, joinWithCode, loadSessions, normalizeServerUrl, parseInvite, resume, type MpSession } from '../game/multiplayer.ts';
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

/** Online-Status wird so oft neu geprüft, solange die Übersicht offen ist */
const ONLINE_REFRESH_MS = 60_000;

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

// ---------- Übersicht ----------

type Company =
  | { kind: 'sp'; key: string; name: string; last: string; latest: SaveMeta; saves: SaveMeta[] }
  | { kind: 'mp'; key: string; name: string; last: string; session: MpSession };

type Online = 'checking' | 'online' | 'offline';

/** Spielstände je Firma zusammenfassen (neuester zuerst); ältere Spielstände ohne Kennung nach Firmenname */
function groupSaves(saves: SaveMeta[]): Company[] {
  const groups: Record<string, SaveMeta[]> = {};
  for (const s of saves) (groups[s.seed !== undefined ? `seed:${s.seed}` : `name:${s.company}`] ??= []).push(s);
  return Object.entries(groups).map(([key, list]) => {
    const sorted = [...list].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
    return { kind: 'sp', key, name: sorted[0].company, last: sorted[0].savedAt, latest: sorted[0], saves: sorted };
  });
}

function ago(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min} Min.`;
  const h = Math.round(min / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.round(h / 24);
  if (d === 1) return 'gestern';
  if (d < 14) return `vor ${d} Tagen`;
  return new Date(iso).toLocaleDateString('de-DE');
}

/** kleine Kennzahlen einer Firma */
function Facts({ time, balance, vehicles, level, players }: { time?: number; balance?: number; vehicles?: number; level?: number; players?: number }) {
  return (
    <div className="co-facts">
      {time !== undefined && <span title="Spielzeit">{formatDateTime(time).slice(3)}</span>}
      {balance !== undefined && <span title="Firmenkonto" className={balance < 0 ? 'neg' : ''}><Wallet size={12} />{formatMoney(balance)}</span>}
      {vehicles !== undefined && <span title="Fahrzeuge"><Truck size={12} />{vehicles}</span>}
      {level !== undefined && <span title="Unternehmensstufe">Stufe {level}</span>}
      {players !== undefined && <span title="Spieler"><Users size={12} />{players}</span>}
    </div>
  );
}

function OnlineBadge({ s, state }: { s: MpSession; state: Online | undefined }) {
  if (!state || state === 'checking') return <span className="online-dot checking">wird geprüft …</span>;
  if (s.hosted) return state === 'online' ? <span className="online-dot on">Server läuft</span> : <span className="online-dot idle">Du bist Host · startet beim Fortsetzen</span>;
  return state === 'online' ? <span className="online-dot on">Host online</span> : <span className="online-dot off">Host offline</span>;
}

function CompanyCard({ c, online, busy, onPlay, onLoad, onDelete, onDeleteSave }: {
  c: Company;
  online?: Online;
  busy: boolean;
  onPlay(): void;
  onLoad(name: string): void;
  onDelete(): void;
  onDeleteSave(name: string): void;
}) {
  const [open, setOpen] = useState(false);
  const mp = c.kind === 'mp';
  const meta = c.kind === 'sp' ? c.latest : undefined;
  const sum = c.kind === 'mp' ? c.session.summary : undefined;
  const joinBlocked = mp && !c.session.hosted && online === 'offline';
  return (
    <div className={`co-card ${mp ? 'mp' : 'sp'}`}>
      <div className="co-head">
        <div className="co-icon">{mp ? <Network size={18} /> : <Truck size={18} />}</div>
        <div className="co-title">
          <b title={c.name}>{c.name || 'Multiplayer-Firma'}</b>
          <div className="co-tags">
            <span className={`co-kind ${mp ? 'mp' : 'sp'}`}>{mp ? 'Multiplayer' : 'Einzelspieler'}</span>
            {c.kind === 'mp' && <span className="co-sub">{c.session.hosted ? 'gehostet auf diesem PC' : 'beigetreten'}</span>}
            {meta?.scenario && meta.scenario !== 'free' && <span className="co-sub"><Flag size={11} /> {SCENARIOS[meta.scenario as ScenarioId]?.name ?? meta.scenario}</span>}
            {meta?.difficulty && <span className="co-sub">{DIFFICULTY_LABEL[meta.difficulty as DifficultyId] ?? meta.difficulty}</span>}
          </div>
        </div>
        <button className="icon-btn co-del" title={mp ? 'Aus der Liste entfernen' : 'Firma mit allen Spielständen löschen'} onClick={onDelete}><Trash2 size={15} /></button>
      </div>

      {meta && <Facts time={meta.time} balance={meta.balance} vehicles={meta.vehicles} level={meta.level} />}
      {sum && <Facts time={sum.time} balance={sum.balance} vehicles={sum.vehicles} level={sum.level} players={sum.players} />}
      {c.kind === 'mp' && !sum && <div className="co-facts dim">Code {c.session.inviteCode}</div>}

      <div className="co-foot">
        <div className="co-meta">
          {c.kind === 'mp' && <OnlineBadge s={c.session} state={online} />}
          <span className="dim">zuletzt {ago(c.last)}</span>
        </div>
        <button className="btn primary small" disabled={busy || joinBlocked} title={joinBlocked ? 'Der Host ist gerade nicht online.' : undefined} onClick={onPlay}>
          <Play size={14} />{mp && !c.session.hosted ? 'Verbinden' : 'Weiterspielen'}
        </button>
      </div>

      {c.kind === 'sp' && c.saves.length > 1 && (
        <>
          <button className="co-more" onClick={() => setOpen(!open)}>
            {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />} {c.saves.length} Spielstände
          </button>
          {open && (
            <div className="co-saves">
              {c.saves.map((s) => (
                <div key={s.name} className="co-save">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="ellipsis">{s.name} {s.auto && <span className="badge">Auto</span>}</div>
                    <small className="dim">{formatDateTime(s.time).slice(3)} · {formatMoney(s.balance)} · {ago(s.savedAt)}</small>
                  </div>
                  <button className="btn small" disabled={busy} onClick={() => onLoad(s.name)}>Laden</button>
                  <button className="icon-btn" title="Spielstand löschen" onClick={() => onDeleteSave(s.name)}><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------- Startbildschirm ----------

type View = 'home' | 'new' | 'host' | 'join';
type Filter = 'all' | 'sp' | 'mp';

export function Welcome() {
  const [view, setView] = useState<View>('home');
  const [filter, setFilter] = useState<Filter>('all');
  const [company, setCompany] = useState('Mustermann Logistik');
  const [player, setPlayer] = useState('Alex Mustermann');
  const [hq, setHq] = useState('leipzig');
  const [difficulty, setDifficulty] = useState<DifficultyId>('normal');
  const [scenario, setScenario] = useState<ScenarioId>('free');
  const [custom, setCustom] = useState<Partial<Difficulty>>({ ...DIFFICULTIES.normal });
  const [avatar, setAvatar] = useState<AvatarLook>(DEFAULT_LOOK);
  const [editLook, setEditLook] = useState(false);
  const [age, setAge] = useState(32);
  const [background, setBackground] = useState<CharacterBackground>('career_changer');
  const [saves, setSaves] = useState<SaveMeta[]>([]);
  const [busy, setBusy] = useState(false);
  const [sessions, setSessions] = useState<MpSession[]>(() => loadSessions());
  const [online, setOnline] = useState<Record<string, Online>>({});
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
  /** Update-Fenster geschlossen („Später“) → nur noch Hinweis in der Kopfzeile */
  const [updateLater, setUpdateLaterState] = useState(updatePostponed);
  const setUpdateLater = (v: boolean) => {
    updatePostponed = v;
    setUpdateLaterState(v);
  };

  useEffect(() => {
    appVersion().then(setVersion);
    checkForUpdate().then(setUpdate);
  }, []);

  const refreshSaves = useCallback(() => getLocalHost().listSaves().then(setSaves).catch((e) => toast('danger', e.message)), []);
  useEffect(() => {
    if (view === 'home') {
      refreshSaves();
      setSessions(loadSessions());
    }
  }, [view, refreshSaves]);

  // Online-Status der Multiplayer-Firmen (parallel, regelmäßig neu)
  const checkAll = useCallback(async (list: MpSession[]) => {
    setOnline((o) => Object.fromEntries(list.map((s) => [s.gameId, o[s.gameId] ?? 'checking'])));
    await Promise.all(
      list.map(async (s) => {
        const ok = await checkOnline(s).catch(() => false);
        setOnline((o) => ({ ...o, [s.gameId]: ok ? 'online' : 'offline' }));
      }),
    );
  }, []);
  useEffect(() => {
    if (view !== 'home' || !sessions.length) return;
    checkAll(sessions);
    const t = setInterval(() => checkAll(sessions), ONLINE_REFRESH_MS);
    return () => clearInterval(t);
  }, [view, sessions, checkAll]);

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

  const companies = useMemo<Company[]>(() => {
    const mp: Company[] = sessions.map((s) => ({ kind: 'mp', key: `mp:${s.gameId}`, name: s.company, last: s.lastPlayed, session: s }));
    return [...groupSaves(saves), ...mp].sort((a, b) => b.last.localeCompare(a.last));
  }, [saves, sessions]);
  const shown = companies.filter((c) => filter === 'all' || c.kind === filter);
  const count = (k: 'sp' | 'mp') => companies.filter((c) => c.kind === k).length;

  async function startNew() {
    setBusy(true);
    try {
      const host = getLocalHost();
      await host.newGame({ companyName: company, hqCityId: hq, difficulty, customDifficulty: difficulty === 'custom' ? custom : undefined, scenario, founder: { name: player, character: { name: player, age, avatar, background } } });
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
      connect(url, { t: 'create', companyName: company, hqCityId: hq, difficulty, customDifficulty: difficulty === 'custom' ? custom : undefined, scenario, name: player, character }, !external);
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

  async function deleteCompany(c: Company) {
    if (c.kind === 'mp') {
      if (!(await askConfirm(<><b>„{c.name || 'Multiplayer-Firma'}“</b> wird aus der Liste entfernt. Der Spielstand bleibt auf dem Server, ohne die gemerkten Zugangsdaten kannst du ihn aber nicht mehr als dieser Spieler öffnen.</>, { title: 'Firma entfernen?', confirmLabel: 'Entfernen', danger: true }))) return;
      forgetSession(c.session.gameId);
      setSessions(loadSessions());
      return;
    }
    const n = c.saves.length;
    if (!(await askConfirm(<>Die Firma <b>„{c.name}“</b> wird mit {n === 1 ? 'ihrem Spielstand' : `allen ${n} Spielständen`} endgültig gelöscht. Das lässt sich nicht rückgängig machen.</>, { title: 'Firma löschen?', confirmLabel: 'Löschen', danger: true }))) return;
    for (const s of c.saves) await getLocalHost().deleteSave(s.name);
    refreshSaves();
  }

  async function deleteSave(name: string) {
    if (!(await askConfirm(<>Der Spielstand <b>„{name}“</b> wird endgültig gelöscht. Das lässt sich nicht rückgängig machen.</>, { title: 'Spielstand löschen?', confirmLabel: 'Löschen', danger: true }))) return;
    await getLocalHost().deleteSave(name);
    refreshSaves();
  }

  const importButton = (
    <label className="start-action ghost">
      <Upload size={18} />
      <span><b>Spielstand importieren</b><small>Datei von einem anderen PC</small></span>
      <input type="file" accept=".json,.spedsim" hidden onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
    </label>
  );

  const viewTitle: Record<Exclude<View, 'home'>, { title: string; text: string; icon: ReactNode }> = {
    new: { title: 'Neue Spedition gründen', text: 'Einzelspieler · wird auf diesem PC gespeichert', icon: <Plus size={18} /> },
    host: { title: 'Multiplayer-Firma hosten', text: desktop ? 'Der Server läuft auf deinem PC, solange das Spiel geöffnet ist.' : 'Browser-Version: Der Server muss bereits laufen (npm run server).', icon: <Server size={18} /> },
    join: { title: 'Einer Firma beitreten', text: 'Mit der Einladung des Hosts', icon: <LogIn size={18} /> },
  };

  return (
    <div className="start">
      <header className="start-head">
        <div className="start-brand">
          <img src="/icon.svg" alt="" width={40} height={40} />
          <div>
            <div className="wordmark small">Cargo<span>via</span></div>
            <div className="dim start-tag">Logistik-Simulation Europa</div>
          </div>
        </div>
        <div className="start-version">
          {version && <span className="dim">Version {version}</span>}
          {update ? (
            <button className="btn small" onClick={() => setUpdateLater(false)}><Download size={13} />Update {update.version}</button>
          ) : version ? (
            <span className="dim">· aktuell</span>
          ) : null}
        </div>
      </header>

      {view === 'home' ? (
        <main className="start-main">
          <aside className="start-actions">
            <button className="start-action primary" onClick={() => setView('new')}>
              <Plus size={20} />
              <span><b>Neue Spedition gründen</b><small>Einzelspieler</small></span>
            </button>
            <button className="start-action" onClick={() => setView('host')}>
              <Server size={18} />
              <span><b>Multiplayer-Firma hosten</b><small>Freunde einladen, gemeinsam spielen</small></span>
            </button>
            <button className="start-action" onClick={() => setView('join')}>
              <LogIn size={18} />
              <span><b>Firma beitreten</b><small>mit Einladung oder Code</small></span>
            </button>
            {importButton}
            <div className="start-features">
              <div><Map size={15} />Live-Europakarte mit echten Straßenrouten</div>
              <div><Truck size={15} />Disposition mit Lenk- und Ruhezeiten</div>
              <div><Wallet size={15} />Rechnungen, Liquidität, Maut, Diesel</div>
              <div><Globe size={15} />Kooperativer Multiplayer übers Internet</div>
            </div>
          </aside>

          <section className="start-list">
            <div className="start-list-head">
              <h2>Meine Speditionen</h2>
              <div className="seg-mini">
                <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>Alle {companies.length}</button>
                <button className={filter === 'sp' ? 'active' : ''} onClick={() => setFilter('sp')}><User size={12} />Einzelspieler {count('sp')}</button>
                <button className={filter === 'mp' ? 'active' : ''} onClick={() => setFilter('mp')}><Network size={12} />Multiplayer {count('mp')}</button>
              </div>
              {sessions.length > 0 && (
                <button className="icon-btn" title="Online-Status neu prüfen" onClick={() => checkAll(sessions)}><RefreshCw size={15} /></button>
              )}
            </div>
            {companies.length === 0 ? (
              <div className="start-empty">
                <Truck size={36} />
                <h3>Willkommen bei Cargovia</h3>
                <p>
                  Gründe deine Spedition mit einem gebrauchten LKW, einem Fahrer und wenig Kapital – allein oder mit Freunden.
                  Deine Firmen erscheinen dann hier.
                </p>
                <button className="btn primary" onClick={() => setView('new')}><Plus size={15} />Erste Spedition gründen</button>
              </div>
            ) : shown.length === 0 ? (
              <div className="empty">Keine {filter === 'sp' ? 'Einzelspieler' : 'Multiplayer'}-Firmen.</div>
            ) : (
              <div className="co-grid">
                {shown.map((c) => (
                  <CompanyCard
                    key={c.key}
                    c={c}
                    online={c.kind === 'mp' ? online[c.session.gameId] : undefined}
                    busy={busy}
                    onPlay={() => (c.kind === 'mp' ? resumeSession(c.session) : load(c.latest.name))}
                    onLoad={load}
                    onDelete={() => deleteCompany(c)}
                    onDeleteSave={deleteSave}
                  />
                ))}
              </div>
            )}
            {!desktop && count('mp') > 0 && <p className="dim" style={{ fontSize: 12 }}>Browser-Version: Für eigene Multiplayer-Firmen muss der Server laufen (<code>npm run server</code>).</p>}
          </section>
        </main>
      ) : (
        <main className="start-form-wrap">
          <div className="card start-form">
            <div className="start-form-head">
              <button className="btn small" onClick={() => setView('home')}><ArrowLeft size={14} />Übersicht</button>
              <div className="start-form-title">
                {viewTitle[view].icon}
                <div>
                  <h2>{viewTitle[view].title}</h2>
                  <small className="dim">{viewTitle[view].text}</small>
                </div>
              </div>
            </div>

            {editLook && <CharacterEditor value={avatar} name={player} onSave={setAvatar} onClose={() => setEditLook(false)} />}
            <div className={view === 'join' ? 'start-form-body single' : 'start-form-body'}>
              <section>
                <h4 className="start-section">Du</h4>
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
                  </div>
                </div>
                <div className="field mt">
                  <label>Hintergrund</label>
                  <select className="input" value={background} onChange={(e) => setBackground(e.target.value as CharacterBackground)} title={BACKGROUNDS[background].text}>
                    {(Object.keys(BACKGROUNDS) as CharacterBackground[]).map((b) => <option key={b} value={b}>{BACKGROUNDS[b].name}</option>)}
                  </select>
                  <small className="dim">{BACKGROUNDS[background].text}</small>
                </div>

                {view === 'join' && (
                  <>
                    <h4 className="start-section">Einladung</h4>
                    <div className="field">
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
                    <p className="dim" style={{ fontSize: 12.5 }}>
                      Die Einladung bekommst du vom Host (Team &amp; Kommunikation → „Internet-Einladung kopieren“). Bist du der Firma schon einmal beigetreten,
                      spielst du mit einer neuen Einladung als derselbe Spieler weiter.
                    </p>
                  </>
                )}
              </section>

              {view !== 'join' && (
                <section>
                  <h4 className="start-section">Firma</h4>
                  <div className="row" style={{ gap: 10 }}>
                    <div className="field" style={{ flex: 1 }}>
                      <label>Firmenname</label>
                      <input className="input" value={company} onChange={(e) => setCompany(e.target.value)} />
                    </div>
                    <div className="field" style={{ flex: 1 }}>
                      <label>Firmensitz</label>
                      <select className="input" value={hq} onChange={(e) => setHq(e.target.value)}>
                        {cities.map((c) => (
                          <option key={c.id} value={c.id}>{countryName(c.country)} – {c.name}</option>
                        ))}
                      </select>
                    </div>
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
                        {/* weicher Trennstrich: schmale Kachel bricht als „Benutzer-definiert“ um */}
                        <b>{DIFFICULTY_LABEL.custom.replace('Benutzer', 'Benutzer­')}</b>
                        <small>Startkapital, Margen, Ereignisse und Zahlungsrisiko selbst festlegen</small>
                      </button>
                    </div>
                    {difficulty === 'custom' && <CustomDifficulty value={custom} onChange={setCustom} />}
                  </div>
                  <div className="field">
                    <label>Spielart</label>
                    <select className="input" value={scenario} onChange={(e) => setScenario(e.target.value as ScenarioId)}>
                      {SCENARIO_IDS.map((id) => (
                        <option key={id} value={id}>
                          {SCENARIOS[id].name}
                          {SCENARIOS[id].months ? ` (${SCENARIOS[id].months} Monate)` : ''}
                        </option>
                      ))}
                    </select>
                    <p className="dim scenario-text">
                      {SCENARIOS[scenario].intro}
                      {scenario !== 'free' && <><br /><b>Ziel:</b> {SCENARIOS[scenario].goal}</>}
                    </p>
                  </div>
                  {view === 'host' && (
                    <details className="mb">
                      <summary className="dim" style={{ cursor: 'pointer', fontSize: 12.5 }}>Erweitert: auf einem externen Server gründen</summary>
                      <div className="field mt">
                        <label>Server-Adresse (leer = auf diesem PC hosten)</label>
                        <input className="input" value={externalServer} onChange={(e) => setExternalServer(e.target.value)} placeholder="z. B. meinserver.de:8787" />
                      </div>
                    </details>
                  )}
                </section>
              )}
            </div>

            <div className="start-form-foot">
              <button className="btn" onClick={() => setView('home')}>Abbrechen</button>
              {view === 'new' && (
                <button className="btn primary" disabled={busy || !company.trim() || !player.trim()} onClick={startNew}><Truck size={16} />Spedition gründen</button>
              )}
              {view === 'host' && (
                <button className="btn primary" disabled={busy || !company.trim() || !player.trim()} onClick={hostNew}>
                  <Server size={15} /> {externalServer.trim() ? 'Firma auf Server gründen' : 'Firma gründen & Server starten'}
                </button>
              )}
              {view === 'join' && (
                <button className="btn primary" disabled={!code.trim() || !player.trim()} onClick={joinNew}><LogIn size={15} />Beitreten</button>
              )}
            </div>
          </div>
        </main>
      )}

      <footer className="welcome-footer start-footer">
        <span>© {new Date().getFullYear()} Nebomuck · Alle Rechte vorbehalten</span>
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
