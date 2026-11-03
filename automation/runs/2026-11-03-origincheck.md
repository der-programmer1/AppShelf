# OriginCheck 0.1.0 – Abschluss der lokalen Implementierung

OriginCheck ergänzt AppShelf um genau ein neues Projekt: Kotlin-/Compose-Android-App, statische Web/PWA und einen separaten HTTPS-Node-Dienst. Die App hilft bei der vorsichtigen Einordnung weitergeleiteter Bilder, kurzer Clips und direkter öffentlicher Bildlinks. Sie trennt lokale technische Beobachtungen von der erst nach ausdrücklicher Zustimmung möglichen Cloud-Einschätzung. Fehlende Metadaten sind kein KI-Beweis, Ergebnisse sind Hypothesen ohne Prozentgarantie.

## Erstellte Dateien

- `projects/OriginCheck/android/`: Gradle Wrapper, SDK-36-/minSdk-26-Konfiguration, Manifest, eigenes Icon, Compose-Oberfläche, UDF-ViewModel, lokale Historie, Bild-/Video-Vorprüfung, Share-Intent und HTTPS-Client; zehn Unit- und fünf Emulator-Tests.
- `projects/OriginCheck/backend/`: `server.js`, `provider.js`, `security.js`, `media.js`, `contracts.js`, gesperrte Dependency-Versionen, `.env.example`, Backend-Anleitung und 21 TLS-/Provider-Vertragstests.
- `projects/OriginCheck/web/`: `index.html`, `app.js`, `style.css`, `manifest.webmanifest`, `sw.js`, gemeinsame Validierung/Medienprüfung und eigene SVG-/PNG-Icons; identische Kopie unter `apps/inbox/origincheck/demo/`.
- `projects/OriginCheck/tests/`: elf Web-Unit-Tests, 16 echte Chromium-/Linux-WebKit-Prüfungen und ein generiertes dreisekündiges MP4-Testvideo.
- `projects/OriginCheck/scripts/`: APK-/Manifest-/Signaturprüfung, Prüfung tatsächlicher Android-Testzahlen, vollständige Quellen-/PWA-Verpackung und Prüfung des gebauten Katalogs.
- `projects/OriginCheck/README.md`, `VALIDATION.md` und `.env.example`: Nutzung, Backend-Einrichtung, Safari/PWA, Schlüssel, Kosten, Ratelimits, Datenschutz und Grenzen.
- `apps/inbox/origincheck/`: `app.json`, nutzerfreundliche README, zwei echte Web-Screenshots, APK, Source-ZIP und vollständiges `demo/`.
- `.github/workflows/origincheck.yml`: zusätzliche CI für Backend, Browser, Android und Artefakte. Bestehende Workflows bleiben unverändert.
- `scripts/test-catalog.mjs`: generischer Screenshot-Test akzeptiert auch echte PNG-/JPEG-/WebP-Screenshots; die bisherige reine SVG-Annahme war für den neuen neuesten Katalogeintrag ungeeignet.

## Artefakte

- APK: `apps/inbox/origincheck/OriginCheck-0.1.0-debug.apk`, **10.398.226 Bytes**, SHA-256 `d0054f84420f700ea68dca01787fc6740d473f939199913fc883cb108136e58e`.
- Source-ZIP: `apps/inbox/origincheck/OriginCheck-0.1.0-source.zip`, **217,655 Bytes**, SHA-256 `26049dba168cdb58a8331983541a09f4cbda9395c5262c7a549ce323c995501e`. ZIP-CRC, vollständige Mitgliedschaft und identische Quelldateien geprüft; enthält Android, Backend, Web, Tests, Wrapper, README und leere Umgebungsbeispiele, keine Schlüssel oder Build-Caches.
- Web-App: `apps/inbox/origincheck/demo/`. Der echte AppShelf-Build enthält alle zehn Dateien und den Eintrag `demoHref: apps/origincheck/demo/`, Plattformen Android / Web/PWA / Backend, Projektart `app` und Katalogstatus `published`.
- Screenshots: `screenshots/01-preview.png` zeigt den echten Startzustand ohne Backend und Ergebnis. `02-lokale-videopruefung.png` zeigt sechs tatsächlich decodierte Frames aus einem generierten Testclip. Keine erfundenen Providerergebnisse oder vorgetäuschten Backend-Adressen in den Screenshots.

## Tatsächlich ausgeführte Prüfungen

| Prüfung | Ergebnis |
| --- | --- |
| Android `testDebugUnitTest` | 10/10 bestanden, keine übersprungen |
| Android `lintDebug` | bestanden, 0 Fehler / 17 Versions-/Stilhinweise |
| Android `assembleDebug` / `assembleRelease` | beide bestanden, echte signierte Android-Pakete |
| Android `connectedDebugAndroidTest` | 5/5 bestanden, keine übersprungen, API-30-Emulator |
| Backend `npm ci --ignore-scripts`, `npm test`, `node --check server.js` | bestanden, 21 Tests |
| Web `npm ci --ignore-scripts`, `npm test` | bestanden, 11 Tests |
| `node --check web/app.js` und `node --check demo/app.js` | bestanden |
| Echte Browserprüfungen | 16/16 bestanden, je acht Chromium und Linux-WebKit |
| AppShelf `npm ci --ignore-scripts`, `npm test`, `npm run build` | bestanden, vier veröffentlichbare Einträge |
| APK-CRC / AndroidManifest.xml / Signatur / Paket / Version | bestanden: `de.appshelf.origincheck`, 0.1.0 / Code 1, minSdk 26 / targetSdk 36 |
| Source-ZIP / PWA-Kopie / Katalog-Detailseitenverknüpfung | bestanden |
| Echtes lokales HTTPS-Backend ohne Key | erreichbar; Health und Analyse 503, erlaubter CORS-Preflight 204 |

Die Android-App startete im Flugmodus ohne Mikrofonberechtigung. Die Emulator-Tests prüfen echte Vorbereitung und Löschung, Share-Import ohne Upload, Zustimmung, fehlendes Backend, Social-Fallback und opt-in Historie. Der APK-Check bestätigt ausschließlich INTERNET, ACCESS_NETWORK_STATE und AndroidX' interne Receiver-Schutzberechtigung.

Browserprüfungen trennen API-Verträge von einem echten Service-Worker-Kontext. Chromium lädt die Shell mit deaktiviertem Netzwerk, Linux-WebKit mit tatsächlich getrenntem HTTP-Ursprung. Fehlende Linux-Bibliotheken wurden außerhalb des Repositorys eingerichtet; der unprivilegierte globale ldconfig-Cache erfordert lokal das Auslassen der Playwright-Hostvorprüfung, nicht der Browser-Tests. CI verwendet die reguläre Systeminstallation. WebKit zeigt echten Video-Sampling-Erfolg, ist aber kein Safari auf Apple-Hardware. Details in `projects/OriginCheck/VALIDATION.md` und portable Messwerte in `2026-11-03-origincheck.json`.

## Grenzen und nicht mögliche Tests

- **Keine echte OpenAI-Analyse:** `OPENAI_API_KEY` fehlt. Der gestartete Dienst gibt korrekt 503 aus. Testprovider dienen nur dem Vertragstest und sind kein Live-Test.
- **Kein öffentliches Analyse-Backend:** lediglich der echte lokale TLS-Dienst wurde erreicht. Keine Hostingkonten, Domains oder externen Deployments wurden erfunden.
- **Kein physisches Android-Gerät, keine Apple-/Safari-Hardware:** ungetestet. Android-11-Emulator und echte Linux-Browser wurden getestet; Android 8 ist minSdk, kein behaupteter Gerätetest.
- **Keine Live-Linkanalyse:** direkte öffentliche Bildressourcen sind implementiert und sicherheitsseitig getestet. Der ausgehende Cloud-Proxy verhindert sichere DNS-Fixierung; direkter Linkabruf lehnt dann ab. Social-Seiten und Videolinks zeigen den verlangten Datei-Fallback, ohne Scraping.
- **Keine forensische Genauigkeitsmessung oder C2PA-Signaturverifikation:** Marker-Scan und visuelles Sprachmodell haben dokumentierte Grenzen. Alle unkalibrierten visuellen Befunde bleiben Vertrauensband niedrig. Sechs Frames sind keine vollständige temporale Videoprüfung.
- **Entwicklungssignatur:** die verlangte Debug-APK ist installierbar und signiert; kein dauerhafter privater Produktionsschlüssel wird verteilt.

## Git, PR und Veröffentlichung

Eigener Branch: `codex/origincheck-2026-11-03`, Basis `2c13f755ec900992e0318c5e2bbe4c0c8e9d7aed`. Bestehende Apps, APKs, Source-ZIPs und Workflows wurden nicht verändert oder gelöscht. Die neue App ist im geprüften Katalogstand veröffentlichbar; das bedeutet noch kein bereits erfolgtes öffentliches Deployment.

Commit und Pull Request gehören zur Übergabe dieses Branches. Der GitHub-API-Wert `allow_auto_merge` war **false**; Schutzdetails waren mit der Integration nicht lesbar (403). Daher wird weder eine erfolgreiche Prüfung aller Schutzregeln noch ein automatischer Merge behauptet und die Einstellung nicht umgangen. Der vorhandene Release-/Pages-Workflow veröffentlicht nach einem zulässigen Merge die Artefakte und den Demo-Link. GitHub-CI, PR- und Merge-Status sind am tatsächlichen Pull Request nachvollziehbar; die lokale Abnahme behauptet keine zukünftigen CI-Ergebnisse.
