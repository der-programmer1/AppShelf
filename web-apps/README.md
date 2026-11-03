# Vollständige Browser-Apps im AppShelf-Katalog

Stand: 2026-11-03. Der aktuelle öffentliche Katalog enthält **GymDelay, SehPlus, Weiter und OriginCheck**. GymDelay wurde vor dieser Änderung neu hochgeladen. LeistenPlan wurde vom Eigentümer aus dem Katalog entfernt und wird nicht wiederhergestellt.

Alle vier Apps haben einen Einstieg **Web-App öffnen** auf der Detailseite. Das interne Feld `demoDir: "demo"` und die bestehenden URLs bleiben aus Kompatibilitätsgründen erhalten. Die ausgelieferten Seiten sind die tatsächlichen Web-Anwendungen; sie benötigen weder einen Entwicklungsserver noch simulierte Produktdaten.

| App         | Browser-Funktionen                                                                                                                                                                                                                                                              | Unterschiede zur Android-Plattform                                                                                                                                                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Weiter      | Inbox, Klar machen, Heute (drei nächste Schritte), Tagesfortschritt, Parkplatz, Erledigen/Wiederöffnen, Papierkorb/Undo, Foto-/Audioanhänge, Sprachnotizen, Fokus, Android-kompatibler JSON-Import/Export, lokale Erinnerungsprüfung                                            | Keine garantierten lokalen Alarme bei geschlossenem Safari. Verpasste Erinnerungen erscheinen beim Öffnen. Safari bietet kein eingehendes Web Share Target: Text einfügen und Dateien auswählen; unterstützende Browser können das mitgelieferte Share Target verwenden. |
| SehPlus     | Lokale Kamera/Bilder/Videos, fünf Filter, Stärke, Helligkeitsautomatik, Originalansicht, Pipette/Messfläche/Qualität, Lichtkalibrierung, zwei Farben vergleichen, Farbmemos, Farbkarte/Bild speichern, Video-Zeitpunkt, Zoom/Verschieben, sechs Testmotive, technischer Bericht | Kamera wird im Hintergrund beendet. ImageCapture/Taschenlampe/Haptik je nach Browser; ansonsten Vorschau-Standbild. Arbeitsauflösung maximal 1600 Pixel, Dateigrenze 200 MB. Codecs abhängig vom Gerät.                                                                  |
| GymDelay    | Lokaler Audioplayer, Pause/Countdown/Fortsetzen desselben Songs, 5/10/15/30/60 Sekunden, Abbrechen, gespeicherte Audiodatei/Position/Preset/Endzeit, eigene Media-Session-Kontrollen                                                                                            | Browser dürfen fremde Spotify-/Apple-Music-/Android-MediaSessions nicht steuern. Eigene ungeschützte Audiodatei erforderlich. Hintergrund und Bildschirmsperre können Countdown/Autoplay aussetzen; dann bewusster Fingertipp zum Fortsetzen.                            |
| OriginCheck | Bereits vorhandene Bild-/Video-/Linkanalyse, echte lokale Vorprüfung und sechs Video-Frames, Ergebnisse, Verlauf, Zustimmung und Backend-Einstellungen                                                                                                                          | Cloud-Analyse braucht weiterhin ein echtes HTTPS-Backend und einen serverseitigen Provider-Schlüssel. Keine erfundene Offline-KI oder automatische Backend-Bereitstellung durch diese Änderung.                                                                          |

Diese Grenzen stehen auch in den jeweiligen Anwendungen und auf den App-Seiten. Sie werden weder als erfüllte Betriebssystemfunktionen noch als erfolgreiche Gerätetests ausgegeben.

## Quellen und Artefakte

- `web-apps/weiter/`, `web-apps/gymdelay/`, `web-apps/sehplus/`: anwendungsspezifischer Code. SehPlus basiert auf der PWA aus dem vorhandenen 1.6.2-Android-Archiv und portiert `ColorAnalyzer.java`.
- `web-apps/shared/`: lokale IndexedDB-Transaktionen, sicherer DOM-Aufbau, Offline-Registrierung, gemeinsame Gestaltung für Weiter/GymDelay.
- `apps/inbox/<slug>/demo/`: vollständig eigenständig lauffähige PWA mit Manifest, echten PNG-Icons und auf diese App begrenztem Service Worker. Keine CDNs oder Laufzeitpakete nötig.
- `apps/inbox/<slug>/<Name>-<Version>-web-source.zip`: zusätzliches vollständiges Web-Quellcodearchiv, inklusive Hilfsdateien und Anleitung. Die ursprünglichen Android-APKs/AABs und Quellcode-ZIPs bleiben bytegenau erhalten.
- OriginCheck behält die vorhandenen Quellen unter `projects/OriginCheck/web/` und sein vorhandenes kombiniertes Quellcodearchiv.

Jede App hat einen eigenen lokalen Speicher und Cache. Service Worker cachen nur die eigene explizite Shell-Liste, weder ausgewählte Medien noch Aufgaben noch andere AppShelf-Seiten. Weiter exportiert Anhänge nur nach ausdrücklicher Sicherungsaktion. GymDelay speichert die ausdrücklich ausgewählte Audiodatei lokal für das Wiederöffnen. SehPlus hält Bilder/Videos ausschließlich im Arbeitsspeicher. Es gibt keine Synchronisierung zwischen Browser und Android; bei Weiter ist der bewusste JSON-Austausch möglich.

## Entwickeln und prüfen

```sh
npm ci --ignore-scripts
python3 scripts/package-web-apps.py
npm test
npm run build
npx playwright install --with-deps chromium webkit
npm run test:web:browser
npm run test:browser
```

Zum lokalen Ausprobieren den gebauten Katalog über einen statischen Server bereitstellen, zum Beispiel `python3 -m http.server --directory dist`. Kamera und Service Worker benötigen HTTPS oder localhost. Keine geheimen Umgebungsvariablen erforderlich. `python3 scripts/package-web-apps.py --check` verifiziert vollständige Spiegel und ZIP-Inhalte. Die generierten Service-Worker-Cacheversionen hängen vom tatsächlichen Inhalt ab. Neue Versionen aktivieren sich, nachdem alle App-Fenster geschlossen wurden; laufende Bearbeitungen werden nicht durch ein erzwungenes Update abgebrochen.

`npm test` prüft zusätzlich, dass jede veröffentlichte App einen Web-Einstieg hat. Für neue Katalog-Apps muss deshalb künftig ebenfalls eine funktionierende Web-Version hinzugefügt werden. Die GitHub-Prüfung führt die echten Browserabläufe nach dem Katalog-Build in Chromium und Linux WebKit aus. Das ist keine Prüfung auf echten iPhones/iPads/Macs. Physische Apple-Geräte und deren hardwareabhängige Kamera-, Mikrofon-, Installations- und Sperrbildschirmfunktionen bleiben separat zu testen.

Der vorhandene LeistenPlan-Android-Job prüft weiterhin den aufbewahrten Quellcode. Nur die Archivprüfung ist an einen tatsächlich veröffentlichten Katalogeintrag gebunden, damit die vom Eigentümer gelöschten Downloads nicht zurückgebracht werden müssen.
