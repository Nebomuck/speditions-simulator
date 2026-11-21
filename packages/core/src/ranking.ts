// Rangliste (Paket D, Schritt D5): Spielerfirmen und KI-Speditionen nach Firmenwert, dazu Umsatz der letzten
// 30 Tage, Pünktlichkeit, Ruf und Flottengröße. Im Einzelspiel steht die eigene Firma gegen die KI-Konkurrenz.

import { liveryOf } from './branding.ts';
import { activeCompetitors } from './competition.ts';
import { companyValue } from './finance.ts';
import { vehicleMarketValue } from './generate.ts';
import { companyIdOf, companyViews, isCompanyView, worldOf } from './shard.ts';
import type { CompetitorStrategy, GameState, Id, Money } from './types.ts';

export interface RankEntry {
  id: Id;
  name: string;
  kind: 'player' | 'ai';
  /** die eigene Firma */
  own?: boolean;
  /** Firmenwert abzüglich Kredite */
  value: Money;
  /** Umsatz der letzten 30 Tage */
  revenue30: Money;
  /** Anteil pünktlicher Lieferungen 0–1 (null: noch keine Lieferung) */
  punctuality: number | null;
  reputation: number;
  trucks: number;
  /** Firmenfarbe (Spielerfirmen) */
  color?: string;
}

/** grober Wert eines LKW der KI-Konkurrenz (Gebrauchtwert eines Sattelzugs) */
const AI_TRUCK_VALUE: Money = 42_000_00;
/** typische Pünktlichkeit der KI-Speditionen je Strategie */
const AI_PUNCTUALITY: Record<CompetitorStrategy, number> = { budget: 0.84, regional: 0.92, premium: 0.97 };

/** Rangliste nach Firmenwert, beste zuerst */
export function ranking(state: GameState): RankEntry[] {
  const own = companyIdOf(state);
  const views = isCompanyView(state) ? companyViews(worldOf(state)) : [state];
  const out: RankEntry[] = [];
  for (const v of views) {
    if (v.exit) continue;
    const t = v.company.totals;
    const debts = v.company.loans.reduce((a, l) => a + l.remaining, 0);
    const id = companyIdOf(v);
    out.push({
      id,
      name: v.company.name,
      kind: 'player',
      ...(id === own ? { own: true } : {}),
      value: companyValue(v, (vid) => vehicleMarketValue(v, vid)) - debts,
      revenue30: v.stats.slice(-30).reduce((a, d) => a + d.revenue, 0),
      punctuality: t.deliveries > 0 ? Math.round((1 - t.lateDeliveries / t.deliveries) * 1000) / 1000 : null,
      reputation: Math.round(v.company.reputation),
      trucks: Object.keys(v.vehicles).length,
      color: liveryOf(v).primary,
    });
  }
  for (const c of activeCompetitors(state)) {
    out.push({
      id: c.id,
      name: c.name,
      kind: 'ai',
      value: c.cash + c.trucks * AI_TRUCK_VALUE,
      revenue30: c.lastMonth.revenue || c.month.revenue,
      punctuality: AI_PUNCTUALITY[c.strategy] - (c.status === 'trouble' ? 0.1 : 0),
      reputation: Math.round(c.reputation),
      trucks: c.trucks,
    });
  }
  return out.sort((a, b) => b.value - a.value);
}
