# Testplan & Testergebnisse

Automatisierte Tests: `npm test` (Vitest). Typprüfung: `npm run typecheck`.

## Automatisierte Tests

| # | Test (Datei) | Prüft | Ergebnis 02.11.2026 |
|---|---|---|---|
| 1 | Straßennetz – Erreichbarkeit (`core.test.ts`) | Alle 161 Städte sind von Berlin aus routbar | ✅ bestanden |
| 2 | Route Leipzig → Prag | Länge plausibel (1,05–1,6 × Luftlinie), echte Geometrie (>20 Punkte), Position liegt auf der Straße | ✅ |
| 3 | **Transporttest** | Disposition → Fahrer/LKW belegt → Position bewegt sich → Lieferung → LKW/Fahrer/Auflieger am Ziel, km-Stand = Routenlänge, Diesel verbraucht, Maut gebucht, Rechnung erstellt | ✅ |
| 4 | **Wirtschaftstest** | Vergütung wird als Forderung erfasst, bei Fälligkeit bezahlt und auf dem Konto gebucht; Maut als Kosten | ✅ |
| 5 | Verspätung | Strafe senkt den Rechnungsbetrag, Kundenzufriedenheit sinkt, Warnung bei der Disposition | ✅ |
| 6 | Monatsabrechnung | Löhne, Miete, Versicherung, Leasing werden vom Firmenkonto gebucht | ✅ |
| 7 | **Fahrertest** | Fahrer mit Tagesruhepflicht fährt während der 11 h Ruhe keinen Meter, danach schon | ✅ |
| 8 | Langstrecke Leipzig → Madrid | Nie > 4,5 h ohne Pause, nie > 9 h/Tag, ≥ 2 Tagesruhen, ≥ 1 Tankstopp | ✅ |
| 9 | **Dispositionstest** | Zweiter Auftrag für denselben LKW/Fahrer/Auflieger wird abgelehnt | ✅ |
| 10 | Aufliegertyp & ADR | Kühlware auf Plane abgelehnt; Gefahrgut ohne ADR abgelehnt | ✅ |
| 11 | Nutzlast | Überladung wird abgelehnt | ✅ |
| 12 | **Speichertest** | Spielstand während der Fahrt speichern/laden → identischer Zustand, identische Position; beide Kopien simulieren 1.500 min **bitgenau identisch** weiter (Determinismus) | ✅ |
| 13 | Beschädigter Spielstand | Manipulierter Spielstand wird per Prüfsumme erkannt | ✅ |
| 14 | **Lebenssimulationstest** | Private Ausgabe ändert nur das Privatkonto, nicht das Firmenkonto | ✅ |
| 15 | GF-Gehalt | Höheres Gehalt → Privatkonto +Gehalt −Lebenshaltung, Firma bucht Gehalt | ✅ |
| 16 | Berechtigungen | Spieler ohne Kaufrecht kann keinen LKW kaufen | ✅ |
| 17 | Warenflussmodell | >200 Angebote; Ursprung erzeugt die Ware; Auflieger passt zur Ladung; Lieferfrist nach Abholung; Median 1,2–3,5 €/km | ✅ |
| 18 | **Performance-Test** | 300 gleichzeitig fahrende LKW, 1 Spieltag < 6 s (gemessen ≈ 0,5 s); Positionen aller Fahrzeuge < 100 ms | ✅ |
| 19 | **Multiplayertest** (`multiplayer.test.ts`) | Echter WebSocket-Server, 2 Clients: Gründen, Beitreten per Code, Kauf durch A sofort bei B sichtbar, B ohne Kaufrecht abgelehnt, **gleichzeitige Disposition desselben LKW → genau einer erfolgreich**, gemeinsame Spielzeit, nur Admin steuert Zeit, Chat, Rechtevergabe, Wiederverbindung per Token, falsches Token abgelehnt, **Serverneustart → Fahrt, Fortschritt und Chat erhalten** | ✅ |

**Gesamt: 19/19 bestanden.**

Noch nicht automatisiert getestet (offen): KI-Disponent (Phase 7, noch nicht implementiert), Lebenssimulation über das Konto hinaus (Phase 8).

## Manuelle Tests (Browser, 02.11.2026)

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
- Das Straßennetz verbindet nur benachbarte Städte. Manche Routen weichen deshalb von der realen Optimalroute ab (z. B. Dresden → Warschau über Berlin statt über Breslau). Abhilfe: Netz um weitere Kanten oder Knoten erweitern.
- Die Multiplayer-Schnappschüsse übertragen jeweils den vollständigen Zustand (~160 KB). Für große Firmen über das Internet sind Delta-Updates geplant.
