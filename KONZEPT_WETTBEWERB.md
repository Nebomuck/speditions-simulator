# Konzept: Wettbewerbs-Multiplayer (Paket D)

Stand: 20.11.2026 · Grundlage für die Umsetzung ab 0.20.0

## Ziel

Mehrere Spielerfirmen teilen sich eine Welt auf einem Server.

**Was die Firmen gemeinsam haben:**
- gleiche Zeit, gleiches Wetter, gleiche Konjunktur und gleicher Dieselpreis
- eine gemeinsame Auftragsbörse
- dieselben Kunden und dieselben Ausschreibungen
- die KI-Konkurrenz

**Was jede Firma für sich hat:**
- Fuhrpark, Fahrer, Konto, Ruf, Verträge und Disposition
- optional ein Team aus mehreren Spielern, wie im heutigen kooperativen Multiplayer

**Was neu dazukommt:**
- **Aufträge an Mitspieler weitergeben:** Subunternehmer zwischen Spielerfirmen, mit Annahme oder Ablehnung.
- **Rangliste:** Firmenwert, Umsatz, Pünktlichkeit und Ruf, dazu im Branchenblatt.
- **Wettbewerb um Ausschreibungen:** Spieler bieten gegeneinander und gegen die KI.

Einzelspiel und kooperativer Multiplayer bleiben unverändert spielbar.

## Bestand

- `GameState` kennt genau eine Firma: `state.company`. Im Kern gibt es 235 Zugriffe in 29 Dateien, im Client 88.
- Alle firmenbezogenen Sammlungen liegen auf oberster Ebene. Das sind:
  - Fuhrpark und Personal: `drivers`, `vehicles`, `trailers`
  - Fahrten und Finanzen: `trips`, `invoices`, `ledger`, `log`, `contracts`, `stats`, `today`
  - Steuerung: `autoDispatch`, `team`, `decisions`
  - Fortschritt: `quarter`, `progress`, `exit`
- Weltdaten liegen daneben:
  - Zeit, Wetter, Konjunktur und Markt: `time`, `weather`, `economy`, `market`
  - Verkehr: `disruptions`
  - Konkurrenz und Ereignisse: `competitors`, `events`, `news`
  - Märkte: `vehicleOffers`, `tenders`, `customers`, `orders`
- `tickMinute` ruft stündliche und tägliche Hooks auf, die Welt und Firma gemischt bearbeiten. Beispiele:
  - `updateOrderMarket` erzeugt Börsenaufträge für die Welt, rechnet aber Treue und Vertrieb der Firma in den Preis ein.
  - `hourlyCompetition` lässt KI-Firmen dem Spieler Kunden abwerben.
- Die Delta-Synchronisation (`diffState`/`applyPatch`) und `playerView` arbeiten auf dem ganzen Zustand. Neue Felder synchronisieren sich automatisch.

## Architektur: Welt plus Firmen-Shards

Statt jede der 235 Stellen auf `state.companies[id]` umzuschreiben, wird der Zustand geteilt. Die Simulation bekommt weiterhin ein Objekt, das aussieht wie das heutige `GameState`.

```
WorldState                         CompanyShard (je Firma)
  time, rng, nextId                  company, players, team
  market, economy, weather           drivers, applicants, vehicles, trailers
  disruptions, competitors           trips, invoices, ledger, log, stats, today
  events, news, vehicleOffers        contracts, autoDispatch, decisions
  customers (Stammdaten)             quarter, progress, exit
  orders (Börse, offen)              orders (angenommen, eigene)
  tenders                            relations (Kundenbeziehung je Kunde)
```

- **`CompanyView`:** Eine Ansicht je Firma vereint Welt und Shard. Felder wie `market`, `weather` oder `tenders` zeigen auf dieselben Objekte der Welt. `time`, `rng` und `nextId` werden über Getter und Setter an die Welt durchgereicht. Bestehender Code wie `state.company.account`, `state.vehicles` oder `state.market.diesel` läuft so ohne Änderung.
- **Einzelspiel:** eine Welt mit genau einer Firma. Gespeichert wird wie bisher der flache Zustand der Ansicht, das Speicherformat bleibt Version 13 und alte Spielstände laden unverändert. Erst Welten mit mehreren Firmen (ab D4) bekommen ein eigenes Speicherformat. Für Tests und Client ändert sich nichts, weil `newGame()` eine Ansicht liefert.
- **Tick:**
  1. **Welt-Hooks einmal:** Wetter, Konjunktur, Störungen, Dieselpreis, Börse, KI-Konkurrenz, Branchenblatt und Ausschreibungsfristen.
  2. **Firmen-Hooks je Shard:** Fahrten, Personal, Rechnungen, Verträge, Lebenssimulation, KI-Disposition, Ziele und Erfolge.
  3. **Aufteilung:** Die heutigen Hooks werden dafür einmalig in Welt- und Firmenanteil getrennt.
- **IDs:** `nextId` bleibt ein gemeinsamer Zähler der Welt, so gibt es keine Kollisionen in gemeinsamen Sammlungen.
- **Determinismus:** ein gemeinsamer Zufallsstrom. Die Firmen werden in fester Reihenfolge (nach ID) simuliert.

## Gemeinsame Börse und Kunden

- **Auftragspreis:** Ein Börsenauftrag hat einen Grundpreis aus Strecke, Ladung, Region und Konjunktur. Firmenabhängige Aufschläge (Treue, Vertrieb, Verhandlung, Kampagne, grüner Kunde) rechnet die Ansicht der jeweiligen Firma beim Anzeigen und Annehmen dazu. Jede Firma sieht also ihren eigenen Preis.
- **Annahme:** Wer zuerst annimmt, bekommt den Auftrag. Der Auftrag wandert dann aus der Börse in den Shard der Firma, die anderen sehen „vergeben an …“.
- **Kundenbeziehung:** Stammdaten wie Name, Ort, Branche und Zahlungsmoral liegen in der Welt. Zufriedenheit, Lieferungen und Abwanderung liegen je Firma in `relations[customerId]`. Die heutigen Felder am Kunden werden zu Ansichtsfeldern.
- **Regionale Kampagnen:** Die Herkunftsgewichtung wirkt auf die gemeinsame Börse, als Mittel aller aktiven Kampagnen. Der Preisaufschlag gilt nur für die eigene Firma.

## Mitspieler-Subunternehmer

- **Abgeben:** Im Dialog „Abgeben“ stehen Mitspielerfirmen neben den KI-Partnern. Die abgebende Firma nennt einen Preis.
- **Annehmen:** Die empfangende Firma sieht ein Angebot mit Frist (z. B. 2 Spielstunden) und nimmt an oder lehnt ab. Bei Annahme wird der Auftrag ihr eigener Auftrag mit dem vereinbarten Preis.
- **Abrechnung:** Kunde zahlt an die abgebende Firma, die zahlt an die ausführende. Verspätungsstrafen trägt die ausführende Firma, die Zufriedenheit des Kunden trifft beide.

## Rangliste und Wettbewerb

- **Rangliste** (Seite „Markt & Wettbewerb“): Firmenwert, Umsatz der letzten 30 Tage, Pünktlichkeit, Ruf und Flottengröße. Spielerfirmen und KI-Firmen stehen in einer Liste.
- **Branchenblatt:** Meldungen über Spielerfirmen, zum Beispiel Aufstieg, große Verträge oder Übernahmen.
- **Ausschreibungen:** Gebote aller Spielerfirmen und der KI. Den Zuschlag erhält das beste Verhältnis aus Preis und Ruf, wie heute.
- **Übernahmen von Spielerfirmen:** vorerst nicht vorgesehen. Nur KI-Firmen sind übernehmbar.

## Server und Synchronisation

- **Spielwelt:** Eine Spielwelt hat mehrere Firmen. Beim Beitritt wählt der Spieler eine bestehende Firma, mit Einladung durch deren Gründer, oder gründet eine neue.
- **Daten je Spieler:** Jeder Spieler bekommt die Welt und den Shard seiner Firma. Fremde Firmen sieht er nur als Zusammenfassung mit Name, Lackierung, Standorten, Fahrzeugpositionen auf der Karte und Ranglistenwerten.
- **Delta-Synchronisation:** Sie läuft je Spieler auf dieser gefilterten Ansicht. Die bestehende `playerView` wird dazu erweitert.
- **Zeit:** gemeinsam. Pause und Zeitraffer per Abstimmung der Firmengründer (siehe Entscheidungen).
- **Chat:** ein Weltkanal für alle und ein Firmenkanal je Team, wie heute.

## Migrationspfad in Schritten

Jeder Schritt ist für sich lauffähig und getestet. Einzelspiel und kooperativer Multiplayer funktionieren nach jedem Schritt.

| Schritt | Inhalt | Ergebnis |
|---|---|---|
| D1 ✅ | Typen `WorldState`, `CompanyShard`, Firmenansicht (`companyView`). Neue und geladene Spiele laufen als Ansicht auf eine Welt mit einer Firma. | Alle bestehenden Tests grün, Vergleichslauf identisch, gleiche Geschwindigkeit (`shard.test.ts`) |
| D2 ✅ | Hooks in Welt- und Firmenanteil trennen, Tick über mehrere Shards | Welt mit zwei Firmen im Test simulierbar (`world.test.ts`), Vergleichslauf mit dem alten Stand identisch |
| D3 ✅ | Gemeinsame Börse mit Grundpreis und Firmenaufschlag, Annahme mit Vergabe, Kundenbeziehung je Firma | Zwei Firmen konkurrieren um dieselben Aufträge (`market.test.ts`), Vergleichslauf mit dem alten Stand identisch |
| D4 | Server: mehrere Firmen je Welt, Beitritt mit Firmenwahl, gefilterte Ansicht und Delta je Spieler, Weltchat | Wettbewerbsspiel übers Netz |
| D5 | Mitspieler-Subunternehmer, Rangliste, Branchenblatt, Ausschreibungen zwischen Spielern | Spielinhalte des Wettbewerbs |
| D6 | Balancing mit zwei Bots in einer Welt, Lasttest mit 4 Firmen, Doku | Release |

**Risiken:**
- **D2:** Die Hooks sind teils eng verflochten, zum Beispiel greift die Konkurrenz auf die Spielerkunden zu. Absicherung über bestehende Tests und einen Vergleichslauf: eine Welt mit einer Firma muss mit gleichem Seed dasselbe Ergebnis liefern wie vorher.
- **D3:** Firmenabhängige Preise ändern die Balance im Einzelspiel nicht, wenn die Aufschläge identisch angewendet werden. Das prüft der Balance-Bot.
- **Leistung:** Jede Firma kostet etwa so viel Rechenzeit wie heute ein Spielstand. Bei 4 Firmen und Zeitraffer 60× ist das auf dem Server unkritisch.

## Stand D1 (20.11.2026)

- **Modul `packages/core/src/shard.ts`:**
  - `WORLD_KEYS` und `COMPANY_KEYS` teilen die Felder von `GameState`. Der Compiler prüft, dass jedes Feld genau einer Seite angehört.
  - `splitState` zerlegt einen flachen Zustand ohne Kopie.
  - `companyView` liefert die Ansicht, `worldOf` und `companyIdOf` führen von der Ansicht zurück.
  - `restoreState` setzt eine Ansicht zurück, ohne die Verbindung zur Welt zu lösen.
- **Ansicht ohne Proxy:** Die Ansicht ist ein einfaches Objekt mit Gettern und Settern. Damit funktionieren `structuredClone`, `postMessage` im Worker, JSON und die Delta-Synchronisation unverändert. Ein Proxy ließe sich nicht klonen.
- **Ausgabenlimit:** Die Rücknahme eines Befehls löschte vorher alle Felder und wies sie neu zu. Jetzt weist `restoreState` nur Werte zu.
- **Speicherformat:** unverändert Version 13 (siehe oben).
- **Geprüft:**
  - Vergleichslauf über 10 Spieltage: Ansicht und flacher Zustand liefern denselben Spielstand. Auch die Laufzeit ist gleich.
  - Im Browser: neues Spiel, Simulation im Worker, Speichern, Export und Import.
  - Delta-Synchronisation im Test.

## Stand D2 (20.11.2026)

- **Tick in `sim.ts`:**
  - Die bisherigen Minuten-, Stunden- und Tagesschritte stehen als Liste in unveränderter Reihenfolge.
  - Jeder Schritt läuft entweder einmal für die Welt oder für jede aktive Firma, in der Reihenfolge `companyOrder`.
  - `tickWorld(world)` simuliert eine Welt mit beliebig vielen Firmen. `tickMinute(view)` simuliert die ganze Welt, zu der die Ansicht gehört.
- **Firmen-Schritte:** Fahrten, Lenkzeiten, Werkstatt, Rechnungen, Ereignisse, Entscheidungen, Lebenssimulation, Personal und Bewerber, Verträge, Firma, Team, Subunternehmer, KI-Disposition, Tagesstatistik, Monatsabrechnung, Ziele, Erfolge, Marketing.
- **Verkehrsstörungen:** Die Welt entfernt abgelaufene Störungen (`expireDisruptions`). Jede Firma leitet danach ihre Fahrten um und erzeugt Störungen auf den eigenen Strecken (`companyDisruptions`).
- **Gemischte Weltschritte:** Börse, KI-Konkurrenz, Ausschreibungen, Premium-Aufträge, Gebrauchtmarkt und Branchenblatt laufen vorerst mit der ersten aktiven Firma. Die Trennung folgt in D3 (Börse, Kunden) und D5 (Ausschreibungen, Branchenblatt).
- **Firmenverkauf:** Verkaufte Firmen ruhen. Die Zeit steht erst still, wenn alle Firmen verkauft sind. Im Einzelspiel ist das wie bisher.
- **`addCompany(world, ctx, opts)`** gründet eine weitere Firma in einer laufenden Welt. Sie übernimmt Uhrzeit, ID-Zähler, Zufallsstand und Schwierigkeitsgrad, so bleiben alle IDs weltweit eindeutig.
- **Vergleichslauf gegen 0.19.0:** Zwei Startwerte liefen je 45 Tage ohne Spieler und 60 Tage mit dem Spieler-Bot (Aufträge, Fahrten, Wachstum). Die Prüfsumme des Spielstands ist bytegleich.

## Stand D3 (21.11.2026)

- **Kunden je Firma:** Kunden gehören jetzt zum Firmenanteil. Die Stammdaten (Name, Branche, Ort) sind in allen Firmen gleich, die Beziehung (Zufriedenheit, Lieferungen, Abwerbung) führt jede Firma selbst.
  - Neue Kunden werden in alle Firmen gespiegelt (`mirrorCustomer`), dort mit frischer Beziehung (Zufriedenheit 50, keine Lieferungen).
  - Eine neu gegründete Firma übernimmt die bekannten Kunden ebenso mit frischer Beziehung.
- **Preis je Firma:** Ein Börsenauftrag wird einmal erzeugt; der Zufallsanteil („Glück“) wird einmal gezogen.
  - Den Preis rechnet jede Firma mit ihren eigenen Aufschlägen (Treue, Vertrieb, Verhandlung, Region, Marketing, grüne Flotte usw.).
  - Bei mehreren Firmen stehen die Preise in `order.quotes`, `offerPayment(state, order)` liefert den Preis der eigenen Firma.
- **Vergabe:** Wer zuerst annimmt oder disponiert, bekommt den Auftrag (`claimOrder`): `companyId` wird gesetzt, `payment` auf den eigenen Preis festgelegt, die Angebote der anderen entfallen.
  - Alle Annahmewege nutzen das: Annahme, Disposition, KI-Disposition, Entscheidungen, Genehmigungen, Subunternehmer und Rahmenverträge.
  - Befehle auf Aufträge einer anderen Firma werden abgelehnt („Dieser Auftrag gehört einer anderen Spedition.“). KI-Disposition, Premium-Prüfung und Subunternehmer-Angebote sehen nur offene und eigene Aufträge.
- **Einzelspiel:** Ohne zweite Firma gibt es weder `quotes` noch `companyId`; Preise und Ablauf sind unverändert. Der Vergleichslauf (Spieler-Bot, 60 Tage, zwei Startwerte) ist bytegleich.
- **Test:** Zwei Bots spielen 30 Tage in derselben Welt. Jeder übernommene Auftrag hat genau einen Eigentümer, Fahrten und Rechnungen beziehen sich nur auf eigene Aufträge, beide Firmen liefern.
- **Noch offen:** Die gefilterte Ansicht je Spieler (fremde Aufträge ausblenden, eigener Preis als `payment`) entsteht in D4 auf dem Server. KI-Konkurrenz, Ausschreibungen und Branchenblatt laufen bis D5 weiter mit der ersten Firma.

## Entscheidungen (20.11.2026)

1. **Zeitsteuerung per Abstimmung:**
   - Pause und Zeitraffer ändern sich nur, wenn die Mehrheit der Firmengründer zustimmt.
   - Jeder Gründer kann eine Änderung vorschlagen. Die Abstimmung läuft eine kurze Echtzeitfrist (z. B. 30 s), ohne Mehrheit bleibt alles, wie es ist.
   - Grundlage sind die vorhandenen Team-Abstimmungen, erweitert auf die Welt.
2. **Sichtbarkeit:** Standorte und fahrende LKW fremder Spielerfirmen sind live auf der Karte zu sehen, in deren Firmenfarbe. Fracht, Konto und Disposition bleiben verborgen.
3. **Spielende:** Eine Wettbewerbspartie ist immer offen. Es gibt kein festes Ende, nur die laufende Rangliste. Der Firmenverkauf bleibt für einzelne Firmen möglich, die Welt läuft weiter.
