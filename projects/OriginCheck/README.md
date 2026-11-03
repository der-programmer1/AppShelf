# OriginCheck 0.1.0

Ein weitergeleitetes Foto einordnen, einen Clip in Standbildern untersuchen oder einen direkten öffentlichen Bildlink prüfen: OriginCheck zeigt technische Beobachtungen und eine vorsichtige visuelle Herkunftshypothese. Ein Ergebnis ist kein Beweis. Fehlende Metadaten beweisen niemals KI-Erzeugung.

OriginCheck ist ein unabhängiges persönliches Projekt, keine offizielle Store-App. Die installierbare Android-APK wird außerhalb des Play Stores verteilt. Android und die Web/PWA funktionieren ohne Benutzerkonto. Die lokale Vorprüfung benötigt kein Backend; die optionale Cloud-Einschätzung benötigt ein selbst eingerichtetes HTTPS-Backend mit kostenpflichtigem OpenAI-Zugang. Es gibt keinen vorgegebenen öffentlichen Analysedienst und keine erfundenen Demo-Ergebnisse.

## Android verwenden

Die App benötigt Android 8 / API 26 oder neuer. Installiere `OriginCheck-0.1.0-debug.apk` aus dem AppShelf-Eintrag, nachdem du die Installation aus dieser Quelle erlaubt hast. Das ist ein echter signierter Entwicklungsbuild, kein Play-Store-Release. Auch der Release-Build wird geprüft; Version 0.1.0 verwendet dafür die lokale Android-Entwicklungssignatur. Ein dauerhafter privater Produktionssignierschlüssel ist nicht enthalten. Selbst gebaute spätere APKs können deshalb eine Neuinstallation erfordern.

1. Unter **Backend** die tatsächlich eingerichtete HTTPS-Backend-URL eintragen und speichern. Keine Schlüssel in das URL-Feld eingeben.
2. Unter **Prüfen** ein Bild oder Video über Fotos/Dateien auswählen. Alternativ aus einer anderen Android-App ein Bild, Video oder einen HTTPS-Link an OriginCheck teilen.
3. Die lokale Vorprüfung ansehen. Noch findet kein Upload statt.
4. Für jede Analyse ausdrücklich der Cloud-Übertragung zustimmen und **Vorsichtig analysieren** wählen.
5. Ergebnis mit Verdict, Vertrauensband, Signalen und Einschränkungen lesen. Nur **Dieses Ergebnis speichern** legt es lokal ab. Einzelne Ergebnisse oder die gesamte Historie können gelöscht werden.

Keine Kamera-, Mikrofon-, Standort- oder umfassende Medienbibliotheksberechtigung ist nötig. Die Dateiauswahl gewährt nur Zugriff auf ausgewählte Dateien. Ohne Internet bleiben lokale Vorprüfung und gespeicherte Ergebnisse verfügbar. Fehlendes Backend oder fehlender Anbieterzugang erzeugen eine Fehlermeldung, keinen Ersatzbefund.

## Browser, Safari und PWA

Die Web-App liegt vollständig in `web/`; dieselben Dateien werden nach `apps/inbox/origincheck/demo/` kopiert und vom vorhandenen AppShelf-Build unter dem **Demo-Link der OriginCheck-Detailseite** bereitgestellt. Nach Merge und erfolgreichem Pages-Workflow ist die Seite öffentlich verfügbar. Dieser Quellstand behauptet kein bereits erfolgtes Hosting-Deployment.

In Safari auf iPhone, iPad oder macOS die Seite öffnen, die echte Backend-URL speichern und Fotos/Dateien auswählen. Bei Videos **Dateien** verwenden. HEIC-, MOV- und andere Codec-Unterstützung hängt vom Gerät ab; bei einem Decodierfehler als JPEG beziehungsweise H.264-MP4 exportieren. Unter iPhone/iPad: Teilen → Zum Home-Bildschirm. Unter unterstützten macOS-Versionen: Zum Dock hinzufügen. Android und moderne Desktop-Browser können die PWA ebenfalls installieren.

Beim ersten Online-Aufruf installiert der Service Worker ausschließlich die Anwendungsshell. Danach sind lokale Dateivorprüfung und ausdrücklich gespeicherte Ergebnisse offline verfügbar. Cloud-Analysen funktionieren offline nicht. Browserdaten können vom Betriebssystem gelöscht werden. Private Browserfenster können die Speicherung einschränken. Keine externen Schriftarten, Tracking-Skripte oder API-Schlüssel sind eingebaut. Providertexte werden als Textknoten dargestellt, niemals als HTML.

## Was wird tatsächlich geprüft?

- Dateigröße, deklarierter MIME-Type und echte Dateisignatur: Bilder höchstens **25.000.000 Bytes**, Videos höchstens **200.000.000 Bytes / 180 Sekunden**.
- Lesbare Bildabmessungen, Android-EXIF-Felder beziehungsweise ein begrenzter JPEG-/PNG-TIFF-EXIF-Parser im Browser; keine persönlichen EXIF-Werte werden vom lokalen Dateiimport weitergesendet. Native Video-Containerdaten beziehungsweise Browser-Metadaten liefern Dauer und Abmessungen.
- Ein begrenzter 2-MB-Scan sucht mögliche C2PA/JUMBF-Marker. Das ist **keine kryptografische Prüfung von Content Credentials**, Zertifikaten oder Herkunft. Ein Marker kann fehlen, kopiert oder gefälscht sein.
- Videos werden tatsächlich an sechs Zeitpunkten `(i + 0,5) × Dauer / 6` decodiert. Ein JPEG-Kontaktbogen mit sechs beschrifteten Frames wird statt des Originalvideos übertragen. Das ersetzt keine vollständige temporale Videoprüfung und enthält keinen Ton. Sehr kurze/gleichförmige Videos können ähnliche Standbilder liefern.
- Ein verkleinertes JPEG, höchstens 2048 Pixel pro Bildkante, ersetzt beim Bildimport das Original. Animierte Bilder werden als Standbild behandelt. Das Backend akzeptiert JPEG/PNG/WebP, prüft Uploadgröße, MIME und Signatur erneut und ergänzt eigene technische Signale.

Die lokale Vorprüfung ist keine KI-Erkennung. Die Cloud nutzt ein visuelles Sprachmodell, keinen validierten forensischen Detektor. Es gibt keine gemessene Erkennungsgenauigkeit. Daher begrenzt Version 0.1.0 visuelle Provider-Einschätzungen stets auf **niedrig**, auch wenn das Modell ein stärkeres Band liefert. Das Schema unterstützt `niedrig`, `mittel`, `hoch` für spätere kalibrierte Verfahren; Version 0.1.0 erzeugt keine unkalibrierten Prozentwerte und keine sichere Herkunftsbehauptung.

| Interner Verdict | Anzeige |
| --- | --- |
| `likely_ai_generated` | Wahrscheinlich KI-generiert |
| `likely_camera_original` | Wahrscheinlich kamerabasiert/original |
| `likely_edited_or_mixed` | Wahrscheinlich bearbeitet oder gemischt |
| `inconclusive` | Nicht eindeutig bestimmbar |

Unbekannte Verdicts, ungültige JSON-Antworten, fehlender Schlüssel, Timeouts und Providerfehler werden zurückgewiesen. `inconclusive` ist ein gültiges, unsicheres Analyseergebnis und wird niemals als Fehlerersatz erfunden. Kompression, Ausschnitte und Nachbearbeitung können Signale verändern. Die App bietet keinen Faktencheck, keine Wahrheitserkennung, Urheberrechtsprüfung, Gesichtserkennung, Identitätsbestimmung oder Personensuche.

## Backend einrichten

Für Render ist im AppShelf-Repository eine ausgefüllte `render.yaml` vorbereitet. Sie legt eine einzelne kostenpflichtige Instanz mit 0,5 CPU / 512 MB in Frankfurt an und fragt den OpenAI-Key ausschließlich bei Render ab. Im Render-Dashboard **New → Blueprint**, Repository `der-programmer1/AppShelf`, Branch `main`, Datei `render.yaml` wählen. Den angezeigten Preis prüfen und `OPENAI_API_KEY` direkt dort eingeben. Ein ChatGPT-Abo enthält kein OpenAI-API-Guthaben. Details, technische TLS-Anbindung und lokale Containerprüfung stehen in [backend/README.md](backend/README.md). Die Vorlage selbst ist noch kein laufendes Hosting-Deployment; eine öffentliche URL und Live-Analyse müssen danach tatsächlich getestet werden.

Siehe [backend/README.md](backend/README.md). Node.js **22.23.0 oder neuer**, ein vertrauenswürdiges TLS-Zertifikat und eine tatsächliche Betreiberadresse sind erforderlich. Der Dienst liest den Anbieterzugang ausschließlich aus **`OPENAI_API_KEY` in seiner Serverumgebung**. APK, Web-App und Android-Quellcode kennen keinen Schlüssel. Standardmodell: `gpt-4.1-mini`, änderbar über `OPENAI_MODEL`. Modellzugang und Verfügbarkeit hängen vom eigenen OpenAI-Konto ab.

Ohne API-Key startet der HTTPS-Dienst trotzdem; `/health` und Analyseanfragen liefern **503 / Analyse-Backend nicht konfiguriert**. Die Clients prüfen nach Zustimmung zuerst `/health`, damit bei fehlendem Schlüssel keine Medien hochgeladen werden. Ein bereiter Healthcheck bestätigt nur Konfiguration, keine erfolgreiche OpenAI-Verbindung.

Die AppShelf-Web-App wird mit CORS für `https://der-programmer1.github.io` unterstützt; Pfade sind kein Teil eines Browser-Ursprungs. Andere Web-Ursprünge sind absichtlich nicht freigegeben. Android benötigt kein CORS. Das Backend selbst akzeptiert ausschließlich echtes TLS, keine durch `X-Forwarded-Proto` behauptete Verschlüsselung. Für Hosting den TLS-Dienst direkt exponieren oder TLS bis zum Dienst weiterreichen.

## Öffentliche Links

Direkte öffentliche HTTPS-Links auf JPEG-, PNG- oder WebP-Dateien können verarbeitet werden. Server-DNS-Auflösung und **alle** Redirects werden auf öffentliche Zieladressen geprüft; die geprüfte Adresse wird für den TLS-Socket fixiert, private/reservierte Netze werden gesperrt. Sonderports, URL-Zugangsdaten und beliebige HTML-Seiten werden abgelehnt. Hinter einem ausgehenden HTTP(S)-Proxy ist diese DNS-Fixierung nicht nachweisbar; der direkte Linkabruf wird dann geschlossen abgelehnt. Datei-Upload bleibt die Alternative.

Social-Media-Seiten, Plattform-Videolinks und private Inhalte werden in 0.1.0 nicht verarbeitet. Es ist kein oEmbed- oder Plattform-API-Zugang eingerichtet. Es gibt weder Scraping noch Login, Schutzumgehung oder inoffizielle Endpunkte. Die App zeigt:

> Dieser Link kann nicht direkt verarbeitet werden. Teile stattdessen das Video über das Teilen-Menü oder lade die Datei hoch.

## Datenschutz und Kosten

Vor jedem Upload wird eine neue ausdrückliche Zustimmung benötigt. Bilder werden lokal zu JPEG ohne Original-EXIF umgewandelt; bei Videos geht nur der Kontaktbogen in die Cloud. Bei einem direkten Bildlink ruft das Backend die Originalbilddatei ab; darin können EXIF-Daten enthalten sein, die anschließend an OpenAI übertragen werden. Keine vertraulichen Inhalte oder URLs übermitteln, für deren Übermittlung du keine Berechtigung hast.

Android legt temporäre Dateien ausschließlich im privaten App-Cache an: die Originalkopie wird nach der Vorprüfung auch bei Fehlern gelöscht, die Uploadkopie nach Abschluss, Abbruch, Verlassen der App oder spätestens zehn Minuten nach der Vorbereitung. Ein Prozessabbruch kann Cache-Reste bis zum nächsten App-Start hinterlassen; dann wird der eigene temporäre Ordner bereinigt. Die Datei in deiner Galerie bleibt erhalten. Im Browser leben ausgewählte Medien und Blob-URLs nur im Arbeitsspeicher und werden bei Löschen, Abbruch, Verlassen oder nach zehn Minuten freigegeben. Weder Service Worker noch Historie speichern Originale oder Kontaktbögen. Speicherfreigabe ist keine garantierte forensische RAM-Löschung.

Das Backend verarbeitet Originalmedien nur vorübergehend im Speicher, überschreibt seine Bytepuffer bei Abschluss und schreibt keine Mediendateien auf Datenträger. Es gibt keine Anfrage-, Medien-, Schlüssel- oder personenbezogenen Inhaltslogs. Infrastrukturbetreiber müssen auch Proxy-/Hosting-Logs entsprechend konfigurieren. Es gibt keine Nutzerkonten, Werbung oder Tracking. Lokale Ergebnisse entstehen nur nach ausdrücklichem Speichern; Löschen betrifft die eigenen Ergebnisdaten, keine Daten beim API-Anbieter.

OpenAI erhält das vorbereitete Bild und einen festen Analyseauftrag. Die Responses API wird mit `store:false` verwendet. Dies deaktiviert die Responses-Speicherung, garantiert aber **keine Null-Aufbewahrung**: nach den API-Datenbedingungen können Missbrauchsprotokolle grundsätzlich bis zu 30 Tage bestehen; gesonderte Anbietervereinbarungen können abweichen. Kein Zero-Data-Retention-Versprechen. API-Nutzung und Hosting können Geld kosten; Preise beim Anbieter prüfen und eigene Budgetgrenzen setzen. Standardmäßig sind global und pro IP höchstens **10 Analyseversuche pro Minute** sowie **2 gleichzeitige Analysen** erlaubt, Timeout **45 Sekunden**. Das ist ein Schutz für einen persönlichen Pilotdienst, keine vollständige öffentliche Missbrauchs-/Kostenkontrolle.

## Bauen und testen

```sh
cd android
./gradlew testDebugUnitTest
./gradlew lintDebug
./gradlew assembleDebug
./gradlew assembleRelease
./gradlew connectedDebugAndroidTest
cd ../backend
npm ci --ignore-scripts
npm test
node --check server.js
cd ..
npm ci --ignore-scripts
npm test
node --check web/app.js
npx playwright install --with-deps chromium webkit
npm run test:browser
python3 scripts/check-test-results.py
python3 scripts/verify-apk.py android/app/build/outputs/apk/debug/app-debug.apk
python3 scripts/package.py
```

Android verwendet die stabile Umgebungskonfiguration: JDK 21, Gradle Wrapper 9.6.0, AGP 9.4.0, eingebautes Kotlin / Compose-Plugin 2.2.10, SDK 36, minSdk 26. Keine lokalen SDK-Pfade oder Signierschlüssel sind Teil des Quellcodes. Das Source-ZIP enthält `android/`, `backend/`, `web/`, Tests, Wrapper und diese Anleitung. Für den AppShelf-Katalog anschließend im Repository-Stamm `npm ci --ignore-scripts`, `npm test`, `npm run build` ausführen. `python3 projects/OriginCheck/scripts/package.py --check` prüft die unveränderte vollständige Quellcodeübergabe einschließlich Web-Dateien.

Vertragstests verwenden klar markierte Testprovider ausschließlich im Testcode. Sie bestätigen API-Verhalten, keine echte Medienerkennung. Der Abschlussbericht in `automation/runs/2026-11-03-origincheck.md` unterscheidet tatsächliche Tests, Emulator und Live-Provider. Linux-WebKit ersetzt keinen echten Safari-/Apple-Gerätetest. Kein echtes Android-Gerät und kein Anbieterzugang stehen allein durch dieses Repository zur Verfügung.

## Offizielle API-Grundlage

Am 3. November 2026 konsultiert: [Responses API / Bildverarbeitung](https://developers.openai.com/api/docs/guides/images-vision), [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [API-Datenverwendung](https://developers.openai.com/api/docs/guides/your-data), [GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini). Verwendet wird `/v1/responses` mit `input_image` und strengem `text.format`-JSON-Schema, keine Assistants-API.
