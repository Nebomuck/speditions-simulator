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

1. Spielspaß-Paket 2: Premium-Aufträge, die nur manuell disponiert werden können (Schwertransport mit Genehmigung, Messe-Zeitfenster), Szenarien mit eigenem Ziel, Quartalsziele von Bank oder Investor, Erfolge und Rekorde, Fahrer mit Eigenschaften und kleinen Geschichten

## Arbeitsweise

- Jede Erweiterung bekommt automatisierte Tests im Simulationskern. Vor jedem Abschluss laufen `npm test` und `npm run typecheck`.
- Spielstand-Änderungen erhöhen `STATE_VERSION` und bekommen eine Migration in `save.ts`.
- Neue Spieleraktionen sind immer `Command`s mit Berechtigung. Dadurch sind sie automatisch multiplayerfähig.

## Fortsetzungshinweis

Wird die Entwicklung unterbrochen, beginnt die nächste Sitzung so:

1. `npm install`, dann `npm test` (erwartet: 116/116 bestanden; der Abschlusstest `playthrough.test.ts` dauert etwa 70 s)
2. FEATURE_CHECKLIST.md und den Abschnitt „Nächste Schritte“ oben lesen
3. Alle Phasen sind abgeschlossen. Städte ergänzen in `data/cities.ts`, danach `npm run roadnet` (behält alle bisherigen Kanten, K=5 Nachbarn, OSRM-Antworten werden zwischengespeichert). Balancing prüfen mit `node packages/core/test/measure-balance.ts [Tage] [easy|normal|realistic] [Seed]` (Spieler-Bot aus `test/bot.ts`), Welt mit `measure-world.ts`, Störungen mit `measure-disruptions.ts`; stündliche/tägliche/monatliche Hooks in `sim.ts`, Ereignisregeln in `events.ts`, Konkurrenz in `competition.ts`. Einstiegspunkte: `packages/core/src/dispatch.ts` (Planung, Warteschlange `queueJob`/`startNextQueued`, `vehicleSchedule`), `trips.ts` (Ausführung), `apps/client/src/pages/Dispatch.tsx` und `Calendar.tsx` (Oberfläche).
