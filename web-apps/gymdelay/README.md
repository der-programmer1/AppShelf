# GymDelay im Browser

Der funktionale Web-Player zu GymDelay 1.0.0: eigene lokale Audiodatei wählen, Musik hören, 5/10/15/30/60 Sekunden wählen, laufenden Song pausieren und nach dem Countdown denselben Song an derselben Position fortsetzen. Abbrechen lässt ihn pausiert. Ein Songwechsel beendet den Countdown. Preset, Audio, Wiedergabeposition und Endzeit werden lokal in IndexedDB gespeichert. Dateien bis 100 MB, keine Übertragung oder Anmeldung.

**Plattformunterschied:** Ein Browser darf fremde Spotify-, Apple-Music- oder andere native MediaSessions weder lesen noch steuern. Diese Web-App steuert ausschließlich ihre selbst ausgewählte, ungeschützte Audiodatei. Die Media Session API stellt die eigenen Wiedergabekontrollen bereit. Es wird kein Zugriff auf fremde Apps vorgetäuscht. Für die Steuerung fremder Musik-Apps ist weiterhin die Android-App erforderlich.

Lass die App während des Countdowns sichtbar und den Bildschirm an. Browser können Timer im Hintergrund/bei Bildschirmsperre aussetzen. Die Endzeit bleibt gespeichert; nach einer längeren Unterbrechung oder einem Neuladen fordert ein verspäteter Start einen Fingertipp. Falls Safari automatisches Fortsetzen blockiert, erscheint eine echte Wiedergabeschaltfläche. Kein exakter Hintergrundstart wird versprochen.

Bereitstellung: Ordner `web/` auf einem statischen HTTPS-Server, keine Abhängigkeiten, kein Build. Lokal: `python3 -m http.server`, dann `http://localhost:8000/web/`. Installation iPhone/iPad: Safari → Teilen → Zum Home-Bildschirm; Mac Safari 17+: Ablage → Zum Dock hinzufügen. Nach dem vollständigen Erstladen funktioniert die Shell offline; die ausgewählte Audiodatei bleibt lokal. MP3, M4A, WAV und weitere vom konkreten Browser unterstützte Formate. DRM-Inhalte sind nicht unterstützt.

„Song und lokale GymDelay-Daten löschen“ entfernt gespeichertes Audio, Timer und Preset nach Bestätigung. Andere Apps bleiben unberührt. Private Sitzungen und Browser-Speicherbereinigung können Daten entfernen. Keine Kamera-, Mikrofon- oder Benachrichtigungsberechtigung. Kein Backend, keine Werbung, kein Tracking. Unabhängiges persönliches Projekt.

Quellen: `web-apps/gymdelay/` und `web-apps/shared/`. `python3 scripts/package-web-apps.py` erzeugt Katalogkopie und Web-Quellcode-ZIP; `--check` prüft die Vollständigkeit. Tests: `npm run test:web`, `npm run build`, `npm run test:web:browser`.
