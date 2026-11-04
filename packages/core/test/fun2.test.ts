import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS, MIN_PER_DAY, QUARTER_DAYS, SCENARIOS, STATE_VERSION, TRAITS, applyCommand, createNewGame, dailyGoals, dailyProgress, dailyScenario, deserializeSave,
  effectiveEco, generatePremiumOrder, goalProgress, hourlyPremium, loanRate, makeApplicant, offerDecision, onDelivery, penaltyFor, planCoLoad, satisfactionFactors,
  serializeSave, tickMinutes, validateDispatch, type GameState, type ScenarioId,
} from '../src/index.ts';
import { addOrder, ctx, first, newGame } from './helpers.ts';

function premium(s: GameState, kind: 'heavy' | 'fair') {
  for (let i = 0; i < 40; i++) {
    const o = generatePremiumOrder(s, ctx, kind);
    if (o) return o;
  }
  throw new Error('kein Premium-Auftrag');
}

function scenarioGame(scenario: ScenarioId, seed = 7) {
  return createNewGame(ctx, { seed, companyName: 'Szenario GmbH', hqCityId: 'leipzig', difficulty: 'normal', founder: { id: 'p1', name: 'Alex Test' }, scenario });
}

describe('Premium-Aufträge (0.15.0)', () => {
  it('Schwertransport: ohne Genehmigung nicht disponierbar, Antrag kostet Geld und nimmt den Auftrag an', () => {
    const s = newGame();
    const o = premium(s, 'heavy');
    expect(o.premium).toMatchObject({ kind: 'heavy', permit: 'none' });
    expect(o.qualifications).toContain('heavy');
    expect(o.trailerType).toBe('lowbed');
    // deutlich über der normalen Fracht
    expect(o.payment).toBeGreaterThan(o.distanceKm * 300);
    const v = first(s.vehicles);
    const d = first(s.drivers);
    const input = { orderId: o.id, vehicleId: v.id, driverId: d.id, trailerId: first(s.trailers).id };
    expect(validateDispatch(s, ctx, input).issues.some((i) => i.code === 'permit')).toBe(true);

    const before = s.company.account.balance;
    expect(applyCommand(s, ctx, 'p1', { type: 'applyPermit', orderId: o.id }).ok).toBe(true);
    expect(o.status).toBe('accepted');
    expect(o.premium!.permit).toBe('pending');
    expect(s.company.account.balance).toBe(before - o.premium!.permitCost!);
    expect(applyCommand(s, ctx, 'p1', { type: 'applyPermit', orderId: o.id }).ok).toBe(false);
    expect(validateDispatch(s, ctx, input).issues.find((i) => i.code === 'permit')?.text).toMatch(/bearbeitet/);

    s.time = o.premium!.permitReady!;
    hourlyPremium(s);
    expect(o.premium!.permit).toBe('granted');
    expect(validateDispatch(s, ctx, input).issues.some((i) => i.code === 'permit')).toBe(false);
  });

  it('Messe-Termin: enges Fenster, zwei Stunden Verspätung kosten die halbe Vergütung, keine Beiladung', () => {
    const s = newGame();
    const o = premium(s, 'fair');
    expect(o.premium!.kind).toBe('fair');
    expect(o.pickupEnd - o.pickupStart).toBe(3 * 60);
    expect(penaltyFor(o, 2 * 60)).toBe(Math.round(o.payment * 0.5));
    expect(planCoLoad(s, ctx, first(s.vehicles).id, o.id).issues.some((i) => i.code === 'premium')).toBe(true);
  });

  it('pünktliche Premium-Lieferung bringt Ansehen und zählt für Erfolge', async () => {
    const s = newGame();
    const o = premium(s, 'fair');
    const rep = s.company.reputation;
    const { onPremiumDelivery } = await import('../src/premium.ts');
    onPremiumDelivery(s, o, 0);
    onDelivery(s, o, 0);
    expect(s.company.reputation).toBe(rep + 3);
    expect(s.progress.counts.fair).toBe(1);
    expect(s.progress.achievements.fair).toBeDefined();
    onPremiumDelivery(s, o, 90);
    expect(s.company.reputation).toBe(rep + 3 - 4);
  });

  it('die KI-Disposition plant keine Premium-Aufträge', () => {
    const s = newGame();
    const o = premium(s, 'fair');
    // Disponent einstellen und vollautomatisch planen lassen
    applyCommand(s, ctx, 'p1', { type: 'hireStaff', dept: 'dispatch', locationId: s.company.locations[0].id });
    applyCommand(s, ctx, 'p1', { type: 'setAutoDispatch', mode: 'auto' });
    tickMinutes(s, ctx, 6 * 60);
    expect(o.tripId).toBeUndefined();
    expect(o.status).toBe('offered');
  });
});

describe('Fahrereigenschaften (0.15.0)', () => {
  it('etwa zwei von drei Bewerbern haben eine Eigenschaft', () => {
    const s = newGame();
    const apps = Array.from({ length: 300 }, () => makeApplicant(s, 'leipzig'));
    const share = apps.filter((a) => a.trait).length / apps.length;
    expect(share).toBeGreaterThan(0.55);
    expect(share).toBeLessThan(0.75);
    for (const a of apps) if (a.trait) expect(TRAITS[a.trait]).toBeDefined();
  });

  it('Sparfuchs spart Diesel, Frohnatur ist zufriedener', () => {
    const s = newGame();
    const d = first(s.drivers);
    d.trait = undefined;
    const plain = satisfactionFactors(s, d).target;
    expect(effectiveEco({ ecoDriving: 50, trait: 'frugal' })).toBe(75);
    expect(effectiveEco({ ecoDriving: 90, trait: 'frugal' })).toBe(100);
    d.trait = 'cheerful';
    expect(satisfactionFactors(s, d).target).toBe(Math.min(95, plain + 8));
  });

  it('Fahrergeschichten: Geburtstag und Blitzerfoto (nur bei Bleifuß)', () => {
    const s = newGame();
    const d = first(s.drivers);
    d.trait = undefined;
    s.time += 30 * MIN_PER_DAY;
    expect(offerDecision(s, ctx, 'driver_speeding')).toBeNull();
    d.trait = 'leadfoot';
    d.kmDriven = 10_000;
    const fine = offerDecision(s, ctx, 'driver_speeding')!;
    expect(fine.text).toContain(d.name);
    applyCommand(s, ctx, 'p1', { type: 'decide', decisionId: fine.id, optionId: 'pay' });
    const age = d.age;
    const bday = offerDecision(s, ctx, 'driver_birthday')!;
    expect(bday).not.toBeNull();
    applyCommand(s, ctx, 'p1', { type: 'decide', decisionId: bday.id, optionId: 'card' });
    expect(d.age).toBe(age + 1);
  });
});

describe('Quartalsziele und Bonität (0.15.0)', () => {
  it('neues Spiel startet mit drei Zielen, darunter Umsatz; volle Erfüllung verbessert die Bonität', () => {
    const s = newGame();
    const q = s.quarter!;
    expect(q.goals).toHaveLength(3);
    expect(q.goals[0].kind).toBe('revenue');
    expect(q.end - q.start).toBe(QUARTER_DAYS * MIN_PER_DAY);
    const rate = loanRate(s, 24);
    // alle Ziele erfüllen
    for (const g of q.goals) {
      if (g.kind === 'revenue') s.company.totals.revenue = g.base + g.target;
      if (g.kind === 'deliveries') s.company.totals.deliveries = g.base + g.target;
      if (g.kind === 'ontime') s.company.totals.deliveries = g.base + 20;
      if (g.kind === 'empty') {
        s.company.totals.kmLoaded = (g.base2 ?? 0) + 5000;
        s.company.totals.kmEmpty = g.base + 500;
      }
      if (g.kind === 'reputation') s.company.reputation = g.target;
      if (g.kind === 'balance') s.company.account.balance = g.target;
      if (g.kind === 'fleet') expect.fail('Flottenziel erst ab 50.000 €');
    }
    expect(q.goals.every((g) => goalProgress(s, g).met)).toBe(true);
    s.time = q.end;
    dailyGoals(s);
    expect(s.company.rating).toBe(1);
    expect(loanRate(s, 24)).toBeCloseTo(rate - 0.005);
    expect(s.quarterHistory[0]).toMatchObject({ index: 1, met: 3, of: 3, rating: 1 });
    expect(s.quarter!.index).toBe(2);
    expect(s.progress.achievements.quarter).toBeUndefined();
    dailyProgress(s);
    expect(s.progress.achievements.quarter).toBeDefined();
  });

  it('verfehlte Ziele verschlechtern die Bonität', () => {
    const s = newGame();
    s.time = s.quarter!.end;
    dailyGoals(s);
    expect(s.company.rating).toBe(3);
    expect(s.quarterHistory[0].met).toBeLessThanOrEqual(1);
  });
});

describe('Szenarien (0.15.0)', () => {
  it('jedes Szenario startet spielbar mit Ziel und Frist', () => {
    for (const id of Object.keys(SCENARIOS) as ScenarioId[]) {
      const s = scenarioGame(id);
      if (id === 'free') expect(s.scenario).toBeUndefined();
      else {
        expect(s.scenario).toMatchObject({ id, status: 'running' });
        expect(s.scenario!.deadline).toBeGreaterThan(s.time);
      }
      tickMinutes(s, ctx, 2 * MIN_PER_DAY);
    }
  });

  it('Neustart mit Altlasten: Kredit, wenig Geld, Sieg nach Tilgung und Rücklage', () => {
    const s = scenarioGame('restart');
    expect(s.company.account.balance).toBe(8_000_00);
    expect(s.company.loans[0]).toMatchObject({ principal: 60_000_00, label: 'Altkredit' });
    dailyScenario(s);
    expect(s.scenario!.status).toBe('running');
    s.company.loans = [];
    s.company.account.balance = 55_000_00;
    dailyScenario(s);
    expect(s.scenario!.status).toBe('won');
    dailyProgress(s);
    expect(s.progress.achievements.scenario).toBeDefined();
  });

  it('Familienbetrieb: drei Züge und Fahrer; Frist abgelaufen heißt verfehlt', () => {
    const s = scenarioGame('family');
    expect(Object.keys(s.vehicles)).toHaveLength(3);
    expect(Object.keys(s.drivers)).toHaveLength(3);
    expect(Object.values(s.vehicles).every((v) => v.ownership === 'owned')).toBe(true);
    s.time = s.scenario!.deadline;
    dailyScenario(s);
    expect(s.scenario!.status).toBe('failed');
  });

  it('Kühlspezialist startet mit Kühlauflieger', () => {
    const s = scenarioGame('reefer');
    expect(first(s.trailers).type).toBe('reefer');
  });
});

describe('Erfolge und Rekorde (0.15.0)', () => {
  it('Lieferungen schalten Erfolge frei und führen die Pünktlichkeitsserie', () => {
    const s = newGame();
    const o = addOrder(s, 'leipzig', 'prag', { international: true });
    s.company.totals.deliveries = 1;
    onDelivery(s, o, 0);
    expect(s.progress.achievements.first_delivery).toBeDefined();
    expect(s.progress.achievements.international).toBeDefined();
    expect(s.progress.records.onTimeStreak).toBe(1);
    expect(s.progress.records.longestKm).toBe(Math.round(o.distanceKm));
    onDelivery(s, o, 30);
    expect(s.progress.records.onTimeStreak).toBe(0);
    expect(s.progress.records.bestStreak).toBe(1);
    expect(s.progress.countries).toContain('CZ');
    // jeder Erfolg hat eine eindeutige Kennung
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
  });

  it('alte Spielstände bekommen Fortschritt und Quartalsziele', () => {
    const s = newGame();
    const old = JSON.parse(JSON.stringify(s));
    delete old.progress;
    delete old.quarterHistory;
    delete old.quarter;
    const text = serializeSave(old, 'alt').replace(`"version":${STATE_VERSION}`, '"version":10');
    const loaded = deserializeSave(text);
    expect(loaded.progress.achievements).toEqual({});
    expect(loaded.quarterHistory).toEqual([]);
    tickMinutes(loaded, ctx, MIN_PER_DAY);
    expect(loaded.quarter?.goals).toHaveLength(3);
  });
});
