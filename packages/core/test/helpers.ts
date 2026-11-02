import roadnet from '../src/data/roadnet.json' with { type: 'json' };
import { createNewGame, createSimContext, type GameState, type Order, type RoadNetData, type SimContext, CARGO_BY_ID, newId } from '../src/index.ts';

export const ctx: SimContext = createSimContext(roadnet as RoadNetData);

export function newGame(seed = 42, hq = 'leipzig'): GameState {
  return createNewGame(ctx, { seed, companyName: 'Test Logistik', hqCityId: hq, difficulty: 'normal', founder: { id: 'p1', name: 'Alex Test' } });
}

/** Legt einen kontrollierten Testauftrag an. */
export function addOrder(state: GameState, from: string, to: string, opts: Partial<Order> = {}): Order {
  const r = ctx.net.route(from, to)!;
  const cargo = CARGO_BY_ID[opts.cargoId ?? 'pallets'];
  const id = newId(state, 'ord');
  const custId = Object.keys(state.customers)[0];
  const o: Order = {
    id,
    customerId: custId,
    cargoId: cargo.id,
    fromCityId: from,
    toCityId: to,
    weightT: 18,
    trailerType: cargo.trailer,
    qualifications: cargo.qualifications,
    pickupStart: state.time,
    pickupEnd: state.time + 6 * 60,
    deliveryEnd: state.time + 3 * 1440,
    distanceKm: r.km,
    payment: 1_000_00,
    penaltyPerHour: 20_00,
    express: false,
    international: true,
    status: 'offered',
    offerExpires: state.time + 1440,
    created: state.time,
    ...opts,
  };
  state.orders[id] = o;
  return o;
}

export const first = <T>(rec: Record<string, T>): T => Object.values(rec)[0];

/** Simuliert, bis die Bedingung erfüllt ist (max. `maxMin` Minuten). */
export async function runUntil(state: GameState, cond: () => boolean, maxMin: number, onMinute?: () => void) {
  const { tickMinute } = await import('../src/sim.ts');
  for (let i = 0; i < maxMin; i++) {
    if (cond()) return i;
    tickMinute(state, ctx);
    onMinute?.();
  }
  return cond() ? maxMin : -1;
}
