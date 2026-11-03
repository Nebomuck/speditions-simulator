# Testplan & Testergebnisse

Automatisierte Tests: `npm test` (Vitest). Typprüfung: `npm run typecheck`.

**Stand 03.11.2026: 99/99 bestanden** (4 Testdateien, Laufzeit ≈ 80 s; davon ≈ 70 s für den Abschlusstest, der parallel läuft).

| Datei | Tests | Inhalt |
|---|---|---|
| `packages/core/test/core.test.ts` | 91 | Simulationskern: alle Spielsysteme der Phasen 1–12 |
| `packages/core/test/playthrough.test.ts` | 1 | Abschlusstest: Spielablauf von der Gründung bis Unternehmensstufe 4 |
| `apps/server/test/multiplayer.test.ts` | 4 | echter WebSocket-Server, Konfiguration, Betrieb |
| `apps/client/test/invite.test.ts` | 3 | Einladungen (Adresse/Code) |

## Pflichttests aus dem Master-Prompt (§ 28)

| # | Test | Prüft | Ergebnis |
|---|---|---|---|
| 1 | **Transporttest** | Disposition → Fahrer/LKW belegt → Position bewegt sich → Lieferung → LKW/Fahrer/Auflieger am Ziel, km-Stand = Routenlänge, Diesel verbraucht, Maut gebucht, Rechnung erstellt | ✅ |
| 2 | **Wirtschaftstest** | Vergütung wird als Forderung erfasst, bei Fälligkeit bezahlt und gebucht; Maut als Kosten; Verspätungsstrafe; Monatsabrechnung | ✅ |
| 3 | **Fahrertest** | Fahrer mit Tagesruhepflicht fährt während der 11 h Ruhe keinen Meter; Langstrecke Leipzig → Madrid: nie > 4,5 h ohne Pause, nie > 9 h/Tag, ≥ 2 Tagesruhen | ✅ |
| 4 | **Dispositionstest** | zweiter Auftrag für denselben LKW/Fahrer/Auflieger abgelehnt; Aufliegertyp, ADR, Nutzlast | ✅ |
| 5 | **Speichertest** | Spielstand während der Fahrt speichern/laden → identischer Zustand und Position; beide Kopien simulieren 1.500 min **bitgenau identisch** weiter; Manipulation per Prüfsumme erkannt | ✅ |
| 6 | **Multiplayertest** | 2 Clients: Gründen, Beitreten per Code, Kauf sofort beim anderen sichtbar, fehlende Rechte abgelehnt, **gleichzeitige Disposition desselben LKW → genau einer erfolgreich**, Delta-Sync exakt gleich dem Server, Wiederverbindung per Token, **Serverneustart → Fahrt und Chat erhalten**; zusätzlich 3 Clients mit identischer Sicht und Spielerlimit | ✅ |
| 7 | **Lebenssimulationstest** | private Ausgabe ändert nur das Privatkonto; GF-Gehalt; Bedürfnisse, Wohnen, Beziehungen, Ausschüttung | ✅ |
| 8 | **Automatiktest** | KI-Disponent wählt nach Regeln den wirtschaftlich sinnvollen Auftrag; Vorrang angenommener Aufträge; Rückladungen; Kompetenz; Fahrer-Anreise | ✅ |
| 9 | **Performance-Test** | 300 gleichzeitig fahrende LKW, 1 Spieltag < 6 s (gemessen ≈ 0,9 s); Positionen aller Fahrzeuge < 100 ms | ✅ |

## Abschlusstests (Phase 12)

| Test | Prüft | Ergebnis 03.11.2026 |
|---|---|---|
| **Spielablauf Gründung → Stufe 4** (`playthrough.test.ts`) | Spieler-Bot (`test/bot.ts`) auf „Einfach“, Seed 11: KI-Disposition, Pflege, Kauf/Leasing, Standortausbau, Niederlassungen. **Zu jeder Spielstunde** gelten: Konten ganzzahlig, keine Doppelbelegung von LKW/Fahrer/Auflieger, Fahrzeuge und Fahrer „unterwegs“ nur mit aktiver Fahrt, Zustand 0–100 %, Tank ≥ 0, Lenkzeiten (4,5 h / 9 h / 56 h). Alle 90 Tage Speichern/Laden verlustfrei. | ✅ Stufe 2 an Tag 51, Stufe 3 an Tag 205, **Stufe 4 an Tag 329**; 17 LKW, 3 Standorte, 782 Lieferungen, < 20 % verspätet |
| Speichermigration ab Version 1 | Spielstand im Format von Version 1 (alle späteren Felder entfernt) mit laufender Fahrt wird bis Version 9 migriert; die Fahrt wird zugestellt, ohne Simulationsfehler; Migrationskette lückenlos | ✅ |
| Ungültige Spielstände | neuere Version, fremdes Format, abgeschnittene und leere Datei → verständliche Fehlermeldung | ✅ |
| Simulationsfehler | Ausnahme in der Simulation hält das Spiel an (kein Absturz), Meldung im Protokoll; nach Behebung läuft die Zeit weiter | ✅ |
| Server-Konfiguration | Standardwerte; `cargovia-server.json` (relative Datenbank zum Ordner der Datei); Rangfolge Kommandozeile > Umgebung > Datei; ungültige Werte, unbekannte Schlüssel, fehlende/kaputte Datei mit Meldung | ✅ |
| Server-Betrieb | `/health`, zweiter Server auf belegtem Port scheitert sauber (`EADDRINUSE`), Spielerlimit, 3 Clients konsistent | ✅ |
| Fahrer-Anreise | Kosten und Dauer, unterwegs nicht disponierbar, Ankunft am Ziel; KI-Disponent schickt genau einen überzähligen Fahrer zum LKW ohne Fahrer | ✅ |

## Langzeitmessung (Balancing, kein Test)

`node packages/core/test/measure-balance.ts 540 <Schwierigkeit> 11` (18 Spielmonate mit dem Spieler-Bot):

| Schwierigkeit | Verlauf | Ende |
|---|---|---|
| Einfach | Stufe 4 im 11. Monat, danach 17 → 25 LKW, verspätet meist 6–15 %, Leerfahrten 19–31 % | 25 LKW, Konto 22 T€, keine Kredite |
| Normal | 16 Monate mit 2 LKW (der vorsichtige Bot baut den Firmensitz erst bei 34,5 T€ Guthaben aus), dann Wachstum auf 5 LKW | 5 LKW, Konto 8 T€ |

Gefunden und behoben durch die Messung: Wachsende Firmen ließen LKW am Firmensitz stehen, während neu eingestellte Fahrer an einer Niederlassung warteten – mit 17 LKW waren im Schnitt nur 9 unterwegs. Mit der Fahrer-Anreise sind es 17 von 20. Der Lauf mit dem Stand vor Phase 12 lieferte auf „Normal“ identische Zahlen (kein Rückschritt).

## Manuelle Tests

### 03.11.2026 (Browser, Phase 12)

| Ablauf | Ergebnis |
|---|---|
| Absturz einer Ansicht (absichtlich ausgelöst) | ✅ Meldung „Diese Ansicht ist abgestürzt“ mit Fehlertext, Seitenleiste bedienbar, „Zum Dashboard“ funktioniert |
| Einstellungen → Fehlerprotokoll | ✅ Eintrag mit Zeit, Quelle und Meldung; Programmversion 0.11.1 angezeigt |
| LKW in Leipzig ohne Fahrer, Fahrer in Dresden: Rechtsklick → „Anreise nach Leipzig (LKW wartet) · 2 h 32 min, 51 €“ | ✅ Fahrer reist, Status „Anreise nach Leipzig, an Mo 04.01.2027 12:35“, Kosten gebucht |
| Server: `--version`, `--port 0x`, belegter Port, `/health` | ✅ `0.11.1`; „muss eine ganze Zahl von 1 bis 65535 sein“; „Port 18795 ist bereits belegt.“ (Exit 1, erster Server läuft weiter); JSON mit Version und Laufzeit |
| In-App-Update 0.11.0 → 0.11.1 in benutzerdefiniertem Ordner (`E:\Spiele\Cargovia`) | ✅ Update landet im Ordner des laufenden Programms, Desktop-Verknüpfung startet danach die neue Version |

### 02.11.2026 (Browser, Phasen 1–3)

| Ablauf | Ergebnis |
|---|---|
| Firma gründen (Normal, Leipzig) | ✅ Dashboard mit 25.000 €, 1 LKW, 1 Fahrer |
| Auftragsbörse: Filter, Sortierung nach Gewinnschätzung | ✅ 320 Angebote, plausible Werte |
| Dispositionsdialog aus der Börse (Dresden → Warschau) | ✅ vorausgefüllt, Kalkulation 567 € Gewinn, Fahrt gestartet |
| Live-Karte: Route auf echter Straße, Leerfahrt gestrichelt, LKW bewegt sich, Pause gelb, Ruhezeit violett | ✅ |
| Fahrzeugfenster: Position, Ladung, Reststrecke, ETA, Tank, Zustand, Lenkzeiten, Fahrtverlauf | ✅ (Fehler bei ETA-Anzeige mit Nachkommastellen gefunden und behoben) |
| Autosave beim Tageswechsel laden und weiterspielen | ✅ |
| Lieferung pünktlich → Rechnung offen, Maut gebucht | ✅ |
| Multiplayer: Firma auf lokalem Server gründen, Seite neu laden, „Letzte Sitzung fortsetzen“ | ✅ (Absturz der Team-Seite gefunden: `scrollIntoView` liefert in aktuellen Browsern ein Promise zurück, das der useEffect weitergab → behoben) |

## Bekannte Probleme

- Diesel wird erst beim Tanken gebucht. Eine Fahrt ohne Tankstopp zeigt daher 0 € Dieselkosten im Fahrtprotokoll; die Kosten fallen beim nächsten Tanken an. Die Vorkalkulation berücksichtigt den Verbrauch korrekt.
- Das Straßennetz verbindet nur benachbarte Städte. Manche Routen weichen deshalb von der realen Optimalroute ab (z. B. Dresden → Warschau über Berlin statt über Breslau).
- Der Installer ist nicht mit einem Code-Signing-Zertifikat signiert; Windows SmartScreen warnt beim ersten Start. Die In-App-Updates sind per minisign signiert und werden geprüft.
- Im Modus „teilautomatisch“ schlägt der Disponent noch keine Fahrer-Anreise vor; die vollautomatische Disposition und das Kontextmenü können es.
