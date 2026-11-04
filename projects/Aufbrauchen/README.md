# Aufbrauchen

**Dein Vorrat hat einen Plan. Erst aufbrauchen, dann nachkaufen.**

Du kaufst Joghurt, obwohl noch welcher im Kühlschrank steht? Brot verschwindet im Gefrierfach und angebrochene Packungen geraten aus dem Blick? Aufbrauchen sammelt deine Lebensmittel, zeigt bald erreichte Datumsangaben und verbindet den Verbrauch mit deinem nächsten Einkauf.

Die App ist ein unabhängiges persönliches AppShelf-Projekt. Sie funktioniert lokal, ohne Benutzerkonto, Backend, Werbung oder Tracking. Die APK wird außerhalb des Play Stores verteilt; es handelt sich nicht um eine offizielle Store-App.

## So verwendest du Aufbrauchen

1. **Vorrat hinzufügen:** Name, Menge und Einheit eintragen. Lagerort, Lebensmittelgruppe, Notiz, geöffnetes Datum und MHD/Verbrauchsdatum sind ergänzbar. Mengen unterstützen bis zu drei Nachkommastellen, zum Beispiel `0,5 kg` oder `1,25 l`.
2. **Heute:** Vorräte mit Datum bis zum gewählten Planungshorizont erscheinen zuerst. Standard sind heute und die nächsten drei Tage; in Mehr sind 1, 3, 7 oder 14 Tage wählbar. Lebensmittel ohne Datum bleiben im Vorrat sichtbar.
3. **Verbrauchen:** Eine Teilmenge oder alles verbuchen. Optional genau diese verbrauchte Menge auf die Einkaufsliste setzen. Beim vollständigen Verbrauch bleibt der Eintrag im Archiv erhalten. Der letzte Schritt lässt sich rückgängig machen.
4. **Einkaufen:** Positionen hinzufügen, bearbeiten und gekauft abhaken. Gekaufte Artikel über **In Vorrat übernehmen** mit ihrer tatsächlichen Menge und einem optionalen neuen Datum einlagern. Die Übernahme wird atomar gespeichert und erzeugt bei mehrfacher Betätigung keinen zweiten Vorrat.
5. **Vorlagen:** Häufige Lebensmittel merken und schnell als neuen Vorrat erfassen. Alte Datumsangaben werden nicht auf den neuen Einkauf übertragen. Vorlagen können entfernt werden.

Die Vorratssuche berücksichtigt Name und Notiz; Filter für Lagerort und Lebensmittelgruppe helfen beim Finden. Im Archiv kannst du abgeschlossene Einträge wieder öffnen oder erneut erfassen. Gelöschte Vorräte und Einkaufspositionen bleiben im Papierkorb und können wiederhergestellt werden. Es gibt keine automatische Löschung aufgrund eines Datums, Alters oder Status.

### Die Datumsübersicht ist keine Frischeprüfung

Ein Mindesthaltbarkeitsdatum ist kein automatisches Wegwerfdatum. Ein Verbrauchsdatum („zu verbrauchen bis“) ist eine Sicherheitsgrenze. Aufbrauchen zeigt ausschließlich deine Angaben und entscheidet nicht, ob ein Lebensmittel noch essbar ist. Es gibt keine automatisch geratenen Haltbarkeiten, Bilderkennung oder Hintergrundalarme. Die Tagesübersicht aktualisiert sich beim Öffnen und bei einem Tageswechsel in der geöffneten App.

## Android installieren

Die installierbare Datei heißt **Aufbrauchen-1.0.0.apk** und unterstützt Android 8.0 oder neuer. Auf der AppShelf-Seite herunterladen, die Installation aus der gewählten Downloadquelle erlauben und die APK öffnen. Android kann einen Hinweis zur Installation außerhalb des Play Stores anzeigen.

Der Release-Build ist nicht debuggable und für die persönliche Weitergabe mit dem Android-Entwicklungsschlüssel dieser Build-Umgebung signiert. Ein privater Produktionsschlüssel wird nicht verteilt. Für zukünftige Updates muss dieselbe Signatur erhalten bleiben. Bei selbst neu signierten Builds vor einer nötigen Neuinstallation unbedingt eine JSON-Sicherung exportieren.

Die App benötigt weder Internet-, Kamera-, Mikrofon-, Standort- noch allgemeine Speicherberechtigung. JSON-Dateien werden ausschließlich über den Android-Dateiauswahldialog geöffnet oder gespeichert. Dark Mode folgt dem System. Texte, Schaltflächen und Statusangaben sind unabhängig von Farbe verständlich.

## Web-App für iPhone, iPad und Mac

Auf der AppShelf-Detailseite **Web-App öffnen** wählen. Alle Kernabläufe entsprechen der Android-Version: Vorrat, Mengen, Datumsübersicht, Einkaufsübernahme, Vorlagen, Archiv/Papierkorb, Rückgängig und Sicherungen.

- iPhone/iPad: in Safari öffnen → Teilen → Zum Home-Bildschirm.
- Mac ab Safari 17: Safari → Ablage → Zum Dock hinzufügen.
- Moderne Desktop-Browser: direkt verwenden oder die angebotene PWA-Installation nutzen.

Nach dem ersten vollständigen Laden meldet die App **Offline bereit**. Danach funktionieren alle Kernfunktionen ohne Verbindung. Die Shell verwendet nur eigene Dateien, keine CDNs. Der Service Worker cacht keine Vorräte oder Sicherungen; diese bleiben im lokalen IndexedDB-Speicher. Browser können lokalen Speicher bei Platzmangel oder nach privaten Sitzungen entfernen. Deshalb regelmäßig sichern. Android und Browser synchronisieren sich nicht automatisch.

## Sicherungen und Entwürfe

Unter **Mehr → JSON exportieren/importieren** sind Sicherungen zwischen Android und Web austauschbar. Sie enthalten alle gespeicherten Vorräte, Einkaufseinträge und Einstellungen im Format `aufbrauchen-backup`, Version 1. Die Dateien sind nicht verschlüsselt; wähle einen privaten Speicherort.

Vor dem Import wird die gesamte Datei streng geprüft: Schema, Typen, Daten, Kennungen, Referenzen, Mengen, Unicode und doppelte JSON-Feldnamen. Ungültige Dateien verändern keine Daten. Beim Zusammenführen gewinnen vorhandene lokale Kennungen und Einstellungen; ein erneuter Import erzeugt keine doppelten Einträge. Grenzen: 5.000 Vorräte, 2.000 Einkaufspositionen, Namen bis 120 Zeichen, Notizen bis 2.000 Zeichen, Daten/Sicherung höchstens 8 MB, Menge von 0,001 bis 1000000 je Einheit.

Bearbeitungsentwürfe werden lokal gespeichert und beim Schließen angeboten. Sie sind nicht Teil des portablen JSON-Exports. Bei zwischenzeitlichen Änderungen wird ein veralteter Entwurf nicht über den aktuellen Eintrag geschrieben. Die Web-App verwendet atomare Lese-/Schreibtransaktionen auch zwischen Fenstern; Android eine atomare Datei und eine geordnete Schreibwarteschlange. Rückgängig betrifft jeweils den letzten Datenvorgang. **Alle lokalen Daten löschen** verlangt eine Bestätigung und entfernt auch Entwürfe und den Rückgängig-Schritt.

## Quellcode, Build und Tests

Das vollständige Archiv **Aufbrauchen-1.0.0-source.zip** enthält `android/`, `web/`, `tests/`, `scripts/`, Gradle Wrapper und diese Anleitung. Keine lokalen SDK-Pfade, privaten Schlüssel, Build-Caches oder erfundenen Artefakte. JDK 21, Android SDK 36 und Build Tools 36.0.0 entsprechen der bestehenden stabilen AppShelf-Konfiguration; minSdk 26, Gradle 9.6, AGP 9.4 und Jetpack Compose.

```sh
# Im Projektverzeichnis, mit lokal konfiguriertem Android SDK:
cd android
./gradlew testDebugUnitTest lintDebug assembleDebug assembleRelease assembleDebugAndroidTest
# Mit einem verfügbaren Android-Emulator oder Gerät zusätzlich:
./gradlew connectedDebugAndroidTest
cd ..
npm ci --ignore-scripts
npm test
npx playwright install --with-deps chromium webkit
npm run test:browser
python3 scripts/build-web.py --check
python3 scripts/verify-apk.py android/app/build/outputs/apk/release/app-release.apk
python3 scripts/package.py
python3 scripts/package.py --check
```

21 Android-Unit-Tests und 21 Web-Kernprüfungen teilen elf vollständige Datenszenarien. Die Browserprüfungen verwenden echte Oberflächen, Dateien, Downloads, lokalen Speicher und einen tatsächlich abgeschalteten HTTP-Ursprung. Linux WebKit ersetzt keinen Test auf einem physischen Apple-Gerät. Vier Android-Instrumentierungstests stehen für den Emulatorlauf in GitHub Actions bereit. Der konkrete Prüfstand steht in `TEST-REPORT.md`; nicht verfügbare Gerätetests werden nicht als erfolgreich ausgegeben.

Zum eigenen statischen Bereitstellen den Ordner `web/` über HTTPS hosten. Lokal genügt `python3 -m http.server` und `http://localhost:8000/web/`. Für die Web-App sind weder Servercode noch API-Schlüssel nötig.
