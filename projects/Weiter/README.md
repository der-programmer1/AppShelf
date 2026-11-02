# Weiter – Android-Quellcode

Weiter ist eine unabhängige, lokale Android-App für Gedanken, nächste Schritte
und kurze Fokuszeiten. Die Grundfunktion funktioniert ohne Konto, Backend oder
Internet. Eine Einführung und die Installationsanleitung stehen im AppShelf-
Eintrag `apps/inbox/weiter/README.md` des Repositorys.

## Voraussetzungen

- JDK 21
- Android SDK Platform 36 und Build Tools 36.0.0
- Android Platform Tools für Installation und Gerätetests
- Gradle 9.6.0 über den enthaltenen, mit SHA-256 abgesicherten Wrapper

Die Konfiguration verwendet Android Gradle Plugin 9.4.0 mit eingebauter Kotlin-
Unterstützung, Kotlin Compose Plugin 2.2.10 und Jetpack Compose. Die App läuft ab
Android 8.0 (API 26), hat die Package-ID `de.appshelf.weiter` und startet mit
Version `1.0.0` / VersionCode `1`.

Der Android-SDK-Pfad wird über `ANDROID_HOME` oder eine eigene, nicht eingecheckte
`local.properties` gesetzt. Schlüsseldateien und lokale Rechnerpfade gehören
nicht in den Quellcode.

## Bauen und prüfen

Im Verzeichnis dieses Projekts:

```sh
./gradlew --no-daemon --max-workers=2 :app:testDebugUnitTest :app:lintDebug :app:assembleDebug :app:assembleRelease
```

Für die Android-Tests muss ein entsperrter Emulator oder ein Android-Gerät
verbunden sein:

```sh
./gradlew --no-daemon --max-workers=2 :app:connectedDebugAndroidTest
```

Die verteilte APK entsteht als nicht debuggbarer Release-Build unter
`app/build/outputs/apk/release/app-release.apk`. Für dieses persönliche Sideload-Projekt
wird der lokale Android-Entwicklungsschlüssel auch für den Release-Build verwendet;
es wird kein offizielles Store-Signierungsverfahren behauptet. Für ein Update einer bereits
installierten APK muss derselbe Signierschlüssel verwendet werden. Eine neue
Installation mit anderem Schlüssel ersetzt daher keine bestehende App; sichere
deine Daten vor einer nötigen Deinstallation über den JSON-Export.

## AppShelf-Artefakte

Vom ursprünglichen Git-Checkout aus erstellt dieses Kommando das vollständige
Quellpaket und kopiert die zuvor gebaute APK in den neuen AppShelf-Eintrag:

```sh
python3 scripts/package.py
python3 scripts/package.py --check
```

Das Skript leitet die Version aus `app/build.gradle` ab und prüft die Dateiliste
und jeden Quellcode-Byte im ZIP gegen den Checkout. Generierte Build-Ausgaben,
lokale Konfiguration, Signierschlüssel und Symlinks dürfen nicht Teil des
Quellpakets sein. Die zusätzlichen Signatur-, Manifest-, Package-ID- und
Versionsprüfungen werden vor Veröffentlichung am tatsächlichen APK-Artefakt
vorgenommen.

Die Katalogprüfungen laufen vom Repository-Wurzelverzeichnis aus:

```sh
npm ci --ignore-scripts
npm test
npm run build
```

## Aufbau

- `Models.kt`: unveränderliche Daten und lokale Zustandsübergänge.
- `LocalStore.kt`: private, atomare Speicherung mit gemeinsamem Prozess-Lock.
- `BackupCodec.kt`: begrenztes JSON-Format, vollständige Validierung und
  Zusammenführen ohne Überschreiben gleichnamiger lokaler IDs.
- `WeiterUi.kt`: Compose-Oberfläche einschließlich Dark Mode, Inbox, Heute,
  Parkplatz, Papierkorb, Klären und Fokus-Timer.
- `MainActivity.kt`: Android-Dateidialoge, Texteingang aus dem Teilen-Menü und
  ausdrücklich angeforderte optionale Berechtigungen.
- `ReminderScheduler.kt`: lokale, ungenaue Erinnerungen, Fokus-Hinweise und
  erneute Planung nach Neustart, Zeitumstellung oder App-Update.
- `AttachmentTools.kt`: begrenzte private Bildkopien und lokale Sprachnotizen.

## Verhalten und Grenzen

Erinnerungen sind Android-Alarme ohne Anspruch auf minutengenaue Zustellung.
Android-Energiesparregeln und Benachrichtigungseinstellungen können die Hinweise
verzögern oder verhindern. Alle Texte und Aufgaben bleiben ohne diese Freigabe
nutzbar. Die App verarbeitet keine Daten auf einem Server und enthält keine
Analyse- oder Werbe-SDKs.

Die JSON-Sicherung enthält auch eingebettete Anhänge und ist nicht verschlüsselt.
Neue Sicherungseinträge werden hinzugefügt; lokale Einträge mit derselben ID
gewinnen bei Konflikten. Der laufende Fokus-Timer bleibt gerätespezifisch und ist
nicht Teil des portablen Exports. Papierkorb und erledigte Einträge werden nicht
automatisch entfernt.

Die App begrenzt Daten- und Anhangsgrößen, damit Import und lokale Verarbeitung
kontrollierbar bleiben. Für Fotos wird eine verkleinerte JPEG-Kopie gespeichert;
die App ist kein Archiv für unveränderte Originalbilder.
