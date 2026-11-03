import { Pause, Play, LayoutDashboard, Map, CalendarRange, ClipboardList, Users, Truck, Wallet, Handshake, Building2, Home, MessagesSquare, BarChart3, Settings, Wifi } from 'lucide-react';
import { SPEEDS, formatTime, formatDate, WEEKDAY_NAMES, weekday, holidayName, season, SEASON_NAMES, unreadMessages, openTasksFor, pendingInvitesFor } from '@spedsim/core';
import { navigate, sendCommand, useGame, useUi, type Page } from '../game/store.ts';
import { Money } from './components.tsx';

const NAV: { page: Page; label: string; icon: typeof Map }[] = [
  { page: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { page: 'map', label: 'Europakarte', icon: Map },
  { page: 'dispatch', label: 'Disposition', icon: CalendarRange },
  { page: 'orders', label: 'Auftragsbörse', icon: ClipboardList },
  { page: 'personnel', label: 'Fahrer & Personal', icon: Users },
  { page: 'fleet', label: 'Fuhrpark', icon: Truck },
  { page: 'finance', label: 'Finanzen', icon: Wallet },
  { page: 'customers', label: 'Kunden & Verträge', icon: Handshake },
  { page: 'locations', label: 'Standorte & Ausbau', icon: Building2 },
  { page: 'private', label: 'Privatleben', icon: Home },
  { page: 'multiplayer', label: 'Team & Kommunikation', icon: MessagesSquare },
  { page: 'stats', label: 'Statistiken', icon: BarChart3 },
  { page: 'settings', label: 'Einstellungen', icon: Settings },
];

export function Sidebar() {
  const page = useUi((u) => u.page);
  const pid = useUi((u) => u.playerId);
  const s = useGame();
  const counts: Partial<Record<Page, number>> = {
    multiplayer: unreadMessages(s, pid) + openTasksFor(s, pid) + pendingInvitesFor(s, pid) + s.team.votes.filter((v) => v.status === 'open' && !(pid in v.votes)).length,
    dispatch: Object.values(s.orders).filter((o) => o.status === 'accepted').length,
    map: Object.values(s.trips).filter((t) => t.phase !== 'done').length,
  };
  return (
    <nav className="sidebar">
      {NAV.map(({ page: p, label, icon: Icon }, i) => (
        <div key={p}>
          {(i === 4 || i === 9 || i === 11) && <div className="nav-sep" />}
          <button className={`nav-item ${page === p ? 'active' : ''}`} onClick={() => navigate(p)}>
            <Icon size={17} />
            {label}
            {counts[p] ? <span className="count">{counts[p]}</span> : null}
          </button>
        </div>
      ))}
    </nav>
  );
}

export function TopBar() {
  const s = useGame();
  const playerId = useUi((u) => u.playerId);
  const connection = useUi((u) => u.connection);
  const host = useUi((u) => u.host);
  const me = s.players[playerId];
  const holiday = holidayName(s.time);
  const canControl = me?.permissions.includes('admin');
  return (
    <header className="topbar">
      <div className="brand">
        <img className="brand-logo" src="/icon.svg" alt="Cargovia" />
        <div>
          {s.company.name}
          <small>Cargovia</small>
        </div>
      </div>
      <div className="clock">
        <strong>{formatTime(s.time)} · {formatDate(s.time)}</strong>
        <span>{WEEKDAY_NAMES[weekday(s.time)]} · {SEASON_NAMES[season(s.time)]}{holiday ? ` · ${holiday}` : ''}</span>
      </div>
      <div className="speed-group" title="Simulationsgeschwindigkeit (Leertaste: Pause)">
        <button className={s.paused ? 'active' : ''} onClick={() => sendCommand({ type: 'setPaused', paused: !s.paused }, { quiet: true })}>
          {s.paused ? <Play size={14} /> : <Pause size={14} />}
        </button>
        {SPEEDS.map((sp) => (
          <button
            key={sp}
            disabled={!canControl}
            className={!s.paused && s.speed === sp ? 'active' : ''}
            onClick={async () => {
              await sendCommand({ type: 'setSpeed', speed: sp }, { quiet: true });
              if (s.paused) sendCommand({ type: 'setPaused', paused: false }, { quiet: true });
            }}
          >
            {sp}×
          </button>
        ))}
      </div>
      <div className="spacer" />
      {host?.mode === 'remote' && (
        <div className="top-stat" title="Multiplayer-Verbindung">
          <span><Wifi size={11} /> Multiplayer</span>
          <strong style={{ fontSize: 12 }}>{connection || 'verbunden'}</strong>
        </div>
      )}
      <div className="top-stat">
        <span>Firmenkonto</span>
        <strong><Money value={s.company.account.balance} colored /></strong>
      </div>
      {me && (
        <div className="top-stat">
          <span>Privatkonto</span>
          <strong><Money value={me.character.privateAccount.balance} /></strong>
        </div>
      )}
      <div className="top-stat">
        <span>Diesel</span>
        <strong>{(s.market.diesel / 100).toLocaleString('de-DE', { minimumFractionDigits: 3 })} €/l</strong>
      </div>
    </header>
  );
}

export function Toasts() {
  const toasts = useUi((u) => u.toasts);
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.level}`}>{t.text}</div>
      ))}
    </div>
  );
}
