// Wettbewerbs-Multiplayer (Paket D, Schritt D4): Sicht eines Spielers in einer Welt mit mehreren Firmen,
// Zeitsteuerung per Abstimmung der Firmen und ein gemeinsamer Weltchat.
//
// Eine Welt mit nur einer Firma (Einzelspiel, kooperativer Multiplayer) bleibt davon unberührt.

import { liveryOf, type Livery } from './branding.ts';
import type { SimContext } from './context.ts';
import { addLog } from './finance.ts';
import { newId } from './rng.ts';
import { vehicleMarker } from './selectors.ts';
import { companyIdOf, companyView, companyViews, isMultiCompany, offerPayment, orderVisible, worldOf, type WorldState } from './shard.ts';
import type { GameState, Id, Order, Player, TeamState, Tender } from './types.ts';
import { ranking, type RankEntry } from './ranking.ts';
import { incomingHandovers } from './handover.ts';

/** Fremde Firma, so wie Mitbewerber sie sehen: Name, Lackierung, Standorte und LKW auf der Karte */
export interface RivalSummary {
  id: Id;
  name: string;
  livery: Livery;
  hqCityId: string;
  locations: string[];
  players: number;
  level: number;
  vehicles: { pos: [number, number]; bearing: number; moving: boolean }[];
  /** verkauft – die Firma ruht */
  exited?: boolean;
}

/** Zusatzdaten der Spielersicht in einer Wettbewerbswelt (nur in der Übertragung, nie im Spielstand) */
export interface ArenaView {
  companyId: Id;
  rivals: RivalSummary[];
  /** Rangliste aller Speditionen (Spielerfirmen und KI) */
  ranking: RankEntry[];
  /** Angebote von Mitbewerber-Firmen an diese Firma (Preis = angebotener Preis) */
  incoming: Order[];
  /** Zahl der aktiven Firmen (Grundlage der Mehrheit bei Abstimmungen) */
  activeCompanies: number;
}

/** Laufende Abstimmung über Pause oder Zeitraffer (Welt) */
export interface TimeVote {
  id: Id;
  paused?: boolean;
  speed?: number;
  /** Firmen, die zugestimmt haben */
  by: Id[];
  proposer: string;
  company: string;
  created: number;
}

export interface WorldChatMessage {
  id: number;
  t: number;
  playerId: Id;
  name: string;
  companyId: Id;
  company: string;
  text: string;
}

/** Firma eines Spielers in einer Welt (erste Firma, in der er Mitglied ist) */
export function companyOfPlayer(world: WorldState, playerId: Id): Id | undefined {
  return world.companyOrder.find((id) => world.companies[id]?.players[playerId]);
}

/** Ansicht der Firma, für die ein Spieler handelt. Ohne Mitgliedschaft: die übergebene Ansicht. */
export function viewForPlayer(state: GameState, playerId: Id): GameState {
  if (!isMultiCompany(state)) return state;
  const world = worldOf(state);
  const id = companyOfPlayer(world, playerId);
  if (!id || id === companyIdOf(state)) return state;
  return companyViews(world).find((v) => companyIdOf(v) === id) ?? companyView(world, id);
}

/** Spieler in irgendeiner Firma der Welt */
export function findPlayer(state: GameState, playerId: Id): Player | undefined {
  return viewForPlayer(state, playerId).players[playerId];
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function rivalSummaries(state: GameState, ctx: SimContext | undefined, own: Id): RivalSummary[] {
  const out: RivalSummary[] = [];
  for (const v of companyViews(worldOf(state))) {
    const id = companyIdOf(v);
    if (id === own) continue;
    out.push({
      id,
      name: v.company.name,
      livery: liveryOf(v),
      hqCityId: v.company.hqCityId,
      locations: [...new Set(v.company.locations.map((l) => l.cityId))],
      players: Object.keys(v.players).length,
      level: v.company.level,
      vehicles: ctx
        ? Object.keys(v.vehicles).map((vid) => {
            const m = vehicleMarker(v, ctx, vid);
            return { pos: [round3(m.pos[0]), round3(m.pos[1])] as [number, number], bearing: Math.round(m.bearing), moving: m.activity === 'driving' || m.activity === 'ferry' || m.activity === 'rail' };
          })
        : [],
      ...(v.exit ? { exited: true } : {}),
    });
  }
  return out;
}

/**
 * Sicht eines Spielers in einer Welt mit mehreren Firmen: eigene Firma, offene Börse mit eigenem Preis, eigene
 * Aufträge. Aufträge anderer Firmen und deren Preise fehlen; fremde Firmen erscheinen nur als Zusammenfassung.
 * Liefert ein einfaches Objekt (Kopie der obersten Ebene) für JSON und Delta-Synchronisation.
 */
export function arenaView(state: GameState, playerId: Id, ctx?: SimContext): GameState {
  const v = viewForPlayer(state, playerId);
  const own = companyIdOf(v);
  const orders: Record<Id, Order> = {};
  for (const [id, o] of Object.entries(v.orders)) {
    if (!orderVisible(v, o)) continue;
    if (o.quotes) {
      const { quotes: _q, ...rest } = o;
      orders[id] = { ...rest, payment: offerPayment(v, o) };
    } else orders[id] = o;
  }
  const out = { ...v, orders } as GameState;
  const team = v.team;
  if (team) {
    const messages = team.messages.filter((m) => m.from === playerId || m.to.includes(playerId));
    if (messages.length !== team.messages.length) out.team = { ...team, messages } as TeamState;
  }
  // Ausschreibungen: nur das eigene Gebot, Ergebnis aus Sicht der eigenen Firma
  const tenders: Record<Id, Tender> = {};
  for (const [id, t] of Object.entries(v.tenders)) {
    if (!t.bids && !t.winnerCompanyId && !t.result) {
      tenders[id] = t;
      continue;
    }
    const { bids, winnerCompanyId, ...rest } = t;
    const bid = bids?.[own];
    const status = t.status === 'open' ? 'open' : winnerCompanyId === own ? 'won' : bid ? 'lost' : 'expired';
    tenders[id] = {
      ...rest,
      status,
      ...(bid ? { bid } : {}),
      ...(t.result ? { result: { ...t.result, bids: t.result.bids.map(({ companyId, ...b }) => (companyId === own ? { ...b, player: true } : b)) } } : {}),
    } as Tender;
  }
  out.tenders = tenders;
  out.arena = { companyId: own, rivals: rivalSummaries(v, ctx, own), activeCompanies: activeCompanies(v), ranking: ranking(v), incoming: incomingHandovers(v) };
  return out;
}

export const activeCompanies = (state: GameState) => companyViews(worldOf(state)).filter((v) => !v.exit).length;

// ---------------------------------------------------------------- Zeit per Abstimmung

/**
 * Pause oder Zeitraffer in einer Welt mit mehreren Firmen: Jede Firma hat eine Stimme. Ein Vorschlag gilt, sobald
 * mehr als die Hälfte der aktiven Firmen zugestimmt hat. Ein anderer Vorschlag ersetzt den laufenden.
 * Der Server verwirft Abstimmungen nach kurzer Echtzeitfrist.
 */
export function voteTime(state: GameState, actor: Player, p: { paused?: boolean; speed?: number }): { applied: boolean } {
  // nichts zu ändern
  if ((p.paused === undefined || p.paused === state.paused) && (p.speed === undefined || p.speed === state.speed)) return { applied: true };
  const me = companyIdOf(state);
  let vote = state.timeVote;
  if (!vote || vote.paused !== p.paused || vote.speed !== p.speed) {
    vote = { id: newId(state, 'vote'), ...p, by: [], proposer: actor.name, company: state.company.name, created: state.time };
    state.timeVote = vote;
  }
  if (!vote.by.includes(me)) vote.by.push(me);
  if (vote.by.length * 2 <= activeCompanies(state)) return { applied: false };
  if (p.paused !== undefined) {
    state.paused = p.paused;
    state.pausedForDecision = false;
  }
  if (p.speed !== undefined) state.speed = p.speed;
  state.timeVote = undefined;
  const what = p.paused === true ? 'Pause' : p.paused === false ? 'Fortsetzen' : `Tempo ${p.speed}×`;
  for (const v of companyViews(worldOf(state))) addLog(v, { level: 'info', category: 'multiplayer', text: `Abstimmung angenommen: ${what}.` });
  return { applied: true };
}

/** Abstimmung zurückziehen oder ablehnen (die eigene Firma stimmt nicht zu). Bei Ablehnung endet sie. */
export function rejectTimeVote(state: GameState): void {
  if (!state.timeVote) return;
  state.timeVote = undefined;
}

// ---------------------------------------------------------------- Weltchat

export function postWorldChat(state: GameState, actor: Player, text: string): void {
  const list = (state.worldChat ??= []);
  list.push({ id: state.nextId++, t: state.time, playerId: actor.id, name: actor.name, companyId: companyIdOf(state), company: state.company.name, text });
  if (list.length > 300) list.shift();
}
