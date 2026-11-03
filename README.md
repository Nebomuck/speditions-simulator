<p align="center"><img src="apps/client/public/icon.svg" width="120" alt="Cargovia-Logo"></p>

# Cargovia – Logistik-Simulation Europa

*(bis Version 0.6.0: „Speditions-Simulator“)*

Ein Speditions- und Unternehmenssimulator für Windows: Du gründest eine kleine Spedition mit einem gebrauchten LKW, einem Fahrer und wenig Kapital, nimmst Aufträge an, disponierst Fahrten über **echte europäische Straßen**, verfolgst deine LKW **live auf der Europakarte** und baust Schritt für Schritt ein internationales Logistikunternehmen auf – allein oder im **kooperativen Multiplayer**.

> Entwicklungsstand: **Version 0.12.0 – Phasen 1–12 spielbar** (Code-Signatur des Installers offen).
> Was genau funktioniert und getestet ist, steht in [FEATURE_CHECKLIST.md](FEATURE_CHECKLIST.md).

## Schnellstart (Entwicklung)

Voraussetzungen: Node.js ≥ 24 (getestet mit 26.13). Für den Windows-Build zusätzlich Rust (MSVC-Toolchain).

```bash
npm install
```

```bash
npm run dev
```

Danach <http://localhost:5173> öffnen. Die Simulation läuft vollständig lokal im Browser (Web Worker), Spielstände liegen in IndexedDB.

### Multiplayer-Server

```bash
npm run server
```

Startet den serverautoritativen Spielserver auf `ws://localhost:8787`. Nur für die Browser-Version und für dedizierte Server nötig – **die Desktop-App startet ihren mitgelieferten Server automatisch**, sobald du eine Multiplayer-Firma hostest oder fortsetzt, und beendet ihn beim Schließen (vorher wird gespeichert).

Im Spiel unter **Multiplayer → Neue Firma hosten** gründen. Die Desktop-App öffnet automatisch einen Internet-Zugang (Cloudflare Quick Tunnel, keine Portfreigabe nötig); unter „Team & Kommunikation“ steht die **Internet-Einladung** zum Kopieren. Freunde wählen **Einer Firma beitreten** und fügen sie ein. Im Heimnetz reichen Heimnetz-Adresse und Einladungscode. Alternativ: dedizierter Server mit Portfreigabe oder Reverse Proxy (siehe [ARCHITECTURE.md](ARCHITECTURE.md#multiplayer)).

Dedizierter Server mit TLS, z. B. auf einem VPS hinter [Caddy](https://caddyserver.com) (holt das Zertifikat automatisch):

```
spiel.example.de {
    reverse_proxy localhost:8787
}
```

Den Server startest du dort z. B. mit `npm run server -- --host 127.0.0.1 --db /var/lib/cargovia/spedsim.db` (nur lokal erreichbar, Caddy leitet weiter).

#### Server-Konfiguration

| Einstellung | Kommandozeile | Umgebung | Standard |
|---|---|---|---|
| Port | `--port` | `CARGOVIA_PORT` / `PORT` | 8787 |
| Bind-Adresse | `--host` | `CARGOVIA_HOST` | 0.0.0.0 |
| Datenbank | `--db` | `CARGOVIA_DB` / `DB` | `apps/server/data/spedsim.db` |
| Speicherintervall (s) | `--save-seconds` | `CARGOVIA_SAVE_SECONDS` | 30 |
| Abstand der Sicherungen (min) | `--backup-minutes` | `CARGOVIA_BACKUP_MINUTES` | 10 |
| Sicherungen je Firma | `--backups-keep` | `CARGOVIA_BACKUPS_KEEP` | 10 |
| Spieler je Firma (1–8) | `--max-players` | `CARGOVIA_MAX_PLAYERS` | 8 |

Alternativ alles in einer Datei `cargovia-server.json` im Arbeitsverzeichnis oder per `--config <Datei>` (Vorlage: [apps/server/cargovia-server.example.json](apps/server/cargovia-server.example.json)). Die Kommandozeile hat Vorrang vor der Umgebung, diese vor der Datei. `npm run server -- --help` zeigt alle Optionen. Der Zustand ist unter `http://<server>:8787/health` abrufbar (Version, Laufzeit, Firmen, verbundene Spieler). Mitspieler geben als Server `https://spiel.example.de` (oder `wss://spiel.example.de`) und den Einladungscode ein. Eine Adresse ohne `https://` bzw. `wss://` verbindet unverschlüsselt auf Port 8787.

### Tests

```bash
npm test
```

```bash
npm run typecheck
```

### Windows-Anwendung bauen

```bash
npm run build -w @spedsim/desktop
```

Für ein Release mit In-App-Update stattdessen:

```bash
npm run release:build
```

Das signiert den Installer mit dem privaten Update-Schlüssel (`%USERPROFILE%\.tauri\spedsim-updater.key`, nicht im Repository – sicher aufbewahren!) und erzeugt `latest.json`. Beides an das GitHub-Release hängen; installierte Spiele (ab 0.4.0) bieten das Update dann im Startbildschirm an.

Baut automatisch Oberfläche und Server mit (`beforeBuildCommand`). `npm run build:server` bündelt den Multiplayer-Server mit esbuild und erzeugt daraus eine eigenständige `spedsim-server.exe` (Node Single Executable Application), die als Tauri-Sidecar nach `apps/desktop/src-tauri/binaries/` kopiert wird. Ergebnis ist ein NSIS-Installer unter `apps/desktop/src-tauri/target/release/bundle/nsis/` mit Einzelspieler und eingebautem Multiplayer-Server.

### Straßennetz neu erzeugen (optional)

```bash
npm run roadnet
```

Fragt einmalig und gedrosselt (~1 Anfrage/s) Straßenrouten zwischen benachbarten Städten bei einem OSRM-Server ab und speichert sie in `packages/core/src/data/roadnet.json`. Standard ist der OSRM-Demoserver. Für eigene Läufe sollte ein eigener OSRM-Server genutzt werden: `OSRM_URL=http://localhost:5000 npm run roadnet`.

## Projektstruktur

```
packages/core     Gemeinsame Simulationslogik (TypeScript, UI-unabhängig, deterministisch, getestet)
apps/client       React-Oberfläche + MapLibre-Karte; Einzelspieler-Simulation im Web Worker
apps/server       Multiplayer-Server (WebSocket + SQLite), führt dieselbe Simulationslogik aus
apps/desktop      Tauri-2-Hülle für die native Windows-Anwendung
tools/roadnet     Generator für das Straßennetz aus OpenStreetMap-Routen
```

## Bedienung

| Taste | Funktion |
|---|---|
| Leertaste | Pause / Weiter |
| 1–6 | Geschwindigkeit 1×, 2×, 5×, 10×, 30×, 60× (Spielminuten pro Sekunde) |
| M / D / A | Karte / Disposition / Auftragsbörse |

## Dokumentation

- [GAME_DESIGN.md](GAME_DESIGN.md) – Game Design Document
- [ARCHITECTURE.md](ARCHITECTURE.md) – Technologiewahl, Module, Datenfluss, Multiplayer
- [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md) – Phasenplan, aktueller Stand, nächste Schritte
- [FEATURE_CHECKLIST.md](FEATURE_CHECKLIST.md) – alle Kernanforderungen mit Status
- [TEST_PLAN.md](TEST_PLAN.md) – Testfälle und Ergebnisse
- [CHANGELOG.md](CHANGELOG.md)

## Lizenzen & Datenquellen

- Karten- und Straßendaten © [OpenStreetMap-Mitwirkende](https://www.openstreetmap.org/copyright), ODbL 1.0
- Grundkarte: [OpenFreeMap](https://openfreemap.org) (OpenMapTiles-Schema, BSD-3/CC-BY 4.0) – austauschbar über `VITE_MAP_STYLE_DARK` / `VITE_MAP_STYLE_LIGHT`
- Routenberechnung beim Netzaufbau: OSRM (BSD-2)
- Bibliotheken: MapLibre GL JS (BSD-3), React (MIT), Lucide (ISC), ws (MIT), Vite (MIT), Vitest (MIT), Tauri (MIT/Apache-2.0), cloudflared (Apache-2.0, mitgeliefert für den Internet-Zugang)
- Sounds werden zur Laufzeit per Web Audio erzeugt; Icons und Avatare sind eigene SVGs.
- Alle Fahrzeughersteller, Firmen und Personen sind frei erfunden.
