import { useState } from 'react';
import { Crosshair, X, Navigation } from 'lucide-react';
import {
  CARGO_BY_ID, TRUCK_BY_ID, CITY_BY_ID, drivableNow, formatDateTime, formatDuration, nearestCity, remainingKm, tripEta, vehicleMarker, isTripLate, REST_KIND_LABEL,
} from '@spedsim/core';
import { setUi, useGame, useUi, world } from '../game/store.ts';
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
      </div>
      <div className="map-panel map-legend">
        <span><i className="dot" style={{ background: '#38bdf8' }} />Fahrt</span>
        <span><i className="dot" style={{ background: '#fbbf24' }} />Pause</span>
        <span><i className="dot" style={{ background: '#a78bfa' }} />Ruhezeit</span>
        <span><i className="dot" style={{ background: '#34d399' }} />Be-/Entladung</span>
        <span><i className="dot" style={{ background: '#f87171' }} />Verspätet/Defekt</span>
        <span><i className="dot" style={{ background: '#64748b' }} />Frei</span>
        <span><i className="dot" style={{ background: '#f59e0b' }} />Standort</span>
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
  const eta = trip ? tripEta(s, world, trip) : 0;
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
            {order && <><dt>Ladung</dt><dd>{CARGO_BY_ID[order.cargoId].name}, {tons(order.weightT)}</dd></>}
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
            <dt>Lenkzeit Woche</dt><dd>{formatDuration(driver.hos.drivenWeek)} / 56 h</dd>
          </>
        )}
      </dl>
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
