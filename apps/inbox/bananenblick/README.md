# Bananenblick

Bananenblick schätzt die sichtbare Schalenreife von Bananen ein. Beim Einkauf oder zu Hause lässt sich damit ausprobieren, ob eine Schale eher unreif, reif oder überreif aussieht. Die Auswertung läuft lokal im Browser.

[Web-App öffnen](https://der-programmer1.github.io/Bananenblick/) · [Öffentlicher Quellcode](https://github.com/der-programmer1/Bananenblick)

## Erste Schritte

1. Die Web-App in einem aktuellen Chrome oder Safari öffnen.
2. „Kamera starten“ wählen und die Rückkamera freigeben. Eine gut beleuchtete Banane ruhig ins Bild halten.
3. Die angezeigte Einstufung prüfen. Bei Unsicherheit näher oder seitlich aufnehmen.
4. „Scan beenden“ stoppt die Kamera. Alternativ lassen sich die eingebauten Beispielbilder ohne Kamerafreigabe ansehen.

## Aktueller Stand

Der AppShelf-Link öffnet die bestehende öffentliche Version **0.1.0**. Sie ist ein Forschungsprototyp; die Erkennung überlappender Büschel ist noch unzuverlässig. Die sichtbare Schalenreife ist keine Beurteilung von Verderb oder innerer Lebensmittelqualität.

Das Update mit nummerierten Einzelbananen, verknüpfter Ergebnisliste und drei aufeinanderfolgenden Reifebestätigungen befindet sich in [Bananenblick-PR #1](https://github.com/der-programmer1/Bananenblick/pull/1). Dessen Fototest erreicht derzeit 85,7 % Präzision und 6,3 % Recall bei Zielwerten von mindestens 95 % und 80 %. Es ist noch nicht veröffentlicht. Echte Android-/iPhone-Geräteprüfungen stehen aus.

Die Vorschaubilder wurden aus dem unveränderten öffentlichen Quellstand `89c626e` von Version 0.1.0 im Browser aufgenommen. Die neue Büschelfunktion wird darauf nicht als verfügbar dargestellt. Das Beispielbild stammt aus dem Mendeley Banana Ripeness Stage Dataset von Rohit et al. (2026), CC BY 4.0; die Herkunft ist auch in der Web-App ausgewiesen.

## Daten und Verbindung

Kamerabilder werden weder hochgeladen noch gespeichert. Das erste Laden benötigt eine Verbindung für Website, Modell und lokale Laufzeit. Die Browserfreigabe kann jederzeit beendet oder in den Website-Einstellungen widerrufen werden. Dieser Eintrag enthält keine Android-APK und veröffentlicht keine private Sites-Version.
