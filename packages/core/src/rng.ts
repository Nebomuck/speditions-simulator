// Deterministischer Zufallsgenerator (mulberry32). Der Zustand liegt im GameState,
// damit Simulationen reproduzierbar sind und Server/Tests identische Ergebnisse liefern.

import type { GameState } from './types.ts';

export function nextRandom(state: GameState): number {
  let t = (state.rng = (state.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const rand = {
  float: (s: GameState, min = 0, max = 1) => min + nextRandom(s) * (max - min),
  int: (s: GameState, min: number, max: number) => Math.floor(min + nextRandom(s) * (max - min + 1)),
  pick: <T>(s: GameState, arr: readonly T[]): T => arr[Math.floor(nextRandom(s) * arr.length)],
  chance: (s: GameState, p: number) => nextRandom(s) < p,
  weighted: <T>(s: GameState, items: readonly T[], weight: (x: T) => number): T | undefined => {
    let total = 0;
    for (const it of items) total += Math.max(0, weight(it));
    if (total <= 0) return undefined;
    let r = nextRandom(s) * total;
    for (const it of items) {
      r -= Math.max(0, weight(it));
      if (r <= 0) return it;
    }
    return items[items.length - 1];
  },
  /** annähernd normalverteilt (Summe von 3 Gleichverteilungen) */
  normal: (s: GameState, mean: number, sd: number) =>
    mean + ((nextRandom(s) + nextRandom(s) + nextRandom(s) - 1.5) / 0.5) * sd,
};

export function newId(state: GameState, prefix: string): string {
  return `${prefix}${(state.nextId++).toString(36)}`;
}
