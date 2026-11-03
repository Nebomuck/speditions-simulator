import { useState } from 'react';
import { Wrench, ShoppingCart, Tag, Truck, Container } from 'lucide-react';
import {
  TRUCK_BY_ID, TRUCK_MODELS, TRAILERS, VEHICLE_KIND_LABEL, VEHICLE_DOWN_PAYMENT, VEHICLE_LOAN_TERMS, annuity, capacity, formatDateTime, openVehicleLoan, tradeInValue,
  vehicleLoanRate, vehicleMarketValue, vehicleRentPerDay, type TrailerType, type TruckModel, type Vehicle,
} from '@spedsim/core';
import { sendCommand, setUi, useGame } from '../game/store.ts';
import { Badge, Bar, Card, Empty, Modal, Money, PageHeader } from '../ui/components.tsx';
import { activityLabel, bodyName, cityName, dec, km, modelName, trailerName } from '../ui/format.ts';

export function FleetPage() {
  const s = useGame();
  const [shop, setShop] = useState<'none' | 'used' | 'new' | 'trailer'>('none');
  const cap = capacity(s);
  const vehicles = Object.values(s.vehicles);
  const trailers = Object.values(s.trailers);
  return (
    <div className="page">
      <PageHeader
        title="Fuhrpark"
        subtitle={`${cap.vehicles}/${cap.parking} Stellplätze Zugmaschinen · ${cap.trailers}/${cap.trailerParking} Auflieger`}
        actions={
          <>
            <button className="btn" onClick={() => setShop('used')}><Tag size={15} />Gebrauchtmarkt</button>
            <button className="btn" onClick={() => setShop('new')}><ShoppingCart size={15} />Neufahrzeuge</button>
            <button className="btn" onClick={() => setShop('trailer')}><Container size={15} />Auflieger</button>
          </>
        }
      />
      <Card title={<><Truck size={16} />Zugmaschinen</>}>
        <div className="table-wrap" style={{ border: 'none' }}>
          <table className="table">
            <thead>
              <tr><th>Kennzeichen</th><th>Modell</th><th>Status</th><th>Standort</th><th>Zustand</th><th className="num">km-Stand</th><th>Finanzierung</th><th className="num">Marktwert</th><th /></tr>
            </thead>
            <tbody>
              {vehicles.map((v) => {
                const trip = v.tripId ? s.trips[v.tripId] : undefined;
                const m = TRUCK_BY_ID[v.modelId];
                return (
                  <tr key={v.id}>
                    <td><b>{v.plate}</b></td>
                    <td>{m.maker} {m.name}<div className="dim">{kindText(v.modelId)} · {v.year} · {m.hp} PS · {m.emission} · Ø {dec(m.consumption)} l/100 km</div></td>
                    <td><Badge kind={trip ? 'info' : v.status === 'workshop' ? 'warning' : 'success'}>{activityLabel(trip, v.status)}</Badge>{v.busyUntil && <div className="dim" style={{ fontSize: 12 }}>bis {formatDateTime(v.busyUntil)}</div>}</td>
                    <td>{trip ? 'unterwegs' : cityName(v.cityId)}</td>
                    <td><div className="row"><Bar value={v.condition} />{Math.round(v.condition)} %</div></td>
                    <td className="num">{km(v.odometerKm)}</td>
                    <td>{ownershipText(s, v)}</td>
                    <td className="num">{v.ownership === 'owned' ? <Money value={vehicleMarketValue(s, v.id)} /> : '–'}</td>
                    <td className="num">
                      <div className="row" style={{ justifyContent: 'flex-end' }}>
                        <button className="btn small" disabled={v.status !== 'idle' || v.condition >= 98} onClick={() => sendCommand({ type: 'serviceVehicle', vehicleId: v.id })} title="Wartung & Reparatur">
                          <Wrench size={13} />Werkstatt
                        </button>
                        <button className="btn small" disabled={v.status !== 'idle'} onClick={() => setUi({ selectedVehicleId: v.id, page: 'map' })}>Karte</button>
                        <button
                          className="btn small danger"
                          disabled={v.status !== 'idle'}
                          onClick={() =>
                            confirm(
                              v.ownership === 'leased'
                                ? 'Leasingvertrag vorzeitig beenden? Ablöse: 3 Monatsraten.'
                                : v.ownership === 'rented'
                                  ? 'Mietfahrzeug zurückgeben? Die Miete endet sofort.'
                                  : `Fahrzeug für ca. 90 % des Marktwerts verkaufen?${v.loanId ? ' Die Restschuld der Finanzierung wird aus dem Erlös abgelöst.' : ''}`,
                            ) && sendCommand({ type: 'sellVehicle', vehicleId: v.id })
                          }
                        >
                          {v.ownership === 'owned' ? 'Verkaufen' : 'Rückgabe'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title={<><Container size={16} />Auflieger</>} className="mt">
        <div className="table-wrap" style={{ border: 'none' }}>
          <table className="table">
            <thead><tr><th>Kennzeichen</th><th>Typ</th><th>Status</th><th>Standort</th><th>Zustand</th><th>Finanzierung</th><th /></tr></thead>
            <tbody>
              {trailers.map((t) => (
                <tr key={t.id}>
                  <td><b>{t.plate}</b></td>
                  <td>{trailerName(t.type)}</td>
                  <td><Badge kind={t.status === 'idle' ? 'success' : 'info'}>{t.status === 'idle' ? 'frei' : 'im Einsatz'}</Badge></td>
                  <td>{t.status === 'idle' ? cityName(t.cityId) : 'unterwegs'}</td>
                  <td><div className="row"><Bar value={t.condition} />{Math.round(t.condition)} %</div></td>
                  <td>{t.ownership === 'leased' ? <>Leasing <Money value={t.leaseRate ?? 0} />/Monat</> : 'Eigentum'}</td>
                  <td className="num">
                    <button className="btn small danger" disabled={t.status !== 'idle'} onClick={() => confirm('Auflieger abgeben?') && sendCommand({ type: 'sellTrailer', trailerId: t.id })}>
                      {t.ownership === 'leased' ? 'Rückgabe' : 'Verkaufen'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {shop === 'used' && <UsedMarket onClose={() => setShop('none')} />}
      {shop === 'new' && <NewMarket onClose={() => setShop('none')} />}
      {shop === 'trailer' && <TrailerMarket onClose={() => setShop('none')} />}
    </div>
  );
}

function UsedMarket({ onClose }: { onClose: () => void }) {
  const s = useGame();
  const offers = Object.values(s.vehicleOffers).sort((a, b) => a.price - b.price);
  return (
    <Modal title="Gebrauchtfahrzeugmarkt" onClose={onClose}>
      {offers.length === 0 && <Empty>Keine Angebote.</Empty>}
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Modell</th><th>Baujahr</th><th className="num">km-Stand</th><th>Zustand</th><th>Angebot bis</th><th className="num">Preis</th><th /></tr></thead>
          <tbody>
            {offers.map((o) => (
              <tr key={o.id}>
                <td><b>{modelName(o.modelId)}</b><div className="dim">{TRUCK_BY_ID[o.modelId].hp} PS · {TRUCK_BY_ID[o.modelId].emission}</div></td>
                <td>{o.year}</td>
                <td className="num">{km(o.odometerKm)}</td>
                <td><div className="row"><Bar value={o.condition} />{o.condition} %</div></td>
                <td>{formatDateTime(o.expires)}</td>
                <td className="num"><b><Money value={o.price} /></b></td>
                <td><button className="btn small primary" onClick={() => sendCommand({ type: 'buyUsedVehicle', offerId: o.id })}>Kaufen</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="dim">Gebrauchte Fahrzeuge sind günstiger, verschleißen aber schneller und haben ein höheres Pannenrisiko. Kontokorrentrahmen: 10.000 €.</p>
    </Modal>
  );
}

function ownershipText(s: ReturnType<typeof useGame>, v: Vehicle) {
  if (v.ownership === 'leased') return <>Leasing <Money value={v.leaseRate ?? 0} />/Monat</>;
  if (v.ownership === 'rented') return <>Miete <Money value={v.rentPerDay ?? 0} />/Tag</>;
  const rest = openVehicleLoan(s, v);
  return rest > 0 ? <>Eigentum · finanziert<div className="dim" style={{ fontSize: 12 }}>Restschuld <Money value={rest} /></div></> : 'Eigentum';
}

type Financing = 'cash' | 'loan' | 'lease' | 'rent';
const FIN_LABEL: Record<Financing, string> = { cash: 'Kauf', loan: 'Finanzierung', lease: 'Leasing', rent: 'Miete' };

/** Anschaffung eines Neufahrzeugs: Kauf, Finanzierung, Leasing oder Kurzzeitmiete, optional mit Inzahlungnahme. */
function Purchase({ model: m, onBack, onDone }: { model: TruckModel; onBack: () => void; onDone: () => void }) {
  const s = useGame();
  const [fin, setFin] = useState<Financing>('cash');
  const [months, setMonths] = useState<number>(48);
  const [tradeId, setTradeId] = useState('');
  const [busy, setBusy] = useState(false);
  const tradeable = Object.values(s.vehicles).filter((v) => v.ownership === 'owned' && v.status === 'idle');
  const trade = tradeId ? s.vehicles[tradeId] : undefined;
  const credit = trade ? tradeInValue(s, trade.id) - openVehicleLoan(s, trade) : 0;
  const down = Math.round(m.price * VEHICLE_DOWN_PAYMENT);
  const rate = vehicleLoanRate(months);
  const perDay = vehicleRentPerDay(m.leaseRate);
  const upfront = fin === 'cash' ? m.price : fin === 'loan' ? down : fin === 'lease' ? m.leaseRate : perDay;
  async function buy() {
    setBusy(true);
    const r = await sendCommand({ type: 'buyNewVehicle', modelId: m.id, financing: fin, ...(fin === 'loan' ? { loanMonths: months } : {}), ...(tradeId ? { tradeInVehicleId: tradeId } : {}) });
    setBusy(false);
    if (r.ok) onDone();
  }
  return (
    <div>
      <div className="row mb">
        <button className="btn small" onClick={onBack}>← Zurück</button>
        <b style={{ fontSize: 16 }}>{m.maker} {m.name}</b>
        <span className="dim">{kindText(m.id)} · Listenpreis <Money value={m.price} /></span>
      </div>
      <div className="grid grid-2">
        <div>
          <div className="field">
            <label>Finanzierungsart</label>
            <div className="seg" style={{ display: 'inline-flex' }}>
              {(Object.keys(FIN_LABEL) as Financing[]).map((f) => (
                <button key={f} className={fin === f ? 'active' : ''} onClick={() => setFin(f)}>{FIN_LABEL[f]}</button>
              ))}
            </div>
          </div>
          <div className="card" style={{ background: 'var(--panel-2)', fontSize: 13 }}>
            {fin === 'cash' && <>Sofortzahlung des vollen Kaufpreises. Das Fahrzeug gehört der Firma und kann jederzeit verkauft werden.</>}
            {fin === 'loan' && (
              <>
                <div className="row wrap mb">
                  {VEHICLE_LOAN_TERMS.map((n) => <button key={n} className={`chip ${months === n ? 'active' : ''}`} onClick={() => setMonths(n)}>{n} Monate</button>)}
                </div>
                Anzahlung {Math.round(VEHICLE_DOWN_PAYMENT * 100)} % (<Money value={down} />), Rest über die Bank mit dem Fahrzeug als Sicherheit.
                <div className="mt">Zins {(rate * 100).toFixed(1).replace('.', ',')} % p. a. · Rate <b><Money value={annuity(m.price - down, rate, months)} /></b> pro Monat</div>
                <div className="dim mt">Beim Verkauf wird die Restschuld aus dem Erlös abgelöst.</div>
              </>
            )}
            {fin === 'lease' && <>Leasingrate <b><Money value={m.leaseRate} /></b> pro Monat, die erste Rate sofort. Vorzeitige Rückgabe kostet 3 Monatsraten.</>}
            {fin === 'rent' && <>Kurzzeitmiete <b><Money value={perDay} /></b> pro Tag (täglich abgebucht). Jederzeit ohne Gebühr rückgabefähig – teurer als Leasing, ideal für Auftragsspitzen.</>}
          </div>
        </div>
        <div>
          <div className="field">
            <label>Inzahlungnahme (optional)</label>
            <select className="input" value={tradeId} onChange={(e) => setTradeId(e.target.value)}>
              <option value="">– kein Fahrzeug in Zahlung geben –</option>
              {tradeable.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plate} · {TRUCK_BY_ID[v.modelId].name} · {Math.round((tradeInValue(s, v.id) - openVehicleLoan(s, v)) / 100).toLocaleString('de-DE')} €
                </option>
              ))}
            </select>
            <small className="dim">Der Händler zahlt 95 % des Marktwerts (Verkauf: 90 %); offene Finanzierungen werden verrechnet.</small>
          </div>
          <dl className="kv">
            <dt>Sofort fällig</dt><dd><Money value={upfront} /></dd>
            {trade && <><dt>Inzahlungnahme</dt><dd className="pos">+<Money value={credit} /></dd></>}
            <dt><b>Saldo heute</b></dt><dd><b><Money value={credit - upfront} colored /></b></dd>
            <dt>Laufend</dt>
            <dd>
              {fin === 'loan' ? <><Money value={annuity(m.price - down, rate, months)} />/Monat</> : fin === 'lease' ? <><Money value={m.leaseRate} />/Monat</> : fin === 'rent' ? <><Money value={perDay} />/Tag</> : '–'} + Versicherung <Money value={m.insurance} />/Monat
            </dd>
          </dl>
          <button className="btn primary mt" style={{ width: '100%', justifyContent: 'center' }} disabled={busy} onClick={buy}>
            <ShoppingCart size={15} /> Verbindlich anschaffen
          </button>
        </div>
      </div>
    </div>
  );
}

function NewMarket({ onClose }: { onClose: () => void }) {
  const [pick, setPick] = useState<TruckModel | null>(null);
  if (pick)
    return (
      <Modal title="Neufahrzeug anschaffen" onClose={onClose} width={900}>
        <Purchase model={pick} onBack={() => setPick(null)} onDone={onClose} />
      </Modal>
    );
  return (
    <Modal title="Neufahrzeuge (Hersteller fiktiv)" onClose={onClose}>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Modell</th><th>Leistung</th><th>Verbrauch</th><th>Tank</th><th>Haltbarkeit</th><th className="num">Kaufpreis</th><th className="num">Leasing/Monat</th><th /></tr></thead>
          <tbody>
            {TRUCK_MODELS.map((m) => (
              <tr key={m.id}>
                <td><b>{m.maker} {m.name}</b><div className="dim">{kindText(m.id)} · {m.emission}</div></td>
                <td>{m.hp} PS</td>
                <td>{dec(m.consumption)} l/100 km</td>
                <td>{m.tankL} l</td>
                <td><Bar value={m.durability * 100} /></td>
                <td className="num"><Money value={m.price} /></td>
                <td className="num"><Money value={m.leaseRate} /></td>
                <td>
                  <button className="btn small primary" onClick={() => setPick(m)}><ShoppingCart size={13} /> Anschaffen</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="dim">Kauf, Finanzierung (10 % Anzahlung), Leasing oder tageweise Miete – auf Wunsch mit Inzahlungnahme eines eigenen Fahrzeugs.</p>
    </Modal>
  );
}

function TrailerMarket({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Auflieger beschaffen" onClose={onClose}>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Typ</th><th>Nutzlast</th><th className="num">Kaufpreis</th><th className="num">Leasing/Monat</th><th /></tr></thead>
          <tbody>
            {TRAILERS.map((t) => (
              <tr key={t.type}>
                <td><b>{t.name}</b></td>
                <td>{t.payloadT} t</td>
                <td className="num"><Money value={t.price} /></td>
                <td className="num"><Money value={t.leaseRate} /></td>
                <td>
                  <div className="row">
                    <button className="btn small" onClick={() => sendCommand({ type: 'buyTrailer', trailerType: t.type as TrailerType, financing: 'lease' })}>Leasen</button>
                    <button className="btn small primary" onClick={() => sendCommand({ type: 'buyTrailer', trailerType: t.type as TrailerType, financing: 'cash' })}>Kaufen</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="dim">Neue Auflieger werden am Firmensitz bereitgestellt.</p>
    </Modal>
  );
}

/** Fahrzeugklasse inkl. festem Aufbau, z. B. „Solo-LKW · Koffer 3,2 t“. */
function kindText(modelId: string) {
  const m = TRUCK_BY_ID[modelId];
  if (!m?.body) return VEHICLE_KIND_LABEL.tractor;
  return `${VEHICLE_KIND_LABEL[m.kind ?? 'rigid']} · ${bodyName(m.body)} ${dec(m.payloadT ?? 0)} t${m.tollFactor === 0 ? ' · mautfrei' : ''}`;
}
