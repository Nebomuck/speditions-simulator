// Subunternehmer zwischen Spielerfirmen (Paket D, Schritt D5).
//
// Eine Firma bietet einen angenommenen Auftrag einer Mitbewerber-Firma zu einem Preis an. Die empfangende Firma
// nimmt innerhalb von zwei Spielstunden an oder lehnt ab. Bei Annahme bekommt sie einen eigenen Auftrag (gleiche
// Ladung, gleiche Fenster, vereinbarter Preis) und fährt ihn wie jeden anderen. Ist er zugestellt, rechnet die
// abgebende Firma ihre Vermittlungsmarge mit dem Kunden ab. Verspätungsstrafen trägt die ausführende Firma
// (ihr Preis sinkt), die Zufriedenheit des Kunden trifft beide.

import { onContractDelivery } from './contracts.ts';
import { CITY_BY_ID } from './data/cities.ts';
import { addLog, adjustSatisfaction, createInvoice, formatMoney } from './finance.ts';
import { subcontractBlock } from './partners.ts';
import { newId } from './rng.ts';
import { companyIdOf, companyViews, isMultiCompany, orderOwner, worldOf } from './shard.ts';
import { MIN_PER_DAY, formatDateTime } from './time.ts';
import type { GameState, Id, Money, Order } from './types.ts';

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** so lange gilt ein Angebot (Spielminuten) */
export const HANDOVER_MIN = 2 * 60;
/** Preisrahmen als Anteil des eigenen Auftragspreises */
export const HANDOVER_RANGE = [0.5, 1] as const;
/** nicht zugestellt: so lange nach Lieferfrist gilt der Auftrag als gescheitert */
const GIVE_UP_MIN = 2 * MIN_PER_DAY;

const route = (o: Order) => `${CITY_BY_ID[o.fromCityId]?.name ?? o.fromCityId} → ${CITY_BY_ID[o.toCityId]?.name ?? o.toCityId}`;
const viewOf = (state: GameState, id: Id) => companyViews(worldOf(state)).find((v) => companyIdOf(v) === id);

/** Auftrag einer Mitbewerber-Firma anbieten */
export function offerHandover(state: GameState, orderId: Id, toCompanyId: Id, price: number): Result {
  if (!isMultiCompany(state)) return { ok: false, error: 'Aufträge an Mitspieler gibt es nur in Wettbewerbswelten.' };
  const o = state.orders[orderId];
  if (!o || orderOwner(o) !== companyIdOf(state)) return { ok: false, error: 'Auftrag nicht gefunden.' };
  const block = subcontractBlock(state, o) ?? (o.handover ? 'Der Auftrag ist bereits einer Mitbewerber-Firma angeboten.' : undefined);
  if (block) return { ok: false, error: block };
  if (toCompanyId === companyIdOf(state)) return { ok: false, error: 'Wähle eine andere Firma.' };
  const target = viewOf(state, toCompanyId);
  if (!target || target.exit) return { ok: false, error: 'Diese Firma nimmt keine Aufträge an.' };
  price = Math.round(Number(price) / 100) * 100;
  const lo = Math.ceil((o.payment * HANDOVER_RANGE[0]) / 100) * 100;
  const hi = Math.floor((o.payment * HANDOVER_RANGE[1]) / 100) * 100;
  if (!Number.isFinite(price) || price < lo || price > hi) return { ok: false, error: `Preis zwischen ${formatMoney(lo)} und ${formatMoney(hi)}.` };
  o.handover = { to: toCompanyId, toName: target.company.name, from: companyIdOf(state), fromName: state.company.name, price, at: state.time, expires: state.time + HANDOVER_MIN };
  addLog(state, { level: 'info', category: 'order', text: `Auftrag ${route(o)} an ${target.company.name} angeboten (${formatMoney(price)}, dir blieben ${formatMoney(o.payment - price)}).`, ref: { kind: 'order', id: o.id } });
  addLog(target, { level: 'info', category: 'order', text: `Angebot von ${state.company.name}: ${route(o)} für ${formatMoney(price)}, annehmen bis ${formatDateTime(o.handover.expires)} (Auftragsbörse).` });
  return { ok: true };
}

/** Angebot zurückziehen (abgebende Firma) */
export function cancelHandover(state: GameState, orderId: Id): Result {
  const o = state.orders[orderId];
  if (!o?.handover || o.handover.from !== companyIdOf(state)) return { ok: false, error: 'Kein offenes Angebot.' };
  delete o.handover;
  return { ok: true };
}

/** Eingehende Angebote an diese Firma (als Aufträge mit dem angebotenen Preis) */
export function incomingHandovers(state: GameState): Order[] {
  if (!isMultiCompany(state)) return [];
  const me = companyIdOf(state);
  return Object.values(state.orders)
    .filter((o) => o.handover?.to === me && o.status === 'accepted' && state.time < o.handover.expires)
    .map((o) => {
      const { quotes: _q, ...rest } = o;
      return { ...rest, payment: o.handover!.price };
    });
}

/** Angebot annehmen: eigener Auftrag zum vereinbarten Preis */
export function acceptHandover(state: GameState, orderId: Id): Result<{ id: Id }> {
  const o = state.orders[orderId];
  const h = o?.handover;
  const me = companyIdOf(state);
  if (!o || !h || h.to !== me) return { ok: false, error: 'Kein Angebot für deine Firma.' };
  if (o.status !== 'accepted' || state.time >= h.expires) {
    delete o.handover;
    return { ok: false, error: 'Das Angebot gilt nicht mehr.' };
  }
  const from = viewOf(state, h.from);
  const { handover: _h, subcontract: _s, quotes: _q, contractId: _c, ...rest } = o;
  const child: Order = { ...rest, id: newId(state, 'ord'), status: 'accepted', companyId: me, payment: h.price, parentOrderId: o.id, created: state.time };
  state.orders[child.id] = child;
  o.status = 'in_transit';
  o.subcontract = { partnerId: me, name: state.company.name, price: h.price, since: state.time, deliverAt: o.deliveryEnd, childId: child.id };
  delete o.handover;
  addLog(state, { level: 'success', category: 'order', text: `Auftrag von ${h.fromName} übernommen: ${route(o)} für ${formatMoney(h.price)}. Jetzt disponieren.`, ref: { kind: 'order', id: child.id } });
  if (from) addLog(from, { level: 'success', category: 'order', text: `${state.company.name} übernimmt ${route(o)} für ${formatMoney(h.price)}.`, ref: { kind: 'order', id: o.id } });
  return { ok: true, id: child.id };
}

/** Angebot ablehnen (empfangende Firma) */
export function declineHandover(state: GameState, orderId: Id): Result {
  const o = state.orders[orderId];
  const h = o?.handover;
  if (!o || !h || h.to !== companyIdOf(state)) return { ok: false, error: 'Kein Angebot für deine Firma.' };
  delete o.handover;
  const from = viewOf(state, h.from);
  if (from) addLog(from, { level: 'warning', category: 'order', text: `${state.company.name} lehnt ${route(o)} ab. Der Auftrag liegt wieder bei dir.`, ref: { kind: 'order', id: o.id } });
  return { ok: true };
}

/** Stündlich je Firma: abgelaufene Angebote, Abschluss weitergegebener Aufträge */
export function hourlyHandovers(state: GameState): void {
  if (!isMultiCompany(state)) return;
  const me = companyIdOf(state);
  for (const o of Object.values(state.orders)) {
    if (orderOwner(o) !== me) continue;
    // inzwischen selbst disponiert: Angebot erledigt
    if (o.handover && o.status !== 'accepted') delete o.handover;
    if (o.handover && state.time >= o.handover.expires) {
      addLog(state, { level: 'warning', category: 'order', text: `${o.handover.toName} hat auf das Angebot ${route(o)} nicht reagiert. Der Auftrag liegt wieder bei dir.`, ref: { kind: 'order', id: o.id } });
      delete o.handover;
    }
    const sc = o.subcontract;
    if (!sc?.childId || o.status !== 'in_transit') continue;
    const child = state.orders[sc.childId];
    const customer = state.customers[o.customerId];
    if (child?.status === 'delivered') {
      const lateMin = child.lateMinutes ?? 0;
      o.status = 'delivered';
      o.deliveredAt = child.deliveredAt;
      o.lateMinutes = lateMin;
      // Kunde zahlt an dich, du zahlst die ausführende Firma: abgerechnet wird deine Marge
      createInvoice(state, o, Math.max(0, o.payment - sc.price));
      const c = state.company;
      c.totals.subcontracted = (c.totals.subcontracted ?? 0) + 1;
      if (customer) {
        customer.deliveries++;
        if (lateMin > 0) {
          adjustSatisfaction(customer, -Math.min(25, 6 + (lateMin / 60) * 1.5));
          c.reputation = Math.max(0, c.reputation - 1.5);
        } else adjustSatisfaction(customer, 1);
      }
      onContractDelivery(state, o, lateMin);
      addLog(state, {
        level: lateMin > 0 ? 'warning' : 'success',
        category: 'order',
        text: `${sc.name} hat ${route(o)} ${lateMin > 0 ? 'verspätet' : 'pünktlich'} zugestellt. Deine Marge: ${formatMoney(o.payment - sc.price)}.`,
        ref: { kind: 'order', id: o.id },
      });
    } else if (!child || child.status === 'cancelled' || child.status === 'expired' || state.time > o.deliveryEnd + GIVE_UP_MIN) {
      // nicht ausgeführt: Auftrag gescheitert, der Kunde ist verärgert
      if (child) child.status = 'cancelled';
      o.status = 'cancelled';
      if (customer) adjustSatisfaction(customer, -15);
      state.company.reputation = Math.max(0, state.company.reputation - 2);
      const exec = viewOf(state, sc.partnerId);
      if (exec) {
        exec.company.reputation = Math.max(0, exec.company.reputation - 3);
        addLog(exec, { level: 'danger', category: 'order', text: `Übernommener Auftrag ${route(o)} nicht ausgeführt. Das kostet Ruf.` });
      }
      addLog(state, { level: 'danger', category: 'order', text: `${sc.name} hat ${route(o)} nicht ausgeführt. Der Kunde ist verärgert.`, ref: { kind: 'order', id: o.id } });
    }
  }
}
