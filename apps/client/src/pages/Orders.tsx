// Auftragsbörse: dynamische Transportangebote mit Wirtschaftlichkeitsabschätzung.

import { useMemo, useState } from 'react';
import { MapPin, Check, Send, X } from 'lucide-react';
import { CARGOS, CITY_BY_ID, TRAILERS, estimateTrip, formatDateTime, haversineKm, type Order, type TrailerType } from '@spedsim/core';
import { sendCommand, setUi, useGame, useUi, world } from '../game/store.ts';
import { Badge, Card, Empty, Money, PageHeader, useSort } from '../ui/components.tsx';
import { MapView } from '../ui/MapView.tsx';
import { cargoName, cityName, km, tons, ORDER_STATUS_LABEL, QUAL_LABEL, trailerName } from '../ui/format.ts';

type SortKey = 'payment' | 'perKm' | 'distance' | 'pickup' | 'origin' | 'profit';

export function OrdersPage() {
  const s = useGame();
  const focus = useUi((u) => u.focusOrderId);
  const [originRadius, setOriginRadius] = useState(300);
  const [anchor, setAnchor] = useState<string>(''); // Fahrzeug-ID oder '' = alle Standorte
  const [trailer, setTrailer] = useState<'' | 'fleet' | TrailerType>('fleet');
  const [cargo, setCargo] = useState('');
  const [intl, setIntl] = useState<'' | 'yes' | 'no'>('');
  const { key, dir, th } = useSort<SortKey>('profit');

  const fleetTrailers = new Set(Object.values(s.trailers).map((t) => t.type));
  const anchors = anchor
    ? [s.vehicles[anchor]?.cityId].filter(Boolean)
    : [...new Set([...s.company.locations.map((l) => l.cityId), ...Object.values(s.vehicles).filter((v) => v.status === 'idle').map((v) => v.cityId)])];

  // Für die Gewinnschätzung: freies Fahrzeug, Fahrer und Auflieger nahe der Ladestelle
  const idleVehicle = Object.values(s.vehicles).find((v) => (anchor ? v.id === anchor : v.status === 'idle'));
  const idleDriver = Object.values(s.drivers).find((d) => d.status === 'idle' && d.cityId === idleVehicle?.cityId) ?? Object.values(s.drivers)[0];

  const rows = useMemo(() => {
    const list = Object.values(s.orders).filter((o) => {
      if (o.status !== 'offered') return false;
      if (trailer === 'fleet' && !fleetTrailers.has(o.trailerType)) return false;
      if (trailer && trailer !== 'fleet' && o.trailerType !== trailer) return false;
      if (cargo && o.cargoId !== cargo) return false;
      if (intl === 'yes' && !o.international) return false;
      if (intl === 'no' && o.international) return false;
      const oc = CITY_BY_ID[o.fromCityId];
      return anchors.some((a) => haversineKm([CITY_BY_ID[a!].lon, CITY_BY_ID[a!].lat], [oc.lon, oc.lat]) <= originRadius);
    });
    return list
      .map((o) => {
        const est = idleVehicle && idleDriver ? estimateTrip(s, world, { orderId: o.id, driverId: idleDriver.id, vehicleId: idleVehicle.id, trailerId: '' }) : null;
        return { o, est, perKm: o.payment / o.distanceKm };
      })
      .sort((a, b) => {
        const v = (r: typeof a) =>
          key === 'payment' ? r.o.payment : key === 'perKm' ? r.perKm : key === 'distance' ? r.o.distanceKm : key === 'pickup' ? -r.o.pickupStart : key === 'origin' ? -(r.est?.emptyKm ?? 0) : (r.est?.profit ?? -Infinity);
        return (v(a) - v(b)) * dir;
      })
      .slice(0, 150);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, originRadius, anchor, trailer, cargo, intl, key, dir]);

  const mine = Object.values(s.orders).filter((o) => o.status === 'accepted' || o.status === 'planned' || o.status === 'in_transit');
  const focused = focus ? s.orders[focus] : undefined;

  return (
    <div className="page">
      <PageHeader title="Auftragsbörse" subtitle={`${Object.values(s.orders).filter((o) => o.status === 'offered').length} offene Transportangebote in Europa`} />
      <Card className="mb">
        <div className="row wrap" style={{ gap: 12 }}>
          <div className="field" style={{ margin: 0 }}>
            <label>Ladestelle im Umkreis von</label>
            <select className="input" value={anchor} onChange={(e) => setAnchor(e.target.value)}>
              <option value="">Standorte & freie Fahrzeuge</option>
              {Object.values(s.vehicles).map((v) => <option key={v.id} value={v.id}>LKW {v.plate} ({cityName(v.cityId)})</option>)}
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Radius: {originRadius} km</label>
            <input type="range" min={50} max={2500} step={50} value={originRadius} onChange={(e) => setOriginRadius(Number(e.target.value))} style={{ width: 180 }} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Auflieger</label>
            <select className="input" value={trailer} onChange={(e) => setTrailer(e.target.value as typeof trailer)}>
              <option value="fleet">Nur passende (eigene Flotte)</option>
              <option value="">Alle</option>
              {TRAILERS.map((t) => <option key={t.type} value={t.type}>{t.name}</option>)}
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Ladungsart</label>
            <select className="input" value={cargo} onChange={(e) => setCargo(e.target.value)}>
              <option value="">Alle</option>
              {CARGOS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Verkehr</label>
            <select className="input" value={intl} onChange={(e) => setIntl(e.target.value as typeof intl)}>
              <option value="">National & international</option>
              <option value="no">Nur national</option>
              <option value="yes">Nur international</option>
            </select>
          </div>
        </div>
      </Card>

      {mine.length > 0 && (
        <Card title="Eigene Aufträge" className="mb">
          <div className="table-wrap" style={{ border: 'none' }}>
            <table className="table">
              <tbody>
                {mine.map((o) => (
                  <tr key={o.id}>
                    <td><b>{cityName(o.fromCityId)} → {cityName(o.toCityId)}</b><div className="dim">{cargoName(o.cargoId)}</div></td>
                    <td><Badge kind={o.status === 'accepted' ? 'warning' : 'info'}>{ORDER_STATUS_LABEL[o.status]}</Badge></td>
                    <td className="nowrap">Abholung bis {formatDateTime(o.pickupEnd)}</td>
                    <td className="nowrap">Lieferung bis {formatDateTime(o.deliveryEnd)}</td>
                    <td className="num"><Money value={o.payment} /></td>
                    <td className="num">
                      {o.status === 'accepted' && (
                        <div className="row" style={{ justifyContent: 'flex-end' }}>
                          <button className="btn small primary" onClick={() => setUi({ dispatchDraft: { orderId: o.id } })}><Send size={13} />Disponieren</button>
                          <button className="btn small danger" title="Stornieren (Gebühr 15 %)" onClick={() => confirm('Auftrag stornieren? Es fällt eine Stornogebühr von 15 % an.') && sendCommand({ type: 'cancelOrder', orderId: o.id })}><X size={13} /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="grid" style={{ gridTemplateColumns: focused ? '1fr 420px' : '1fr' }}>
        <div className="table-wrap" style={{ maxHeight: 'calc(100vh - 330px)' }}>
          <table className="table">
            <thead>
              <tr>
                {th('origin', 'Route')}
                <th>Ladung</th>
                {th('distance', 'Strecke', 'num')}
                {th('pickup', 'Abholung')}
                <th>Lieferung bis</th>
                {th('payment', 'Vergütung', 'num')}
                {th('perKm', '€/km', 'num')}
                {th('profit', 'Gewinn (Schätzung)', 'num')}
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ o, est, perKm }) => (
                <tr key={o.id} className={`clickable ${focus === o.id ? 'selected' : ''}`} onClick={() => setUi({ focusOrderId: focus === o.id ? null : o.id })}>
                  <td>
                    <b>{cityName(o.fromCityId)} → {cityName(o.toCityId)}</b>
                    <div className="dim" style={{ fontSize: 12 }}>
                      {state(o)}
                      {est ? ` · Anfahrt ${km(est.emptyKm)}` : ''}
                    </div>
                  </td>
                  <td>
                    {cargoName(o.cargoId)} <span className="dim">{tons(o.weightT)}</span>
                    <div className="row wrap" style={{ gap: 4, marginTop: 3 }}>
                      <Badge>{trailerName(o.trailerType)}</Badge>
                      {o.express && <Badge kind="warning">Express</Badge>}
                      {o.qualifications.map((q) => <Badge key={q} kind="danger">{QUAL_LABEL[q]}</Badge>)}
                    </div>
                  </td>
                  <td className="num">{km(o.distanceKm)}</td>
                  <td className="nowrap">{formatDateTime(o.pickupStart)}</td>
                  <td className="nowrap">{formatDateTime(o.deliveryEnd)}</td>
                  <td className="num"><Money value={o.payment} /></td>
                  <td className="num">{(perKm / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="num">{est ? <Money value={est.profit} colored /> : '–'}{est && est.lateMin > 0 && <div><Badge kind="danger">zu spät</Badge></div>}</td>
                  <td className="num" onClick={(e) => e.stopPropagation()}>
                    <div className="row" style={{ justifyContent: 'flex-end' }}>
                      <button className="btn small" title="Annehmen (später disponieren)" onClick={() => sendCommand({ type: 'acceptOrder', orderId: o.id })}><Check size={13} /></button>
                      <button className="btn small primary" onClick={() => setUi({ dispatchDraft: { orderId: o.id } })}><Send size={13} />Disponieren</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <Empty>Keine passenden Angebote. Vergrößere den Radius oder ändere die Filter.</Empty>}
        </div>
        {focused && (
          <Card title={<><MapPin size={15} />{cityName(focused.fromCityId)} → {cityName(focused.toCityId)}</>} actions={<button className="icon-btn" onClick={() => setUi({ focusOrderId: null })}><X size={15} /></button>}>
            <div style={{ position: 'relative', height: 300, borderRadius: 8, overflow: 'hidden' }}>
              <MapView />
            </div>
            <dl className="kv mt">
              <dt>Auftraggeber</dt><dd>{s.customers[focused.customerId]?.name}</dd>
              <dt>Zahlungsziel</dt><dd>{s.customers[focused.customerId]?.paymentTermDays} Tage</dd>
              <dt>Kundenzufriedenheit</dt><dd>{Math.round(s.customers[focused.customerId]?.satisfaction ?? 0)} %</dd>
              <dt>Abholfenster</dt><dd>{formatDateTime(focused.pickupStart)} – {formatDateTime(focused.pickupEnd)}</dd>
              <dt>Vertragsstrafe</dt><dd><Money value={focused.penaltyPerHour} /> je angefangene Std. Verspätung</dd>
              <dt>Angebot gültig bis</dt><dd>{formatDateTime(focused.offerExpires)}</dd>
            </dl>
          </Card>
        )}
      </div>
    </div>
  );
}

function state(o: Order) {
  return `${CITY_BY_ID[o.fromCityId].country} → ${CITY_BY_ID[o.toCityId].country}`;
}
