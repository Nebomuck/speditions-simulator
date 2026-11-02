import { useState } from 'react';
import { Wrench, ShoppingCart, Tag, Truck, Container } from 'lucide-react';
import { TRUCK_BY_ID, TRUCK_MODELS, TRAILERS, VEHICLE_KIND_LABEL, capacity, formatDateTime, vehicleMarketValue, type TrailerType } from '@spedsim/core';
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
                    <td>{v.ownership === 'leased' ? <>Leasing <Money value={v.leaseRate ?? 0} />/Monat</> : 'Eigentum'}</td>
                    <td className="num">{v.ownership === 'owned' ? <Money value={vehicleMarketValue(s, v.id)} /> : '–'}</td>
                    <td className="num">
                      <div className="row" style={{ justifyContent: 'flex-end' }}>
                        <button className="btn small" disabled={v.status !== 'idle' || v.condition >= 98} onClick={() => sendCommand({ type: 'serviceVehicle', vehicleId: v.id })} title="Wartung & Reparatur">
                          <Wrench size={13} />Werkstatt
                        </button>
                        <button className="btn small" disabled={v.status !== 'idle'} onClick={() => setUi({ selectedVehicleId: v.id, page: 'map' })}>Karte</button>
                        <button className="btn small danger" disabled={v.status !== 'idle'} onClick={() => confirm(v.ownership === 'leased' ? 'Leasingvertrag vorzeitig beenden? Ablöse: 3 Monatsraten.' : `Fahrzeug für ca. 90 % des Marktwerts verkaufen?`) && sendCommand({ type: 'sellVehicle', vehicleId: v.id })}>
                          {v.ownership === 'leased' ? 'Rückgabe' : 'Verkaufen'}
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

function NewMarket({ onClose }: { onClose: () => void }) {
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
                  <div className="row">
                    <button className="btn small" onClick={() => sendCommand({ type: 'buyNewVehicle', modelId: m.id, financing: 'lease' })}>Leasen</button>
                    <button className="btn small primary" onClick={() => sendCommand({ type: 'buyNewVehicle', modelId: m.id, financing: 'cash' })}>Kaufen</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="dim">Leasing: erste Rate wird sofort fällig, danach monatlich. Versicherung kommt jeweils hinzu.</p>
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
