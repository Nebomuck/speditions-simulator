# Game Design Document – Cargovia

## 1. Vision

Der Spieler beginnt als Einzelunternehmer mit einem gebrauchten LKW, einem Fahrer und knappem Kapital und baut über viele Spielstunden ein internationales Logistikunternehmen auf. Der Reiz entsteht nicht aus „möglichst vielen LKW“, sondern aus **wirtschaftlich guten Entscheidungen**: welche Aufträge, welche Rückladung, wann investieren, wen einstellen, wie viel Gehalt sich selbst auszahlen.

Leitsätze:

1. **Alles hängt zusammen.** Jede Aktion verändert die Simulation, z. B. Auftrag → Fahrt → Position → Kosten → Rechnung → Liquidität → Investitionsspielraum.
2. **Das Geld ist knapp, aber fair.** Zufall erzeugt Abwechslung, keine Willkür. Ereignisse haben Ursachen (Zustand, Fahrer, Saison).
3. **Professionelles Werkzeug, Spielgefühl.** Die Oberfläche erinnert an Transportmanagement-Software, belohnt aber mit Fortschritt, Klängen und einer lebendigen Karte.
4. **Delegation als Fortschritt.** Anfangs macht der Spieler alles selbst. Später übernehmen Mitarbeiter, und der Spieler gewinnt Zeit für Strategie und Privatleben.

## 2. Spielablauf (Core Loop)

```
Auftragsbörse prüfen → Auftrag kalkulieren → Disponieren (Fahrer + LKW + Auflieger)
   → Fahrt läuft live (Pausen, Ruhezeiten, Tanken, Pannen)
   → Lieferung → Rechnung (Zahlungsziel) → Zahlungseingang
   → Rückladung suchen / Fahrzeug überführen → investieren / einstellen
```

Mittelfristig: Fuhrpark und Personal erweitern, Standorte ausbauen, Stammkunden gewinnen.
Langfristig: Niederlassungen, Abteilungen, KI-Disponenten, Konzernsteuerung, gemeinsames Spiel mit Freunden.

## 3. Zeit

- Simulationszeit in Minuten. Spielbeginn ist Montag, 4. Januar 2027, 06:00.
- Geschwindigkeit in Spielminuten pro Echtsekunde: 1×, 2×, 5×, 10×, 30×, 60×. Bei 60× dauert ein Spieltag 24 Sekunden, eine Fahrt Leipzig–Madrid gut eine Minute.
- Die Simulation läuft in festen 1-Minuten-Schritten, unabhängig von der Geschwindigkeit. Dadurch werden Pausen und Ruhezeiten auch bei Beschleunigung exakt eingehalten.
- Kalender: Wochentage, Monate, Jahreszeiten und europaweit einheitliche Feiertage (Neujahr, Karfreitag, Ostermontag, 1. Mai, Christi Himmelfahrt, Pfingstmontag, Weihnachten, Silvester). Am Wochenende und an Feiertagen gibt es deutlich weniger Aufträge.
- Monatsabrechnung am Monatsersten um 00:00.

## 4. Welt & Karte

- 161 europäische Städte in 29 Ländern mit Einwohnerzahl und Branchenprofil (Hafen, Chemie, Automobil, Lebensmittel, Landwirtschaft, Stahl, Handel, Logistik, Elektronik, Pharma, Maschinenbau, Holz, Bau).
- **Straßennetz:** 384 echte Straßenverbindungen zwischen benachbarten Städten, einmalig aus OpenStreetMap-Routen erzeugt (OSRM) und als Geometrie gespeichert. Im Spiel wird offline per Dijkstra geroutet (schnellste LKW-Route).
- Die LKW-Geschwindigkeit je Abschnitt ergibt sich aus der echten Durchschnittsgeschwindigkeit der Straße (Autobahn vs. Landstraße), ist auf 80 km/h begrenzt und wird durch Berufsverkehr in Ballungsräumen sowie die Erfahrung des Fahrers beeinflusst.
- Fährverbindungen sind nur an definierten Übergängen erlaubt (Calais–Dover). Auf der Fähre gilt die Zeit als Ruhezeit.
- Grundkarte (Vektorkacheln) mit Ländergrenzen, Städten und Straßen. Fällt sie aus (offline), bleibt das spieleigene Straßennetz sichtbar.

## 5. Aufträge – Warenflussmodell

Aufträge sind nicht zufällig. Sie entstehen so:

1. Eine Ladungsart wird gewählt, gewichtet nach Häufigkeit und **Saison**: Getreide zur Ernte, Baustoffe im Sommer, Konsumgüter vor Weihnachten.
2. Der Ursprung ist eine Stadt, deren Branchen diese Ware **erzeugen**, gewichtet nach Größe. 45 % der Aufträge entstehen im Einzugsgebiet (450 km) der eigenen Standorte und Fahrzeuge.
3. Das Ziel wird nach einem **Gravitationsmodell** gewählt: Städte, deren Branchen die Ware **benötigen**, gewichtet mit Größe ÷ Entfernung^1,05, bei 60–2.300 km.
4. Der Auftraggeber ist ein persistentes Kundenunternehmen der passenden Branche in der Ursprungsstadt.
5. **Vergütung** = Satz je Ladungsart × km × Kurzstreckenzuschlag × Dieselzuschlag + Ladepauschale, multipliziert mit Schwierigkeit, Marktnachfrage, Preissensibilität des Kunden und ±10 % Verhandlungsspielraum. Express-Aufträge bringen +30 %.
6. **Zeitfenster:** Abholung in 4–48 h (Express 2–10 h) mit einem 2–8-h-Fenster. Die Lieferfrist ergibt sich aus der echten Fahrzeit inklusive Lenk- und Ruhezeiten × Puffer (1,2–1,7, Express 1,08–1,2).
7. **Vertragsstrafe:** 2 % (Express 4 %) der Vergütung je angefangene Verspätungsstunde, gedeckelt auf 50 %.

19 Ladungsarten mit eigenem Aufliegertyp, z. B. Paletten und Stückgut (Plane), Kühl- und Tiefkühlware sowie Pharma (Kühlauflieger), Baustoffe, Stahlcoils, Getreide und Kies (Kipper), Hackschnitzel (Schubboden), See- und Exportcontainer, Neufahrzeuge (Autotransporter), Chemikalien und Mineralöl (Tank, **ADR** erforderlich), Industriemaschinen (Tieflader, **Schwertransport-Qualifikation**), Autoteile (JIT, häufig Express) und Elektronik.

Die Börse hält etwa 320 offene Angebote. Angebote verfallen, neue entstehen stündlich.

## 6. Disposition

Eine Fahrt besteht aus Fahrer, Zugmaschine und Auflieger, die am selben Ort stehen müssen. Sie läuft in Phasen: Leerfahrt zur Ladestelle → ggf. Warten auf das Ladefenster → Beladung → Lastfahrt → Entladung.

**Konfliktprüfung.** Fehler blockieren die Disposition:
- Fahrer, LKW oder Auflieger bereits verplant
- falscher Aufliegertyp
- Nutzlast überschritten
- fehlende Qualifikation (ADR, Schwertransport)
- unterschiedliche Standorte
- Fahrzeug nicht verkehrssicher (Zustand < 15 %)
- Angebot abgelaufen

**Warnungen** erlauben die Disposition trotzdem:
- Fahrer braucht zuerst noch Ruhe
- Abhol- oder Lieferfenster wird voraussichtlich verpasst (mit Strafe)
- Tankstopps nötig
- kritischer Wartungszustand
- Fahrt voraussichtlich unwirtschaftlich

**Vorkalkulation:** Leer- und Last-km, reine Fahrzeit, Pausen und Ruhezeiten, Ankunftszeiten, Diesel, Maut, anteilige Fahrer- und Fahrzeugkosten, Erlös nach Strafe, Ergebnis.

**Ansichten:** Plantafel mit Drag-and-Drop (Auftrag auf eine Fahrzeugzeile ziehen) samt 72-h-Zeitstrahl (Gantt), Listenansicht, Fahreransicht (Lenkzeiten), Kartenansicht. Überführungsfahrten (leer) sind jederzeit möglich.

### KI-Disposition

Disponenten (Abteilung Disposition) betreuen je 8 Fahrzeuge. Drei Modi: **manuell**, **teilautomatisch** (stündliche Vorschläge, ein Klick übernimmt) und **vollautomatisch** (nimmt Angebote an und disponiert selbst).

Je Fahrzeug sucht der Disponent passende Aufträge (Laderaum, Nutzlast, Qualifikationen, Abholfenster), rechnet die besten mit derselben Kalkulation wie die manuelle Disposition durch und entscheidet nach den Regeln des Spielers: Mindestgewinn, maximale Leerfahrt, bevorzugte Ladungsarten, Einsatzländer, Stammkunden bevorzugen, keine riskanten Termine (2 h Puffer), nächstes Fahrzeug statt höchstem Gewinn. Angenommene Aufträge und Vertragstouren haben immer Vorrang. Weitere Aufgaben: Rückladungen als Folgeauftrag für fahrende LKW (ab Kompetenz 40), verspätete Folgeaufträge neu vergeben (ab 60), LKW ohne Auftrag nach 24 h zum nächsten Standort zurückholen. Steht ein LKW länger ohne Auftrag, nimmt der Disponent auch weitere Anfahrten in Kauf (je 4 h Standzeit +100 % der maximalen Leerfahrt, bis zum Vierfachen); Ruhezeiten des Fahrers zählen dabei nicht als Standzeit.

**Kompetenz** (Einsteiger 20–42, Erfahren 45–68, Profi 72–92; Gehalt 82 % / 100 % / 130 %) bestimmt die Suchtiefe (4–30 Aufträge), den Kalkulationsfehler (bis ±25 % Gewinn, unterschätzte Leerfahrten, zu optimistische Fahrzeiten) und Fehlgriffe bei der Priorisierung. Jede Disposition bringt etwas Erfahrung. Beförderte Fahrer starten mit Kompetenz 25 + 0,6 × Erfahrung.

## 7. Lenk- und Ruhezeiten (vereinfachte VO (EG) 561/2006)

| Regel | Umsetzung |
|---|---|
| Fahrtunterbrechung | nach 4,5 h Lenkzeit 45 min |
| Tageslenkzeit | max. 9 h, danach 11 h Tagesruhe |
| Wochenlenkzeit | max. 56 h bzw. nach 6 Tageslenkzeiten 45 h Wochenruhe |
| Ruhe im Stand | Standzeit ohne Arbeit zählt als Ruhe; Be-/Entladen und Tanken zählen als Arbeit |

**Bewusste Vereinfachungen** (später erweiterbar): keine Aufteilung 15 + 30 min, keine 10-h-Tage, keine verkürzten Ruhezeiten, keine Doppelwochen-Grenze von 90 h, keine 13-h-Schichtregel, keine Doppelbesatzung. Fahrverbote siehe Abschnitt 17.

**Ruhe an der Ladestelle:** Wartet ein Fahrer mindestens 3 h auf das Ladefenster, ist er schon gefahren und endet eine Tagesruhe noch vor dem Ende des Fensters, legt er sie dort ein. Vorkalkulation, Plantafel und Folgeaufträge rechnen mit denselben Regeln wie die Simulation (Lenk- und Ruhezeiten, Wetter, Grenzwartezeiten, Fahrverbote) und übernehmen den Lenkzeitstand vom Ende der laufenden Fahrt.

## 8. Fahrzeuge

Sechs fiktive Zugmaschinen von vier Herstellern (Nordwal, Velkor, Brennkraft, Trasko) mit Leistung, Verbrauch, Tank, Emissionsklasse, Preis, Leasingrate, Versicherung und Haltbarkeit, dazu neun Aufliegertypen.

- **Verbrauch** = Basis × (1 + 0,35 × Beladungsgrad) × Fahrweise-Faktor (sparsame Fahrer −16 %).
- **Verschleiß** je km, abhängig von Haltbarkeit, Beladung und Fahrweise. Unter 45 % Zustand steigt die Pannenwahrscheinlichkeit pro km. Eine Panne dauert 3–8 h und kostet 450–2.400 € Pannenhilfe.
- **Werkstatt:** Wartung auf 100 %; Dauer und Kosten hängen vom Zustand ab.
- **Tanken** automatisch unter 15 % Tankinhalt, 25 min, Länderpreisfaktor (LU/PL/CZ/SK/HU günstiger, CH/NO teurer).
- **Beschaffung:** Gebrauchtmarkt mit wechselnden Angeboten, Neukauf, Finanzierung (10 % Anzahlung, 24–60 Monate, 4,9–5,7 % p. a., Fahrzeug als Sicherheit), Leasing (erste Rate sofort), Kurzzeitmiete (1,6-fache Leasingrate tageweise, jederzeit rückgabefähig). Verkauf zu 90 % des Marktwerts, Inzahlungnahme beim Neukauf zu 95 %; offene Finanzierungen werden aus dem Erlös abgelöst. Vorzeitige Leasingrückgabe kostet 3 Raten Ablöse.
- **Marktwert** = Neupreis × 0,86^Alter × Laufleistungs- und Zustandsfaktor.

## 9. Personal

Fahrer haben Name, Alter, Heimatort, Erfahrung, Führerscheinklassen, Qualifikationen (ADR, Schwertransport, Kühltransport), Gehaltsvorstellung, Zuverlässigkeit, Sparsamkeit, Belastbarkeit und Zufriedenheit. Erfahrung wächst mit gefahrenen Last-km und erhöht das Tempo leicht. Täglich gehen neue Bewerbungen ein. Eine Einstellung kostet 350 €, eine Entlassung ein Monatsgehalt Abfindung und senkt die Zufriedenheit der Kollegen.

- **Zufriedenheit** strebt täglich einem Zielwert zu: Basis 60, Gehalt gegenüber dem Marktgehalt (±6 % neutral, darüber/darunter bis +20/−30), lange ohne Urlaub (ab 100 Tagen), hohe Wochenlenkzeit, guter Firmenruf, Betriebszugehörigkeit („Fahrer der ersten Stunde“ +8).
- **Kündigung:** Liegt die Zufriedenheit 7 Tage unter 25, kündigt der Fahrer mit 14 Tagen Frist. Steigt sie wieder auf 45 (Gespräch, Gehaltserhöhung, Urlaub), zieht er zurück.
- **Personalgespräch** (alle 14 Tage): +5 bzw. +10 Zufriedenheit und nennt die Gründe.
- **Urlaub:** 30 Tage pro Jahr, erhöht die Zufriedenheit; **Krankheit** tritt zufällig zwischen Fahrten auf (1–6 Tage, Lohn läuft weiter).
- **Anreise:** Freie Fahrer ohne Fahrzeug reisen per Bahn zu einem Standort oder einem wartenden LKW (Fahrkarte 35 € + 0,14 €/km Straßenentfernung, Dauer 1 h + Strecke bei 75 km/h; die Reise gilt als Bereitschaft, nicht als Lenkzeit). KI-Disponenten holen nach 2 h Standzeit einen überzähligen Fahrer (dort, wo er ist, steht kein freier LKW) aus höchstens 1.200 km, den nächsten zuerst; unterwegs befindliche Fahrer zählen mit, damit kein LKW zwei bekommt.
- **Schulungen:** ADR (4 Tage, 890 €), Kühltransport (2 Tage, 420 €), Schwertransport (5 Tage, 1.350 €, ab Erfahrung 35), Spritsparen (1 Tag, 380 €, +15 Sparsamkeit).

## 10. Wirtschaft & Finanzen

- **Firmenkonto** mit Kontokorrentrahmen 10.000 € und 12 % p. a. Überziehungszins.
- **Rechnungen:** Nach jeder Lieferung entsteht eine Forderung mit dem Zahlungsziel des Kunden (14–60 Tage). Wann und ob gezahlt wird, hängt von der Zahlungsmoral ab: pünktlich, verspätet (+2–35 Tage, dazu Mahnungen) oder Ausfall (Abschreibung nach 60 Tagen). Gewinn heißt daher noch lange nicht Liquidität.
- **Laufende Kosten (monatlich):** Löhne + 21 % Arbeitgeberanteil, Miete, Versicherung je Fahrzeug und Auflieger, Leasing, Geschäftsführergehalt, Verwaltung.
- **Variable Kosten:** Diesel (beim Tanken), Maut (je Land, bei Fahrtende abgerechnet), Werkstatt, Pannen, Strafen.
- **Dieselpreis:** Random Walk um 1,55 €/l netto. **Nachfrageindex** = Saison × Konjunktur (siehe Abschnitt 17).

## 11. Kunden

Persistente Unternehmen mit Branche, Größe, Zahlungsmoral, Zahlungsziel, Zufriedenheit und Preissensibilität. Pünktliche Lieferungen bringen +3 Zufriedenheit (Express +4), Verspätungen −5 bis −25. Die Firmen-Reputation (0–100) bewegt sich mit. Zufriedene Stammkunden zahlen in der Börse bis zu 5 % mehr. Sinkt die Zufriedenheit unter 40 % und läuft kein Rahmenvertrag, kann der Kunde zur Konkurrenz wechseln (siehe Abschnitt 17).

**Rahmenverträge:** Stammkunden (ab 2 Lieferungen und Zufriedenheit 55) und Ausschreibungen aus der Region bieten Verträge an: feste Strecke, 1–3 Touren pro Woche an festen Wochentagen, 4–12 Wochen, fester Preis je Tour, 30 % Strafe bei Ausfall. Die Touren erscheinen am Vortag als angenommene Aufträge. Nicht disponierte Touren gelten 6 h nach Ende des Ladefensters als verpasst (Strafe, −8 Zufriedenheit). Wer mindestens 85 % pünktlich erfüllt, bekommt eine Verlängerung zu +4 % angeboten. Vorzeitige Kündigung kostet 3 Ausfallstrafen.

## 12. Standorte

Kleines Büro (2 Stellplätze, 1 Büroplatz) → Büro mit Betriebshof (8, 4) → großer Betriebshof (25, 12, ab Stufe 3). Stellplätze begrenzen den Fuhrpark tatsächlich, Büroplätze das Personal.

- **Niederlassungen** in jeder Stadt des Netzes (Kaution + 6.000 € Einrichtung). Sie bringen Stellplätze, Büroplätze, Bewerber und Aufträge aus ihrer Region; neue Fahrzeuge und Auflieger werden an den gewählten Standort geliefert. Aufgeben kostet eine Monatsmiete.
- **Eigene Werkstatt** (ab Stufe 2, Betriebshof, 85.000 €, 3.400 €/Monat): Wartung am Standort 35 % günstiger und 30 % schneller.
- **Betriebstankstelle** (ab Stufe 2, 42.000 €, 520 €/Monat): Abfahrten am Standort tanken voll, 9 % unter Tankstellenpreis.
- **Lagerhalle** (ab Stufe 3, 140.000 €, 3.900 €/Monat): 2.000 Palettenplätze zu 6,50 €/Monat; die Auslastung folgt Reputation und Vertrieb. Der Standort wird häufiger Ursprung von Aufträgen.
- **Abteilungen:** Disposition (ein Disponent je 8 Fahrzeuge; bis 5 Fahrzeuge disponiert die Geschäftsführung selbst, darüber sinkt sonst die Fahrerzufriedenheit), Vertrieb (je Kopf +12 % Börsenangebote, +1,5 % Preis, +1 Vertragsangebot, max. 3), Buchhaltung (Ausfälle −45 % / −65 %, pünktlichere Zahlungen), Fuhrparkmanagement (−8 % Verschleiß, −30 % Pannen je Kopf, max. 2; schickt Fahrzeuge unter 60 % automatisch in die eigene Werkstatt). Fahrer ab Erfahrung 50 können ins Büro befördert werden (ohne Einstellungskosten, +8 % Gehalt).

## 13. Lebenssimulation

Jeder Spieler hat einen Charakter mit 2D-Avatar, Alter, Hintergrund, Privatkonto, Wohnung und Bedürfnissen. **Privat- und Firmenvermögen sind getrennt.** Das Geschäftsführergehalt geht am Monatsersten von der Firma aufs Privatkonto; Miete (kleine Wohnung 650 €) und Lebenshaltung (800 €, je Kind +450 €) gehen vom Privatkonto ab. Eine **Gewinnausschüttung** bringt Firmengeld aufs Privatkonto (nur aus Guthaben, 26,375 % Kapitalertragsteuer).

- **Hintergrund und Fähigkeiten:** Berufskraftfahrer/in (Logistik 55), Speditionskaufmann/-frau (Verhandlung 55), Quereinsteiger/in (alles 30). Verhandlung bringt bis +4 % in der Börse, Mitarbeiterführung zufriedenere Fahrer, Logistikplanung mehr selbst disponierte Fahrzeuge. Weiterbildungen (900 €) +5.
- **Work-Life-Balance:** Der Arbeitsstil legt die Arbeitszeit fest (12 h selbst disponieren, 9 h nur wichtige Kunden, 8 h Unternehmensentwicklung, 5 h teilweise delegieren mit Disponent, 2 h mit angestelltem Geschäftsführer für 8.500 €/Monat ab Stufe 3) und damit, wie viele Fahrzeuge die Geschäftsführung selbst disponiert (5/3/2/1/0, mal Leistungsfähigkeit). Kundenbetreuung macht Stammkunden zufriedener, Unternehmensentwicklung hebt die Reputation.
- **Bedürfnisse** bewegen sich täglich auf Zielwerte zu: Energie (Arbeitszeit, Wohnkomfort), Stress (Arbeitszeit, Geldsorgen, überlastete Disposition, Freizeit, Partnerschaft), Gesundheit (Stress, Erschöpfung), Freizeit und soziale Kontakte (verfallen ohne Aktivitäten), Zufriedenheit (alles zusammen plus Wohnen, Auto, Familie, Hobby, erreichte Ziele). Die **Leistungsfähigkeit** (Energie, Gesundheit, Stress) bestimmt die eigene Disposition. Fünf Tage Stress über 90 oder Gesundheit unter 20 führen zu 7 bzw. 4 Tagen Ausfall.
- **Freizeit:** Essen gehen, Kino/Konzert, Sport, Freunde treffen, Einkaufsbummel, Wellness, Hobby, Weiterbildung – kostet Privatgeld und 2–8 Stunden, in denen der Charakter nicht disponiert. Wiederholung innerhalb von 24 h wirkt halb. **Urlaub** (3/7/14 Tage, im eigenen Ferienhaus 70 % günstiger) baut Stress stark ab; ohne Disponenten bleibt die Disposition liegen.
- **Wohnen und Besitz:** kleine/große Mietwohnung, Einfamilienhaus (420.000 €), Villa (1,35 Mio. €), Ferienhaus (260.000 €). Kauf bar oder mit Immobilienkredit (20 % Eigenkapital, 3,9 %, 25 Jahre, Rate höchstens 40 % des GF-Gehalts). Verkauf zu 92 %. Privatwagen vom Kleinwagen bis zum Sportwagen, Einrichtung in drei Stufen.
- **Beziehungen:** Freundschaften entstehen beim Ausgehen oder melden sich von selbst; ohne Kontakt (10 Tage) kühlen sie ab und enden. Ab Nähe 70 kann aus Freundschaft eine Partnerschaft werden (Annahme nicht garantiert). Partnerschaften brauchen gemeinsame Zeit – wer dauerhaft 12 Stunden arbeitet, riskiert die Trennung. Ab Nähe 75 und größerer Wohnung kann eine Familie gegründet werden (Nachwuchs nach 270 Tagen).
- **Ziele:** bis zu vier persönliche Ziele (Haus, Partnerschaft, Familie, 1 Mio. € Privatvermögen, Konzernstufe, Work-Life-Balance, Sportwagen); erreichte Ziele heben die Zufriedenheit.

## 14. Schwierigkeitsgrade

| | Einfach | Normal | Realistisch |
|---|---|---|---|
| Startkapital | 60.000 € | 25.000 € | 12.000 € |
| Frachtraten | +8 % | ±0 | −4 % |
| Pannen/Verzögerungen | ×0,5 | ×1 | ×1,4 |
| Zahlungsrisiko | ×0,5 | ×1 | ×1,4 |
| Start-LKW | gekauft | geleast | geleast |

**Benutzerdefiniert:** Startkapital 5.000–250.000 €, Frachtraten 80–130 %, Ereignisse 0–200 %, Zahlungsrisiko 0–200 %, Start-LKW gekauft oder geleast.

**Balancing (0.11):** Das allgemeine Ratenniveau liegt bei etwa 1,85–2,00 € je Last-km. Ein gut disponierter LKW erwirtschaftet so rund 2.000–3.000 € Deckungsbeitrag im Monat; ein einzelner LKW trägt Büro und Geschäftsführergehalt nur knapp, ab dem zweiten wird die Firma profitabel. Gemessen mit einem Spieler-Bot über 18 Monate (`packages/core/test/measure-balance.ts`): Auf „Normal“ wächst die Firma über Leasing auf 5–8 LKW, auf „Realistisch“ bleibt sie mit zwei LKW lange um die Gewinnschwelle, auf „Einfach“ wächst sie schnell.

## 15. Multiplayer (kooperativ)

Mehrere Spieler leiten **dieselbe** Firma. Der Server simuliert allein (serverautoritativ), Clients senden Befehle.

- **Rechte:** Disposition, Fuhrpark, Beschaffung, Fahrzeugverkauf, Einstellen, Entlassen, Finanzen, Kredite, Standorte, Spielleitung. Der Gründer hat alle Rechte und vergibt sie.
- **Rollen** sind Vorlagen für die Rechte; einzelne Rechte lassen sich danach anpassen (Rolle „Individuell“). Neue Spieler starten als Disposition.

  | Rolle | Aufgaben | Rechte |
  |---|---|---|
  | Geschäftsführung | Investitionen, Finanzen, Unternehmensentwicklung, Verträge | alle |
  | Disposition | Aufträge, Fahrerzuweisung, Routenplanung, Live-Überwachung | Disposition |
  | Fuhrparkleitung | Fahrzeuge, Reparaturen, Wartung, Beschaffung | Fuhrpark, Beschaffung, Fahrzeugverkauf |
  | Personalleitung | Mitarbeiter, Gehälter, Urlaub, Weiterbildung, Personalgewinnung | Einstellen, Entlassen |

- **Grenzen je Spieler:** Ausgabenlimit je Ausgabe vom Firmenkonto (z. B. „keine großen Investitionen über 20.000 €“) und „nur zugewiesene Niederlassungen verwalten“ (Ausbau, Einrichtungen, Büropersonal und Lieferort neuer Fahrzeuge). Wer auf Niederlassungen beschränkt ist, kann keine neuen eröffnen.
- **Gemeinsame Spielzeit:** Nur Spieler mit dem Recht „Spielleitung“ ändern Tempo und Pause. Die Zeit läuft nur, solange mindestens ein Spieler verbunden ist.
- **Kommunikation:** Firmenchat (alle), interne Nachrichten (nur Absender und Empfänger), Ereignisprotokoll und Benachrichtigungen. Neue Nachrichten, zugewiesene Aufgaben, Einladungen und Abstimmungen erscheinen als Meldung und als Zähler im Menü.
- **Aufgabenverteilung:** Aufgaben mit Bereich, Zuständigem und Fälligkeit; Spalten Offen → In Arbeit → Erledigt. Löschen darf, wer sie angelegt hat, oder die Spielleitung.
- **Gemeinsame Aktivitäten:** Ein Spieler lädt Mitspieler ein; die Aktivität findet statt, sobald alle geantwortet haben, spätestens nach 12 Spielstunden mit allen Zusagen (mindestens zwei Teilnehmer). Jeder zahlt vom eigenen Privatkonto. Gesellige Aktivitäten wirken je weiterem Teilnehmer 15 % stärker.

  | Aktivität | Dauer | Kosten p. P. | Wirkung |
  |---|---|---|---|
  | Zusammen essen gehen | 2 h | 55 € | Sättigung +25, Geselligkeit +14, Freizeit +8 |
  | Veranstaltung besuchen | 4 h | 80 € | Freizeit +20, Geselligkeit +12, Stress −8 |
  | Gemeinsame Freizeit | 3 h | 35 € | Freizeit +16, Geselligkeit +10, Stress −8 |
  | Geschäftsbesprechung | 2 h | – | eine Woche +2 % auf neue Auftragsangebote |

- **Abstimmungen** über Unternehmensentscheidungen: 2–6 Antworten, Laufzeit 6 h bis 1 Woche. Ausgewertet wird, sobald alle abgestimmt haben, bei Ablauf oder vorzeitig durch den Ersteller bzw. die Spielleitung. Bei Gleichstand gibt es keine Entscheidung.
- **Eigene Charaktere:** Jeder Spieler hat ein eigenes Privatkonto, das Firmenkonto ist gemeinsam.

## 16. Spielfortschritt: Unternehmensstufen

| Stufe | Name | Fahrzeuge | Lieferungen | Reputation | Standorte | Länder | max. Standorte |
|---|---|---|---|---|---|---|---|
| 1 | Einzelunternehmen | – | – | – | 1 | 1 | 1 |
| 2 | Kleinspedition | 3 | 25 | 35 | 1 | 1 | 2 |
| 3 | Regionale Spedition | 6 | 120 | 45 | 2 | 1 | 3 |
| 4 | Überregionale Spedition | 12 | 400 | 55 | 3 | 1 | 5 |
| 5 | Internationale Spedition | 25 | 1.200 | 62 | 4 | 2 | 8 |
| 6 | Europäischer Logistikkonzern | 50 | 3.000 | 70 | 6 | 3 | 15 |

Der Aufstieg wird täglich geprüft, bringt +2 Reputation und geht nicht wieder verloren. Stufe 2 schaltet Werkstatt und Tankstelle frei, Stufe 3 den Großen Betriebshof und die Lagerhalle.

## 17. Erweiterte Simulation

### Wetter
Jedes Land hat eigenes Wetter (Klar, Regen, Nebel, Schneefall, Glätte, Sturm, Hitze), das alle 4–12 Stunden wechselt. Die Wahrscheinlichkeiten hängen von Jahreszeit und Breitengrad ab: Norwegen hat im Winter oft Schnee, Spanien kaum. Wetter wirkt auf das Tempo (Schnee −28 %, Glätte −40 %) und das Unfallrisiko (bis ×5 bei Glätte). Bei Unwetter entstehen gelegentlich wetterbedingte Sperrungen (2–5 h) mit automatischer Umleitung. Die Fahrzeitschätzung rechnet das aktuelle Wetter mit ein.

### Unfälle und Reifenschäden
Unfälle sind selten (etwa einer je 400.000 km bei klarem Wetter, erfahrene Fahrer seltener): 2–5 h Stillstand, 1.500–6.500 € Kosten, −15 bis −30 % Fahrzeugzustand, unzufriedener Kunde. Reifenschäden (etwa je 90.000 km) kosten 40–100 min und 280–750 €.

### Fahrverbote
LKW über 7,5 t dürfen zu bestimmten Zeiten nicht fahren: Deutschland und Slowakei sonn- und feiertags 0–22 Uhr, Österreich ab Samstag 15 Uhr, Schweiz sonntags und nachts 22–5 Uhr, Frankreich und Ungarn Samstag 22 Uhr bis Sonntag 22 Uhr, Italien sonntags 9–22 Uhr, Tschechien sonntags 13–22 Uhr, Polen an Feiertagen. Ausgenommen sind Transporter, leichte Solo-LKW und beladene Kühltransporte. Der LKW wartet am Rand der Verbotszone; die Disposition warnt vorher.

### Grenzen
An Grenzen zu Nicht-EU-Ländern (Schweiz, Norwegen, Großbritannien, Serbien, Bosnien und Herzegowina, Nordmazedonien) wird kontrolliert und verzollt: im Schnitt 35 min, am Westbalkan 2 h, mit Streuung. Die Vorkalkulation plant die erwartete Wartezeit ein.

### Konjunktur und Regionen
Die Wirtschaft kennt drei Lagen: **Normal**, **Aufschwung** (Nachfrage +14 %) und **Krise** (Nachfrage −18 %, Kunden zahlen schleppender). Ein Wechsel ist frühestens 120 Tage nach dem letzten möglich und kündigt sich über die Nachrichten an. Dazu hat jede Region einen eigenen Nachfragefaktor, den Ereignisse verschieben (Messe, Werksschließung, Erntesaison). Er bestimmt, wo Ladungen entstehen und wie gut sie bezahlt werden.

### KI-Konkurrenz
Fünf bis sieben fiktive Speditionen mit Strategie (Preisbrecher −8 %, Premium +4 %, Regional), Flotte, Kasse, Ruf und Standorten. Jede hat eine Kapazität in LKW-Stunden und übernimmt Aufträge aus der Börse im Umkreis von 450 km ihrer Standorte – Angebote stehen aber zuerst 90 Minuten nur dem Spieler zur Verfügung, Ausschreibungen nie. Erlöse stehen echten Kosten gegenüber (Fahrzeug-Tagessatz, km-Kosten, Entnahmen). Bei Gewinn und hoher Auslastung wächst eine Konkurrenz und eröffnet Standorte; bei Verlusten gerät sie in Schwierigkeiten, verkauft LKW und geht schließlich in Konkurs. Dafür werden neue gegründet. Viele Konkurrenten in einem Land drücken dort die Frachtraten um bis zu 4 %.

Unzufriedene Kunden können abwandern; ihre Aufträge gehen dann direkt an den Konkurrenten. Ein Vertriebsbesuch (1.500 €, alle 14 Tage) holt sie mit einer Chance nach eigenem Ruf, Ruf des Konkurrenten und dessen Lage zurück. Geht der Konkurrent in Konkurs, kehren seine Kunden zurück.

### Ereignisregelwerk
Ereignisse entstehen aus Regeln mit Bedingung, Wahrscheinlichkeit und Abklingzeit, nicht aus reinem Zufall: Großkunde, Ausschreibung (gut bezahlt, 12 h verfügbar), Dieselpreissprung oder -rückgang, Marktchance oder Einbruch in einer Region, Kündigung eines Rahmenvertrags (nur bei vielen verpassten oder verspäteten Touren), Kundenänderungen (Lieferung verschoben oder eilig mit 8 % Aufschlag) sowie private Ereignisse. **Fairness:** Negative Firmenereignisse kommen höchstens alle 4 Tage und nie, solange das Firmenkonto im Minus ist; positive werden in schwierigen Lagen wahrscheinlicher. Der Ereignisfaktor des Schwierigkeitsgrads skaliert alles.

## 18. Bedienung, Hilfe und Atmosphäre

- **Erste Schritte:** In neuen Spielen führt eine Liste durch neun Schritte (Börse, erste Disposition, Zeit, Karte, Lieferung, Finanzen, Fuhrpark, zweites Fahrzeug, Hilfe). Sie erkennt den Fortschritt am Spielzustand, hebt das nächste Bedienelement hervor und lässt sich ausblenden bzw. über die Hilfe wieder einblenden.
- **Hilfe:** F1 oder „?“ öffnet die Hilfe zur aktuellen Seite; alle Artikel sind durchsuchbar.
- **Kontextmenüs:** Rechtsklick auf Fahrzeuge, Aufträge und Fahrer bietet die häufigsten Aktionen.
- **Audio:** Effekttöne, eine ruhige generative Hintergrundmusik, Büroatmosphäre (Raumklang, Tastatur) und ein Telefonklingeln, wenn Kunden oder Partner anrufen (Ereignisse aus dem Regelwerk). Alles wird zur Laufzeit erzeugt – keine fremden Audiodateien. Musik und Atmosphäre sind getrennt regelbar.

