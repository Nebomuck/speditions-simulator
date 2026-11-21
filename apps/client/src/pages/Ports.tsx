// Häfen & Container (Paket E, Schritt E3): Terminals mit Ampel und Wartezeit, eigene Containerkreisläufe.

import { Anchor, Container, Repeat } from 'lucide-react';
import {
  DETENTION_PER_DAY, FREE_DAYS, MIN_PER_DAY, allTerminals, containerBlock, formatDateTime, formatDuration, streetTurnCandidates, type Order,
} from '@spedsim/core';
import { sendCommand, setUi, toast, useGame } from '../game/store.ts';
import { Badge, Bar, Card, Empty, Money } from '../ui/components.tsx';
import { cityName } from '../ui/format.ts';
import { CareerLock } from '../ui/Career.tsx';

const LEVEL = { green: 'success', yellow: 'warning', red: 'danger' } as const;
const LEVEL_TEXT = { green: 'frei', yellow: 'voll', red: 'überlastet' } as const;
export const CONTAINER_PHASE: Record<NonNullable<Order['container']>['phase'], string> = {
  import: 'Import (voll ab Terminal)',
  return: 'Leerrückgabe',
  position: 'Gestellung (leer zum Verlader)',
  export: 'Export (voll zum Terminal)',
};

export function PortsPanel() {
  const s = useGame();
  const terms = allTerminals(s);
  return (
    <>
      <CareerLock feature="containers" />
      <Card title={<><Anchor size={16} /> Containerterminals</>} sub="Wartezeit am Tor nach Auslastung, Wochentag und Tageszeit. Großschiffe, Streiks und Winterstürme verlängern sie. Containeraufträge ab Terminal haben ein Zeitfenster (Slot) von 2 Stunden." className="mt">
        <div className="table-wrap" style={{ border: 'none' }}>
          <table className="table">
            <thead><tr><th>Terminal</th><th>Lage</th><th>Auslastung</th><th className="num">Wartezeit am Tor</th><th>Ereignis</th></tr></thead>
            <tbody>
              {terms.map((t) => (
                <tr key={t.def.cityId}>
                  <td><b>{t.def.name}</b></td>
                  <td><Badge kind={LEVEL[t.level]}>{LEVEL_TEXT[t.level]}</Badge></td>
                  <td style={{ minWidth: 120 }}><Bar value={Math.min(100, t.load * 100)} invert /></td>
                  <td className="num">{formatDuration(t.waitMin)}</td>
                  <td className="dim small">{t.event ? <>{t.event.text} (bis {formatDateTime(t.event.until)})</> : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Cycles />
    </>
  );
}

/** offene Containerkreisläufe der eigenen Firma */
function Cycles() {
  const s = useGame();
  const open = Object.values(s.orders).filter((o) => o.container && (o.status === 'accepted' || o.status === 'planned' || o.status === 'in_transit') && (!o.companyId || !s.arena || o.companyId === s.arena.companyId));
  const order = ['return', 'position', 'export', 'import'] as const;
  open.sort((a, b) => order.indexOf(a.container!.phase) - order.indexOf(b.container!.phase) || a.pickupStart - b.pickupStart);
  return (
    <Card
      title={<><Container size={16} /> Eigene Container</>}
      sub={`Nach jedem Import muss der Leercontainer binnen ${FREE_DAYS} Tagen zurück zum Terminal, danach kostet er ${(DETENTION_PER_DAY / 100).toLocaleString('de-DE')} € Standgeld je Tag. Exporte brauchen erst einen Leercontainer beim Verlader. Ein Leercontainer kann per Street-Turn direkt zu einem Exporteur in der Nähe.`}
      className="mt"
    >
      {!open.length ? <Empty>Keine offenen Containeraufträge. Seecontainer und Exportcontainer gibt es in der Auftragsbörse (Containerchassis nötig).</Empty> : (
        <div className="list">
          {open.map((o) => {
            const c = o.container!;
            const overdue = c.phase === 'return' && c.freeUntil !== undefined && s.time > c.freeUntil;
            const turns = c.phase === 'return' && o.status === 'accepted' && !c.streetTurn ? streetTurnCandidates(s, o.id) : [];
            const block = c.phase === 'export' ? containerBlock(s, o) : undefined;
            return (
              <div key={o.id} className="list-item" style={{ flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <b>{cityName(o.fromCityId)} → {cityName(o.toCityId)}</b> <Badge kind={c.phase === 'return' || c.phase === 'position' ? '' : 'info'}>{CONTAINER_PHASE[c.phase]}</Badge>
                  {c.streetTurn && <Badge kind="success">Street-Turn</Badge>}
                  <div className="dim small">
                    {c.phase === 'return' && c.freeUntil !== undefined && !c.streetTurn && (
                      overdue
                        ? <span className="neg">Gratistage vorbei seit {formatDuration(s.time - c.freeUntil)} · Standgeld bisher <Money value={c.detention ?? 0} /></span>
                        : <>frei bis {formatDateTime(c.freeUntil)} (noch {Math.max(0, Math.floor((c.freeUntil - s.time) / MIN_PER_DAY))} Tage)</>
                    )}
                    {c.phase === 'import' && <>Slot {formatDateTime(o.pickupStart)}–{formatDateTime(o.pickupEnd).slice(-5)}</>}
                    {c.phase === 'export' && <>Annahmeschluss {formatDateTime(o.deliveryEnd)}{block ? ' · wartet auf Leercontainer' : ' · Leercontainer beim Verlader'}</>}
                    {c.phase === 'position' && <>bis {formatDateTime(o.deliveryEnd)} beim Verlader</>}
                    {' · '}{o.status === 'accepted' ? 'nicht disponiert' : o.status === 'planned' ? 'eingeplant' : 'unterwegs'} · <Money value={o.payment} />
                  </div>
                </div>
                {turns.slice(0, 2).map((e) => (
                  <button key={e.id} className="btn small" title="Leercontainer direkt zum Exporteur statt zurück zum Terminal" onClick={async () => (await sendCommand({ type: 'streetTurn', returnId: o.id, exportId: e.id })).ok && toast('success', `Street-Turn nach ${cityName(e.fromCityId)}`)}>
                    <Repeat size={13} /> Street-Turn nach {cityName(e.fromCityId)}
                  </button>
                ))}
                {o.status === 'accepted' && <button className="btn small" onClick={() => setUi({ dispatchDraft: { orderId: o.id } })}>Disponieren</button>}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
