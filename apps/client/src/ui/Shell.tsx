import { Pause, Play, LayoutDashboard, Map, CalendarRange, ClipboardList, Users, Truck, Wallet, Handshake, Building2, Home, MessagesSquare, BarChart3, Settings, Wifi, TrendingUp, CircleHelp, PieChart } from 'lucide-react';
import { SPEEDS, formatTime, formatDate, WEEKDAY_NAMES, weekday, holidayName, season, SEASON_NAMES, unreadMessages, openTasksFor, pendingInvitesFor } from '@spedsim/core';
import { getUi, navigate, sendCommand, setUi, useGame, useUi, type Page } from '../game/store.ts';
import { helpForPage } from './help.ts';
import { Money } from './components.tsx';
import { CompanyLogo } from './CompanyLogo.tsx';

const NAV: { page: Page; label: string; icon: typeof Map }[] = [
  { page: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { page: 'map', label: 'Europakarte', icon: Map },
  { page: 'dispatch', label: 'Disposition', icon: CalendarRange },
  { page: 'orders', label: 'Auftragsbörse', icon: ClipboardList },
  { page: 'personnel', label: 'Fahrer & Personal', icon: Users },
  { page: 'fleet', label: 'Fuhrpark', icon: Truck },
  { page: 'finance', label: 'Finanzen', icon: Wallet },
  { page: 'customers', label: 'Kunden & Verträge', icon: Handshake },
  { page: 'market', label: 'Markt & Wettbewerb', icon: TrendingUp },
  { page: 'locations', label: 'Standorte & Ausbau', icon: Building2 },
  { page: 'private', label: 'Privatleben', icon: Home },
  { page: 'multiplayer', label: 'Team & Kommunikation', icon: MessagesSquare },
  { page: 'stats', label: 'Statistiken', icon: BarChart3 },
  { page: 'analysis', label: 'Auswertung', icon: PieChart },
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
          {(i === 4 || i === 10 || i === 12) && <div className="nav-sep" />}
          <button data-tour={`nav-${p}`} className={`nav-item ${page === p ? 'active' : ''}`} onClick={() => navigate(p)}>
            <Icon size={17} />
            {label}
            {counts[p] ? <span className="count">{counts[p]}</span> : null}
          </button>
        </div>
      ))}
      <div className="sidebar-footer">© {new Date().getFullYear()} Nebomuck · Alle Rechte vorbehalten</div>
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
        {s.company.livery ? <CompanyLogo livery={s.company.livery} size={30} className="brand-logo" /> : <img className="brand-logo" src="/icon.svg" alt="Cargovia" />}
        <div>
          {s.company.name}
          <small>Cargovia</small>
        </div>
      </div>
      <div className="clock">
        <strong>{formatTime(s.time)} · {formatDate(s.time)}</strong>
        <span>{WEEKDAY_NAMES[weekday(s.time)]} · {SEASON_NAMES[season(s.time)]}{holiday ? ` · ${holiday}` : ''}</span>
      </div>
      <div className="speed-group" data-tour="speed" title="Simulationsgeschwindigkeit (Leertaste: Pause)">
        <button className={s.paused ? 'active' : ''} onClick={() => sendCommand({ type: 'setPaused', paused: !s.paused }, { quiet: true })}>
          {s.paused ? <Play size={14} /> : <Pause size={14} />}
        </button>
        {SPEEDS.map((sp) => (
          <button
            key={sp}
            disabled={!canControl}
            className={!s.paused && s.speed === sp ? 'active' : ''}
            onClick={async () => {
              // Wettbewerbswelt: Tempo und Fortsetzen als eine Abstimmung
              if (s.arena) return void sendCommand({ type: 'setSpeed', speed: sp, ...(s.paused ? { resume: true } : {}) }, { quiet: true });
              await sendCommand({ type: 'setSpeed', speed: sp }, { quiet: true });
              if (s.paused) sendCommand({ type: 'setPaused', paused: false }, { quiet: true });
            }}
          >
            {sp}×
          </button>
        ))}
      </div>
      {s.timeVote && s.arena && <TimeVoteChip />}
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
      <button className="icon-btn help-btn" data-tour="help" title="Hilfe (F1)" onClick={() => setUi({ help: helpForPage(getUi().page) })}>
        <CircleHelp size={19} />
      </button>
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

/** Wettbewerbswelt: laufende Abstimmung über Pause oder Tempo */
function TimeVoteChip() {
  const s = useGame();
  const v = s.timeVote!;
  const arena = s.arena!;
  const me = s.players[getUi().playerId];
  const mine = v.by.includes(arena.companyId);
  const need = Math.floor(arena.activeCompanies / 2) + 1;
  const what = [v.paused === true ? 'Pause' : v.paused === false ? 'Fortsetzen' : '', v.speed ? `Tempo ${v.speed}×` : ''].filter(Boolean).join(' mit ');
  const agree = () =>
    v.speed !== undefined
      ? sendCommand({ type: 'setSpeed', speed: v.speed, ...(v.paused === false ? { resume: true } : {}) }, { quiet: true })
      : sendCommand({ type: 'setPaused', paused: !!v.paused }, { quiet: true });
  return (
    <div className="vote-chip" title={`Vorschlag von ${v.proposer} (${v.company}) – nötig: ${need} von ${arena.activeCompanies} Firmen`}>
      <span>Abstimmung: <b>{what}</b> ({v.by.length}/{need})</span>
      {mine ? (
        <small className="dim">wartet auf Mitbewerber</small>
      ) : me?.permissions.includes('admin') ? (
        <>
          <button className="btn small primary" onClick={agree}>Zustimmen</button>
          <button className="btn small" onClick={() => sendCommand({ type: 'rejectTimeVote' }, { quiet: true })}>Ablehnen</button>
        </>
      ) : null}
    </div>
  );
}
