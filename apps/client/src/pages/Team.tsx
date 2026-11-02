// Team & Kommunikation: Spieler, Rechte, Firmenchat, Ereignisprotokoll.

import { useEffect, useRef, useState } from 'react';
import { Send, Copy, Crown } from 'lucide-react';
import { ALL_PERMISSIONS, PERMISSION_LABEL, formatDateTime, type Permission } from '@spedsim/core';
import { DEFAULT_PORT, localAddress } from '../game/multiplayer.ts';
import { sendCommand, toast, useGame, useUi } from '../game/store.ts';
import { Avatar, Badge, Card, PageHeader } from '../ui/components.tsx';

/** Für den Host: Adresse und Einladungscode, mit denen Freunde beitreten. */
function InviteCard({ code }: { code: string }) {
  const [ip, setIp] = useState<string | null>(null);
  useEffect(() => {
    localAddress().then(setIp);
  }, []);
  const addr = ip ? `${ip}:${DEFAULT_PORT}` : null;
  const copy = (t: string) => {
    navigator.clipboard?.writeText(t);
    toast('success', 'In die Zwischenablage kopiert.');
  };
  return (
    <Card title="Freunde einladen" className="mb">
      <div className="row wrap" style={{ gap: 10 }}>
        {addr && <button className="btn" onClick={() => copy(addr)}><Copy size={15} /> Adresse (Heimnetz): <b>{addr}</b></button>}
        <button className="btn" onClick={() => copy(code)}><Copy size={15} /> Einladungscode: <b>{code}</b></button>
      </div>
      <p className="dim" style={{ fontSize: 12.5, marginBottom: 0 }}>
        Der Spielserver läuft auf diesem PC, solange das Spiel geöffnet ist; beim Beenden wird gespeichert.
        Mitspieler im selben Netzwerk geben die Adresse und den Code unter „Multiplayer → Einer Firma beitreten“ ein.
        Über das Internet brauchst du eine Portfreigabe (TCP {DEFAULT_PORT}) im Router oder ein VPN wie Tailscale/ZeroTier –
        dann gilt die öffentliche bzw. VPN-Adresse. Fragt die Windows-Firewall beim ersten Start nach, erlaube den Zugriff im privaten Netzwerk.
      </p>
    </Card>
  );
}

const CAT_LABEL: Record<string, string> = { order: 'Auftrag', trip: 'Fahrt', finance: 'Finanzen', personnel: 'Personal', fleet: 'Fuhrpark', company: 'Firma', market: 'Markt', multiplayer: 'Team', private: 'Privat' };

export function TeamPage() {
  const s = useGame();
  const host = useUi((u) => u.host);
  const pid = useUi((u) => u.playerId);
  const hosting = useUi((u) => u.hosting);
  const me = s.players[pid];
  const [text, setText] = useState('');
  const [cat, setCat] = useState('');
  const chatEnd = useRef<HTMLDivElement>(null);
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: 'end' });
  }, [s.chat.length]);
  const players = Object.values(s.players);
  const log = [...s.log].reverse().filter((l) => !cat || l.category === cat).slice(0, 200);

  return (
    <div className="page">
      <PageHeader
        title="Team & Kommunikation"
        subtitle={host?.mode === 'remote' ? 'Kooperativer Multiplayer – alle Spieler leiten dieselbe Spedition.' : 'Einzelspieler – Multiplayer startest du im Hauptmenü über einen Spielserver.'}
        actions={
          !hosting && host?.inviteCode && (
            <button className="btn" onClick={() => { navigator.clipboard?.writeText(host.inviteCode!); toast('success', 'Einladungscode kopiert.'); }}>
              <Copy size={15} /> Einladungscode: <b>{host.inviteCode}</b>
            </button>
          )
        }
      />
      {hosting && host?.inviteCode && <InviteCard code={host.inviteCode} />}
      <div className="grid" style={{ gridTemplateColumns: '1.1fr 1fr' }}>
        <Card title="Spieler & Rechte">
          {players.map((p) => (
            <div key={p.id} className="card mb" style={{ background: 'var(--panel-2)' }}>
              <div className="row">
                <Avatar avatar={p.character.avatar} size={36} />
                <div style={{ flex: 1 }}>
                  <b>{p.name}</b> {p.isFounder && <Badge kind="warning"><Crown size={11} />Gründer</Badge>} {p.id === pid && <Badge kind="info">Du</Badge>}
                  {host?.mode === 'remote' && <Badge kind={p.online ? 'success' : ''}>{p.online ? 'online' : 'offline'}</Badge>}
                </div>
              </div>
              <div className="row wrap mt" style={{ gap: 6 }}>
                {ALL_PERMISSIONS.map((perm) => {
                  const has = p.permissions.includes(perm);
                  const editable = !p.isFounder && me?.permissions.includes('admin');
                  return (
                    <button
                      key={perm}
                      className={`chip ${has ? 'active' : ''}`}
                      disabled={!editable}
                      style={{ cursor: editable ? 'pointer' : 'default' }}
                      onClick={() => {
                        const next: Permission[] = has ? p.permissions.filter((x) => x !== perm) : [...p.permissions, perm];
                        sendCommand({ type: 'setPermissions', playerId: p.id, permissions: next });
                      }}
                    >
                      {PERMISSION_LABEL[perm]}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </Card>
        <Card title="Firmenchat">
          <div className="list" style={{ height: 320, overflow: 'auto' }}>
            {s.chat.length === 0 && <div className="empty">Noch keine Nachrichten.</div>}
            {s.chat.map((m) => (
              <div key={m.id} className="list-item">
                <time>{formatDateTime(m.t).slice(3)}</time>
                <span><b>{s.players[m.playerId]?.name ?? '?'}:</b> {m.text}</span>
              </div>
            ))}
            <div ref={chatEnd} />
          </div>
          <form
            className="row mt"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!text.trim()) return;
              if ((await sendCommand({ type: 'chat', text }, { quiet: true })).ok) setText('');
            }}
          >
            <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Nachricht an das Team …" />
            <button className="btn primary" type="submit"><Send size={14} /></button>
          </form>
        </Card>
      </div>
      <Card title="Ereignisprotokoll" className="mt" actions={
        <select className="input" style={{ width: 160, padding: '4px 8px' }} value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Alle Bereiche</option>
          {Object.entries(CAT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      }>
        <div className="list" style={{ maxHeight: 420, overflow: 'auto' }}>
          {log.map((l) => (
            <div key={l.id} className="list-item">
              <time>{formatDateTime(l.t).slice(3)}</time>
              <Badge kind={l.level === 'danger' ? 'danger' : l.level === 'warning' ? 'warning' : l.level === 'success' ? 'success' : ''}>{CAT_LABEL[l.category]}</Badge>
              <span>{l.text}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
