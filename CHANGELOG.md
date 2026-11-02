# Changelog

## 0.2.0 – 02.11.2026

### Hinzugefügt
- Eingebauter Multiplayer-Server in der Desktop-App: Beim Hosten oder Fortsetzen einer eigenen Multiplayer-Firma startet die App den Server automatisch (eigenständige `spedsim-server.exe` als Tauri-Sidecar, kein Node.js nötig). Beim Schließen der App wird gespeichert und der Server beendet. Ist Port 8787 bereits belegt, nutzt die App den dort laufenden Server.
- Multiplayer-Menü neu: Liste aller gehosteten und beigetretenen Firmen mit „Fortsetzen“, getrennte Abläufe „Neue Firma hosten“ und „Einer Firma beitreten“ (Adresse ohne `ws://` und Port eingebbar), optional Gründung auf externem Server
- Team-Seite zeigt dem Host die Netzwerkadresse und den Einladungscode zum Kopieren sowie Hinweise zu Portfreigabe/VPN und Firewall
- Server-Parameter `--port`, `--db`, `--parent-stdin`; `npm run build:server`

### Geändert
- Pausieren im Multiplayer erfordert das Recht „Spielleitung“

### Behoben
- Dieselpreis und €/km wurden mit Dezimalpunkt statt -komma angezeigt
- Verbindungsfehler vor dem Beitritt führten zu endlosen Wiederverbindungsversuchen; jetzt erscheint eine klare Fehlermeldung („Server … nicht erreichbar“)
- Erster 0.2.0-Installer enthielt noch die Oberfläche von 0.1.0 („Firma gründen“ reagierte nicht). Der Tauri-Build baut Client und Server jetzt immer selbst mit (`beforeBuildCommand`)

## 0.1.0 – 02.11.2026

Erste spielbare Version (Phasen 1–3, Teile von 4, 5, 6, 8, 9).

### Hinzugefügt
- Monorepo: `@spedsim/core` (Simulation), `@spedsim/client` (React/MapLibre), `@spedsim/server` (Multiplayer), `@spedsim/desktop` (Tauri)
- Europäisches Straßennetz aus echten OpenStreetMap-Routen (161 Städte, 384 Verbindungen), Offline-Routing per Dijkstra
- Minutengenaue Fahrtsimulation entlang echter Straßengeometrie mit Straßentyp, Berufsverkehr, Lenk-/Ruhezeiten, Tankstopps, Be-/Entladung, Wartezeiten, Pannen
- Auftragsbörse mit Warenflussmodell (19 Ladungsarten, Saison, Wochentag, Feiertage, Nachfrage), Gewinnschätzung, Filtern
- Disposition: Dialog mit Vorkalkulation und Konfliktprüfung, Plantafel mit Drag-and-Drop, 72-h-Zeitstrahl, Listen- und Fahreransicht, Überführungsfahrten
- Live-Karte: Fahrzeuge, Routen, Filter, Fahrzeugfenster, Verfolgen-Modus, Dark-/Light-Kartenstil, Offline-Fallback
- Finanzen: Hauptbuch, Rechnungen mit Zahlungszielen, Mahnungen, Zahlungsausfälle, Monatsabrechnung, Überziehungszinsen, Unternehmenswert
- Fuhrpark: Gebrauchtmarkt, Neukauf, Leasing, Verkauf, Werkstatt; Auflieger
- Personal: Bewerbungen, Einstellen, Entlassen, Fahrereigenschaften mit Spielwirkung
- Standorte mit Stellplatz-Kapazität und Ausbau
- Privatleben-Grundlage: Charakter mit Avatar, Privatkonto, Geschäftsführergehalt
- Multiplayer: Server mit SQLite, Einladungscodes, Rechten, Chat, Wiederverbindung, Autosave und Backups
- Speichern: versioniert, Prüfsumme, Migrationskette, rotierende Autosaves, Export/Import
- 19 automatisierte Tests (Transport, Wirtschaft, Fahrer, Disposition, Speichern, Leben, Rechte, Warenfluss, Performance, Multiplayer)

### Build
- Windows-Installer `Speditions-Simulator_0.1.0_x64-setup.exe` (NSIS, 2,5 MB) erfolgreich gebaut; die App startet mit Hauptfenster

### Behoben (während der Entwicklung gefunden)
- ETA-Anzeige zeigte Nachkommastellen bei Minuten
- Gewichte wurden mit Dezimalpunkt statt -komma angezeigt
- Team-Seite stürzte ab, weil `scrollIntoView` in aktuellen Browsern ein Promise liefert, das der Effekt an React zurückgab
- Tauri-Bundle-Kategorie korrigiert (`SimulationGame`)
- Road-Netz-Generator: Der OSRM-Demoserver unterstützt `exclude=ferry` nicht; Fähren werden jetzt über die Routenschritte erkannt
