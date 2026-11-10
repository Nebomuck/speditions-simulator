import { describe, expect, it } from 'vitest';
import {
  EXCHANGE_PARTNER, MIN_PER_DAY, STATE_VERSION, acquisitionOffer, activeCompetitors, applyCommand, createNewGame, deserializeSave, dailyNews,
  exitBlock, exitValuation, foundCompetitor, legacyBonus, serializeSave, subcontractQuotes, tickMinutes, type GameState,
} from '../src/index.ts';
import { addOrder, ctx, first, newGame } from './helpers.ts';

const accepted = (s: GameState, opts = {}) => {
  const o = addOrder(s, 'leipzig', 'hamburg', { status: 'accepted', payment: 1_200_00, ...opts });
  return o;
};

describe('Subunternehmer', () => {
  it('Partner aus der Frachtenbörse ist immer im Angebot, Konkurrenz vor Ort meist günstiger', () => {
    const s = newGame();
    const o = accepted(s);
    const quotes = subcontractQuotes(s, o);
    expect(quotes.some((q) => q.partnerId === EXCHANGE_PARTNER.id)).toBe(true);
    for (const q of quotes) {
      expect(q.price).toBeLessThan(o.payment);
      expect(q.margin).toBe(o.payment - q.price);
    }
  });

  it('vergebener Auftrag wird zugestellt, abgerechnet und der Partner bezahlt', () => {
    const s = newGame();
    const o = accepted(s);
    const r = applyCommand(s, ctx, 'p1', { type: 'subcontractOrder', orderId: o.id, partnerId: EXCHANGE_PARTNER.id });
    expect(r.ok).toBe(true);
    expect(o.status).toBe('in_transit');
    expect(o.subcontract?.name).toBe(EXCHANGE_PARTNER.name);
    // doppelt geht nicht, disponieren auch nicht mehr
    expect(applyCommand(s, ctx, 'p1', { type: 'subcontractOrder', orderId: o.id }).ok).toBe(false);
    s.paused = false;
    tickMinutes(s, ctx, Math.ceil(o.subcontract!.deliverAt - s.time) + 61);
    expect(o.status).toBe('delivered');
    const inv = Object.values(s.invoices).find((i) => i.orderId === o.id);
    expect(inv).toBeTruthy();
    const paid = s.ledger.filter((l) => l.category === 'subcontract');
    expect(paid.length).toBe(1);
    expect(-paid[0].amount).toBeLessThanOrEqual(o.subcontract!.price);
    expect(inv!.amount + paid[0].amount).toBeGreaterThan(0);
  });

  it('Premium-Aufträge und disponierte Aufträge lassen sich nicht abgeben', () => {
    const s = newGame();
    const o = accepted(s, { status: 'planned' });
    expect(applyCommand(s, ctx, 'p1', { type: 'subcontractOrder', orderId: o.id }).ok).toBe(false);
  });
});

describe('Übernahme von Konkurrenten', () => {
  it('angeschlagene Spedition wird mit LKW, Aufliegern, Standort, Bewerbern und Kunden übernommen', () => {
    const s = newGame();
    s.company.account.balance = 500_000_00;
    s.company.level = 3;
    const c = foundCompetitor(s, { near: 'dresden', trucks: 4 });
    c.status = 'trouble';
    const cu = first(s.customers);
    cu.lostTo = c.id;
    const offer = acquisitionOffer(s, c)!;
    expect(offer).toBeTruthy();
    expect(offer.customers).toBe(1);
    const vehiclesBefore = Object.keys(s.vehicles).length;
    const applicantsBefore = Object.keys(s.applicants).length;
    const r = applyCommand(s, ctx, 'p1', { type: 'acquireCompetitor', competitorId: c.id });
    expect(r.ok).toBe(true);
    expect(Object.keys(s.vehicles).length).toBe(vehiclesBefore + 4);
    expect(Object.keys(s.applicants).length).toBe(applicantsBefore + 4);
    expect(cu.lostTo).toBeUndefined();
    expect(c.status).toBe('acquired');
    expect(activeCompetitors(s).some((x) => x.id === c.id)).toBe(false);
    if (offer.newLocation) expect(s.company.locations.some((l) => l.cityId === c.hqCityId)).toBe(true);
    expect(s.company.account.balance).toBe(500_000_00 - offer.price);
  });

  it('ohne weiteren Standort zählen die freien Stellplätze', () => {
    const s = newGame();
    s.company.account.balance = 500_000_00;
    const c = foundCompetitor(s, { trucks: 4 });
    c.status = 'trouble';
    const offer = acquisitionOffer(s, c)!;
    expect(offer.newLocation).toBe(false);
    expect(offer.parkingShort).toBe(3);
    const before = Object.keys(s.vehicles).length;
    expect(applyCommand(s, ctx, 'p1', { type: 'acquireCompetitor', competitorId: c.id }).ok).toBe(true);
    expect(Object.keys(s.vehicles).length).toBe(before + 1);
  });

  it('gesunde große Speditionen stehen nicht zum Verkauf, ohne Geld geht nichts', () => {
    const s = newGame();
    const big = foundCompetitor(s, { trucks: 20 });
    big.status = 'active';
    expect(acquisitionOffer(s, big)).toBeUndefined();
    const small = foundCompetitor(s, { trucks: 3 });
    small.status = 'active';
    s.company.account.balance = 0;
    expect(applyCommand(s, ctx, 'p1', { type: 'acquireCompetitor', competitorId: small.id }).ok).toBe(false);
  });
});

describe('Branchenblatt', () => {
  it('erscheint montags mit Schlagzeile und Rubriken', () => {
    const s = newGame();
    s.paused = false;
    tickMinutes(s, ctx, 8 * MIN_PER_DAY);
    expect(s.news!.issues.length).toBeGreaterThanOrEqual(1);
    const issue = s.news!.issues[0];
    expect(issue.headline.length).toBeGreaterThan(3);
    expect(issue.items.some((i) => i.kind === 'diesel')).toBe(true);
    expect(issue.items.some((i) => i.kind === 'company')).toBe(true);
  });

  it('meldet Konkurrenten in Schwierigkeiten mit Übernahmepreis', () => {
    const s = newGame();
    dailyNews(s);
    const c = foundCompetitor(s, { trucks: 3 });
    c.founded = s.time - 30 * MIN_PER_DAY;
    c.status = 'trouble';
    s.time += ((7 - ((Math.floor(s.time / MIN_PER_DAY) % 7)) % 7) || 7) * MIN_PER_DAY;
    dailyNews(s);
    const items = s.news!.issues[0].items;
    expect(items.some((i) => i.kind === 'rivals' && i.text.includes('verkaufen'))).toBe(true);
  });
});

describe('Firmenverkauf', () => {
  it('erst nach 90 Tagen, dann endet das Spiel und der Erlös geht aufs Privatkonto', () => {
    const s = newGame();
    expect(exitBlock(s)).toMatch(/90 Tage/);
    s.company.founded -= 100 * MIN_PER_DAY;
    s.company.account.balance = 80_000_00;
    expect(exitBlock(s)).toBeUndefined();
    const v = exitValuation(s);
    const priv = s.players.p1.character.privateAccount.balance;
    const r = applyCommand(s, ctx, 'p1', { type: 'sellCompany' });
    expect(r.ok).toBe(true);
    expect(s.exit?.proceeds).toBe(v.proceeds);
    expect(s.players.p1.character.privateAccount.balance).toBe(priv + v.proceeds);
    // die Zeit steht, Befehle gehen nicht mehr
    const t = s.time;
    s.paused = false;
    tickMinutes(s, ctx, 120);
    expect(s.time).toBe(t);
    expect(applyCommand(s, ctx, 'p1', { type: 'setPaused', paused: false }).ok).toBe(false);
  });

  it('Neustart-Bonus: 10 % der Erlöse (max. 100.000 €), Ruf +3 je Verkauf', () => {
    expect(legacyBonus([{ proceeds: 250_000_00 }])).toEqual({ capital: 25_000_00, reputation: 3 });
    expect(legacyBonus([{ proceeds: 900_000_00 }, { proceeds: 900_000_00 }, { proceeds: 1 }, { proceeds: 1 }]).capital).toBe(100_000_00);
    const s = createNewGame(ctx, { seed: 3, companyName: 'Zweite Firma', hqCityId: 'leipzig', difficulty: 'normal', founder: { id: 'p1', name: 'Alex' }, legacy: { capital: 25_000_00, reputation: 3, exits: 1 } });
    const plain = createNewGame(ctx, { seed: 3, companyName: 'Zweite Firma', hqCityId: 'leipzig', difficulty: 'normal', founder: { id: 'p1', name: 'Alex' } });
    expect(s.company.account.balance - plain.company.account.balance).toBe(25_000_00);
    expect(s.company.reputation - plain.company.reputation).toBe(3);
  });

  it('alte Spielstände bekommen ein leeres Branchenblatt', () => {
    const s = newGame();
    delete s.news;
    const loaded = deserializeSave(serializeSave(s, 'alt').replace(`"version":${STATE_VERSION}`, '"version":12'));
    expect(loaded.news).toEqual({ issues: [], count: 0 });
  });
});
