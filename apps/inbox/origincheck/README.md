# OriginCheck · Herkunft mit Vorbehalt

Du bekommst ein auffälliges Foto weitergeleitet, möchtest einen Clip einordnen oder einen öffentlichen Bildlink untersuchen? OriginCheck macht zunächst eine **lokale technische Vorprüfung**. Erst nach deiner ausdrücklichen Zustimmung kann ein von dir eingerichtetes Backend eine vorsichtige visuelle Cloud-Einschätzung ergänzen.

Das Ergebnis zeigt „Wahrscheinlich KI-generiert“, „Wahrscheinlich kamerabasiert/original“, „Wahrscheinlich bearbeitet oder gemischt“ oder „Nicht eindeutig bestimmbar“ – jeweils mit Signalen und Einschränkungen. Es gibt keine Prozentversprechen oder sichere KI-Nachweise. Fehlende Metadaten sind kein Beweis für KI-Erzeugung. Version 0.1.0 begrenzt unkalibrierte visuelle Befunde auf das Vertrauensband **niedrig**.

OriginCheck ist ein **unabhängiges persönliches Projekt**, keine offizielle Store-App. Die Android-APK wird **außerhalb des Play Stores** verteilt. Es gibt kein Benutzerkonto, keine Werbung und kein Tracking. Lokale Vorprüfung und bewusst gespeicherte Ergebnisse benötigen kein Backend. Eine Cloud-Einschätzung benötigt ein eigenes HTTPS-Backend mit serverseitigem OpenAI-Key. Hier wird kein öffentlicher Analysedienst vorgetäuscht.

## Android

`OriginCheck-0.1.0-debug.apk` herunterladen und auf Android 8 oder neuer installieren. Die Installation aus der gewählten Downloadquelle muss erlaubt sein. Es ist eine echte signierte Entwicklungs-APK. Eine spätere selbst gebaute APK kann wegen anderer Entwicklungssignatur eine Neuinstallation benötigen; ein privater Produktionssignierschlüssel wird nicht verteilt.

Unter **Backend** die tatsächliche HTTPS-Adresse speichern. Unter **Prüfen** ein Bild oder Video aus Fotos/Dateien wählen, über Androids Teilen-Menü übernehmen oder einen öffentlichen HTTPS-Link einfügen. Die lokale Vorprüfung zeigt Signatur, Format, Größe und lesbare Metadaten. Bilder sind auf 25 MB begrenzt, Videos auf 200 MB und 180 Sekunden. **Keine Mikrofon-, Kamera- oder Standortberechtigung nötig.**

Bei Videos entstehen sechs echte, zeitlich verteilte Standbilder in einem JPEG-Kontaktbogen. Nur dieser Bogen wird übertragen, kein Originalvideo und kein Ton. Sampling ersetzt keine vollständige temporale Videoprüfung.

## Browser und Safari

Den **Demo-Link auf dieser Detailseite** öffnen. Die vollständige Web-App liegt unter `demo/`. Sie ist für moderne Browser und Safari auf iPhone, iPad und macOS ausgelegt. Backend-Adresse lokal speichern, Bild aus Fotos/Dateien oder Video aus Dateien auswählen und die lokale Vorschau ansehen. Nicht decodierbare HEIC-/Videoformate als JPEG/H.264-MP4 exportieren.

PWA installieren: auf iPhone/iPad über Teilen → Zum Home-Bildschirm, auf unterstützten macOS-Versionen über Zum Dock hinzufügen. Nach dem ersten Online-Aufruf stehen Anwendungsshell, lokale Vorprüfung und gespeicherte Ergebnisse offline zur Verfügung; Cloud-Analysen brauchen Internet. Die Browser-Oberfläche enthält keinen API-Key und zeigt ohne Backend keine Fake-Ergebnisse.

## Backend und Schlüssel

Das vollständige `OriginCheck-0.1.0-source.zip` enthält `android/`, `backend/`, `web/`, Gradle Wrapper, Tests, `.env.example` und eine ausführliche README. Im Backend-Verzeichnis mit Node.js ab 22.23.0 `npm ci --ignore-scripts` ausführen. `.env.example` nach `.env` kopieren, ausschließlich **serverseitig** `OPENAI_API_KEY` setzen und echte eigene TLS-Zertifikatdateien über `TLS_CERT_FILE` / `TLS_KEY_FILE` konfigurieren. `npm start` startet den HTTPS-Dienst. Es werden keine Schlüssel, Zertifikate, Domains oder Hostingkonten erfunden oder mitgeliefert.

Ohne Schlüssel antwortet das echte Backend mit **503 / Analyse-Backend nicht konfiguriert**. `/health` ist keine Bestätigung einer erfolgreichen OpenAI-Verbindung. CORS unterstützt die AppShelf-Web-App unter `https://der-programmer1.github.io`. Standard: 10 Analyseversuche global und pro IP pro Minute, zwei parallele Analysen, 45 Sekunden Timeout, erneut geprüfte Uploadlimits. OpenAI-API und Hosting können Kosten verursachen; Betreiber sollten eigene Budgetgrenzen setzen. Der Dienst ist für einen persönlichen Pilotbetrieb ausgelegt.

## Links und Grenzen

Unterstützt werden technisch geeignete **direkte öffentliche HTTPS-Bilddateien** in JPEG, PNG und WebP. Private/reservierte Netzwerkziele werden gesperrt; Redirects und DNS werden geprüft. Bei einem ausgehenden HTTP(S)-Proxy lehnt das Backend den Linkabruf sicher ab, da die geprüfte Zieladresse dort nicht am TLS-Socket fixiert werden kann. Dann die Datei hochladen.

Social-Media-Seiten, Plattform-Videolinks und private Inhalte werden in 0.1.0 nicht ausgelesen. Es gibt keine Plattform-Logins, inoffiziellen Endpunkte oder Scraping. Der Hinweis lautet: „Dieser Link kann nicht direkt verarbeitet werden. Teile stattdessen das Video über das Teilen-Menü oder lade die Datei hoch.“

Ein visuelles Sprachmodell ist kein validierter forensischer KI-Detektor. Metadaten können verändert werden; der begrenzte Scan nach C2PA-Markern **verifiziert weder Signatur noch Zertifikatskette**. Kein Faktencheck, keine Wahrheitserkennung, Identitätsbestimmung, Gesichtserkennung oder Urheberrechtsprüfung.

## Datenschutz

Vor jeder Übertragung wird neu zugestimmt. Bei Dateiimport gehen ein verkleinertes JPEG ohne Original-EXIF beziehungsweise der Kontaktbogen an das eigene Backend und weiter an OpenAI. Bei direkten Bildlinks kann das vom Backend abgerufene Originalbild Metadaten enthalten, die ebenfalls an OpenAI gehen. Originalmedien werden weder im Backend dauerhaft gespeichert noch in die lokale Historie aufgenommen.

Temporäre App-Dateien werden bei Abschluss, Fehler, Abbruch, Verlassen oder nach zehn Minuten gelöscht; nach einem Prozessabbruch bereinigt der nächste Start mögliche Cache-Reste. Die Datei in deiner Galerie bleibt bestehen. Browser-Blobs liegen nur vorübergehend im Speicher; der Service Worker speichert ausschließlich Anwendungsdateien. **Ergebnisse bleiben nur nach ausdrücklicher Auswahl lokal erhalten.** Einzelne Ergebnisse und die gesamte Historie lassen sich löschen.

`store:false` deaktiviert Responses-Speicherung bei OpenAI, garantiert jedoch keine Null-Aufbewahrung: mögliche Missbrauchsprotokolle unterliegen den API-Datenbedingungen und können grundsätzlich bis zu 30 Tage bestehen. Keine personenbezogenen Inhalte, Medien oder Schlüssel werden von der Anwendung protokolliert. Infrastrukturbetreiber müssen auch Hosting-/Proxy-Logs entsprechend konfigurieren.

## Teststatus und Artefakte

Die beiden Vorschaubilder zeigen die echte Web-Oberfläche und einen tatsächlich lokal erzeugten Kontaktbogen aus einer generierten Testvideodatei, keine erfundene Analyse. Android-Unit-Tests, Lint, Debug-/Release-Build, Emulator-Tests, Backend- und Web-Tests sowie AppShelf-/Artefaktprüfungen werden vor der Katalogfreigabe ausgeführt. Vertragstests mit Testprovidern sind keine Live-Erkennung. Ein echtes Android-Gerät, echter Safari auf Apple-Hardware und eine Live-OpenAI-Analyse sind ohne diese Geräte beziehungsweise API-Key **ungetestet**. Es wird kein fertig öffentlich gehostetes Backend behauptet.

Die ausführliche Einrichtung, Erkennungsgrenzen, offiziellen API-Quellen und reproduzierbaren Prüfungen stehen in der README im Quellcode-ZIP und unter `projects/OriginCheck/README.md` im Repository. Der Abschlussbericht steht unter `automation/runs/2026-11-03-origincheck.md`.
