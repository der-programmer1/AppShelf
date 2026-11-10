# Logic-Cam

**Dein Papier. Deine Logik.** Ein vollständig clientseitiges Labor für digitale Logik: Live-Kamera, Neon-Signale, Touch-Sandbox und ein lokaler Logic Coach. HTML, CSS und ES-Module; kein Build und kein Backend für den Betrieb.

## In diesem AppShelf-Repository

Die bearbeitbare App liegt unter `projects/Logic-Cam/`. Der AppShelf-Eintrag unter `apps/inbox/logic-cam/` enthält die Web-Demo, Screenshots und das vollständige Quellcode-ZIP. Nach einem erfolgreichen Pages-Deployment ist die Demo unter `https://der-programmer1.github.io/AppShelf/apps/logic-cam/demo/` erreichbar.

Nach Änderungen an der App im Repository-Stamm ausführen:

```sh
npm test --prefix projects/Logic-Cam
npm run check --prefix projects/Logic-Cam
python3 projects/Logic-Cam/scripts/package.py
python3 projects/Logic-Cam/scripts/package.py --check
```

Der Pages-Workflow prüft die App und das Paket vor der Veröffentlichung. Die Demo verwendet für ihre lokale Anleitung `guide.md`, damit im gemeinsamen Release-Publisher kein zweites Asset namens `README.md` entsteht. Ein kleiner `app.js`-Einstieg lädt die unveränderten ES-Module. Für die externe-abhängigkeitsfreie AppShelf-Veröffentlichung entfällt der optionale Tailwind-CDN-Tag; sämtliche erforderlichen Styles sind lokal vorhanden. Das portable Quellcode-ZIP enthält weiterhin die gewünschte optionale CDN-Einbindung und den lokalen CSS-Fallback. Die folgenden Schritte gelten für eine unabhängige Veröffentlichung des entpackten Quellcode-ZIPs als eigenes GitHub-Pages-Projekt.

## In drei Minuten zu deiner GitHub-Pages-App

1. Erstelle auf GitHub ein Repository, zum Beispiel `logic-cam`.
2. Entpacke dieses Paket. Lade **den Inhalt des Projektordners** in das Repository: `index.html`, `style.css`, `js/`, `assets/`, **`vendor/`**, `sw.js` und die übrigen Dateien. `index.html` muss direkt im Repository-Stamm liegen.
3. Öffne **Settings → Pages → Build and deployment → Deploy from a branch**. Wähle `main` und `/ (root)`, dann **Save**.
4. Nach dem erfolgreichen Pages-Deployment lautet dein Link `https://DEIN-NAME.github.io/logic-cam/`. Ersetze `DEIN-NAME` durch deinen GitHub-Namen. Das ist ein Beispiel, noch kein veröffentlichter Live-Link dieses Pakets.
5. Öffne den **HTTPS-Link auf deinem Smartphone**, tippe auf **Kamera starten** und erlaube den Kamerazugriff. Audio wird nicht angefordert. Für reine Sandbox-Nutzung ist keine Erlaubnis nötig.

Alle Pfade sind relativ; die App funktioniert sowohl unter einer GitHub-Projektadresse als auch direkt auf einer Domain. `.nojekyll` liegt bei. Eine GitHub-Actions-Konfiguration und Node.js sind für das Hosting nicht erforderlich.

## Lokal starten

Im Projektordner:

```sh
python3 -m http.server 8080
```

Öffne `http://localhost:8080`. Verwende einen HTTP-Server; ES-Module, Worker und Service Worker funktionieren beim direkten Doppelklick auf `index.html` (`file://`) nicht zuverlässig.

**Auf einem anderen Gerät im WLAN:** eine unverschlüsselte LAN-IP wie `http://192.168.1.10:8080` reicht für die Kamera nicht. Nutze GitHub Pages oder einen eigenen lokalen HTTPS-Server mit einem vom Smartphone akzeptierten Zertifikat.

## Was funktioniert?

- Alle sechs Gatter: **AND, OR, NOT, XOR, NAND, NOR**.
- Kombinatorischer Graph mit drei Zuständen: **1 / HIGH** grün, **0 / LOW** rot, **? / unbekannt** grau.
- Offene Pins, mehrere Treiber, unverbundene Ausgänge und echte Rückkopplungen werden diagnostiziert. Unbekannt wird niemals stillschweigend als 0 behandelt. Ein kontrollierender Eingang darf einen Ausgang trotzdem bestimmen, etwa `AND(0, ?) = 0`.
- Die Sandbox startet mit `Y = (A XOR B) AND C`. Tippe auf A, B und C oder nutze die zugänglichen Schalter unter der Fläche.
- Platziere Gatter, Eingänge und Ausgänge. Ziehe Knoten zum Verschieben. Verbinde im Draht-Werkzeug den **rechten Ausgang** mit dem gewünschten **linken Eingang**. Ein Ausgang darf mehrere Eingänge treiben.
- Freihandzeichnen mit Stift, Maus oder Finger. **Zeichnung erkennen** analysiert die Striche. Bei geschlossenen, standardisierten Symbolen wird ein Graph vorgeschlagen. Die Werkzeugleiste funktioniert unabhängig von der Erkennung.
- Typkorrektur für ausgewählte Knoten; Löschen und Rückgängig. Ein Diagnosefehler lässt sich durch das Entfernen eines Knotens und erneutes Verdrahten beheben.
- Graphen als JSON exportieren und importieren. Die letzte Sandbox-Schaltung und der XP-Stand bleiben lokal im Browser gespeichert, wenn der Browser dies erlaubt. Kamerabilder werden nicht gespeichert. Freihandstriche und Undo-Verlauf gelten für die aktuelle Sitzung.
- Lokaler, regelbasierter **Logic Coach** mit Fragen aus dem aktiven Graphen, hypothetischen Eingangswerten, Fehlerfragen, direkter Rückmeldung und XP. Er benutzt die echte Logik-Engine zur Antwortprüfung. **Kein Sprachmodell, kein API-Schlüssel und kein Cloud-Chat.**
- Kamerawechsel, automatische kontinuierliche Fokussierung bei unterstützten Kameras, Schwellenwert, adaptive Binarisierung und eine abschaltbare Live-Erkennung.

### Tastatur und Bedienbarkeit

`V`: auswählen, `W`: verdrahten, `D`: zeichnen, `Esc`: Werkzeug abbrechen, `Entf`: ausgewählten Knoten entfernen, `Strg/⌘ + Z`: rückgängig. Eingänge sind zusätzlich als beschriftete, tastaturbedienbare Schalter vorhanden; Werkzeugleiste, Coach, Dateifunktionen und Gattertyp sind echte HTML-Steuerelemente. Die räumliche Platzierung und Verdrahtung auf dem Canvas benötigen Zeiger-/Touch-Bedienung.

## Papiererkennung: guter Start, klare Grenzen

Die Erkennung verwendet **echtes OpenCV.js/WASM**: Graustufen, Gauß-Filter, feste oder adaptive Schwellenwerte, Konturen und Hu-Formmomente. Ein Pixel-Komponentenverfahren verfolgt die tatsächlichen gezeichneten Leitungen; räumliche Nähe allein erzeugt keine Verbindung. Interne Konturen trennen Gatterkörper von angrenzenden Leitungen. Kleine geschlossene Kreise kennzeichnen Negationen, eine zweite linke Kurve XOR. Eingangs- und Ausgangskreise werden anhand ihrer Position relativ zu den Gattersymbolen zugeordnet; Ziffern 0/1 im Eingangskreis werden heuristisch unterschieden.

Dies ist **eine nachvollziehbare Heuristik für saubere, waagerechte Standardsymbole**, kein universelles neuronales Erkennungsmodell. Beliebige Handschrift, IEC-Rechtecke, Perspektivkorrektur, räumliches Tracking, automatisch kalibrierte Konfidenz und gedrehte Gatter gehören nicht zum unterstützten Umfang. Die AR-Überlagerung wird aus aktuellen Bildkoordinaten neu berechnet; sie ist kein SLAM/Weltanker. Bei Bewegung, Verdeckung oder fehlenden Symbolen kann sie verschwinden oder falsch liegen.

**Beginne mit [der Druckvorlage](assets/print-template.svg).** Öffne die SVG im Browser und drucke sie im Querformat. Die App hat dafür einen Download-Button.

Zeichentipps:

1. Schwarzer Stift auf weißem, mattem Papier. Gatterkonturen vollständig schließen, Zeichenrichtung **links → rechts**.
2. Gatter groß zeichnen: ungefähr **3–5 cm breit**, nach der Bildskalierung mindestens 25 Pixel hoch. Das Blatt möglichst bildfüllend aufnehmen, starke Perspektive vermeiden.
3. Zwei Eingänge links ungefähr auf einem Viertel und drei Vierteln der Gatterhöhe anschließen. NOT hat einen mittigen Eingang. Ausgang jeweils rechts mittig.
4. Quellen als **Kreise mit 0/1** links der Gatter zeichnen; Senken als **leere Kreise** rechts. Nicht mit beliebigen Textetiketten oder Schaltern rechnen. Mehrstufige Schaltungen mit Quellen zwischen den Gattern können eine manuelle Typkorrektur brauchen.
5. Leitungen klar trennen, genug Abstand zwischen den beiden Eingängen lassen. **Jede durchgehende Kreuzung zählt als Verbindung**, auch ohne Punkt. Nicht verbundene Kreuzungen als sichtbare Brücke bzw. Unterbrechung zeichnen. Texte außerhalb der Verdrahtung halten.
6. Gleichmäßig beleuchten und ruhig halten. Bei Schatten die adaptive Schwelle verwenden; der Schieberegler schaltet auf einen festen Grenzwert um.
7. Gelbe Labels zeigen weniger ähnliche Formen, keine statistische Wahrscheinlichkeit. Alle vorgeschlagenen Typen und Verbindungen prüfen. Eine manuelle Änderung pausiert die Live-Erkennung, damit sie erhalten bleibt. In den Erkennungseinstellungen kann sie wieder aktiviert werden.

Manuell umgeschaltete Kameraeingänge haben Vorrang vor dem gedruckten Wert, solange derselbe Knoten verfolgt wird. **Leeren / Reset** entfernt diese Überschreibungen. Die Schalter unter der Fläche bleiben auch bedienbar, wenn das Antippen auf der Fläche gesperrt ist.

## Leistung und Architektur

```text
Video → verkleinertes Bild (640 px breit)
      → Vision-Worker / OpenCV → Konturen + Leitungskomponenten
      → Graph mit stabilisierten IDs → kompilierter DAG → Boolean-Zustände
      → Dual Canvas: Kamerabild / Zeichnung + Neon-Signale
                                  ↘ lokaler Coach + Wahrheitstabelle
```

- Zwei getrennte Canvas-Ebenen verhindern, dass AR-Signale in die zu analysierende Quelle geraten.
- Kamera-Vorschau maximal 30 FPS; Overlay per `requestAnimationFrame`, tatsächliche FPS im HUD. Bei reduzierter Bewegung entfallen wandernde Signalpunkte.
- OpenCV läuft bevorzugt in einem **Web Worker**; bei fehlendem Worker-Support gibt es eine lokale Verarbeitung im Hauptthread. Diese Ersatzverarbeitung kann die Bildrate reduzieren.
- Bildanalyse höchstens ungefähr alle 300 ms, ohne überlappende Analysen. Die Darstellung läuft unabhängig davon. Kontinuierliche Graph-Übernahme benötigt zwei konsistente Erkennungen; „Jetzt erkennen“ erzwingt einen einzelnen Vorschlag.
- Der DAG wird bei Strukturänderungen kompiliert. Eingangsänderungen berechnen nur die Werte neu. Im enthaltenen Test mit 150 Knoten werden 2.000 Aktualisierungen gemessen; konkrete Ergebnisse hängen vom Gerät ab.
- Ein 60-FPS-Ziel und unter 16 ms für die **Boolesche Auswertung** sind realistische Ziele für kleine Schaltungen, **keine Garantie für die gesamte Bildanalyse oder jedes Smartphone**. Maximale Importgröße: 160 Knoten, 500 Leitungen, 250 KB.
- Video und Erkennung werden in Hintergrund-Tabs nicht weiter verarbeitet; beim Verlassen der Seite werden Kameratracks gestoppt. In einem noch geöffneten, versteckten Tab bleibt die Kamera ggf. aktiv. Zur Freigabe auf **Sandbox** wechseln oder den Tab schließen.

## Offline und Datenschutz

Alle Verarbeitung erfolgt auf dem Gerät. Diese App enthält keine Upload-, Analyse-, Tracking-, Benutzerkonto- oder Cloud-Coach-Funktion.

OpenCV liegt **lokal im Paket** (`vendor/opencv.js`, rund 10,5 MB, WASM eingebettet). Der optionale Tailwind-3.4.17-CDN-Script-Tag erfüllt die gewünschte Tailwind-Einbindung; die gesamte notwendige Gestaltung liegt zusätzlich in `style.css`. Ohne Zugriff auf dieses CDN bleibt die App bedienbar. Für einen vollständig abgeschotteten Erststart kannst du diesen einen Script-Tag aus `index.html` entfernen; er ist keine Laufzeitvoraussetzung.

Der Service Worker speichert beim ersten erfolgreichen HTTPS-/localhost-Besuch die lokalen App-Dateien einschließlich OpenCV. Warte bis das Laden abgeschlossen ist, bevor du offline gehst. Danach funktionieren Sandbox, lokaler Coach und lokale Erkennung offline, sofern Browser und Betriebssystem den Cache behalten und Kamerazugriff im jeweiligen Kontext erlauben. Beim allerersten Besuch ist Netz oder ein eigener lokaler Server notwendig.

Bei Updates **`CACHE` in `sw.js` ändern**. Die neue Version wird nach erfolgreicher Installation und dem Schließen alter App-Tabs aktiv. GitHub-Pages-Inhalte sind öffentlich, wenn dein Repository/Pages-Angebot öffentlich ist; private Kamerabilder und lokal gespeicherte Schaltungen werden dadurch nicht veröffentlicht.

## Repository-Struktur

```text
index.html                 HUD, Coach-Panel, Werkzeuge, zugängliche Steuerelemente
style.css                  vollständig lokale Gestaltung, mobile Layouts, Neon
js/
  app.js                   Controller, Interaktion, Scan-Takt, Import/Export
  camera.js                MediaStream, Fokussierung, Koordinaten, Dual Canvas
  vision.js                OpenCV-Lader, Konturen, Pixel-Graph, Worker-Service
  visionWorker.js          isolierte OpenCV/WASM-Bildanalyse
  logicEngine.js           Validierung, SCC-Zyklenerkennung, DAG, dreiwertige Logik
  aiCoach.js               lokale Fragen, kontrafaktische Auswertung, Punkte
assets/
  icon.svg                 App-Icon
  print-template.svg       druckbare Schaltung zum Einstieg
vendor/
  opencv.js                gebündeltes OpenCV mit eingebettetem WASM
  OPENCV-LICENSE.txt        OpenCV-Lizenz
sw.js                      Offline-Cache mit relativen Pfaden
manifest.webmanifest       Web-App-Metadaten
.nojekyll                  GitHub-Pages-Unterstützung
tests/                     ausführbare Node-Tests, ohne npm-Abhängigkeiten
scripts/check.mjs          Syntax-, Dateipfad- und Paketprüfung
package.json               nur für Entwicklung / Testbefehle
README.md
LICENSE
THIRD_PARTY_NOTICES.md
```

## Prüfen und weiterentwickeln

Node.js 22+ genügt; `npm install` ist nicht nötig.

```sh
npm test
npm run check
```

Die Tests prüfen sämtliche Wahrheitstabellen, unbekannte Werte, Eingangsänderungen, Floating Pins, Mehrfachtreiber, Rückkopplungen, Graphimporte, Coach-Antworten, Kamera-Lebenszyklus und **echte OpenCV-Erkennung aller sechs gedruckten Gatter einschließlich Leitungen**. Synthetische Fixtures sind reproduzierbare Basistests; sie ersetzen keine Aufnahmen von echter Handschrift.

Zusätzlich wurde die App in Chromium über den späteren verschachtelten Pages-Pfad geprüft: Eingangsschalter, Coach-Rückmeldung, Gatterkorrektur, Platzieren und Rückgängig, 390-Pixel-Touch-Layout, echter OpenCV-Worker, Kamera-Fehlerbehandlung und Offline-Neuladen mit Service Worker funktionieren im Test. Screenshots im AppShelf-Eintrag zeigen die echte Browserdarstellung. Eine Prüfung auf einem physischen Smartphone mit echten Kamerabildern steht noch aus. Vor dem Einsatz im Unterricht: auf dem Zielgerät Druckvorlage scannen, 0/1 umschalten, Kamerawechsel, Bildschirmrotation und Offline-Neustart prüfen.

## Häufige Fragen

**Kein Bild?** HTTPS prüfen; Kamera erlauben; andere Kamera-Apps schließen; App außerhalb eines eingebetteten In-App-Browsers in Safari/Chrome öffnen.

**Falsches Gatter / falsche Leitung?** Live-Erkennung ausschalten. Knoten auswählen und Typ korrigieren; bei fehlerhafter Verdrahtung Knoten entfernen und neu verbinden. Für zuverlässige Logikexperimente die manuelle Sandbox verwenden.

**Ein Ausgang bleibt `?`?** Die Wahrheitstabelle und den Coach prüfen. Ein Eingang kann offen sein, zwei Leitungen können denselben Pin treiben oder der Graph enthält Rückkopplung. Ein offenes Pin wird nicht automatisch mit LOW beschaltet.

**OpenCV fehlt?** `vendor/opencv.js` muss mit ins Repository. Es gibt keinen entfernten OpenCV-Download zur Laufzeit.

**Alte Oberfläche nach Deployment?** Alte Tabs schließen. Bei Bedarf den Service Worker und Website-Cache in den Browser-Entwicklerwerkzeugen entfernen und neu laden. Für Updates die Cache-Version erhöhen.

## Lizenz

Eigener Anwendungscode: MIT, siehe [LICENSE](LICENSE). OpenCV und optionale CDN-Komponenten haben eigene Lizenzen; siehe [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Der Name „Logic-Cam“ bezeichnet dieses Projekt und keine Partnerschaft mit einem Hardware- oder KI-Anbieter.
