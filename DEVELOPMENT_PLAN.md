# Entwicklungsplan

## Status-Übersicht

| Phase | Inhalt | Stand |
|---|---|---|
| 1 | Projektfundament: Technik, Struktur, Desktop-App, Navigation, Design, Speicher, Zeit, Zustand | ✅ abgeschlossen |
| 2 | Europakarte: Städte, echtes Routing, Routenanzeige, fahrender LKW, Live-Position, Filter, Detailfenster | ✅ abgeschlossen |
| 3 | Speditionsgrundsystem: Gründung, Kapital, Fahrzeugkauf, Fahrer, Aufträge, Disposition, Durchführung, Erlöse/Kosten | ✅ abgeschlossen |
| 4 | Umfangreiche Disposition | ✅ abgeschlossen: Zeitstrahl, Fahreransicht, Konfliktprüfung, Ladungsarten, Rückladungssuche, Überführung, Kalender (Tag/Woche/Monat), Vorausplanung/Tourenketten, Solo-LKW/Transporter, Teilladungen, Beiladung (Multi-Stopp-Touren), Verkehrsstörungen mit automatischer Umleitung |
| 5 | Wirtschaft & Management | ✅ abgeschlossen: Rechnungen, Mahnungen, Ausfälle, Leasing, Wartung, Reparaturen, Kredite, Factoring, Fahrzeugfinanzierung, Kurzzeitmiete, Inzahlungnahme, Rahmenverträge, Personal (Urlaub, Krankheit, Schulungen, Gehalt, Gespräche, Kündigungen) |
| 6 | Unternehmensausbau | ✅ abgeschlossen: Unternehmensstufen 1–6, Niederlassungen in ganz Europa, Standortstufen, eigene Werkstatt, Betriebstankstelle, Lagerhalle, Abteilungen (Disposition, Vertrieb, Buchhaltung, Fuhrparkmanagement), Beförderung, Flottenübersicht mit Sammelwartung und Lieferort |
| 7 | Automatisierung (KI-Disponenten) | ✅ abgeschlossen: Disponenten mit Kompetenz (Einsteiger/Erfahren/Profi), manuelle, teil- und vollautomatische Disposition, Regeln (Mindestgewinn, Leer-km, Ladungsarten, Länder, Stammkunden, sichere Termine, nächstes Fahrzeug, Rückladungen, Rückführung), Reaktion auf Verspätungen |
| 8 | Lebenssimulation | ✅ abgeschlossen: Hintergrund und Fähigkeiten, Bedürfnisse mit Erschöpfung, Work-Life-Balance (Arbeitsstil bestimmt eigene Disposition), Freizeit, Urlaub, Wohnungen/Haus/Villa mit Immobilienkredit, Ferienhaus, Privatwagen, Einrichtung, Freundschaften, Partnerschaft, Familie, Hobbys, Ziele, Gewinnausschüttung |
| 9 | Multiplayer | ✅ abgeschlossen: Server, Einladung, Rollen und Rechte mit Ausgabenlimit und Niederlassungsbeschränkung, Delta-Synchronisation, Firmenchat, interne Nachrichten, Aufgabenverteilung, gemeinsame Aktivitäten, Abstimmungen, Benachrichtigungen, Wiederverbindung, Backups, TLS-Proxy-Anleitung |
| 10 | Erweiterte Simulation | ✅ abgeschlossen: Wetter je Land, Unfälle und Reifenschäden, Fahrverbote, Zollgrenzen mit Wartezeiten, Konjunktur und regionale Nachfrage, wirtschaftlich simulierte KI-Konkurrenz (Abwerbung, Rückgewinnung, Konkurs), Ereignisregelwerk mit Fairnessregeln, Seite „Markt & Wettbewerb“ |
| 11 | Feinschliff | ✅ abgeschlossen: Balancing mit Langzeit-Bot (Raten, Leerfahrten, Planung mit Fahrverboten und Wochenruhe, Ruhe an der Ladestelle), Tutorial „Erste Schritte“, Hilfesystem (F1), generative Musik und Büroatmosphäre, Telefon bei Kundenanrufen, Kontextmenüs, Animationen, benutzerdefinierter Schwierigkeitsgrad |
| 12 | Veröffentlichung (Installer, Server-Konfiguration, Abschlusstests) | ✅ abgeschlossen: Installer mit eingebautem Server und In-App-Update ✅ · Server-Konfiguration und /health ✅ · Fehlerbehandlung (Fehlergrenzen, Fehlerprotokoll, Simulationsfehler hält an) ✅ · Speichermigration ab Version 1 getestet ✅ · Abschlusstest Gründung → Stufe 4 ✅ · Fahrer-Anreise ✅ · Code-Signatur bewusst nicht vorgesehen (Kosten lohnen sich für das private Projekt nicht) |

## Nächste Schritte (in dieser Reihenfolge)

Spielspaß-Paket 1 (0.14.0) ist umgesetzt: Entscheidungskarten, Ausschreibungen gegen die Konkurrenz, entschärfte Lebenssimulation (Fokus Firma, Wochenroutine).

Spielspaß-Paket 2 (unveröffentlicht) ist umgesetzt: Premium-Aufträge (Schwertransport mit Genehmigung, Messe-Termin), Szenarien, Quartalsziele der Hausbank mit Bonität, Erfolge und Rekorde, Fahrereigenschaften mit kleinen Geschichten.

Spielspaß-Paket 3 (0.16.x) ist umgesetzt: Subunternehmer, Übernahmen, Branchenblatt (als Zeitungs-Popup), Firmenverkauf mit Neustart-Bonus.

Ausbau-Paket A (0.17.0), B (0.18.0), C (0.19.0) und D (0.20.0) sind veröffentlicht. Paket E ist in Arbeit: E1 ist als 0.21.0 veröffentlicht, als Nächstes folgt E2.

### Ausbau-Plan (beschlossen am 20.11.2026)

Bestand vorab geprüft: Fähren gibt es im Routing. Beim Tanken gab es bisher nur eine grobe Preisstaffel. Alles Folgende ist neu.

**Paket A – Fahralltag (0.17.0)** – ✅ umgesetzt (Tests in `packageA.test.ts`)
1. **Tankstrategie:** Dieselpreis je Land (Faktor zum Marktpreis, z. B. Luxemburg −12 %, Schweiz +12 %).
   - Strategie je Firma: „Reserve“ (bisher) oder „Günstig tanken“, die in billigen Ländern ab 65 % Tankstand nachtankt.
   - Tankkarten: Basis (−2 %, 25 € je Fahrzeug und Monat) und Premium (−4 %, 60 €).
   - Länderpreise unter Fuhrpark, die Vorkalkulation rechnet die Kartenrabatte mit ein.
2. **Kontrollen und Bußgelder:** Straßenkontrollen während der Fahrt, Häufigkeit je Land (Deutschland, Frankreich, Österreich häufiger).
   - Geprüft werden Fahrzeugzustand (Mängel unter 50 %), Ladungssicherung (Erfahrung), Tempo (Bleifuß) und Tachograph (Zuverlässigkeit).
   - Folgen: 30–90 min Aufenthalt, Bußgeld 150–2.500 €, bei schweren Mängeln Weiterfahrt erst nach Reparatur vor Ort.
   - Das Fuhrparkmanagement senkt die Quote. Meldung im Log, Ereignis im Branchenblatt.
3. **Doppelbesatzung:** zweiter Fahrer im LKW.
   - Ist der aktive Fahrer erschöpft, wechseln beide ohne Halt. Mitfahren zählt als Fahrtunterbrechung, Tages- und Wochenruhe nur im stehenden LKW.
   - So sind etwa 18 h Fahrt je 29 h möglich.
   - Disposition mit zweiter Fahrerauswahl, Vorkalkulation mit Team-Lenkzeiten, beide Fahrer gebunden, Spesenzuschlag je Tag.

**Paket B – Identität und Ausstattung (0.18.0)** – ✅ umgesetzt (Tests in `packageB.test.ts`)
4. **Fahrzeugausstattung:**
   - Standklima und Kühlschrank: Fahrerzufriedenheit.
   - Retarder: weniger Verschleiß.
   - Notbrems- und Spurhalteassistent: weniger Unfälle.
   - Aerodynamikpaket: weniger Verbrauch.
   - Einbau in der Werkstatt mit Kosten. Die Ausstattung steigert den Wiederverkaufswert.
5. **Firmenlackierung:** Farben und ein einfaches Logo (Form, Kürzel). Die Lackierung erscheint auf Fahrzeugbildern, Kartenmarkern und im Branchenblatt.
6. **Marketing und Messen:**
   - Regionale Kampagne: mehr Angebote und längere Exklusivzeit in einem Land, 30 Tage.
   - Messestand: neue Großkunden und ein Vertragsangebot.
   - Online-Auftritt: dauerhaft etwas mehr Ruf, monatliche Kosten.

**Paket C – Zukunft des Transports (0.19.0)** – ✅ umgesetzt (Tests in `packageC.test.ts`)
7. **Alternative Antriebe:** Elektro-LKW (Reichweite, Ladestopps, Ladesäule als Einrichtung) und LNG-LKW.
   - Die Maut richtet sich nach CO₂-Klasse. Strom- und LNG-Preis laufen mit.
   - „Grüne“ Kunden zahlen Aufschläge und verlangen einen Anteil emissionsarmer Fahrzeuge.
8. **Kombinierter Verkehr:** Bahnverbindungen als eigene Kanten im Netz (z. B. Rollende Landstraße über den Brenner, Freiburg–Novara, Köln–Verona).
   - Die Fahrt auf der Bahn zählt als Ruhezeit und kostet je Auflieger.
   - Die Routenwahl bietet die Bahn an, wenn sie schneller oder günstiger ist.

**Paket D – Wettbewerbs-Multiplayer (eigener Umbau, ab 0.20.0)**
9. Mehrere Firmen auf einem Server mit gemeinsamer Börse und Welt, Weitergabe von Aufträgen an Mitspieler-Firmen, Rangliste.
   - Voraussetzung: Der Spielstand muss mehrere Firmen tragen. Das betrifft `GameState.company` → `companies`, Befehle mit Firmenbezug und die Delta-Synchronisation je Firma.
   - Zuerst Konzept und Migrationspfad, dann Umsetzung in Schritten.
   - Konzept liegt vor: [KONZEPT_WETTBEWERB.md](KONZEPT_WETTBEWERB.md). Architektur: Welt plus Firmen-Shards mit einer Firmenansicht, Schritte D1–D6.
   - D1 ✅ umgesetzt (`shard.ts`, Tests in `shard.test.ts`).
   - D2 ✅ umgesetzt (Tick mit Welt- und Firmenschritten in `sim.ts`, `addCompany`, Tests in `world.test.ts`).
   - D3 ✅ umgesetzt (gemeinsame Börse mit Preis je Firma, Vergabe an die annehmende Firma, Kundenbeziehung je Firma, Tests in `market.test.ts`).
   - D4 ✅ umgesetzt (Wettbewerbswelt auf dem Server: Welt- und Team-Code, Sicht je Spieler, Zeit per Abstimmung, Weltchat, Mitbewerber auf der Karte; Tests in `arena.test.ts` und im Servertest).
   - D5 ✅ umgesetzt (Rangliste, Ausschreibungen mit verdeckten Geboten je Firma, Branchenblatt je Firma, Subunternehmer zwischen Spielerfirmen; Tests in `rivalry.test.ts`).
   - D6 ✅ umgesetzt (KI-Konkurrenz je Firma, Balancing mit Bots in gemeinsamer Welt, Lasttest mit 4 Firmen; Tests in `worldload.test.ts`, Messwerte in KONZEPT_WETTBEWERB.md).
   - Paket D ist vollständig und als 0.20.0 veröffentlicht.

**Paket E – Logistikdienstleister (ab 0.21.0)** – Konzept: [KONZEPT_PAKET_E.md](KONZEPT_PAKET_E.md), Release je Schritt
10. **E1 Analyse & Planungshilfen (0.21.0):** Nachkalkulation je Fahrt, Berichte nach Kunde, Fahrzeug, Fahrer und Strecke, Liquiditätsprognose, Engpass-Warnungen, CSV-Export. ✅ umgesetzt (`analytics.ts`, Seite „Auswertung“, Tests in `analytics.test.ts`).
11. **E2 Lager & Kontraktlogistik (0.22.0):** Lagerverträge mit Ein- und Auslagerungstouren, Umschlag über das Lager, Lagerpersonal, Hallenausbau.
12. **E3 Häfen & Container (0.23.0):** Terminals mit Zeitfenstern und Wartezeiten, Import-, Leer- und Exportkreislauf mit Standgeld und Annahmeschluss.
13. **E4 Karriere-Kampagne (0.24.0):** fünf Kapitel mit Geschichte, Zielen, Sternen, Rivale und Mentorin, Freischaltung der Systeme je Kapitel.
   - Als Nächstes: E2.

## Arbeitsweise

- Jede Erweiterung bekommt automatisierte Tests im Simulationskern. Vor jedem Abschluss laufen `npm test` und `npm run typecheck`.
- Spielstand-Änderungen erhöhen `STATE_VERSION` und bekommen eine Migration in `save.ts`.
- Neue Spieleraktionen sind immer `Command`s mit Berechtigung. Dadurch sind sie automatisch multiplayerfähig.

## Fortsetzungshinweis

Wird die Entwicklung unterbrochen, beginnt die nächste Sitzung so:

1. `npm install`, dann `npm test` (erwartet: 205/205 bestanden; der Abschlusstest `playthrough.test.ts` dauert etwa 70 s)
2. FEATURE_CHECKLIST.md und den Abschnitt „Nächste Schritte“ oben lesen
3. Alle Phasen sind abgeschlossen. Städte ergänzen in `data/cities.ts`, danach `npm run roadnet` (behält alle bisherigen Kanten, K=5 Nachbarn, OSRM-Antworten werden zwischengespeichert). Balancing prüfen mit `node packages/core/test/measure-balance.ts [Tage] [easy|normal|realistic] [Seed]` (Spieler-Bot aus `test/bot.ts`), Welt mit `measure-world.ts`, Störungen mit `measure-disruptions.ts`; stündliche/tägliche/monatliche Hooks in `sim.ts`, Ereignisregeln in `events.ts`, Konkurrenz in `competition.ts`. Einstiegspunkte: `packages/core/src/dispatch.ts` (Planung, Warteschlange `queueJob`/`startNextQueued`, `vehicleSchedule`), `trips.ts` (Ausführung), `apps/client/src/pages/Dispatch.tsx` und `Calendar.tsx` (Oberfläche).
