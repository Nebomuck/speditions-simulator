# Architektur

## Technologiewahl (begründet)

| Bereich | Wahl | Begründung |
|---|---|---|
| Sprache | TypeScript (strikt, nur „erasable syntax“) | Eine Sprache für Client, Server und Simulation. Der Simulationskern läuft unverändert im Browser-Worker und auf dem Server. Node 26 führt `.ts` direkt aus, der Server braucht keinen Build-Schritt. |
| Oberfläche | React 19 + Vite 7 | Etablierte, schnelle Toolchain für eine umfangreiche 2D-Management-Oberfläche |
| Karte | MapLibre GL JS 5 (WebGL) | Open Source (BSD-3), Vektorkacheln, performant mit tausenden Punkten, GeoJSON-Layer für Fahrzeuge und Routen |
| Grundkarte | OpenFreeMap (OSM/OpenMapTiles) | Kostenlos ohne API-Schlüssel; per Umgebungsvariable gegen selbst gehostete PMTiles austauschbar |
| Straßenrouting | **Vorberechnetes Straßennetz** aus OSRM-Routen + Dijkstra im Spiel | Keine Abhängigkeit von öffentlichen Routingservern zur Laufzeit (Nutzungsbedingungen), offline-fähig, deterministisch, schnell. Ein eigener OSRM- oder Valhalla-Server ist nur zum (Neu-)Erzeugen nötig. |
| Desktop | Tauri 2 | Kleiner Installer (WebView2 statt gebündeltem Chromium), Rust ist vorhanden, MIT/Apache-2.0 |
| Multiplayer | Node.js + `ws` (WebSocket) | Gleiche Simulationslogik serverseitig, einfache Echtzeit-Synchronisation |
| Persistenz Server | SQLite über `node:sqlite` | Eingebaut, transaktional, keine externe Datenbank nötig. Für gehostete Großinstallationen ist PostgreSQL später möglich (Spielstände sind ein JSON-Dokument je Firma). |
| Persistenz Einzelspieler | IndexedDB (im Worker) | In Browser und Tauri-WebView verfügbar, großzügige Limits |
| Tests | Vitest | Schnell, versteht TypeScript direkt |

## Module

```
packages/core/src
├── types.ts        Datenmodelle (GameState, Company, Driver, Vehicle, Order, Trip, Invoice, Player …)
├── data/           Weltdaten: cities.ts (161 Städte), catalog.ts (LKW, Auflieger, Ladungen, Maut, Standorte),
│                   names.ts (Namensbausteine), roadnet.json (erzeugtes Straßennetz)
├── geo.ts          Geometrie (Haversine, Polyline, Douglas-Peucker, Position entlang Linie)
├── time.ts         TimeSystem: Kalender, Wochentage, Jahreszeiten, Feiertage, Formatierung
├── rng.ts          deterministischer Zufall (Zustand im Spielstand)
├── routing.ts      RoutingSystem: RoadNetwork, Dijkstra, Positionsberechnung entlang echter Geometrie
├── context.ts      SimContext (unveränderliche Weltdaten zur Laufzeit)
├── hos.ts          DriverSystem: Lenk- und Ruhezeiten
├── finance.ts      FinanceSystem: Buchungen, Rechnungen, Zahlungen, Monatsabrechnung, Log
├── generate.ts     Bewerber, Kunden, Gebrauchtfahrzeuge, Kennzeichen, Marktwert
├── orders.ts       OrderSystem: Warenflussmodell, Auftragsbörse
├── dispatch.ts     DispatchSystem: Vorkalkulation, Konfliktprüfung, Fahrtanlage, Vorausplanung
│                   (Warteschlange je Fahrzeug, vehicleSchedule, startNextQueued), Beiladung (planCoLoad)
├── disruptions.ts  Verkehrsstörungen (Sperrung/Stau, wetterbedingte Sperrungen), Routing nach Verkehrslage, Umleitung
├── world.ts        Wetter je Land, Fahrverbote, Zollgrenzen und Grenzwartezeiten,
│                   Fahrzeitschätzung je Abschnitt (routeSegments, simulateRoute)
├── economy.ts      Konjunktur (Normal/Aufschwung/Krise), regionale Nachfrage, Saison
├── competition.ts  KI-Konkurrenz: Kapazität, Auftragsübernahme, Kosten, Wachstum, Konkurs, Abwerbung, Rückgewinnung
├── events.ts       Ereignisregelwerk (Bedingung, Chance, Abklingzeit, Fairness) für Firma, Markt und Privatleben
├── team.ts         Multiplayer-Zusammenarbeit: Rollen, Grenzen, Nachrichten, Aufgaben, gemeinsame Aktivitäten, Abstimmungen
├── delta.ts        Delta-Synchronisation (diffState/applyPatch)
├── contracts.ts    Rahmenverträge: Angebote, Touren je Wochentag, Strafen, Verlängerung
├── personnel.ts    Personal: Urlaub, Krankheit, Schulungen, Gehalt, Gespräche, Kündigungen
├── company.ts      Unternehmensausbau: Stufen, Niederlassungen, Einrichtungen, Abteilungen, Flottenwartung
├── autodispatch.ts KI-Disposition: Regeln, Vorschläge, automatische Fahrten (nutzt estimateTrip/validateDispatch)
├── life.ts         Lebenssimulation: Bedürfnisse, Arbeitsstil, Wohnen, Freizeit, Beziehungen, Ausschüttung
├── trips.ts        VehicleSystem: minutengenaue Fahrtsimulation
├── sim.ts          SimulationEngine: Minuten-Tick, stündliche/tägliche/monatliche Prozesse
├── commands.ts     CommandSystem: alle Spieleraktionen + Berechtigungen
├── game.ts         GameCore: neues Spiel, Spieler hinzufügen, Schwierigkeitsgrade
├── save.ts         PersistenceSystem: Speicherformat, Prüfsumme, Migrationen
├── session.ts      GameSession: Echtzeit → Spielminuten, Befehlsausführung
└── selectors.ts    abgeleitete Ansichten (Fahrzeugposition, ETA, Verspätung)

apps/client/src
├── worker/         Einzelspieler-Host (GameSession im Web Worker) + IndexedDB-Speicher
├── game/           GameHost-Abstraktion (LocalHost / RemoteHost), Client-Store, Protokoll
├── ui/             MapView (MapSystem), DispatchDialog, Shell, Komponenten, Tutorial, Hilfe (help.ts),
│                   Kontextmenü, Audio (sound.ts: Effekte, generative Musik, Büroatmosphäre, Telefon)
└── pages/          Dashboard, Karte, Disposition, Börse, Personal, Fuhrpark, Finanzen, Kunden,
                    Standorte, Markt & Wettbewerb, Privatleben, Team, Statistiken, Einstellungen

apps/server/src     MultiplayerServer (Räume, Authentifizierung per Token, SQLite, Backups)
```

Die Abhängigkeiten zeigen nur in eine Richtung: `types/data/geo/time/rng` → `routing/hos/finance/generate` → `orders/dispatch/trips` → `sim/commands/game` → `save/session/selectors`. Die Oberfläche und der Server hängen nur von `@spedsim/core` ab.

## Zustand & Determinismus

- Der gesamte Spielzustand ist **ein JSON-Objekt** (`GameState`): serialisierbar, synchronisierbar, speicherbar.
- Geld in ganzen Cent, Zeit in ganzen Spielminuten.
- Zufall nur über `rng.ts` mit Zustand im Spielstand. Gleicher Spielstand + gleiche Befehle ergeben den gleichen Verlauf; der Speichertest prüft das.
- Fahrten speichern nur Knotenfolgen und km-Fortschritt. Die Geometrie kommt aus dem Straßennetz, deshalb bleiben Spielstände klein.

## Simulationsschleife

```
Echtzeit Δt ─► GameSession.advance(Δt) ─► Spielminuten = Δt × speed ─► tickMinute() × n
                                                       │
     tickMinute: Fahrten (Fahren/Pausen/Tanken/Laden/Pannen) → Fahrer-Ruhe → Werkstatt
                 + stündlich: Wetter, KI-Konkurrenz, Auftragsbörse, Rechnungen, Verkehrsstörungen, Rückkehr/Austritt Personal, verpasste Vertragstouren, automatische Wartung, KI-Disposition, Team (Einladungen, Abstimmungen), stündliche Ereignisse
                 + täglich:   Diesel, Konjunktur/Regionen, Konkurrenz (Kosten, Abwerbung), Ereignisregelwerk, Bewerber, Gebrauchtmarkt, Zufriedenheit/Krankheit, Vertragstouren für morgen, Miete, Unternehmensstufe, Lagerauslastung, Lebenssimulation, Statistik, Monatsabrechnung (inkl. Lagererlöse, Monatsabschluss der Konkurrenz)
```

- Die Simulation läuft unabhängig von der Darstellung: im Worker (Einzelspieler) bzw. auf dem Server (Multiplayer).
- Der Client bekommt alle 200–250 ms einen Schnappschuss und **interpoliert die Fahrzeugpositionen pro Animationsframe** (~30 fps). Dafür rechnet er die aktuelle Geschwindigkeit × die seit dem Schnappschuss vergangene Spielzeit entlang der echten Straßengeometrie hoch.
- Performance gemessen: 300 gleichzeitig fahrende LKW, 1 Spieltag (1.440 Ticks) in ca. 0,9 s (mit Wetter, Konkurrenz und Ereignissen). Positionsberechnung für alle Fahrzeuge < 100 ms.

## Befehle & Berechtigungen

## Disposition: Laderaum und Vorausplanung

- `loadSpace(modelId, trailerType)` liefert den Laderaum: Solo-LKW und Transporter haben einen festen Aufbau (`TruckModel.body`, `payloadT`), Sattelzugmaschinen den des Aufliegers. Maut und Tempo skalieren über `tollFactor`/`speedFactor` des Modells.
- Vorausplanung: `Vehicle.queue` hält bis zu 5 Folgeaufträge (`queueDispatch`). `estimateTrip` und `validateDispatch` rechnen dafür ab einem `PlanStart` (Ort, Zeit, Lenkzeit) am Ende der vorherigen Fahrt. `vehicleSchedule` verkettet laufende Fahrt (ETA aus `tripEta`) und Warteschlange; Plantafel und Kalender lesen nur daraus.
- Endet eine Fahrt, startet `startNextQueued` den nächsten Auftrag mit demselben Fahrer und Auflieger. Ist er nicht mehr zulässig, geht er mit Warnung zurück in die angenommenen Aufträge.
- Halte: Jede Auftragsfahrt hat `stops` (Laden/Entladen je Auftrag), `legs[i]` führt zu `stops[i]`. `planCoLoad` probiert alle Einfügestellen für Laden und Entladen eines weiteren Auftrags ab dem Planungsanker (nächster Knoten bzw. aktueller Halt), prüft die Nutzlast über die ganze Folge und wählt die mit den wenigsten Umweg-km und Verspätungsminuten. Der bereits befahrene Teil des aktuellen Abschnitts bleibt erhalten, damit die Fahrzeugposition gültig bleibt.
- `tripStopEtas` schätzt Ende jedes Halts mit Lenk-/Ruhezeiten, Ladefenstern und Störungen; Plantafel, Kalender, Fahrzeugfenster und Verspätungsprüfung nutzen sie.

## Verkehrsstörungen

- `state.disruptions` hält Sperrungen/Staus auf Straßenkanten. Stündlich laufen alte ab und neue entstehen:
  - je fahrendem LKW nach gefahrener Strecke (`JAMS_PER_1000_KM` ≈ 1 Stau, `CLOSURES_PER_1000_KM` ≈ 0,12 Sperrungen je 1.000 km, mal Ereignisfaktor) auf einer Kante bis 150 km voraus, höchstens eine Störung gleichzeitig vor einem LKW;
  - dazu wenige Hintergrundstörungen im übrigen Netz für die Verkehrslage auf der Karte.
- Ein Stau kostet einen festen Zeitverlust (meist 8–20 min, selten bis 40 min); der Geschwindigkeitsfaktor wird aus der Fahrzeit der Kante berechnet. Sperrungen dauern meist 1–3 h, Bauarbeiten/Brückensperrungen 2–4 h.
- `routeNow` sucht Routen nach aktueller Verkehrslage (`RoadNetwork.route(from, to, traffic)`: gesperrte Kanten ausgeschlossen, Staus mit höherer Fahrzeit; eigener Cache je Verkehrszustand). Neue Fahrten und jeder neue Abschnitt einer laufenden Fahrt werden damit geplant.
- Entsteht eine Sperrung auf dem weiteren Weg einer laufenden Fahrt, leitet `rerouteAffected` sie ab dem nächsten Knoten um. Steht ein LKW schon auf der gesperrten Kante, wartet er (`blocked`).

Jede Spieleraktion ist ein serialisierbarer `Command`. `applyCommand(state, ctx, actorId, cmd)` prüft das Recht, validiert die Eingaben und ändert den Zustand atomar. Im Multiplayer führt **nur der Server** Befehle aus, und zwar strikt nacheinander. Doppelte Zuweisungen sind dadurch ausgeschlossen: Der zweite von zwei gleichzeitigen Dispositionsbefehlen scheitert an der Konfliktprüfung (getestet).

## Wetter, Fahrverbote, Grenzen

- `state.weather[land]` hält Wetterlage und Dauer; `updateWeather` würfelt stündlich abgelaufene Lagen neu (`weatherWeights` nach Monat und Breitengrad). `edgeWeather` liefert das Wetter einer Straßenkante über das Land ihres Startknotens.
- `trips.ts` multipliziert das Tempo mit `WEATHER[kind].speed`; Unfälle und Reifenschäden werden je gefahrenem km mit einem gemeinsamen Zufallswert gewürfelt (`ACCIDENT_PER_KM` × Wetterrisiko × Erfahrung × Ereignisfaktor).
- `banUntil(land, t)` gibt das Ende eines laufenden Fahrverbots zurück; `banApplies` prüft Fahrzeug und Ladung. Vor jeder neuen Kante prüft die Fahrt das Verbot im Land dieser Kante (Aktivität `ban`, zählt als Ruhe).
- Planung und Simulation nutzen dieselben Regeln: `routeSegments` zerlegt eine Route in Abschnitte (Land, Fahrzeit mit Stau und Wetter, Wartezeit an Grenze/Sperrung), `simulateRoute` fährt sie mit Lenk-/Ruhezeiten und Fahrverboten ab. `estimateTrip`, `tripStopEtas` und damit Plantafel, Verspätungsprüfung und Folgeaufträge bauen darauf auf. `pickupWaitMin` (hos.ts) entscheidet, ob ein Fahrer die Wartezeit an der Ladestelle für die Tagesruhe nutzt. Der Lenkzeitstand am Ende einer Fahrt wird als `PlanStart.hos` an Folgeaufträge weitergegeben.
- `isCustomsBorder` erkennt Zollgrenzen; beim ersten Befahren der Grenzkante würfelt `rollBorderWait` die Wartezeit (Aktivität `border`, gemerkt in `trip.borderEdge`). `routeBorderMin` plant den Erwartungswert in `estimateTrip` und `remainingDriveMin` ein.

## Wirtschaft, Konkurrenz und Ereignisse

- `state.economy` hält Konjunkturphase, Index (`cycle`) und regionale Faktoren (`regions[land] = {factor, target, reason, until}`). `dailyEconomy` bewegt sie träge auf ihr Ziel zu und setzt `market.demand = Saison × cycle`. `orders.ts` gewichtet die Herkunft mit `regionFactor^1.5` und den Preis mit Region und `competitionPriceFactor`.
- `state.competitors` hält die KI-Speditionen. Das Modell rechnet mit LKW-Stunden statt einzelnen Fahrten: `hourlyCompetition` fügt Kapazität hinzu (`trucks × 0,55` je Stunde) und übernimmt passende Börsenangebote (Status `expired` mit `takenBy`) gegen `km/62 + 3` Stunden. Kosten fallen täglich an, der Monatsabschluss entscheidet über Wachstum, Schwierigkeiten und Konkurs.
- `state.events` hält je Regel den letzten Auslösezeitpunkt und einen Verlauf (max. 60). `dailyEvents`/`hourlyEvents` prüfen die Regeln in fester Reihenfolge; jede hat `when` (Bedingung), Chance und Abklingzeit. Abklingzeiten und Fairness prüft zentral `allowed`.

## Multiplayer

- **Betriebsmodell:** Serverprozess, entweder automatisch von der Desktop-App des Hosts gestartet (Sidecar, siehe unten) oder dediziert (`npm run server`), lokal, im LAN oder gehostet (VPS/Container). Ein Server verwaltet beliebig viele Firmen (Räume).
- **Protokoll (JSON über WebSocket):**
  - Client → Server: `create`, `join` (Einladungscode + Name oder playerId + Token), `cmd`, `resync`
  - Server → Client: `welcome` (playerId, inviteCode, Token), `state` (Vollzustand mit `rev`), `patch` (`base`, `rev`, `ops`), `result`, `error`
- **Delta-Synchronisation (`delta.ts`):** Jeder Client bekommt beim Beitritt den Vollzustand (~160 KB), danach alle 250 ms bei Änderungen und sofort nach erfolgreichen Befehlen nur noch die Änderungen.
  - Der Server merkt sich je Client den zuletzt gesendeten Zustand; `diffState` vergleicht ihn mit dem aktuellen und liefert Operationen (Wert setzen, Schlüssel löschen, Liste „vorne n entfernen, hinten anhängen“ für Protokoll, Chat und Buchungen).
  - `applyPatch` wendet sie auf Server- und Clientseite identisch und unveränderlich an. Unveränderte Teile bleiben dieselben Objekte, das passt zu React.
  - Jedes Delta nennt seine Basis (`base`). Passt sie nicht zum Stand des Clients, fordert er mit `resync` den Vollzustand an. Sehr große Deltas (> 200 KB, z. B. nach Vorspulen) werden als Vollzustand geschickt.
  - Gemessen im Multiplayertest: Ø 0,5 KB je Delta statt 162 KB je Schnappschuss.
- **Sicht je Spieler (`playerView`):** Interne Nachrichten gehen nur an Absender und Empfänger; alles andere ist für alle Spieler gleich.
- **Wiederverbindung:** Der Client speichert playerId und Token und verbindet sich bei Abbruch automatisch neu. Die Simulation bleibt unbeschädigt, weil sie serverseitig liegt.
- **Gemeinsame Zeit:** Der Raum simuliert nur, solange Spieler verbunden sind. Ohne Spieler wird gespeichert (mit Backup) und der Raum entladen.
- **Persistenz:** Autosave alle 30 s bei Änderungen, Backup alle 10 min (die letzten 10 je Firma), beim Beenden und beim Verlassen des letzten Spielers. Ist der Spielstand beschädigt, wird das letzte Backup geladen.
- **Sicherheit:** Nachrichten maximal 64 KB, Eingaben werden bereinigt, Berechtigungen serverseitig geprüft, Spieler-Token mit 144 Bit Zufall. TLS (wss://) übernimmt ein vorgeschalteter Reverse Proxy (Beispiel für Caddy im README).
- **Zusammenarbeit (`team.ts`):** Rollen als Rechtevorlagen (Geschäftsführung, Disposition, Fuhrparkleitung, Personalleitung, Individuell), Ausgabenlimit je Ausgabe und Beschränkung auf zugewiesene Niederlassungen, interne Nachrichten, Aufgaben, gemeinsame Aktivitäten und Abstimmungen.
  - Alles sind Commands und damit serverautoritativ. Stündlich verfallen offene Einladungen bzw. finden mit den Zusagen statt, und abgelaufene Abstimmungen werden ausgewertet (`hourlyTeam`).
  - Das Ausgabenlimit gilt für Befehle, die vom Firmenkonto zahlen (Kauf, Ausbau, Wartung, Einstellung, Schulung, Ausschüttung). `applyCommand` führt den Befehl aus und stellt den vorherigen Zustand wieder her, wenn er mehr gekostet hat als erlaubt. So gilt das Limit für jede Kostenquelle, ohne sie einzeln vorab zu berechnen.

## Speicherformat

```json
{ "format": "spedsim-save", "version": 1, "savedAt": "…", "name": "…", "checksum": "fnv1a32",
  "meta": { "company": "…", "time": 0, "balance": 0 }, "state": { … GameState … } }
```

- Die Prüfsumme läuft über den exakten JSON-Text von `state`. Beschädigte Dateien werden erkannt; dann wird die Sicherungskopie geladen.
- `MIGRATIONS[n]` hebt Spielstände von Version n auf n+1. Neuere Spielstände werden abgelehnt.
- Einzelspieler: Autosave bei jedem Tageswechsel in drei rotierenden Slots plus manuelles Speichern. Beim Überschreiben bleibt `.bak` erhalten. Export und Import als Datei sind möglich.

## Kartendaten – Lizenzen & Betrieb

| Dienst | Nutzung | Hinweise / Alternative |
|---|---|---|
| OSRM-Demoserver | nur einmalig beim Erzeugen des Straßennetzes (~400 Anfragen, 1/s gedrosselt) | Für Regenerierung eigenen OSRM per Docker (`osrm/osrm-backend`, Europe-Extract von Geofabrik) |
| OpenFreeMap-Kacheln | Grundkarte zur Laufzeit | Kostenlos, ohne Schlüssel, Spenden-finanziert. Für Produktion eigene PMTiles (Protomaps) auf einem statischen Host bereitstellen und `VITE_MAP_STYLE_*` setzen. |
| OpenStreetMap-Daten | Straßengeometrie | ODbL 1.0 – Namensnennung ist im Spiel (Kartenattribution, Einstellungen) und in der README hinterlegt |

## Desktop-Build

`apps/desktop/src-tauri` bündelt `apps/client/dist` als native Windows-App (WebView2). Die Simulation läuft im Web Worker der App, Spielstände in IndexedDB des App-Profils. Geplant: Spielstände zusätzlich als Dateien im Benutzerordner (Tauri-fs).

**In-App-Update:** `tauri-plugin-updater` prüft beim Start `https://github.com/Nebomuck/speditions-simulator/releases/latest/download/latest.json`. Installer und `latest.json` erzeugt `npm run release:build` (`tools/release-build.ts`); die Signatur (minisign) wird mit dem öffentlichen Schlüssel in `tauri.conf.json` geprüft. Vor der Installation beendet die App Server und Tunnel, damit der Installer deren Dateien ersetzen kann (`installMode: passive`), danach Neustart über `tauri-plugin-process`. Rechte: `src-tauri/capabilities/default.json`.

**Eingebauter Multiplayer-Server (Sidecar):** `tools/build-server.ts` bündelt `apps/server` mit esbuild zu einer CommonJS-Datei und baut daraus per `node --build-sea` eine eigenständige `spedsim-server.exe`, die Tauri als `externalBin` mitinstalliert. Der Rust-Teil (`src-tauri/src/main.rs`) stellt die Befehle `start_server`, `stop_server`, `server_running`, `local_address` sowie `start_tunnel`, `stop_tunnel`, `tunnel_url` bereit:

- `start_server` prüft, ob Port 8787 frei ist (belegt → vorhandener Server wird genutzt), startet den Sidecar mit `--port`, `--db <AppData>/server/spedsim.db` und `--parent-stdin` und wartet auf die Zeile `server_started`.
- Beim Beenden der App schreibt sie `quit` auf stdin; der Server speichert alle Räume und beendet sich (Fallback nach 5 s: Prozess beenden).
- **Internet-Zugang:** `start_tunnel` startet den zweiten Sidecar `cloudflared tunnel --url http://127.0.0.1:8787` (Quick Tunnel ohne Konto) und liefert die `https://…trycloudflare.com`-Adresse, sobald die erste Tunnelverbindung registriert ist. Der Client wartet dann per DNS-over-HTTPS, bis der neue Name öffentlich auflösbar ist (eine zu frühe normale DNS-Abfrage würde als „nicht gefunden“ im Windows-/Router-Cache landen), prüft eine echte WebSocket-Verbindung über `wss://` und zeigt erst dann die Einladung `adresse/CODE` an. Da sich die Adresse bei jedem Start ändert, tritt ein bekannter Mitspieler mit gleichem Code automatisch wieder als derselbe Spieler (playerId + Token) bei.
- **Adress-Vermittlung (Wiederbeitritt ohne neue Einladung):** Sobald der Tunnel bereit ist, veröffentlicht die Host-App ihre Tunnel-Adresse per `POST https://ntfy.sh/<kanal>` (alle 6 h erneuert, ntfy.sh hält 12 h vor). Der Kanalname ist `spedsim-` + SHA-256(`spedsim:<gameId>:<Einladungscode>`), also ohne Einladungscode nicht erratbar; übertragen wird nur die Adresse. Mitspieler fragen beim „Fortsetzen“ und vor jedem Wiederverbindungsversuch (`RemoteHost.resolveUrl`) die neueste Nachricht ab; akzeptiert werden nur `https://…trycloudflare.com`-Adressen.
- Der Client (`game/multiplayer.ts`) merkt sich alle Multiplayer-Firmen mit Zugangsdaten. Beim Hosten oder Fortsetzen einer eigenen Firma ruft er zuerst `start_server` auf und verbindet sich dann.
