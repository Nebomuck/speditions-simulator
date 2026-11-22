# Feature-Checkliste

Statuswerte: **Geplant** · **In Entwicklung** · **Implementiert** (funktioniert, manuell geprüft) · **Getestet** (automatisierter Test vorhanden und bestanden) · **Fehlerhaft** · **Überarbeitet**

Stand: 22.11.2026 · Version 0.25.0

## 3 · Technik & Plattform
| Anforderung | Status | Anmerkung |
|---|---|---|
| Eigenständiger Windows-Client | Getestet | Tauri 2, NSIS-Installer mit eingebautem Multiplayer-Server und In-App-Update (minisign); Update-Installation in benutzerdefinierten Ordner geprüft (0.11.1). ohne Code-Signatur (bewusst, siehe TEST_PLAN.md) |
| Fehlerbehandlung | Getestet | Fehlergrenzen je Ansicht und für die App (Notfall-Export), Fehlerprotokoll mit Bericht, Simulationsfehler hält das Spiel an (Einzelspieler und Server), Notfall-Spielstand |
| Server-Konfiguration | Getestet | Kommandozeile, Umgebungsvariablen, `cargovia-server.json`; `/health`; belegter Port und ungültige Werte mit klarer Meldung |
| Spielbarer Einzelspielermodus | Implementiert | Simulation im Web Worker |
| Echter kooperativer Multiplayer | Getestet | WebSocket-Server, serverautoritativ |
| Gemeinsame Simulationslogik | Getestet | `@spedsim/core` in Worker und Server |
| Interaktive Karte Europas | Implementiert | MapLibre + OpenFreeMap |
| Persistente Spielstände | Getestet | IndexedDB (SP), SQLite (MP) |
| Performante Simulation vieler Fahrzeuge | Getestet | 300 LKW/Tag ≈ 0,5 s |
| Lizenzprüfung Karten/Routing/Bibliotheken | Implementiert | ARCHITECTURE.md, README.md |

## 4 · Europakarte
| Anforderung | Status | Anmerkung |
|---|---|---|
| Zoom/Verschieben | Implementiert | |
| Reale Städte | Getestet | 240 Städte, 32 Länder |
| Reale Straßen, Autobahnen | Getestet | Grundkarte + 764 echte OSM-Routen, Fähren Calais–Dover und Tallinn–Helsinki |
| Ländergrenzen | Implementiert | Grundkarte |
| Firmenstandorte | Implementiert | orange markiert |
| Werkstätten, Tankstellen, Rastplätze | Implementiert | POI-Ebene „Rastplätze & Werkstätten“, eigene Anlagen hervorgehoben |
| Liefer-/Abholorte | Implementiert | Routenvorschau in der Börse |
| Lagerhäuser/Logistikzentren | Getestet | Lagerhalle je Standort (ab Stufe 3), Ausbau zum Logistikzentrum und Großlager; Erlöse aus Lagerverträgen (E2), zieht Aufträge an |
| Verkehrsmeldungen & Ereignisse auf der Karte | Implementiert | Sperrungen (auch wetterbedingt) und Staus auf der Karte und in „Verkehrslage“; Wetter, Fahrverbote und Ereignisse unter „Markt & Wettbewerb“ |
| Fahrerpositionen in Echtzeit | Implementiert | Interpolation pro Frame |
| Aktuelle Fahrzeugrouten | Implementiert | beladen/leer/verspätet farbig |
| Bewegung entlang echter Straßengeometrie (nicht linear) | Getestet | Route-Test + Transporttest |
| Einfluss Straßentyp | Implementiert | Durchschnittsgeschwindigkeit je Abschnitt |
| Einfluss Verkehr | Implementiert | Berufsverkehr in Ballungsräumen |
| Einfluss Wetter | Getestet | Wetter je Land nach Jahreszeit und Breitengrad: Tempo, Unfallrisiko, wetterbedingte Sperrungen; im Fahrzeugfenster angezeigt |
| Pausen/Ruhezeiten/Tanken/Laden/Pannen | Getestet | |
| Spielgeschwindigkeit | Implementiert | 1×–60× |
| Fahrzeug-Infofenster (alle geforderten Felder) | Implementiert | |
| Fahrerstatus (Unterwegs, Beladung, Entladung, Pause, Ruhezeit, Tanken, Werkstatt, Wartet, Verspätet, Defekt) | Implementiert | |
| Filter: alle/aktiv/verfügbar/verspätet/Fahrer | Implementiert | |
| Filter: Niederlassung, Vertragsaufträge | Teilweise | Fuhrpark nach Standort filterbar; Vertragstouren gekennzeichnet |
| Fahrzeug verfolgen (Auto-Zentrierung) | Implementiert | |
| Heatmaps Nachfrage/Verkehr, Korridore, Flottenverteilung | Geplant | Phase 10 |
| Clustering bei sehr vielen Fahrzeugen | Implementiert | Gruppen ab 4 Fahrzeugen bis Zoom 7, Klick zoomt hinein |

## 5 · Auftragssystem
| Anforderung | Status | Anmerkung |
|---|---|---|
| Dynamische Transportbörse | Getestet | ca. 320 Angebote |
| Auftragsarten: Stückgut, Paletten, Lebensmittel, Kühl, Tiefkühl, Baustoffe, Schüttgut, Container, Fahrzeuge, Gefahrgut, Schwertransport, Express, International | Implementiert | 19 Ladungsarten |
| Sondertransporte, regionale Verteilerfahrten | Teilweise | regionale Teilladungen (≤ 650 km Luftlinie) für Solo-LKW/Transporter; Sondertransporte offen |
| Spezifische Anforderungen (Auflieger, ADR, Schwertransport) | Getestet | |
| Alle Auftragsinformationen inkl. Strafen, Zeitfenster, Kosten | Implementiert | Schwierigkeitsgrad je Auftrag: geplant |
| Generierung nach Bevölkerung, Industrie, Region, Saison, Wochentag, Feiertag, Nachfrage | Getestet | |
| Kundenbeziehungen beeinflussen Angebote | In Entwicklung | Kunden persistent; Einfluss auf Angebotsmenge folgt in Phase 5 |
| Rückladungen / Leerfahrtvermeidung | Implementiert | Börse filtert nach Fahrzeugstandort, Überführungsfahrten |
| Mehrere Aufträge kombinieren (Teilladungen) | Getestet | Beiladung in laufende Fahrten: beste Einfügestelle für Laden/Entladen, Nutzlastprüfung über die ganze Tour, Verspätungswarnung für geladene Aufträge, wieder herausnehmbar |

## 6 · Manuelle Disposition
| Anforderung | Status | Anmerkung |
|---|---|---|
| Auftrag/Fahrer/LKW/Auflieger wählen, Route, Kosten, Termine, starten, überwachen | Getestet | |
| Drag-and-Drop | Implementiert | Plantafel |
| Listenansicht | Implementiert | |
| Kalenderansicht (Tag/Woche/Monat) | Implementiert | Disposition → Kalender: Laden, Lieferung, vorausgeplant, offen, verspätet, Feiertage |
| Zeitstrahl (Gantt) | Implementiert | 72 h |
| Kartenansicht | Implementiert | |
| Fahreransicht | Implementiert | |
| Konfliktprüfung (Ruhezeit, belegt, Auflieger, Kapazität, Lieferzeit, Qualifikation, Tank, Wartung) | Getestet | |
| Vorausplanung (Fahrt in der Zukunft starten, Ketten) | Getestet | bis zu 5 Folgeaufträge je Fahrzeug, Start automatisch nach der laufenden Fahrt, Verspätungsprognose |
| Umleitung bei Verkehrsbehinderung | Getestet | Sperrungen werden automatisch umfahren (ab dem nächsten Knoten), nach Aufhebung zurück auf die kürzere Route; ohne Ausweichroute wartet der LKW |

## 7 · KI-Disponenten
| Anforderung | Status |
|---|---|
| Disponenten einstellen, manuelle/teil-/vollautomatische Disposition, Qualitätsstufen, Regeln | Getestet (Automatiktest: Auswahl nach Regeln, Vorrang angenommener Aufträge, Vorschläge, Rückladungen, Kompetenzvergleich) |
| Rückladungen suchen, auf Verspätungen reagieren, Fahrzeuge zu Standorten zurückführen | Getestet (Folgeaufträge für fahrende LKW ab Kompetenz 40; verspätete Folgeaufträge werden ab Kompetenz 60 neu vergeben) |

## 8 · Fahrer & Personal
| Anforderung | Status | Anmerkung |
|---|---|---|
| Fahrereigenschaften (alle geforderten) | Implementiert | bevorzugte Touren: geplant |
| Entwicklung durch Erfahrung | Implementiert | |
| Erfahrung/Fahrweise wirkt auf Verbrauch, Verschleiß, Tempo | Implementiert | |
| Bewerbungen, Einstellen, Entlassen | Implementiert | |
| Gespräche, Gehaltsverhandlung, Schulungen, Beförderung, Urlaub, Verträge, Kündigung bei Unzufriedenheit | Getestet | Personalakte: Gespräch (Gründe der Zufriedenheit), Gehalt (70–160 % vom Markt), Urlaub (30 Tage/Jahr), Schulungen ADR/Kühl/Schwer/Spritsparen, Krankheit, Kündigung nach 7 Tagen Unzufriedenheit mit 14 Tagen Frist (abwendbar); Beförderung erfahrener Fahrer ins Büro (Abteilungen) |
| Lenk-/Arbeits-/Ruhezeiten (vereinfachte EU-Regeln) | Getestet | Vereinfachungen siehe GAME_DESIGN.md §7 |
| Fahrerwechsel unterwegs | Geplant | |
| Anreise freier Fahrer per Bahn zu Standort oder wartendem LKW | Getestet | manuell (Kontextmenü) und durch KI-Disponenten |

## 9 · Fahrzeuge & Fuhrpark
| Anforderung | Status | Anmerkung |
|---|---|---|
| Sattelzugmaschinen | Implementiert | 6 fiktive Modelle |
| Transporter, Klein-LKW, 7,5 t, Verteiler, Spezial | Getestet | Kastenwagen 3,5 t (mautfrei), 7,5 t Koffer, 12 t Kühlkoffer, 18 t Verteiler; fester Aufbau, eigene Maut-/Tempofaktoren; Spezial offen |
| 9 Aufliegertypen | Implementiert | |
| Fahrzeugdaten (alle geforderten) | Implementiert | |
| Gebraucht/Neu/Leasing/Verkauf | Implementiert | |
| Finanzierung, Miete, Inzahlungnahme | Getestet | Finanzierung 10 % Anzahlung, 24–60 Monate; Kurzzeitmiete tageweise; Inzahlungnahme 95 % des Marktwerts mit Ablöse offener Finanzierung |
| Verschleiß, Pannen unterwegs | Implementiert | Abschleppen vs. Vor-Ort-Reparatur als Entscheidung: geplant |
| Werkstatt/Wartung | Implementiert | |

## 10 · Wirtschaft
| Anforderung | Status | Anmerkung |
|---|---|---|
| Ausgaben: Fahrzeuge, Leasing, Diesel, Maut, Wartung, Reparatur, Versicherung, Löhne + AG-Anteil, Miete, Verwaltung | Getestet | |
| Kredite & Zinsen | Getestet | Ratenkredite (Annuität, Kreditrahmen, Ablöse), Überziehungszins; Factoring offener Rechnungen |
| In-App-Update (signiert, über GitHub-Releases) | Implementiert | Prüfung im Startbildschirm getestet; Download/Installation erst nach dem ersten Release mit latest.json prüfbar |
| Steuern, Werbung, Fortbildung, Lager | Geplant | |
| Einnahmen aus Einzelaufträgen, Expresszuschläge, Spezialtransporte | Implementiert | Festverträge: Rahmenverträge (Phase 5) |
| Finanzdashboard | Implementiert | Kontostand, Forderungen, Fixkosten, Unternehmenswert, Kategorien, Hauptbuch |
| Rechnungen, Zahlungsziele, Verzug, Mahnungen, Bonität, Ausfälle | Getestet | |
| Dynamischer Dieselpreis und Nachfrage | Getestet | Konjunktur (Normal/Aufschwung/Krise) mit Zahlungsmoral, regionale Nachfrage, Konkurrenzdruck auf die Frachtraten |

## 11 · Kunden, Verträge, Konkurrenz
| Anforderung | Status |
|---|---|
| Kunden mit Branche, Größe, Zahlungsmoral, Zufriedenheit, Preissensibilität | Implementiert |
| Zufriedenheit durch Pünktlichkeit/Verspätung | Getestet |
| Stammkunden, Langzeitverträge mit Mindestkapazität | Getestet (Rahmenverträge: feste Touren je Woche, Strafe bei Ausfall, Verlängerung bei guter Erfüllung; zufriedene Stammkunden zahlen in der Börse besser) |
| Ausschreibungen gegen die Konkurrenz | Getestet (verdeckte Gebote, Ruf und Pünktlichkeitsgarantie in der Bewertung, Ergebnisliste, Zuschlag als Rahmenvertrag) |
| KI-Konkurrenz (wirtschaftlich simuliert) | Getestet (Flotte, Kasse, Kosten, Kapazität in LKW-Stunden, übernimmt Börsenaufträge, wirbt unzufriedene Kunden ab, wächst, eröffnet Standorte, gerät in Schwierigkeiten, Konkurs, Neugründungen) |
| Kunden zurückgewinnen | Getestet (Vertriebsbesuch, Chance nach Ruf und Lage des Konkurrenten) |

## 12 · Unternehmensausbau
| Anforderung | Status |
|---|---|
| Standortstufen mit echten Stellplatz-Kapazitäten | Implementiert |
| Werkstatt, Tankanlage, Lager, Logistikzentrum, Niederlassungen, Abteilungen | Getestet (eigene Werkstatt −35 % Kosten, Betriebstankstelle −9 % Diesel, Lagerhalle, Niederlassungen nach Stufe, Abteilungen Disposition/Vertrieb/Buchhaltung/Fuhrpark) |

## 13–14 · Lebenssimulation & Geldkreislauf
| Anforderung | Status |
|---|---|
| Charakter mit 2D-Avatar, Name, Alter, Hintergrund (Startfähigkeiten) | Getestet (Charakter-Editor mit 14 Merkmalen, im Spiel änderbar; Porträts für alle Angestellten; Fahrzeugbilder je Modell und Aufliegertyp) |
| Getrenntes Privat-/Firmenvermögen | Getestet |
| GF-Gehalt beeinflusst Privateinkommen und Firma | Getestet |
| Bedürfnisse mit tatsächlicher Wirkung (Leistungsfähigkeit, Erschöpfung) | Getestet (Arbeitsstil → Stress/Energie, Burnout legt die eigene Disposition lahm; Warnung zwei Tage vorher) |
| Wenig Pflegeaufwand | Getestet (Fokus Firma plant Freizeit, Kontakte und Urlaub; Wochenroutine; langsamere Bedürfnisse) |
| Hintergrund, Ziele, Wohnen, Freizeit, Beziehungen, Familie, Work-Life-Balance, Gewinnausschüttung | Getestet (Aktivitäten, Urlaub, Haus mit Immobilienkredit, Partnerschaft und Familie, Abkühlen von Beziehungen, Ausschüttung mit Kapitalertragsteuer; Ferienhaus, Auto, Möbel, Hobbys, Ziele implementiert) |

## 15–16 · Multiplayer
| Anforderung | Status |
|---|---|
| Firma gründen, Session, Einladungscode, Fortsetzen | Getestet |
| Server startet automatisch beim Hosten/Fortsetzen (Desktop-App, Sidecar) und speichert beim Beenden | Getestet (Server-EXE: Start, Firma gründen, `quit`, Neustart, Wiederladen per Token; Browser-Ablauf manuell) |
| Liste aller eigenen/beigetretenen Multiplayer-Firmen, Host-Adresse für Freunde | Implementiert |
| Wiederbeitritt ohne neue Einladung (Adress-Vermittlung über ntfy.sh) | Getestet (Host-App neu gestartet → neue Tunnel-Adresse; Mitspielerin verbindet sich automatisch neu bzw. per „Fortsetzen“, gleicher Spieler) |
| Auftrag im Team teilen (Chat-Link öffnet Auftrag bei allen) | Getestet (Mitspielerin teilt, Host öffnet per Klick) |
| Internet-Multiplayer ohne Portfreigabe (Cloudflare-Tunnel, Einladung einfügen) | Getestet (Desktop-App hostet, zweiter Spieler tritt über wss-Tunneladresse bei und chattet; Prozesse enden beim Schließen) |
| Echte Netzwerkverbindung & gemeinsame Datenhaltung | Getestet |
| Rollen/Rechte flexibel, durch Gründer vergeben (Rollenvorlagen Geschäftsführung, Disposition, Fuhrparkleitung, Personalleitung) | Getestet |
| Rechtegrenzen: Ausgabenlimit je Ausgabe, nur zugewiesene Niederlassungen | Getestet (zu teurer Kauf wird vollständig zurückgerollt) |
| Synchronisierung aller Spielinhalte | Getestet (Vollzustand beim Beitritt, danach Delta-Updates Ø 0,5 KB; Client-Zustand stimmt exakt mit dem Server überein) |
| Serverseitige Konfliktverhinderung | Getestet |
| Gemeinsame Spielzeit (Pause/Tempo nur Spielleitung, nur mit verbundenen Spielern) | Getestet |
| Firmenchat, Ereignisprotokoll, Benachrichtigungen | Implementiert |
| Interne Nachrichten an einzelne Spieler (nur für Absender/Empfänger sichtbar) | Getestet (auch im Browser mit zwei Spielern) |
| Aufgabenverteilung (Bereich, Zuständige, Fälligkeit, Offen/In Arbeit/Erledigt) | Getestet |
| Abstimmungen über Unternehmensentscheidungen | Getestet |
| Wiederverbindung ohne Schaden | Getestet |
| Backups | Getestet (Anzahl und Intervall konfigurierbar) |
| Eigene Charaktere/Privatkonten je Spieler | Implementiert |
| Gemeinsame Aktivitäten (Essen, Veranstaltung, Freizeit, Geschäftsbesprechung) | Getestet (Einladung, Zusage, Wirkung, Verfall nach 12 h) |
| Gemeinsam Immobilienprojekte planen | Offen (später) |
| Sprachchat | Optional / später |

## 17 · Zeitsystem
| Anforderung | Status |
|---|---|
| Uhrzeit, Datum, Wochentage, Monate, Jahreszeiten, Feiertage | Implementiert |
| Geschwindigkeit Pause–60× | Implementiert |
| Korrekte Pausen auch bei Beschleunigung | Getestet |

## 18 · Ereignisse
| Anforderung | Status |
|---|---|
| Pannen, verzögerte Beladung | Implementiert |
| Staus, Unfälle, Sperrungen, Wetter, Grenzwartezeiten, Kundenänderungen, Unternehmens- und private Ereignisse | Getestet (Ereignisregelwerk mit Bedingungen und Abklingzeiten, Fairnessregeln) |
| Ereignisse mit Entscheidung | Getestet (11 Entscheidungskarten mit Folgen und Vorgabe nach Ablauf, Berechtigungen im Multiplayer) |
| Sonntags- und Feiertagsfahrverbote | Getestet (DE, AT, CH, FR, IT, CZ, SK, HU, PL; Ausnahmen Transporter, Solo-LKW bis 7,5 t, beladene Kühltransporte) |

## 19 · Dynamische Wirtschaft
| Anforderung | Status |
|---|---|
| Abstraktes Warenflussmodell (Häfen, Industrie, Landwirtschaft, Städte) | Getestet |
| Regionale Nachfrageänderung durch Ereignisse/Entwicklung | Getestet |
| Tankstrategie und Tankkarten | Getestet (Dieselpreis je Land, „Günstig tanken“, Tankkarten Basis/Premium, Vorkalkulation mit Länderpreisen) |
| Straßenkontrollen | Getestet (Häufigkeit je Land, Mängel, Stilllegung, Ladungssicherung, Tempo, Tachograph, Fuhrparkmanagement senkt die Quote) |
| Doppelbesatzung | Getestet (Fahrerwechsel ohne Halt, Mitfahren zählt als Pause, Team-Vorkalkulation, Spesen) |
| Fahrzeugausstattung | Getestet (Einbau in der Werkstatt, Kosten, Marktwert, Verbrauch in der Vorkalkulation, Komfort und Zufriedenheit) |
| Firmenlackierung | Getestet (Standard aus dem Spielstart, Prüfung von Farben, Form und Kürzel); im Browser geprüft: Kopfleiste, Fuhrpark, Karte |
| Marketing und Messen | Getestet (Kampagne mit Ablauf, Herkunftsgewicht und Volumen, Messe mit Neukunden, Ruf und Sperrfrist, Online-Auftritt in den Fixkosten) |
| Alternative Antriebe | Getestet (CO₂-Maut, Energiepreise je Antrieb, Ladestopps unterwegs, Ladepark am Standort) |
| Grüne Kunden | Getestet (feste Zuordnung, Anteil, Dispositionsprüfung mit Fahrzeug und Fuhrparkanteil) |
| Kombinierter Verkehr | Getestet (Bahnkanten nur auf Wunsch, Fahrpreis, Ruhe auf dem Zug, kein Diesel); im Browser geprüft: Angebot im Dialog, Karte |
| Karriere-Kampagne (E4) | Getestet (Start mit Rivale und Nachrichten, Sterne nach Zeit, fünf Kapitel bis zum Ende, Ziele rasten ein, Tipp und Fristhinweis, Sperren per Befehl, Container-Zähler, Übernahme des Rivalen ab Kapitel 5, Teilung in Welt und Firma); im Browser geprüft (Gründung als Karriere, Nachrichten-Dialog, Kapitelkarte, Sperrhinweis, Speicherpunkt); Bot-Lauf über 8 Startwerte (Kapitel 1 in 19–34 Tagen) |
| Häfen & Container (E3) | Getestet (14 Terminals mit Wartezeit 0,5–6 h und Ereignissen, deterministisch ohne Simulationszufall; Börse: Import nur ab Terminal mit 2-h-Slot, Export nur zum Terminal; Leerrückgabe mit Gratistagen, Standgeld und verlorenem Container; Gestellung vor dem Export, verpasstes Schiff; Street-Turn; echte Fahrt mit Wartezeit am Tor und Slot-Umbuchung); im Browser geprüft (Reiter Häfen, Karte mit Ampel); Bot-Vergleich über 8 Startwerte (Bot ohne Containerchassis: etwas weniger passende Aufträge) |
| Lager & Kontraktlogistik (E2) | Getestet (Angebot, Annahme, Lagergeld; Einlagerungen als Komplettladungen, Auslagerungen als Teilladungen; verpasste Touren, Kündigung durch den Kunden; automatische Vergabe an Subunternehmer; Lagerpersonal, Durchsatz und Überlastung; Hallenausbau; Umschlag über das Lager; Startvertrag für Bestandshallen, Spielstand-Version 14); Bot-Lauf mit Lagervertrag über 60 Tage ohne verpasste Tour; im Browser geprüft (Reiter Lager, Angebot annehmen, Personal); ohne Lagerhalle Vergleichslauf gegen 0.21.0 unverändert |
| Auswertung und Planungshilfen (E1) | Getestet (Nachkalkulation je Fahrt mit Deckungsbeitrag, Summen aller Berichte stimmen überein, Liquiditätsprognose mit Fixkosten am Monatsersten und Warnung, Engpass-Warnungen, CSV mit Semikolon und Dezimalkomma); im Browser mit 40 Tagen Bot-Spielstand geprüft (Berichte, Fahrten, Prognose, Dashboard-Warnung, CSV-Download); Vergleichslauf gegen 0.20.0 unverändert |
| KI je Firma, Balancing und Last (D6) | Getestet (Abwerben je Firma, vier Firmen mit Bots 5 Tage); Balancing 120 Tage mit 1, 2 und 4 Firmen (5–25 % weniger Umsatz je Firma durch geteilte Börse); Lasttest 4 Firmen etwa 0,5–1,3 s je Spieltag; Vergleichslauf gegen 0.19.0 bytegleich |
| Wettbewerb zwischen Spielerfirmen (D5) | Getestet (Rangliste mit Spielern und KI, verdeckte Gebote je Firma mit Zuschlag und Sicht je Firma, Branchenblatt je Firma mit Rangliste, Auftrag anbieten/übernehmen/ablehnen/verfallen, Marge nach Zustellung, nicht gefahrene Übernahme kostet beide Ruf); im Browser mit zwei Firmen geprüft (Angebot, Übernahme, Rangliste); Vergleichslauf gegen 0.19.0 bytegleich |
| Wettbewerbswelt auf dem Server (D4) | Getestet (Welt-Code gründet Firma, Team-Code tritt Firma bei, getrennte Sichten ohne fremde Aufträge und Preise, Abstimmung über Pause und Tempo mit Verfall, Weltchat, Speichern und Laden der Welt, Neustart des Servers); im Browser mit zwei Firmen geprüft (Firmenwahl, Abstimmung, Mitbewerber auf der Karte, Weltchat); Vergleichslauf gegen 0.19.0 bytegleich |
| Gemeinsame Börse und Kunden je Firma (D3) | Getestet (Kunden gespiegelt mit eigener Beziehung, Preis je Firma, Vergabe an die annehmende Firma, fremde Aufträge gesperrt, zwei Bots 30 Tage in einer Welt); Vergleichslauf gegen 0.19.0 bytegleich |
| Mehrere Firmen in einer Welt (D2) | Getestet (zweite Firma gründen, gemeinsame Zeit und Märkte, eigene Fahrten und Buchungen, Rechte je Firma, verkaufte Firma ruht); Vergleichslauf gegen 0.19.0 bytegleich |
| Welt und Firmen-Shards (D1) | Getestet (Feldaufteilung vollständig, Vergleichslauf identisch, structuredClone, Rücknahme beim Ausgabenlimit, Delta-Synchronisation); im Browser geprüft: Worker, Speichern, Import |
| Subunternehmer | Getestet (Aufträge an Konkurrenz oder Börsenpartner abgeben, Marge, Verspätungsrisiko, Strafe trägt der Partner) |
| Übernahme von Konkurrenten | Getestet (angeschlagen günstig, klein teurer; LKW, Auflieger, Betriebshof, Fahrer, Kunden) |

## 20 · Oberfläche
| Anforderung | Status |
|---|---|
| Dark Mode + Light Mode | Implementiert |
| Alle 14 Hauptbereiche | Implementiert (Unternehmensausbau mit Standorten zusammengelegt; Inhalte späterer Phasen klar gekennzeichnet) |
| Dashboard mit allen geforderten Kennzahlen + Mini-Karte | Implementiert |
| Tabellen, Diagramme, Dialoge, Drag-and-Drop, Tooltips, Benachrichtigungen | Implementiert |
| Kontextmenüs | Implementiert (Rechtsklick auf Fahrzeuge, Aufträge und Fahrer) |
| Anpassbare Panelgrößen | Implementiert (Seitenleiste, Dispositionsliste, Fahrzeugfenster; gespeichert, Doppelklick setzt zurück) |
| Tutorial „Erste Schritte“ | Implementiert (9 Schritte, erkennt den Fortschritt am Spielzustand, hebt das nächste Bedienelement hervor) |
| Hilfesystem | Implementiert (F1 / „?“, Kontexthilfe je Seite, Suche, 25 Artikel) |
| Branchenblatt | Getestet (wöchentliche Ausgabe montags als Zeitungs-Popup, Marktdaten, Dashboard-Anriss, Archiv mit 12 Ausgaben) |
| Dezente Animationen | Implementiert (Seitenwechsel, Meldungen, Dialoge; respektiert „Bewegung reduzieren“) |

## 21–22 · Fortschritt & Schwierigkeit
| Anforderung | Status |
|---|---|
| Unternehmensstufen 1–6 | Getestet (Einzelunternehmen bis Europäischer Logistikkonzern; Fahrzeuge, Lieferungen, Reputation, Standorte, Länder) |
| Schwierigkeitsgrade Einfach/Normal/Realistisch | Implementiert |
| Benutzerdefiniert | Implementiert (Startkapital, Frachtraten, Ereignisse, Zahlungsrisiko, Start-LKW; Grenzen in `sanitizeDifficulty`, auch im Multiplayer) |
| Firmenverkauf und Neustart-Bonus | Getestet (ab Tag 90 im Einzelspiel, Bewertung aus Substanz und Kundenstamm, Bonus bei der nächsten Gründung) |
| Balancing | Getestet (Langzeit-Bot `measure-balance.ts`: Normal wächst mit Leasing auf 5–8 LKW in 18 Monaten, Realistisch bleibt knapp) |

## 23 · Persistenz
| Anforderung | Status |
|---|---|
| Alle geforderten Daten im Spielstand | Getestet |
| Autosave, manuelles Speichern, Wiederherstellung, Schutz vor Beschädigung, Versionierung, Migrationen, MP-Backups | Getestet (Migration eines Spielstands im Format von Version 1 bis Version 9; Ablehnung neuerer, fremder und abgeschnittener Dateien) |
| Fahrzeuge nach dem Laden an exakt gleicher Position | Getestet |

## 24 · Audio
| Anforderung | Status |
|---|---|
| Benachrichtigungstöne (selbst erzeugt, lizenzfrei) | Implementiert |
| Hintergrundmusik, Büroatmosphäre, Telefon | Implementiert (generativ per Web Audio, getrennt regelbar; Telefon bei Kundenanrufen aus dem Ereignisregelwerk) |

## 25–26 · Performance & Architektur
| Anforderung | Status |
|---|---|
| Tick-System getrennt von der Darstellung | Getestet |
| Keine Client-Simulation im Multiplayer | Implementiert |
| Modulare Architektur, Typisierung, Validierung, Transaktionen, Rechteprüfung, Determinismus, strukturierte Logs, Tests | Implementiert |
