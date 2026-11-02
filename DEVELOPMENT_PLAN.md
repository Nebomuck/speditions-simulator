# Entwicklungsplan

## Status-Übersicht

| Phase | Inhalt | Stand |
|---|---|---|
| 1 | Projektfundament: Technik, Struktur, Desktop-App, Navigation, Design, Speicher, Zeit, Zustand | ✅ abgeschlossen |
| 2 | Europakarte: Städte, echtes Routing, Routenanzeige, fahrender LKW, Live-Position, Filter, Detailfenster | ✅ abgeschlossen |
| 3 | Speditionsgrundsystem: Gründung, Kapital, Fahrzeugkauf, Fahrer, Aufträge, Disposition, Durchführung, Erlöse/Kosten | ✅ abgeschlossen |
| 4 | Umfangreiche Disposition | 🟢 weitgehend: Zeitstrahl, Fahreransicht, Konfliktprüfung, Ladungsarten, Rückladungssuche, Überführung, Kalender (Tag/Woche/Monat), Vorausplanung/Tourenketten, Solo-LKW/Transporter, Teilladungen ✅ · Mehrfachbeladung (mehrere Teilladungen gleichzeitig), Umleitung bei Störungen ⏳ |
| 5 | Wirtschaft & Management | 🟡 teilweise: Rechnungen, Mahnungen, Ausfälle, Leasing, Wartung, Reparaturen, Kredite, Factoring ✅ · Verträge, Personalgespräche/Schulungen/Urlaub ⏳ |
| 6 | Unternehmensausbau | 🟡 Standortstufen mit Kapazität ✅ · Niederlassungen, Werkstatt, Lager, Abteilungen, Stufen ⏳ |
| 7 | Automatisierung (KI-Disponenten) | ⏳ |
| 8 | Lebenssimulation | 🟡 Charakter, Privatkonto, GF-Gehalt ✅ · Bedürfnisse, Wohnen, Freizeit, Beziehungen ⏳ |
| 9 | Multiplayer | 🟡 Server, Einladung, Rechte, Synchronisation, Chat, Wiederverbindung, Backups ✅ · interne Nachrichten, Aufgaben, gemeinsame Aktivitäten, Delta-Sync ⏳ |
| 10 | Erweiterte Simulation (Konkurrenz, Ereignisse, Wetter, Regionen) | ⏳ |
| 11 | Feinschliff (Tutorial, Musik, Animationen, Balancing) | ⏳ |
| 12 | Veröffentlichung (Installer, Server-Konfiguration, Abschlusstests) | 🟡 Installer mit eingebautem Multiplayer-Server ✅ · Abschlusstests ⏳ |

## Nächste Schritte (in dieser Reihenfolge)

1. **Phase 4 – Rest**
   - Mehrfachbeladung: mehrere Teilladungen gleichzeitig auf einem Fahrzeug (Multi-Stopp-Touren mit Lade-/Entladereihenfolge)
   - Umleitung bei Störungen (setzt Ereignisse aus Phase 10 voraus; Grundlage: Routing mit gesperrten Kanten)
2. **Phase 5**
   - Fahrzeugfinanzierung, Inzahlungnahme (Kredite/Factoring ✅ seit 0.4.0)
   - Rahmenverträge mit Stammkunden (Mindestkapazität, regelmäßige Touren, Vertragsstrafen); Kundenzufriedenheit beeinflusst Angebotsmenge und -qualität
   - Personal: Urlaub, Krankheit, Schulungen (ADR-Kurs), Gehaltsanpassung, Kündigungen bei Unzufriedenheit
3. **Phase 6** – Niederlassungen in anderen Städten, eigene Werkstatt (günstigere Wartung), Tankanlage, Lager, Abteilungen, Unternehmensstufen
4. **Phase 7** – KI-Disponent als Mitarbeiter: regelbasierte Auswahl (Mindestgewinn, max. Leer-km, Regionen, Stammkunden) über `estimateTrip` + `validateDispatch`; Qualität bestimmt Fehlerrate und Suchtiefe
5. **Phase 8** – Bedürfnisse über die Zeit, Tagesplanung des Charakters, Wohnungen/Häuser, Freizeit, Beziehungen
6. **Phase 9** – interne Nachrichten, Aufgabenverteilung, Delta-Synchronisation, Server-Konfiguration für das Internet (TLS-Proxy)
7. **Phase 10** – KI-Konkurrenz mit eigener Flotte und Finanzen, Ereignisregelwerk, Wetter, Sonntagsfahrverbote, Grenzwartezeiten
8. **Phase 11/12** – Tutorial, Hilfe, Musik, Balancing-Läufe (automatisierte Langzeitsimulation), Installer-Feinschliff (Signatur, Auto-Update)

## Arbeitsweise

- Jede Erweiterung bekommt automatisierte Tests im Simulationskern. Vor jedem Abschluss laufen `npm test` und `npm run typecheck`.
- Spielstand-Änderungen erhöhen `STATE_VERSION` und bekommen eine Migration in `save.ts`.
- Neue Spieleraktionen sind immer `Command`s mit Berechtigung. Dadurch sind sie automatisch multiplayerfähig.

## Fortsetzungshinweis

Wird die Entwicklung unterbrochen, beginnt die nächste Sitzung so:

1. `npm install`, dann `npm test` (erwartet: 33/33 bestanden)
2. FEATURE_CHECKLIST.md und den Abschnitt „Nächste Schritte“ oben lesen
3. Mit Punkt 2 (Phase 5: Verträge, Personal) fortfahren; Mehrfachbeladung aus Phase 4 bei Bedarf. Einstiegspunkte: `packages/core/src/dispatch.ts` (Planung, Warteschlange `queueJob`/`startNextQueued`, `vehicleSchedule`), `trips.ts` (Ausführung), `apps/client/src/pages/Dispatch.tsx` und `Calendar.tsx` (Oberfläche).
