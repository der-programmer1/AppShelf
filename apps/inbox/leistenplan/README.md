# LeistenPlan

Du brauchst mehrere Abschnitte aus gleich langen Leisten? LeistenPlan erstellt
auf deinem Android-Gerät einen Verteilungsvorschlag und zeigt für jede Leiste
die Abschnittslängen, den Schnittverlust und das verbleibende Reststück.

## So funktioniert es

1. Trage die verfügbare **Rohlänge** und die **Schnittbreite** in Millimetern ein.
   Die anfänglichen Werte sind Beispiele und müssen zu deinem Material passen.
2. Schreibe pro Zeile eine Abschnittslänge, zum Beispiel `600` oder `600 x 2`.
   Dezimalkomma und Dezimalpunkt sind mit einer Nachkommastelle möglich.
3. Wähle **Plan berechnen**. Die App verteilt die Abschnitte und zeigt die Bilanz.
4. Über **Plan als Text teilen** kannst du das Ergebnis an eine von dir gewählte
   App übergeben. Ohne diese Aktion wird nichts weitergegeben.

Das gekennzeichnete Beispiel kann zum Ausprobieren geladen werden. Es ist keine
Messung deines Materials. Unterstützt werden bis zu 20 ausgefüllte Zeilen und
insgesamt 100 Abschnitte aus einer einheitlichen Rohlänge.

## Speicherung und Berechtigungen

Die App benötigt keine Android-Berechtigungen, kein Konto und keine
Internetverbindung. Es gibt keine Werbung, Analyse oder versteckten
Netzwerkaufrufe. Berechnung und Projektangaben bleiben auf deinem Gerät.

Beim Berechnen und beim Verlassen der App werden deine Eingaben lokal gespeichert.
Nach dem Wiederöffnen wird der Plan aus diesen Werten erneut berechnet. Änderungen
an den Eingaben blenden den vorherigen Plan aus, damit kein veraltetes Ergebnis
weiterverwendet wird. **Neues Projekt** verlangt eine Bestätigung, bevor Angaben
entfernt werden. Beim Deinstallieren gehen die lokal gespeicherten Angaben verloren.

## Android installieren

Android 8.0 oder neuer ist erforderlich. Lade `LeistenPlan-1.0.0.apk` herunter,
öffne sie auf deinem Android-Gerät und bestätige die Installation. Android kann
bei einer APK außerhalb des Play Stores nach einer einmaligen Erlaubnis für diese
Installationsquelle fragen. Es handelt sich um einen installierbaren unabhängigen
Testbuild, nicht um eine über einen offiziellen Store geprüfte App.

## Grenzen

Der Plan ist ein sortierter Verteilungsvorschlag und nicht garantiert mathematisch
optimal. 2D-Platten, verschiedene Rohmateriallängen, Defekte, Endbeschnitt,
Einspannlängen und Maßtoleranzen werden nicht berücksichtigt. Prüfe die Maße und
deinen tatsächlichen Materialbedarf vor der Verwendung. Die App steuert keine
Maschine und enthält keine Bedienungsanleitung für Werkzeuge.

Zwischen zwei Abschnitten wird die angegebene Schnittbreite abgezogen. Für ein
verbleibendes Reststück wird zusätzlich der trennende Schnitt berücksichtigt.
Ist das letzte Material dünner als die Schnittbreite, wird nur dieses vorhandene
Material als Verlust gezählt. Ein Abschnitt mit exakt der Rohlänge braucht
keinen Schnitt. Die Bilanz ist immer: Abschnitte + Schnittverlust + Rest = Rohlänge.

## Quellcode und Projekt

Der vollständige Quellcode einschließlich Tests und Build-Anleitung liegt in
`LeistenPlan-1.0.0-source.zip`. LeistenPlan ist ein persönliches, unabhängiges
AppShelf-Projekt und keine offizielle Store-App.
