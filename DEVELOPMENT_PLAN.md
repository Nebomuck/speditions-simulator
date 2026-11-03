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
| 10 | Erweiterte Simulation (Konkurrenz, Ereignisse, Wetter, Regionen) | ⏳ |
| 11 | Feinschliff (Tutorial, Musik, Animationen, Balancing) | ⏳ |
| 12 | Veröffentlichung (Installer, Server-Konfiguration, Abschlusstests) | 🟡 Installer mit eingebautem Multiplayer-Server ✅ · Abschlusstests ⏳ |

## Nächste Schritte (in dieser Reihenfolge)

1. **Phase 10** – KI-Konkurrenz mit eigener Flotte und Finanzen, Ereignisregelwerk (Grundlage: Verkehrsstörungen aus Phase 4), Wetter, Sonntagsfahrverbote, Grenzwartezeiten
2. **Phase 11/12** – Tutorial, Hilfe, Musik, Balancing-Läufe (automatisierte Langzeitsimulation), Installer-Feinschliff (Signatur, Auto-Update)

## Arbeitsweise

- Jede Erweiterung bekommt automatisierte Tests im Simulationskern. Vor jedem Abschluss laufen `npm test` und `npm run typecheck`.
- Spielstand-Änderungen erhöhen `STATE_VERSION` und bekommen eine Migration in `save.ts`.
- Neue Spieleraktionen sind immer `Command`s mit Berechtigung. Dadurch sind sie automatisch multiplayerfähig.

## Fortsetzungshinweis

Wird die Entwicklung unterbrochen, beginnt die nächste Sitzung so:

1. `npm install`, dann `npm test` (erwartet: 78/78 bestanden)
2. FEATURE_CHECKLIST.md und den Abschnitt „Nächste Schritte“ oben lesen
3. Mit Punkt 1 (Phase 10: Erweiterte Simulation) fortfahren. Ereignisse bauen auf `packages/core/src/disruptions.ts` auf, stündliche/tägliche Hooks in `sim.ts`, Auftragsmarkt in `orders.ts`. Einstiegspunkte: `packages/core/src/dispatch.ts` (Planung, Warteschlange `queueJob`/`startNextQueued`, `vehicleSchedule`), `trips.ts` (Ausführung), `apps/client/src/pages/Dispatch.tsx` und `Calendar.tsx` (Oberfläche).
