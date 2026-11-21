// Karriere-Kampagne (Paket E, Schritt E4): geführtes Einzelspiel in fünf Kapiteln.
// Jedes Kapitel hat eine kurze Geschichte, 3–4 Ziele und eine Frist; der Abschluss vergibt Sterne nach benötigter Zeit.
// Systeme werden Kapitel für Kapitel freigeschaltet. Eine Mentorin gibt Tipps, ein Rivale wächst mit.
// Alle Personen und Firmen sind erfunden.

import { deptCount } from './company.ts';
import type { SimContext } from './context.ts';
import { generateContractOffer } from './contracts.ts';
import { CITY_BY_ID } from './data/cities.ts';
import { addLog } from './finance.ts';
import { haversineKm } from './geo.ts';
import { ranking } from './ranking.ts';
import { newId } from './rng.ts';
import { MIN_PER_DAY, formatDate } from './time.ts';
import type { CampaignMessage, CampaignState, GameState, Id } from './types.ts';

export const MENTOR = { name: 'Margarete Holm', role: 'frühere Inhaberin der Spedition Holm' };
export const RIVAL_OWNER = 'Viktor Krämer';
export const RIVAL_COMPANY = 'Krämer & Söhne Transporte';

/** Systeme, die die Kampagne nach und nach freischaltet */
export type CampaignFeature = 'tenders' | 'autodispatch' | 'abroad' | 'warehouse' | 'containers';
export const FEATURE_CHAPTER: Record<CampaignFeature, number> = { tenders: 2, autodispatch: 2, abroad: 3, warehouse: 4, containers: 4 };
export const FEATURE_LABEL: Record<CampaignFeature, string> = {
  tenders: 'Ausschreibungen',
  autodispatch: 'KI-Disposition',
  abroad: 'Niederlassungen im Ausland',
  warehouse: 'Lagerhallen',
  containers: 'Containerverkehr',
};

export interface CampaignGoalStatus {
  id: string;
  label: string;
  have: string;
  need: string;
  share: number;
  met: boolean;
}

interface GoalDef {
  id: string;
  label: string;
  /** Fortschritt 0–1 und Anzeige */
  check(state: GameState, c: CampaignState): { share: number; have: string; need: string };
  /** Tipp der Mentorin, wenn das Ziel noch fehlt */
  tip: string;
}

export interface ChapterDef {
  n: number;
  title: string;
  /** Frist in Tagen */
  days: number;
  intro: string;
  rival: string;
  done: string;
  goals: GoalDef[];
}

const vehicles = (s: GameState) => Object.keys(s.vehicles).length;
const share = (v: number, of: number) => Math.max(0, Math.min(1, of ? v / of : 0));
const fmt = (v: number) => Math.round(v).toLocaleString('de-DE');

/** Anteil des Umsatzes aus grenzüberschreitenden Fahrten in den letzten 30 Tagen */
export function foreignShare(state: GameState): number {
  const recs = (state.tripRecords ?? []).filter((r) => r.t >= state.time - 30 * MIN_PER_DAY);
  const total = recs.reduce((a, r) => a + r.revenue, 0);
  if (recs.length < 3 || total <= 0) return 0;
  const foreign = recs.filter((r) => CITY_BY_ID[r.fromCityId]?.country !== CITY_BY_ID[r.toCityId]?.country).reduce((a, r) => a + r.revenue, 0);
  return foreign / total;
}

export const CHAPTERS: ChapterDef[] = [
  {
    n: 1,
    title: 'Ein LKW, ein Traum',
    days: 120,
    intro: 'Ein gebrauchter Sattelzug, ein Fahrer, ein kleines Büro – und ein Kontoauszug, der nervös macht. Jetzt zählt jede Tour. Liefere zuverlässig, halte die Kasse im Blick und hol dir den zweiten LKW auf den Hof.',
    rival: 'Na, auch im Geschäft? Ich fahre hier seit zwanzig Jahren. Viel Glück – du wirst es brauchen.',
    done: 'Der zweite LKW steht auf dem Hof und das Konto ist im Plus. Aus dem Traum ist eine Firma geworden.',
    goals: [
      { id: 'deliveries15', label: '15 Lieferungen', tip: 'Nimm Aufträge in der Nähe deines Standorts, die gut bezahlt sind. Leerfahrten kosten nur.', check: (s, c) => ({ share: share(s.company.totals.deliveries - (c.base.deliveries ?? 0), 15), have: fmt(s.company.totals.deliveries - (c.base.deliveries ?? 0)), need: '15' }) },
      { id: 'second', label: 'Zweiter LKW', tip: 'Ein zweiter LKW muss nicht neu sein. Gebrauchte Fahrzeuge oder Leasing schonen das Konto.', check: (s) => ({ share: share(vehicles(s), 2), have: String(vehicles(s)), need: '2' }) },
      { id: 'positive', label: 'Kontostand positiv', tip: 'Rechnungen kommen erst nach dem Zahlungsziel. Unter Finanzen siehst du, was noch offen ist – und die Auswertung zeigt, welche Touren sich lohnen.', check: (s) => ({ share: s.company.account.balance > 0 ? 1 : 0, have: `${fmt(s.company.account.balance / 100)} €`, need: '> 0 €' }) },
    ],
  },
  {
    n: 2,
    title: 'Stammkunden',
    days: 180,
    intro: 'Laufkundschaft ist schön, aber Stammkunden zahlen die Miete. Gewinne feste Verträge, pflege deinen Ruf und hol dir einen Disponenten, damit du nicht jede Tour selbst planen musst. Ausschreibungen und die KI-Disposition stehen dir jetzt offen.',
    rival: 'Rahmenverträge? Die Kunden hier kennen mich. Aber versuch’s ruhig – in der nächsten Ausschreibung sehen wir uns.',
    done: 'Feste Kunden, ein guter Ruf und ein Disponent: Die Firma läuft jetzt auch, wenn du mal nicht am Telefon bist.',
    goals: [
      { id: 'contracts2', label: '2 Rahmenverträge', tip: 'Zufriedene Kunden bieten Rahmenverträge an (Kunden & Verträge). Ausschreibungen gewinnst du mit gutem Preis und gutem Ruf.', check: (s, c) => { const n = Object.values(s.contracts).filter((k) => (k.status === 'active' || k.status === 'completed') && (k.start ?? 0) >= c.chapterStart).length; return { share: share(n, 2), have: String(n), need: '2' }; } },
      { id: 'rep60', label: 'Ruf 60', tip: 'Pünktlichkeit bringt Ruf, Verspätungen kosten ihn. Plane Puffer ein und lass Fahrzeuge rechtzeitig warten.', check: (s) => ({ share: share(s.company.reputation, 60), have: fmt(s.company.reputation), need: '60' }) },
      { id: 'dispatcher', label: 'Erster Disponent', tip: 'Unter Standorte & Ausbau stellst du einen Disponenten ein. Er kann Touren vorschlagen oder selbst planen.', check: (s) => ({ share: deptCount(s, 'dispatch') >= 1 ? 1 : 0, have: String(deptCount(s, 'dispatch', false)), need: '1' }) },
    ],
  },
  {
    n: 3,
    title: 'Über die Grenze',
    days: 240,
    intro: 'Europa wartet hinter der nächsten Grenze. Eröffne eine Niederlassung im Ausland, fahre mehr internationale Touren und bring die Flotte auf zehn LKW. Niederlassungen im Ausland sind jetzt möglich.',
    rival: 'Ausland? Maut, Fahrverbote, Zoll – das frisst dich auf. Ich bleibe lieber daheim und nehme dir hier die Kunden ab.',
    done: 'Mit einer Niederlassung jenseits der Grenze und zehn LKW spielst du jetzt europäisch mit.',
    goals: [
      { id: 'abroad', label: 'Niederlassung im Ausland', tip: 'Eine Niederlassung in einer großen Stadt im Nachbarland bringt Bewerber, Stellplätze und Aufträge aus der Region.', check: (s) => { const home = CITY_BY_ID[s.company.hqCityId]?.country; const ok = s.company.locations.some((l) => CITY_BY_ID[l.cityId]?.country !== home); return { share: ok ? 1 : 0, have: ok ? 'ja' : 'nein', need: 'ja' }; } },
      { id: 'foreign30', label: '30 % Auslandsumsatz (30 Tage)', tip: 'Grenzüberschreitende Touren zählen. Die Auswertung zeigt unter „Strecken“, welche Relationen sich lohnen.', check: (s) => { const f = foreignShare(s); return { share: share(f, 0.3), have: `${Math.round(f * 100)} %`, need: '30 %' }; } },
      { id: 'fleet10', label: '10 LKW', tip: 'Wachse in Schritten: Erst wenn Fahrer und Stellplätze da sind, lohnt der nächste LKW.', check: (s) => ({ share: share(vehicles(s), 10), have: String(vehicles(s)), need: '10' }) },
    ],
  },
  {
    n: 4,
    title: 'Logistikdienstleister',
    days: 300,
    intro: 'Transport allein reicht nicht mehr. Große Kunden wollen alles aus einer Hand: Lager, Umschlag, Container. Lagerhallen und der Containerverkehr an den Häfen sind jetzt freigeschaltet.',
    rival: 'Lagerhallen und Containerterminals – du übernimmst dich. Ich warte geduldig.',
    done: 'Lager und Container laufen: Aus der Spedition ist ein Logistikdienstleister geworden.',
    goals: [
      { id: 'storage2', label: 'Lagerhalle mit 2 Lagerverträgen', tip: 'Eine Lagerhalle gibt es ab Unternehmensstufe 3 an einem Standort mit Betriebshof. Danach kommen Angebote für Lagerverträge.', check: (s) => { const n = Object.values(s.storageContracts ?? {}).filter((k) => k.status === 'active').length; return { share: share(n, 2), have: String(n), need: '2' }; } },
      { id: 'containers40', label: '40 Container-Touren', tip: 'Ein Containerchassis brauchst du für Seecontainer. Leerrückgaben und Gestellungen zählen mit – und ein Street-Turn spart Leerfahrten.', check: (s, c) => ({ share: share(c.counts.containers ?? 0, 40), have: String(c.counts.containers ?? 0), need: '40' }) },
    ],
  },
  {
    n: 5,
    title: 'Marktführer',
    days: 540,
    intro: 'Ganz oben ist die Luft dünn. Werde die wertvollste Spedition im Markt und erreiche die höchste Unternehmensstufe. Und Viktor Krämer? Der denkt angeblich ans Aufhören. Vielleicht verkauft er – an dich.',
    rival: 'Gut, du bist gewachsen. Aber Platz eins? Den musst du mir erst einmal abnehmen.',
    done: 'Platz eins und ein europäischer Logistikkonzern. Margarete Holm hebt das Glas – die Karriere ist geschafft.',
    goals: [
      { id: 'rank1', label: 'Platz 1 der Rangliste', tip: 'Die Rangliste (Markt & Wettbewerb) ordnet nach Firmenwert. Eigene Fahrzeuge, Einrichtungen und ein gesundes Konto zählen – Kredite ziehen ab.', check: (s) => { const r = ranking(s); const pos = r.findIndex((e) => e.own) + 1; return { share: pos === 1 ? 1 : pos > 0 ? 1 / pos : 0, have: pos ? `Platz ${pos}` : '–', need: 'Platz 1' }; } },
      { id: 'level6', label: 'Unternehmensstufe 6', tip: 'Stufe 6 verlangt 50 LKW, 3.000 Lieferungen, Ruf 70, 6 Standorte in 3 Ländern. Eine Übernahme kann Wachstum abkürzen – vielleicht ja die von Krämer.', check: (s) => ({ share: share(s.company.level ?? 1, 6), have: String(s.company.level ?? 1), need: '6' }) },
    ],
  },
];

/** Flottengröße des Rivalen zu Beginn jedes Kapitels */
const RIVAL_TRUCKS = [4, 9, 16, 28, 45];

// ---------------------------------------------------------------- Abfragen

export const inCampaign = (state: GameState) => !!state.campaign && !state.campaign.done;

/** Gesperrtes System in der Kampagne (undefined: frei) */
export function campaignLock(state: GameState, feature: CampaignFeature): string | undefined {
  const c = state.campaign;
  if (!c || c.done || c.chapter >= FEATURE_CHAPTER[feature]) return undefined;
  return `${FEATURE_LABEL[feature]} gibt es in der Karriere ab Kapitel ${FEATURE_CHAPTER[feature]} („${CHAPTERS[FEATURE_CHAPTER[feature] - 1].title}“).`;
}

/** Befehle, die in der Kampagne noch gesperrt sind */
export function campaignCommandLock(state: GameState, cmd: { type: string; [k: string]: unknown }): string | undefined {
  if (!inCampaign(state)) return undefined;
  switch (cmd.type) {
    case 'bidTender':
      return campaignLock(state, 'tenders');
    case 'setAutoDispatch':
      return cmd.mode && cmd.mode !== 'manual' ? campaignLock(state, 'autodispatch') : undefined;
    case 'openBranch': {
      const city = CITY_BY_ID[cmd.cityId as string];
      return city && city.country !== CITY_BY_ID[state.company.hqCityId]?.country ? campaignLock(state, 'abroad') : undefined;
    }
    case 'buildFacility':
      return cmd.facility === 'warehouse' ? campaignLock(state, 'warehouse') : undefined;
    case 'acceptOrder':
    case 'dispatch':
    case 'queueDispatch':
    case 'coLoad': {
      const o = state.orders[cmd.orderId as string];
      return o && (o.container || o.trailerType === 'container') ? campaignLock(state, 'containers') : undefined;
    }
    default:
      return undefined;
  }
}

export function chapterDef(state: GameState): ChapterDef | undefined {
  const c = state.campaign;
  return c && !c.done ? CHAPTERS[c.chapter - 1] : undefined;
}

export function campaignGoals(state: GameState): CampaignGoalStatus[] {
  const c = state.campaign;
  const def = chapterDef(state);
  if (!c || !def) return [];
  return def.goals.map((g) => {
    const r = g.check(state, c);
    const met = c.met.includes(g.id) || r.share >= 1;
    return { id: g.id, label: g.label, have: r.have, need: r.need, share: met ? 1 : r.share, met };
  });
}

/** Sterne nach benötigter Zeit: bis zur halben Frist 3, bis zur Frist 2, danach 1 */
export function starsFor(days: number, deadlineDays: number): number {
  return days <= deadlineDays / 2 ? 3 : days <= deadlineDays ? 2 : 1;
}

export function campaignStars(state: GameState): number {
  return (state.campaign?.results ?? []).reduce((a, r) => a + r.stars, 0);
}

// ---------------------------------------------------------------- Ablauf

function message(state: GameState, from: CampaignMessage['from'], title: string, text: string) {
  const c = state.campaign!;
  c.messages.push({ id: newId(state, 'msg'), from, title, text, t: state.time });
  if (c.messages.length > 40) c.messages.shift();
}

/** Kampagne beim Spielstart einrichten (nach dem Anlegen der Konkurrenz) */
export function startCareer(state: GameState): void {
  state.campaign = { chapter: 1, chapterStart: state.time, deadline: state.time + CHAPTERS[0].days * MIN_PER_DAY, results: [], messages: [], met: [], base: {}, counts: {}, flags: [] };
  // Rivale: die Spedition in der Nähe des Firmensitzes bekommt Namen und Inhaber
  const hq = CITY_BY_ID[state.company.hqCityId];
  const near = Object.values(state.competitors ?? {}).filter((x) => x.status === 'active').sort((a, b) => {
    const da = haversineKm([hq.lon, hq.lat], [CITY_BY_ID[a.hqCityId].lon, CITY_BY_ID[a.hqCityId].lat]);
    const db = haversineKm([hq.lon, hq.lat], [CITY_BY_ID[b.hqCityId].lon, CITY_BY_ID[b.hqCityId].lat]);
    return da - db;
  })[0];
  if (near) {
    near.name = RIVAL_COMPANY;
    near.owner = RIVAL_OWNER;
    near.rival = true;
    near.strategy = 'regional';
    state.campaign.rivalId = near.id;
  }
  beginChapter(state, 1);
}

function beginChapter(state: GameState, n: number) {
  const c = state.campaign!;
  const def = CHAPTERS[n - 1];
  c.chapter = n;
  c.chapterStart = state.time;
  c.deadline = state.time + def.days * MIN_PER_DAY;
  c.met = [];
  c.base = { deliveries: state.company.totals.deliveries };
  c.counts = {};
  c.flags = [];
  const unlocked = (Object.keys(FEATURE_CHAPTER) as CampaignFeature[]).filter((f) => FEATURE_CHAPTER[f] === n).map((f) => FEATURE_LABEL[f]);
  message(state, 'mentor', `Kapitel ${n}: ${def.title}`, `${def.intro}${unlocked.length ? `\n\nNeu freigeschaltet: ${unlocked.join(', ')}.` : ''}\n\nFrist: ${formatDate(c.deadline)}.`);
  const rival = c.rivalId ? state.competitors[c.rivalId] : undefined;
  if (rival && rival.status !== 'bankrupt' && rival.status !== 'acquired') {
    // der Rivale wächst mit der Geschichte
    const target = RIVAL_TRUCKS[n - 1];
    if (rival.trucks < target) {
      rival.trucks = target;
      rival.cash = Math.max(rival.cash, target * 15_000_00);
      if (rival.status === 'trouble') {
        rival.status = 'active';
        delete rival.troubleSince;
      }
    }
    message(state, 'rival', `${RIVAL_OWNER}, ${RIVAL_COMPANY}`, def.rival);
  }
  addLog(state, { level: 'info', category: 'company', text: `Karriere – Kapitel ${n} „${def.title}“ beginnt. Frist bis ${formatDate(c.deadline)}.` });
}

/** Ein Container-Auftrag wurde zugestellt (für Kapitel 4) */
export function onCampaignContainer(state: GameState): void {
  const c = state.campaign;
  if (c && !c.done) c.counts.containers = (c.counts.containers ?? 0) + 1;
}

/** Täglich: Ziele prüfen, Kapitel abschließen, Tipps der Mentorin, feste Ereignisse */
export function dailyCampaign(state: GameState, ctx: SimContext): void {
  const c = state.campaign;
  const def = chapterDef(state);
  if (!c || !def) return;
  // feste Ereignisse: Kapitel 2 beginnt mit einem Vertragsangebot eines Stammkunden
  if (c.chapter === 2 && !c.flags.includes('story-contract')) {
    c.flags.push('story-contract');
    const regular = Object.values(state.customers).filter((cu) => cu.deliveries > 0 && !cu.lostTo).sort((a, b) => b.deliveries - a.deliveries)[0];
    const offer = generateContractOffer(state, ctx, undefined, regular);
    if (offer && regular) message(state, 'mentor', 'Ein Stammkunde ruft an', `${regular.name} war mit deinen Lieferungen zufrieden und bietet dir einen Rahmenvertrag an. Schau unter Kunden & Verträge – so fangen Stammkunden an.`);
  }
  // Ziele (einmal erreicht, bleibt erreicht)
  for (const g of campaignGoals(state)) {
    if (!g.met || c.met.includes(g.id)) continue;
    c.met.push(g.id);
    addLog(state, { level: 'success', category: 'company', text: `Karriere: Ziel „${g.label}“ erreicht.` });
  }
  if (def.goals.every((g) => c.met.includes(g.id))) {
    const days = Math.max(1, Math.ceil((state.time - c.chapterStart) / MIN_PER_DAY));
    const stars = starsFor(days, def.days);
    c.results.push({ chapter: def.n, stars, days });
    state.company.reputation = Math.min(100, state.company.reputation + 3);
    message(state, 'mentor', `Kapitel ${def.n} geschafft – ${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}`, `${def.done} (${days} Tage)`);
    addLog(state, { level: 'success', category: 'company', text: `Karriere: Kapitel ${def.n} „${def.title}“ geschafft in ${days} Tagen – ${stars} ${stars === 1 ? 'Stern' : 'Sterne'}.` });
    if (def.n < CHAPTERS.length) beginChapter(state, def.n + 1);
    else {
      c.done = true;
      c.finishedAt = state.time;
      message(state, 'mentor', 'Die Karriere ist geschafft', `Fünf Kapitel, ${campaignStars(state)} von 15 Sternen. Die Firma gehört dir – spiel frei weiter, so lange du willst.`);
    }
    return;
  }
  // Tipp der Mentorin nach 40 % der Frist für das erste offene Ziel
  const elapsed = (state.time - c.chapterStart) / (def.days * MIN_PER_DAY);
  if (elapsed >= 0.4 && !c.flags.includes('tip')) {
    c.flags.push('tip');
    const open = def.goals.find((g) => !c.met.includes(g.id));
    if (open) message(state, 'mentor', `Ein Tipp zu „${open.label}“`, open.tip);
  }
  if (state.time >= c.deadline && !c.flags.includes('late')) {
    c.flags.push('late');
    message(state, 'mentor', 'Die Frist ist um', `Die Frist für „${def.title}“ ist abgelaufen. Kein Grund aufzugeben – das Kapitel zählt weiter, nur gibt es jetzt höchstens einen Stern.`);
  }
}

/** Kunde wechselt zum Rivalen: Krämer meldet sich (höchstens einmal je Kapitel) */
export function onCampaignCustomerLost(state: GameState, competitorId: Id, customerName: string): void {
  const c = state.campaign;
  if (!c || c.done || competitorId !== c.rivalId || c.flags.includes('poached')) return;
  c.flags.push('poached');
  message(state, 'rival', `${RIVAL_OWNER}, ${RIVAL_COMPANY}`, `${customerName} fährt jetzt mit uns. Pünktlichkeit, mein Freund – die merken sich die Kunden.`);
}

/** Nachrichten als gelesen markieren (ohne id: alle) */
export function readCampaignMessages(state: GameState, id?: Id): void {
  for (const m of state.campaign?.messages ?? []) if (!id || m.id === id) m.read = true;
}

/** Kann der Rivale übernommen werden? Ab Kapitel 5 steht er zum Verkauf. */
export function rivalForSale(state: GameState, competitorId: Id): boolean {
  const c = state.campaign;
  return !!c && competitorId === c.rivalId && (c.chapter >= 5 || !!c.done);
}
