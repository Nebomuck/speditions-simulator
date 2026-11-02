# Speditions-Simulator

Ein Speditions- und Unternehmenssimulator für Windows: Du gründest eine kleine Spedition mit einem gebrauchten LKW, einem Fahrer und wenig Kapital, nimmst Aufträge an, disponierst Fahrten über **echte europäische Straßen**, verfolgst deine LKW **live auf der Europakarte** und baust Schritt für Schritt ein internationales Logistikunternehmen auf – allein oder im **kooperativen Multiplayer**.

> Entwicklungsstand: **Version 0.1.0 – Phasen 1–3 spielbar**, Teile von Phase 4, 5 und 9 umgesetzt.
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

Startet den serverautoritativen Spielserver auf `ws://localhost:8787` (Port per `PORT`, Datenbank per `DB` änderbar). Im Spiel unter **Multiplayer** eine Firma gründen und den Einladungscode an Freunde weitergeben. Für Spiele über das Internet muss der Port erreichbar sein (Portfreigabe oder gehosteter Server, siehe [ARCHITECTURE.md](ARCHITECTURE.md#multiplayer)).

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

Erzeugt einen NSIS-Installer unter `apps/desktop/src-tauri/target/release/bundle/nsis/`. Der Installer enthält den Einzelspieler-Modus; für den Multiplayer verbindet sich die App mit einem laufenden Server.

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
- Bibliotheken: MapLibre GL JS (BSD-3), React (MIT), Lucide (ISC), ws (MIT), Vite (MIT), Vitest (MIT), Tauri (MIT/Apache-2.0)
- Sounds werden zur Laufzeit per Web Audio erzeugt; Icons und Avatare sind eigene SVGs.
- Alle Fahrzeughersteller, Firmen und Personen sind frei erfunden.
