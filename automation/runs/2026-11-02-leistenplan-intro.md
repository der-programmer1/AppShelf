# LeistenPlan 1.0.1: Zweck und Anwendungsfälle erklären

Dieses vom Nutzer angeforderte Update erläutert die bereits veröffentlichte App. Es ist keine zweite neue App und ersetzt nicht die Recherche für eine zusätzliche App im nächsten geplanten Nachtlauf.

## Konkretes Problem

Die bisherige Startüberschrift „Deine Längen. Ein klarer Plan.“ und die AppShelf-Beschreibung setzten voraus, dass Leser bereits wissen, was mit Leisten und Zuschnitt gemeint ist. Ein erstmaliger Nutzer braucht stattdessen eine Situation, ein erkennbares Ziel und einen sofort ausprobierbaren Ablauf.

## Änderung

- Einstieg mit „Welche Stücke passen auf deine Leisten?“ und Erklärung ganzer Leisten, kurzer Teile und Reste.
- Konkrete Beispiele: Regal-Auflageleisten, Schubladenteiler und Bastelstäbe.
- „Regal-Beispiel ausprobieren“ lädt einen ausdrücklich gekennzeichneten Fall und berechnet den echten Plan. „Eigene Maße eingeben“ führt zum Formular.
- Zentimeter-/Meterbeispiele erläutern die Millimetereingabe; Schnittbreite wird als Materialverlust durch das Sägeblatt erklärt.
- Nach einer bewussten Berechnung wird das Ergebnis sichtbar. Beim Wiederöffnen bleiben Angaben und Plan erhalten, während der Einstieg weiterhin erreichbar und zuerst sichtbar ist.
- Das Ersetzen vorhandener Maße durch Beispieldaten verlangt eine Bestätigung.
- AppShelf-Beschreibung, Notizen und Nutzer-README erklären dieselben Situationen und Schritte. Die Screenshot-Vorschau zeigt die tatsächliche Oberfläche.

Die Berechnung selbst und ihre Grenzen bleiben identisch. VersionCode 2 / VersionName 1.0.1 erlaubt das Android-Update. Der Verpackungsschritt leitet die Artefaktnamen aus der App-Version ab; vollständiger Quellcode und Tests bleiben Bestandteil des Downloads.

## Nachweis

Lokal sind 20 JVM-Tests, Android Lint und die APK-Builds sowie fünf tatsächlich ausgeführte Android-Tests erfolgreich. Die beiden zusätzlichen Gerätetests prüfen die sichtbare Erklärung mit aktivem Regal-Beispiel und die Bestätigung/den Abbruch vor dem Ersetzen vorhandener Angaben. Der erste Geräteaufruf fand keinen verbundenen Emulator; das wurde als nicht ausgeführter Gerätetest behandelt und das Testgerät neu gestartet. Keine App-Prüfung wird deshalb als bestanden behauptet.


## Sichtprüfung und Update

Die APK wurde auf dem dedizierten Testgerät regulär über Version 1.0.0 installiert. Das Signierzertifikat ist identisch; das vorher mit echten Touch-Aktionen gespeicherte Projekt und sein korrektes Ergebnis blieben erhalten. Beim Start waren Zweck und alle drei Anwendungsfälle sichtbar. Das Regal-Beispiel führte nach ausdrücklicher Bestätigung zum erwarteten Plan mit zwei Leisten, 582 mm Rest und 18 mm Schnittverlust. Beim manuellen Test musste der Selektor für die vom nativen Dialog großgeschriebene Schaltfläche „BEISPIEL LADEN“ korrigiert werden; danach wurde der Ablauf fortgesetzt und geprüft.

[Startansicht](2026-11-02-evidence/intro.png) · [berechnetes Beispiel](2026-11-02-evidence/guided-result.png) · [sichtbarer Ablauf und Update](2026-11-02-evidence/ui-result.json) · [20 JVM-Tests](2026-11-02-evidence/unit.json) · [5 Gerätetests](2026-11-02-evidence/device.json).

Katalogtests und lokaler Build sind mit Version 1.0.1 erfolgreich. Es bleiben zwei Apps; die neue Beschreibung, Notizen und README erklären Regal-Auflagen, Schubladenteiler und Bastelstäbe. Die beiden SVG-Vorschauen enthalten unveränderte echte Screenshots. Das Quellpaket stimmt mit allen 22 Projektdateien überein. Die alten 1.0.0-Downloads bleiben im ursprünglichen GitHub-Release erhalten; der aktive AppShelf-Eintrag verweist nach dem Merge auf 1.0.1.

Die künftigen Nightly-Anweisungen verlangen nun ebenfalls einen verständlichen Einstieg und konkrete Anwendungsfälle in App und AppShelf. Diese Verbesserung eines bestehenden Projekts zählt nicht als zusätzliche neue App.

## Artefakte

- `LeistenPlan-1.0.1.apk`: 912474 Bytes, SHA-256 `d743ac25120fedfc1e3a33726ddd1cac55881967495f2605d84c67ce4b2ee91d`.

- `LeistenPlan-1.0.1-source.zip`: 68501 Bytes, SHA-256 `352268c475f4f707c25702aa70d853b0090bdc59f2284837eefbac4c51366b29`.
