// Dispositionsoberfläche: Plantafel mit Drag-and-Drop + Zeitstrahl (inkl. vorausgeplanter Folgeaufträge),
// Kalender (Tag/Woche/Monat), Listenansicht, Fahreransicht.

import { useState } from 'react';
import { GripVertical, ArrowRight, Send, RotateCcw, CalendarRange, CalendarDays, List, Users, X } from 'lucide-react';
import {
  CITY_BY_ID, formatDateTime, formatDuration, formatTime, isTripLate, remainingKm, tripEta, dayIndex, MIN_PER_DAY, WEEKDAY_SHORT, weekday,
  drivableNow, REST_KIND_LABEL, CITIES, vehicleSchedule,
} from '@spedsim/core';
import { CalendarView } from './Calendar.tsx';
import { navigate, sendCommand, setUi, useGame, world } from '../game/store.ts';
import { Badge, Card, Empty, Modal, Money, PageHeader } from '../ui/components.tsx';
import { activityLabel, cargoName, cityName, km, trailerName, tripLabel } from '../ui/format.ts';

const HOURS = 72;

export function DispatchPage() {
  const [tab, setTab] = useState<'board' | 'calendar' | 'list' | 'drivers'>('board');
  return (
    <div className="page">
      <PageHeader
        title="Disposition"
        subtitle="Aufträge per Drag-and-Drop auf ein Fahrzeug ziehen – auf freie LKW für den sofortigen Start, auf fahrende LKW als Folgeauftrag (Vorausplanung)."
        actions={<button className="btn primary" onClick={() => setUi({ dispatchDraft: {} })}><Send size={15} />Neue Fahrt planen</button>}
      />
      <div className="tabs">
        <button className={`tab ${tab === 'board' ? 'active' : ''}`} onClick={() => setTab('board')}><CalendarRange size={15} />Plantafel & Zeitstrahl</button>
        <button className={`tab ${tab === 'calendar' ? 'active' : ''}`} onClick={() => setTab('calendar')}><CalendarDays size={15} />Kalender</button>
        <button className={`tab ${tab === 'list' ? 'active' : ''}`} onClick={() => setTab('list')}><List size={15} />Listenansicht</button>
        <button className={`tab ${tab === 'drivers' ? 'active' : ''}`} onClick={() => setTab('drivers')}><Users size={15} />Fahreransicht</button>
      </div>
      {tab === 'board' && <Board />}
      {tab === 'calendar' && <CalendarView />}
      {tab === 'list' && <TripList />}
      {tab === 'drivers' && <DriverView />}
    </div>
  );
}

function Board() {
  const s = useGame();
  const [dragOrder, setDragOrder] = useState<string | null>(null);
  const [hoverVehicle, setHoverVehicle] = useState<string | null>(null);
  const [relocate, setRelocate] = useState<string | null>(null);
  const accepted = Object.values(s.orders).filter((o) => o.status === 'accepted').sort((a, b) => a.pickupEnd - b.pickupEnd);
  const vehicles = Object.values(s.vehicles);
  const start = Math.floor(s.time / 60) * 60 - 6 * 60;
  const end = start + HOURS * 60;
  const pct = (t: number) => ((Math.max(start, Math.min(end, t)) - start) / (end - start)) * 100;
  const ticks: { t: number; label: string }[] = [];
  for (let t = Math.ceil(start / 360) * 360; t < end; t += 360) {
    ticks.push({ t, label: t % MIN_PER_DAY === 0 ? `${WEEKDAY_SHORT[weekday(t)]} ${formatDateTime(t).slice(3, 8)}` : formatTime(t) });
  }

  return (
    <div className="dispatch-grid">
      <Card title="Angenommene Aufträge" sub={`${accepted.length}`}>
        {accepted.length === 0 && (
          <Empty>
            Keine offenen Aufträge.<br />
            <button className="btn small mt" onClick={() => navigate('orders')}>Zur Auftragsbörse</button>
          </Empty>
        )}
        {accepted.map((o) => (
          <div
            key={o.id}
            className={`order-card ${dragOrder === o.id ? 'dragging' : ''}`}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('text/order', o.id);
              e.dataTransfer.effectAllowed = 'link';
              setDragOrder(o.id);
            }}
            onDragEnd={() => {
              setDragOrder(null);
              setHoverVehicle(null);
            }}
            onDoubleClick={() => setUi({ dispatchDraft: { orderId: o.id } })}
          >
            <div className="route"><GripVertical size={14} className="dim" />{cityName(o.fromCityId)} <ArrowRight size={13} /> {cityName(o.toCityId)}</div>
            <div className="meta">
              <span>{cargoName(o.cargoId)}</span>
              <span>{trailerName(o.trailerType)}{o.partial ? ` · Teilladung ${o.weightT.toLocaleString('de-DE')} t` : ''}</span>
              <span>{km(o.distanceKm)}</span>
              <span><Money value={o.payment} /></span>
            </div>
            <div className="meta">
              <span>Abholung bis {formatDateTime(o.pickupEnd)}</span>
              <span>Lieferung bis {formatDateTime(o.deliveryEnd)}</span>
            </div>
          </div>
        ))}
      </Card>

      <div className="table-wrap">
        <div className="gantt-scale">
          <div className="gantt-label" style={{ fontWeight: 600 }}>Fahrzeug / Fahrer</div>
          <div className="ticks">
            {ticks.map((t) => <span key={t.t} style={{ left: `${pct(t.t)}%` }}>{t.label}</span>)}
          </div>
        </div>
        {vehicles.map((v) => {
          const trip = v.tripId ? s.trips[v.tripId] : undefined;
          const driver = trip ? s.drivers[trip.driverId] : Object.values(s.drivers).find((d) => d.status === 'idle' && d.cityId === v.cityId);
          const canDrop = (!trip && v.status === 'idle') || (!!trip && v.status === 'on_trip' && (v.queue?.length ?? 0) < 5);
          const schedule = vehicleSchedule(s, world, v.id).filter((i) => i.kind === 'queued');
          const recent = Object.values(s.trips).filter((t) => t.vehicleId === v.id && t.phase === 'done' && (t.finishedAt ?? 0) > start);
          return (
            <div
              key={v.id}
              className={`gantt-row drop-row ${hoverVehicle === v.id && dragOrder ? (canDrop ? 'drop-ok' : '') : ''}`}
              onDragOver={(e) => {
                if (!canDrop) return;
                e.preventDefault();
                setHoverVehicle(v.id);
              }}
              onDragLeave={() => setHoverVehicle(null)}
              onDrop={(e) => {
                const orderId = e.dataTransfer.getData('text/order');
                setHoverVehicle(null);
                if (orderId && canDrop) setUi({ dispatchDraft: { orderId, vehicleId: v.id } });
              }}
            >
              <div className="gantt-label">
                <b>{v.plate}</b> <span className="dim">· {cityName(trip ? trip.legs[trip.legIndex].nodes[0] : v.cityId)}</span>
                <small>{driver ? driver.name : 'kein Fahrer vor Ort'} · {activityLabel(trip, v.status)}</small>
                {canDrop && (
                  <button className="btn small ghost" style={{ padding: '2px 4px', marginTop: 2 }} onClick={() => setRelocate(v.id)} title="Leer überführen">
                    <RotateCcw size={12} /> Überführen
                  </button>
                )}
              </div>
              <div className="gantt-track">
                <div className="gantt-now" style={{ left: `${pct(s.time)}%` }} />
                {recent.map((t) => (
                  <div key={t.id} className="gantt-bar empty" style={{ left: `${pct(t.startedAt)}%`, width: `${Math.max(0.5, pct(t.finishedAt!) - pct(t.startedAt))}%`, opacity: 0.5 }} title={tripLabel(s, t)}>
                    {tripLabel(s, t)}
                  </div>
                ))}
                {trip && (() => {
                  const eta = tripEta(s, world, trip);
                  const late = isTripLate(s, trip);
                  const cls = !trip.orderId ? 'reloc' : late ? 'late' : 'loaded';
                  return (
                    <div
                      className={`gantt-bar ${cls}`}
                      style={{ left: `${pct(trip.startedAt)}%`, width: `${Math.max(1, pct(eta) - pct(trip.startedAt))}%` }}
                      title={`${tripLabel(s, trip)} · Ankunft ${formatDateTime(eta)}`}
                      onClick={() => setUi({ selectedVehicleId: v.id, page: 'map' })}
                    >
                      {tripLabel(s, trip)} · {formatDateTime(eta).slice(3)}
                    </div>
                  );
                })()}
                {schedule.map((q) => {
                  const o = s.orders[q.orderId!];
                  return (
                    <div
                      key={q.queueId}
                      className={`gantt-bar queued ${q.lateMin > 0 ? 'late' : ''}`}
                      style={{ left: `${pct(q.start)}%`, width: `${Math.max(1, pct(q.end.time) - pct(q.start))}%` }}
                      title={`Folgeauftrag ${cityName(o.fromCityId)} → ${cityName(o.toCityId)} · Abholung ca. ${formatDateTime(q.pickup!)} · Ankunft ca. ${formatDateTime(q.end.time)}${q.lateMin > 0 ? ` · voraussichtlich ${formatDuration(q.lateMin)} zu spät` : ''}`}
                    >
                      <span>geplant: {cityName(o.fromCityId)} → {cityName(o.toCityId)}</span>
                      <button
                        className="icon-btn"
                        title="Aus der Planung nehmen"
                        style={{ marginLeft: 4, padding: 0, height: 16, width: 16, display: 'inline-flex' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          sendCommand({ type: 'unqueue', orderId: o.id, vehicleId: v.id });
                        }}
                      >
                        <X size={11} />
                      </button>
                    </div>
                  );
                })}
                {canDrop && dragOrder && (
                  <div className="dim" style={{ position: 'absolute', left: trip ? 'auto' : 12, right: trip ? 12 : 'auto', top: 14, fontSize: 12 }}>
                    {trip ? 'als Folgeauftrag einplanen' : 'Auftrag hier ablegen'}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {relocate && <RelocateDialog vehicleId={relocate} onClose={() => setRelocate(null)} />}
    </div>
  );
}

function RelocateDialog({ vehicleId, onClose }: { vehicleId: string; onClose: () => void }) {
  const s = useGame();
  const v = s.vehicles[vehicleId];
  const drivers = Object.values(s.drivers).filter((d) => d.status === 'idle' && d.cityId === v.cityId);
  const trailers = Object.values(s.trailers).filter((t) => t.status === 'idle' && t.cityId === v.cityId);
  const [driverId, setDriverId] = useState(drivers[0]?.id ?? '');
  const [trailerId, setTrailerId] = useState(trailers[0]?.id ?? '');
  const [to, setTo] = useState(s.company.hqCityId !== v.cityId ? s.company.hqCityId : 'berlin');
  const route = world.net.route(v.cityId, to);
  return (
    <Modal
      title={`Überführungsfahrt ${v.plate}`}
      onClose={onClose}
      width={520}
      footer={
        <>
          <button className="btn" onClick={onClose}>Abbrechen</button>
          <button
            className="btn primary"
            disabled={!driverId || !route || to === v.cityId}
            onClick={async () => (await sendCommand({ type: 'relocate', driverId, vehicleId, trailerId: trailerId || undefined, toCityId: to })).ok && onClose()}
          >
            Leerfahrt starten
          </button>
        </>
      }
    >
      <p className="muted" style={{ marginTop: 0 }}>Fahrzeug ohne Ladung in eine andere Region verlegen – z. B. zurück zum Betriebshof oder in ein Gebiet mit mehr Aufträgen.</p>
      <div className="field">
        <label>Fahrer (am Standort {cityName(v.cityId)})</label>
        <select className="input" value={driverId} onChange={(e) => setDriverId(e.target.value)}>
          {drivers.length === 0 && <option value="">Kein Fahrer vor Ort</option>}
          {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>
      <div className="field">
        <label>Auflieger mitnehmen</label>
        <select className="input" value={trailerId} onChange={(e) => setTrailerId(e.target.value)}>
          <option value="">ohne Auflieger (Solo)</option>
          {trailers.map((t) => <option key={t.id} value={t.id}>{trailerName(t.type)} {t.plate}</option>)}
        </select>
      </div>
      <div className="field">
        <label>Ziel</label>
        <select className="input" value={to} onChange={(e) => setTo(e.target.value)}>
          {[...CITIES].sort((a, b) => a.name.localeCompare(b.name)).map((c) => <option key={c.id} value={c.id}>{c.name} ({c.country})</option>)}
        </select>
      </div>
      {route && <p className="muted">Strecke {km(route.km)} · reine Fahrzeit {formatDuration(route.driveMin)} · Maut ca. <Money value={route.toll} /></p>}
    </Modal>
  );
}

function TripList() {
  const s = useGame();
  const trips = Object.values(s.trips).sort((a, b) => (a.phase === 'done' ? 1 : 0) - (b.phase === 'done' ? 1 : 0) || b.startedAt - a.startedAt);
  if (!trips.length) return <Empty>Noch keine Fahrten disponiert.</Empty>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr><th>Fahrt</th><th>Status</th><th>Fahrer</th><th>LKW</th><th className="num">Rest</th><th>Ankunft (ETA)</th><th>Liefertermin</th><th className="num">Erlös</th></tr>
        </thead>
        <tbody>
          {trips.map((t) => {
            const o = t.orderId ? s.orders[t.orderId] : undefined;
            const late = isTripLate(s, t);
            const eta = tripEta(s, world, t);
            return (
              <tr key={t.id} className="clickable" onClick={() => t.phase !== 'done' && setUi({ selectedVehicleId: t.vehicleId, page: 'map' })}>
                <td><b>{tripLabel(s, t)}</b><div className="dim">{o ? cargoName(o.cargoId) : 'Leerfahrt'}</div></td>
                <td>
                  <Badge kind={t.phase === 'done' ? 'success' : t.activity === 'breakdown' || late ? 'danger' : 'info'}>{t.phase === 'done' ? 'Abgeschlossen' : activityLabel(t, '')}</Badge>
                  {late && t.phase !== 'done' && <Badge kind="danger">verspätet</Badge>}
                </td>
                <td>{s.drivers[t.driverId]?.name ?? '–'}</td>
                <td>{s.vehicles[t.vehicleId]?.plate ?? '–'}</td>
                <td className="num">{t.phase === 'done' ? '–' : km(remainingKm(t))}</td>
                <td className="nowrap">{formatDateTime(eta)}</td>
                <td className="nowrap">{o ? formatDateTime(o.deliveryEnd) : '–'}</td>
                <td className="num">{o ? <Money value={o.payment} /> : '–'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DriverView() {
  const s = useGame();
  const drivers = Object.values(s.drivers);
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr><th>Fahrer</th><th>Status</th><th>Ort</th><th>Restlenkzeit</th><th>Heute</th><th>Woche</th><th>Ruhe nötig</th></tr>
        </thead>
        <tbody>
          {drivers.map((d) => {
            const trip = d.tripId ? s.trips[d.tripId] : undefined;
            return (
              <tr key={d.id}>
                <td><b>{d.name}</b></td>
                <td><Badge kind={trip ? 'info' : d.hos.requiredRest > 0 ? 'violet' : 'success'}>{trip ? activityLabel(trip, '') : d.hos.requiredRest > 0 ? 'Ruhezeit' : 'Verfügbar'}</Badge></td>
                <td>{trip ? `unterwegs: ${tripLabel(s, trip)}` : CITY_BY_ID[d.cityId].name}</td>
                <td>{formatDuration(drivableNow(d.hos))}</td>
                <td>{formatDuration(d.hos.drivenToday)} / 9 h</td>
                <td>{formatDuration(d.hos.drivenWeek)} / 56 h</td>
                <td>{d.hos.requiredRest > 0 ? `${REST_KIND_LABEL[d.hos.requiredRestKind]} ${formatDuration(d.hos.requiredRest)}` : '–'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="dim" style={{ padding: '0 12px' }}>Tag {dayIndex(s.time) + 1} · Regeln: 4,5 h → 45 min Pause · max. 9 h/Tag → 11 h Ruhe · max. 56 h/Woche bzw. 6 Tage → 45 h Wochenruhe.</p>
    </div>
  );
}
