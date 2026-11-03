# Prüfung der AppShelf-Web-Apps · 2026-11-03

Katalogbasis: Commit `1ae35b6` auf `main`, einschließlich des neuen GymDelay-Eintrags und ohne den vom Eigentümer entfernten LeistenPlan-Eintrag. Umsetzung auf `codex/web-apps-2026-11-03`.

## Ergebnisse

| Prüfung | Ergebnis |
| --- | --- |
| `npm ci --ignore-scripts` | Erfolgreich, gesperrte Abhängigkeiten installiert |
| `npm test` | Erfolgreich: Katalog-/Artefaktprüfung, Katalog-Buildtest, 23 Neuigkeiten-Tests sowie 19 neue Modell-/Formatprüfungen |
| `npm run build` | Erfolgreich: vier veröffentlichte Apps, alle vier mit vollständigem Web-Einstieg |
| `npm run test:web:browser` | 38 erfolgreiche Prüfungen in Chromium und Linux WebKit |
| `npm run test:browser` | 18 erfolgreiche Prüfungen für Website, Neuigkeiten, Tastatur und mobile Layouts in beiden Engines |
| OriginCheck `npm test` / Backend `npm test` | 11 Web-Regeltests und 21 Backend-Vertragstests erfolgreich |
| OriginCheck `npm run test:browser` | 16 erfolgreiche Browserprüfungen inklusive Bildauswahl, sechs echten Video-Frames, Zustimmungsprüfung, Fehlerzuständen und Offline-Shell |
| `python3 scripts/package-web-apps.py --check` | Drei vollständige Katalogkopien und drei lesbare, vollständige Web-Quellcode-ZIPs bytegenau geprüft |
| Weiter / OriginCheck `scripts/package.py --check` | Bestehende Android-Quellcode-ZIPs (31 bzw. 61 Dateien) unverändert gültig; OriginCheck-PWA unverändert synchron |
| `node projects/OriginCheck/scripts/check-catalog.mjs` | Bestehender OriginCheck-Eintrag einschließlich APK/ZIP/PWA vollständig vorhanden |
| Bestehende APKs, AABs und Android-Quellcode-ZIPs | Alle zehn Dateien bytegenau gegen die aktuelle Hauptbranch-Basis verglichen: unverändert |

## Was die neuen Browserprüfungen tatsächlich tun

Weiter: Gedanken und Entwurf speichern, nach Neuladen wiederfinden, Bearbeitung fortsetzen, klären, Heute/Parkplatz, erledigen/wieder öffnen, Papierkorb/Undo, echte PNG- und PCM-WAV-Anhänge, JSON herunterladen/lesen/importieren, ungültigen Import ohne Änderung abweisen, Fokus-Endzeit nach Neuladen prüfen, geteilten Text als sicheren Text darstellen, fällige Erinnerung anzeigen, lokale Daten löschen und Sicherung zurückspielen. In Chromium wird zusätzlich eine echte Opus-WebM-Testdatei lokal in Android-kompatibles PCM-WAV umgewandelt. Mikrofonverweigerung beziehungsweise fehlende Aufnahme-API blockieren Texte und Dateien nicht.

SehPlus: Testlabor, Filterausgabe gegen Original vergleichen, Pipette auf tatsächlichen Bildpixeln, Zwei-Farben-Vergleich, echte Bildauswahl, Memo mit HTML-artigem Namen ohne Skriptausführung, Persistenz/Löschung, neutrale Lichtkalibrierung und Zurücksetzen, Whiteboard-Modus, Kameraverweigerung, echtes MP4 mit Zeitpunktauswahl und herunterladbarem PNG.

GymDelay: tatsächliche PCM-WAV-Datei lokal auswählen, Wiedergabe starten/pausieren, echten Fünf-Sekunden-Countdown ablaufen lassen, denselben Song fortsetzen, Abbrechen, Preset/Datei/Countdown nach Neuladen, Songwechsel beendet alten Countdown, lokale Audiodaten löschen. Audiodatei und Metadaten werden atomar in getrennten IndexedDB-Einträgen gespeichert; das vermeidet den bei Linux WebKit beobachteten Blob-/File-Speicherfehler.

Alle neuen PWAs: korrekter Service-Worker-Scope, Manifest und PNG-Icon, Layouts mit 320/390/768/1280 Pixeln, vollständig geladene Shell bei anschließend tatsächlich abgeschaltetem HTTP-Ursprung erneut öffnen und weiterbenutzen. Ein nicht gecachter Testabruf muss dabei wirklich fehlschlagen. Chromium verwendet zusätzlich den Offline-Schalter des Browsers. Linux WebKit verwendet die unterbrochene HTTP-Verbindung, weil dessen Playwright-Offline-Schalter sogar Service-Worker-Navigationen mit einem internen Browserfehler blockiert. Es gibt dabei keine Ersatz-HTML-Seite und kein Mock-Netzwerk, das eine App-Antwort liefert.

Die PNG-Vorschauen `screenshots/02-web.png` stammen aus diesen tatsächlichen Chromium-Sitzungen. Weiter-Daten sind eigens im Test angelegte Beispiele; SehPlus zeigt ein ausdrücklich synthetisches Testlabor-Motiv.

## Nicht als getestet ausgegeben

- Keine physischen iPhones, iPads, Macs oder Android-Geräte verfügbar. Linux WebKit ist keine tatsächliche Safari-Geräteprüfung.
- Kein echtes Kamerabild, keine reale Mikrofonaufnahme und keine Hardware-Taschenlampe geprüft. Geräteberechtigungen, Aufnahme-Codecs und PWA-Installation sind auf dem Zielgerät zusätzlich zu prüfen. Synthetische Dateien und Formatkonvertierung wurden tatsächlich verarbeitet.
- Kein gesperrtes Apple-Gerät und kein garantierter Hintergrundalarm getestet. Safari kann fremde Musik-Apps nicht steuern und keine garantierten lokalen Alarme bei geschlossener Web-App ausführen. Diese Grenzen sind in Oberfläche, Katalogbeschreibung und Anleitungen genannt.
- Kein neuer öffentlicher OriginCheck-Backend-Host und keine echte OpenAI-Analyse eingerichtet. Die vorhandenen Backend-Prüfungen verwenden ausdrücklich Testprovider und behaupten keinen Live-Erfolg. Die OriginCheck-Web-App zeigt bei fehlendem Backend weiterhin einen klaren Fehler.
- Die Android-Projekte wurden für diese Web-Ergänzung nicht geändert; ein neuer Android-Geräte- oder Emulatorlauf wird durch diesen lokalen Bericht nicht behauptet. Die vorhandenen GitHub-Prüfungen bleiben aktiv.

## Neue Browser-Artefakte

- `apps/inbox/weiter/Weiter-1.0.0-web-source.zip` und `apps/inbox/weiter/demo/`
- `apps/inbox/sehplus/SehPlus-1.6.2-web-source.zip` und `apps/inbox/sehplus/demo/`
- `apps/inbox/gymdelay/GymDelay-1.0.0-web-source.zip` und `apps/inbox/gymdelay/demo/`

Keine API-Schlüssel, privaten Dateien oder lokalen absoluten Dateipfade werden für diese Web-Apps benötigt. Die drei zusätzlichen PWAs verwenden weder CDN noch externe Laufzeitpakete und übertragen keine Medien. OriginCheck bleibt bei seiner ausdrücklich zustimmungspflichtigen Backend-Kommunikation.
