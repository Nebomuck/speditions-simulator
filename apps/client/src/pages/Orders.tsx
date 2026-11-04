// Auftragsbörse: dynamische Transportangebote mit Wirtschaftlichkeitsabschätzung.

import { useMemo, useState } from 'react';
import { ArrowRight, MapPin, Check, FileCheck, Send, Share2, Star, X } from 'lucide-react';
import {
  CARGOS, CITY_BY_ID, TRAILERS, TRUCK_BY_ID, estimateTrip, loadSpace, formatDateTime, formatMoney, haversineKm, nearestCity, planCoLoad, planEnd, vehicleMarker,
  type Customer, type GameState, type LonLat, type Order, type PlanStart, type TrailerType, type Vehicle,
} from '@spedsim/core';
import { sendCommand, setUi, toast, useGame, useUi, world } from '../game/store.ts';
import { Badge, Card, Empty, Money, PageHeader, useSort } from '../ui/components.tsx';
import { MapView } from '../ui/MapView.tsx';
import { cargoName, cityName, km, tons, ORDER_STATUS_LABEL, QUAL_LABEL, trailerName } from '../ui/format.ts';
import { askConfirm } from '../ui/confirm.tsx';
import { openMenu, type MenuItem } from '../ui/ContextMenu.tsx';

const cancelOrder = async (o: Order) =>
  (await askConfirm('Auftrag stornieren? Es fällt eine Stornogebühr von 15 % an.', { title: 'Auftrag stornieren?', confirmLabel: 'Stornieren', danger: true })) && sendCommand({ type: 'cancelOrder', orderId: o.id });

/** Rechtsklick auf einen Auftrag */
function orderMenu(o: Order): MenuItem[] {
  const items: MenuItem[] = [{ label: 'Disponieren …', icon: <Send size={14} />, disabled: o.status !== 'offered' && o.status !== 'accepted', onClick: () => setUi({ dispatchDraft: { orderId: o.id } }) }];
  if (o.premium?.kind === 'heavy' && o.premium.permit === 'none')
    items.push({ label: 'Genehmigung beantragen', icon: <FileCheck size={14} />, onClick: () => sendCommand({ type: 'applyPermit', orderId: o.id }) });
  if (o.status === 'offered') items.push({ label: 'Annehmen (später disponieren)', icon: <Check size={14} />, onClick: () => sendCommand({ type: 'acceptOrder', orderId: o.id }) });
  items.push({ label: 'Route auf der Karte', icon: <MapPin size={14} />, onClick: () => setUi({ focusOrderId: o.id }) });
  if (o.status === 'accepted') items.push({ label: 'Stornieren …', icon: <X size={14} />, danger: true, sep: true, onClick: () => cancelOrder(o) });
  return items;
}

/** Premium-Aufträge: eigene Karte mit Bedingungen und Genehmigung (nicht in der normalen Liste) */
function PremiumCard({ orders }: { orders: Order[] }) {
  const s = useGame();
  if (!orders.length) return null;
  const hasLowbed = Object.values(s.trailers).some((t) => t.type === 'lowbed');
  const hasHeavyDriver = Object.values(s.drivers).some((d) => d.qualifications.includes('heavy'));
  return (
    <Card title={<><Star size={15} /> Premium-Aufträge</>} sub="nur von Hand disponierbar · die KI-Disposition fasst sie nicht an" className="mb premium-card">
      <div className="premium-list">
        {orders.map((o) => {
          const p = o.premium!;
          const heavy = p.kind === 'heavy';
          const open = o.status === 'offered';
          const ready = !heavy || p.permit === 'granted';
          return (
            <div key={o.id} className={`premium-item ${p.kind}`}>
              <div className="row wrap" style={{ gap: 6 }}>
                <Badge kind={heavy ? 'danger' : 'violet'}>{heavy ? 'Schwertransport' : 'Messe-Termin'}</Badge>
                <b>{p.title}</b>
                <span className="spacer" />
                <Money value={o.payment} />
              </div>
              <div className="route">{cityName(o.fromCityId)} <ArrowRight size={13} /> {cityName(o.toCityId)} <span className="dim">· {km(o.distanceKm)} · {cargoName(o.cargoId)} {tons(o.weightT)}</span></div>
              <div className="dim premium-meta">
                Abholung {formatDateTime(o.pickupStart)} – {formatDateTime(o.pickupEnd).slice(-5)} · Lieferung bis {formatDateTime(o.deliveryEnd)}
              </div>
              <ul className="premium-req">
                {heavy ? (
                  <>
                    <li className={hasLowbed ? 'ok' : 'missing'}>Tieflader {hasLowbed ? 'vorhanden' : 'fehlt (Fuhrpark → Auflieger)'}</li>
                    <li className={hasHeavyDriver ? 'ok' : 'missing'}>Fahrer mit Schwertransport-Schein {hasHeavyDriver ? 'vorhanden' : 'fehlt (Schulung unter Fahrer & Personal)'}</li>
                    <li className={p.permit === 'granted' ? 'ok' : ''}>
                      Genehmigung: {p.permit === 'granted' ? 'erteilt' : p.permit === 'pending' ? `beantragt, erteilt am ${formatDateTime(p.permitReady ?? 0)}` : `${formatMoney(p.permitCost ?? 0)}, Bearbeitung ca. ${p.permitHours} Std.`}
                    </li>
                  </>
                ) : (
                  <>
                    <li>Knappes Lieferfenster: Der Messeaufbau beginnt pünktlich.</li>
                    <li className="missing">Verspätung: {formatMoney(o.penaltyPerHour)} je Stunde, nach zwei Stunden die halbe Vergütung, Ansehen −4</li>
                  </>
                )}
                <li className="ok">Pünktlich: Ansehen +{p.reputation}</li>
              </ul>
              <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                <span className="dim" style={{ marginRight: 'auto', fontSize: 12 }}>
                  {open ? `Angebot gültig bis ${formatDateTime(o.offerExpires)}` : ORDER_STATUS_LABEL[o.status]}
                </span>
                <button className="btn small" onClick={() => setUi({ focusOrderId: o.id })}><MapPin size={13} />Karte</button>
                {heavy && p.permit === 'none' && (
                  <button className="btn small" onClick={() => sendCommand({ type: 'applyPermit', orderId: o.id })}>
                    <FileCheck size={13} />Genehmigung beantragen{open ? ' & annehmen' : ''}
                  </button>
                )}
                {open && !heavy && <button className="btn small" onClick={() => sendCommand({ type: 'acceptOrder', orderId: o.id })}><Check size={13} />Annehmen</button>}
                {(o.status === 'accepted' || (open && !heavy)) && (
                  <button className="btn small primary" disabled={!ready} title={ready ? undefined : 'Erst nach erteilter Genehmigung'} onClick={() => setUi({ dispatchDraft: { orderId: o.id } })}>
                    <Send size={13} />Disponieren
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/** so viele Aufträge in der Nähe werden je Aktualisierung auf Beiladung geprüft (Rechenaufwand) */
const CO_LOAD_CHECKS = 20;

const cityPos = (id: string): LonLat => [CITY_BY_ID[id].lon, CITY_BY_ID[id].lat];

interface VehicleStart {
  v: Vehicle;
  /** unterwegs mit laufender Fahrt */
  moving: boolean;
  /** aktuelle Position */
  pos: LonLat;
  /** frei ab (nur unterwegs) */
  end: PlanStart | null;
  driverId?: string;
}

function vehicleStarts(s: GameState): VehicleStart[] {
  return Object.values(s.vehicles).map((v) => {
    const trip = v.tripId ? s.trips[v.tripId] : undefined;
    if (trip && trip.phase !== 'done' && v.status === 'on_trip')
      return { v, moving: true, pos: vehicleMarker(s, world, v.id).pos, end: planEnd(s, world, v.id), driverId: trip.driverId };
    return { v, moving: false, pos: cityPos(v.cityId), end: null };
  });
}

function startLabel(x: VehicleStart): string {
  if (!x.moving) return x.v.status === 'idle' ? `frei in ${cityName(x.v.cityId)}` : `${cityName(x.v.cityId)}, nicht verfügbar`;
  const near = nearestCityName(x.pos);
  return x.end ? `unterwegs bei ${near}, frei ab ${formatDateTime(x.end.time)} in ${cityName(x.end.cityId)}` : `unterwegs bei ${near}`;
}

function nearestCityName(pos: LonLat): string {
  return cityName(nearestCity(pos).id);
}

type SortKey = 'payment' | 'perKm' | 'distance' | 'pickup' | 'origin' | 'profit';

export function OrdersPage() {
  const s = useGame();
  const focus = useUi((u) => u.focusOrderId);
  const remote = useUi((u) => u.host?.mode === 'remote');
  const [originRadius, setOriginRadius] = useState(300);
  const [anchor, setAnchor] = useState<string>(''); // Fahrzeug-ID oder '' = alle Standorte
  const [trailer, setTrailer] = useState<'' | 'fleet' | TrailerType>('fleet');
  const [cargo, setCargo] = useState('');
  const [intl, setIntl] = useState<'' | 'yes' | 'no'>('');
  const [size, setSize] = useState<'' | 'partial' | 'full'>('');
  const { key, dir, th } = useSort<SortKey>('profit');

  const fleetTrailers = new Set(Object.values(s.trailers).map((t) => t.type));
  // Solo-LKW/Transporter: fester Aufbau mit eigener Nutzlast
  const soloSpaces = Object.values(s.vehicles).flatMap((v) => (TRUCK_BY_ID[v.modelId]?.body ? [loadSpace(v.modelId)!] : []));
  const fitsFleet = (o: Order) => fleetTrailers.has(o.trailerType) || soloSpaces.some((sp) => sp.type === o.trailerType && sp.payloadT >= o.weightT);
  // Startpunkte je Fahrzeug: frei → Standort; unterwegs → aktuelle Position und der Ort, an dem es wieder frei ist
  const starts = useMemo(
    () => vehicleStarts(s),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [s],
  );
  const pool = starts.filter((x) => (anchor ? x.v.id === anchor : x.v.status === 'idle' || x.moving));
  const anchors: LonLat[] = [
    ...(anchor ? [] : s.company.locations.map((l) => cityPos(l.cityId))),
    ...pool.flatMap((x) => (x.moving ? [x.pos, ...(x.end ? [cityPos(x.end.cityId)] : [])] : [x.pos])),
  ];

  // je Auftrag das passendste Fahrzeug: passender Laderaum, kürzeste Anfahrt ab dem Ort, an dem es frei ist
  const fits = (v: Vehicle, o: Order) => {
    const body = TRUCK_BY_ID[v.modelId]?.body;
    if (!body) return true;
    const sp = loadSpace(v.modelId);
    return !!sp && sp.type === o.trailerType && sp.payloadT >= o.weightT;
  };
  const startFor = (o: Order) => {
    const from = cityPos(o.fromCityId);
    let best: VehicleStart | undefined;
    let bestKm = Infinity;
    for (const x of pool) {
      if (!fits(x.v, o)) continue;
      const at = x.moving ? (x.end ? cityPos(x.end.cityId) : x.pos) : x.pos;
      // freie Fahrzeuge leicht bevorzugen: sie können sofort los
      const d = haversineKm(at, from) + (x.moving ? 50 : 0);
      if (d < bestKm) {
        bestKm = d;
        best = x;
      }
    }
    return best ?? pool[0];
  };
  const driverAt = (cityId?: string) => Object.values(s.drivers).find((d) => d.status === 'idle' && d.cityId === cityId) ?? Object.values(s.drivers)[0];

  const rows = useMemo(() => {
    const list = Object.values(s.orders).filter((o) => {
      if (o.status !== 'offered' || o.premium) return false;
      if (trailer === 'fleet' && !fitsFleet(o)) return false;
      if (size === 'partial' && !o.partial) return false;
      if (size === 'full' && o.partial) return false;
      if (trailer && trailer !== 'fleet' && o.trailerType !== trailer) return false;
      if (cargo && o.cargoId !== cargo) return false;
      if (intl === 'yes' && !o.international) return false;
      if (intl === 'no' && o.international) return false;
      const oc = cityPos(o.fromCityId);
      return anchors.some((a) => haversineKm(a, oc) <= originRadius);
    });
    return list
      .map((o) => {
        const st = startFor(o);
        const veh = st?.v;
        const drvId = st?.moving ? st.driverId : veh ? driverAt(veh.cityId)?.id : undefined;
        // fahrender LKW: Schätzung als Folgeauftrag ab dem Ende der laufenden Fahrt
        const est = veh && drvId ? estimateTrip(s, world, { orderId: o.id, driverId: drvId, vehicleId: veh.id, trailerId: '' }, st.moving ? (st.end ?? undefined) : undefined) : null;
        return { o, est, perKm: o.payment / o.distanceKm, via: st?.moving ? veh : undefined };
      })
      .sort((a, b) => {
        const v = (r: typeof a) =>
          key === 'payment' ? r.o.payment : key === 'perKm' ? r.perKm : key === 'distance' ? r.o.distanceKm : key === 'pickup' ? -r.o.pickupStart : key === 'origin' ? -(r.est?.emptyKm ?? 0) : (r.est?.profit ?? -Infinity);
        return (v(a) - v(b)) * dir;
      })
      .slice(0, 150);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, originRadius, anchor, trailer, cargo, intl, size, key, dir]);

  // ausgewählter LKW unterwegs: passen Aufträge in der Nähe der Route als Beiladung?
  const selected = anchor ? starts.find((x) => x.v.id === anchor) : undefined;
  const coLoads = useMemo(() => {
    const out = new Map<string, number>();
    if (!selected?.moving) return out;
    const near = rows
      .map((r) => ({ r, d: haversineKm(selected.pos, cityPos(r.o.fromCityId)) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, CO_LOAD_CHECKS);
    for (const { r } of near) {
      const { plan, issues } = planCoLoad(s, world, selected.v.id, r.o.id);
      // nur lohnende Beiladungen anzeigen
      if (plan && plan.profit > 0 && !issues.some((i) => i.level === 'error')) out.set(r.o.id, plan.profit);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // nur alle 30 Spielminuten oder bei neuer Liste neu prüfen (Rechenaufwand)
  }, [rows.map((r) => r.o.id).join(), selected?.v.id, selected?.moving, Math.floor(s.time / 30)]);

  const mine = Object.values(s.orders).filter((o) => !o.premium && (o.status === 'accepted' || o.status === 'planned' || o.status === 'in_transit'));
  const premiums = Object.values(s.orders)
    .filter((o) => o.premium && ((o.status === 'offered' && s.time < o.offerExpires) || o.status === 'accepted' || o.status === 'planned' || o.status === 'in_transit'))
    .sort((a, b) => a.pickupStart - b.pickupStart);
  const focused = focus ? s.orders[focus] : undefined;

  return (
    <div className="page">
      <PageHeader title="Auftragsbörse" subtitle={`${Object.values(s.orders).filter((o) => o.status === 'offered').length} offene Transportangebote in Europa`} />
      <Card className="mb">
        <div className="row wrap" style={{ gap: 12 }}>
          <div className="field" style={{ margin: 0 }}>
            <label>Ladestelle im Umkreis von</label>
            <select className="input" value={anchor} onChange={(e) => setAnchor(e.target.value)}>
              <option value="">Standorte & alle Fahrzeuge</option>
              {starts.map((x) => <option key={x.v.id} value={x.v.id}>LKW {x.v.plate} ({startLabel(x)})</option>)}
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
          <div className="field" style={{ margin: 0 }}>
            <label>Ladungsgröße</label>
            <select className="input" value={size} onChange={(e) => setSize(e.target.value as typeof size)}>
              <option value="">Komplett- & Teilladungen</option>
              <option value="full">Nur Komplettladungen</option>
              <option value="partial">Nur Teilladungen</option>
            </select>
          </div>
        </div>
      </Card>

      <PremiumCard orders={premiums} />

      {mine.length > 0 && (
        <Card title="Eigene Aufträge" className="mb">
          <div className="table-wrap" style={{ border: 'none' }}>
            <table className="table">
              <tbody>
                {mine.map((o) => (
                  <tr key={o.id} onContextMenu={(e) => openMenu(e, orderMenu(o), `${cityName(o.fromCityId)} → ${cityName(o.toCityId)}`)}>
                    <td><b>{cityName(o.fromCityId)} → {cityName(o.toCityId)}</b><div className="dim">{cargoName(o.cargoId)}</div></td>
                    <td><Badge kind={o.status === 'accepted' ? 'warning' : 'info'}>{ORDER_STATUS_LABEL[o.status]}</Badge></td>
                    <td className="nowrap">Abholung bis {formatDateTime(o.pickupEnd)}</td>
                    <td className="nowrap">Lieferung bis {formatDateTime(o.deliveryEnd)}</td>
                    <td className="num"><Money value={o.payment} /></td>
                    <td className="num">
                      {o.status === 'accepted' && (
                        <div className="row" style={{ justifyContent: 'flex-end' }}>
                          <button className="btn small primary" data-tour="order-dispatch" onClick={() => setUi({ dispatchDraft: { orderId: o.id } })}><Send size={13} />Disponieren</button>
                          <button className="btn small danger" title="Stornieren (Gebühr 15 %)" onClick={() => cancelOrder(o)}><X size={13} /></button>
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
              {rows.map(({ o, est, perKm, via }) => (
                <tr
                  key={o.id}
                  className={`clickable ${focus === o.id ? 'selected' : ''}`}
                  onClick={() => setUi({ focusOrderId: focus === o.id ? null : o.id })}
                  onContextMenu={(e) => openMenu(e, orderMenu(o), `${cityName(o.fromCityId)} → ${cityName(o.toCityId)}`)}
                >
                  <td>
                    <b>{cityName(o.fromCityId)} → {cityName(o.toCityId)}</b>
                    <div className="dim" style={{ fontSize: 12 }}>
                      {orderNo(o.id)} · {state(o)}
                      {est ? ` · Anfahrt ${km(est.emptyKm)}` : ''}
                      {via ? ` · nach laufender Fahrt von ${via.plate}` : ''}
                    </div>
                    {coLoads.has(o.id) && <Badge kind="success" title="Passt in die laufende Fahrt – im Dispositionsfenster „Zuladen“ wählen">Beiladung möglich: {formatMoney(coLoads.get(o.id)!)}</Badge>}
                  </td>
                  <td>
                    {cargoName(o.cargoId)} <span className="dim">{tons(o.weightT)}</span>
                    <div className="row wrap" style={{ gap: 4, marginTop: 3 }}>
                      <Badge>{trailerName(o.trailerType)}</Badge>
                      {o.partial && <Badge kind="violet">Teilladung</Badge>}
                      {o.express && <Badge kind="warning">Express</Badge>}
                      {o.tender && <Badge kind="success" title="Ausschreibung: besser bezahlt, nur kurz verfügbar">Ausschreibung</Badge>}
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
                      <button className="btn small primary" data-tour="order-dispatch" onClick={() => setUi({ dispatchDraft: { orderId: o.id, vehicleId: coLoads.has(o.id) ? anchor : via?.id } })}><Send size={13} />Disponieren</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <Empty>Keine passenden Angebote. Vergrößere den Radius oder ändere die Filter.</Empty>}
        </div>
        {focused && (
          <Card
            title={<><MapPin size={15} />{cityName(focused.fromCityId)} → {cityName(focused.toCityId)} <span className="dim">{orderNo(focused.id)}</span></>}
            actions={
              <>
                {remote && (
                  <button className="btn small" title="Auftrag im Firmenchat teilen" onClick={() => shareOrder(focused)}><Share2 size={13} />Im Team teilen</button>
                )}
                <button className="icon-btn" onClick={() => setUi({ focusOrderId: null })}><X size={15} /></button>
              </>
            }
          >
            <div style={{ position: 'relative', height: 300, borderRadius: 8, overflow: 'hidden' }}>
              <MapView />
            </div>
            <dl className="kv mt">
              <dt>Status</dt><dd><Badge kind={focused.status === 'offered' ? 'info' : 'warning'}>{focused.status === 'offered' ? 'Angebot offen' : ORDER_STATUS_LABEL[focused.status]}</Badge></dd>
              <dt>Auftraggeber</dt><dd>{s.customers[focused.customerId]?.name}</dd>
              <dt>Zahlungsziel</dt><dd>{s.customers[focused.customerId]?.paymentTermDays} Tage</dd>
              <dt>Zahlungsmoral</dt><dd><PaymentMorale c={s.customers[focused.customerId]} /></dd>
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

/** Kurze, für alle Spieler gleiche Auftragsnummer (aus der Server-ID). */
export function orderNo(id: string) {
  return `Nr. ${id.replace(/^ord/, '').toUpperCase()}`;
}

function shareOrder(o: Order) {
  const text = `Auftrag ${orderNo(o.id)}: ${cityName(o.fromCityId)} → ${cityName(o.toCityId)}, ${cargoName(o.cargoId)}, ${formatMoney(o.payment)}, Abholung ab ${formatDateTime(o.pickupStart)} [[ord:${o.id}]]`;
  sendCommand({ type: 'chat', text }).then((r) => r.ok && toast('success', 'Auftrag im Firmenchat geteilt.'));
}

function PaymentMorale({ c }: { c?: Customer }) {
  if (!c) return <>–</>;
  if (c.deliveries === 0 && c.paymentReliability >= 0.7) return <span className="dim">unbekannt (noch keine Lieferung)</span>;
  return <Badge kind={c.paymentReliability > 0.85 ? 'success' : c.paymentReliability > 0.7 ? 'warning' : 'danger'}>{c.paymentReliability > 0.85 ? 'gut' : c.paymentReliability > 0.7 ? 'mittel' : 'schlecht'}</Badge>;
}

function state(o: Order) {
  return `${CITY_BY_ID[o.fromCityId].country} → ${CITY_BY_ID[o.toCityId].country}`;
}
