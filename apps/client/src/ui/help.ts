// Inhalte des Hilfesystems (F1). Jeder Artikel hat Stichwörter für die Suche und kann einer Seite zugeordnet sein (Kontexthilfe).

import type { Page } from '../game/store.ts';

export interface HelpArticle {
  id: string;
  title: string;
  /** Seite, auf der F1 diesen Artikel öffnet */
  page?: Page;
  keywords: string;
  /** Absätze; Zeilen mit „• “ werden als Liste gezeigt */
  body: string[];
}

export const HELP: HelpArticle[] = [
  {
    id: 'start',
    title: 'Erste Schritte',
    page: 'dashboard',
    keywords: 'anfang tutorial einstieg start spielziel',
    body: [
      'Du führst eine Spedition: Aufträge aus der Börse annehmen, mit Fahrer, LKW und Auflieger disponieren, pünktlich liefern und mit dem Gewinn wachsen.',
      '• Auftragsbörse öffnen (Taste A) und einen Auftrag mit gutem Ergebnis in der Vorkalkulation wählen.',
      '• „Disponieren“: Fahrer, LKW und Auflieger auswählen. Die Konfliktprüfung zeigt Fehler und Warnungen.',
      '• Die Zeit starten (Leertaste, Tasten 1–6 für das Tempo) und die Fahrt auf der Karte verfolgen (Taste M).',
      '• Nach der Lieferung entsteht eine Rechnung. Das Geld kommt erst nach dem Zahlungsziel – plane die Liquidität.',
      'Am Anfang ist das Geld knapp: Ein LKW trägt die Fixkosten kaum. Mit dem zweiten und dritten Fahrzeug (Gebrauchtkauf, Leasing oder Finanzierung) wird die Firma profitabel.',
      'Die „Erste Schritte“-Liste unten rechts führt durch den Einstieg. Sie lässt sich hier jederzeit wieder einblenden.',
    ],
  },
  {
    id: 'orders',
    title: 'Auftragsbörse',
    page: 'orders',
    keywords: 'aufträge börse angebot fracht ladung vergütung express teilladung ausschreibung',
    body: [
      'Aufträge entstehen aus einem Warenflussmodell: Städte erzeugen und verbrauchen Waren je nach Branche und Saison. Ein Teil der Angebote entsteht gezielt im Umkreis (450 km) deiner Standorte, Fahrzeuge und Fahrtziele – so findest du Anschlussladungen.',
      '• Vergütung: Satz je Ladungsart und km, Kurzstrecken- und Dieselzuschlag, Ladepauschale. Express bringt +30 %, Ausschreibungen zahlen besonders gut, sind aber nur kurz verfügbar.',
      '• Teilladungen passen auf Solo-LKW und Transporter und lassen sich als Beiladung kombinieren.',
      '• Verspätungen kosten 2 % (Express 4 %) der Vergütung je angefangene Stunde, höchstens 50 %.',
      'Neue Angebote stehen zuerst 90 Minuten nur dir zur Verfügung, danach greift auch die Konkurrenz zu.',
    ],
  },
  {
    id: 'dispatch',
    title: 'Disposition und Vorkalkulation',
    page: 'dispatch',
    keywords: 'disponieren plantafel fahrer lkw auflieger folgeauftrag warteschlange beiladung überführung kalkulation',
    body: [
      'Eine Fahrt braucht Fahrer, LKW und passenden Auflieger am selben Ort. Die Vorkalkulation rechnet Leer- und Last-km, Lenk- und Ruhezeiten, Wetter, Grenzwartezeiten, Fahrverbote, Diesel, Maut und anteilige Kosten durch.',
      '• Fehler (rot) blockieren: falscher Auflieger, Nutzlast, fehlende Qualifikation, unterschiedliche Orte, Fahrzeug nicht verkehrssicher.',
      '• Warnungen (gelb) erlauben die Fahrt trotzdem: knappe Termine, Fahrverbot, Grenze, Tankstopps, unwirtschaftlich.',
      '• Folgeaufträge: Für einen fahrenden LKW lassen sich bis zu 5 Aufträge einplanen. Sie starten automatisch nach der laufenden Fahrt.',
      '• Beiladung: Teilladungen unterwegs dazunehmen, solange Nutzlast und Termine passen.',
      'Auf der Plantafel lässt sich ein Auftrag per Drag-and-Drop auf eine Fahrzeugzeile ziehen. Rechtsklick auf Zeilen öffnet ein Kontextmenü.',
    ],
  },
  {
    id: 'hos',
    title: 'Lenk- und Ruhezeiten',
    page: 'personnel',
    keywords: 'lenkzeit ruhezeit pause wochenruhe tagesruhe 561/2006 fahrer',
    body: [
      'Vereinfachte EU-Regeln (VO 561/2006):',
      '• Nach 4,5 h Lenkzeit 45 min Pause.',
      '• Höchstens 9 h Lenkzeit am Tag, danach 11 h Tagesruhe.',
      '• Höchstens 56 h in der Woche bzw. nach 6 Tageslenkzeiten 45 h Wochenruhe.',
      '• Standzeit ohne Arbeit zählt als Ruhe; Be- und Entladen und Tanken zählen als Arbeit.',
      'Wartet ein Fahrer länger als 3 h auf das Ladefenster, legt er seine Tagesruhe gleich dort ein, sofern sie vor dem Ende des Fensters endet. Die Planung rechnet das mit ein.',
    ],
  },
  {
    id: 'world',
    title: 'Wetter, Fahrverbote und Grenzen',
    page: 'map',
    keywords: 'wetter schnee glätte regen nebel sturm fahrverbot sonntag feiertag grenze zoll schweiz norwegen großbritannien unfall',
    body: [
      'Jedes Land hat eigenes Wetter nach Jahreszeit und Lage. Schnee bremst um 28 %, Glätte um 40 % und erhöht das Unfallrisiko deutlich. Unwetter können Strecken für einige Stunden sperren.',
      '• Fahrverbote für LKW über 7,5 t: Deutschland und Slowakei sonn- und feiertags 0–22 Uhr, Österreich ab Samstag 15 Uhr, Schweiz sonntags und nachts 22–5 Uhr, Frankreich und Ungarn Samstag 22 Uhr bis Sonntag 22 Uhr, Italien sonntags 9–22 Uhr, Tschechien sonntags 13–22 Uhr, Polen an Feiertagen.',
      '• Ausgenommen: Transporter, leichte Solo-LKW und beladene Kühltransporte.',
      '• Zollgrenzen zur Schweiz, zu Norwegen, Großbritannien und zum Westbalkan: im Schnitt 35 min, am Westbalkan 2 h Wartezeit.',
      'Übersicht je Land unter „Markt & Wettbewerb“ → „Regionen & Wetter“.',
      '• Auf der Karte zeigt der Schalter „Rastplätze & Werkstätten“ Rastplätze, Werkstätten und deine eigenen Anlagen. Viele Fahrzeuge an einem Ort erscheinen als Zahl – ein Klick zoomt hinein.',
    ],
  },
  {
    id: 'finance',
    title: 'Finanzen und Liquidität',
    page: 'finance',
    keywords: 'geld konto rechnung zahlungsziel mahnung kredit factoring kontokorrent überziehung liquidität kosten',
    body: [
      'Gewinn ist nicht gleich Liquidität: Kunden zahlen nach 14–60 Tagen, manche verspätet oder gar nicht.',
      '• Kontokorrentrahmen 10.000 € mit 12 % Überziehungszins.',
      '• Kredite mit festen Raten, Factoring verkauft offene Rechnungen sofort gegen Gebühr.',
      '• Fixkosten jeden Monat: Löhne mit Arbeitgeberanteil, Miete, Versicherungen, Leasing, Geschäftsführergehalt, Verwaltung.',
      '• Variable Kosten: Diesel, Maut, Werkstatt, Pannen, Strafen.',
      'Tipp: Halte einen Puffer für die Monatsabrechnung am Monatsersten. Im Finanzbereich siehst du Forderungen, Fixkosten und das Hauptbuch.',
    ],
  },
  {
    id: 'fleet',
    title: 'Fuhrpark, Wartung und Beschaffung',
    page: 'fleet',
    keywords: 'lkw kaufen leasing miete finanzierung gebraucht wartung werkstatt zustand panne verschleiß auflieger',
    body: [
      'Fahrzeuge verschleißen je km. Unter 45 % Zustand werden Pannen häufiger (3–8 h Stillstand, bis 2.400 €), unter 15 % ist ein LKW nicht mehr verkehrssicher.',
      '• Wartung bringt den LKW auf 100 % – lieber regelmäßig als zu spät. Eine eigene Werkstatt (ab Stufe 2) spart Kosten.',
      '• Beschaffung: Gebrauchtmarkt (günstig, aber verschlissen), Neukauf, Finanzierung (10 % Anzahlung), Leasing (erste Rate sofort, kein Kapital nötig) oder Kurzzeitmiete.',
      '• Solo-LKW und Transporter fahren Teilladungen und sind teils von Fahrverboten ausgenommen.',
      'Wachstum ohne viel Kapital gelingt meist über Leasing: Der zweite LKW teilt sich die Fixkosten mit dem ersten.',
    ],
  },
  {
    id: 'personnel',
    title: 'Fahrer und Personal',
    keywords: 'fahrer einstellen bewerber gehalt zufriedenheit urlaub krank kündigung schulung adr gespräch anreise bahn',
    body: [
      'Fahrereigenschaften: Etwa zwei von drei Fahrern bringen eine Eigenheit mit, zum Beispiel Sparfuchs (weniger Diesel), Pünktlich (zufriedenere Kunden), Bleifuß (schneller, aber riskanter), Frohnatur (zufriedener), Eiserne Gesundheit (selten krank) oder Plaudertasche (Kunden mögen es, Laden dauert länger). Die Wirkung steht im Tooltip und in der Personalakte. Dazu kommen kleine Geschichten als Entscheidungskarten, etwa Geburtstage, Bitten um freie Tage oder ein Blitzerfoto.',
      'Täglich kommen neue Bewerbungen. Erfahrung macht Fahrer schneller und sicherer, Sparsamkeit senkt den Verbrauch.',
      '• Zufriedenheit hängt von Gehalt, Urlaub, Wochenlenkzeit, Firmenruf und Betriebszugehörigkeit ab. Liegt sie 7 Tage unter 25, kündigt der Fahrer.',
      '• Personalgespräche (alle 14 Tage), Gehaltserhöhungen und Urlaub helfen.',
      '• Schulungen: ADR, Kühltransport, Schwertransport, Spritsparen.',
      '• Steht ein LKW ohne Fahrer an einem anderen Ort, schickst du einen freien Fahrer per Bahn hin: Rechtsklick auf den Fahrer → „Anreise nach …“. KI-Disponenten machen das selbst.',
    ],
  },
  {
    id: 'customers',
    title: 'Kunden und Rahmenverträge',
    page: 'customers',
    keywords: 'kunde zufriedenheit stammkunde vertrag rahmenvertrag zurückgewinnen abwerben',
    body: [
      'Pünktliche Lieferungen machen Kunden zufriedener, Verspätungen und Stornos kosten Zufriedenheit und Ruf.',
      '• Zufriedene Stammkunden zahlen bis zu 5 % mehr und bieten Rahmenverträge an: feste Strecke, feste Wochentage, fester Preis, Strafe bei Ausfall.',
      '• Unter 40 % Zufriedenheit kann ein Kunde ohne laufenden Vertrag zur Konkurrenz wechseln. Ein Vertriebsbesuch (1.500 €) holt ihn vielleicht zurück.',
    ],
  },
  {
    id: 'tenders',
    title: 'Ausschreibungen',
    page: 'customers',
    keywords: 'ausschreibung gebot zuschlag konkurrenz garantie rahmenvertrag preis',
    body: [
      'Große Verlader vergeben Rahmenverträge über 13 oder 26 Wochen an das beste Gebot. Ausschreibungen erscheinen, sobald die Firma zwei Fahrzeuge hat; mit Vertriebsmitarbeitern öfter.',
      '• Du bietest einen Preis je Tour. Die Karte zeigt Marktpreis, deine groben Kosten und die Marge.',
      '• KI-Speditionen aus der Region bieten verdeckt mit. Ein guter Ruf macht dein Gebot bis zu gut 6 % attraktiver, ein schlechter entsprechend teurer.',
      '• Pünktlichkeitsgarantie: Dein Gebot wiegt 5 % besser, jede verspätete Tour kostet aber die halbe Ausfallstrafe.',
      '• Nach dem Zuschlag stehen alle Gebote unter „Ergebnisse“. Gewonnene Ausschreibungen laufen als Rahmenvertrag.',
    ],
  },
  {
    id: 'decisions',
    title: 'Entscheidungskarten',
    keywords: 'entscheidung karte eilauftrag gehalt beschwerde messe dieselzuschlag übernahme',
    body: [
      'Manche Ereignisse fragen nach deiner Wahl: Eilaufträge, Gehaltswünsche, Beschwerden, Messen, Übernahmeangebote und private Anfragen. Die Karte erscheint unten rechts.',
      '• Jede Möglichkeit zeigt ihre Folge. Entscheidest du nicht, gilt nach Ablauf die Vorgabe (meist „ablehnen“).',
      '• „Später“ klappt die Karte ein; der Hinweis unten rechts zeigt, wie viele Entscheidungen offen sind.',
      '• Erscheint eine Karte, hält das Spiel an und läuft nach deiner Wahl weiter (abschaltbar unter Einstellungen; im Multiplayer standardmäßig aus).',
      '• Mit „Fokus Firma“ entscheidet das Spiel private Karten selbst.',
    ],
  },
  {
    id: 'premium',
    title: 'Premium-Aufträge',
    keywords: 'premium schwertransport genehmigung tieflader messe termin bonus',
    body: [
      'Ab dem dritten Spieltag erscheinen hin und wieder besonders lukrative Einzelaufträge. Sie stehen in der Auftragsbörse in einer eigenen Karte über der Liste und werden nur von Hand disponiert; die KI-Disposition fasst sie nicht an.',
      '• Schwertransport (etwa das 1,9-Fache der üblichen Fracht): Du brauchst einen Tieflader, einen Fahrer mit Schwertransport-Schein und eine Genehmigung. Der Antrag kostet rund 4,5 % der Vergütung, dauert 30 bis 60 Stunden und nimmt den Auftrag zugleich an.',
      '• Messe-Termin (etwa das 1,7-Fache): Abholung in einem Fenster von drei Stunden, kaum Puffer bis zur Messe. Zwei Stunden Verspätung kosten die halbe Vergütung und Ansehen.',
      '• Pünktlich erledigt bringen beide Arten Ansehen +3. Premium-Aufträge fahren nur als eigene Tour, nicht als Beiladung.',
    ],
  },
  {
    id: 'goals',
    title: 'Quartalsziele und Bonität',
    page: 'dashboard',
    keywords: 'quartal ziel bank bonität rating zins kreditrahmen',
    body: [
      'Alle 13 Wochen stellt die Hausbank drei Ziele, passend zur Größe der Firma: immer einen Umsatz und zwei weitere, etwa Lieferungen, Pünktlichkeit, Leerkilometer, Ansehen, Kontostand oder Fuhrpark. Der Stand steht im Dashboard.',
      '• Alle Ziele erreicht: Die Bonität steigt um eine Stufe, Ansehen +3.',
      '• Ein Ziel verfehlt: Die Bonität bleibt, Ansehen +1.',
      '• Mehr verfehlt: Die Bonität sinkt, Ansehen −2.',
      '• Bonität A bis E: A senkt den Kreditzins um 1 Prozentpunkt und hebt den Kreditrahmen um 20 %, E wirkt umgekehrt. Neue Firmen starten mit C.',
    ],
  },
  {
    id: 'scenarios',
    title: 'Szenarien',
    keywords: 'szenario ziel frist neustart familienbetrieb kühlspezialist großes ziel',
    body: [
      'Beim Spielstart wählst du unter „Spielart“ das freie Spiel oder ein Szenario mit eigener Ausgangslage, einem Ziel und einer Frist. Der Fortschritt steht im Dashboard.',
      '• Neustart mit Altlasten: 60.000 € Altkredit, 8.000 € Startgeld, Bonität D. Ziel: in 24 Monaten schuldenfrei mit 50.000 € auf dem Konto.',
      '• Familienbetrieb übernehmen: drei ältere Sattelzüge und Fahrer, wenig Rücklagen. Ziel: in 18 Monaten 8 Fahrzeuge und mindestens 90 % pünktlich (ab 100 Lieferungen).',
      '• Kühlspezialist: Start mit Kühlauflieger. Ziel: 120 Kühltransporte in 12 Monaten.',
      '• Großes Ziel: Unternehmensstufe 5 in 36 Monaten.',
      'Ob geschafft oder nicht: Nach Ablauf geht das Spiel als freies Spiel weiter.',
    ],
  },
  {
    id: 'achievements',
    title: 'Erfolge und Rekorde',
    page: 'stats',
    keywords: 'erfolg rekord meilenstein trophäe serie pünktlich',
    body: [
      'Erfolge sind Meilensteine wie die erste Auslandstour, 25 pünktliche Lieferungen in Folge, der erste Schwertransport oder zehn Fahrzeuge. Sie stehen unter Statistiken, die nächsten offenen im Dashboard.',
      '• Rekorde halten Bestwerte fest: längste Tour, bestbezahlter Auftrag, bester Monat, längste Pünktlichkeitsserie, größter Fuhrpark und höchster Kontostand.',
    ],
  },
  {
    id: 'market',
    title: 'Markt, Konjunktur und Konkurrenz',
    page: 'market',
    keywords: 'konjunktur krise aufschwung region nachfrage konkurrenz wettbewerb diesel ereignis',
    body: [
      'Die Wirtschaft wechselt über Monate zwischen normaler Lage, Aufschwung (mehr Aufträge) und Krise (weniger Aufträge, schleppende Zahlungen). Regionen haben eigene Nachfrage, die Ereignisse verschieben.',
      '• Fünf bis sieben KI-Speditionen übernehmen Aufträge im Umkreis ihrer Standorte, wachsen mit Gewinn und können in Konkurs gehen.',
      '• Ereignisse folgen einem Regelwerk: Negative kommen höchstens alle 4 Tage und nicht, solange dein Firmenkonto im Minus ist.',
    ],
  },
  {
    id: 'locations',
    title: 'Standorte und Unternehmensausbau',
    page: 'locations',
    keywords: 'standort niederlassung betriebshof stellplätze werkstatt tankstelle lager abteilung disponent stufe',
    body: [
      'Stellplätze begrenzen den Fuhrpark. Ein größerer Betriebshof oder eine Niederlassung schafft Platz.',
      '• Unternehmensstufen 1–6 schalten Einrichtungen frei: Werkstatt, Betriebstankstelle, Lagerhalle.',
      '• Abteilungen: Disposition (KI-Disponenten), Vertrieb (mehr Angebote), Buchhaltung (weniger Zahlungsausfälle), Fuhrparkmanagement (automatische Wartung).',
    ],
  },
  {
    id: 'autodispatch',
    title: 'KI-Disponenten',
    keywords: 'disponent automatisch vollautomatisch teilautomatisch vorschlag regeln',
    body: [
      'Ein Disponent betreut 8 Fahrzeuge. Teilautomatisch macht er stündlich Vorschläge, vollautomatisch nimmt er Angebote selbst an.',
      '• Regeln: Mindestgewinn, maximale Leerfahrt, Ladungsarten, Länder, Stammkunden bevorzugen, sichere Termine, Rückladungen.',
      '• Steht ein LKW länger ohne Auftrag, nimmt der Disponent auch weitere Anfahrten in Kauf; nach 24 h holt er ihn zum nächsten Standort zurück. Ruhezeiten zählen dabei nicht als Standzeit.',
      '• Kompetenz bestimmt Suchtiefe und Kalkulationsfehler.',
    ],
  },
  {
    id: 'private',
    title: 'Privatleben',
    page: 'private',
    keywords: 'privat erschöpfung wohnung haus freizeit urlaub familie partner ausschüttung gehalt',
    body: [
      'Dein Charakter hat Bedürfnisse, ein Privatkonto und ein Leben neben der Firma. Wer zu viel arbeitet, wird erschöpft und disponiert schlechter.',
      '• Das Geschäftsführergehalt fließt aufs Privatkonto; Gewinnausschüttungen sind möglich.',
      '• Wohnen, Freizeit, Beziehungen und Ziele kosten Geld und Zeit, geben aber Energie zurück.',
      '• Ein Klick auf dein Bild öffnet den Charakter-Editor für dein Aussehen.',
      '• Fokus Firma: Das Spiel plant Freizeit, Kontakte und Urlaub selbst und entscheidet private Karten. Wohnen, Familie und Ausschüttungen bleiben bei dir.',
      '• Wochenroutine: eine feste Aktivität je Wochentag, jeden Abend um 19 Uhr.',
    ],
  },
  {
    id: 'team',
    title: 'Multiplayer',
    page: 'multiplayer',
    keywords: 'multiplayer team freunde rollen rechte chat nachricht aufgabe abstimmung server',
    body: [
      'Mehrere Spieler führen gemeinsam eine Firma. Der Server simuliert, jeder Client zeigt nur an.',
      '• Rollen setzen Rechte; ein Ausgabenlimit und Niederlassungen lassen sich je Spieler begrenzen.',
      '• Firmenchat, interne Nachrichten, Aufgaben, gemeinsame Aktivitäten und Abstimmungen.',
    ],
  },
  {
    id: 'keys',
    title: 'Tastenkürzel',
    page: 'settings',
    keywords: 'tasten shortcuts tastatur kürzel',
    body: [
      '• Leertaste: Pause / Weiter',
      '• 1–6: Geschwindigkeit 1×, 2×, 5×, 10×, 30×, 60×',
      '• M: Karte · D: Disposition · A: Auftragsbörse',
      '• F1: Hilfe zur aktuellen Seite · Esc: Fenster schließen',
      '• Rechtsklick auf Fahrzeuge, Aufträge und Fahrer: Kontextmenü',
    ],
  },
];

export const helpForPage = (page: Page) => HELP.find((a) => a.page === page)?.id ?? 'start';
