# OriginCheck 0.1.0 – lokale Abnahme am 3. November 2026

Der Quellstand wurde tatsächlich gebaut und geprüft. Testprovider sind ausschließlich markierte Vertragstestdaten in Tests; die verteilten Clients und der gestartete Dienst haben keinen Fake-Analysemodus.

| Prüfung | Ergebnis |
| --- | --- |
| `./gradlew testDebugUnitTest` | 10 bestanden, 0 übersprungen |
| `./gradlew lintDebug` | Erfolgreich, 0 Fehler / 17 Hinweise auf neuere Versionen und KTX-Stil |
| `./gradlew assembleDebug` | Erfolgreich, echte signierte APK |
| `./gradlew assembleRelease` | Erfolgreich, echte signierte APK, Entwicklungssignatur |
| `./gradlew connectedDebugAndroidTest` | 5 bestanden, 0 übersprungen, Android-11-/API-30-Emulator |
| Backend `npm ci --ignore-scripts` / `npm test` | Installation erfolgreich, 21 Tests bestanden |
| Backend `node --check server.js` | Erfolgreich |
| Web `npm ci --ignore-scripts` / `npm test` | Installation erfolgreich, 11 Tests bestanden |
| `node --check web/app.js` und Katalog-`demo/app.js` | Erfolgreich |
| Echte Browser-Prüfungen | 16 bestanden: je 8 Chromium / Linux-WebKit |
| AppShelf `npm ci --ignore-scripts`, `npm test`, `npm run build` | Erfolgreich, 4 veröffentlichbare Katalogeinträge |
| APK-CRC, AndroidManifest.xml, Signatur, Package/Version | Erfolgreich für Debug und Release |
| Vollständiges Source-ZIP und identische Demo-Dateien | Erfolgreich, inklusive Android-, Backend-, Web-Quellcode und Tests |
| AppShelf-Detailseite / Demo | Demo-Metadaten und alle 10 statischen Web-Dateien einschließlich Webmanifest im echten Build bestätigt |

Die fünf Emulator-Tests decodieren echte Bild- und Videodateien, prüfen den Sechs-Frame-Kontaktbogen, Share-Intent, standardmäßig ausgeschaltete Zustimmung, fehlendes Backend, Social-Fallback und die tatsächliche Löschung eigener temporärer-/Ergebnisdateien. Die App startete ohne Mikrofonberechtigung; der Emulator war im Flugmodus. Dies ist kein physischer Gerätetest.

Die Browser-Tests prüfen echte Dateiauswahl, JPEG-Kontaktbogen und unterschiedliche Bildpixel, Zustimmung vor Netzwerkzugriff, kein Medienupload bei 503, Fehler/ungültige Verdicts, `inconclusive`, XSS-sichere Textdarstellung, opt-in Historie/Löschen sowie Layouts mit 390, 768 und 1280 Pixeln. API-Vertragstests laufen in einem Kontext ohne Service Worker, da WebKit dessen Netzwerkzugriffe nicht zuverlässig abfangen lässt. Ein separater Kontext mit echtem Service Worker prüft die Shell: Chromium mit Offline-Netzwerk, WebKit mit tatsächlich getrenntem HTTP-Ursprung. Beim Chromium Headless Shell 151 wird nach dem gecachten Neuladen zusätzlich der Netzwerkindikator über CDP `Network.overrideNetworkState` auf offline gesetzt: das reine Sperren der tatsächlichen Anfragen über Playwright ließ `navigator.onLine` dort weiterhin wahr. Der reale Offline-Netzwerkzugriff bleibt während der Prüfung gesperrt. Bei WebKit liefert die Interception-API keine binären Blob-Bodies; MIME/Zustimmung und lokale JPEG-Erzeugung werden im Browser geprüft, tatsächliche eingehende Bytepuffer zusätzlich im TLS-Backend-Test.

In dieser unprivilegierten Cloud wurden fehlende Linux-WebKit-Bibliotheken außerhalb des Repositorys aus Debian-Paketen bereitgestellt. Da Playwrights Hostprüfung nur den unveränderbaren globalen `ldconfig`-Cache betrachtet, wurde lokal ausschließlich diese Vorprüfung ausgelassen. Der echte WebKit-Prozess und alle Browser-Tests liefen tatsächlich. CI installiert die regulären Playwright-Systemabhängigkeiten und verwendet diesen lokalen Workaround nicht.

Ein echter lokaler HTTPS-Backend-Prozess wurde mit einem außerhalb des Repositorys erzeugten temporären TLS-Zertifikat gestartet und mit normaler Zertifikatsprüfung erreicht. `/health` und `/v1/analyze` lieferten ohne `OPENAI_API_KEY` korrekt 503. CORS, Timeouts, Größen-/MIME-Prüfung, DNS-/Redirect-Schutz, Rate-Limits und ungültige Providerantworten wurden mit TLS-Vertragstests geprüft.

**Nicht getestet / nicht vorhanden:** kein Live-OpenAI-Aufruf mangels API-Key, kein öffentlich bereitgestelltes Analyse-Backend, keine echte Apple-/Safari-Hardware, kein physisches Android-Gerät. Direkter öffentlicher Live-Linkabruf wurde nicht als erfolgreich behauptet; die Cloud nutzt einen ausgehenden Proxy, hinter dem dieser Abruf absichtlich abgelehnt wird. Social-Seiten sind nicht unterstützt. C2PA-Markerprüfung ist keine Signaturverifikation. Die Entwicklungs-APK ist keine dauerhaft signierte Store-Veröffentlichung.

Verteilte APK: `OriginCheck-0.1.0-debug.apk`, 10.398.226 Bytes, SHA-256 `d0054f84420f700ea68dca01787fc6740d473f939199913fc883cb108136e58e`, Paket `de.appshelf.origincheck`, Version `0.1.0` / Code `1`, minSdk 26 / targetSdk 36. Netzwerkberechtigungen: INTERNET und ACCESS_NETWORK_STATE; zusätzlich nur AndroidX' interne Receiver-Schutzberechtigung.

Bestehende App-Verzeichnisse und Workflows bleiben unverändert. Der allgemeine Katalogtest wurde so korrigiert, dass er auch echte PNG-/JPEG-/WebP-Screenshots akzeptiert; zuvor nahm er beim neuesten Eintrag ausschließlich SVG an. Der neue OriginCheck-Workflow ergänzt Backend-/Web-/Android-/Artefakt-/PWA-Prüfungen. Der vorhandene Pages-/Release-Workflow veröffentlicht nach einem Merge; Auto-Merge war bei der Abnahme im Repository deaktiviert. GitHub-CI- und Merge-Status müssen im tatsächlichen Pull Request gelesen werden, die lokale Abnahme behauptet kein bereits erfolgtes Pages-Deployment.
