// Entscheidungskarten: Ereignisse, bei denen der Spieler wählt. Jede Karte hat 2–3 Möglichkeiten mit
// nachvollziehbaren Folgen und eine Vorgabe, die nach Ablauf gilt (meist „ablehnen“). Firmenkarten
// sieht jeder mit der passenden Berechtigung, private Karten nur ihr Spieler. Mit „Fokus Firma“
// entscheidet das Spiel private Karten selbst (ausgewogene Wahl).

import type { SimContext } from './context.ts';
import { CITY_BY_ID } from './data/cities.ts';
import { CARGO_BY_ID } from './data/catalog.ts';
import { activeCompetitors } from './competition.ts';
import { generateContractOffer } from './contracts.ts';
import { addLog, adjustSatisfaction, book, formatMoney } from './finance.ts';
import { makeApplicant } from './generate.ts';
import { freshHos } from './hos.ts';
import { isAway } from './life.ts';
import { generateOrder } from './orders.ts';
import { newId, rand } from './rng.ts';
import { MIN_PER_DAY, formatDateTime } from './time.ts';
import type { Decision, DecisionOption, GameState, Id, Permission, Player } from './types.ts';

type Draft = Omit<Decision, 'id' | 'rule' | 'created' | 'expires' | 'category'> & { hours?: number };

interface DecisionRule {
  id: string;
  category: Decision['category'];
  /** Wahrscheinlichkeit je Tag (je Spieler bei privaten Karten) */
  chance: number;
  cooldownDays: number;
  create(state: GameState, ctx: SimContext, p?: Player): Draft | null;
  /** Folge der Wahl; liefert den Text für das Protokoll */
  resolve(state: GameState, ctx: SimContext, d: Decision, option: string): string;
  /** Wahl von „Fokus Firma“ bei privaten Karten */
  auto?: string;
}

/** höchstens so viele offene Karten gleichzeitig (ohne private) */
const MAX_OPEN = 3;
const DEFAULT_HOURS = 30;

const opt = (id: string, label: string, hint: string): DecisionOption => ({ id, label, hint });
const clamp = (v: number) => Math.max(0, Math.min(100, v));
const num = (d: Decision, k: string) => Number(d.data[k]);
const str = (d: Decision, k: string) => String(d.data[k]);

/** Berechtigung für Firmenkarten im Multiplayer */
export const DECISION_PERMISSION: Record<Decision['category'], Permission | null> = { company: 'finance', personnel: 'personnel', market: 'dispatch', private: null };

export const DECISION_RULES: DecisionRule[] = [
  // ---------------------------------------------------------------- Personal
  {
    id: 'driver_raise',
    category: 'personnel',
    chance: 0.08,
    cooldownDays: 12,
    create(state) {
      const pool = Object.values(state.drivers).filter((d) => d.leavesAt === undefined && state.time - d.hired > 45 * MIN_PER_DAY && d.satisfaction < 75);
      const d = rand.weighted(state, pool, (x) => 100 - x.satisfaction + x.experience / 2);
      if (!d) return null;
      const ask = Math.max(100_00, Math.round((d.salary * rand.float(state, 0.07, 0.12)) / 50_00) * 50_00);
      return {
        title: 'Gehaltswunsch',
        text: `${d.name} (Erfahrung ${d.experience}, Zufriedenheit ${Math.round(d.satisfaction)} %) bittet um ${formatMoney(ask)} mehr im Monat. ${d.experience >= 60 ? 'Erfahrene Fahrer finden schnell eine neue Stelle.' : 'Andere Fahrer bekommen mit, wie du entscheidest.'}`,
        options: [
          opt('accept', `Ja, +${formatMoney(ask)}`, `Gehalt ${formatMoney(d.salary + ask)}, Zufriedenheit +18`),
          opt('half', `Kompromiss: +${formatMoney(Math.round(ask / 2))}`, 'Meist zufrieden, manchmal enttäuscht'),
          opt('refuse', 'Ablehnen', d.experience >= 60 ? 'Zufriedenheit −12, Kündigung möglich' : 'Zufriedenheit −12'),
        ],
        defaultOption: 'refuse',
        data: { driverId: d.id, ask },
      };
    },
    resolve(state, _ctx, dec, o) {
      const d = state.drivers[str(dec, 'driverId')];
      if (!d) return 'Der Fahrer ist nicht mehr in der Firma.';
      const ask = num(dec, 'ask');
      if (o === 'accept') {
        d.salary += ask;
        d.satisfaction = clamp(d.satisfaction + 18);
        return `${d.name} bekommt ${formatMoney(ask)} mehr und ist sichtlich zufrieden.`;
      }
      if (o === 'half') {
        d.salary += Math.round(ask / 2);
        if (rand.chance(state, 0.65)) {
          d.satisfaction = clamp(d.satisfaction + 9);
          return `${d.name} nimmt den Kompromiss an (+${formatMoney(Math.round(ask / 2))}).`;
        }
        d.satisfaction = clamp(d.satisfaction - 4);
        return `${d.name} nimmt die ${formatMoney(Math.round(ask / 2))} mit, ist aber enttäuscht.`;
      }
      d.satisfaction = clamp(d.satisfaction - 12);
      if (d.experience >= 60 && rand.chance(state, 0.4)) {
        d.leavesAt = state.time + 14 * MIN_PER_DAY;
        return `${d.name} kündigt nach der Absage (Austritt in 14 Tagen) – ein Gespräch oder mehr Gehalt können das noch abwenden.`;
      }
      return `${d.name} ist enttäuscht, bleibt aber.`;
    },
  },
  {
    id: 'old_colleague',
    category: 'personnel',
    chance: 0.035,
    cooldownDays: 25,
    create(state) {
      if (Object.keys(state.vehicles).length < 2) return null;
      const a = makeApplicant(state, state.company.hqCityId);
      a.experience = rand.int(state, 72, 92);
      a.reliability = rand.int(state, 78, 96);
      a.ecoDriving = rand.int(state, 60, 85);
      if (!a.qualifications.includes('ADR') && rand.chance(state, 0.5)) a.qualifications.push('ADR');
      a.salary = Math.round((a.salary * 1.1) / 1000) * 1000;
      return {
        title: 'Erfahrener Fahrer sucht neue Stelle',
        text: `${a.name}, ein früherer Kollege aus der Branche (${a.age} Jahre, Erfahrung ${a.experience}, zuverlässig ${a.reliability} %${a.qualifications.length ? `, ${a.qualifications.join('/')}` : ''}), möchte zu dir wechseln – für ${formatMoney(a.salary)} im Monat.`,
        options: [
          opt('hire', 'Sofort einstellen', `${formatMoney(a.salary)}/Monat, 350 € Einstellung`),
          opt('later', 'Bewerbung aufheben', '5 Tage in der Bewerberliste'),
          opt('no', 'Kein Bedarf', 'Keine Folgen'),
        ],
        defaultOption: 'later',
        data: { applicant: JSON.stringify(a) },
      };
    },
    resolve(state, _ctx, dec, o) {
      const a = JSON.parse(str(dec, 'applicant'));
      if (o === 'no') return `Absage an ${a.name}.`;
      if (o === 'later') {
        a.expires = state.time + 5 * MIN_PER_DAY;
        state.applicants[a.id] = a;
        return `Die Bewerbung von ${a.name} liegt fünf Tage unter „Fahrer & Personal“.`;
      }
      const id = newId(state, 'drv');
      state.drivers[id] = {
        id, name: a.name, age: a.age, homeCityId: a.homeCityId, cityId: state.company.hqCityId, experience: a.experience, licenses: a.licenses, qualifications: a.qualifications,
        salary: a.salary, reliability: a.reliability, ecoDriving: a.ecoDriving, stressResistance: a.stressResistance, satisfaction: 75, hired: state.time,
        status: 'idle', hos: freshHos(), kmDriven: 0, vacationLeft: 30, lastVacation: state.time, trait: a.trait,
      };
      book(state, 'company', -350_00, 'hiring', `Einstellung ${a.name}`);
      return `${a.name} fängt am Firmensitz an (${formatMoney(a.salary)}/Monat).`;
    },
  },
  // ------------------------------------------------- Fahrergeschichten
  {
    id: 'driver_birthday',
    category: 'personnel',
    chance: 0.07,
    cooldownDays: 14,
    create(state) {
      const pool = Object.values(state.drivers).filter((d) => d.leavesAt === undefined && state.time - d.hired > 20 * MIN_PER_DAY);
      const d = rand.pick(state, pool);
      if (!d) return null;
      return {
        title: 'Geburtstag im Team',
        text: `${d.name} wird heute ${d.age + 1}. Die Kollegen fragen, ob die Firma etwas beisteuert.`,
        options: [opt('gift', 'Geschenk und Kuchen (150 €)', 'Zufriedenheit +10, Team +2'), opt('card', 'Karte vom Chef', 'Zufriedenheit +4'), opt('none', 'Nichts weiter', 'Zufriedenheit −3')],
        defaultOption: 'none',
        hours: 20,
        data: { driverId: d.id },
      };
    },
    resolve(state, _ctx, dec, o) {
      const d = state.drivers[str(dec, 'driverId')];
      if (!d) return 'Der Fahrer ist nicht mehr in der Firma.';
      d.age += 1;
      if (o === 'gift') {
        book(state, 'company', -150_00, 'other', `Geburtstagsgeschenk ${d.name}`);
        d.satisfaction = clamp(d.satisfaction + 10);
        for (const x of Object.values(state.drivers)) if (x !== d) x.satisfaction = clamp(x.satisfaction + 2);
        return `${d.name} freut sich riesig, das ganze Team feiert mit.`;
      }
      if (o === 'card') {
        d.satisfaction = clamp(d.satisfaction + 4);
        return `${d.name} bedankt sich für die Karte.`;
      }
      d.satisfaction = clamp(d.satisfaction - 3);
      return `${d.name} hat sich etwas mehr erhofft.`;
    },
  },
  {
    id: 'driver_family',
    category: 'personnel',
    chance: 0.05,
    cooldownDays: 20,
    create(state) {
      const pool = Object.values(state.drivers).filter((d) => d.status === 'idle' && d.leavesAt === undefined);
      const d = rand.pick(state, pool);
      if (!d) return null;
      const reason = rand.pick(state, ['die Einschulung der Tochter', 'den Umzug der Eltern', 'die Hochzeit der Schwester', 'die Geburt des ersten Enkels']);
      return {
        title: 'Bitte um zwei freie Tage',
        text: `${d.name} bittet kurzfristig um zwei freie Tage für ${reason} – nicht vom Jahresurlaub, als Sonderurlaub.`,
        options: [
          opt('yes', 'Ja, Sonderurlaub', 'Zwei Tage nicht verfügbar, Zufriedenheit +14'),
          opt('vacation', 'Ja, aber vom Urlaub', 'Zwei Urlaubstage, Zufriedenheit +4'),
          opt('no', 'Geht gerade nicht', 'Zufriedenheit −10'),
        ],
        defaultOption: 'no',
        hours: 12,
        data: { driverId: d.id },
      };
    },
    resolve(state, _ctx, dec, o) {
      const d = state.drivers[str(dec, 'driverId')];
      if (!d) return 'Der Fahrer ist nicht mehr in der Firma.';
      if (o === 'no' || d.status !== 'idle') {
        d.satisfaction = clamp(d.satisfaction - 10);
        return o === 'no' ? `${d.name} ist enttäuscht.` : `${d.name} ist inzwischen verplant – die freien Tage fallen aus.`;
      }
      d.status = 'vacation';
      d.absentUntil = state.time + 2 * MIN_PER_DAY;
      if (o === 'vacation') {
        d.vacationLeft = Math.max(0, (d.vacationLeft ?? 30) - 2);
        d.satisfaction = clamp(d.satisfaction + 4);
        return `${d.name} nimmt zwei Urlaubstage.`;
      }
      d.satisfaction = clamp(d.satisfaction + 14);
      return `${d.name} ist dankbar und zwei Tage weg.`;
    },
  },
  {
    id: 'driver_speeding',
    category: 'personnel',
    chance: 0.12,
    cooldownDays: 18,
    create(state) {
      const pool = Object.values(state.drivers).filter((d) => d.trait === 'leadfoot' && d.kmDriven > 2000);
      const d = rand.pick(state, pool);
      if (!d) return null;
      const fine = rand.pick(state, [120_00, 180_00, 240_00]);
      return {
        title: 'Blitzerfoto',
        text: `Post von der Bußgeldstelle: ${d.name} war mit dem LKW deutlich zu schnell unterwegs. Bußgeld ${formatMoney(fine)}, der Halter soll Stellung nehmen.`,
        options: [
          opt('pay', 'Firma zahlt', `−${formatMoney(fine)}, Zufriedenheit +3`),
          opt('deduct', 'Vom Lohn abziehen', 'Zufriedenheit −6'),
          opt('talk', 'Ernstes Gespräch', 'Zufriedenheit −2, fährt vielleicht ruhiger'),
        ],
        defaultOption: 'deduct',
        data: { driverId: d.id, fine },
      };
    },
    resolve(state, _ctx, dec, o) {
      const d = state.drivers[str(dec, 'driverId')];
      if (!d) return 'Der Fahrer ist nicht mehr in der Firma.';
      if (o === 'pay') {
        book(state, 'company', -num(dec, 'fine'), 'penalty', `Bußgeld ${d.name}`);
        d.satisfaction = clamp(d.satisfaction + 3);
        return `Die Firma übernimmt das Bußgeld.`;
      }
      if (o === 'deduct') {
        d.satisfaction = clamp(d.satisfaction - 6);
        return `${d.name} zahlt selbst und ist verstimmt.`;
      }
      d.satisfaction = clamp(d.satisfaction - 2);
      if (rand.chance(state, 0.4)) {
        d.trait = undefined;
        return `${d.name} nimmt es sich zu Herzen und fährt ab jetzt ruhiger (kein Bleifuß mehr).`;
      }
      return `${d.name} nickt – ob es hilft, wird sich zeigen.`;
    },
  },
  {
    id: 'driver_hero',
    category: 'personnel',
    chance: 0.03,
    cooldownDays: 40,
    create(state) {
      const pool = Object.values(state.drivers).filter((d) => d.status === 'on_trip' || d.kmDriven > 5000);
      const d = rand.pick(state, pool);
      if (!d) return null;
      return {
        title: 'Ersthelfer auf der Autobahn',
        text: `${d.name} hat an einer Unfallstelle als Erster angehalten und bis zum Eintreffen des Rettungsdienstes geholfen. Die Lokalzeitung möchte darüber berichten.`,
        options: [
          opt('bonus', 'Prämie (300 €) und Bericht', 'Zufriedenheit +12, Ansehen +3'),
          opt('story', 'Bericht ja, keine Prämie', 'Zufriedenheit +4, Ansehen +2'),
          opt('quiet', 'Lieber kein Rummel', 'Zufriedenheit +2'),
        ],
        defaultOption: 'quiet',
        data: { driverId: d.id },
      };
    },
    resolve(state, _ctx, dec, o) {
      const d = state.drivers[str(dec, 'driverId')];
      if (!d) return 'Der Fahrer ist nicht mehr in der Firma.';
      if (o === 'bonus') {
        book(state, 'company', -300_00, 'wages', `Prämie ${d.name}`);
        d.satisfaction = clamp(d.satisfaction + 12);
        state.company.reputation = Math.min(100, state.company.reputation + 3);
        return `Der Bericht erscheint mit Foto vor dem LKW – ${d.name} ist stolz.`;
      }
      if (o === 'story') {
        d.satisfaction = clamp(d.satisfaction + 4);
        state.company.reputation = Math.min(100, state.company.reputation + 2);
        return 'Der Bericht erscheint und macht die Firma bekannt.';
      }
      d.satisfaction = clamp(d.satisfaction + 2);
      return `${d.name} ist froh, dass es keinen Rummel gibt.`;
    },
  },
  // ---------------------------------------------------------------- Markt
  {
    id: 'rush_job',
    category: 'market',
    chance: 0.18,
    cooldownDays: 4,
    create(state, ctx) {
      if (!Object.keys(state.vehicles).length) return null;
      const o = generateOrder(state, ctx, { local: true });
      if (!o || o.partial || o.distanceKm > 700) return null;
      o.payment = Math.round((o.payment * rand.float(state, 1.9, 2.4)) / 500) * 500;
      o.penaltyPerHour = Math.round((o.payment * 0.06) / 100) * 100;
      o.express = true;
      o.tender = true;
      const window = rand.int(state, 2, 4) * 60;
      o.pickupStart = Math.ceil((state.time + 90) / 30) * 30;
      o.pickupEnd = o.pickupStart + window;
      o.deliveryEnd = Math.ceil((o.pickupEnd + (o.distanceKm / 62) * 60 * 1.25 + CARGO_BY_ID[o.cargoId].loadMin * 2 + 60) / 30) * 30;
      o.offerExpires = o.pickupStart;
      const cu = state.customers[o.customerId];
      return {
        title: 'Eilauftrag',
        text: `${cu.name} hat einen Engpass: ${CARGO_BY_ID[o.cargoId].name} (${o.weightT} t) ${CITY_BY_ID[o.fromCityId].name} → ${CITY_BY_ID[o.toCityId].name}, Abholung ab ${formatDateTime(o.pickupStart)}, Lieferung bis ${formatDateTime(o.deliveryEnd)}. Gezahlt wird ${formatMoney(o.payment)} – etwa das Doppelte. Bei Verspätung ${formatMoney(o.penaltyPerHour)} je Stunde.`,
        options: [opt('accept', 'Annehmen', 'Auftrag sofort disponieren'), opt('decline', 'Ablehnen', 'Keine Folgen')],
        defaultOption: 'decline',
        data: { orderId: o.id },
        hours: Math.max(1, Math.round((o.pickupStart - state.time) / 60)),
      };
    },
    resolve(state, _ctx, dec, o) {
      const order = state.orders[str(dec, 'orderId')];
      if (!order || order.status !== 'offered') return 'Der Eilauftrag ist nicht mehr verfügbar.';
      if (o === 'accept') {
        order.status = 'accepted';
        return `Eilauftrag angenommen: ${CITY_BY_ID[order.fromCityId].name} → ${CITY_BY_ID[order.toCityId].name} für ${formatMoney(order.payment)} – jetzt disponieren!`;
      }
      order.status = 'expired';
      return 'Eilauftrag abgelehnt.';
    },
  },
  {
    id: 'fuel_surcharge',
    category: 'market',
    chance: 0.25,
    cooldownDays: 45,
    create(state) {
      const active = Object.values(state.contracts).filter((c) => c.status === 'active');
      if (state.market.diesel < 172 || !active.length) return null;
      return {
        title: 'Dieselzuschlag?',
        text: `Diesel kostet ${(state.market.diesel / 100).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €/l. Du könntest bei deinen ${active.length} Rahmenverträgen einen Dieselzuschlag von 5 % verlangen – nicht jeder Kunde wird begeistert sein.`,
        options: [opt('ask', 'Zuschlag verlangen', 'Je Vertrag meist +5 %, manchmal Ärger'), opt('absorb', 'Kosten selbst tragen', 'Ruf +1, Kunden zufriedener')],
        defaultOption: 'absorb',
        data: {},
      };
    },
    resolve(state, _ctx, _dec, o) {
      const active = Object.values(state.contracts).filter((c) => c.status === 'active');
      if (o === 'absorb') {
        state.company.reputation = Math.min(100, state.company.reputation + 1);
        for (const c of active) {
          const cu = state.customers[c.customerId];
          if (cu) adjustSatisfaction(cu, 3);
        }
        return 'Kein Dieselzuschlag – die Kunden wissen das zu schätzen.';
      }
      let yes = 0;
      for (const c of active) {
        const cu = state.customers[c.customerId];
        if (rand.chance(state, 0.7)) {
          c.paymentPerTour = Math.round((c.paymentPerTour * 1.05) / 100) * 100;
          yes++;
        } else if (cu) adjustSatisfaction(cu, -10);
      }
      return `Dieselzuschlag: ${yes} von ${active.length} Kunden zahlen 5 % mehr je Tour${yes < active.length ? ', die übrigen sind verärgert' : ''}.`;
    },
  },
  {
    id: 'competitor_takeover',
    category: 'market',
    chance: 0.3,
    cooldownDays: 40,
    create(state) {
      const c = activeCompetitors(state).find((x) => x.status === 'trouble' && x.trucks >= 3);
      if (!c) return null;
      const lost = Object.values(state.customers).filter((cu) => cu.lostTo === c.id).length;
      const price = Math.round((c.trucks * 2_500_00 + 8_000_00) / 1000_00) * 1000_00;
      return {
        title: 'Konkurrent in Not',
        text: `${c.name} (${CITY_BY_ID[c.hqCityId].name}, ${c.trucks} LKW) steckt in Schwierigkeiten und bietet dir den Kundenstamm für ${formatMoney(price)} an.${lost ? ` Darunter ${lost} Kunde${lost > 1 ? 'n' : ''}, die früher bei dir waren.` : ''} Zwei Fahrer würden mitkommen.`,
        options: [
          opt('buy', `Übernehmen (${formatMoney(price)})`, 'Kunden kommen zurück, Ruf +3, zwei Fahrer als Bewerber'),
          opt('wait', 'Abwarten', 'Vielleicht geht er pleite – oder erholt sich'),
        ],
        defaultOption: 'wait',
        data: { competitorId: c.id, price },
      };
    },
    resolve(state, _ctx, dec, o) {
      const c = state.competitors[str(dec, 'competitorId')];
      if (o !== 'buy') return 'Du wartest ab.';
      if (!c || c.status === 'bankrupt' || c.status === 'acquired') return 'Zu spät – der Konkurrent hat schon aufgegeben.';
      const price = num(dec, 'price');
      if (state.company.account.balance - price < -10_000_00) return 'Für die Übernahme fehlt das Geld.';
      book(state, 'company', -price, 'other', `Übernahme Kundenstamm ${c.name}`);
      let back = 0;
      for (const cu of Object.values(state.customers))
        if (cu.lostTo === c.id) {
          delete cu.lostTo;
          delete cu.lostAt;
          cu.satisfaction = Math.max(cu.satisfaction, 60);
          back++;
        }
      c.trucks = Math.max(1, Math.round(c.trucks * 0.5));
      c.reputation = Math.max(10, c.reputation - 10);
      state.company.reputation = Math.min(100, state.company.reputation + 3);
      for (let i = 0; i < 2; i++) {
        const a = makeApplicant(state, c.hqCityId in CITY_BY_ID ? c.hqCityId : state.company.hqCityId);
        a.experience = Math.max(a.experience, 55);
        a.expires = state.time + 7 * MIN_PER_DAY;
        state.applicants[a.id] = a;
      }
      return `Kundenstamm von ${c.name} übernommen${back ? `: ${back} Kunde${back > 1 ? 'n' : ''} zurück` : ''}. Zwei Fahrer stehen in der Bewerberliste.`;
    },
  },
  // ---------------------------------------------------------------- Firma
  {
    id: 'trade_fair',
    category: 'company',
    chance: 0.04,
    cooldownDays: 45,
    create(state) {
      if (state.company.reputation < 32 || Object.keys(state.vehicles).length < 2) return null;
      const city = rand.pick(state, ['muenchen', 'hamburg', 'frankfurt', 'koeln', 'berlin', 'mailand', 'paris', 'amsterdam', 'wien'].filter((id) => CITY_BY_ID[id]));
      const cost = 4_500_00;
      return {
        title: 'Logistik-Fachmesse',
        text: `In ${CITY_BY_ID[city].name} findet die Logistik-Fachmesse statt. Ein Stand kostet ${formatMoney(cost)}. Wer selbst hingeht, knüpft die besten Kontakte, ist aber zwei Tage nicht im Büro.`,
        options: [
          opt('go', 'Selbst hinfahren', `${formatMoney(cost)}, 2 Tage weg, Ruf +4, 2 Vertragsangebote`),
          opt('stand', 'Nur Stand mit Prospekten', `${formatMoney(cost)}, Ruf +2, 1 Vertragsangebot`),
          opt('skip', 'Nicht teilnehmen', 'Keine Folgen'),
        ],
        defaultOption: 'skip',
        data: { city, cost },
      };
    },
    resolve(state, ctx, dec, o) {
      if (o === 'skip') return 'Keine Messeteilnahme.';
      const cost = num(dec, 'cost');
      if (state.company.account.balance - cost < -10_000_00) return 'Für den Messestand fehlt das Geld.';
      book(state, 'company', -cost, 'other', `Messestand ${CITY_BY_ID[str(dec, 'city')].name}`);
      const n = o === 'go' ? 2 : 1;
      state.company.reputation = Math.min(100, state.company.reputation + (o === 'go' ? 4 : 2));
      if (o === 'go') {
        const p = Object.values(state.players).find((x) => x.isFounder) ?? Object.values(state.players)[0];
        if (p) p.character.activity = { id: 'fair', until: state.time + 2 * MIN_PER_DAY, text: 'Fachmesse' };
      }
      let made = 0;
      for (let i = 0; i < n; i++) if (generateContractOffer(state, ctx)) made++;
      return `Messe in ${CITY_BY_ID[str(dec, 'city')].name}: neue Kontakte${made ? `, ${made} Vertragsangebot${made > 1 ? 'e' : ''} unter „Kunden & Verträge“` : ''}.`;
    },
  },
  {
    id: 'customer_complaint',
    category: 'company',
    chance: 0.12,
    cooldownDays: 14,
    create(state) {
      const cu = rand.pick(state, Object.values(state.customers).filter((c) => !c.lostTo && c.deliveries >= 2 && c.satisfaction < 50));
      if (!cu) return null;
      const credit = Math.round(Math.min(1_500_00, 300_00 + cu.deliveries * 40_00) / 50_00) * 50_00;
      return {
        title: 'Beschwerde',
        text: `${cu.name} (${CITY_BY_ID[cu.cityId].name}) beschwert sich über verspätete Lieferungen und überlegt, zur Konkurrenz zu gehen (Zufriedenheit ${Math.round(cu.satisfaction)} %).`,
        options: [
          opt('credit', `Gutschrift ${formatMoney(credit)}`, 'Zufriedenheit +18'),
          opt('call', 'Persönlich anrufen', 'Eine Stunde, Zufriedenheit +8'),
          opt('ignore', 'Nicht reagieren', 'Zufriedenheit −6'),
        ],
        defaultOption: 'ignore',
        data: { customerId: cu.id, credit },
      };
    },
    resolve(state, _ctx, dec, o) {
      const cu = state.customers[str(dec, 'customerId')];
      if (!cu) return 'Der Kunde ist nicht mehr da.';
      if (o === 'credit') {
        book(state, 'company', -num(dec, 'credit'), 'penalty', `Gutschrift ${cu.name}`);
        adjustSatisfaction(cu, 18);
        return `${cu.name} nimmt die Gutschrift an und bleibt.`;
      }
      if (o === 'call') {
        adjustSatisfaction(cu, 8);
        return `Ein offenes Gespräch mit ${cu.name} glättet die Wogen etwas.`;
      }
      adjustSatisfaction(cu, -6);
      return `${cu.name} fühlt sich nicht ernst genommen.`;
    },
  },
  {
    id: 'press',
    category: 'company',
    chance: 0.05,
    cooldownDays: 40,
    create(state) {
      const city = CITY_BY_ID[state.company.hqCityId];
      return {
        title: 'Anfrage der Lokalzeitung',
        text: `Die Zeitung in ${city.name} möchte ein Porträt über ${state.company.name} bringen – über Fahrermangel, Maut und den Alltag einer Spedition.`,
        options: [opt('yes', 'Interview geben', 'Zwei Stunden, Ruf +2, mehr Bewerber'), opt('no', 'Absagen', 'Keine Folgen')],
        defaultOption: 'no',
        data: {},
      };
    },
    resolve(state, _ctx, _dec, o) {
      if (o !== 'yes') return 'Interview abgesagt.';
      state.company.reputation = Math.min(100, state.company.reputation + 2);
      for (let i = 0; i < 2; i++) {
        const a = makeApplicant(state, state.company.hqCityId);
        state.applicants[a.id] = a;
      }
      return 'Der Artikel erscheint – zwei neue Bewerbungen sind eingegangen.';
    },
  },
  // ---------------------------------------------------------------- Privat
  {
    id: 'partner_trip',
    category: 'private',
    chance: 0.05,
    cooldownDays: 30,
    auto: 'go',
    create(state, _ctx, p) {
      const partner = p!.character.relations.find((r) => r.kind === 'partner');
      if (!partner || isAway(state, p!.character)) return null;
      return {
        title: 'Wochenendausflug',
        text: `${partner.name} möchte mit ${p!.character.name} übers Wochenende wegfahren – an die See oder in die Berge.`,
        options: [opt('go', 'Mitfahren (450 €)', '2 Tage weg, Stress −15, Nähe +12'), opt('decline', 'Keine Zeit', 'Nähe −10')],
        defaultOption: 'decline',
        data: { relationId: partner.id },
      };
    },
    resolve(state, _ctx, dec, o) {
      const p = state.players[dec.playerId!];
      const c = p?.character;
      const r = c?.relations.find((x) => x.id === str(dec, 'relationId'));
      if (!c || !r) return 'Hat sich erledigt.';
      if (o === 'go' && c.privateAccount.balance >= 450_00 && !isAway(state, c)) {
        book(state, `private:${p.id}`, -450_00, 'living', 'Wochenendausflug');
        c.activity = { id: 'trip', until: state.time + 2 * MIN_PER_DAY, text: 'Wochenendausflug' };
        c.needs.stress = clamp(c.needs.stress - 15);
        c.needs.happiness = clamp(c.needs.happiness + 6);
        r.closeness = clamp(r.closeness + 12);
        r.lastContact = state.time + 2 * MIN_PER_DAY;
        return `${c.name} und ${r.name} sind übers Wochenende weg.`;
      }
      r.closeness = clamp(r.closeness - 10);
      return `${r.name} ist enttäuscht – die Arbeit geht mal wieder vor.`;
    },
  },
  {
    id: 'friend_help',
    category: 'private',
    chance: 0.05,
    cooldownDays: 25,
    auto: 'help',
    create(state, _ctx, p) {
      const f = rand.pick(state, p!.character.relations.filter((r) => r.kind === 'friend'));
      if (!f) return null;
      const what = rand.pick(state, ['beim Umzug', 'beim Renovieren', 'bei der Gartenarbeit', 'beim Aufbau einer Küche']);
      return {
        title: 'Freundschaftsdienst',
        text: `${f.name} bittet ${p!.character.name} um Hilfe ${what} – ein halber Tag, danach gibt es Pizza.`,
        options: [opt('help', 'Helfen', '5 Stunden, Kontakte +12, Nähe +15'), opt('decline', 'Absagen', 'Nähe −8')],
        defaultOption: 'decline',
        data: { relationId: f.id },
      };
    },
    resolve(state, _ctx, dec, o) {
      const c = state.players[dec.playerId!]?.character;
      const r = c?.relations.find((x) => x.id === str(dec, 'relationId'));
      if (!c || !r) return 'Hat sich erledigt.';
      if (o === 'help' && !isAway(state, c)) {
        c.activity = { id: 'help', until: state.time + 5 * 60, text: `Hilft ${r.name}` };
        c.needs.social = clamp(c.needs.social + 12);
        c.needs.energy = clamp(c.needs.energy - 10);
        r.closeness = clamp(r.closeness + 15);
        r.lastContact = state.time;
        return `${c.name} hilft ${r.name} – ein anstrengender, aber schöner Tag.`;
      }
      r.closeness = clamp(r.closeness - 8);
      return `${c.name} sagt ${r.name} ab.`;
    },
  },
  {
    id: 'club_invite',
    category: 'private',
    chance: 0.03,
    cooldownDays: 60,
    auto: 'join',
    create(state, _ctx, p) {
      const c = p!.character;
      if (c.needs.leisure > 60) return null;
      // [Akkusativ, Dativ, Hobby]
      const club = rand.pick(state, [['die Laufgruppe', 'der Laufgruppe', 'hiking'], ['den Angelverein', 'dem Angelverein', 'angling'], ['die Band', 'der Band', 'music'], ['den Kochkurs', 'dem Kochkurs', 'cooking']]);
      return {
        title: 'Einladung in den Verein',
        text: `Nachbarn laden ${c.name} in ${club[0]} ein – einmal die Woche, ganz entspannt.`,
        options: [opt('join', 'Mitmachen', 'Neues Hobby, Freizeit +15, eine neue Bekanntschaft'), opt('no', 'Lieber nicht', 'Keine Folgen')],
        defaultOption: 'no',
        data: { hobby: club[2], club: club[1] },
      };
    },
    resolve(state, _ctx, dec, o) {
      const c = state.players[dec.playerId!]?.character;
      if (!c || o !== 'join') return 'Abgesagt.';
      if (!c.hobby) c.hobby = { id: str(dec, 'hobby'), level: 1 };
      c.needs.leisure = clamp(c.needs.leisure + 15);
      c.needs.social = clamp(c.needs.social + 6);
      return `${c.name} ist jetzt in ${str(dec, 'club')}.`;
    },
  },
];

const RULE_BY_ID = Object.fromEntries(DECISION_RULES.map((r) => [r.id, r]));

function open(state: GameState, ctx: SimContext, r: DecisionRule, draft: Draft, playerId?: Id) {
  const { hours, ...rest } = draft;
  const d: Decision = { ...rest, id: newId(state, 'dec'), rule: r.id, category: r.category, playerId, created: state.time, expires: state.time + (hours ?? DEFAULT_HOURS) * 60 };
  state.decisions.push(d);
  // „Fokus Firma“: private Karten entscheidet das Spiel sofort
  const p = playerId ? state.players[playerId] : undefined;
  if (p?.character.autopilot && r.auto) resolveDecision(state, ctx, d.id, r.auto, true);
  else {
    addLog(state, { level: 'info', category: r.category === 'private' ? 'private' : r.category === 'personnel' ? 'personnel' : 'market', text: `Entscheidung gefragt: ${d.title}` });
    // anhalten, damit die Karte nicht unbemerkt abläuft
    if (pausesOnDecision(state) && !state.paused) {
      state.paused = true;
      state.pausedForDecision = true;
    }
  }
}

/** Hält das Spiel bei neuen Karten an? Ohne Einstellung: im Einzelspiel ja, im Multiplayer nein (würde alle anhalten). */
export const pausesOnDecision = (state: GameState) => state.pauseOnDecision ?? Object.keys(state.players).length <= 1;

/** Bestimmte Karte sofort anbieten (Tests, Tutorial); null, wenn sie gerade nicht passt */
export function offerDecision(state: GameState, ctx: SimContext, ruleId: string, playerId?: Id): Decision | null {
  const r = RULE_BY_ID[ruleId];
  const p = playerId ? state.players[playerId] : undefined;
  if (!r || (r.category === 'private') !== !!p) return null;
  const draft = r.create(state, ctx, p);
  if (!draft) return null;
  open(state, ctx, r, draft, p?.id);
  return state.decisions.find((d) => d.rule === ruleId && d.playerId === p?.id) ?? null;
}

/** Täglich: neue Entscheidungskarten (höchstens eine Firmenkarte und eine private je Spieler). */
export function dailyDecisions(state: GameState, ctx: SimContext): void {
  state.decisions ??= [];
  const last = state.events.last;
  const ready = (key: string, days: number) => last[key] === undefined || state.time - last[key] >= days * MIN_PER_DAY;
  if (state.decisions.filter((d) => d.category !== 'private').length < MAX_OPEN) {
    const company = DECISION_RULES.filter((x) => x.category !== 'private')
      .map((r) => ({ r, k: rand.float(state) }))
      .sort((a, b) => a.k - b.k)
      .map((x) => x.r);
    for (const r of company) {
      const key = `dec:${r.id}`;
      if (!ready(key, r.cooldownDays) || !rand.chance(state, r.chance)) continue;
      const draft = r.create(state, ctx);
      if (!draft) continue;
      last[key] = state.time;
      open(state, ctx, r, draft);
      break;
    }
  }
  for (const p of Object.values(state.players)) {
    if (state.decisions.some((d) => d.playerId === p.id)) continue;
    for (const r of DECISION_RULES.filter((x) => x.category === 'private')) {
      const key = `dec:${r.id}:${p.id}`;
      if (!ready(key, r.cooldownDays) || !rand.chance(state, r.chance)) continue;
      const draft = r.create(state, ctx, p);
      if (!draft) continue;
      last[key] = state.time;
      open(state, ctx, r, draft, p.id);
      break;
    }
  }
}

/** Stündlich: abgelaufene Karten mit der Vorgabe entscheiden. */
export function hourlyDecisions(state: GameState, ctx: SimContext): void {
  for (const d of [...(state.decisions ?? [])]) if (state.time >= d.expires) resolveDecision(state, ctx, d.id, d.defaultOption, true);
}

export function resolveDecision(state: GameState, ctx: SimContext, decisionId: Id, optionId: string, automatic = false): { ok: true; text: string } | { ok: false; error: string } {
  const d = state.decisions.find((x) => x.id === decisionId);
  if (!d) return { ok: false, error: 'Diese Entscheidung ist bereits gefallen.' };
  const option = d.options.find((o) => o.id === optionId);
  if (!option) return { ok: false, error: 'Unbekannte Möglichkeit.' };
  const rule = RULE_BY_ID[d.rule];
  state.decisions = state.decisions.filter((x) => x !== d);
  // nach der letzten offenen Karte weiterlaufen, wenn das Spiel ihretwegen angehalten wurde
  if (state.pausedForDecision && !state.decisions.length) {
    state.paused = false;
    state.pausedForDecision = false;
  }
  const text = rule ? rule.resolve(state, ctx, d, optionId) : '';
  const prefix = automatic ? (d.playerId && state.players[d.playerId]?.character.autopilot ? 'Fokus Firma' : 'Keine Entscheidung') : 'Entschieden';
  state.events.history.push({ t: state.time, rule: `dec:${d.rule}`, title: d.title, text: `${option.label} – ${text}`, category: d.category === 'personnel' ? 'company' : d.category, tone: 'neutral' });
  if (state.events.history.length > 60) state.events.history.shift();
  addLog(state, { level: 'info', category: d.category === 'private' ? 'private' : d.category === 'personnel' ? 'personnel' : 'market', text: `${prefix} (${d.title}): ${option.label}. ${text}` });
  return { ok: true, text };
}

/** Darf dieser Spieler die Karte entscheiden? */
export function mayDecide(state: GameState, playerId: Id, d: Decision): boolean {
  const p = state.players[playerId];
  if (!p) return false;
  if (d.category === 'private') return d.playerId === playerId;
  const perm = DECISION_PERMISSION[d.category];
  return !perm || p.permissions.includes(perm);
}
