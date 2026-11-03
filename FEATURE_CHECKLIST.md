# Feature-Checkliste

Statuswerte: **Geplant** · **In Entwicklung** · **Implementiert** (funktioniert, manuell geprüft) · **Getestet** (automatisierter Test vorhanden und bestanden) · **Fehlerhaft** · **Überarbeitet**

Stand: 02.11.2026 · Version 0.1.0

## 3 · Technik & Plattform
| Anforderung | Status | Anmerkung |
|---|---|---|
| Eigenständiger Windows-Client | Implementiert | Tauri 2, NSIS-Installer 2,5 MB gebaut; App startet mit Fenster (Starttest). Spielablauf in der nativen App noch nicht manuell durchgespielt |
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
| Reale Städte | Implementiert | 161 Städte, 29 Länder |
| Reale Straßen, Autobahnen | Implementiert | Grundkarte + 384 echte OSM-Routen |
| Ländergrenzen | Implementiert | Grundkarte |
| Firmenstandorte | Implementiert | orange markiert |
| Werkstätten, Tankstellen, Rastplätze | Geplant | Phase 10 (POI-Layer) |
| Liefer-/Abholorte | Implementiert | Routenvorschau in der Börse |
| Lagerhäuser/Logistikzentren | Getestet | Lagerhalle je Standort (ab Stufe 3): Lagererlöse nach Auslastung, zieht Aufträge an |
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
| Clustering bei sehr vielen Fahrzeugen | Geplant | Phase 11 |

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
| Charakter mit 2D-Avatar, Name, Alter, Hintergrund (Startfähigkeiten) | Implementiert |
| Getrenntes Privat-/Firmenvermögen | Getestet |
| GF-Gehalt beeinflusst Privateinkommen und Firma | Getestet |
| Bedürfnisse mit tatsächlicher Wirkung (Leistungsfähigkeit, Erschöpfung) | Getestet (Arbeitsstil → Stress/Energie, Burnout legt die eigene Disposition lahm) |
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
| Backups | Implementiert |
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
| Sonntags- und Feiertagsfahrverbote | Getestet (DE, AT, CH, FR, IT, CZ, SK, HU, PL; Ausnahmen Transporter, Solo-LKW bis 7,5 t, beladene Kühltransporte) |

## 19 · Dynamische Wirtschaft
| Anforderung | Status |
|---|---|
| Abstraktes Warenflussmodell (Häfen, Industrie, Landwirtschaft, Städte) | Getestet |
| Regionale Nachfrageänderung durch Ereignisse/Entwicklung | Getestet |

## 20 · Oberfläche
| Anforderung | Status |
|---|---|
| Dark Mode + Light Mode | Implementiert |
| Alle 14 Hauptbereiche | Implementiert (Unternehmensausbau mit Standorten zusammengelegt; Inhalte späterer Phasen klar gekennzeichnet) |
| Dashboard mit allen geforderten Kennzahlen + Mini-Karte | Implementiert |
| Tabellen, Diagramme, Dialoge, Drag-and-Drop, Tooltips, Benachrichtigungen | Implementiert |
| Kontextmenüs, anpassbare Panelgrößen | Geplant (Phase 11) |

## 21–22 · Fortschritt & Schwierigkeit
| Anforderung | Status |
|---|---|
| Unternehmensstufen 1–6 | Getestet (Einzelunternehmen bis Europäischer Logistikkonzern; Fahrzeuge, Lieferungen, Reputation, Standorte, Länder) |
| Schwierigkeitsgrade Einfach/Normal/Realistisch | Implementiert |
| Benutzerdefiniert | In Entwicklung (Datenmodell vorhanden, Oberfläche fehlt) |

## 23 · Persistenz
| Anforderung | Status |
|---|---|
| Alle geforderten Daten im Spielstand | Getestet |
| Autosave, manuelles Speichern, Wiederherstellung, Schutz vor Beschädigung, Versionierung, Migrationen, MP-Backups | Getestet / Implementiert |
| Fahrzeuge nach dem Laden an exakt gleicher Position | Getestet |

## 24 · Audio
| Anforderung | Status |
|---|---|
| Benachrichtigungstöne (selbst erzeugt, lizenzfrei) | Implementiert |
| Hintergrundmusik, Büroatmosphäre, Telefon | Geplant (Phase 11) |

## 25–26 · Performance & Architektur
| Anforderung | Status |
|---|---|
| Tick-System getrennt von der Darstellung | Getestet |
| Keine Client-Simulation im Multiplayer | Implementiert |
| Modulare Architektur, Typisierung, Validierung, Transaktionen, Rechteprüfung, Determinismus, strukturierte Logs, Tests | Implementiert |
