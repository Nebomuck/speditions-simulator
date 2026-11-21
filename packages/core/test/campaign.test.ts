import { describe, expect, it } from 'vitest';
import {
  acquisitionOffer, applyCommand, campaignGoals, campaignLock, createNewGame, dailyCampaign, onCampaignContainer, splitState, starsFor, tickMinutes,
  CHAPTERS, MIN_PER_DAY, RIVAL_COMPANY, type GameState,
} from '../src/index.ts';
import { addOrder, ctx } from './helpers.ts';

function career(seed = 7): GameState {
  return createNewGame(ctx, { seed, companyName: 'Test Logistik', hqCityId: 'leipzig', difficulty: 'normal', founder: { id: 'p1', name: 'Alex Test' }, career: true });
}

/** Alle Ziele des laufenden Kapitels als erreicht markieren und den Tag auswerten */
function finishChapter(s: GameState, afterDays: number) {
  s.time = s.campaign!.chapterStart + afterDays * MIN_PER_DAY;
  s.campaign!.met = CHAPTERS[s.campaign!.chapter - 1].goals.map((g) => g.id);
  dailyCampaign(s, ctx);
}

describe('Karriere-Kampagne (Paket E, Schritt E4)', () => {
  it('Start: Kapitel 1 mit Frist, Rivale Krämer in der Nähe, Begrüßung von Mentorin und Rivale', () => {
    const s = career();
    const c = s.campaign!;
    expect(c.chapter).toBe(1);
    expect(c.deadline - c.chapterStart).toBe(CHAPTERS[0].days * MIN_PER_DAY);
    expect(s.scenario).toBeUndefined();
    const rival = s.competitors[c.rivalId!];
    expect(rival.name).toBe(RIVAL_COMPANY);
    expect(rival.rival).toBe(true);
    expect(rival.trucks).toBeGreaterThanOrEqual(4);
    expect(c.messages.map((m) => m.from)).toEqual(['mentor', 'rival']);
    expect(campaignGoals(s)).toHaveLength(3);
    // ohne Karriere: kein Kampagnenzustand
    const free = createNewGame(ctx, { seed: 7, companyName: 'X', hqCityId: 'leipzig', difficulty: 'normal', founder: { id: 'p1', name: 'A' } });
    expect(free.campaign).toBeUndefined();
  });

  it('Sterne nach benötigter Zeit; Kapitel 5 beendet die Karriere', () => {
    expect(starsFor(60, 120)).toBe(3);
    expect(starsFor(61, 120)).toBe(2);
    expect(starsFor(120, 120)).toBe(2);
    expect(starsFor(121, 120)).toBe(1);
    const s = career();
    finishChapter(s, 30);
    expect(s.campaign!.chapter).toBe(2);
    expect(s.campaign!.results[0]).toEqual({ chapter: 1, stars: 3, days: 30 });
    finishChapter(s, 150);
    expect(s.campaign!.results[1].stars).toBe(2);
    finishChapter(s, 300);
    expect(s.campaign!.results[2].stars).toBe(1);
    finishChapter(s, 10);
    finishChapter(s, 10);
    expect(s.campaign!.done).toBe(true);
    expect(s.campaign!.results.map((r) => r.stars)).toEqual([3, 2, 1, 3, 3]);
    // Rivale ist mitgewachsen
    expect(s.competitors[s.campaign!.rivalId!].trucks).toBeGreaterThanOrEqual(45);
  });

  it('Ziele werden gemessen und bleiben erreicht (Lieferungen ab Kapitelbeginn)', () => {
    const s = career();
    const goal = () => campaignGoals(s).find((g) => g.id === 'deliveries15')!;
    expect(goal().met).toBe(false);
    s.company.totals.deliveries += 15;
    dailyCampaign(s, ctx);
    expect(goal().met).toBe(true);
    expect(s.campaign!.met).toContain('deliveries15');
    s.company.totals.deliveries -= 5; // kann nicht passieren, zeigt aber das Einrasten
    expect(goal().met).toBe(true);
    // Tipp der Mentorin nach 40 % der Frist, Fristhinweis danach
    s.time = s.campaign!.chapterStart + 50 * MIN_PER_DAY;
    dailyCampaign(s, ctx);
    expect(s.campaign!.messages.some((m) => m.title.startsWith('Ein Tipp'))).toBe(true);
    s.time = s.campaign!.deadline + 1;
    dailyCampaign(s, ctx);
    expect(s.campaign!.messages.some((m) => m.title === 'Die Frist ist um')).toBe(true);
  });

  it('Sperren: Ausschreibungen, KI-Disposition, Ausland, Lager und Container erst mit ihrem Kapitel', () => {
    const s = career();
    expect(campaignLock(s, 'tenders')).toMatch(/Kapitel 2/);
    const auto = applyCommand(s, ctx, 'p1', { type: 'setAutoDispatch', mode: 'auto' });
    expect(auto.ok).toBe(false);
    expect(applyCommand(s, ctx, 'p1', { type: 'setAutoDispatch', mode: 'manual' }).ok).toBe(true);
    const abroad = applyCommand(s, ctx, 'p1', { type: 'openBranch', cityId: 'wien', kind: 'office_small' });
    expect(abroad.ok).toBe(false);
    if (!abroad.ok) expect(abroad.error).toMatch(/Kapitel 3/);
    const box = addOrder(s, 'hamburg', 'leipzig', { cargoId: 'container', trailerType: 'container', status: 'offered' });
    const acc = applyCommand(s, ctx, 'p1', { type: 'acceptOrder', orderId: box.id });
    expect(acc.ok).toBe(false);
    if (!acc.ok) expect(acc.error).toMatch(/Containerverkehr/);
    // nach Kapitel 3 sind Lager und Container frei
    finishChapter(s, 10);
    finishChapter(s, 10);
    finishChapter(s, 10);
    expect(s.campaign!.chapter).toBe(4);
    expect(campaignLock(s, 'containers')).toBeUndefined();
    expect(campaignLock(s, 'warehouse')).toBeUndefined();
  });

  it('Container-Touren zählen für Kapitel 4; Krämer steht ab Kapitel 5 zum Verkauf', () => {
    const s = career();
    for (let i = 0; i < 3; i++) finishChapter(s, 10);
    for (let i = 0; i < 40; i++) onCampaignContainer(s);
    expect(campaignGoals(s).find((g) => g.id === 'containers40')!.met).toBe(true);
    const rival = s.competitors[s.campaign!.rivalId!];
    expect(acquisitionOffer(s, rival)).toBeUndefined();
    finishChapter(s, 10);
    const offer = acquisitionOffer(s, rival)!;
    expect(offer).toBeDefined();
    expect(offer.trucks).toBe(20);
    expect(offer.reason).toMatch(/Viktor Krämer/);
  });

  it('Nachrichten lesen; Karriere übersteht Simulation und Teilung in Welt und Firma', () => {
    const s = career();
    expect(applyCommand(s, ctx, 'p1', { type: 'readCampaignMessage' }).ok).toBe(true);
    expect(s.campaign!.messages.every((m) => m.read)).toBe(true);
    tickMinutes(s, ctx, 3 * MIN_PER_DAY);
    expect(s.campaign!.chapter).toBe(1);
    const shard = Object.values(splitState(s).companies)[0] as unknown as Partial<GameState>;
    expect(shard.campaign?.chapter).toBe(1);
  });
});
