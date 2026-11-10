# Logic-Cam

Dein Papier. Deine Logik. Ein lokales Browser-Labor für digitale Schaltungen mit Kamera-AR, Touch-Sandbox und Logic Coach.

## Direkt ausprobieren

Die Web-Demo startet ohne Anmeldung und ohne Kamerazugriff mit einer bedienbaren Beispielschaltung. Tippe auf A, B und C: Grün bedeutet HIGH / 1, Rot bedeutet LOW / 0, Grau bedeutet unbekannt. Wähle ein Gatter für die Wahrheitstabelle oder öffne den Coach für eine passende Frage.

Die App unterstützt AND, OR, NOT, XOR, NAND und NOR. In der Sandbox kannst du Knoten platzieren, verschieben, verbinden und entfernen. Schaltungen lassen sich lokal als JSON laden und speichern. Browser-Zeichnungen und klare Papier-Symbole können über die gebündelte OpenCV-Datei analysiert werden.

## Kamera und Papier

Kamerazugriff braucht HTTPS und deine Erlaubnis. Verwende zum Einstieg die Druckvorlage im App-Menü. Die Erkennung erwartet große, geschlossene ANSI-Symbole von links nach rechts und interpretiert durchgehende Leitungskreuzungen als Verbindungen. Es gibt keine Garantie für beliebige Handschrift oder Perspektiven. Erkennungsvorschläge sind korrigierbar; die manuelle Sandbox funktioniert unabhängig davon.

## Lokale Verarbeitung

Kamerabilder werden nicht hochgeladen. Schaltungsberechnung und regelbasierter Coach arbeiten ohne Konto, API oder Backend. Der Offline-Cache lädt auch OpenCV lokal. Die AppShelf-Demo verwendet ausschließlich lokale Styles; das portable Quellcode-ZIP enthält zusätzlich die gewünschte optionale Tailwind-CDN-Einbindung.

## Quellcode

`logic-cam-source.zip` enthält den vollständigen, unabhängig als GitHub Pages betreibbaren Quellcode, Lizenzen, Anleitung und Tests. Im Repository liegt die bearbeitbare Version unter `projects/Logic-Cam/`. Mit `python3 projects/Logic-Cam/scripts/package.py` werden Demo und ZIP aktualisiert; `--check` prüft ihre Übereinstimmung.

Der lokale Coach ist regelbasiert und verwendet kein generatives KI-Modell. Die Darstellung wird im Browser geprüft; eine Hardwareprüfung mit echten Smartphone-Kamerabildern steht noch aus.
