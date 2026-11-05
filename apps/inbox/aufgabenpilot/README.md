# AufgabenPilot · AppShelf

Hausaufgaben als Foto, Kamerabild, PDF oder Text erfassen und einen FA2-Bearbeitungsplan mit Zeitblöcken, Hinweisen, erklärten Lösungen und Selbstkontrollen erzeugen.

**Status:** vollständige Web-/Backend-Implementierung, vorerst als Entwurf im Katalog. Für echte KI-Auswertung sind ein eigener Server, ein OpenAI-API-Schlüssel mit Agents-API-Zugriff und API-Guthaben nötig. Ein ChatGPT-Abonnement allein konfiguriert diesen Server nicht. Ohne Schlüssel gibt es eine klare Fehlermeldung statt vorgegebener Ergebnisse.

## Workflow

1. Fotos werden zunächst nur lokal angezeigt. Upload und Cloud-Aufruf erfolgen erst beim bewussten Absenden mit Zustimmung.
2. Das Python-Backend prüft Zugriff, Ursprung, Dateityp, Größe und Seitenzahl. Fotos werden gedreht, verkleinert und ohne EXIF neu als JPEG kodiert; PDFs werden in echte Seitenbilder gerendert.
3. Die **OpenAI Agents API** führt die Analyse mit verwalteter Codex-Laufzeit aus. Es werden Text-/Bildeingaben und ein JSON-Schema verwendet, ohne Shell, externe Tools oder Unteragenten.
4. Das Backend akzeptiert ausschließlich validierte Aufgaben. Der Zeitplan wird anschließend deterministisch berechnet: 25 Minuten Arbeit, 5 Minuten Pause, kein Überschreiten des gewählten Zeitfensters.
5. Hinweise und Lösungen sind getrennt aufklappbar. Unlesbare oder unvollständige Aufgaben erhalten eine Rückfrage und keine erfundene Lösung. Textdownload und Drucken/„Als PDF sichern“ dienen zum Aufbewahren.

„FA2“ übernimmt die Bezeichnung aus der Skizze; eine zusätzliche fachliche Definition wurde nicht vorausgesetzt.

## Dateien

| Datei | Aufgabe |
| --- | --- |
| web/index.html, web/style.css | Responsive Oberfläche, Kamera-/Dateiauswahl und Ergebnisbereich |
| web/app.js | Upload, Zustimmung, Serververbindung, Abbruch, Download und Drucken |
| web/render.js | Validierung, sichere Textdarstellung und Textexport |
| web/config.js | Öffentliche Backend-Adresse; niemals Schlüssel oder Zugangscode eintragen |
| web/theme.js, web/icon.svg | Dunkelmodus und eigenes App-Symbol |
| backend/app.py | HTTP-API, Zugriffscode, CORS, Anfragelimits und Auslieferung des Frontends |
| backend/provider.py | Echte Codex-Anbindung, Abschlussprüfung, Timeout, Abbruch und Sitzungsbereinigung |
| backend/media.py, backend/models.py | PDF-/Bildaufbereitung, Aufgabenstruktur und Zeitplanung |
| backend/requirements.txt, backend/.env.example | Abhängigkeiten und Vorlage für die Serverkonfiguration |
| Dockerfile, compose.yaml, Caddyfile | Eigenständiger Betrieb, optional mit HTTPS für eine eigene Domain |
| scripts/package.py | Frontend nach AppShelf übernehmen, Source-ZIP erstellen und Bytegleichheit prüfen |
| backend/tests/, tests/ | API-/Medienprüfungen und Chromium-/WebKit-Tests |

AppShelf ist vorbereitet: **apps/inbox/aufgabenpilot/app.json** verweist mit demoDir „demo“ auf die synchronisierte Web-App. Beim späteren Veröffentlichen wird sie unter apps/aufgabenpilot/demo/ eingebunden. Das Python-Backend läuft separat und gehört nicht auf GitHub Pages.

## Lokal starten – hier kommt der API-Key hinein

Voraussetzung: Python 3.12 oder neuer. Vom Repository-Stamm:

    cd projects/AufgabenPilot/backend
    python3 -m venv .venv
    source .venv/bin/activate
    python -m pip install -r requirements.txt
    cp .env.example .env

Unter Windows PowerShell stattdessen:

    cd projects/AufgabenPilot/backend
    py -3.12 -m venv .venv
    .\.venv\Scripts\Activate.ps1
    python -m pip install -r requirements.txt
    Copy-Item .env.example .env

Bei Verwendung des einzelnen Source-ZIPs in dessen entpackten Ordner wechseln und dort „backend“ als Startordner verwenden.

**Öffne jetzt projects/AufgabenPilot/backend/.env.** Trage dort deinen eigenen Schlüssel ein:

    OPENAI_API_KEY=DEIN_EIGENER_OPENAI_API_KEY
    OPENAI_MODEL=gpt-6-astra
    APP_ACCESS_TOKEN=DEIN_EIGENER_LANGER_APP_ZUGANGSCODE
    ALLOWED_ORIGINS=https://der-programmer1.github.io,http://localhost:8000,http://127.0.0.1:8000
    RATE_LIMIT_PER_HOUR=20
    AI_TIMEOUT_SECONDS=120

Erzeuge den separaten App-Zugangscode im Terminal:

    python -c "import secrets; print(secrets.token_urlsafe(32))"

Das Ergebnis kommt hinter **APP_ACCESS_TOKEN=**. Dieser Code schützt dein Backend vor fremden kostenpflichtigen Anfragen. Im Browser wird später nur dieser App-Zugangscode eingegeben. Der **OpenAI-Key bleibt in .env**. Gitignore und Packskript schließen echte .env-Dateien aus.

Der OpenAI-Projektschlüssel benötigt laut Agents-Dokumentation api.agents.read, api.agents.write und api.responses.write sowie Zugriff auf das konfigurierte Modell. Das Beispielmodell ist konfigurierbar; Freigabe und Guthaben hängen vom eigenen API-Projekt ab.

Starte anschließend im Backend-Ordner:

    python -m uvicorn app:app --host 127.0.0.1 --port 8000 --env-file .env --no-access-log

Öffne **http://localhost:8000**. Die Server-Adresse ist bereits eingetragen. App-Zugangscode eingeben, eine Aufgabe wie „3x + 5 = 20“ erfassen, Zustimmung aktivieren und „Plan & Lösungen erstellen“ wählen.

GET /health meldet „ready“, wenn beide Servergeheimnisse konfiguriert sind. Dies beweist keinen gültigen OpenAI-Zugang: Den bestätigt erst eine erfolgreiche echte Auswertung.

## Öffentlicher Betrieb und AppShelf

Du kannst das Docker-Image auf einem HTTPS-fähigen Containerhost betreiben. Vom Repository-Stamm:

    docker build -t aufgabenpilot projects/AufgabenPilot
    docker run --rm --env-file projects/AufgabenPilot/backend/.env -p 127.0.0.1:8000:8000 aufgabenpilot

Der Container hört intern auf 0.0.0.0:8000 und enthält Backend und Web-App. Bei einem Hostinganbieter **OPENAI_API_KEY** und **APP_ACCESS_TOKEN** unter **Environment / Secrets** eintragen, nicht in GitHub oder das Image. HTTPS muss am Hosting-Eingang aktiv sein. Nur eine API-Instanz betreiben, da das Anfragelimit innerhalb dieser Instanz gezählt wird.

Alternativ auf einem eigenen Server mit Docker Compose und eigener Domain:

1. Den DNS-Eintrag der Backend-Domain auf den Server richten; Ports 80/443 müssen erreichbar sein.
2. In backend/.env die Schlüssel eintragen und die echte Backend-Origin zusätzlich zu https://der-programmer1.github.io in ALLOWED_ORIGINS ergänzen, z. B. https://lernen.deine-domain.de. Keine Pfade, abschließenden Schrägstriche oder Sternchen verwenden.
3. Im Ordner projects/AufgabenPilot starten:

    PUBLIC_HOSTNAME=lernen.deine-domain.de docker compose up -d --build

„lernen.deine-domain.de“ ist ein Platzhalter für deine eigene Domain. Caddy übernimmt HTTPS; der API-Container wird nicht direkt öffentlich freigegeben.

Danach:

1. Die echte Backend-Adresse mit /health und eine echte kleine Aufgabe im Frontend testen.
2. In projects/AufgabenPilot/web/config.js nur apiBaseUrl auf die tatsächliche HTTPS-Origin setzen. Alternativ lässt sich die Server-Adresse direkt im Verbindungsbereich der App eingeben.
3. Vom Repository-Stamm synchronisieren und prüfen:

    python3 projects/AufgabenPilot/scripts/package.py --sync
    python3 projects/AufgabenPilot/scripts/package.py --check
    npm ci --ignore-scripts
    npm test
    npm run build

4. Erst nach erfolgreichem Live-Test und grünen Prüfungen in apps/inbox/aufgabenpilot/app.json den Status von „draft“ auf „published“ setzen. Änderungen über Branch und Pull Request übernehmen. Der bestehende Pages-Workflow verknüpft die Web-App und Downloads automatisch.

Dieses Paket implementiert den ausdrücklich gewünschten Web-/AppShelf-Workflow; dafür ist keine APK erforderlich.

## Daten, Kosten und Grenzen

- Keine dauerhafte Upload- oder Ergebnisablage auf dem AufgabenPilot-Server, keine Zugriffs-/Inhaltslogs im mitgelieferten Startbefehl, keine Schlüssel im Browser. Der Zugangscode und die Aufgaben werden nicht in LocalStorage gespeichert; dort liegt nur die Designauswahl.
- OpenAI erhält vorbereitete Seitenbilder und ergänzte Aufgabentexte. Bekannte Agent-Sitzungen werden nach Abschluss, Fehler oder Abbruch gelöscht; ein Bereinigungsfehler wird angezeigt. OpenAIs Aufbewahrungsregeln gelten zusätzlich. Keine Zusage einer sofortigen oder vollständigen Löschung beim Provider.
- Höchstens drei Seiten/Fotos, 8 MB je Quelldatei, 12 MB HTTP-Anfrage, zwölf erkannte Aufgaben, zwei gleichzeitige Anfragen und standardmäßig 20 Versuche pro Stunde für die gesamte Instanz. Die Oberfläche begrenzt die ausgewählten Dateien zusammen auf 8 MB. Mehrseitige PDFs werden nicht still gekürzt.
- JPEG, PNG, WebP und PDF werden unterstützt. HEIC vorher als JPEG exportieren. Handschrift, kleine Formeln und Diagramme können falsch erkannt werden. Lösungen und Zeitangaben sind Lernhilfen und müssen geprüft werden.
- API-Nutzung und gegebenenfalls Hosting verursachen Kosten. Ein eigenes begrenztes API-Projekt verwenden. Der gemeinsame App-Zugangscode ist für einen kleinen kontrollierten Nutzerkreis gedacht; eine öffentliche Nutzerplattform benötigt individuelle Anmeldung und verteilte Kontingente.
- Analyse benötigt Internet. Textdownload und gespeicherte PDF können anschließend offline gelesen werden.

## Tests

Im Backend-Ordner:

    python -m unittest discover -s tests -v

Vom Repository-Stamm:

    npm ci --ignore-scripts
    npx playwright install --with-deps chromium webkit
    node projects/AufgabenPilot/tests/browser.mjs
    python3 projects/AufgabenPilot/scripts/package.py --check

Tests verwenden ausdrücklich künstliche Providerantworten ausschließlich im Testrunner. Sie prüfen den tatsächlichen HTTP-/Upload-/Darstellungsablauf und den dokumentierten API-Vertrag, belegen aber keine echte KI-Qualität oder Kontofreigabe. Die produktive Anwendung besitzt keinen Demo-Ergebnis-Fallback.

## Offizielle API-Quellen

Stand: 05.11.2026.

- [Agents API und verwaltete Codex-Laufzeit](https://developers.openai.com/api/docs/guides/agents-api/overview)
- [API-Key, Berechtigungen und Beta-Header](https://developers.openai.com/api/docs/guides/agents-api/quickstart)
- [Sitzung erstellen: Text-/Bildeingaben und Ausgabeformat](https://developers.openai.com/api/reference/resources/beta/subresources/agents/subresources/sessions/methods/create)
- [Turn-Abschluss statt bloßem Idle-Status prüfen](https://developers.openai.com/api/docs/guides/agents-api/sessions)
- [Abgeschlossene Ergebnisnachrichten lesen](https://developers.openai.com/api/reference/resources/beta/subresources/agents/subresources/sessions/subresources/items/methods/list)
