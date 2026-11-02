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
| Lagerhäuser/Logistikzentren | Geplant | Phase 6 |
| Verkehrsmeldungen & Ereignisse auf der Karte | Geplant | Phase 10 |
| Fahrerpositionen in Echtzeit | Implementiert | Interpolation pro Frame |
| Aktuelle Fahrzeugrouten | Implementiert | beladen/leer/verspätet farbig |
| Bewegung entlang echter Straßengeometrie (nicht linear) | Getestet | Route-Test + Transporttest |
| Einfluss Straßentyp | Implementiert | Durchschnittsgeschwindigkeit je Abschnitt |
| Einfluss Verkehr | Implementiert | Berufsverkehr in Ballungsräumen |
| Einfluss Wetter | Geplant | Phase 10 |
| Pausen/Ruhezeiten/Tanken/Laden/Pannen | Getestet | |
| Spielgeschwindigkeit | Implementiert | 1×–60× |
| Fahrzeug-Infofenster (alle geforderten Felder) | Implementiert | |
| Fahrerstatus (Unterwegs, Beladung, Entladung, Pause, Ruhezeit, Tanken, Werkstatt, Wartet, Verspätet, Defekt) | Implementiert | |
| Filter: alle/aktiv/verfügbar/verspätet/Fahrer | Implementiert | |
| Filter: Niederlassung, Vertragsaufträge | Geplant | sobald Niederlassungen und Verträge existieren |
| Fahrzeug verfolgen (Auto-Zentrierung) | Implementiert | |
| Heatmaps Nachfrage/Verkehr, Korridore, Flottenverteilung | Geplant | Phase 10 |
| Clustering bei sehr vielen Fahrzeugen | Geplant | Phase 11 |

## 5 · Auftragssystem
| Anforderung | Status | Anmerkung |
|---|---|---|
| Dynamische Transportbörse | Getestet | ca. 320 Angebote |
| Auftragsarten: Stückgut, Paletten, Lebensmittel, Kühl, Tiefkühl, Baustoffe, Schüttgut, Container, Fahrzeuge, Gefahrgut, Schwertransport, Express, International | Implementiert | 19 Ladungsarten |
| Sondertransporte, regionale Verteilerfahrten | Geplant | benötigt Solo-LKW/Transporter (Phase 4) |
| Spezifische Anforderungen (Auflieger, ADR, Schwertransport) | Getestet | |
| Alle Auftragsinformationen inkl. Strafen, Zeitfenster, Kosten | Implementiert | Schwierigkeitsgrad je Auftrag: geplant |
| Generierung nach Bevölkerung, Industrie, Region, Saison, Wochentag, Feiertag, Nachfrage | Getestet | |
| Kundenbeziehungen beeinflussen Angebote | In Entwicklung | Kunden persistent; Einfluss auf Angebotsmenge folgt in Phase 5 |
| Rückladungen / Leerfahrtvermeidung | Implementiert | Börse filtert nach Fahrzeugstandort, Überführungsfahrten |
| Mehrere Aufträge kombinieren (Teilladungen) | Geplant | Phase 4 |

## 6 · Manuelle Disposition
| Anforderung | Status | Anmerkung |
|---|---|---|
| Auftrag/Fahrer/LKW/Auflieger wählen, Route, Kosten, Termine, starten, überwachen | Getestet | |
| Drag-and-Drop | Implementiert | Plantafel |
| Listenansicht | Implementiert | |
| Kalenderansicht (Tag/Woche/Monat) | Geplant | Phase 4 |
| Zeitstrahl (Gantt) | Implementiert | 72 h |
| Kartenansicht | Implementiert | |
| Fahreransicht | Implementiert | |
| Konfliktprüfung (Ruhezeit, belegt, Auflieger, Kapazität, Lieferzeit, Qualifikation, Tank, Wartung) | Getestet | |
| Vorausplanung (Fahrt in der Zukunft starten, Ketten) | Geplant | Phase 4 |
| Umleitung bei Verkehrsbehinderung | Geplant | Phase 10 |

## 7 · KI-Disponenten
| Anforderung | Status |
|---|---|
| Disponenten einstellen, manuelle/teil-/vollautomatische Disposition, Qualitätsstufen, Regeln | Geplant (Phase 7) |

## 8 · Fahrer & Personal
| Anforderung | Status | Anmerkung |
|---|---|---|
| Fahrereigenschaften (alle geforderten) | Implementiert | bevorzugte Touren: geplant |
| Entwicklung durch Erfahrung | Implementiert | |
| Erfahrung/Fahrweise wirkt auf Verbrauch, Verschleiß, Tempo | Implementiert | |
| Bewerbungen, Einstellen, Entlassen | Implementiert | |
| Gespräche, Gehaltsverhandlung, Schulungen, Beförderung, Urlaub, Verträge, Kündigung bei Unzufriedenheit | Geplant | Phase 5 |
| Lenk-/Arbeits-/Ruhezeiten (vereinfachte EU-Regeln) | Getestet | Vereinfachungen siehe GAME_DESIGN.md §7 |
| Fahrerwechsel unterwegs | Geplant | |

## 9 · Fahrzeuge & Fuhrpark
| Anforderung | Status | Anmerkung |
|---|---|---|
| Sattelzugmaschinen | Implementiert | 6 fiktive Modelle |
| Transporter, Klein-LKW, 7,5 t, Verteiler, Spezial | Geplant | Phase 4 |
| 9 Aufliegertypen | Implementiert | |
| Fahrzeugdaten (alle geforderten) | Implementiert | |
| Gebraucht/Neu/Leasing/Verkauf | Implementiert | |
| Finanzierung, Miete, Inzahlungnahme | Geplant | Phase 5 |
| Verschleiß, Pannen unterwegs | Implementiert | Abschleppen vs. Vor-Ort-Reparatur als Entscheidung: geplant |
| Werkstatt/Wartung | Implementiert | |

## 10 · Wirtschaft
| Anforderung | Status | Anmerkung |
|---|---|---|
| Ausgaben: Fahrzeuge, Leasing, Diesel, Maut, Wartung, Reparatur, Versicherung, Löhne + AG-Anteil, Miete, Verwaltung | Getestet | |
| Kredite & Zinsen | In Entwicklung | Überziehungszins umgesetzt; Kredite geplant |
| Steuern, Werbung, Fortbildung, Lager | Geplant | |
| Einnahmen aus Einzelaufträgen, Expresszuschläge, Spezialtransporte | Implementiert | Festverträge: geplant |
| Finanzdashboard | Implementiert | Kontostand, Forderungen, Fixkosten, Unternehmenswert, Kategorien, Hauptbuch |
| Rechnungen, Zahlungsziele, Verzug, Mahnungen, Bonität, Ausfälle | Getestet | |
| Dynamischer Dieselpreis und Nachfrage | Implementiert | Krisen/Konkurrenzdruck: Phase 10 |

## 11 · Kunden, Verträge, Konkurrenz
| Anforderung | Status |
|---|---|
| Kunden mit Branche, Größe, Zahlungsmoral, Zufriedenheit, Preissensibilität | Implementiert |
| Zufriedenheit durch Pünktlichkeit/Verspätung | Getestet |
| Stammkunden, Langzeitverträge mit Mindestkapazität | Geplant (Phase 5) |
| KI-Konkurrenz (wirtschaftlich simuliert) | Geplant (Phase 10) |

## 12 · Unternehmensausbau
| Anforderung | Status |
|---|---|
| Standortstufen mit echten Stellplatz-Kapazitäten | Implementiert |
| Werkstatt, Tankanlage, Lager, Logistikzentrum, Niederlassungen, Abteilungen | Geplant (Phase 6) |

## 13–14 · Lebenssimulation & Geldkreislauf
| Anforderung | Status |
|---|---|
| Charakter mit 2D-Avatar, Name, Alter | Implementiert |
| Getrenntes Privat-/Firmenvermögen | Getestet |
| GF-Gehalt beeinflusst Privateinkommen und Firma | Getestet |
| Bedürfnisse (Datenmodell + Anzeige) | In Entwicklung (Simulation: Phase 8) |
| Hintergrund, Ziele, Wohnen, Freizeit, Beziehungen, Familie, Work-Life-Balance, Gewinnausschüttung | Geplant (Phase 8) |

## 15–16 · Multiplayer
| Anforderung | Status |
|---|---|
| Firma gründen, Session, Einladungscode, Fortsetzen | Getestet |
| Echte Netzwerkverbindung & gemeinsame Datenhaltung | Getestet |
| Rollen/Rechte flexibel, durch Gründer vergeben | Getestet |
| Synchronisierung aller Spielinhalte | Getestet (vollständiger Zustand) |
| Serverseitige Konfliktverhinderung | Getestet |
| Gemeinsame Spielzeit (Pause/Tempo nur Spielleitung, nur mit verbundenen Spielern) | Getestet |
| Firmenchat, Ereignisprotokoll, Benachrichtigungen | Implementiert |
| Interne Nachrichten an einzelne Spieler, Aufgabenverteilung | Geplant (Phase 9) |
| Wiederverbindung ohne Schaden | Getestet |
| Backups | Implementiert |
| Eigene Charaktere/Privatkonten je Spieler | Implementiert |
| Gemeinsame Aktivitäten | Geplant (Phase 9) |
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
| Staus, Unfälle, Sperrungen, Wetter, Grenzwartezeiten, Kundenänderungen, Unternehmens- und private Ereignisse | Geplant (Phase 10) |

## 19 · Dynamische Wirtschaft
| Anforderung | Status |
|---|---|
| Abstraktes Warenflussmodell (Häfen, Industrie, Landwirtschaft, Städte) | Getestet |
| Regionale Nachfrageänderung durch Ereignisse/Entwicklung | Geplant (Phase 10) |

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
| Unternehmensstufen 1–6 | Geplant (Phase 6) |
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
