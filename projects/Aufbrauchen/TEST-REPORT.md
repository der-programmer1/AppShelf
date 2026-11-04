# Aufbrauchen 1.0.0 · Prüfbericht

Stand: 2026-11-04. Neue App auf Branch `codex/aufbrauchen-2026-11-04`, Ausgangspunkt `5469907`. Die Kategorien und Dateien der vier bestehenden Katalog-Apps werden nicht geändert.

## Lokal ausgeführt

- Android `testDebugUnitTest`: **21 Tests erfolgreich**, keine Fehler und keine übersprungenen Fälle. Darunter elf gemeinsame Android/Web-Datenszenarien.
- Web `npm test`: **21 Prüfungen erfolgreich**, darunter dieselben elf Datenszenarien.
- Browser `npm run test:browser`: **36 Prüfungen erfolgreich** in echtem Chromium und Linux WebKit, jeweils unter dem späteren AppShelf-Pfad.
- Android `lintDebug`, `assembleDebug`, `assembleRelease` und `assembleDebugAndroidTest`: erfolgreich. Der letzte Befehl baut die Instrumentierungstests; er ist kein ausgeführter Gerätetest.
- Signatur-/Paketprüfung: echte ZIP-basierte Android-APK mit `AndroidManifest.xml` und `classes.dex`, Paket-ID `de.appshelf.aufbrauchen`, Version 1.0.0/Code 1, minSdk 26, targetSdk 36, nicht debuggable, Backup über Android-System deaktiviert. Keine Internet-, Kamera-, Mikrofon- oder Standortberechtigung.

## Inhalt der Prüfungen

Mengen werden als ganze Tausendstel gespeichert. Die gemeinsamen Szenarien prüfen Teil- und Vollverbrauch, Überverbrauch, Archiv/Papierkorb/Wiederherstellung, Wiederöffnen, Zusammenführen gleicher Einkaufspositionen, Abhaken, atomare Übernahme in den Vorrat, Doppelausführung und veraltete Bearbeitungen. Zusätzliche Prüfungen decken Grenzen, Schaltjahre, Datumswechsel, JSON-Rundlauf, doppelte JSON-Schlüssel, Unicode, ungültige Daten, Kennungs-/Referenzkonflikte und Rückgängig ab.

Die Browserprüfungen bedienen die tatsächliche Oberfläche und verwenden echte JSON-Dateien und Downloads. Sie prüfen Neuladen mit gespeicherten Vorräten und Entwürfen, Mengen, Fehlermeldungen ohne Datenänderung, doppelte Formularübermittlung, Vorlagen ohne übernommenes altes Datum, Suche/Filter, Archiv und Papierkorb, Import/Export ohne Überschreiben sowie gleichzeitige Schreibvorgänge in zwei Fenstern. XSS-artige Notizen bleiben Text; es finden keine Daten-Uploads statt.

Für Offline-Tests wird der HTTP-Ursprung tatsächlich abgeschaltet. Nicht gecachte Abrufe müssen fehlschlagen; die installierte App muss weiter starten und Vorräte speichern. Chromium verwendet zusätzlich seinen Offline-Schalter. Linux WebKit verwendet die unterbrochene HTTP-Verbindung, weil sein Automatisierungs-Offline-Schalter Service-Worker-Navigationen blockieren kann. Keine Ersatzseite und kein erfundenes Analyseergebnis werden eingespeist.

## Veröffentlichung und Artefakte

Der Katalog erhält `Aufbrauchen-1.0.0.apk`, `Aufbrauchen-1.0.0-source.zip`, die vollständige PWA unter `demo/`, Anleitung und echte PNG-Vorschauen aus ausgeführten Browser-Sitzungen. Die Quellcode-Prüfung vergleicht sämtliche Archiv-Dateien mit Android-, Web-, Test- und Build-Quellen und prüft die exakte PWA-Kopie. Private Schlüssel, lokale Konfigurationen, Build-Verzeichnisse und absolute lokale Pfade sind ausgeschlossen.

Die vorhandenen AppShelf-Prüfungen und der Pages-Build bleiben aktiv. Ein eigener GitHub-Workflow führt Web- und Android-Prüfungen aus, einschließlich vier Instrumentierungstests im Android-Emulator. Erst erfolgreiche GitHub-Prüfungen geben den Merge zur Veröffentlichung frei; deren tatsächlicher Abschluss ist am Pull Request sichtbar und wird hier nicht durch einen nur kompilierten Test behauptet.

## Grenzen der Aussage

Keine physischen Android-Geräte, iPhones, iPads oder Macs verfügbar. Linux WebKit ersetzt keinen Safari-Gerätetest. Die App hat keine Kamera-, Audio- oder Cloud-Funktion und benötigt dafür keine nicht geprüfte Hardware oder Zugangsdaten. Sie führt keine Frischeprüfung durch und verspricht keine Hintergrundalarme. Es wurden keine Nutzerzahlen, Reichweiten, Werbekunden oder Einnahmen erfunden oder gemessen.
