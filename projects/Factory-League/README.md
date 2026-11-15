# Factory League

Eine deutschsprachige Fabrik-Liga mit echten Accounts, dauerhaften Spielständen, bis zu 24 Stunden Offline-Produktion und einer gemeinsamen, serverseitig berechneten Rangliste.

**Anmeldung: Spielername und Passwort, ohne Firebase und ohne E-Mail-Dienst.** Bei der Registrierung erhält jeder Spieler einen einmaligen Rettungscode. Passwörter werden mit Argon2id gehasht. Sitzungscookies sind HttpOnly, SameSite=Lax und im öffentlichen HTTPS-Betrieb Secure. In der Datenbank liegen ausschließlich Hashes der Sitzungstokens und Rettungscodes.

## Für Spieler

1. „Fabrik gründen“ öffnen und einen Spielernamen mit 3–20 Buchstaben, Zahlen oder Unterstrichen wählen.
2. Ein Passwort mit mindestens 10 Zeichen eingeben und wiederholen.
3. Den persönlichen Rettungscode kopieren oder als Datei herunterladen und sicher aufbewahren.
4. Drei Metallmaschinen produzieren sofort Credits. Die langsamste Maschine begrenzt die Linie. Ausbauten und weitere Linien steigern die Produktion.
5. Ausgegebene Credits bleiben als Produktionspunkte erhalten. Der Rang wird für alle Accounts automatisch berechnet, auch während der Offline-Produktion.

„Passwort vergessen?“ verwendet Spielername, Rettungscode und ein neues Passwort. Danach wird ein neuer Rettungscode angezeigt; der alte Code und alle früheren Sitzungen verlieren ihre Gültigkeit. Ohne Passwort und ohne Rettungscode ist keine automatische Wiederherstellung möglich.

## Lokal entwickeln

Node.js 24 und npm:

```bash
npm ci
npm run dev
```

Website: `http://localhost:5173`. API: `http://localhost:3001`. Die lokale SQLite-Datei liegt in `data/`, nicht im Repository. Es sind weder Firebase-Projekt noch API-Schlüssel erforderlich.

```bash
npm run check
npm test
npm run build
npm start
```

Für Browserprüfungen:

```bash
npx playwright install chromium
npm run build
npm run test:e2e
```

Ist Chromium bereits vorhanden: `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e`.

## Render einrichten

Das eigenständige Projekt liegt wegen der Berechtigungen des verbundenen GitHub-Zugangs unter `projects/Factory-League` im AppShelf-Repository. `render.yaml` in diesem Ordner enthält bereits den korrekten `rootDir`. Keine bestehenden AppShelf-/OriginCheck-Dienste werden ersetzt.

1. Auf Render einen Blueprint aus `der-programmer1/AppShelf`, Branch `main`, Datei `projects/Factory-League/render.yaml` erstellen.
2. Workspace „My Workspace“ verwenden. Der Blueprint erzeugt genau einen Webservice in Frankfurt mit `0.5c-512mb` und 1 GB dauerhaftem Speicher.
3. Die bereitgestellte HTTPS-Adresse direkt öffnen. Registrierung und Anmeldung sind sofort betriebsbereit.
4. `DATABASE_PATH` zeigt auf `/var/data/factory-league.sqlite`. Nur Dateien unter `/var/data` überstehen Neustarts und Veröffentlichungen.

Render stellt `PORT` und die öffentliche URL automatisch bereit. Der Server hört auf `0.0.0.0`. `/health` prüft die Datenbank. Das Anlegen der Tabellen läuft beim Start auf dem eingebundenen Speicher. GitHub Actions prüft Spiel und Oberfläche vor automatischen Veröffentlichungen.

Basisbetrieb laut geprüftem Tarif: 7 US-Dollar pro Monat für den Server plus 0,25 US-Dollar für 1 GB Speicher, vor Steuern. Bandbreite und weitere Nutzung können zusätzliche Kosten verursachen. Eine eigene Domain ist optional. Mit persistentem Speicher läuft eine einzelne Instanz; bei Updates gibt es eine kurze Unterbrechung.

## Backups aktivieren und wiederherstellen

Die Anleitung in [BETRIEB.md](BETRIEB.md) erklärt tägliche verschlüsselte CI-Sicherungen, den privaten Backup-Schlüssel und eine Wiederherstellung in eine neue Datenbankdatei. Die Account-Einrichtung selbst benötigt keine zusätzliche Konfiguration.

## Spielregeln und Vertrauensgrenze

Metall, Elektronik und Robotik verwenden feste Ketten mit drei Stationen. Alle Spielregeln stehen gemeinsam in `shared/game.ts`. Preise und Produktionskapazitäten werden mit Ganzzahlarithmetik berechnet. Serverzeit, Transaktionen und idempotente Kaufanfragen verhindern doppelte Credits und überzogene Käufe. Der Browser übermittelt ausschließlich Kaufabsichten, niemals gültige Kontostände oder selbst berechnete Punkte.

Öffentliche Profile enthalten Namen, Rang, Produktion, Titel und Fabrikausbau. Private Accountdaten, Passwort- und Rettungscode-Hashes sowie Sitzungen werden nicht ausgeliefert. Die Rangliste enthält ausschließlich tatsächliche Accounts; die Fabrik vor der Anmeldung ist ausdrücklich als Vorschau beschriftet.

Die lokale E2E-Testhilfe bindet nur an `127.0.0.1`, benötigt `NODE_ENV=test` und wird nicht in den Produktionsserver kompiliert. Ihre Zeitsteuerungs- und Reset-Endpunkte existieren nicht im Livebetrieb.

## Gestaltung

Eigenständig gezeichnete SVG-Fabriken, Animationen, responsive Oberfläche und lokal eingebundene Schriften. Space Grotesk und IBM Plex Mono stehen unter der OFL; die Lizenztexte liegen in `public/fonts/`. Bei reduzierter Bewegung werden Animationen abgeschaltet.
