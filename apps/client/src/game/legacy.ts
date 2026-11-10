// Neustart-Bonus: verkaufte Firmen werden lokal gemerkt und geben der nächsten Gründung einen Vorsprung.

import { legacyBonus, type CompanyExit } from '@spedsim/core';

export interface ExitRecord {
  key: string;
  company: string;
  proceeds: number;
  price: number;
  months: number;
  t: number;
  soldAt: string;
}

const KEY = 'cargovia.exits';

export function loadExits(): ExitRecord[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** Verkauf merken (einmal je Firma und Verkaufszeitpunkt) */
export function rememberExit(seed: number, company: string, exit: CompanyExit): void {
  const key = `${seed}:${exit.t}`;
  const list = loadExits();
  if (list.some((x) => x.key === key)) return;
  list.push({ key, company, proceeds: exit.proceeds, price: exit.price, months: exit.months, t: exit.t, soldAt: new Date().toISOString() });
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-20)));
  } catch {
    /* ohne Speicher gibt es eben keinen Bonus */
  }
}

export function currentLegacy() {
  const exits = loadExits();
  return { exits, ...legacyBonus(exits) };
}
