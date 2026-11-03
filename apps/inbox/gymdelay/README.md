# GymDelay

GymDelay ist ein lokaler Android-Countdown für das Training. Die App pausiert die gerade aktive Musik-Session, zählt die gewählte Vorbereitungszeit herunter und startet anschließend genau diese Session wieder.

## Enthaltene Funktionen

- Presets für 5, 10, 15, 30 und 60 Sekunden
- sichtbarer Countdown in der App und in der Android-Benachrichtigung
- Start und Abbruch direkt aus der App
- Wiederherstellung eines laufenden Countdowns nach dem erneuten Öffnen
- Prüfung der Session-Identität vor dem Fortsetzen, damit nicht versehentlich eine andere App gestartet wird
- vollständig lokal: kein Login, kein Streaming und kein Cloud-Backend

## Installation

1. `GymDelay-1.0.0-debug.apk` auf ein Android-Gerät übertragen und installieren.
2. GymDelay öffnen und den Android-Dialog für **Benachrichtigungszugriff** öffnen.
3. GymDelay dort aktivieren. Das ist nötig, damit die App die aktuelle MediaSession steuern kann.
4. Android-Benachrichtigungen für GymDelay erlauben.
5. Musik in einer beliebigen kompatiblen Player-App starten, eine Zeit auswählen und **Countdown starten** drücken.

Die Debug-APK ist für die lokale Installation gedacht. Android kann beim manuellen Installieren eine Sicherheitsabfrage für Apps aus unbekannten Quellen anzeigen.

## Datenschutz und Berechtigungen

GymDelay benötigt `FOREGROUND_SERVICE`, `POST_NOTIFICATIONS` und den Android-Benachrichtigungszugriff für die Mediensteuerung. Es gibt keine Internetberechtigung. Es werden keine Musikdaten gestreamt, keine Titel aus Benachrichtigungstexten gespeichert und keine Kontodaten verarbeitet. Die App steuert nur die aktive MediaSession und speichert lokal den Countdown-Zustand.

## Dateien in diesem AppShelf-Eintrag

- `GymDelay-1.0.0-debug.apk`: direkt installierbare Debug-Version
- `GymDelay-1.0.0-release-unsigned.apk`: Release-APK ohne Produktionssignatur
- `GymDelay-1.0.0-release-unsigned.aab`: Release-App-Bundle ohne Produktionssignatur
- `GymDelay-1.0.0-source.zip`: vollständiges Quellprojekt ohne Build-Caches
- `screenshots/01-preview.svg`: Katalog-Vorschau

Das AAB ist für eine spätere signierte Veröffentlichung vorbereitet, aber noch nicht Play-Store-fertig signiert. Für eine Store-Veröffentlichung werden ein eigenes Signatur-/Upload-Key-Setup, die Play-Console-Einträge und die erforderlichen Store-Datenschutzangaben benötigt.

## Quellprojekt bauen

Im Quellprojekt `/GymDelay`:

```bash
ANDROID_HOME=/root/android-sdk ANDROID_SDK_ROOT=/root/android-sdk \
JAVA_HOME=/usr/lib/jvm/java-17-openjdk-arm64 \
./gradlew testDebugUnitTest lintDebug assembleDebug bundleRelease \
--no-daemon --console=plain \
-Pandroid.aapt2FromMavenOverride=/tmp/aapt2
```

GymDelay ist eine unabhängige AppShelf-Veröffentlichung und keine offizielle Store-App. Die App-Logik wurde auf dem Build-System geprüft; ein echter Lauf auf einem physischen Gerät ist in diesem Paket nicht bestätigt.


## Web-App für iPhone, iPad und Mac

Auf der AppShelf-Detailseite führt **Web-App öffnen** zur vollständigen Browser-Version. Echte lokale Musikwiedergabe mit Pause, Vorbereitungs-Countdown und Fortsetzen desselben Songs. Wähle eine eigene Audiodatei. Safari kann fremde Musik-Apps nicht steuern; im Browser ist kein genauer Start bei Bildschirmsperre garantiert.

Safari auf iPhone/iPad: Teilen → Zum Home-Bildschirm. Auf Mac ab Safari 17: Ablage → Zum Dock hinzufügen. Nach dem vollständigen Erstladen offline nutzbar. Keine Anmeldung und keine Medien-Uploads. Browserdaten sind vom Android-Speicher unabhängig.

Das zusätzliche `GymDelay-1.0.0-web-source.zip` enthält alle Browser-Dateien und eine Anleitung mit den Plattformgrenzen. Android-APK und vorhandenes Android-Quellcode-ZIP bleiben unverändert.
