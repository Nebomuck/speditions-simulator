// Kalender der Disposition: Tag, Woche, Monat. Zeigt laufende Fahrten, vorausgeplante Folgeaufträge
// und angenommene, noch nicht disponierte Aufträge (Abholfristen).

import { Fragment, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  MIN_PER_DAY, MONTH_NAMES, WEEKDAY_SHORT, dayIndex, dayOfMonth, formatDate, formatTime, holidayName, month, toDate, vehicleSchedule, weekday,
  type GameState,
} from '@spedsim/core';
import { setUi, useGame, world } from '../game/store.ts';
import { Card, Empty } from '../ui/components.tsx';
import { cityName } from '../ui/format.ts';

type View = 'day' | 'week' | 'month';

interface CalEvent {
  t: number;
  kind: 'pickup' | 'delivery' | 'open';
  queued: boolean;
  late: boolean;
  vehicleId?: string;
  orderId: string;
  label: string;
}

interface Bar {
  vehicleId: string;
  start: number;
  end: number;
  queued: boolean;
  late: boolean;
  label: string;
}

function collect(s: GameState) {
  const events: CalEvent[] = [];
  const bars: Bar[] = [];
  for (const v of Object.values(s.vehicles)) {
    for (const item of vehicleSchedule(s, world, v.id)) {
      const o = item.orderId ? s.orders[item.orderId] : undefined;
      const label = `${cityName(item.fromCityId)} → ${cityName(item.toCityId)}`;
      bars.push({ vehicleId: v.id, start: item.start, end: item.end.time, queued: item.kind === 'queued', late: item.lateMin > 0, label: o ? label : `Überführung ${cityName(item.toCityId)}` });
      if (!o) continue;
      if (item.stops) {
        // laufende Fahrt: jeder Halt einzeln (inkl. Beiladungen)
        for (const st of item.stops) {
          if (st.done) continue;
          const so = s.orders[st.orderId];
          const pickup = st.kind === 'pickup';
          events.push({ t: st.eta, kind: pickup ? 'pickup' : 'delivery', queued: false, late: !pickup && st.eta > so.deliveryEnd, vehicleId: v.id, orderId: so.id, label: `${v.plate}: ${pickup ? 'Laden' : 'Lieferung'} ${cityName(st.cityId)}` });
        }
        continue;
      }
      const trip = item.tripId ? s.trips[item.tripId] : undefined;
      const pickupAt = item.pickup ?? (trip?.phase === 'to_pickup' ? o.pickupStart : undefined);
      if (pickupAt !== undefined)
        events.push({ t: pickupAt, kind: 'pickup', queued: item.kind === 'queued', late: false, vehicleId: v.id, orderId: o.id, label: `${v.plate}: Laden ${cityName(o.fromCityId)}` });
      events.push({ t: item.end.time, kind: 'delivery', queued: item.kind === 'queued', late: item.lateMin > 0, vehicleId: v.id, orderId: o.id, label: `${v.plate}: Lieferung ${cityName(o.toCityId)}` });
    }
  }
  for (const o of Object.values(s.orders)) {
    if (o.status !== 'accepted') continue;
    events.push({ t: o.pickupEnd, kind: 'open', queued: false, late: o.pickupEnd < s.time, orderId: o.id, label: `Offen: ${cityName(o.fromCityId)} → ${cityName(o.toCityId)} (Abholung bis ${formatTime(o.pickupEnd)})` });
  }
  events.sort((a, b) => a.t - b.t);
  return { events, bars };
}

function openEvent(e: CalEvent) {
  if (e.kind === 'open') setUi({ dispatchDraft: { orderId: e.orderId } });
  else if (e.vehicleId && !e.queued) setUi({ selectedVehicleId: e.vehicleId, page: 'map' });
  else setUi({ page: 'orders', focusOrderId: e.orderId });
}

function EventChip({ e, withTime = true }: { e: CalEvent; withTime?: boolean }) {
  const cls = `cal-ev ${e.late ? 'late' : e.kind} ${e.queued ? 'queued' : ''}`;
  return (
    <div className={cls} title={`${formatDate(e.t)} ${formatTime(e.t)} · ${e.label}${e.queued ? ' (vorausgeplant)' : ''}${e.late ? ' – verspätet' : ''}`} onClick={() => openEvent(e)}>
      {withTime && <b>{formatTime(e.t)} </b>}
      {e.label}
    </div>
  );
}

export function CalendarView() {
  const s = useGame();
  const [view, setView] = useState<View>('week');
  const [anchor, setAnchor] = useState(() => dayIndex(s.time) * MIN_PER_DAY);
  const { events, bars } = useMemo(() => collect(s), [s]);
  const today = dayIndex(s.time);

  const step = view === 'day' ? 1 : view === 'week' ? 7 : 30;
  const move = (dir: number) => {
    if (view !== 'month') return setAnchor((a) => a + dir * step * MIN_PER_DAY);
    // Monat: auf den 1. des Vor-/Folgemonats springen
    const d = toDate(anchor);
    const target = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + dir, 1);
    setAnchor(anchor + Math.round((target - d.getTime()) / 60000));
  };

  const title =
    view === 'day'
      ? `${WEEKDAY_SHORT[weekday(anchor)]} ${formatDate(anchor)}`
      : view === 'week'
        ? (() => {
            const mon = anchor - weekday(anchor) * MIN_PER_DAY;
            return `Woche ${formatDate(mon)} – ${formatDate(mon + 6 * MIN_PER_DAY)}`;
          })()
        : `${MONTH_NAMES[month(anchor)]} ${toDate(anchor).getUTCFullYear()}`;

  return (
    <Card>
      <div className="cal-head">
        <div className="seg" style={{ display: 'inline-flex' }}>
          {(['day', 'week', 'month'] as const).map((v) => (
            <button key={v} className={view === v ? 'active' : ''} onClick={() => setView(v)}>{{ day: 'Tag', week: 'Woche', month: 'Monat' }[v]}</button>
          ))}
        </div>
        <button className="icon-btn" onClick={() => move(-1)} title="Zurück"><ChevronLeft size={16} /></button>
        <button className="btn small" onClick={() => setAnchor(today * MIN_PER_DAY)}>Heute</button>
        <button className="icon-btn" onClick={() => move(1)} title="Weiter"><ChevronRight size={16} /></button>
        <b style={{ marginLeft: 6 }}>{title}</b>
        <span className="dim" style={{ marginLeft: 'auto', fontSize: 12 }}>
          <span className="cal-ev pickup" style={{ display: 'inline-block' }}>Laden</span>{' '}
          <span className="cal-ev delivery" style={{ display: 'inline-block' }}>Lieferung</span>{' '}
          <span className="cal-ev queued pickup" style={{ display: 'inline-block' }}>vorausgeplant</span>{' '}
          <span className="cal-ev open" style={{ display: 'inline-block' }}>noch offen</span>{' '}
          <span className="cal-ev late" style={{ display: 'inline-block' }}>verspätet</span>
        </span>
      </div>
      {view === 'month' && <MonthView anchor={anchor} today={today} events={events} onDay={(d) => (setAnchor(d * MIN_PER_DAY), setView('day'))} />}
      {view === 'week' && <WeekView anchor={anchor} today={today} events={events} s={s} />}
      {view === 'day' && <DayView anchor={anchor} events={events} bars={bars} s={s} />}
    </Card>
  );
}

function MonthView({ anchor, today, events, onDay }: { anchor: number; today: number; events: CalEvent[]; onDay: (day: number) => void }) {
  const first = anchor - (dayOfMonth(anchor) - 1) * MIN_PER_DAY;
  const gridStart = dayIndex(first) - weekday(first);
  const curMonth = month(anchor);
  const days = Array.from({ length: 42 }, (_, i) => gridStart + i);
  return (
    <div className="cal-month">
      {WEEKDAY_SHORT.map((d) => <div key={d} className="dow">{d}</div>)}
      {days.map((d) => {
        const t = d * MIN_PER_DAY;
        const evs = events.filter((e) => dayIndex(e.t) === d);
        const holiday = holidayName(t);
        return (
          <div key={d} className={`cal-day ${month(t) !== curMonth ? 'other' : ''} ${d === today ? 'today' : ''}`} onDoubleClick={() => onDay(d)}>
            <div className="num">
              <span>{dayOfMonth(t)}</span>
              {holiday && <span className="dim" title={holiday} style={{ fontWeight: 400 }}>{holiday.slice(0, 12)}</span>}
            </div>
            {evs.slice(0, 4).map((e, i) => <EventChip key={i} e={e} />)}
            {evs.length > 4 && <div className="dim" style={{ cursor: 'pointer' }} onClick={() => onDay(d)}>+ {evs.length - 4} weitere</div>}
          </div>
        );
      })}
    </div>
  );
}

function WeekView({ anchor, today, events, s }: { anchor: number; today: number; events: CalEvent[]; s: GameState }) {
  const monday = dayIndex(anchor) - weekday(anchor);
  const days = Array.from({ length: 7 }, (_, i) => monday + i);
  const vehicles = Object.values(s.vehicles);
  const rows: { key: string; label: string; filter: (e: CalEvent) => boolean }[] = [
    ...vehicles.map((v) => ({ key: v.id, label: `${v.plate}`, filter: (e: CalEvent) => e.vehicleId === v.id })),
    { key: 'open', label: 'Noch nicht disponiert', filter: (e: CalEvent) => e.kind === 'open' },
  ];
  return (
    <div className="cal-week">
      <div className="hd">Fahrzeug</div>
      {days.map((d) => (
        <div key={d} className="hd" style={d === today ? { color: 'var(--accent)' } : undefined}>
          {WEEKDAY_SHORT[weekday(d * MIN_PER_DAY)]} {formatDate(d * MIN_PER_DAY).slice(0, 6)}
          {holidayName(d * MIN_PER_DAY) && <div className="dim" style={{ fontWeight: 400 }}>{holidayName(d * MIN_PER_DAY)}</div>}
        </div>
      ))}
      {rows.map((r) => (
        <Fragment key={r.key}>
          <div style={{ fontWeight: 550 }}>{r.label}</div>
          {days.map((d) => (
            <div key={r.key + d}>
              {events.filter((e) => r.filter(e) && dayIndex(e.t) === d).map((e, i) => <EventChip key={i} e={e} />)}
            </div>
          ))}
        </Fragment>
      ))}
    </div>
  );
}

function DayView({ anchor, events, bars, s }: { anchor: number; events: CalEvent[]; bars: Bar[]; s: GameState }) {
  const start = dayIndex(anchor) * MIN_PER_DAY;
  const end = start + MIN_PER_DAY;
  const pct = (t: number) => ((Math.max(start, Math.min(end, t)) - start) / MIN_PER_DAY) * 100;
  const dayEvents = events.filter((e) => e.t >= start && e.t < end);
  return (
    <>
      <div className="table-wrap">
        <div className="gantt-scale">
          <div className="gantt-label" style={{ fontWeight: 600 }}>Fahrzeug</div>
          <div className="ticks">
            {[0, 3, 6, 9, 12, 15, 18, 21].map((h) => <span key={h} style={{ left: `${(h / 24) * 100}%` }}>{String(h).padStart(2, '0')}:00</span>)}
          </div>
        </div>
        {Object.values(s.vehicles).map((v) => (
          <div key={v.id} className="gantt-row">
            <div className="gantt-label"><b>{v.plate}</b></div>
            <div className="gantt-track">
              {s.time >= start && s.time < end && <div className="gantt-now" style={{ left: `${pct(s.time)}%` }} />}
              {bars
                .filter((b) => b.vehicleId === v.id && b.end > start && b.start < end)
                .map((b, i) => (
                  <div key={i} className={`gantt-bar ${b.queued ? 'queued' : b.late ? 'late' : 'loaded'} ${b.queued && b.late ? 'late' : ''}`} style={{ left: `${pct(b.start)}%`, width: `${Math.max(1, pct(b.end) - pct(b.start))}%` }} title={b.label}>
                    <span>{b.label}</span>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt">
        {dayEvents.length === 0 ? <Empty>Keine Termine an diesem Tag.</Empty> : dayEvents.map((e, i) => <EventChip key={i} e={e} />)}
      </div>
    </>
  );
}
