# AppShelf veröffentlichen und automatische Neuigkeiten

OriginCheck wurde mit PR #5 nach fünf erfolgreichen GitHub-Prüfungen nach `main` übernommen. Der tatsächliche Pages-Lauf `41620434750` hat Validierung, Release-Dateien und GitHub Pages erfolgreich veröffentlicht. Der öffentliche Katalog enthält SehPlus, LeistenPlan, Weiter und OriginCheck. OriginChecks Demo-Link und Downloads sind im öffentlichen Katalog vorhanden. Ein öffentliches Analyse-Backend oder eine echte OpenAI-Analyse wird dadurch nicht behauptet.

Der Nutzer hat klargestellt: Gewünscht ist eine Neuigkeiten-Seite mit Button auf AppShelf, keine E-Mail-Anmeldung und kein Versanddienst. Die vorbereitete Arbeit aus dem Entwurf PR #4 wird dafür übernommen und um echte automatische Erkennung ergänzt.

## Umsetzung

- Sichtbarer **Neuigkeiten**-Button auf der Startseite und allen App-Detailseiten; zusätzliche Hauptaktion im Einstieg.
- Vollständige, nach Datum gruppierte Historie unter `updates/`; neueste Änderung zusätzlich auf der Startseite.
- Erkennung aus der vollständigen First-Parent-Git-Historie: neue veröffentlichte Apps, Versionswechsel, Änderungen ohne Versionswechsel, Web-Demos, Anleitungen, Vorschaubilder, Quellprojekt- und sonstige Repositoryänderungen.
- Ein zusammengeführter Feature-Branch wird als eine Veröffentlichung behandelt. Unveröffentlichte Zwischenstände und Draft-Apps werden nicht als neue Apps angekündigt.
- Eindeutige stabile Eintrags-IDs, echte Commit-Daten und Links zu den tatsächlichen Änderungen. Wiederholte Builds erzeugen keine weiteren Meldungen. Mehrere Änderungen desselben Tages werden nach Veröffentlichungszeit geordnet.
- Quellcodeänderungen ohne neue APK behaupten keine neue installierbare App. Wiederholte Katalogimporte werden nicht mehrfach als neue App bezeichnet.
- Optionale redaktionelle Featurebeschreibungen in `site/updates.json` ersetzen den generischen Eintrag derselben Veröffentlichung; spätere Änderungen erscheinen trotzdem automatisch. Ohne redaktionellen Eintrag bleibt die automatische Historie funktionsfähig.
- Statisches HTML ohne Anmeldung, E-Mail-Adressen, Tracking oder JavaScript-Pflicht. Daten und Links werden escaped; interne Pfade und rohe Commit-Texte werden nicht als Neuigkeit ausgegeben.
- Der bestehende Pages-Workflow läuft bei jedem Push auf `main`; alle Checkout-Schritte, die den Katalog bauen, laden die vollständige Git-Historie. Fehlende Historie wird klar zurückgewiesen.

Die Git-Historie dokumentiert Änderungen im veröffentlichten Projektstand. Sie ist kein Beweis, dass jeder alte Commit einzeln erfolgreich deployt wurde. Neuigkeiten werden erst mit dem erfolgreichen Pages-Deployment öffentlich. Die Erkennung liest tatsächliche Metadaten und Dateiveränderungen; sie erfindet keine semantischen Featurebeschreibungen aus Programmcode.

## Lokale Nachweise

| Prüfung | Ergebnis |
| --- | --- |
| `npm ci --ignore-scripts` | erfolgreich |
| `npm test` | Katalog/Artefakte erfolgreich; 23 Neuigkeiten-Tests bestanden, keine übersprungen |
| `npm run build` | erfolgreich, vier veröffentlichte Apps unverändert enthalten |
| `npm run test:browser` | 18 Prüfungen bestanden, Chromium und Linux-WebKit |
| Browser-Ansichten | 320, 390, 768 und 1280 Pixel; kein horizontaler Überlauf |
| Bedienung | echte Button-/App-Navigation, Tastaturfokus, Historie ohne JavaScript |
| Historienquelle | echte temporäre Git-Repositories für Uploads, gleiche Version, Branch-Merge, Drafts, Wiederholungen und fehlende Historie |
| `node --check` | neue Build-/Browser-Skripte gültig |
| OriginCheck-Katalog- und Quellenprüfung | alle zehn Demo-Dateien enthalten; 56 Quelldateien im bestehenden ZIP bytegleich |
| Bestehende Apps und Artefakte | keine Änderungen an `apps/` oder `projects/` |
| `git diff --check` | erfolgreich |

Linux-WebKit ersetzt keinen Test auf physischer Apple-Hardware. Lokal wurden die bereits außerhalb des Repositorys eingerichteten Browserbibliotheken verwendet; CI installiert die regulären Playwright-Systemabhängigkeiten und führt beide Browser tatsächlich aus.

## Dateien

`site/index.html`, `site/app.html`, `site/updates/index.html`, `site/updates.json`, `site/assets/style.css`; `scripts/updates.mjs`, `scripts/automatic-updates.mjs`, `scripts/build-catalog.mjs`, `scripts/validate-catalog.mjs`, `scripts/test-updates.mjs`, `scripts/test-automatic-updates.mjs`, `scripts/test-news-browser.mjs`; `package.json`/Lockfile; README und gezielte Erweiterungen der bestehenden CI-/Pages-Workflows. Die historischen Reports aus PR #4 bleiben als Nachweis des damaligen Arbeitsstands erhalten; diese Abnahme beschreibt den erweiterten Stand.

Der neue Feature-PR wird nach seinen erfolgreichen Prüfungen veröffentlicht. Der tatsächliche finale PR-/CI-/Pages-Status wird in seiner Beschreibung und im Abschluss dieser Arbeit angegeben; dieser lokale Bericht behauptet kein zukünftiges Deployment.
