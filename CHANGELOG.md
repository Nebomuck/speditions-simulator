# Changelog

## 0.16.0 – 10.11.2026

- **Subunternehmer:** Angenommene Aufträge lassen sich mit „Abgeben“ an einen Partner vergeben, auch wenn kein eigener LKW frei ist. Der Partner holt ab und liefert, du stellst die Rechnung und behältst die Differenz.
  - Zur Wahl stehen Konkurrenten im Umkreis der Ladestelle und der Partner aus der Frachtenbörse, der immer verfügbar ist. Der Dialog zeigt Marge und Verspätungsrisiko.
  - Die Vertragsstrafe trägt der Partner. Verspätungen kosten dich trotzdem Ruf und Kundenzufriedenheit.
- **Übernahmen:** Konkurrenten in Schwierigkeiten (günstig) und kleine Betriebe bis 5 LKW (teurer) kannst du unter Markt & Wettbewerb kaufen. Zur Übernahme gehören:
  - gebrauchte LKW mit Aufliegern,
  - ein Betriebshof in ihrer Stadt,
  - erfahrene Fahrer, die sich bei dir bewerben,
  - alle Kunden, die zu dieser Spedition gewechselt waren.
  - Bezahlt werden nur die LKW, für die du Stellplätze hast.
- **Branchenblatt:** Jeden Montag eine Ausgabe mit Schlagzeile, Konjunktur, Dieselpreis, Konkurrenz (auch: Wer würde verkaufen?), Wetter, Saisonausblick, deiner Woche in Zahlen und einem Fahrer der Woche. Die neueste steht im Dashboard, ältere unter Markt & Wettbewerb.
- **Firmenverkauf mit Neustart-Bonus:** Im Einzelspiel kannst du deine Firma ab dem 90. Tag verkaufen.
  - Der Preis besteht aus der Substanz und dem Kundenstamm, Kredite werden abgelöst.
  - Ein Abschlussbildschirm zeigt die Bilanz.
  - Die nächste Gründung startet als Serienunternehmer mit 10 % der Erlöse als Startkapital (höchstens 100.000 €) und mehr Ruf.
- Neue Hilfeartikel zu Subunternehmern und Übernahmen, zum Branchenblatt und zum Firmenverkauf.

## 0.15.3 – 09.11.2026

- **Schwierigkeitsgrad „Realistisch“ entschärft.** Er war so hart, dass man mit einem LKW nach Monaten noch im Minus stand und nie zu einem zweiten Fahrzeug oder Fahrer kam.
  - Startkapital 18.000 € statt 12.000 €.
  - Frachtraten wie auf „Normal“ statt 4 % niedriger.
  - Pannen, Verzögerungen und Zahlungsrisiko nur noch ×1,1 statt ×1,4. Dadurch gibt es weniger Reparaturen und weniger säumige Zahler.
  - Ein gut ausgelasteter LKW trägt die Firma jetzt. Das Polster für den zweiten LKW muss man sich aber weiterhin erarbeiten.
  - Laufende Spiele auf „Realistisch“ bekommen beim Laden die neuen Raten- und Risikowerte. Das Startkapital bleibt dort, wie es war.

## 0.15.2 – 09.11.2026

- **Neuer Startbildschirm:** Statt mit „Neue Firma“ beginnt das Spiel mit einer Übersicht **Meine Speditionen**. Rechts stehen alle eigenen und beigetretenen Firmen als Karten, die zuletzt gespielte zuerst. Links stehen Gründen, Hosten, Beitreten und Importieren.
  - Jede Karte ist als **Einzelspieler** oder **Multiplayer** gekennzeichnet. Sie zeigt Spielzeit, Konto, Fahrzeuge, Unternehmensstufe, Szenario und wann zuletzt gespielt wurde. Ein Filter zeigt nur Einzel- oder nur Mehrspieler-Firmen.
  - **Online-Status bei Multiplayer-Firmen:** „Host online“ oder „Host offline“ bei beigetretenen Firmen, „Server läuft“ bei selbst gehosteten. Der Status wird jede Minute neu geprüft. Ist der Host offline, ist „Verbinden“ gesperrt.
  - Einzelspieler-Spielstände werden je Firma zusammengefasst. „Weiterspielen“ lädt den neuesten, die übrigen lassen sich aufklappen, laden und löschen.
  - Gründen, Hosten und Beitreten öffnen eine eigene, zweispaltige Ansicht mit Zurück-Knopf.

## 0.15.1 – 04.11.2026

- **Behoben: Fahrer hing zwischen Pause und Fahren fest.** Das passierte, wenn ein Fahrer mit erschöpfter Tageslenkzeit an der Ladestelle wartete, dann geladen wurde und den Rest der Ruhe danach nahm. Die Ruhepflicht galt dann als erledigt, die Lenkzeit blieb aber erschöpft. Eine abgeleistete Pflichtruhe zählt jetzt immer. Ein Sicherheitsnetz trägt eine fehlende Ruhe nach, deshalb fahren bereits hängende Fahrer nach einer Ruhezeit weiter.
- **Auftragsbörse mit fahrenden LKW:** Fahrzeuge unterwegs zählen jetzt für die Umkreissuche, und zwar mit ihrer aktuellen Position und dem Ort, an dem sie frei werden. Anschlussaufträge findest du so schon während der Fahrt, nicht erst nach der Entladung.
  - Die Auswahl zeigt für jeden LKW, wo er gerade ist und wann er wo frei wird.
  - Für fahrende LKW rechnet die Gewinnschätzung als Folgeauftrag ab dem Ende der laufenden Fahrt.
  - Wählst du einen fahrenden LKW aus, prüft die Börse Aufträge in der Nähe auf Beiladung und zeigt den Mehrgewinn („Beiladung möglich“). „Disponieren“ öffnet dann direkt die Beiladung.

## 0.15.0 – 04.11.2026

Spielspaß-Paket 2: Ziele, Spezialaufträge, Erfolge und Fahrer mit Charakter.

- **Premium-Aufträge:** Ab dem dritten Spieltag erscheinen gelegentlich Einzelaufträge mit deutlich höherer Vergütung. Sie stehen in der Auftragsbörse in einer eigenen Karte und werden nur von Hand disponiert; die KI-Disposition fasst sie nicht an.
  - **Schwertransport** (etwa das 1,9-Fache): Tieflader, Fahrer mit Schwertransport-Schein und eine Genehmigung. Der Antrag kostet rund 4,5 % der Vergütung, dauert 30 bis 60 Stunden und nimmt den Auftrag gleich an.
  - **Messe-Termin** (etwa das 1,7-Fache): drei Stunden Abholfenster, knappe Lieferfrist. Zwei Stunden Verspätung kosten die halbe Vergütung.
  - Pünktlich erledigt: Ansehen +3. Abholung immer montags bis mittwochs, damit die Lieferung nicht ins Wochenend-Fahrverbot fällt.
- **Szenarien:** Unter „Spielart“ beim Spielstart: Neustart mit Altlasten, Familienbetrieb übernehmen, Kühlspezialist und Großes Ziel – jeweils mit eigener Ausgangslage, Ziel und Frist. Danach geht es frei weiter.
- **Quartalsziele der Hausbank:** Alle 13 Wochen drei Ziele (immer Umsatz, dazu zwei aus Lieferungen, Pünktlichkeit, Leerkilometer, Ansehen, Kontostand, Fuhrpark). Das Ergebnis verändert die neue **Bonität A–E**: ±1 % Kreditzins und ±20 % Kreditrahmen.
- **Erfolge und Rekorde:** 25 Erfolge (Touren, Firma, Spezial) und Bestwerte wie längste Tour, bester Monat und längste Pünktlichkeitsserie unter **Statistiken**; die nächsten offenen Erfolge im Dashboard.
- **Fahrer mit Eigenschaften:** Etwa zwei von drei Fahrern bringen eine Eigenheit mit: Sparfuchs, Pünktlich, Bleifuß, Frohnatur, Eiserne Gesundheit oder Plaudertasche. Die Wirkung steht im Tooltip und in der Personalakte.
- **Kleine Geschichten:** neue Entscheidungskarten zu Geburtstagen, Bitten um freie Tage, Blitzerfotos (nur bei Bleifuß) und Ersthelfern; Betriebsjubiläen im Protokoll.
- Dashboard: Karten für Quartalsziele, Szenario und nächste Erfolge.
- **Pause bei Entscheidungen:** Erscheint eine Entscheidungskarte, hält das Spiel an, damit sie nicht unbemerkt abläuft. Nach der Wahl läuft es von selbst weiter, sofern keine weitere Karte offen ist. „Später, weiterspielen“ klappt die Karte ein und setzt das Spiel fort.
  - Abschaltbar unter **Einstellungen → Spiel**.
  - Im Multiplayer ist die Pause standardmäßig aus, weil sie alle Mitspieler anhält.
- Startbildschirm: Die Kachel „Benutzerdefiniert“ ragt bei schmalem Fenster nicht mehr über den Rand, das Wort wird getrennt.
- Disposition: In der Desktop-App lassen sich Aufträge wieder per Maus auf den Zeitstrahl ziehen. Das Programmfenster hatte die Zieh-Ereignisse für das Ablegen von Dateien abgefangen.

## 0.14.0 – 04.11.2026

Mehr Entscheidungen, weniger Pflege.

- **Entscheidungskarten:** Ereignisse fragen jetzt nach deiner Wahl. Die Karte erscheint unten rechts mit 2–3 Möglichkeiten und ihren Folgen. Wer nicht entscheidet, bekommt nach Ablauf die Vorgabe.
  - Firma und Markt:
    - Eilauftrag zum doppelten Preis mit knapper Frist
    - Gehaltswunsch eines Fahrers
    - ein erfahrener Fahrer, der wechseln möchte
    - Beschwerde eines Kunden
    - Dieselzuschlag bei teurem Diesel
    - Kundenstamm eines angeschlagenen Konkurrenten übernehmen
    - Logistik-Fachmesse
    - Interview mit der Lokalzeitung
  - Privat: Wochenendausflug mit dem Partner, Freundschaftsdienst, Einladung in einen Verein.
  - Im Multiplayer entscheidet bei Firmenkarten, wer die passende Berechtigung hat. Private Karten sieht nur der eigene Spieler.
- **Ausschreibungen:** Große Verlader vergeben Rahmenverträge über 13 oder 26 Wochen per verdecktem Gebot. Zu sehen sind sie unter **Kunden & Verträge**.
  - Du bietest einen Preis je Tour und kannst eine Pünktlichkeitsgarantie geben. Die Garantie macht dein Gebot 5 % attraktiver, dafür kostet jede verspätete Tour eine Strafe.
  - KI-Speditionen aus der Region bieten mit. Es gewinnt der beste Preis, der Ruf wiegt etwas auf.
  - Die Karte zeigt Marktpreis, deine geschätzten Kosten, die Marge und die Mitbewerber. Nach dem Zuschlag siehst du alle Gebote.
  - Gewonnene Ausschreibungen laufen als Rahmenvertrag.
- **Lebenssimulation entschärft:**
  - **Fokus Firma:** Ein Schalter unter **Privatleben** übergibt Freizeit, Kontakte und Urlaub an das Spiel. Es plant jeden Abend das dringendste Bedürfnis ein, nimmt bei hohem Stress Kurzurlaub und entscheidet private Karten ausgewogen.
  - **Wochenroutine:** Für jeden Wochentag lässt sich eine Freizeitaktivität festlegen, die abends um 19 Uhr von selbst stattfindet.
  - Freizeit und soziale Kontakte sinken langsamer. Freundschaften kühlen erst nach 18 statt 10 Tagen ohne Kontakt ab.
  - Zwei Tage vor einem Burnout kommt eine deutliche Warnung.
- Vertragsangebote von neuen Kunden heißen jetzt „Neukunde“ statt „Ausschreibung“. Einzelne, besonders gut bezahlte Börsenaufträge heißen „Lukratives Einzelangebot“.

## 0.13.2 – 03.11.2026

- **Update-Ordner, zweiter Teil:** Versionen bis 0.11.0 haben jedes Update weiter nach %LOCALAPPDATA%\Cargovia installiert. Die Desktop-Verknüpfung startete deshalb immer wieder die alte Version, und das Update wurde erneut angeboten. Der Fix aus 0.11.1 steckte in der laufenden App und kam darum bei diesen Installationen nie an.
  - Jetzt prüft der Installer selbst, wohin die Desktop- oder Startmenü-Verknüpfung zeigt, und aktualisiert genau diesen Ordner.
  - Eine Fehlinstallation im Standardordner wird dabei entfernt. Spielstände und Einstellungen sind davon nicht betroffen.

## 0.13.1 – 03.11.2026

- **Fahrzeugfotos:**
  - Alle 10 LKW-Modelle und 9 Aufliegertypen zeigen jetzt detaillierte Bilder.
  - Sie erscheinen im Fuhrpark, auf dem Neu- und Gebrauchtmarkt, im Kaufdialog und beim Aufliegermarkt.
- **Seitenprofile:**
  - Das Fahrzeugfenster auf der Karte zeigt den Zug in der Seitenansicht.
  - Beim Hineinzoomen erscheint das Fahrzeug auf der Karte als kleines Seitenprofil und blickt in Fahrtrichtung.
  - Für Sattelzüge gibt es je Zugmaschine ein Profil mit einem typischen Auflieger. Passt der gezogene Auflieger nicht dazu, wird das Profil der Zugmaschine gezeigt.
  - Eine Zugmaschine ohne Auflieger zeigt ihr Foto.

## 0.13.0 – 03.11.2026

- **Größere Welt:**
  - 240 Städte in 32 Ländern (vorher 161 in 29), darunter Bielefeld, Karlsruhe, Chemnitz, Rouen, Grenoble, A Coruña, Bozen, Rzeszów, Iași, Niš, Liverpool, Edinburgh, Umeå und Luleå.
  - Neu sind Finnland (Fähre Tallinn–Helsinki oder Landweg über Lappland), Montenegro und Albanien, jeweils mit Maut, Wetter, Rechtsformen und Zollgrenzen auf dem Westbalkan.
- **Dichteres Straßennetz:**
  - 764 echte Straßenverbindungen, vorher 384.
  - Routen folgen jetzt eher der realen Strecke, z. B. Dresden → Warschau 710 km über Breslau statt 811 km über Berlin, Paris → Lissabon 1.867 km statt 2.143 km.
  - Alle bisherigen Verbindungen bleiben erhalten, laufende Fahrten in alten Spielständen fahren unverändert weiter.
  - Die Frachtbörse ist auf rund 350 offene Angebote vergrößert.
- **Karte:**
  - Viele Fahrzeuge an einem Ort werden zu einer Zahl zusammengefasst. Ein Klick zoomt hinein, rot markiert eine Gruppe mit Verspätung.
  - Neue Ebene „Rastplätze & Werkstätten“ mit Rastplätzen entlang der Strecken, Werkstätten in größeren Städten und den eigenen Werkstätten, Tankanlagen und Lagern.
- **Anpassbare Panelgrößen:** Seitenleiste, Dispositionsliste und Fahrzeugfenster lassen sich am Rand breiter oder schmaler ziehen. Ein Doppelklick setzt die Breite zurück. Die Breiten bleiben gespeichert.
- **Fahrzeugbilder:** Jedes LKW-Modell und jeder Aufliegertyp hat eine eigene Seitenansicht im Fuhrpark, auf den Märkten und im Fahrzeugfenster. Dazu gehören Sattelzugmaschine, Solo-LKW und Transporter sowie Plane, Koffer, Kühlkoffer, Tank, Silo, Kipper, Tieflader, Containerchassis und Autotransporter, mit eigenem Stil je Hersteller.
- **Porträts:** Fahrer, Bewerber und Büropersonal haben eigene, zum Namen passende Porträts. Fahrer tragen eher Arbeitskleidung und Kappe, im Büro gibt es Hemd oder Headset, Ältere haben öfter graue Haare.
- **Charakter-Editor:**
  - Bei der Gründung und jederzeit unter **Privatleben** (Klick auf das Bild) lässt sich das Aussehen gestalten.
  - Wählbar sind Hautton, Gesichtsform, Mund, Augenform und -farbe, Brauen, Brille, 12 Frisuren, Haarfarbe, Bart, Kleidung und Farbe, Accessoire und Hintergrund.
  - Jede Option erscheint als Vorschau; ein Würfel erzeugt ein zufälliges Aussehen.
  - Im Multiplayer ändert jeder nur sein eigenes Aussehen.

## 0.12.0 – 03.11.2026

- **Fahrer-Anreise per Bahn:** Freie Fahrer ohne Fahrzeug können zu einem Standort oder einem wartenden LKW reisen (Rechtsklick auf den Fahrer → „Anreise nach …“). Fahrkarte 35 € + 0,14 €/km, Dauer 1 h + Strecke bei 75 km/h. KI-Disponenten holen nach 2 h Standzeit selbst einen überzähligen Fahrer zu einem LKW ohne Fahrer. Vorher standen bei wachsenden Firmen LKW am Firmensitz, während die neuen Fahrer an einer Niederlassung warteten; im Langzeittest waren mit 17 LKW nur 9 unterwegs, jetzt 17 von 20.
- **Fehlerbehandlung:**
  - Stürzt eine Ansicht ab, erscheint statt einer leeren Seite eine Meldung mit „Erneut versuchen“, „Zum Dashboard“ und „Fehlerbericht kopieren“; das Spiel läuft weiter. Ein Fehler außerhalb der Ansichten zeigt einen Notfallbildschirm, auf dem sich der Spielstand als Datei sichern lässt.
  - Ein Fehler in der Simulation hält das Spiel an, statt es einfrieren zu lassen. Zusätzlich wird ein Notfall-Spielstand angelegt.
  - Unter **Einstellungen → Fehlerprotokoll** stehen die letzten Fehler mit Programmversion; der Bericht lässt sich kopieren. Die Einstellungen zeigen außerdem die Programmversion.
- **Multiplayer-Server:**
  - Konfigurierbar über Kommandozeile, Umgebungsvariablen (`CARGOVIA_PORT`, `CARGOVIA_HOST`, `CARGOVIA_DB` …) oder eine Datei `cargovia-server.json`: Port, Bind-Adresse, Datenbank, Speicher- und Sicherungsintervall, Anzahl der Sicherungen, Spieler je Firma. Ungültige Werte werden beim Start mit klarer Meldung abgelehnt. `--help` und `--version` sind neu.
  - Zustandsabruf unter `GET /health` (Version, Laufzeit, Firmen, verbundene Spieler) für Monitoring und Reverse Proxy.
  - Ein belegter Port wird sauber gemeldet. Bei einem unerwarteten Fehler speichert der Server alle Firmen, bevor er sich beendet.
  - Ein beschädigtes Delta auf dem Client führt zu einer Neusynchronisation statt zu einem Absturz.
- **Abschlusstests:**
  - Ein vollständiger Spielablauf von der Gründung bis Unternehmensstufe 4 läuft als automatischer Test (Prüfung der Grundregeln zu jeder Spielstunde, Speichern/Laden im Betrieb).
  - Spielstände im Format von Version 1 werden vollständig migriert und laufen weiter.
  - Neu getestet sind außerdem Server-Konfiguration, Health-Endpunkt, Spielerlimit und drei gleichzeitige Clients.
## 0.11.1 – 03.11.2026

- **Update-Fehler behoben:** Updates landeten bei Installationen in einem eigenen Ordner (z. B. E:\Spiele\Cargovia) teils im Standardordner unter %LOCALAPPDATA%. Dann lief die neue Version nur direkt nach dem Update, die Desktop-Verknüpfung startete weiter die alte. Das Update wird jetzt immer in den Ordner des laufenden Programms installiert.

## 0.11.0 – 03.11.2026

- **Balancing:** Ein Spieler-Bot hat das Spiel über 18 Monate auf allen Schwierigkeitsgraden gespielt. Daraus:
  - Frachtraten um 10 % angehoben (rund 1,85–2,00 € je Last-km). Ein gut disponierter LKW bringt etwa 2.000–3.000 € Deckungsbeitrag im Monat; ab dem zweiten Fahrzeug wird die Firma profitabel. „Einfach“ (+8 %) und „Realistisch“ (−4 %, Zahlungsrisiko ×1,4) neu abgestimmt.
  - Ein Teil der Aufträge entsteht jetzt gleichmäßig rund um jedes Fahrzeug und Fahrtziel statt überwiegend am Firmensitz – LKW fern der Heimat finden Anschlussladungen. Leerfahrten sanken im Test von 30–40 % auf etwa 15–20 %.
- **Planung genauer:** Vorkalkulation, Plantafel und Folgeaufträge rechnen Fahrverbote, Wetter und Grenzwartezeiten genauso wie die Fahrt selbst. Folgeaufträge berücksichtigen den Lenkzeitstand am Ende der laufenden Fahrt (vorher wurde die Wochenruhe übersehen). Verspätete Lieferungen der KI-Disposition sanken im Test von rund 45 % auf unter 10 %.
- **Ruhe an der Ladestelle:** Wartet ein Fahrer länger als 3 h auf das Ladefenster, legt er seine Tagesruhe gleich dort ein, wenn sie vor dem Ende des Fensters endet.
- **KI-Disponenten:** Steht ein LKW länger ohne Auftrag, nehmen sie auch weitere Anfahrten in Kauf, bevor sie ihn nach 24 h (vorher 12 h) leer zum Standort zurückholen. Ruhezeiten zählen nicht mehr als Standzeit. Verspätete Folgeaufträge werden nicht mehr stündlich neu eingeplant.
- **Erste Schritte:** Ein Tutorial führt in neuen Spielen durch die ersten Aufträge, die Karte, Finanzen und Wachstum und hebt das nächste Bedienelement hervor.
- **Hilfe:** F1 oder das Fragezeichen oben rechts öffnet die Hilfe zur aktuellen Seite – durchsuchbar, mit Lenkzeiten, Fahrverboten, Finanzen, Fuhrpark und allen Tastenkürzeln.
- **Musik und Atmosphäre:** ruhige, generative Hintergrundmusik, Büroatmosphäre und ein Telefonklingeln, wenn Kunden oder Partner anrufen. Musik und Atmosphäre sind in den Einstellungen getrennt regelbar.
- **Kontextmenüs:** Rechtsklick auf Fahrzeuge, Aufträge und Fahrer für die häufigsten Aktionen.
- **Benutzerdefinierter Schwierigkeitsgrad** beim Gründen: Startkapital, Frachtraten, Ereignisse, Zahlungsrisiko und Start-LKW frei wählbar – auch für Multiplayer-Firmen.
- Dezente Animationen bei Seitenwechseln, Meldungen und Dialogen (abgeschaltet bei „Bewegung reduzieren“ im System).

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
