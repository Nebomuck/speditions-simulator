import { useState } from 'react';
import { Crosshair, X, Navigation, PackagePlus, MapPin, TriangleAlert } from 'lucide-react';
import {
  CARGO_BY_ID, TRUCK_BY_ID, CITY_BY_ID, drivableNow, formatDateTime, formatDuration, formatHours, nearestCity, remainingKm, vehicleSchedule, vehicleMarker, isTripLate, ordersOnBoard,
  REST_KIND_LABEL, loadSpace, disruptionLabel,
} from '@spedsim/core';
import { sendCommand, setUi, useGame, useUi, world } from '../game/store.ts';
import { Badge, Bar, Money } from '../ui/components.tsx';
import { MapView, type MapFilter } from '../ui/MapView.tsx';
import { activityLabel, cityName, countryName, km, tons, modelName, tripLabel } from '../ui/format.ts';

const FILTERS: [MapFilter, string][] = [
  ['all', 'Alle Fahrzeuge'],
  ['active', 'Aktive Transporte'],
  ['idle', 'Verfügbar'],
  ['late', 'Verspätet'],
  ['loaded', 'Beladen'],
  ['empty', 'Leerfahrten'],
];

export function MapPage() {
  const [filter, setFilter] = useState<MapFilter>('all');
  const [driverId, setDriverId] = useState('');
  const s = useGame();
  const selected = useUi((u) => u.selectedVehicleId);
  const [traffic, setTraffic] = useState(false);
  const disruptions = s.disruptions ?? [];
  return (
    <div className="page-full">
      <MapView filter={filter} driverId={driverId} />
      <div className="map-panel map-filters">
        {FILTERS.map(([f, label]) => (
          <button key={f} className={`chip ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>{label}</button>
        ))}
        <select className="input" style={{ width: 170, padding: '4px 8px', borderRadius: 20 }} value={driverId} onChange={(e) => setDriverId(e.target.value)}>
          <option value="">Alle Fahrer</option>
          {Object.values(s.drivers).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <button className={`chip ${traffic ? 'active' : ''}`} onClick={() => setTraffic(!traffic)}>
          <TriangleAlert size={13} /> Verkehrslage ({disruptions.length})
        </button>
      </div>
      {traffic && (
        <div className="map-panel" style={{ top: 112, left: 12, width: 340, maxHeight: 300, overflow: 'auto' }}>
          {disruptions.length === 0 ? (
            <div className="dim">Derzeit keine Sperrungen oder Staus.</div>
          ) : (
            <div className="list">
              {disruptions.map((d) => {
                const e = world.net.edgeBetween(d.a, d.b);
                return (
                  <div
                    key={d.id}
                    className="list-item clickable"
                    onClick={() => e && setUi({ mapFocus: e.coords[Math.floor(e.coords.length / 2)] as [number, number] })}
                  >
                    <Badge kind={d.kind === 'closure' ? 'danger' : 'warning'}>{d.kind === 'closure' ? 'Sperrung' : 'Stau'}</Badge>
                    <span style={{ flex: 1 }}>
                      {disruptionLabel(d).replace(/^(Sperrung|Stau) /, '')}
                      <div className="dim" style={{ fontSize: 11.5 }}>bis ca. {formatDateTime(d.until)}{d.kind === 'jam' ? ` · Tempo ${Math.round(d.speedFactor * 100)} %` : ''}</div>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      <div className="map-panel map-legend">
        <span><i className="dot" style={{ background: '#38bdf8' }} />Fahrt</span>
        <span><i className="dot" style={{ background: '#fbbf24' }} />Pause</span>
        <span><i className="dot" style={{ background: '#a78bfa' }} />Ruhezeit</span>
        <span><i className="dot" style={{ background: '#34d399' }} />Be-/Entladung</span>
        <span><i className="dot" style={{ background: '#f87171' }} />Verspätet/Defekt</span>
        <span><i className="dot" style={{ background: '#64748b' }} />Frei</span>
        <span><i className="dot" style={{ background: '#f59e0b' }} />Standort</span>
        <span><i className="dot" style={{ background: '#ef4444' }} />Sperrung</span>
        <span><i className="dot" style={{ background: '#f97316' }} />Stau</span>
      </div>
      {selected && s.vehicles[selected] && <VehiclePanel vehicleId={selected} />}
    </div>
  );
}

export function VehiclePanel({ vehicleId }: { vehicleId: string }) {
  const s = useGame();
  const follow = useUi((u) => u.followVehicle);
  const v = s.vehicles[vehicleId];
  const trip = v.tripId ? s.trips[v.tripId] : undefined;
  const driver = trip ? s.drivers[trip.driverId] : Object.values(s.drivers).find((d) => d.cityId === v.cityId && d.status === 'idle');
  const order = trip?.orderId ? s.orders[trip.orderId] : undefined;
  const m = vehicleMarker(s, world, vehicleId);
  const near = nearestCity(m.pos);
  const model = TRUCK_BY_ID[v.modelId];
  const late = trip ? isTripLate(s, trip) : false;
  const sched = trip ? vehicleSchedule(s, world, vehicleId)[0] : undefined;
  const eta = sched?.end.time ?? 0;
  const onBoard = trip ? ordersOnBoard(trip, trip.legIndex).reduce((w, id) => w + s.orders[id].weightT, 0) : 0;
  const space = loadSpace(v.modelId, trip?.trailerId ? s.trailers[trip.trailerId]?.type : undefined);
  const drive = driver ? drivableNow(driver.hos) : 0;
  return (
    <div className="map-panel vehicle-panel">
      <div className="row">
        <div>
          <div style={{ fontWeight: 650, fontSize: 16 }}>{v.plate}</div>
          <div className="dim">{modelName(v.modelId)} · {v.year}</div>
        </div>
        <div className="spacer" />
        <button className={`btn small ${follow ? 'primary' : ''}`} onClick={() => setUi({ followVehicle: !follow })} title="Fahrzeug verfolgen">
          <Crosshair size={14} /> Verfolgen
        </button>
        <button className="icon-btn" onClick={() => setUi({ selectedVehicleId: null, followVehicle: false })}><X size={16} /></button>
      </div>
      <div className="row wrap mt">
        <Badge kind={trip ? (trip.activity === 'breakdown' ? 'danger' : 'info') : 'success'}>{activityLabel(trip, v.status)}</Badge>
        {late && <Badge kind="danger">Verspätet</Badge>}
        {trip && <Badge>{trip.legs[trip.legIndex].loaded ? 'Beladen' : 'Leer'}</Badge>}
      </div>
      <dl className="kv mt">
        <dt>Fahrer</dt><dd>{driver?.name ?? '–'}</dd>
        <dt>Position</dt><dd>{near.km < 15 ? cityName(near.id) : `${Math.round(near.km)} km bei ${cityName(near.id)}`} ({countryName(CITY_BY_ID[near.id].country)})</dd>
        <dt>Geschwindigkeit</dt><dd>{trip ? `${trip.speedKmh} km/h` : '0 km/h'}</dd>
        {trip && (
          <>
            <dt>Auftrag</dt><dd>{tripLabel(s, trip)}</dd>
            {order && (trip.stops?.length ?? 0) <= 2 && <><dt>Ladung</dt><dd>{CARGO_BY_ID[order.cargoId].name}, {tons(order.weightT)}</dd></>}
            {(trip.stops?.length ?? 0) > 2 && space && <><dt>Geladen</dt><dd>{tons(onBoard)} von {tons(space.payloadT)}</dd></>}
            <dt>Start → Ziel</dt><dd>{cityName(trip.legs[0].nodes[0])} → {cityName(trip.legs[trip.legs.length - 1].nodes.at(-1)!)}</dd>
            <dt>Reststrecke</dt><dd>{km(remainingKm(trip))}</dd>
            <dt>Voraussichtl. Ankunft</dt><dd className={late ? 'neg' : ''}>{formatDateTime(eta)}</dd>
            {order && <><dt>Liefertermin</dt><dd>{formatDateTime(order.deliveryEnd)}</dd></>}
            {trip.activityLeft > 0 && trip.activity !== 'driving' && <><dt>Restdauer</dt><dd>{formatDuration(trip.activityLeft)}</dd></>}
            <dt>Kosten bisher</dt><dd>Diesel <Money value={trip.costs.fuel} /> · Maut <Money value={Math.round(trip.costs.toll)} /></dd>
          </>
        )}
        <dt>Kraftstoff</dt>
        <dd>
          <div className="row"><Bar value={(v.fuelL / model.tankL) * 100} /> {Math.round(v.fuelL)} / {model.tankL} l</div>
        </dd>
        <dt>Zustand</dt>
        <dd><div className="row"><Bar value={v.condition} /> {Math.round(v.condition)} %</div></dd>
        <dt>Kilometerstand</dt><dd>{km(v.odometerKm)}</dd>
        {driver && (
          <>
            <dt>Restlenkzeit</dt><dd>{driver.hos.requiredRest > 0 ? `${REST_KIND_LABEL[driver.hos.requiredRestKind]} (${formatDuration(driver.hos.requiredRest)})` : formatDuration(drive)}</dd>
            <dt>Lenkzeit heute</dt><dd>{formatDuration(driver.hos.drivenToday)} / 9 h</dd>
            <dt>Lenkzeit Woche</dt><dd>{formatHours(driver.hos.drivenWeek)} / 56 h</dd>
          </>
        )}
      </dl>
      {trip && sched?.stops && sched.stops.length > 0 && (
        <>
          <div className="card-title mt" style={{ marginBottom: 6 }}><MapPin size={14} />Halte</div>
          <div className="list">
            {sched.stops.map((st, i) => {
              const o = s.orders[st.orderId];
              const removable = st.kind === 'pickup' && !st.done && o.status === 'planned' && trip.orderId !== o.id;
              return (
                <div key={i} className="list-item" style={st.done ? { opacity: 0.5 } : i === trip.legIndex ? { fontWeight: 600 } : undefined}>
                  <time>{st.done ? 'erledigt' : formatDateTime(st.eta).slice(3)}</time>
                  <span style={{ flex: 1 }}>
                    {st.kind === 'pickup' ? 'Laden' : 'Entladen'} {cityName(st.cityId)} · {CARGO_BY_ID[o.cargoId].name} {tons(o.weightT)}
                    {st.kind === 'delivery' && !st.done && st.eta > o.deliveryEnd && <Badge kind="danger">zu spät</Badge>}
                  </span>
                  {removable && (
                    <button className="icon-btn" title="Beiladung herausnehmen" onClick={() => sendCommand({ type: 'removeCoLoad', orderId: o.id })}>
                      <X size={13} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {trip.stops && (
            <button className="btn small mt" onClick={() => setUi({ dispatchDraft: { vehicleId } })}>
              <PackagePlus size={14} /> Auftrag zuladen
            </button>
          )}
        </>
      )}
      {trip && trip.log.length > 0 && (
        <>
          <div className="card-title mt" style={{ marginBottom: 6 }}><Navigation size={14} />Fahrtverlauf</div>
          <div className="list" style={{ maxHeight: 180, overflow: 'auto' }}>
            {[...trip.log].reverse().map((l, i) => (
              <div key={i} className="list-item"><time>{formatDateTime(l.t).slice(3)}</time>{l.text}</div>
            ))}
          </div>
        </>
      )}
      {!trip && v.status === 'idle' && (
        <button className="btn primary mt" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setUi({ dispatchDraft: { vehicleId } })}>
          Fahrt disponieren
        </button>
      )}
    </div>
  );
}
