import { describe, expect, it } from 'vitest';
import {
  BID_RANGE, MIN_PER_DAY, ROUTINE_HOUR, STATE_VERSION, addPlayer, applyCommand, autopilotChoice, bidScore, dailyDecisions, dailyTenders, deserializeSave, generateTender,
  hourlyDecisions, hourlyLife, hourlyTenders, offerDecision, serializeSave, tickMinutes,
} from '../src/index.ts';
import { ctx, first, newGame } from './helpers.ts';

/** Zeit bis zum nächsten Abend (Routine-Uhrzeit) vorspulen, ohne die Simulation zu rechnen */
function atRoutineHour(t: number) {
  const day = Math.floor(t / MIN_PER_DAY) + 1;
  return day * MIN_PER_DAY + ROUTINE_HOUR * 60;
}

describe('Lebenssimulation entschärft (0.14.0)', () => {
  it('Wochenroutine läuft abends von selbst, ungültige Einträge werden verworfen', () => {
    const s = newGame();
    const r = applyCommand(s, ctx, 'p1', { type: 'life', action: { kind: 'routine', routine: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, activity: 'sport' })).concat([{ day: 9, activity: 'sport' }, { day: 2, activity: 'cinema' }, { day: 1, activity: 'course' }]) } });
    expect(r.ok).toBe(true);
    const c = s.players.p1.character;
    expect(c.routine).toHaveLength(7);
    expect(c.routine!.every((x) => x.activity === 'sport')).toBe(true);
    s.time = atRoutineHour(s.time);
    const before = c.privateAccount.balance;
    hourlyLife(s, ctx);
    expect(c.activity?.id).toBe('sport');
    expect(c.privateAccount.balance).toBeLessThan(before);
  });

  it('Fokus Firma wählt nach dem dringendsten Bedürfnis und nimmt bei hohem Stress Urlaub', () => {
    const s = newGame();
    applyCommand(s, ctx, 'p1', { type: 'life', action: { kind: 'autopilot', on: true } });
    const c = s.players.p1.character;
    expect(c.autopilot).toBe(true);
    Object.assign(c.needs, { social: 10, leisure: 70, stress: 30, health: 90, hunger: 80 });
    expect(autopilotChoice(s, c)).toMatchObject({ kind: 'activity', activity: 'friends' });
    // hoher Stress am Freitag: Kurzurlaub (Wochenende überbrückt die fehlende Disposition)
    s.time = 4 * MIN_PER_DAY + ROUTINE_HOUR * 60 + 31 * MIN_PER_DAY - 3 * MIN_PER_DAY; // Freitag
    while (Math.floor(s.time / MIN_PER_DAY) % 7 !== 4) s.time += MIN_PER_DAY;
    Object.assign(c.needs, { stress: 85 });
    expect(autopilotChoice(s, c)).toMatchObject({ kind: 'vacation' });
    // alles im grünen Bereich: kein Programm
    Object.assign(c.needs, { social: 80, leisure: 80, stress: 20, health: 95, hunger: 90 });
    expect(autopilotChoice(s, c)).toBeNull();
  });

  it('Bedürfnisse sinken langsamer: zwei Wochen ohne Freizeit führen nicht in den Burnout', () => {
    const s = newGame();
    applyCommand(s, ctx, 'p1', { type: 'life', action: { kind: 'workStyle', style: 'key_accounts' } });
    tickMinutes(s, ctx, 14 * MIN_PER_DAY);
    const c = s.players.p1.character;
    expect(c.sickUntil).toBeUndefined();
    expect(c.needs.stress).toBeLessThan(90);
  });
});

describe('Entscheidungskarten (0.14.0)', () => {
  it('Gehaltswunsch: Zusage erhöht Gehalt und Zufriedenheit', () => {
    const s = newGame();
    const d = first(s.drivers);
    d.hired = s.time - 60 * MIN_PER_DAY;
    d.satisfaction = 55;
    const dec = offerDecision(s, ctx, 'driver_raise')!;
    expect(dec).toBeTruthy();
    const salary = d.salary;
    const r = applyCommand(s, ctx, 'p1', { type: 'decide', decisionId: dec.id, optionId: 'accept' });
    expect(r.ok).toBe(true);
    expect(d.salary).toBe(salary + Number(dec.data.ask));
    expect(d.satisfaction).toBeGreaterThan(70);
    expect(s.decisions).toHaveLength(0);
    // zweimal entscheiden geht nicht
    expect(applyCommand(s, ctx, 'p1', { type: 'decide', decisionId: dec.id, optionId: 'accept' }).ok).toBe(false);
  });

  it('ohne Entscheidung gilt nach Ablauf die Vorgabe', () => {
    const s = newGame();
    const d = first(s.drivers);
    d.hired = s.time - 60 * MIN_PER_DAY;
    d.satisfaction = 55;
    const dec = offerDecision(s, ctx, 'driver_raise')!;
    expect(dec.defaultOption).toBe('refuse');
    s.time = dec.expires;
    hourlyDecisions(s, ctx);
    expect(s.decisions).toHaveLength(0);
    expect(d.satisfaction).toBeLessThan(55);
    expect(s.events.history.at(-1)?.title).toBe('Gehaltswunsch');
  });

  it('Eilauftrag: Annahme macht ihn zum angenommenen Auftrag, die Konkurrenz greift nicht zu', () => {
    const s = newGame();
    let dec = null;
    for (let i = 0; i < 20 && !dec; i++) dec = offerDecision(s, ctx, 'rush_job');
    expect(dec).toBeTruthy();
    const o = s.orders[String(dec!.data.orderId)];
    expect(o.tender).toBe(true);
    expect(o.express).toBe(true);
    applyCommand(s, ctx, 'p1', { type: 'decide', decisionId: dec!.id, optionId: 'accept' });
    expect(o.status).toBe('accepted');
  });

  it('Berechtigungen: Firmenkarten nach Bereich, private Karten nur für den eigenen Spieler', () => {
    const s = newGame();
    addPlayer(s, { id: 'p2', name: 'Disponent', permissions: ['dispatch'] });
    const d = first(s.drivers);
    d.hired = s.time - 60 * MIN_PER_DAY;
    d.satisfaction = 55;
    const dec = offerDecision(s, ctx, 'driver_raise')!;
    expect(applyCommand(s, ctx, 'p2', { type: 'decide', decisionId: dec.id, optionId: 'accept' }).ok).toBe(false);
    const priv = offerDecision(s, ctx, 'club_invite', 'p1') ?? offerDecision(s, ctx, 'club_invite', 'p1');
    s.players.p1.character.needs.leisure = 30;
    const card = priv ?? offerDecision(s, ctx, 'club_invite', 'p1')!;
    expect(card.playerId).toBe('p1');
    expect(applyCommand(s, ctx, 'p2', { type: 'decide', decisionId: card.id, optionId: 'join' }).ok).toBe(false);
    expect(applyCommand(s, ctx, 'p1', { type: 'decide', decisionId: card.id, optionId: 'join' }).ok).toBe(true);
    expect(s.players.p1.character.hobby).toBeDefined();
  });

  it('mit Fokus Firma entscheidet das Spiel private Karten sofort', () => {
    const s = newGame();
    const c = s.players.p1.character;
    c.autopilot = true;
    c.needs.leisure = 20;
    expect(offerDecision(s, ctx, 'club_invite', 'p1')).toBeNull();
    expect(s.decisions).toHaveLength(0);
    expect(c.hobby).toBeDefined();
  });

  it('im Spielverlauf entstehen Karten, aber nie mehr als drei Firmenkarten gleichzeitig', () => {
    const s = newGame(7);
    for (const d of Object.values(s.drivers)) d.hired -= 90 * MIN_PER_DAY;
    let seen = 0;
    for (let day = 0; day < 120; day++) {
      dailyDecisions(s, ctx);
      seen = Math.max(seen, s.decisions.filter((d) => d.category !== 'private').length);
      s.time += MIN_PER_DAY;
      hourlyDecisions(s, ctx);
    }
    expect(seen).toBeGreaterThan(0);
    expect(seen).toBeLessThanOrEqual(3);
    expect(s.events.history.some((e) => e.rule.startsWith('dec:'))).toBe(true);
  });

  it('neue Karten halten das Einzelspiel an; nach der letzten Wahl läuft es weiter', () => {
    const s = newGame();
    s.paused = false;
    const d = first(s.drivers);
    d.hired = s.time - 60 * MIN_PER_DAY;
    d.satisfaction = 55;
    const a = offerDecision(s, ctx, 'driver_raise')!;
    expect(s.paused).toBe(true);
    expect(s.pausedForDecision).toBe(true);
    const b = offerDecision(s, ctx, 'press')!;
    applyCommand(s, ctx, 'p1', { type: 'decide', decisionId: a.id, optionId: 'refuse' });
    // noch eine Karte offen: weiter angehalten
    expect(s.paused).toBe(true);
    applyCommand(s, ctx, 'p1', { type: 'decide', decisionId: b.id, optionId: 'no' });
    expect(s.paused).toBe(false);
    expect(s.pausedForDecision).toBe(false);
  });

  it('wer selbst pausiert oder fortsetzt, übernimmt; abschaltbar und im Multiplayer standardmäßig aus', () => {
    const s = newGame();
    // schon pausiert: kein automatisches Fortsetzen nach der Wahl
    const c = offerDecision(s, ctx, 'press')!;
    expect(s.pausedForDecision).toBeFalsy();
    applyCommand(s, ctx, 'p1', { type: 'decide', decisionId: c.id, optionId: 'no' });
    expect(s.paused).toBe(true);
    // manuell weiterspielen hebt die automatische Fortsetzung auf
    s.paused = false;
    offerDecision(s, ctx, 'press');
    applyCommand(s, ctx, 'p1', { type: 'setPaused', paused: false });
    expect(s.pausedForDecision).toBe(false);
    // abgeschaltet
    applyCommand(s, ctx, 'p1', { type: 'setPauseOnDecision', on: false });
    s.decisions = [];
    offerDecision(s, ctx, 'press');
    expect(s.paused).toBe(false);
    // Multiplayer ohne Einstellung: kein Anhalten
    const m = newGame();
    addPlayer(m, { id: 'p2', name: 'Kim' });
    m.paused = false;
    offerDecision(m, ctx, 'press');
    expect(m.paused).toBe(false);
  });
});

describe('Ausschreibungen (0.14.0)', () => {
  function withTender(seed = 3) {
    const s = newGame(seed);
    let t = null;
    for (let i = 0; i < 30 && !t; i++) t = generateTender(s, ctx);
    expect(t).toBeTruthy();
    return { s, t: t! };
  }

  it('Gebote nur innerhalb der Preisspanne und mit Flottenkapazität', () => {
    const { s, t } = withTender();
    expect(applyCommand(s, ctx, 'p1', { type: 'bidTender', tenderId: t.id, price: t.referencePrice * (BID_RANGE[0] - 0.1) }).ok).toBe(false);
    expect(applyCommand(s, ctx, 'p1', { type: 'bidTender', tenderId: t.id, price: t.referencePrice * (BID_RANGE[1] + 0.1) }).ok).toBe(false);
    expect(applyCommand(s, ctx, 'p1', { type: 'bidTender', tenderId: t.id, price: t.referencePrice, guarantee: true }).ok).toBe(true);
    expect(t.bid).toMatchObject({ price: t.referencePrice, guarantee: true });
    expect(applyCommand(s, ctx, 'p1', { type: 'withdrawBid', tenderId: t.id }).ok).toBe(true);
    expect(t.bid).toBeUndefined();
  });

  it('ein günstiges Gebot gewinnt und wird zum laufenden Rahmenvertrag', () => {
    const { s, t } = withTender();
    applyCommand(s, ctx, 'p1', { type: 'bidTender', tenderId: t.id, price: Math.ceil((t.referencePrice * 0.62) / 100) * 100 });
    s.time = t.deadline;
    hourlyTenders(s, ctx);
    expect(t.status).toBe('won');
    const k = Object.values(s.contracts).find((c) => c.status === 'active' && c.fromCityId === t.fromCityId && c.toCityId === t.toCityId)!;
    expect(k).toBeTruthy();
    expect(k.paymentPerTour).toBe(t.bid!.price);
    expect(k.weeks).toBe(t.weeks);
    expect(t.result!.bids.length).toBeGreaterThanOrEqual(2);
  });

  it('ein teures Gebot verliert; das Ergebnis nennt Gewinner und Preise', () => {
    const { s, t } = withTender();
    applyCommand(s, ctx, 'p1', { type: 'bidTender', tenderId: t.id, price: Math.floor((t.referencePrice * 1.45) / 100) * 100 });
    s.time = t.deadline;
    hourlyTenders(s, ctx);
    expect(t.status).toBe('lost');
    expect(t.result!.winner).not.toBe(s.company.name);
    expect(t.result!.bids.some((b) => b.player)).toBe(true);
    expect(t.result!.price).toBeLessThan(t.bid!.price);
  });

  it('Ruf und Garantie verbessern die Bewertung', () => {
    expect(bidScore(1000_00, 75)).toBeLessThan(bidScore(1000_00, 50));
    expect(bidScore(1000_00, 50, true)).toBeLessThan(bidScore(1000_00, 50));
    // 10 % teurer, aber mit deutlich besserem Ruf und Garantie fast gleichauf
    expect(bidScore(1100_00, 80, true) / bidScore(1000_00, 40)).toBeLessThan(1);
  });

  it('erst ab zwei Fahrzeugen werden Ausschreibungen von selbst angelegt; alte Spielstände bekommen die neuen Felder', () => {
    const s = newGame();
    for (let i = 0; i < 40; i++) dailyTenders(s, ctx);
    expect(Object.keys(s.tenders)).toHaveLength(0);
    const old = JSON.parse(JSON.stringify(s));
    delete old.decisions;
    delete old.tenders;
    const text = serializeSave(old, 'alt').replace(`"version":${STATE_VERSION}`, '"version":9');
    const loaded = deserializeSave(text);
    expect(loaded.decisions).toEqual([]);
    expect(loaded.tenders).toEqual({});
    tickMinutes(loaded, ctx, 2 * MIN_PER_DAY);
  });
});
