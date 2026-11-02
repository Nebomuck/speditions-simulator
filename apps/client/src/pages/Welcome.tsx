// Startbildschirm: Firma gründen, Spielstand laden, Multiplayer-Firma erstellen oder beitreten.

import { useEffect, useMemo, useState } from 'react';
import { Truck, Map, Users, Wallet, Home, Network, Upload, Trash2, Play, LogIn, Plus } from 'lucide-react';
import { CITIES, DIFFICULTIES, DIFFICULTY_LABEL, formatDateTime, formatMoney, type DifficultyId } from '@spedsim/core';
import { LocalHost, RemoteHost } from '../game/host.ts';
import type { SaveMeta } from '../game/protocol.ts';
import { localStorageSet, receiveSnapshot, setUi, toast } from '../game/store.ts';
import { Avatar } from '../ui/components.tsx';
import { countryName } from '../ui/format.ts';

const DIFF_TEXT: Record<Exclude<DifficultyId, 'custom'>, string> = {
  easy: 'Mehr Startkapital, höhere Margen, weniger Pannen',
  normal: 'Ausgewogene, realistische Herausforderung',
  realistic: 'Knappes Kapital, harte Liquidität, mehr Risiko',
};

let localHost: LocalHost | null = null;
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
  const [difficulty, setDifficulty] = useState<Exclude<DifficultyId, 'custom'>>('normal');
  const [avatar, setAvatar] = useState({ skin: 1, hair: 1, hairColor: 1, shirt: 0 });
  const [age, setAge] = useState(32);
  const [saves, setSaves] = useState<SaveMeta[]>([]);
  const [busy, setBusy] = useState(false);
  const [serverUrl, setServerUrl] = useState(() => {
    try {
      return localStorage.getItem('spedsim.server') ?? 'ws://localhost:8787';
    } catch {
      return 'ws://localhost:8787';
    }
  });
  const [code, setCode] = useState('');

  const cities = useMemo(() => [...CITIES].sort((a, b) => a.country.localeCompare(b.country) || a.name.localeCompare(b.name)), []);

  useEffect(() => {
    if (tab === 'load') getLocalHost().listSaves().then(setSaves).catch((e) => toast('danger', e.message));
  }, [tab]);

  async function startNew() {
    setBusy(true);
    try {
      const host = getLocalHost();
      await host.newGame({ companyName: company, hqCityId: hq, difficulty, founder: { name: player, character: { name: player, age, avatar } } });
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

  function connect(hello: Record<string, unknown>) {
    localStorageSet('spedsim.server', serverUrl);
    let started = false;
    const host: RemoteHost = new RemoteHost(serverUrl, hello, {
      onSnapshot: (s) => {
        receiveSnapshot(s.state, s.at, s.playerId);
        if (!started) {
          started = true;
          setUi({ host, page: 'dashboard' });
        }
      },
      onError: (m) => toast('danger', m),
      onStatus: (st) => setUi({ connection: st }),
      onWelcome: (w) => localStorageSet('spedsim.mp', JSON.stringify({ url: serverUrl, ...w })),
    });
  }

  function rejoinLast() {
    try {
      const last = JSON.parse(localStorage.getItem('spedsim.mp') ?? 'null');
      if (last) connect({ t: 'join', code: last.inviteCode, playerId: last.playerId, token: last.token });
    } catch {
      toast('danger', 'Keine gespeicherte Multiplayer-Sitzung gefunden.');
    }
  }

  return (
    <div className="welcome">
      <div className="welcome-card">
        <div className="card hero" style={{ padding: 28 }}>
          <div className="brand-logo" style={{ width: 52, height: 52, borderRadius: 14, marginBottom: 18 }}><Truck size={28} /></div>
          <h1>Speditions-Simulator</h1>
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
            <button className={`tab ${tab === 'mp' ? 'active' : ''}`} onClick={() => setTab('mp')}><Network size={15} />Multiplayer</button>
          </div>

          {(tab === 'new' || tab === 'mp') && (
            <>
              <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
                <Avatar size={64} avatar={avatar} />
                <div style={{ flex: 1 }}>
                  <div className="field">
                    <label>Dein Name (Geschäftsführer/in)</label>
                    <input className="input" value={player} onChange={(e) => setPlayer(e.target.value)} />
                  </div>
                  <div className="row wrap" style={{ gap: 6 }}>
                    {(['skin', 'hair', 'hairColor', 'shirt'] as const).map((k) => (
                      <button key={k} className="btn small" onClick={() => setAvatar((a) => ({ ...a, [k]: (a[k] + 1) % 6 }))}>
                        {{ skin: 'Hautton', hair: 'Frisur', hairColor: 'Haarfarbe', shirt: 'Kleidung' }[k]}
                      </button>
                    ))}
                    <input className="input" type="number" min={21} max={65} value={age} onChange={(e) => setAge(Number(e.target.value))} style={{ width: 80 }} title="Alter" />
                  </div>
                </div>
              </div>
              {tab === 'new' || !code ? (
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
                    </div>
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
                      if (!confirm(`Spielstand „${s.name}“ endgültig löschen?`)) return;
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

          {tab === 'mp' && (
            <>
              <div className="field mt">
                <label>Server-Adresse</label>
                <input className="input" value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} placeholder="ws://localhost:8787" />
              </div>
              <div className="field">
                <label>Einladungscode (zum Beitreten) – leer lassen, um eine neue Multiplayer-Firma zu gründen</label>
                <input className="input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="z. B. K7Q-2MX" />
              </div>
              <div className="row">
                {code ? (
                  <button className="btn primary" onClick={() => connect({ t: 'join', code, name: player, character: { name: player, age, avatar } })}><LogIn size={15} />Beitreten</button>
                ) : (
                  <button className="btn primary" onClick={() => connect({ t: 'create', companyName: company, hqCityId: hq, difficulty, name: player, character: { name: player, age, avatar } })}><Plus size={15} />Multiplayer-Firma gründen</button>
                )}
                <button className="btn" onClick={rejoinLast}>Letzte Sitzung fortsetzen</button>
              </div>
              <p className="dim" style={{ fontSize: 12.5 }}>Den Server startest du mit <code>npm run server</code>. Freunde treten mit dem Einladungscode bei.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
