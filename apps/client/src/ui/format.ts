import { CARGO_BY_ID, CITY_BY_ID, COUNTRY_NAMES, TRAILER_BY_TYPE, TRUCK_BY_ID, ACTIVITY_LABEL, type GameState, type Order, type Trip, type TrailerType, tripOrderIds } from '@spedsim/core';

export const cityName = (id: string) => CITY_BY_ID[id]?.name ?? id;
export const cityLabel = (id: string) => {
  const c = CITY_BY_ID[id];
  return c ? `${c.name} (${c.country})` : id;
};
export const countryName = (code: string) => COUNTRY_NAMES[code] ?? code;
export const cargoName = (id: string) => CARGO_BY_ID[id]?.name ?? id;
export const trailerName = (t: TrailerType) => TRAILER_BY_TYPE[t]?.name ?? t;
export const modelName = (id: string) => {
  const m = TRUCK_BY_ID[id];
  return m ? `${m.maker} ${m.name}` : id;
};
export const km = (v: number) => `${Math.round(v).toLocaleString('de-DE')} km`;
export const tons = (v: number) => `${v.toLocaleString('de-DE')} t`;
export const dec = (v: number) => v.toLocaleString('de-DE');
/** Bezeichnung eines festen Aufbaus (Solo-LKW/Transporter). */
export const BODY_LABEL: Partial<Record<TrailerType, string>> = { curtain: 'Plane', box: 'Koffer', reefer: 'Kühlkoffer' };
export const bodyName = (t: TrailerType) => BODY_LABEL[t] ?? trailerName(t);
export const pct = (v: number) => `${Math.round(v)} %`;

export function tripLabel(state: GameState, trip: Trip): string {
  if (!trip.orderId) {
    const leg = trip.legs[0];
    return `Überführung → ${cityName(leg.nodes[leg.nodes.length - 1])}`;
  }
  const o = state.orders[trip.orderId];
  const extra = tripOrderIds(trip).length - 1;
  return `${cityName(o.fromCityId)} → ${cityName(o.toCityId)}${extra > 0 ? ` + ${extra} Beiladung${extra > 1 ? 'en' : ''}` : ''}`;
}

export function activityLabel(trip: Trip | undefined, status: string): string {
  if (trip) return ACTIVITY_LABEL[trip.activity];
  return status === 'workshop' ? 'Werkstatt' : status === 'broken' ? 'Defekt' : 'Wartet auf Auftrag';
}

export const ORDER_STATUS_LABEL: Record<Order['status'], string> = {
  offered: 'Angebot',
  accepted: 'Angenommen',
  planned: 'Disponiert',
  in_transit: 'Unterwegs',
  delivered: 'Zugestellt',
  expired: 'Abgelaufen',
  cancelled: 'Storniert',
};

export const QUAL_LABEL: Record<string, string> = { ADR: 'ADR', heavy: 'Schwertransport', reefer: 'Kühltransport' };
