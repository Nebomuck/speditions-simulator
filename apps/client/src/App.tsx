import { useEffect } from 'react';
import { SPEEDS } from '@spedsim/core';
import { getUi, navigate, sendCommand, setUi, useUi } from './game/store.ts';
import { Welcome } from './pages/Welcome.tsx';
import { Dashboard } from './pages/Dashboard.tsx';
import { MapPage } from './pages/MapPage.tsx';
import { OrdersPage } from './pages/Orders.tsx';
import { DispatchPage } from './pages/Dispatch.tsx';
import { PersonnelPage } from './pages/Personnel.tsx';
import { FleetPage } from './pages/Fleet.tsx';
import { FinancePage } from './pages/Finance.tsx';
import { CustomersPage, LocationsPage } from './pages/Business.tsx';
import { MarketPage } from './pages/Market.tsx';
import { PrivatePage } from './pages/Private.tsx';
import { TeamPage } from './pages/Team.tsx';
import { StatsPage } from './pages/Stats.tsx';
import { SettingsPage } from './pages/Settings.tsx';
import { Sidebar, Toasts, TopBar } from './ui/Shell.tsx';
import { DispatchDialog } from './ui/DispatchDialog.tsx';
import { ConfirmHost } from './ui/confirm.tsx';
import { HelpDialog } from './ui/Help.tsx';
import { ContextMenuHost } from './ui/ContextMenu.tsx';
import { helpForPage } from './ui/help.ts';
import { Tutorial } from './ui/Tutorial.tsx';
import { ErrorBoundary } from './ui/ErrorBoundary.tsx';
import { startBackground, stopBackground } from './ui/sound.ts';

const PAGES = {
  dashboard: Dashboard,
  map: MapPage,
  orders: OrdersPage,
  dispatch: DispatchPage,
  personnel: PersonnelPage,
  fleet: FleetPage,
  finance: FinancePage,
  customers: CustomersPage,
  locations: LocationsPage,
  market: MarketPage,
  private: PrivatePage,
  multiplayer: TeamPage,
  stats: StatsPage,
  settings: SettingsPage,
};

export function App() {
  const theme = useUi((u) => u.theme);
  const inGame = useUi((u) => !!u.state && !!u.host);
  const page = useUi((u) => u.page);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Musik und Büroatmosphäre nur im laufenden Spiel
  useEffect(() => {
    if (!inGame) return;
    startBackground();
    return stopBackground;
  }, [inGame]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = getUi().state;
      if (!st || !getUi().host) return;
      if (e.key === 'F1') {
        e.preventDefault();
        setUi({ help: getUi().help === null ? helpForPage(getUi().page) : null });
        return;
      }
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || getUi().dispatchDraft) return;
      if (e.code === 'Space') {
        e.preventDefault();
        sendCommand({ type: 'setPaused', paused: !st.paused }, { quiet: true });
      } else if (/^Digit[1-6]$/.test(e.code)) {
        sendCommand({ type: 'setSpeed', speed: SPEEDS[Number(e.code.slice(5)) - 1] }, { quiet: true });
        if (st.paused) sendCommand({ type: 'setPaused', paused: false }, { quiet: true });
      } else if (e.key === 'm') navigate('map');
      else if (e.key === 'd') navigate('dispatch');
      else if (e.key === 'a') navigate('orders');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!inGame)
    return (
      <>
        <Welcome />
        <ConfirmHost />
        <Toasts />
      </>
    );
  const Page = PAGES[page];
  return (
    <div className="app">
      <TopBar />
      <Sidebar />
      <main className="main">
        <ErrorBoundary scope="page" resetKey={page}>
          <Page />
        </ErrorBoundary>
      </main>
      <DispatchDialog />
      <Tutorial />
      <HelpDialog />
      <ContextMenuHost />
      <ConfirmHost />
      <Toasts />
    </div>
  );
}
