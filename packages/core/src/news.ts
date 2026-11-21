// Branchenblatt: jeden Montag eine Ausgabe mit Konjunktur, Dieselpreis, Konkurrenz, Wetter, Saison und
// der Woche der eigenen Firma. Reine Lektüre – die Zahlen kommen aus dem laufenden Spiel.

import { CITY_BY_ID } from './data/cities.ts';
import { COUNTRY_NAMES } from './data/catalog.ts';
import { STRATEGY_LABEL, activeCompetitors } from './competition.ts';
import { PHASE_LABEL, SEASONAL_DEMAND } from './economy.ts';
import { formatMoney } from './finance.ts';
import { acquisitionOffer } from './partners.ts';
import { rand } from './rng.ts';
import { MIN_PER_DAY, MONTH_NAMES, dayIndex, holidayName, month, weekday } from './time.ts';
import { WEATHER } from './world.ts';
import type { GameState, GameTime, Id, Money } from './types.ts';
import { companyIdOf, companyViews, isMultiCompany, worldOf } from './shard.ts';
import { ranking } from './ranking.ts';

/** andere aktive Spielerfirmen (Wettbewerbswelt; sonst leer) */
const otherPlayers = (state: GameState) =>
  isMultiCompany(state) ? companyViews(worldOf(state)).filter((v) => !v.exit && companyIdOf(v) !== companyIdOf(state)) : [];
/** Flotten aller Mitbewerber am Markt: KI und andere Spielerfirmen */
const marketFleets = (state: GameState) => [...activeCompetitors(state).map((c) => c.trucks), ...otherPlayers(state).map((v) => Object.keys(v.vehicles).length)];

export type NewsTone = 'good' | 'bad' | 'neutral';
export type NewsKind = 'market' | 'diesel' | 'rivals' | 'weather' | 'season' | 'company' | 'driver';

export interface NewsItem {
  kind: NewsKind;
  title: string;
  text: string;
  tone: NewsTone;
  /** Gewicht für die Schlagzeile */
  weight: number;
  /** zweiter Absatz, wenn der Artikel Aufmacher wird */
  more?: string;
}

/** Kennzahlen der Ausgabe (Marktdaten-Kasten und Kopfleiste) */
export interface NewsFigures {
  diesel: number;
  dieselChange: number;
  /** Konjunktur 0,75–1,25 */
  cycle: number;
  phase: string;
  /** Platz nach Flottengröße */
  rank: number;
  companies: number;
  fleet: number;
  deliveries: number;
  revenue: Money;
  balance: Money;
  /** größter Konkurrent */
  leader?: { name: string; trucks: number };
}

export interface NewsIssue {
  id: Id;
  t: GameTime;
  /** laufende Nummer */
  no: number;
  headline: string;
  items: NewsItem[];
  figures?: NewsFigures;
}

/** Stand zur letzten Ausgabe (für Wochenvergleiche) */
export interface NewsBase {
  t: GameTime;
  deliveries: number;
  revenue: Money;
  diesel: number;
  trucks: Record<Id, number>;
  driverKm: Record<Id, number>;
}

export interface NewsState {
  issues: NewsIssue[];
  base?: NewsBase;
  /** Ausgaben insgesamt */
  count: number;
}

export const NEWS_KEEP = 12;
export const NEWS_NAME = 'Branchenblatt';

export const defaultNews = (): NewsState => ({ issues: [], count: 0 });

function snapshot(state: GameState): NewsBase {
  return {
    t: state.time,
    deliveries: state.company.totals.deliveries + (state.company.totals.subcontracted ?? 0),
    revenue: state.company.totals.revenue,
    diesel: state.market.diesel,
    trucks: Object.fromEntries(Object.values(state.competitors).map((c) => [c.id, c.trucks])),
    driverKm: Object.fromEntries(Object.values(state.drivers).map((d) => [d.id, d.kmDriven])),
  };
}

const pct = (x: number) => `${x > 0 ? '+' : ''}${(x * 100).toFixed(1).replace('.', ',')} %`;
const city = (id: string) => CITY_BY_ID[id]?.name ?? id;
const country = (iso: string) => COUNTRY_NAMES[iso] ?? iso;

/** Inhalt einer Ausgabe aus dem aktuellen Spielstand */
export function composeIssue(state: GameState): NewsItem[] {
  const base = state.news?.base;
  const since = base?.t ?? state.time - 7 * MIN_PER_DAY;
  const items: NewsItem[] = [];
  const e = state.economy;

  // Konjunktur
  if (e) {
    const cyc = Math.round((e.cycle - 1) * 100);
    const changed = e.lastPhaseChange >= since;
    items.push({
      kind: 'market',
      title: changed ? `${PHASE_LABEL[e.phase]} erreicht die Branche` : `Konjunktur: ${PHASE_LABEL[e.phase]}`,
      text: e.phase === 'boom'
        ? `Die Verlader melden volle Lager. Das Frachtaufkommen liegt ${cyc} % über dem Normalwert, gute Zeit für Rahmenverträge und zusätzliche LKW.`
        : e.phase === 'crisis'
          ? `Weniger Aufträge (${cyc} %), und viele Kunden zahlen schleppender. Liquidität geht jetzt vor Wachstum – Factoring und vorsichtige Investitionen helfen.`
          : `Das Frachtaufkommen bewegt sich ${cyc === 0 ? 'auf Normalniveau' : `${cyc > 0 ? 'leicht über' : 'leicht unter'} dem Normalwert (${cyc > 0 ? '+' : ''}${cyc} %)`}.`,
      tone: e.phase === 'boom' ? 'good' : e.phase === 'crisis' ? 'bad' : 'neutral',
      weight: changed ? 9 : 1,
      more: e.phase === 'boom'
        ? 'Branchenkenner rechnen damit, dass die gute Lage einige Monate anhält. Wer jetzt Fahrer findet, kann wachsen – erfahrene Kräfte sind allerdings gefragt und werden teurer.'
        : e.phase === 'crisis'
          ? 'Die Banken prüfen Kreditanträge strenger, und erste Speditionen verkleinern ihre Flotten. Wer Reserven hat, findet in solchen Zeiten günstige Gebrauchtfahrzeuge und angeschlagene Konkurrenten.'
          : 'Größere Ausschläge erwarten die Verbände vorerst nicht. Die Saison und regionale Ereignisse bestimmen, wo die Fracht liegt.',
    });
    // stärkste Region mit Grund
    const regions = Object.entries(e.regions ?? {}).filter(([, r]) => r.reason).sort((a, b) => Math.abs(b[1].factor - 1) - Math.abs(a[1].factor - 1));
    const [iso, r] = regions[0] ?? [];
    if (iso && r) {
      items.push({
        kind: 'market', title: `${country(iso)}: ${r.reason}`,
        text: `Die Nachfrage in ${country(iso)} liegt bei ${Math.round(r.factor * 100)} % des Normalwerts${r.until ? `, voraussichtlich noch ${Math.max(1, Math.round((r.until - state.time) / MIN_PER_DAY))} Tage` : ''}.`,
        tone: r.factor >= 1 ? 'good' : 'bad', weight: Math.abs(r.factor - 1) > 0.15 ? 5 : 2,
        more: r.factor >= 1
          ? `Verlader in ${country(iso)} suchen händeringend Laderaum. Disponenten raten, Touren dorthin mit Rückladungen zu verbinden – die Börse ist dort voller als sonst.`
          : `In ${country(iso)} bleibt Laderaum ungenutzt. Leerfahrten dorthin lohnen sich derzeit kaum, Rückladungen sind knapp.`,
      });
    }
  }

  // Diesel
  const d = state.market.diesel;
  const prev = base?.diesel ?? state.market.dieselHistory?.find((h) => h.t >= since)?.v ?? d;
  const dd = prev ? d / prev - 1 : 0;
  items.push({
    kind: 'diesel',
    title: Math.abs(dd) < 0.01 ? 'Dieselpreis stabil' : dd > 0 ? 'Diesel wird teurer' : 'Diesel wird günstiger',
    text: `Netto ${(d / 100).toFixed(2).replace('.', ',')} € je Liter (${pct(dd)} zur Vorwoche).${dd > 0.03 ? ' Tanken an der eigenen Tankstelle und sparsame Fahrer zahlen sich jetzt aus.' : dd < -0.03 ? ' Wer jetzt Rahmenverträge zu festen Preisen abschließt, sichert sich die Marge.' : ''}`,
    tone: dd > 0.01 ? 'bad' : dd < -0.01 ? 'good' : 'neutral',
    weight: Math.abs(dd) > 0.04 ? 6 : 1,
    more: dd > 0 ? 'Der Kraftstoff ist der größte Kostenblock im Fernverkehr. Viele Unternehmer prüfen jetzt ihre Touren auf Leerkilometer und schicken Fahrer zum Spritspartraining.' : 'Für die Branche ist das eine Atempause. Die Margen auf langen Touren verbessern sich spürbar.',
  });

  // Konkurrenz
  for (const c of Object.values(state.competitors)) {
    if (c.bankruptAt !== undefined && c.bankruptAt >= since) {
      items.push({ kind: 'rivals', title: `Konkurs: ${c.name}`, text: `Die Spedition aus ${city(c.hqCityId)} hat den Betrieb eingestellt. Ihre Kunden suchen neue Partner – jetzt ist die Zeit für Vertriebsbesuche.`, tone: 'good', weight: 8, more: `Nach Informationen des ${NEWS_NAME}s hatten die Gläubiger zuletzt keine Geduld mehr. Die Fahrzeuge kommen in den Gebrauchtmarkt, die Fahrer suchen neue Arbeitgeber.` });
    } else if (c.acquiredAt !== undefined && c.acquiredAt >= since) {
      const buyer = c.acquiredBy ? (companyViews(worldOf(state)).find((v) => companyIdOf(v) === c.acquiredBy)?.company.name ?? state.company.name) : state.company.name;
      const mine = buyer === state.company.name;
      items.push({ kind: 'rivals', title: `${buyer} übernimmt ${c.name}`, text: `Mit der Übernahme wächst ${buyer} in ${city(c.hqCityId)}. Branchenkenner sprechen von einem klugen Schachzug.`, tone: mine ? 'good' : 'bad', weight: 10, more: `Fahrzeuge, Hof und ein Teil der Belegschaft wechseln den Besitzer. Die Kunden des Übernommenen werden künftig von ${buyer} bedient.` });
    } else if (c.founded >= since && c.status !== 'acquired') {
      items.push({ kind: 'rivals', title: `Neu am Markt: ${c.name}`, text: `${STRATEGY_LABEL[c.strategy]} aus ${city(c.hqCityId)} startet mit ${c.trucks} LKW.`, tone: 'bad', weight: 4 });
    } else if (c.status === 'trouble') {
      const offer = acquisitionOffer(state, c);
      items.push({ kind: 'rivals', title: `${c.name} unter Druck`, text: `Die Spedition aus ${city(c.hqCityId)} verkauft LKW und senkt die Preise.${offer ? ` Gerüchten zufolge wäre der Inhaber bereit zu verkaufen – im Gespräch sind rund ${formatMoney(offer.price)}.` : ''}`, tone: 'neutral', weight: 5, more: 'Mitarbeiter berichten von verschobenen Wartungen und unbezahlten Rechnungen. Ob ein Käufer gefunden wird oder die Spedition aufgibt, dürfte sich in den nächsten Wochen entscheiden.' });
    } else if (base?.trucks[c.id] !== undefined && c.trucks > base.trucks[c.id]) {
      items.push({ kind: 'rivals', title: `${c.name} wächst`, text: `${c.trucks - base.trucks[c.id]} neue LKW in ${city(c.hqCityId)}, die Flotte zählt jetzt ${c.trucks} Fahrzeuge.`, tone: 'bad', weight: 2 });
    }
  }

  // Wettbewerbswelt: Rangliste und neue Spielerfirmen
  if (isMultiCompany(state)) {
    const rk = ranking(state);
    const pos = rk.findIndex((r) => r.own) + 1;
    const lead = rk[0];
    if (lead && pos > 0) {
      items.push({
        kind: 'rivals',
        title: pos === 1 ? `${state.company.name} führt die Rangliste an` : `Rangliste: ${lead.name} vorn`,
        text: `Nach Firmenwert liegt ${lead.name} mit ${formatMoney(lead.value)} vorn. ${state.company.name} steht auf Platz ${pos} von ${rk.length}.`,
        tone: pos === 1 ? 'good' : 'neutral',
        weight: 3,
      });
    }
    for (const v of otherPlayers(state)) {
      if (v.company.founded >= since) items.push({ kind: 'rivals', title: `Neu am Markt: ${v.company.name}`, text: `Eine neue Spedition aus ${city(v.company.hqCityId)} tritt an – mit eigenem Team und ${Object.keys(v.vehicles).length} LKW.`, tone: 'bad', weight: 5 });
    }
  }

  // Wetter: Unwetterlagen
  const severe = Object.entries(state.weather ?? {}).filter(([, w]) => ['snow', 'ice', 'storm', 'heat'].includes(w.kind));
  if (severe.length) {
    const list = severe.slice(0, 3).map(([iso, w]) => `${WEATHER[w.kind].name} in ${country(iso)}`).join(', ');
    items.push({ kind: 'weather', title: 'Wetterwarnung', text: `${list}${severe.length > 3 ? ` und ${severe.length - 3} weiteren Ländern` : ''}.${severe.some(([, w]) => w.kind !== 'heat') ? ' Mehr Puffer für die Lieferfristen einplanen.' : ''}${severe.some(([, w]) => w.kind === 'heat') ? ' Kühlware braucht bei Hitze besondere Aufmerksamkeit.' : ''}`, tone: 'bad', weight: 3 });
  }

  // Saison und Feiertage der kommenden Woche
  const m = month(state.time);
  const next = (m + 1) % 12;
  const ds = SEASONAL_DEMAND[next] - SEASONAL_DEMAND[m];
  if (Math.abs(ds) >= 0.02) {
    items.push({
      kind: 'season', title: ds > 0 ? `Ausblick ${MONTH_NAMES[next]}: mehr Fracht` : `Ausblick ${MONTH_NAMES[next]}: ruhigere Wochen`,
      text: ds > 0 ? `Saisonal steigt das Frachtaufkommen im ${MONTH_NAMES[next]} um etwa ${Math.round(ds * 100)} %. Wer jetzt Kapazität aufbaut, ist vorne dabei.` : `Im ${MONTH_NAMES[next]} sinkt das Aufkommen saisonal um etwa ${Math.round(-ds * 100)} %. Gute Zeit für Wartung, Urlaub und Schulungen.`,
      tone: ds > 0 ? 'good' : 'neutral', weight: 2,
      more: ds > 0 ? 'Handel und Industrie füllen ihre Lager auf. Erfahrungsgemäß ziehen die Frachtraten mit an.' : 'Viele Betriebe nutzen die ruhigere Zeit, um Fahrzeuge in die Werkstatt zu bringen.',
    });
  }
  const holidays: string[] = [];
  for (let i = 0; i < 7; i++) {
    const h = holidayName(state.time + i * MIN_PER_DAY + 12 * 60);
    if (h && !holidays.includes(h)) holidays.push(h);
  }
  if (holidays.length) items.push({ kind: 'season', title: 'Feiertage diese Woche', text: `${holidays.join(', ')}: weniger Aufträge, an manchen Orten gelten Fahrverbote.`, tone: 'neutral', weight: 2 });

  // eigene Firma
  if (base) {
    const del = state.company.totals.deliveries + (state.company.totals.subcontracted ?? 0) - base.deliveries;
    const rev = state.company.totals.revenue - base.revenue;
    const fleets = marketFleets(state);
    const fleet = Object.keys(state.vehicles).length;
    const rank = 1 + fleets.filter((n) => n > fleet).length;
    items.push({
      kind: 'company', title: `${state.company.name}: Die Woche in Zahlen`,
      text: `${del} ${del === 1 ? 'Lieferung' : 'Lieferungen'}, ${formatMoney(rev)} Umsatz. Mit ${fleet} ${fleet === 1 ? 'Fahrzeug' : 'Fahrzeugen'} Platz ${rank} von ${fleets.length + 1} im Markt nach Flottengröße.`,
      tone: del > 0 ? 'good' : 'neutral', weight: 1,
    });
    // Fahrer der Woche
    const best = Object.values(state.drivers)
      .map((dr) => ({ dr, km: dr.kmDriven - (base.driverKm[dr.id] ?? dr.kmDriven) }))
      .filter((x) => x.km > 200)
      .sort((a, b) => b.km - a.km)[0];
    if (best && Object.keys(state.drivers).length > 1) {
      const lines = [
        `Mit ${Math.round(best.km).toLocaleString('de-DE')} km war ${best.dr.name} die ganze Woche auf Achse.`,
        `${best.dr.name} fuhr ${Math.round(best.km).toLocaleString('de-DE')} km – Kollegen sagen, der Kaffee im Fahrerhaus ist legendär.`,
        `${Math.round(best.km).toLocaleString('de-DE')} km für ${state.company.name}: ${best.dr.name} führt die Kilometerwertung der Woche an.`,
      ];
      items.push({ kind: 'driver', title: 'Auf Achse: Fahrer der Woche', text: rand.pick(state, lines), tone: 'good', weight: 1 });
    }
  }
  return items;
}

/** Marktdaten der Ausgabe */
export function issueFigures(state: GameState): NewsFigures {
  const base = state.news?.base;
  const rivals = activeCompetitors(state);
  const fleet = Object.keys(state.vehicles).length;
  const leader = [...rivals].sort((a, b) => b.trucks - a.trucks)[0];
  const d = state.market.diesel;
  return {
    diesel: d,
    dieselChange: base?.diesel ? d / base.diesel - 1 : 0,
    cycle: state.economy?.cycle ?? 1,
    phase: PHASE_LABEL[state.economy?.phase ?? 'normal'],
    rank: 1 + marketFleets(state).filter((n) => n > fleet).length,
    companies: marketFleets(state).length + 1,
    fleet,
    deliveries: base ? state.company.totals.deliveries + (state.company.totals.subcontracted ?? 0) - base.deliveries : 0,
    revenue: base ? state.company.totals.revenue - base.revenue : 0,
    balance: state.company.account.balance,
    leader: leader ? { name: leader.name, trucks: leader.trucks } : undefined,
  };
}

/** Montags 0 Uhr: neue Ausgabe (nach dem Tageswechsel aufgerufen) */
export function dailyNews(state: GameState): void {
  state.news ??= defaultNews();
  if (weekday(state.time) !== 0 || dayIndex(state.time) === dayIndex(state.company.founded)) {
    state.news.base ??= snapshot(state);
    return;
  }
  const n = state.news;
  // dieselbe Schlagzeile wie letzte Woche rückt nach hinten
  const last = n.issues[0]?.headline;
  const items = composeIssue(state).map((it) => (it.title === last ? { ...it, weight: 0 } : it)).sort((a, b) => b.weight - a.weight);
  n.count++;
  n.issues.unshift({ id: `news${n.count}`, t: state.time, no: n.count, headline: items[0]?.title ?? 'Ruhige Woche in der Branche', items, figures: issueFigures(state) });
  if (n.issues.length > NEWS_KEEP) n.issues.length = NEWS_KEEP;
  n.base = snapshot(state);
}
