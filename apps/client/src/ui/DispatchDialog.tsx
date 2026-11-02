// Dispositionsdialog: Fahrer, LKW und Auflieger wählen, Route & Kosten prüfen, Konflikte sehen, Fahrt starten.
// Ist der LKW noch unterwegs, wird der Auftrag als Folgeauftrag vorausgeplant (Start nach der laufenden Fahrt).

import { useMemo, useState } from 'react';
import { ArrowRight, Truck, User, Container, ListPlus } from 'lucide-react';
import { CARGO_BY_ID, TRAILER_BY_TYPE, TRUCK_BY_ID, formatDateTime, formatDuration, loadSpace, validateDispatch, REST_KIND_LABEL, type DispatchInput } from '@spedsim/core';
import { sendCommand, setUi, useGame, useUi, world } from '../game/store.ts';
import { Badge, IssueList, Modal, Money } from './components.tsx';
import { bodyName, cargoName, cityName, km, tons, modelName, trailerName, QUAL_LABEL } from './format.ts';

export function DispatchDialog() {
  const draft = useUi((u) => u.dispatchDraft);
  if (!draft) return null;
  return <DispatchDialogInner key={`${draft.orderId}-${draft.vehicleId}`} initialOrderId={draft.orderId} initialVehicleId={draft.vehicleId} />;
}

function DispatchDialogInner({ initialOrderId, initialVehicleId }: { initialOrderId?: string; initialVehicleId?: string }) {
  const state = useGame();
  const close = () => setUi({ dispatchDraft: null });
  const orders = Object.values(state.orders).filter((o) => o.status === 'accepted' || o.status === 'offered');
  const [orderId, setOrderId] = useState(initialOrderId ?? orders.find((o) => o.status === 'accepted')?.id ?? '');
  const order = state.orders[orderId];

  const vehicles = Object.values(state.vehicles);
  const [vehicleId, setVehicleId] = useState(initialVehicleId ?? vehicles.find((v) => v.status === 'idle')?.id ?? '');
  const vehicle = state.vehicles[vehicleId];
  const drivers = Object.values(state.drivers);
  const trailers = Object.values(state.trailers);

  const [pickedDriverId, setDriverId] = useState(() => drivers.find((d) => d.status === 'idle' && d.cityId === vehicle?.cityId)?.id ?? '');
  const [pickedTrailerId, setTrailerId] = useState(() => trailers.find((t) => t.status === 'idle' && t.cityId === vehicle?.cityId && t.type === order?.trailerType)?.id ?? '');
  const [busy, setBusy] = useState(false);

  // LKW unterwegs → Vorausplanung mit der laufenden Besatzung
  const currentTrip = vehicle?.tripId ? state.trips[vehicle.tripId] : undefined;
  const queued = !!currentTrip && vehicle?.status === 'on_trip';
  const solo = !!(vehicle && TRUCK_BY_ID[vehicle.modelId]?.body);
  const driverId = queued ? currentTrip!.driverId : pickedDriverId;
  const trailerId = queued ? (currentTrip!.trailerId ?? '') : solo ? '' : pickedTrailerId;
  const needsTrailer = !solo && !queued;

  const input: DispatchInput = { orderId, driverId, vehicleId, trailerId };
  const { issues, estimate } = useMemo(
    () => (orderId && driverId && vehicleId && (trailerId || !needsTrailer) ? validateDispatch(state, world, input, { queued }) : { issues: [], estimate: null }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, orderId, driverId, vehicleId, trailerId, queued],
  );
  const hasErrors = issues.some((i) => i.level === 'error');
  const ready = orderId && driverId && vehicleId && (trailerId || !needsTrailer) && !hasErrors && estimate;

  async function submit() {
    setBusy(true);
    const r = queued ? await sendCommand({ type: 'queueDispatch', orderId, vehicleId }) : await sendCommand({ type: 'dispatch', ...input });
    setBusy(false);
    if (r.ok) close();
  }

  return (
    <Modal
      title={queued ? 'Folgeauftrag vorausplanen' : 'Fahrt disponieren'}
      onClose={close}
      width={1060}
      footer={
        <>
          {estimate && (
            <span className="muted" style={{ marginRight: 'auto' }}>
              Voraussichtlicher Gewinn: <b><Money value={estimate.profit} colored /></b>
            </span>
          )}
          <button className="btn" onClick={close}>Abbrechen</button>
          <button className="btn primary" disabled={!ready || busy} onClick={submit}>
            {queued ? <><ListPlus size={16} /> Nach laufender Fahrt einplanen</> : <><Truck size={16} /> Fahrt verbindlich starten</>}
          </button>
        </>
      }
    >
      <div className="grid grid-3">
        <div>
          <div className="field">
            <label>1. Auftrag</label>
            <select className="input" value={orderId} onChange={(e) => setOrderId(e.target.value)}>
              <option value="">– Auftrag wählen –</option>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.status === 'accepted' ? '✓ ' : ''}{cityName(o.fromCityId)} → {cityName(o.toCityId)} · {cargoName(o.cargoId)}
                </option>
              ))}
            </select>
          </div>
          {order && (
            <div className="card" style={{ background: 'var(--panel-2)' }}>
              <div className="row" style={{ fontWeight: 600 }}>
                {cityName(order.fromCityId)} <ArrowRight size={14} /> {cityName(order.toCityId)}
              </div>
              <dl className="kv mt" style={{ gridTemplateColumns: '110px 1fr' }}>
                <dt>Ladung</dt><dd>{CARGO_BY_ID[order.cargoId].name}, {tons(order.weightT)}{order.partial && ' (Teilladung)'}</dd>
                <dt>Laderaum</dt><dd>{trailerName(order.trailerType)}</dd>
                <dt>Abholung</dt><dd>{formatDateTime(order.pickupStart)} – {formatDateTime(order.pickupEnd).slice(-5)}</dd>
                <dt>Lieferung bis</dt><dd>{formatDateTime(order.deliveryEnd)}</dd>
                <dt>Strecke</dt><dd>{km(order.distanceKm)}</dd>
                <dt>Vergütung</dt><dd><Money value={order.payment} /></dd>
                <dt>Strafe/Std.</dt><dd><Money value={order.penaltyPerHour} /></dd>
              </dl>
              <div className="row wrap mt">
                {order.express && <Badge kind="warning">Express</Badge>}
                {order.international && <Badge kind="info">International</Badge>}
                {order.qualifications.map((q) => <Badge key={q} kind="danger">{QUAL_LABEL[q]}</Badge>)}
              </div>
            </div>
          )}
        </div>

        <div>
          <div className="field">
            <label>2. LKW</label>
            <div className="pick-list">
              {vehicles.map((v) => (
                <div
                  key={v.id}
                  className={`pick ${v.id === vehicleId ? 'active' : ''} ${v.status !== 'idle' && v.status !== 'on_trip' ? 'disabled' : ''}`}
                  onClick={() => {
                    setVehicleId(v.id);
                    if (!state.drivers[driverId] || state.drivers[driverId].cityId !== v.cityId) setDriverId(drivers.find((d) => d.status === 'idle' && d.cityId === v.cityId)?.id ?? '');
                    if (!state.trailers[trailerId] || state.trailers[trailerId].cityId !== v.cityId)
                      setTrailerId(trailers.find((t) => t.status === 'idle' && t.cityId === v.cityId && t.type === order?.trailerType)?.id ?? '');
                  }}
                >
                  <Truck size={16} />
                  <div style={{ flex: 1 }}>
                    <div>{v.plate} <small>{modelName(v.modelId)}</small></div>
                    <small>
                      {cityName(v.cityId)} · {spaceLabel(v.modelId)} · Zustand {Math.round(v.condition)} % ·{' '}
                      {v.status === 'idle' ? 'frei' : v.status === 'on_trip' ? `unterwegs – vorausplanen${v.queue?.length ? ` (${v.queue.length} geplant)` : ''}` : 'nicht verfügbar'}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {queued && (
            <div className="card mb" style={{ background: 'var(--accent-soft)' }}>
              <b>Vorausplanung</b>
              <div className="dim" style={{ fontSize: 12.5 }}>
                Der Auftrag startet automatisch, sobald {vehicle?.plate} die laufende Fahrt beendet hat – mit {state.drivers[driverId]?.name}
                {currentTrip?.trailerId ? ` und Auflieger ${state.trailers[currentTrip.trailerId]?.plate}` : ''}.
              </div>
            </div>
          )}
          {!queued && <div className="field">
            <label>3. Fahrer</label>
            <div className="pick-list">
              {drivers.map((d) => (
                <div key={d.id} className={`pick ${d.id === driverId ? 'active' : ''} ${d.status !== 'idle' ? 'disabled' : ''}`} onClick={() => setDriverId(d.id)}>
                  <User size={16} />
                  <div style={{ flex: 1 }}>
                    <div>{d.name} {d.qualifications.map((q) => <Badge key={q}>{QUAL_LABEL[q]}</Badge>)}</div>
                    <small>
                      {cityName(d.cityId)} · {d.status === 'idle' ? 'verfügbar' : 'unterwegs'}
                      {d.hos.requiredRest > 0 && ` · ${REST_KIND_LABEL[d.hos.requiredRestKind]} noch ${formatDuration(d.hos.requiredRest)}`}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          </div>}
          {needsTrailer && <div className="field">
            <label>4. Auflieger</label>
            <div className="pick-list">
              {trailers.map((t) => (
                <div key={t.id} className={`pick ${t.id === trailerId ? 'active' : ''} ${t.status !== 'idle' || (order && t.type !== order.trailerType) ? 'disabled' : ''}`} onClick={() => setTrailerId(t.id)}>
                  <Container size={16} />
                  <div style={{ flex: 1 }}>
                    <div>{TRAILER_BY_TYPE[t.type].name} <small>{t.plate}</small></div>
                    <small>{cityName(t.cityId)} · {TRAILER_BY_TYPE[t.type].payloadT} t · {t.status === 'idle' ? 'frei' : 'belegt'}</small>
                  </div>
                </div>
              ))}
            </div>
          </div>}
          {solo && !queued && <p className="dim" style={{ fontSize: 12.5 }}>4. Kein Auflieger nötig – {modelName(vehicle!.modelId)} hat einen festen Aufbau ({spaceLabel(vehicle!.modelId)}).</p>}
        </div>

        <div>
          <label className="muted" style={{ fontSize: 12.5, fontWeight: 550 }}>5. Route, Kosten & Prüfung</label>
          {estimate ? (
            <div className="card mt" style={{ background: 'var(--panel-2)' }}>
              <dl className="kv" style={{ gridTemplateColumns: '150px 1fr' }}>
                {queued && <><dt>Start (geschätzt)</dt><dd>nach laufender Fahrt</dd></>}
                <dt>Leerfahrt zur Ladestelle</dt><dd>{km(estimate.emptyKm)}</dd>
                <dt>Lastfahrt</dt><dd>{km(estimate.loadedKm)}</dd>
                <dt>Reine Fahrzeit</dt><dd>{formatDuration(estimate.driveMin)}</dd>
                <dt>Pausen & Ruhezeiten</dt><dd>{formatDuration(estimate.restMin)}</dd>
                <dt>Ankunft Ladestelle</dt><dd>{formatDateTime(estimate.pickupEta)}</dd>
                <dt>Ankunft Empfänger</dt><dd className={estimate.lateMin > 0 ? 'neg' : 'pos'}>{formatDateTime(estimate.deliveryEta)}</dd>
                <dt>Diesel ({Math.round(estimate.fuelL)} l)</dt><dd><Money value={-estimate.fuelCost} /></dd>
                <dt>Maut</dt><dd>{estimate.toll ? <Money value={-estimate.toll} /> : 'mautfrei'}</dd>
                <dt>Fahrerkosten</dt><dd><Money value={-estimate.driverCost} /></dd>
                <dt>Fahrzeugkosten</dt><dd><Money value={-estimate.vehicleCost} /></dd>
                <dt>Erlös</dt><dd><Money value={estimate.revenue} /></dd>
                <dt><b>Ergebnis</b></dt><dd><b><Money value={estimate.profit} colored /></b></dd>
              </dl>
            </div>
          ) : (
            <div className="card mt dim" style={{ background: 'var(--panel-2)' }}>Wähle Auftrag, LKW, Fahrer{needsTrailer ? ' und Auflieger' : ''}, um Route und Kosten zu berechnen.</div>
          )}
          <div className="mt">
            <IssueList issues={issues} okText={estimate ? (queued ? 'Keine Konflikte – Folgeauftrag kann eingeplant werden.' : 'Keine Konflikte – Fahrt kann gestartet werden.') : undefined} />
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** Laderaum-Beschreibung eines Fahrzeugs („Koffer 3,2 t“ bzw. „Sattelzug“). */
function spaceLabel(modelId: string) {
  const sp = loadSpace(modelId);
  return sp ? `Aufbau ${bodyName(sp.type)} ${tons(sp.payloadT)}` : 'Sattelzug';
}
