# LeistenPlan

Du baust ein Regal, teilst eine Schublade ein oder bastelst mit Rundstäben?
Oft hast du lange Leisten gekauft und brauchst daraus mehrere kurze Stücke.
LeistenPlan zeigt dir einen Vorschlag, welche Stücke auf welche ganze Leiste
passen, wie viele Leisten dabei verwendet werden und welche Reste übrig bleiben.

## Drei konkrete Anwendungen

- **Regal bauen:** Die Auflageleisten unter den Regalböden brauchen verschiedene
  Längen. Trage alle Stücke ein und sieh ihre Verteilung auf die gekauften Leisten.
- **Schublade unterteilen:** Du benötigst mehrere kurze Trennleisten. Lass dir
  anzeigen, welche Stücke du aus den gleich langen Rohleisten erhalten kannst.
- **Mit Rundstäben basteln:** Du brauchst viele gleich lange Stäbchen. Mengen
  wie `250 x 8` ersparen das wiederholte Eingeben derselben Länge.

Verwende pro Projekt Leisten derselben Rohlänge und desselben Querschnitts.
Die App plant nur Längen; Platten, Winkel- oder Gehrungsschnitte sind nicht enthalten.

## Ein Beispiel zum sofortigen Verstehen

Du hast **2,5 Meter lange Leisten** und brauchst je zwei Stücke mit **120 cm,
60 cm und 40 cm**. Mit 3 mm Schnittbreite zeigt das Regal-Beispiel **zwei Leisten**,
582 mm Rest und 18 mm Schnittverlust. Tippe beim App-Start auf
**Regal-Beispiel ausprobieren**, um genau diesen Plan zu sehen. Die Werte sind
gekennzeichnete Beispiele und müssen für dein eigenes Material angepasst werden.

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

Android 8.0 oder neuer ist erforderlich. Lade `LeistenPlan-1.0.1.apk` herunter,
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
`LeistenPlan-1.0.1-source.zip`. LeistenPlan ist ein persönliches, unabhängiges
AppShelf-Projekt und keine offizielle Store-App.
