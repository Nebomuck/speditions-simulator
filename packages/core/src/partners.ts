// Partner und Übernahmen: angenommene Aufträge an Subunternehmer abgeben (Konkurrenz im Umkreis oder ein
// Partner aus der Frachtenbörse) und angeschlagene oder kleine Konkurrenten mit Fuhrpark, Fahrern und
// Kunden übernehmen.

import { CITY_BY_ID } from './data/cities.ts';
import { LOCATION_DEFS, TRAILER_BY_TYPE, TRUCK_BY_ID } from './data/catalog.ts';
import { STRATEGY_LABEL, activeCompetitors, nearCompetitor } from './competition.ts';
import { levelDef } from './company.ts';
import { onContractDelivery } from './contracts.ts';
import { penaltyFor } from './dispatch.ts';
import { addLog, adjustSatisfaction, book, createInvoice, formatMoney } from './finance.ts';
import { makeApplicant, plate, usedValue } from './generate.ts';
import { newId, rand } from './rng.ts';
import { MIN_PER_DAY, formatDuration, toDate } from './time.ts';
import type { Competitor, CompetitorStrategy, GameState, Id, Money, Order } from './types.ts';

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const OVERDRAFT = -10_000_00;

// ---------- Subunternehmer ----------

/** Partner aus der Frachtenbörse: immer verfügbar, aber teurer als die Konkurrenz vor Ort */
export const EXCHANGE_PARTNER = { id: 'exchange', name: 'Frachtenbörse-Partner', share: 0.93, late: 0.1 } as const;

/** Anteil des Frachtpreises, den der Subunternehmer verlangt (Rest bleibt dir als Vermittlungsmarge) */
const SHARE_BASE = 0.88;
const LATE_CHANCE: Record<CompetitorStrategy, number> = { budget: 0.16, regional: 0.08, premium: 0.03 };

export interface SubcontractQuote {
  partnerId: Id;
  name: string;
  price: Money;
  margin: Money;
  /** Wahrscheinlichkeit einer verspäteten Zustellung 0–1 */
  lateChance: number;
  note: string;
}

/** Warum ein Auftrag nicht abgegeben werden kann (undefined: geht) */
export function subcontractBlock(state: GameState, o: Order): string | undefined {
  if (o.status !== 'accepted') return 'Nur angenommene, noch nicht disponierte Aufträge lassen sich abgeben.';
  if (o.premium) return 'Premium-Aufträge erledigt deine Firma selbst.';
  if (o.subcontract) return 'Der Auftrag ist bereits vergeben.';
  if (state.time > o.pickupEnd - 60) return 'Das Ladefenster schließt gleich – dafür findet sich kein Partner mehr.';
  return undefined;
}

/** Angebote der Partner für einen Auftrag, günstigstes zuerst */
export function subcontractQuotes(state: GameState, o: Order): SubcontractQuote[] {
  const from = CITY_BY_ID[o.fromCityId];
  const quotes: SubcontractQuote[] = [];
  for (const c of activeCompetitors(state)) {
    if (!from || !nearCompetitor(c, from)) continue;
    const share = Math.min(0.95, SHARE_BASE * c.priceLevel + (c.status === 'trouble' ? -0.03 : 0));
    const price = Math.round((o.payment * share) / 100) * 100;
    const lateChance = Math.min(0.5, LATE_CHANCE[c.strategy] + (c.status === 'trouble' ? 0.15 : 0));
    quotes.push({ partnerId: c.id, name: c.name, price, margin: o.payment - price, lateChance, note: c.status === 'trouble' ? `${STRATEGY_LABEL[c.strategy]}, in Schwierigkeiten` : STRATEGY_LABEL[c.strategy] });
  }
  const price = Math.round((o.payment * EXCHANGE_PARTNER.share) / 100) * 100;
  quotes.push({ partnerId: EXCHANGE_PARTNER.id, name: EXCHANGE_PARTNER.name, price, margin: o.payment - price, lateChance: EXCHANGE_PARTNER.late, note: 'immer verfügbar' });
  return quotes.sort((a, b) => b.margin - a.margin);
}

/** Auftrag an einen Subunternehmer abgeben. Er holt ab und liefert; du rechnest mit dem Kunden ab und zahlst ihn. */
export function subcontractOrder(state: GameState, orderId: Id, partnerId?: Id): Result<{ price: Money }> {
  const o = state.orders[orderId];
  if (!o) return { ok: false, error: 'Auftrag nicht gefunden.' };
  const block = subcontractBlock(state, o);
  if (block) return { ok: false, error: block };
  const quotes = subcontractQuotes(state, o);
  const q = partnerId ? quotes.find((x) => x.partnerId === partnerId) : quotes[0];
  if (!q) return { ok: false, error: 'Dieser Partner fährt nicht in der Region der Ladestelle.' };
  // Fahrzeit des Partners: Anfahrt, Laden, Strecke mit Pausen
  const driveMin = (o.distanceKm / 62) * 60 * (o.distanceKm > 600 ? 1.25 : 1.1);
  const earliest = Math.max(state.time + 120, o.pickupStart) + driveMin + 120;
  const late = rand.chance(state, q.lateChance);
  const onTime = Math.max(earliest, o.deliveryEnd - rand.int(state, 30, 300));
  const deliverAt = Math.round(late ? Math.max(earliest, o.deliveryEnd) + rand.int(state, 45, 360) : Math.min(onTime, Math.max(earliest, o.deliveryEnd - 30)));
  o.status = 'in_transit';
  o.subcontract = { partnerId: q.partnerId, name: q.name, price: q.price, since: state.time, deliverAt };
  addLog(state, { level: 'info', category: 'order', text: `Auftrag ${CITY_BY_ID[o.fromCityId].name} → ${CITY_BY_ID[o.toCityId].name} an ${q.name} vergeben (${formatMoney(q.price)}, dir bleiben ${formatMoney(q.margin)}).`, ref: { kind: 'order', id: o.id } });
  return { ok: true, price: q.price };
}

/** Stündlich: Zustellungen der Subunternehmer abschließen */
export function hourlyPartners(state: GameState): void {
  for (const o of Object.values(state.orders)) {
    const sc = o.subcontract;
    if (!sc || o.status !== 'in_transit' || state.time < sc.deliverAt) continue;
    const lateMin = Math.max(0, Math.round(sc.deliverAt - o.deliveryEnd));
    const penalty = penaltyFor(o, lateMin);
    const customer = state.customers[o.customerId];
    o.status = 'delivered';
    o.deliveredAt = sc.deliverAt;
    o.lateMinutes = lateMin;
    createInvoice(state, o, o.payment - penalty);
    // Vertragsstrafe reicht der Partner an dich durch: Er bekommt entsprechend weniger
    const pay = Math.max(0, sc.price - penalty);
    book(state, 'company', -pay, 'subcontract', `Subunternehmer ${sc.name}: ${CITY_BY_ID[o.fromCityId].name} → ${CITY_BY_ID[o.toCityId].name}`);
    const rival = state.competitors[sc.partnerId];
    if (rival) {
      rival.month.revenue += pay;
      rival.month.orders += 1;
      rival.month.hours += o.distanceKm / 62 + 3;
    }
    const c = state.company;
    c.totals.subcontracted = (c.totals.subcontracted ?? 0) + 1;
    if (customer) {
      customer.deliveries++;
      // Der Kunde merkt, dass nicht du gefahren bist: weniger Zufriedenheit als bei eigener Zustellung
      if (lateMin > 0) {
        adjustSatisfaction(customer, -Math.min(25, 6 + (lateMin / 60) * 1.5));
        c.reputation = Math.max(0, c.reputation - 1.5);
      } else adjustSatisfaction(customer, 1);
    }
    onContractDelivery(state, o, lateMin);
    addLog(state, {
      level: lateMin > 0 ? 'warning' : 'success',
      category: 'order',
      text: lateMin > 0
        ? `${sc.name} hat ${CITY_BY_ID[o.toCityId].name} verspätet erreicht (${formatDuration(lateMin)}). Vertragsstrafe ${formatMoney(penalty)} trägt der Partner.`
        : `${sc.name} hat pünktlich in ${CITY_BY_ID[o.toCityId].name} zugestellt. Rechnung an ${customer?.name ?? 'den Kunden'} ist raus.`,
      ref: { kind: 'order', id: o.id },
    });
  }
}

// ---------- Übernahme von Konkurrenten ----------

/** höchstens so viele LKW übernimmt man auf einmal */
export const ACQUIRE_MAX_TRUCKS = 8;
/** kleine, gesunde Speditionen verkaufen bis zu dieser Größe */
export const ACQUIRE_SMALL_TRUCKS = 5;
const TRUCK_PRICE: Money = 26_000_00;
const CUSTOMER_PRICE: Money = 2_500_00;
const MODEL_BY_STRATEGY: Record<CompetitorStrategy, string> = { budget: 'trasko-m380', regional: 'nordwal-tx420', premium: 'velkor-s460' };

export interface AcquisitionOffer {
  competitorId: Id;
  name: string;
  trucks: number;
  customers: number;
  drivers: number;
  price: Money;
  /** eigener Standort in der Stadt fehlt: Betriebshof wird übernommen */
  newLocation: boolean;
  /** freie Stellplätze nach der Übernahme reichen nicht für alle LKW */
  parkingShort: number;
  reason: string;
}

/** Kaufangebot für einen Konkurrenten (undefined: steht nicht zum Verkauf) */
export function acquisitionOffer(state: GameState, c: Competitor): AcquisitionOffer | undefined {
  if (c.status === 'bankrupt' || c.status === 'acquired') return undefined;
  const trouble = c.status === 'trouble';
  if (!trouble && c.trucks > ACQUIRE_SMALL_TRUCKS) return undefined;
  const trucks = Math.min(ACQUIRE_MAX_TRUCKS, c.trucks);
  const customers = Object.values(state.customers).filter((cu) => cu.lostTo === c.id).length;
  // Betriebshof nur, wenn die Unternehmensstufe noch einen Standort erlaubt
  const newLocation = !state.company.locations.some((l) => l.cityId === c.hqCityId) && state.company.locations.length < levelDef(state.company.level).maxLocations;
  const parking = state.company.locations.reduce((a, l) => a + LOCATION_DEFS[l.kind].parking, 0) + (newLocation ? LOCATION_DEFS.office_yard.parking : 0);
  const free = Math.max(0, parking - Object.keys(state.vehicles).length);
  const parkingShort = Math.max(0, trucks - free);
  // bezahlt werden nur die LKW, die du auch übernimmst
  const taken = trucks - parkingShort;
  const factor = trouble ? 0.75 : 1.3;
  const price = Math.round((taken * TRUCK_PRICE * factor + customers * CUSTOMER_PRICE) / 100_00) * 100_00;
  return {
    competitorId: c.id, name: c.name, trucks, customers, drivers: taken, price, newLocation, parkingShort,
    reason: trouble ? 'In Schwierigkeiten – der Inhaber verkauft günstig.' : 'Kleiner Betrieb, der Inhaber sucht einen Nachfolger. Gesunde Firmen haben ihren Preis.',
  };
}

/** Konkurrenten übernehmen: LKW mit Aufliegern, Betriebshof, Fahrer (als Bewerber) und abgewanderte Kunden */
export function acquireCompetitor(state: GameState, competitorId: Id): Result<{ price: Money }> {
  const c = state.competitors[competitorId];
  if (!c) return { ok: false, error: 'Spedition nicht gefunden.' };
  const offer = acquisitionOffer(state, c);
  if (!offer) return { ok: false, error: `${c.name} steht nicht zum Verkauf.` };
  if (state.company.account.balance - offer.price < OVERDRAFT) return { ok: false, error: `Nicht genügend Geld: Der Kaufpreis beträgt ${formatMoney(offer.price)}. Ein Bankkredit kann helfen.` };
  const trucks = offer.trucks - offer.parkingShort;
  if (trucks <= 0) return { ok: false, error: 'Keine freien Stellplätze für die übernommenen LKW. Erweitere zuerst einen Standort.' };

  book(state, 'company', -offer.price, 'acquisition', `Übernahme ${c.name}`);
  const city = CITY_BY_ID[c.hqCityId];
  if (offer.newLocation) {
    state.company.locations.push({ id: newId(state, 'loc'), cityId: c.hqCityId, kind: 'office_yard', since: state.time, facilities: [] });
  }
  const modelId = MODEL_BY_STRATEGY[c.strategy];
  const m = TRUCK_BY_ID[modelId];
  const year = toDate(state.time).getUTCFullYear();
  // Kaufpreis anteilig auf die Fahrzeuge verteilen (Buchwert), der Rest ist Kundenstamm
  const perTruck = Math.round((offer.price * 0.85) / Math.max(1, trucks) / 100) * 100;
  for (let i = 0; i < trucks; i++) {
    const age = rand.int(state, 3, 8);
    const km = age * rand.int(state, 80_000, 125_000);
    const condition = rand.int(state, 52, 80);
    const id = newId(state, 'veh');
    state.vehicles[id] = {
      id, modelId, plate: plate(state, c.hqCityId), year: year - age, odometerKm: km, condition, fuelL: m.tankL * 0.4,
      cityId: c.hqCityId, status: 'idle', ownership: 'owned', purchasePrice: Math.min(perTruck, usedValue(m.price, age, km, condition)), bought: state.time,
      history: [{ t: state.time, text: `Übernommen von ${c.name}`, cost: perTruck }],
    };
    const tid = newId(state, 'trl');
    state.trailers[tid] = {
      id: tid, type: 'curtain', plate: plate(state, c.hqCityId), condition: rand.int(state, 55, 85), cityId: c.hqCityId, status: 'idle',
      ownership: 'owned', purchasePrice: Math.round(TRAILER_BY_TYPE.curtain.price * 0.45), bought: state.time,
    };
  }
  // Die Fahrer bewerben sich: Wer übernommen werden will, steht zwei Wochen in der Bewerberliste
  for (let i = 0; i < trucks; i++) {
    const a = makeApplicant(state, c.hqCityId);
    a.experience = Math.min(98, a.experience + 12);
    a.reliability = Math.min(99, a.reliability + 5);
    a.expires = state.time + 14 * MIN_PER_DAY;
    state.applicants[a.id] = a;
  }
  let won = 0;
  for (const cu of Object.values(state.customers)) {
    if (cu.lostTo !== c.id) continue;
    delete cu.lostTo;
    delete cu.lostAt;
    cu.satisfaction = Math.max(cu.satisfaction, 60);
    won++;
  }
  c.status = 'acquired';
  c.acquiredAt = state.time;
  c.trucks = 0;
  state.company.reputation = Math.min(100, state.company.reputation + 2);
  state.company.totals.acquisitions = (state.company.totals.acquisitions ?? 0) + 1;
  addLog(state, {
    level: 'success', category: 'market',
    text: `Übernahme: ${c.name} (${city?.name ?? c.hqCityId}) gehört jetzt dir – ${trucks} LKW mit Aufliegern${offer.newLocation ? ', ein Betriebshof' : ''}${won ? `, ${won} Kunden kommen zurück` : ''}. Die Fahrer stehen in der Bewerberliste.`,
  });
  return { ok: true, price: offer.price };
}
