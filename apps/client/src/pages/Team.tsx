// Team & Kommunikation: Spieler, Rollen und Rechte, interne Nachrichten, Aufgabenverteilung,
// gemeinsame Aktivitäten und Abstimmungen, Firmenchat und Ereignisprotokoll.

import { useEffect, useRef, useState } from 'react';
import {
  Send, Copy, Crown, Globe, RefreshCw, Users, Mail, ListTodo, PartyPopper, MessagesSquare, Check, X, Trash2, Vote, Plus, Inbox,
} from 'lucide-react';
import {
  ALL_PERMISSIONS, PERMISSION_LABEL, ROLE_LABEL, TEAM_ROLES, TASK_AREA_LABEL, TASK_STATUS_LABEL, JOINT_ACTIVITIES, MIN_PER_DAY,
  formatDateTime, formatMoney, unreadMessages, openTasksFor, pendingInvitesFor, voteCounts,
  type GameState, type JointKind, type Permission, type Player, type TaskArea, type TaskStatus, type TeamRole,
} from '@spedsim/core';
import { DEFAULT_PORT, inviteLine, isDesktop, localAddress, startTunnel } from '../game/multiplayer.ts';
import { sendCommand, setUi, toast, useGame, useUi } from '../game/store.ts';
import { Avatar, Badge, Card, Empty, PageHeader } from '../ui/components.tsx';
import { cityName } from '../ui/format.ts';

/** Chattext mit geteilten Aufträgen ([[ord:ID]]) als anklickbarem Link. */
function ChatText({ text }: { text: string }) {
  const parts = text.split(/(\[\[ord:[a-z0-9]+\]\])/);
  return (
    <>
      {parts.map((p, i) => {
        const m = p.match(/^\[\[ord:([a-z0-9]+)\]\]$/);
        if (!m) return p;
        return (
          <button key={i} className="btn small" style={{ marginLeft: 6 }} onClick={() => setUi({ page: 'orders', focusOrderId: m[1] })}>
            Auftrag öffnen
          </button>
        );
      })}
    </>
  );
}

/** Für den Host: Adresse und Einladungscode, mit denen Freunde beitreten. */
function InviteCard({ code }: { code: string }) {
  const [ip, setIp] = useState<string | null>(null);
  useEffect(() => {
    localAddress().then(setIp);
  }, []);
  const tunnel = useUi((u) => u.tunnel);
  const addr = ip ? `${ip}:${DEFAULT_PORT}` : null;
  const copy = (t: string) => {
    navigator.clipboard?.writeText(t);
    toast('success', 'In die Zwischenablage kopiert.');
  };
  const invite = tunnel.status === 'ready' && tunnel.url ? inviteLine(tunnel.url, code) : null;
  return (
    <Card title="Freunde einladen" className="mb">
      {isDesktop() && (
        <div className="mb">
          <div className="row wrap" style={{ gap: 10, alignItems: 'center' }}>
            <Globe size={16} />
            {invite ? (
              <button className="btn primary" onClick={() => copy(invite)}><Copy size={15} /> Internet-Einladung kopieren: <b>{invite}</b></button>
            ) : tunnel.status === 'error' ? (
              <>
                <span style={{ color: 'var(--danger)' }}>Internet-Zugang fehlgeschlagen: {tunnel.error}</span>
                <button className="btn small" onClick={() => startTunnel()}><RefreshCw size={14} />Erneut versuchen</button>
              </>
            ) : (
              <span className="dim">{tunnel.status === 'checking' ? 'Internet-Zugang wird geprüft …' : 'Internet-Zugang wird eingerichtet …'}</span>
            )}
          </div>
          <p className="dim" style={{ fontSize: 12.5, marginBottom: 0 }}>
            Schick die Internet-Einladung deinen Freunden; sie fügen sie unter „Multiplayer → Einer Firma beitreten“ ein. Keine Portfreigabe nötig.
            Die Adresse gilt, solange das Spiel bei dir läuft, und ändert sich beim nächsten Start – dann einfach die neue Einladung schicken.
          </p>
        </div>
      )}
      <div className="row wrap" style={{ gap: 10 }}>
        {addr && <button className="btn" onClick={() => copy(addr)}><Copy size={15} /> Adresse (Heimnetz): <b>{addr}</b></button>}
        <button className="btn" onClick={() => copy(code)}><Copy size={15} /> Einladungscode: <b>{code}</b></button>
      </div>
      <p className="dim" style={{ fontSize: 12.5, marginBottom: 0 }}>
        Der Spielserver läuft auf diesem PC, solange das Spiel geöffnet ist; beim Beenden wird gespeichert.
        Im selben Netzwerk reichen Heimnetz-Adresse und Code (fragt die Windows-Firewall nach, Zugriff im privaten Netzwerk erlauben).
      </p>
    </Card>
  );
}

const CAT_LABEL: Record<string, string> = { order: 'Auftrag', trip: 'Fahrt', finance: 'Finanzen', personnel: 'Personal', fleet: 'Fuhrpark', company: 'Firma', market: 'Markt', multiplayer: 'Team', private: 'Privat' };

type Tab = 'team' | 'messages' | 'tasks' | 'together' | 'chat';

const playerName = (s: GameState, id: string | undefined) => (id && s.players[id]?.name) || '–';

/** Mehrfachauswahl von Mitspielern als Chips */
function PlayerPicker({ value, onChange, exclude }: { value: string[]; onChange: (v: string[]) => void; exclude: string }) {
  const s = useGame();
  const others = Object.values(s.players).filter((p) => p.id !== exclude);
  if (!others.length) return <span className="dim">Noch keine Mitspieler – lade Freunde über den Einladungscode ein.</span>;
  return (
    <div className="row wrap" style={{ gap: 6 }}>
      {others.map((p) => {
        const on = value.includes(p.id);
        return (
          <button key={p.id} type="button" className={`chip ${on ? 'active' : ''}`} onClick={() => onChange(on ? value.filter((x) => x !== p.id) : [...value, p.id])}>
            {p.name}
          </button>
        );
      })}
    </div>
  );
}

export function TeamPage() {
  const s = useGame();
  const host = useUi((u) => u.host);
  const pid = useUi((u) => u.playerId);
  const hosting = useUi((u) => u.hosting);
  const [tab, setTab] = useState<Tab>('team');
  const unread = unreadMessages(s, pid);
  const tasks = openTasksFor(s, pid);
  const invites = pendingInvitesFor(s, pid) + s.team.votes.filter((v) => v.status === 'open' && !(pid in v.votes)).length;
  const tabs: { id: Tab; label: string; icon: typeof Users; count?: number }[] = [
    { id: 'team', label: 'Team & Rechte', icon: Users },
    { id: 'messages', label: 'Nachrichten', icon: Mail, count: unread },
    { id: 'tasks', label: 'Aufgaben', icon: ListTodo, count: tasks },
    { id: 'together', label: 'Gemeinsam', icon: PartyPopper, count: invites },
    { id: 'chat', label: 'Chat & Protokoll', icon: MessagesSquare },
  ];

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
      <div className="tabs">
        {tabs.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            <t.icon size={15} />{t.label}{t.count ? <Badge kind="info">{t.count}</Badge> : null}
          </button>
        ))}
      </div>
      {tab === 'team' && (
        <>
          {hosting && host?.inviteCode && <InviteCard code={host.inviteCode} />}
          <TeamTab />
        </>
      )}
      {tab === 'messages' && <MessagesTab />}
      {tab === 'tasks' && <TasksTab />}
      {tab === 'together' && <TogetherTab />}
      {tab === 'chat' && <ChatTab />}
    </div>
  );
}

// ---------------------------------------------------------------- Team & Rechte

function TeamTab() {
  const s = useGame();
  const pid = useUi((u) => u.playerId);
  const host = useUi((u) => u.host);
  const me = s.players[pid];
  const admin = !!me?.permissions.includes('admin');
  return (
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))' }}>
      {Object.values(s.players).map((p) => (
        <PlayerCard key={p.id} p={p} me={p.id === pid} editable={admin && !p.isFounder} online={host?.mode === 'remote' ? !!p.online : undefined} />
      ))}
      <Card title="Rollen">
        {(Object.keys(TEAM_ROLES) as (keyof typeof TEAM_ROLES)[]).map((r) => (
          <div key={r} className="mb">
            <b>{TEAM_ROLES[r].name}</b>
            <div className="dim" style={{ fontSize: 12.5 }}>{TEAM_ROLES[r].text}</div>
          </div>
        ))}
        <p className="dim" style={{ fontSize: 12.5, marginBottom: 0 }}>
          Die Rolle ist eine Vorlage für die Rechte. Einzelne Rechte lassen sich danach frei anpassen (Rolle „Individuell“).
          Zusätzlich kann die Spielleitung ein Ausgabenlimit je Ausgabe und die verwalteten Niederlassungen festlegen.
        </p>
      </Card>
    </div>
  );
}

function PlayerCard({ p, me, editable, online }: { p: Player; me: boolean; editable: boolean; online?: boolean }) {
  const s = useGame();
  const [limit, setLimit] = useState(p.spendLimit !== undefined ? String(p.spendLimit / 100) : '');
  useEffect(() => setLimit(p.spendLimit !== undefined ? String(p.spendLimit / 100) : ''), [p.spendLimit]);
  const locs = p.locationIds ?? [];
  const saveLimits = (spend: string, ids: string[]) =>
    sendCommand({ type: 'setPlayerLimits', playerId: p.id, spendLimit: spend.trim() === '' ? null : Math.round(Number(spend) * 100), locationIds: ids });
  return (
    <Card>
      <div className="row">
        <Avatar avatar={p.character.avatar} size={40} />
        <div style={{ flex: 1 }}>
          <b>{p.name}</b> {p.isFounder && <Badge kind="warning"><Crown size={11} />Gründer</Badge>} {me && <Badge kind="info">Du</Badge>}
          {online !== undefined && <Badge kind={online ? 'success' : ''}>{online ? 'online' : 'offline'}</Badge>}
          <div className="dim" style={{ fontSize: 12.5 }}>{ROLE_LABEL[p.role ?? 'custom']}</div>
        </div>
        {editable && (
          <select className="input" style={{ width: 170 }} value={p.role ?? 'custom'} onChange={(e) => sendCommand({ type: 'setRole', playerId: p.id, role: e.target.value as TeamRole })}>
            {(Object.keys(ROLE_LABEL) as TeamRole[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        )}
      </div>
      <div className="row wrap mt" style={{ gap: 6 }}>
        {ALL_PERMISSIONS.map((perm) => {
          const has = p.permissions.includes(perm);
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
      {!p.isFounder && (
        <div className="mt" style={{ fontSize: 13 }}>
          {editable ? (
            <>
              <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
                <span>Ausgabenlimit je Ausgabe:</span>
                <input className="input" style={{ width: 120 }} type="number" min={0} step={1000} placeholder="unbegrenzt" value={limit} onChange={(e) => setLimit(e.target.value)} />
                <span>€</span>
                <button className="btn small" disabled={limit === (p.spendLimit !== undefined ? String(p.spendLimit / 100) : '')} onClick={() => saveLimits(limit, locs)}>Übernehmen</button>
              </div>
              {s.company.locations.length > 1 && (
                <div className="row wrap mt" style={{ gap: 6, alignItems: 'center' }}>
                  <span>Verwaltet:</span>
                  <button className={`chip ${locs.length === 0 ? 'active' : ''}`} onClick={() => saveLimits(limit, [])}>alle Standorte</button>
                  {s.company.locations.map((l) => {
                    const on = locs.includes(l.id);
                    return (
                      <button key={l.id} className={`chip ${on ? 'active' : ''}`} onClick={() => saveLimits(limit, on ? locs.filter((x) => x !== l.id) : [...locs, l.id])}>
                        {cityName(l.cityId)}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <span className="dim">
              {p.spendLimit !== undefined ? `Ausgabenlimit ${formatMoney(p.spendLimit)} je Ausgabe` : 'Kein Ausgabenlimit'} ·{' '}
              {locs.length ? `verwaltet ${locs.map((id) => cityName(s.company.locations.find((l) => l.id === id)?.cityId ?? id)).join(', ')}` : 'alle Standorte'}
            </span>
          )}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- Nachrichten

function MessagesTab() {
  const s = useGame();
  const pid = useUi((u) => u.playerId);
  const [box, setBox] = useState<'in' | 'out'>('in');
  const [openId, setOpenId] = useState<string | null>(null);
  const [compose, setCompose] = useState<{ to: string[]; subject: string; text: string } | null>(null);
  const list = [...s.team.messages].reverse().filter((m) => (box === 'in' ? m.to.includes(pid) : m.from === pid));
  const open = s.team.messages.find((m) => m.id === openId);
  const openMsg = (id: string) => {
    setOpenId(id);
    setCompose(null);
    const m = s.team.messages.find((x) => x.id === id);
    if (m && !m.readBy.includes(pid)) sendCommand({ type: 'readMessage', messageId: id }, { quiet: true });
  };
  const send = async () => {
    if (!compose) return;
    const r = await sendCommand({ type: 'sendMessage', to: compose.to, subject: compose.subject, text: compose.text });
    if (r.ok) {
      toast('success', 'Nachricht gesendet.');
      setCompose(null);
      setBox('out');
    }
  };
  return (
    <div className="grid" style={{ gridTemplateColumns: 'minmax(260px, 0.9fr) 1.4fr' }}>
      <Card
        title={
          <div className="row" style={{ gap: 6 }}>
            <button className={`chip ${box === 'in' ? 'active' : ''}`} onClick={() => setBox('in')}><Inbox size={13} />Posteingang</button>
            <button className={`chip ${box === 'out' ? 'active' : ''}`} onClick={() => setBox('out')}><Send size={13} />Gesendet</button>
          </div>
        }
        actions={<button className="btn small primary" title="Neue Nachricht" onClick={() => { setCompose({ to: [], subject: '', text: '' }); setOpenId(null); }}><Plus size={14} />Schreiben</button>}
      >
        <div className="list" style={{ maxHeight: 520, overflow: 'auto' }}>
          {!list.length && <Empty>{box === 'in' ? 'Keine Nachrichten.' : 'Noch nichts gesendet.'}</Empty>}
          {list.map((m) => {
            const unread = box === 'in' && !m.readBy.includes(pid);
            return (
              <button key={m.id} className={`list-item ${openId === m.id ? 'active' : ''}`} style={{ textAlign: 'left', width: '100%', border: 'none', background: openId === m.id ? 'var(--panel-hover)' : 'none', cursor: 'pointer', color: 'inherit' }} onClick={() => openMsg(m.id)}>
                <time>{formatDateTime(m.t).slice(3)}</time>
                <span style={{ fontWeight: unread ? 700 : 400 }}>
                  {box === 'in' ? playerName(s, m.from) : `an ${m.to.map((id) => playerName(s, id)).join(', ')}`}: {m.subject}
                </span>
                {unread && <Badge kind="info">neu</Badge>}
              </button>
            );
          })}
        </div>
      </Card>
      {compose ? (
        <Card title="Neue Nachricht">
          <div className="mb"><div className="dim mb" style={{ fontSize: 12.5 }}>An</div><PlayerPicker value={compose.to} onChange={(to) => setCompose({ ...compose, to })} exclude={pid} /></div>
          <input className="input mb" placeholder="Betreff" value={compose.subject} maxLength={120} onChange={(e) => setCompose({ ...compose, subject: e.target.value })} />
          <textarea className="input mb" rows={8} placeholder="Nachricht …" value={compose.text} maxLength={2000} onChange={(e) => setCompose({ ...compose, text: e.target.value })} />
          <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn" onClick={() => setCompose(null)}>Verwerfen</button>
            <button className="btn primary" disabled={!compose.to.length || !compose.text.trim()} onClick={send}><Send size={14} />Senden</button>
          </div>
          <p className="dim" style={{ fontSize: 12.5, marginBottom: 0 }}>Interne Nachrichten sehen nur du und die Empfänger – anders als der Firmenchat.</p>
        </Card>
      ) : open ? (
        <Card
          title={open.subject}
          sub={`${playerName(s, open.from)} an ${open.to.map((id) => playerName(s, id)).join(', ')} · ${formatDateTime(open.t)}`}
          actions={open.from !== pid && <button className="btn small" onClick={() => setCompose({ to: [open.from], subject: open.subject.startsWith('AW: ') ? open.subject : `AW: ${open.subject}`, text: '' })}><Send size={14} />Antworten</button>}
        >
          <div style={{ whiteSpace: 'pre-wrap' }}>{open.text}</div>
          {open.from === pid && (
            <p className="dim" style={{ fontSize: 12.5 }}>Gelesen von: {open.to.filter((id) => open.readBy.includes(id)).map((id) => playerName(s, id)).join(', ') || 'noch niemandem'}</p>
          )}
        </Card>
      ) : (
        <Card><Empty>Wähle links eine Nachricht oder schreibe eine neue.</Empty></Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Aufgaben

const STATUS_ORDER: TaskStatus[] = ['open', 'doing', 'done'];

function TasksTab() {
  const s = useGame();
  const pid = useUi((u) => u.playerId);
  const me = s.players[pid];
  const [mine, setMine] = useState(false);
  const [draft, setDraft] = useState({ title: '', note: '', area: 'general' as TaskArea, assignee: '', dueDays: '' });
  const create = async () => {
    const due = draft.dueDays ? s.time + Math.round(Number(draft.dueDays) * MIN_PER_DAY) : undefined;
    const r = await sendCommand({ type: 'createTask', title: draft.title, note: draft.note || undefined, area: draft.area, assignee: draft.assignee || undefined, due });
    if (r.ok) setDraft({ title: '', note: '', area: draft.area, assignee: '', dueDays: '' });
  };
  const tasks = s.team.tasks.filter((t) => !mine || t.assignee === pid);
  return (
    <>
      <Card title="Neue Aufgabe" className="mb">
        <div className="row wrap" style={{ gap: 8 }}>
          <input className="input" style={{ flex: '2 1 240px' }} placeholder="Was ist zu tun?" value={draft.title} maxLength={120} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          <select className="input" style={{ flex: '0 1 150px' }} value={draft.area} onChange={(e) => setDraft({ ...draft, area: e.target.value as TaskArea })}>
            {(Object.keys(TASK_AREA_LABEL) as TaskArea[]).map((a) => <option key={a} value={a}>{TASK_AREA_LABEL[a]}</option>)}
          </select>
          <select className="input" style={{ flex: '0 1 170px' }} value={draft.assignee} onChange={(e) => setDraft({ ...draft, assignee: e.target.value })}>
            <option value="">nicht zugewiesen</option>
            {Object.values(s.players).map((p) => <option key={p.id} value={p.id}>{p.name}{p.id === pid ? ' (du)' : ''}</option>)}
          </select>
          <input className="input" style={{ flex: '0 1 130px' }} type="number" min={0} step={1} placeholder="fällig in Tagen" value={draft.dueDays} onChange={(e) => setDraft({ ...draft, dueDays: e.target.value })} />
          <button className="btn primary" disabled={!draft.title.trim()} onClick={create}><Plus size={14} />Anlegen</button>
        </div>
        <input className="input mt" placeholder="Notiz (optional)" value={draft.note} maxLength={1000} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
      </Card>
      <div className="row mb" style={{ gap: 6 }}>
        <button className={`chip ${!mine ? 'active' : ''}`} onClick={() => setMine(false)}>Alle Aufgaben</button>
        <button className={`chip ${mine ? 'active' : ''}`} onClick={() => setMine(true)}>Meine Aufgaben</button>
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        {STATUS_ORDER.map((st) => {
          const col = tasks.filter((t) => t.status === st).sort((a, b) => (st === 'done' ? (b.done ?? 0) - (a.done ?? 0) : (a.due ?? Infinity) - (b.due ?? Infinity)));
          return (
            <Card key={st} title={`${TASK_STATUS_LABEL[st]} (${col.length})`}>
              {!col.length && <Empty>Keine Aufgaben.</Empty>}
              {col.slice(0, st === 'done' ? 15 : 100).map((t) => {
                const late = t.due !== undefined && t.status !== 'done' && s.time > t.due;
                const canDelete = t.createdBy === pid || me?.permissions.includes('admin');
                return (
                  <div key={t.id} className="card mb" style={{ background: 'var(--panel-2)', padding: 10 }}>
                    <div className="row" style={{ alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <b style={{ textDecoration: st === 'done' ? 'line-through' : undefined }}>{t.title}</b>
                        <div className="row wrap" style={{ gap: 4, marginTop: 4 }}>
                          <Badge>{TASK_AREA_LABEL[t.area]}</Badge>
                          {t.due !== undefined && <Badge kind={late ? 'danger' : ''}>fällig {formatDateTime(t.due).slice(3, 9)}</Badge>}
                          {t.assignee === pid && <Badge kind="info">deine</Badge>}
                        </div>
                      </div>
                      {canDelete && <button className="btn small ghost" title="Löschen" onClick={() => sendCommand({ type: 'deleteTask', taskId: t.id })}><Trash2 size={13} /></button>}
                    </div>
                    {t.note && <div className="dim mt" style={{ fontSize: 12.5, whiteSpace: 'pre-wrap' }}>{t.note}</div>}
                    <div className="row wrap mt" style={{ gap: 6, alignItems: 'center' }}>
                      <select className="input" style={{ flex: 1, padding: '3px 6px' }} value={t.assignee ?? ''} onChange={(e) => sendCommand({ type: 'updateTask', taskId: t.id, assignee: e.target.value || null })}>
                        <option value="">nicht zugewiesen</option>
                        {Object.values(s.players).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      {st !== 'open' && <button className="btn small" onClick={() => sendCommand({ type: 'updateTask', taskId: t.id, status: STATUS_ORDER[STATUS_ORDER.indexOf(st) - 1] })}>←</button>}
                      {st !== 'done' && (
                        <button className="btn small primary" onClick={() => sendCommand({ type: 'updateTask', taskId: t.id, status: STATUS_ORDER[STATUS_ORDER.indexOf(st) + 1], ...(st === 'open' && !t.assignee ? { assignee: pid } : {}) })}>
                          {st === 'open' ? (t.assignee ? 'Beginnen' : 'Übernehmen') : <><Check size={13} />Erledigt</>}
                        </button>
                      )}
                    </div>
                    <div className="dim" style={{ fontSize: 11.5, marginTop: 6 }}>von {playerName(s, t.createdBy)} · {formatDateTime(t.created).slice(3)}</div>
                  </div>
                );
              })}
            </Card>
          );
        })}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Gemeinsam

function TogetherTab() {
  const s = useGame();
  const pid = useUi((u) => u.playerId);
  const me = s.players[pid];
  const [kind, setKind] = useState<JointKind>('dinner');
  const [who, setWho] = useState<string[]>([]);
  const [vote, setVote] = useState({ question: '', options: 'Ja\nNein', hours: '24' });
  const pending = s.team.activities.filter((a) => a.status === 'pending');
  const recent = s.team.activities.filter((a) => a.status !== 'pending').slice(-6).reverse();
  const bonus = (s.team.meetingBonusUntil ?? -1) > s.time;
  const statusText = { done: 'durchgeführt', cancelled: 'abgesagt', expired: 'verfallen', pending: 'offen' };

  return (
    <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
      <div>
        <Card title="Gemeinsame Aktivität" sub={bonus ? <Badge kind="success">Teambesprechung wirkt bis {formatDateTime(s.team.meetingBonusUntil!)}</Badge> : undefined} className="mb">
          <div className="grid mb" style={{ gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {(Object.keys(JOINT_ACTIVITIES) as JointKind[]).map((k) => {
              const d = JOINT_ACTIVITIES[k];
              return (
                <button key={k} className={`card ${kind === k ? 'selected' : ''}`} style={{ textAlign: 'left', cursor: 'pointer', borderColor: kind === k ? 'var(--accent)' : undefined, background: 'var(--panel-2)', color: 'inherit' }} onClick={() => setKind(k)}>
                  <b style={{ hyphens: 'auto', overflowWrap: 'break-word', display: 'block' }}>{d.name}</b>
                  <div className="dim" style={{ fontSize: 12 }}>{d.text}</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>{d.hours} h · {d.cost ? `${formatMoney(d.cost)} p. P.` : 'kostenlos'}</div>
                </button>
              );
            })}
          </div>
          <div className="dim mb" style={{ fontSize: 12.5 }}>Einladen</div>
          <PlayerPicker value={who} onChange={setWho} exclude={pid} />
          <div className="row mt" style={{ justifyContent: 'flex-end' }}>
            <button className="btn primary" disabled={!who.length} onClick={async () => { if ((await sendCommand({ type: 'proposeJoint', kind, playerIds: who })).ok) setWho([]); }}>
              <Send size={14} />Einladen
            </button>
          </div>
          <p className="dim" style={{ fontSize: 12.5, marginBottom: 0 }}>
            Die Aktivität findet statt, sobald alle geantwortet haben, spätestens nach 12 Spielstunden mit allen Zusagen. Jeder zahlt vom eigenen Privatkonto;
            gesellige Aktivitäten wirken mit jedem weiteren Teilnehmer stärker.
          </p>
        </Card>
        <Card title="Einladungen">
          {!pending.length && !recent.length && <Empty>Keine Einladungen.</Empty>}
          {pending.map((a) => {
            const d = JOINT_ACTIVITIES[a.kind];
            const mineInvite = a.invited.includes(pid) && !a.accepted.includes(pid) && !a.declined.includes(pid);
            return (
              <div key={a.id} className="card mb" style={{ background: 'var(--panel-2)', padding: 10 }}>
                <b>{d.name}</b> <span className="dim">von {playerName(s, a.host)}</span>
                <div style={{ fontSize: 12.5 }} className="mt">
                  {a.invited.map((id) => (
                    <Badge key={id} kind={a.accepted.includes(id) ? 'success' : a.declined.includes(id) ? 'danger' : ''}>{playerName(s, id)}</Badge>
                  ))}{' '}
                  <span className="dim">· bis {formatDateTime(a.expires).slice(3)}</span>
                </div>
                <div className="row mt" style={{ gap: 6 }}>
                  {mineInvite && (
                    <>
                      <button className="btn small primary" onClick={() => sendCommand({ type: 'respondJoint', activityId: a.id, accept: true })}><Check size={13} />Zusagen</button>
                      <button className="btn small" onClick={() => sendCommand({ type: 'respondJoint', activityId: a.id, accept: false })}><X size={13} />Absagen</button>
                    </>
                  )}
                  {a.host === pid && (
                    <button className="btn small" onClick={() => sendCommand({ type: 'cancelJoint', activityId: a.id })}>{a.accepted.length ? 'Jetzt starten' : 'Absagen'}</button>
                  )}
                </div>
              </div>
            );
          })}
          {recent.map((a) => (
            <div key={a.id} className="list-item">
              <time>{formatDateTime(a.created).slice(3)}</time>
              <span>{JOINT_ACTIVITIES[a.kind].name} ({playerName(s, a.host)}{a.accepted.length ? `, ${a.accepted.map((id) => playerName(s, id)).join(', ')}` : ''})</span>
              <Badge kind={a.status === 'done' ? 'success' : ''}>{statusText[a.status]}</Badge>
            </div>
          ))}
        </Card>
      </div>
      <div>
        <Card title="Abstimmung starten" className="mb">
          <input className="input mb" placeholder="Worüber soll das Team entscheiden?" value={vote.question} maxLength={200} onChange={(e) => setVote({ ...vote, question: e.target.value })} />
          <textarea className="input mb" rows={3} placeholder="Eine Antwort pro Zeile" value={vote.options} onChange={(e) => setVote({ ...vote, options: e.target.value })} />
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <span className="dim">Laufzeit</span>
            <select className="input" style={{ width: 140 }} value={vote.hours} onChange={(e) => setVote({ ...vote, hours: e.target.value })}>
              <option value="6">6 Stunden</option>
              <option value="24">1 Tag</option>
              <option value="72">3 Tage</option>
              <option value="168">1 Woche</option>
            </select>
            <span style={{ flex: 1 }} />
            <button
              className="btn primary"
              disabled={!vote.question.trim()}
              onClick={async () => {
                const r = await sendCommand({ type: 'createVote', question: vote.question, options: vote.options.split('\n'), hours: Number(vote.hours) });
                if (r.ok) setVote({ ...vote, question: '' });
              }}
            >
              <Vote size={14} />Starten
            </button>
          </div>
        </Card>
        <Card title="Abstimmungen">
          {!s.team.votes.length && <Empty>Noch keine Abstimmungen.</Empty>}
          {[...s.team.votes].reverse().slice(0, 12).map((v) => {
            const counts = voteCounts(v);
            const total = counts.reduce((a, b) => a + b, 0);
            const canClose = v.status === 'open' && (v.createdBy === pid || me?.permissions.includes('admin'));
            return (
              <div key={v.id} className="card mb" style={{ background: 'var(--panel-2)', padding: 10 }}>
                <div className="row">
                  <b style={{ flex: 1 }}>{v.question}</b>
                  {v.status === 'open' ? <Badge kind="info">bis {formatDateTime(v.closes).slice(3)}</Badge> : <Badge>beendet</Badge>}
                </div>
                <div className="dim" style={{ fontSize: 12 }}>von {playerName(s, v.createdBy)} · {total} von {Object.keys(s.players).length} Stimmen</div>
                {v.options.map((o, i) => {
                  const share = total ? counts[i] / total : 0;
                  const mineVote = v.votes[pid] === i;
                  const won = v.status === 'closed' && v.result === i;
                  return (
                    <div key={i} className="row mt" style={{ gap: 8, alignItems: 'center' }}>
                      <button className={`chip ${mineVote ? 'active' : ''}`} disabled={v.status !== 'open'} style={{ minWidth: 110, justifyContent: 'center' }} onClick={() => sendCommand({ type: 'castVote', voteId: v.id, option: i }, { quiet: true })}>
                        {won && <Crown size={12} />}{o}
                      </button>
                      <div style={{ flex: 1, height: 8, background: 'var(--panel)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ width: `${share * 100}%`, height: '100%', background: won ? 'var(--success)' : 'var(--accent)' }} />
                      </div>
                      <span style={{ width: 70, fontSize: 12 }} className="dim" title={Object.entries(v.votes).filter(([, x]) => x === i).map(([id]) => playerName(s, id)).join(', ')}>
                        {counts[i]} Stimme{counts[i] === 1 ? '' : 'n'}
                      </span>
                    </div>
                  );
                })}
                {v.status === 'closed' && v.result === -1 && <div className="dim mt" style={{ fontSize: 12.5 }}>{total ? 'Gleichstand – keine Entscheidung.' : 'Keine Stimmen abgegeben.'}</div>}
                {canClose && <div className="row mt" style={{ justifyContent: 'flex-end' }}><button className="btn small" onClick={() => sendCommand({ type: 'closeVote', voteId: v.id })}>Jetzt auswerten</button></div>}
              </div>
            );
          })}
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Chat & Protokoll

function ChatTab() {
  const s = useGame();
  const [text, setText] = useState('');
  const [cat, setCat] = useState('');
  const chatEnd = useRef<HTMLDivElement>(null);
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: 'end' });
  }, [s.chat.length]);
  const log = [...s.log].reverse().filter((l) => !cat || l.category === cat).slice(0, 200);
  return (
    <div className="grid" style={{ gridTemplateColumns: '1fr 1.2fr' }}>
      <Card title="Firmenchat">
        <div className="list" style={{ height: 420, overflow: 'auto' }}>
          {s.chat.length === 0 && <div className="empty">Noch keine Nachrichten.</div>}
          {s.chat.map((m) => (
            <div key={m.id} className="list-item">
              <time>{formatDateTime(m.t).slice(3)}</time>
              <span><b>{s.players[m.playerId]?.name ?? '?'}:</b> <ChatText text={m.text} /></span>
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
      <Card title="Ereignisprotokoll" actions={
        <select className="input" style={{ width: 160, padding: '4px 8px' }} value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Alle Bereiche</option>
          {Object.entries(CAT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      }>
        <div className="list" style={{ maxHeight: 470, overflow: 'auto' }}>
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
