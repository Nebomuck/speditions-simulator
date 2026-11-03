# Changelog

## 0.10.0 – 03.11.2026

- **Wetter:** Jedes Land hat eigenes Wetter nach Jahreszeit und Lage – Regen, Nebel, Schnee, Glätte, Sturm, Hitze. Schlechtes Wetter bremst die LKW (Schnee −28 %, Glätte −40 %), erhöht das Unfallrisiko und führt gelegentlich zu wetterbedingten Sperrungen. Das Fahrzeugfenster zeigt das Wetter am Standort.
- **Unfälle und Reifenschäden:** selten, aber spürbar (Stillstand, Kosten, Fahrzeugzustand, Kundenzufriedenheit); erfahrene Fahrer haben weniger Unfälle.
- **Fahrverbote** für LKW über 7,5 t in Deutschland, Österreich, der Schweiz, Frankreich, Italien, Tschechien, der Slowakei, Ungarn und Polen (Sonn- und Feiertage, teils samstags und nachts). Transporter, leichte Solo-LKW und beladene Kühltransporte sind ausgenommen. Die Disposition warnt vorher.
- **Zollgrenzen:** An den Grenzen zur Schweiz, zu Norwegen, Großbritannien und zum Westbalkan wird kontrolliert (im Schnitt 35 min, am Westbalkan 2 h). Die Vorkalkulation plant die Wartezeit ein.
- **Konjunktur:** Normale Lage, Aufschwung und Krise wechseln sich über Monate ab. In der Krise gibt es weniger Aufträge und Kunden zahlen schleppender.
- **Regionen:** Jede Region hat eine eigene Nachfrage, die Ereignisse wie Messen, Werksschließungen oder Erntesaison verschieben. Sie bestimmt, wo Ladungen entstehen und wie gut sie bezahlt werden.
- **KI-Konkurrenz:** Fünf bis sieben fiktive Speditionen mit eigener Flotte, Kasse, Strategie und Ruf übernehmen Aufträge aus der Börse, wachsen, eröffnen Standorte – oder gehen in Konkurs, und neue kommen hinzu. Angebote stehen zuerst 90 Minuten nur dir zur Verfügung.
- Unzufriedene Kunden können zur Konkurrenz wechseln. Mit einem Vertriebsbesuch lassen sie sich zurückgewinnen.
- **Ereignisse** nach einem Regelwerk: Großkunden, Ausschreibungen mit guten Preisen, Dieselpreissprünge, Marktchancen, Kundenänderungen, Vertragskündigungen bei schlechter Erfüllung, private Ereignisse. Negative Ereignisse kommen höchstens alle 4 Tage und nicht, solange das Firmenkonto im Minus ist.
- Neue Seite **Markt & Wettbewerb** mit Konjunktur, Regionen und Wetter, Fahrverboten, Konkurrenz und allen Ereignissen. In der Börse sind Ausschreibungen markiert.

## 0.9.1 – 03.11.2026

- Updates erscheinen beim Start als Fenster mit den Neuerungen („Jetzt aktualisieren“ oder „Später“). Nach „Später“ bleibt ein Hinweis in der Fußzeile.
- Eigene Bestätigungsdialoge statt der Windows-Meldung „tauri.localhost meldet …“ – z. B. beim Löschen von Spielständen, Entlassen, Verkaufen und Stornieren. Beim Verlassen ins Hauptmenü gibt es „Speichern“ und „Ohne Speichern“.
- Copyright-Hinweis in der Fußzeile des Startbildschirms, unten in der Seitenleiste und bei den Lizenzen.

## 0.9.0 – 03.11.2026

- **Multiplayer – Zusammenarbeit im Team** (Team & Kommunikation, jetzt mit Tabs):
  - Rollen: Geschäftsführung, Disposition, Fuhrparkleitung, Personalleitung oder individuell. Die Rolle setzt passende Rechte; neue Mitspieler starten als Disposition.
  - Grenzen je Spieler: Ausgabenlimit je Ausgabe vom Firmenkonto und „nur zugewiesene Niederlassungen verwalten“.
  - Interne Nachrichten an einzelne Mitspieler (nur für Absender und Empfänger sichtbar), mit Posteingang, Gesendet und Antworten.
  - Aufgabenverteilung mit Bereich, Zuständigem und Fälligkeit: Offen → In Arbeit → Erledigt.
  - Gemeinsame Aktivitäten: zusammen essen gehen, Veranstaltung, Freizeit und Geschäftsbesprechung (eine Woche +2 % auf neue Aufträge). Einladung, Zusage, jeder zahlt privat.
  - Abstimmungen über Unternehmensentscheidungen.
  - Neue Nachrichten, Aufgaben, Einladungen und Abstimmungen erscheinen als Meldung und als Zähler im Menü.
- **Delta-Synchronisation:** Nach dem Beitritt schickt der Server nur noch Änderungen statt des ganzen Spielstands – im Schnitt 0,5 KB statt 160 KB je Aktualisierung. Das entlastet langsame Verbindungen und den Tunnel deutlich.
- Anleitung für einen eigenen Server mit TLS hinter Caddy (README).
- Dashboard: Die Mitarbeiterzahl zählt jetzt auch das Büropersonal.
- **Verkehrsstörungen realistischer:** Staus und Sperrungen entstehen jetzt nach der gefahrenen Strecke statt pauschal pro Stunde – im Schnitt etwa ein Stau je 1.000 km und eine Sperrung je 8.000 km. Vor einem LKW liegt höchstens eine Störung gleichzeitig.
  - Ein Stau kostet meist 8–20 Minuten, selten bis 40 Minuten (vorher konnte ein Stau eine ganze lange Strecke auf 30–60 % Tempo bremsen).
  - Sperrungen sind kürzer: meist 1–3 Stunden, Bauarbeiten und Brückensperrungen 2–4 Stunden.
  - Messung mit einem LKW über 15 Tage: Zeitverlust durch Staus von 9 % auf rund 1 % der Fahrzeit, Umleitungen von 14 auf 1, Warten an Sperrungen von 7 h auf 0 h.
- Die Wochenlenkzeit wird in Stunden angezeigt (z. B. „42 h 18 min“) statt in Tagen.

## 0.8.0 – 03.11.2026

- **Lebenssimulation:** Das Privatleben wirkt jetzt tatsächlich und beeinflusst die Firma.
  - Arbeitsstil (Work-Life-Balance): vom täglichen Selbstdisponieren bis zum angestellten Geschäftsführer. Er bestimmt Stress, Energie und wie viele Fahrzeuge du selbst disponierst.
  - Bedürfnisse ändern sich täglich. Dauerstress führt zur Erschöpfung, dann fällt die eigene Disposition eine Woche aus.
  - Freizeit (Essen, Kino, Sport, Freunde, Wellness, Hobby, Weiterbildung) und Urlaub kosten Privatgeld und Zeit.
  - Wohnen und Besitz: größere Wohnung, Haus oder Villa (mit Immobilienkredit), Ferienhaus, Privatwagen, Einrichtung.
  - Beziehungen: Freundschaften, Partnerschaft und Familie; ohne gemeinsame Zeit kühlen sie ab.
  - Hintergrund bei der Gründung (Berufskraftfahrer/in, Speditionskaufmann/-frau, Quereinsteiger/in) mit Fähigkeiten, die sich auf Preise, Fahrerzufriedenheit und Disposition auswirken; persönliche Ziele.
  - Gewinnausschüttung von der Firma aufs Privatkonto (mit Kapitalertragsteuer).

## 0.7.0 – 03.11.2026

- **Neuer Name und neues Logo: Cargovia** – Logistik-Simulation Europa. Das Logo zeigt einen LKW auf einer Route, die ein „C“ bildet. Beim Update wird die alte Installation „Speditions-Simulator“ automatisch entfernt; Spielstände und Einstellungen bleiben erhalten.
- **Unternehmensstufen 1–6** – vom Einzelunternehmen zum Europäischen Logistikkonzern. Der Fortschritt richtet sich nach Fahrzeugen, Lieferungen, Reputation, Standorten und Ländern. Jede Stufe erlaubt mehr Standorte und schaltet Einrichtungen frei.
- **Niederlassungen** in ganz Europa (Standorte & Ausbau). Jede bringt Stellplätze, Büroplätze, Bewerber und Aufträge aus ihrer Region. Neue Fahrzeuge und Auflieger werden an den gewählten Standort geliefert.
- **Eigene Einrichtungen:**
  - Werkstatt: Wartung 35 % günstiger und schneller.
  - Betriebstankstelle: volltanken bei Abfahrt, Diesel 9 % günstiger.
  - Lagerhalle: monatliche Lagererlöse, mehr Aufträge ab dem Standort.
- **Abteilungen:**
  - Disposition: nötig ab 6 Fahrzeugen, sonst leidet die Fahrerzufriedenheit.
  - Vertrieb: mehr und besser bezahlte Angebote.
  - Buchhaltung: weniger Zahlungsausfälle.
  - Fuhrparkmanagement: weniger Verschleiß und Pannen, automatische Wartung.

  Erfahrene Fahrer lassen sich in der Personalakte ins Büro befördern.
- **KI-Disponenten:** Die Disposition lässt sich teilautomatisch (Vorschläge zum Übernehmen) oder vollautomatisch an angestellte Disponenten übergeben.
  - Regeln: Mindestgewinn, maximale Leerfahrt, Ladungsarten, Einsatzländer, Stammkunden, sichere Liefertermine, nächstes Fahrzeug, Rückladungen, Rückführung zum Standort, Fahrzeuge nur manuell.
  - Angenommene Aufträge und Vertragstouren werden zuerst vergeben.
  - Disponenten gibt es als Einsteiger, Erfahrene oder Profis: Unerfahrene verkalkulieren sich öfter und planen weniger wirtschaftlich.
- **Fuhrpark:**
  - Übersicht mit Durchschnittszustand, Alter und Laufleistung.
  - Sammelwartung aller fälligen Fahrzeuge.
  - Filter nach Standort.

## 0.6.0 – 03.11.2026

- **Beiladung:** Weitere Aufträge können in eine laufende Fahrt aufgenommen werden (Auftrag auf den fahrenden LKW ziehen → „Zuladen“). Das Spiel fügt Laden und Entladen an der günstigsten Stelle ein, prüft die Nutzlast über die ganze Tour und warnt, wenn bereits geladene Aufträge dadurch zu spät kämen. Das Fahrzeugfenster auf der Karte zeigt alle Halte mit voraussichtlichen Zeiten; noch nicht abgeholte Beiladungen lassen sich wieder herausnehmen.
- **Verkehrsstörungen:** Sperrungen und Staus entstehen laufend in ganz Europa, häufiger auf den Strecken der eigenen LKW. Sie erscheinen auf der Karte und in der Liste „Verkehrslage“. LKW werden um Sperrungen automatisch umgeleitet, Staus kosten Zeit. Planung und Ankunftsprognosen berücksichtigen die aktuelle Lage.
- **Rahmenverträge:** Stammkunden und Ausschreibungen bieten Verträge mit festen Touren pro Woche an (Kunden & Verträge). Die Touren erscheinen am Vortag als „Vertragstour“ in der Disposition; nicht gefahrene Touren kosten eine Strafe, gute Erfüllung bringt ein Verlängerungsangebot. Zufriedene Stammkunden zahlen in der Börse etwas besser.
- **Personalakte** je Fahrer: Personalgespräch (zeigt, was den Fahrer beschäftigt), Gehalt anpassen, Urlaub (30 Tage/Jahr), Schulungen (ADR, Kühltransport, Schwertransport, Spritsparen). Fahrer werden gelegentlich krank. Dauerhaft unzufriedene Fahrer kündigen – mit Frist, in der sich die Kündigung noch abwenden lässt.
- **Fahrzeugbeschaffung:** Neufahrzeuge auch finanziert (10 % Anzahlung, 24–60 Monate) oder tageweise gemietet; beim Kauf kann ein eigenes Fahrzeug in Zahlung gegeben werden (95 % des Marktwerts).
- Ankunftsprognosen rechnen Wartezeit am Ladefenster wie die Simulation als Ruhezeit.
- Behoben: Sicherungskopien von Spielständen erschienen doppelt in der Liste „Laden“.

## 0.5.0 – 03.11.2026

- **Vorausplanung/Tourenketten:** Aufträge lassen sich auf fahrende LKW ziehen (oder im Dispositionsdialog „Nach laufender Fahrt einplanen“). Bis zu 5 Folgeaufträge je Fahrzeug starten automatisch mit demselben Fahrer, sobald die laufende Fahrt endet. Die Plantafel zeigt sie gestreift mit voraussichtlicher Abholung/Ankunft und Verspätungswarnung; ein Klick auf ✕ nimmt sie wieder heraus.
- **Kalender** in der Disposition mit Tag-, Wochen- und Monatsansicht: Laden, Lieferung, vorausgeplante und noch offene Aufträge, Verspätungen und Feiertage.
- **Solo-LKW und Transporter:** Kastenwagen 3,5 t (mautfrei, schneller), 7,5 t Koffer, 12 t Kühlkoffer und 18 t Verteiler mit festem Aufbau. Sie brauchen keinen Auflieger und zahlen weniger Maut.
- **Teilladungen:** Rund 30 % der Börse sind regionale Teilladungen (0,5–7,5 t) für Planen-, Koffer- und Kühlfahrzeuge. Neuer Filter „Ladungsgröße“; die Gewinnschätzung nimmt automatisch das passendste freie Fahrzeug.
- Anzeige: Dezimalkomma bei Verbrauch und Nutzlast, „mautfrei“ statt „-0 €“.

## 0.4.0 – 02.11.2026

- Updates direkt im Spiel: Der Startbildschirm meldet neue Versionen und installiert sie per Klick (signiert, Spielstände bleiben erhalten). Ab dieser Version – 0.4.0 muss einmalig von Hand installiert werden.
- Mitspieler setzen beigetretene Firmen mit „Fortsetzen“ fort, ohne neue Einladung: Die Host-App veröffentlicht ihre aktuelle Internet-Adresse in einem geheimen ntfy.sh-Kanal, die Apps der Mitspieler finden sie dort – auch automatisch, wenn der Host während des Spiels neu startet.
- Kunden zahlen deutlich zuverlässiger (Normal: ca. 90–96 % pünktlich, Verzug meist nur wenige Tage, Ausfälle selten). Zahlungsmoral des Kunden steht jetzt direkt im Auftrag.
- Neu: Bankkredite (12–60 Monate, Kreditrahmen nach Fuhrpark und Forderungen, Rate am Monatsersten, vorzeitige Ablöse) und Factoring (offene Rechnungen sofort gegen 3 % Gebühr verkaufen) unter Finanzen → „Kredite & Factoring“.
- Auftragsbörse: Auftragsnummern und „Im Team teilen“ – postet den Auftrag in den Firmenchat, ein Klick öffnet ihn bei allen Mitspielern. Die Börse kam schon bisher vom Server; Unterschiede entstanden, weil sich das Angebot bei hohem Tempo laufend ändert.

## 0.3.0 – 02.11.2026

### Hinzugefügt
- **Multiplayer über das Internet ohne Portfreigabe:** Beim Hosten öffnet die Desktop-App automatisch einen Cloudflare Quick Tunnel (`cloudflared` 2026.10.0 als Sidecar, Prüfsumme beim Build verifiziert). Funktioniert auch bei DS-Lite/CGNAT.
- Team-Seite: „Internet-Einladung kopieren“ (`adresse.trycloudflare.com/CODE`); die App prüft vorher per DNS-over-HTTPS und Test-Verbindung, ob die Adresse wirklich erreichbar ist
- Beitreten: Einladung einfach einfügen, Adresse und Code werden automatisch übernommen. Wer der Firma schon beigetreten ist, spielt mit einer neuen Einladung als derselbe Spieler weiter.
- Tests für Adress- und Einladungsverarbeitung (22 Tests)

### Hinweise
- Die Tunnel-Adresse ändert sich bei jedem Start der Host-App; Freunde brauchen dann die neue Einladung.
- Cloudflare Quick Tunnels sind ein kostenloser Dienst ohne Verfügbarkeitszusage.

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
