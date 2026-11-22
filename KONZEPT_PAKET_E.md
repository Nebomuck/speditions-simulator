# Konzept: Paket E „Logistikdienstleister“

Stand: 21.11.2026 · Grundlage für die Umsetzung ab 0.21.0

## Ziel

Die Spedition wird zum Logistikdienstleister. Vier Themen, jedes für sich spielbar und getestet:

| Schritt | Thema | Kern |
|---|---|---|
| E1 | Analyse & Planungshilfen | Rentabilität je Tour, Kunde, Fahrzeug und Fahrer, Liquiditätsprognose, Engpass-Warnungen, Export |
| E2 | Lager & Kontraktlogistik | Lagerverträge mit Kunden statt pauschaler Auslastung, Ein- und Auslagerungstransporte, Umschlag |
| E3 | Häfen & Container | Containerterminals mit Zeitfenstern und Wartezeiten, Leercontainer-Rückgabe, Standgeld |
| E4 | Karriere-Kampagne | Geführter Spielmodus in Kapiteln, der alle Systeme nacheinander einführt |

**Reihenfolge:**
- Analyse zuerst: Sie hilft beim Balancing der folgenden Schritte.
- Die Kampagne zuletzt: Sie baut auf Lager und Häfen auf.

Einzelspiel, kooperativer Multiplayer und Wettbewerbswelt bleiben spielbar. Alte Spielstände laden weiter; neue Felder bekommen Startwerte per Migration (Spielstand-Version 14).

## Bestand

- **Lager:**
  - Die Lagerhalle ist eine Einrichtung (2.000 Palettenplätze, 140.000 €, ab Stufe 3).
  - Die Auslastung folgt pauschal Ruf und Vertrieb, der Erlös wird monatlich gebucht.
  - Eine Lagerhalle macht die Stadt außerdem häufiger zum Ladeort.
  - Konkrete Kunden, Mengen oder Transporte gibt es nicht.
- **Häfen und Container:**
  - 62 Städte sind als Hafen markiert (Industrie `port`).
  - Ladungen „Seecontainer“ (Import) und „Exportcontainer“ fahren auf dem Containerchassis.
  - Am Hafen verhalten sie sich wie jede andere Ladung: keine Terminalzeiten, keine Leercontainer.
- **Auswertung:**
  - Statistik zeigt Tageseinnahmen, Tagesausgaben und Kontostand.
  - Die Finanzseite führt das Buchungsjournal.
  - Fahrten kennen ihre Schätzung (`TripEstimate`), aber keine Nachkalkulation.
- **Szenarien:**
  - Es gibt vier Szenarien mit Ziel, Frist und Prüfungen (`scenarios.ts`) sowie Quartalsziele und Erfolge.
  - Eine Folge von Abschnitten mit Geschichte fehlt.

## E1 – Analyse & Planungshilfen

**Nachkalkulation je Fahrt**
- Abgeschlossene Fahrten bekommen eine Abrechnung mit Erlös (nach Vertragsstrafe), Kraftstoff bzw. Energie, Maut, Bahn oder Fähre, anteiligem Fahrerlohn nach Stunden und Verschleiß.
- Daraus ergibt sich der Deckungsbeitrag und der Vergleich zur Schätzung.
- Gespeichert wird eine kompakte Zeile je Fahrt, die letzten 365 Tage.

**Berichte (neue Seite „Auswertung“)**
- **Zeiträume:** 30, 90 und 365 Tage.
- **Kunden:** Umsatz, Deckungsbeitrag, Touren, Pünktlichkeit, Zahlungsdauer.
- **Fahrzeuge:** Auslastung (Fahrzeit an der verfügbaren Zeit), beladene und leere Kilometer, Kosten je km, Deckungsbeitrag, Standzeiten.
- **Fahrer:** Kilometer, Touren, Pünktlichkeit, Verbrauch gegenüber dem Durchschnitt, Lohn je Tour.
- **Strecken und Länder:** die besten und schlechtesten Relationen nach Deckungsbeitrag je km.

**Liquiditätsprognose**
- **Zeitraum:** 30 Tage im Voraus.
- **Fest:** Leasing, Kreditraten, Gehälter, Mieten und Einrichtungen.
- **Erwartet:** Zahlungseingänge offener Rechnungen nach Zahlungsmoral, Durchschnitt des laufenden Geschäfts.
- **Warnung:** wenn der Kontostand unter null fallen würde.

**Engpass-Warnungen im Dashboard**
- Mehr Fahrzeuge als einsatzfähige Fahrer.
- Fällige Wartungen.
- Fahrer kurz vor der Wochenhöchstarbeitszeit.
- Aufträge ohne passenden Auflieger.
- Auslastung unter 50 % über zwei Wochen.

**Export:** Berichte und Buchungsjournal als CSV (Dateidialog der Desktop-App, im Browser als Download).

**Stand E1 (umgesetzt):**
- `analytics.ts` führt die Nachkalkulation (`tripRecords`, firmenbezogen, 400 Tage). Kraftstoff wird je km mitgezählt und zum mittleren Landespreis von Start und Ziel bewertet.
- Neue Felder sind optional; ein Spielstand-Versionssprung war für E1 nicht nötig (Version 14 kommt mit E2).
- Vergleichslauf: Spielablauf gegenüber 0.20.0 unverändert (gleicher Fingerabdruck ohne die neuen Felder).
- Seite „Auswertung“ mit Berichten, Fahrten, Liquidität und CSV-Export; Engpass-Warnungen im Dashboard.

## E2 – Lager & Kontraktlogistik

**Lagerverträge**
- Kunden mit Lagerbedarf (Industrie, Handel, Lebensmittel) bieten Verträge an, über den Vertrieb oder als Ausschreibung:
  - Palettenplätze (100–800), Laufzeit (3–12 Monate)
  - Lagergeld je Platz und Monat
  - Umschlaggebühr je Palette
- Belegung = Summe der Verträge. Die pauschale Auslastung entfällt, Bestandshallen bekommen Startverträge in Höhe ihrer bisherigen Auslastung.

**Warenfluss**
- **Einlagerung:** Jeder Vertrag erzeugt regelmäßige Komplettladungen vom Werk des Kunden ins Lager.
- **Auslagerung:** Kleinere Verteiltouren (Teilladungen) vom Lager zu Handels- und Industriestädten im Umkreis.
- Diese Aufträge gehören nur der eigenen Firma, erscheinen also nicht in der Börse. Sie haben feste Fenster wie Rahmenvertragstouren.
- Wer sie nicht fährt, kann sie an Subunternehmer abgeben. Verpasste Touren kosten Zufriedenheit und am Ende den Vertrag.

**Umschlag (Cross-Docking)**
- Sammelgut aus mehreren Teilladungen wird im eigenen Lager gebündelt.
- Eine Börsen-Teilladung mit Ziel in der Nähe eines eigenen Lagers lässt sich „über das Lager“ planen: Vorlauf ins Lager, Weiterlauf gebündelt.
- Ertrag: Umschlaggebühr plus bessere Auslastung der Weiterlauf-Touren.

**Lagerbetrieb**
- Neue Abteilung „Lager“ (Lagerarbeiter, Lagerleitung).
- Durchsatz je Tag hängt am Personal. Zu wenig Personal macht Ein- und Auslagerungen spät und erzeugt Fehlmengen-Ereignisse.
- Hallenausbau in Stufen: 2.000 → 5.000 → 10.000 Plätze, ab Stufe 4 bzw. 5.

**Oberfläche:** Standorte → Reiter „Lager“ mit Belegung je Halle, Verträgen, Warenfluss der Woche, Personal und Erlösen.

**Stand E2 (umgesetzt):**
- `storage.ts`: Lagerverträge (`storageContracts`, firmenbezogen), Hallenzustand am Standort (`warehouse`: Ausbaustufe, Personal, Umschlag), Lagertouren am Auftrag (`storage`).
- Abweichungen vom Konzept:
  - Lagerpersonal wird je Halle als Anzahl geführt (keine eigene Büroabteilung, braucht keine Büroplätze).
  - Ausschreibungen für Lagerverträge entfallen vorerst; Angebote kommen über den Vertrieb.
- Neu gegenüber dem Konzept: automatische Vergabe nicht gefahrener Lagertouren an Subunternehmer (je Vertrag abschaltbar). Ohne sie verlor die KI-Disposition im Bot-Lauf Verträge binnen zwei Wochen.
- Größe der Angebote nach Flotte (etwa 90 Plätze je Fahrzeug).
- Bestandshallen: Startvertrag (6 Monate, Umschlag 0,5) beim ersten Tageswechsel, Spielstand-Version 14.
- Vergleichslauf: Ohne Lagerhalle ist der Spielablauf gegenüber 0.21.0 unverändert (gleicher Fingerabdruck, abgesehen von der Versionsnummer).

## E3 – Häfen & Container

**Terminals**
- Ausgewählte große Häfen bekommen ein Containerterminal: Hamburg, Bremen (Bremerhaven), Rotterdam, Antwerpen, Le Havre, Felixstowe, Gdańsk, Genua, Triest, Koper, Barcelona, Valencia, Algeciras, Piräus (Athen).
- Jedes Terminal hat eine Auslastung je Tag mit Wartezeit am Tor (0,5–6 h).
- **Ereignisse:** Großschiff, Streik, Sturm.
- Die Karte zeigt Terminals mit Ampel.

**Zeitfenster (Slots)**
- Containeraufträge am Terminal haben ein Zeitfenster von 2 Stunden.
- Wer zu früh kommt, wartet. Wer zu spät kommt, verliert den Slot und wartet auf den nächsten freien (Strafe für Wartezeit).
- Disposition und KI-Disposition planen das Fenster ein.

**Import-Kreislauf**
1. Vollen Container am Terminal holen.
2. Zum Empfänger liefern, dort entladen.
3. Leercontainer ins Depot bzw. Terminal zurückbringen.
- Gratistage für den Container: 5. Danach kostet jeder Tag Standgeld (Detention), das der Spediteur trägt, wenn er zu spät zurückgibt.
- Die Rückgabe ist ein eigener Auftrag mit Erlös (kleine Pauschale).
- Sie lässt sich mit einem Export verbinden („Leercontainer zum Verlader, voll zurück zum Hafen“). Das ist der Kern des Container-Spiels.

**Export:** Leercontainer am Depot holen, beim Verlader beladen, vor dem Annahmeschluss des Schiffs am Terminal abliefern. Wer zu spät kommt, verpasst das Schiff und zahlt eine hohe Strafe.

**Börse:** Containeraufträge kommen häufiger und als Kreislauf (Import, Leer, Export). Container-Kunden (Reedereien und Spediteure) sind eigene Kunden mit Zahlungsmoral.

**Stand E3 (umgesetzt):**
- `containers.ts`: Terminalzustand als reine Funktion aus Weltsamen, Ort und Zeit. Kein Weltfeld nötig, keine Zufallszahlen der Simulation; in der Wettbewerbswelt sehen alle Firmen dieselbe Lage.
- Containerkreislauf am Auftrag (`container`: Phase, Terminal, Gratistage, Standgeld, Gestellung, Street-Turn). Neue Ladungsart „Leercontainer“ (nie in der Börse).
- Abweichungen vom Konzept:
  - Kein eigenes Depot: Das Terminal ist zugleich Leercontainer-Depot.
  - Container-Kunden sind die Hafenkunden (Branche Hafen) mit eigener Zahlungsmoral.
  - Der Slot gilt für die Abholung am Terminal. Bei der Abgabe zählt der Annahmeschluss mit der Ankunft am Tor.
- Spielstand-Version bleibt 14 (nur optionale Felder).
- **Vergleichslauf** über 8 Startwerte × 90 Tage, Bot ohne Containerchassis:
  - vorher 58,8 Lieferungen und 904 € Konto im Mittel, nachher 53 Lieferungen und 656 € (mit stärker erhöhter Containerhäufigkeit).
  - Die Häufigkeit wurde danach auf 2,3 (Import) und 1,5 (Export) zurückgenommen.
- **Abschlusstest:** Der Bot erreicht Stufe 4 jetzt an Tag 655 statt 509, bei mehr Lieferungen (1.754 statt 1.367 bis zum Ende).
  - Er eröffnet die dritte Niederlassung später, weil sein Kontostand länger unter 60.000 € bleibt.
  - Die Grenze des Tests wurde von 600 auf 720 Tage angehoben.
- **Weitere Testanpassungen:** Stichproben in zwei statistischen Tests vergrößert. Der Delta-Test kopiert den ersten Zustand wie eine echte Verbindung, denn geteilte Objekte zeigten sonst veraltete Störungen.

## E4 – Karriere-Kampagne

Neue Spielart „Karriere“ im Gründungsdialog. Nur im Einzelspiel (im Multiplayer ohne Kapitel).

**Fünf Kapitel**
- Jedes Kapitel hat eine Einführung (kurze Geschichte) und 3–4 Ziele mit Frist.
- Feste Ereignisse treiben die Handlung, ein Abschluss vergibt Sterne nach benötigter Zeit.
- Neue Systeme werden kapitelweise freigeschaltet. Im freien Spiel ist alles offen wie bisher.

| Kapitel | Titel | Ziele (Beispiele) | Freischaltung |
|---|---|---|---|
| 1 | Ein LKW, ein Traum | 15 Lieferungen, zweiter LKW, Kontostand positiv | – |
| 2 | Stammkunden | 2 Rahmenverträge, Ruf 60, erster Disponent | Ausschreibungen, KI-Disposition |
| 3 | Über die Grenze | Niederlassung im Ausland, 30 % Auslandsumsatz, 10 LKW | Niederlassungen im Ausland |
| 4 | Logistikdienstleister | Lagerhalle mit 2 Lagerverträgen, 40 Container-Touren | Lager, Container |
| 5 | Marktführer | Platz 1 der Rangliste, Unternehmensstufe 6 | – |

- **Rivale:** Eine erfundene Konkurrenzspedition mit Inhaberfigur begleitet die Kampagne. Sie wächst mit, wirbt Kunden ab, bietet in Ausschreibungen und kann in Kapitel 5 übernommen werden.
- **Begleiter:** eine Mentorfigur (frühere Speditionsinhaberin), die in Kapitelübergängen und bei Zielen Tipps gibt. Auftritt im bestehenden Telefon- und Entscheidungskartensystem.
- **Fortschritt:** Erreichte Kapitel und Sterne stehen im Startbildschirm. Ein abgeschlossenes Kapitel lässt sich als neues Spiel mit dem Stand des Kapitelbeginns wiederholen.

**Stand E4 (umgesetzt):**
- `campaign.ts`: Kapitel, Ziele, Sterne, Sperren, Mentorin und Rivale. Zustand `campaign` an der Firma (Spielstand-Version bleibt 14, nur ein optionales Feld).
- Die Karriere ist kein Szenario, sondern die Option `career` beim Spielstart. Im Multiplayer gibt es sie nicht.
- Sperren wirken auf Befehle (`campaignCommandLock`), die Oberfläche zeigt Hinweise.
- Abweichungen vom Konzept:
  - Nachrichten von Mentorin und Rivale erscheinen als eigener Dialog statt im Telefon- und Entscheidungskartensystem: Sie sind Erzählung ohne Wahl.
  - Der Rivale bietet in Ausschreibungen wie jede andere Konkurrenzspedition mit, ohne Sonderregel.
  - Wiederholen über Speicherpunkte zu Kapitelbeginn statt über einen eigenen Startknopf.
- **Bot-Lauf** über 8 Startwerte × 240 Tage: Kapitel 1 in 19–34 Tagen (3 Sterne). In Kapitel 2 bleibt der Bot hängen, weil er keine Rahmenverträge annimmt. Angebote kommen aber (5–7 in 100 Tagen).
- **Karriere geprüft** (nach 0.25.0, Bot mit Verträgen und Ausschreibungen, 4 Startwerte × bis 1.500 Tage):
  - Kapitel 1: 24–30 Tage, immer 3 Sterne.
  - Kapitel 2: 303–606 Tage (1 Stern). Zwei Rahmenverträge gleichzeitig und Ruf 60 schafft der Bot nur langsam, weil er rund 40 % der Vertragstouren verpasst.
  - Kapitel 3: Der Bot kommt nicht über Stufe 1–2 hinaus. Eine Auslandsniederlassung braucht Stufe 2 (zweiter Standort), 10 LKW erreicht er nie. Die meisten Läufe enden zwischen Tag 450 und 820 in der Insolvenz.
  - Bewertung: Der Bot zeigt die Grenzen des Vertragsgeschäfts mit 2 LKW, nicht die eines guten Spielers. Die Fristen bleiben vorerst, bis Spielerfahrungen vorliegen.
  - Korrigiert: Rivale wächst je Kapitel nur bis zur nächsten Startgröße (vorher bis 108 LKW), Vertrags- und Ausschreibungspreise +15 %, KI-Disposition mit 2 h Puffer und Fahrer für gestrandete LKW.

## Technik

- **Spielstand-Version 14:**
  - Lagerverträge und Lagerbestand je Standort
  - Container-Kreislauf am Auftrag (`container: { id, phase, freeUntil }`)
  - Terminalzustand in der Welt
  - Nachkalkulation je Fahrt
  - Kampagnenstand
- **Wettbewerbswelt:**
  - Terminals und ihre Wartezeiten gehören zur Welt.
  - Lagerverträge und die daraus entstehenden Aufträge gehören der Firma.
  - Analyse und Prognose sind firmenbezogen.
- **Tests:**
  - je Schritt eine Testdatei
  - Vergleichslauf: Ohne Lager und Container bleibt das Spiel nahe am alten Stand. Echte Inhalte ändern das Gleichgewicht, deshalb wird mit dem Bot neu gemessen.

## Entscheidungen (21.11.2026)

1. **Releases je Schritt:** 0.21.0 Analyse, 0.22.0 Lager, 0.23.0 Häfen, 0.24.0 Kampagne.
2. **Lager mit Warenfluss:** Lagerverträge erzeugen Ein- und Auslagerungstouren, dazu Umschlag über das Lager.
3. **Container mit vollem Kreislauf:** Terminal-Zeitfenster, Leercontainer-Rückgabe mit Gratistagen und Standgeld, Export mit Annahmeschluss.
4. **Kampagne mit Freischaltung je Kapitel:** Systeme kommen Kapitel für Kapitel dazu. Im freien Spiel bleibt alles offen.
