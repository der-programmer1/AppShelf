# OriginCheck HTTPS-Backend

Persönlicher, zustandsloser Node.js-Dienst für die optionalen Cloud-Analysen. Kein fertig gehosteter Dienst wird mitgeliefert. Originalbilder und Video-Kontaktbögen werden im RAM verarbeitet und nicht dauerhaft gespeichert. Die Originalvideos verlassen den Client nicht.

## Einrichten mit Render

Das Repository enthält eine vorbereitete `render.yaml` im AppShelf-Stamm und einen tatsächlich baubaren Hosting-Container. Ein laufender öffentlicher Dienst entsteht erst, wenn du den Blueprint in deinem eigenen Render-Konto anlegst und deinen OpenAI-Key dort eingibst.

1. Bei [Render](https://dashboard.render.com/) mit GitHub anmelden und Zugriff auf `der-programmer1/AppShelf` erlauben.
2. **New → Blueprint** wählen, dieses Repository und den Branch `main` auswählen; Blueprint-Datei: `render.yaml`.
3. Render fragt nach `OPENAI_API_KEY`. Den Wert ausschließlich dort als Secret/Umgebungsvariable eintragen. Kein Wert steht im Blueprint (`sync: false`). Nicht an GitHub oder einen Chat übermitteln.
4. Den angezeigten kostenpflichtigen Dienst mit **0,5 CPU / 512 MB** in Frankfurt prüfen und anlegen. Er ist für laufenden Betrieb vorgesehen; kostenlose, einschlafende Dienste können den ersten Analyseaufruf verzögern. OpenAI-API-Verbrauch wird zusätzlich über dein OpenAI-Konto abgerechnet; ein ChatGPT-Abo enthält kein API-Guthaben.
5. Nach dem Deploy die von Render angezeigte öffentliche HTTPS-Service-URL kopieren. `/health` sollte bei vorhandener Konfiguration 200 liefern. Das bestätigt noch keinen erfolgreichen OpenAI-Aufruf; dafür muss zusätzlich ein echtes Medium analysiert werden.

Der Blueprint setzt Bild-/Kontaktbogen-Uploads auf 25.000.000 Bytes, maximal zehn Analyseversuche pro Minute und 45 Sekunden Timeout. Eine Instanz hält das globale Budget verbindlich. CORS für `https://der-programmer1.github.io` ist bereits eingebaut. Automatische Backend-Deployments warten auf erfolgreiche GitHub-Prüfungen. Die Web-App bekommt erst nach bestätigtem öffentlichem Test die echte Backend-URL als Standard.

Render verwaltet das öffentliche HTTPS-Zertifikat und leitet HTTP auf HTTPS um. Der Container nimmt Plattform-Anfragen an seinem internen HTTP-Port entgegen und reicht sie über **zertifikatsgeprüftes TLS** an den unveränderten, nur an Loopback gebundenen Node-Server weiter. Er vertraut keinen vom Client behaupteten Forwarded-Headern. Schlüssel/Zertifikat für die interne Verbindung werden bei jedem Containerstart frisch erzeugt und nie ins Image geschrieben. Das interne Zertifikat gilt zehn Jahre, wird bei jedem Neustart ersetzt und ist keine öffentliche Betreiberidentität. Der Containerport darf außerhalb einer TLS-terminierenden Hosting-Plattform nur privat für Entwicklung verwendet werden.

Der Container läuft ohne Root. Nginx schreibt weder Zugriffslogs noch gepufferte Medien auf Datenträger; der Node-Dienst behält seine vorhandenen Kontrollen und Speicherbereinigung. In der Hosting-Variante teilen alle Clients das konservative globale Zehn-Anfragen-Budget, weil der Node-Server nur den privaten Proxy sieht. Keine API-Schlüssel in Docker-Build-Argumenten, Images oder GitHub-Secrets hinterlegen.

Lokale Containerprüfung ohne OpenAI-Key:

```sh
docker build -t origincheck-hosting:0.1.0 backend
python3 backend/hosting/test_container.py
```

Diese Befehle werden aus dem OriginCheck-Projektverzeichnis ausgeführt. Die Tests prüfen einen echten Container und ein echtes PNG, erwarten ohne API-Key korrekt 503 und verwenden keine erfundene Analyse. Ein Render-Deployment oder eine Live-OpenAI-Analyse wird dadurch nicht behauptet.

Offizielle Grundlage, geprüft am 3. November 2026: [Render-Blueprint-Spezifikation](https://render.com/docs/blueprint-spec), [Render-TLS](https://render.com/docs/tls), [Environment Variables und Secrets](https://render.com/docs/configure-environment-variables), [Docker auf Render](https://render.com/docs/docker).

## Start

Node.js ab 22.23.0 verwenden. `npm ci --ignore-scripts` ausführen, `.env.example` nach `.env` kopieren und **serverseitig** die Werte setzen. `.env` niemals committen oder an den Browser verteilen. Ein wirklich gültiges, zum Betreiber-Host passendes TLS-Zertifikat und sein privater Schlüssel müssen außerhalb veröffentlichter Artefakte vorhanden sein.

| Variable | Bedeutung / Standard |
| --- | --- |
| `OPENAI_API_KEY` | Ausschließliche Quelle des OpenAI-Schlüssels; leer ergibt 503 ohne erfundenes Ergebnis |
| `OPENAI_MODEL` | `gpt-4.1-mini`, verfügbares bildfähiges Responses-Modell verwenden |
| `PORT` | TLS-Port 8443 |
| `BIND_HOST` | `127.0.0.1`; für beabsichtigte externe Erreichbarkeit bewusst ändern und absichern |
| `TLS_CERT_FILE` / `TLS_KEY_FILE` | Eigene Zertifikat-/Schlüsseldateien, erforderlich, keine Dateien mitgeliefert |
| `MAX_UPLOAD_BYTES` | 25000000, darf verkleinert, aber nicht über das Bildlimit erhöht werden |
| `RATE_LIMIT_PER_MINUTE` | 10, global **und** pro Socket-IP, feste Minutenfenster |
| `REQUEST_TIMEOUT_MS` | 45000, zulässig 20–120000; Clients brechen nach etwa 50 Sekunden ab |

`npm start` lädt die lokale `.env`, startet echtes HTTPS mit mindestens TLS 1.2 und schreibt nur eine allgemeine Startmeldung. Fehlerprotokolle enthalten keine geheimen Werte. Kein HTTP-Fallback, keine vertrauenswürdige Behandlung beliebiger Forwarded-Header. Bei einem Reverse Proxy muss auch die Verbindung zum Node-Dienst TLS verwenden. Zugelassener Browser-Ursprung ist ausschließlich `https://der-programmer1.github.io`, OPTIONS-Preflights werden unterstützt. Ein anderer eigener Web-Ursprung erfordert eine bewusste Anpassung dieser Allowlist; CORS ist keine Authentifizierung.

Ohne API-Key sind echte TLS-Healthchecks möglich, die Analyse bleibt gesperrt. Ein konfigurierter Healthcheck prüft die Anwesenheit des Schlüssels, nicht seine Gültigkeit. In Version 1 gibt es keine Nutzerkonten oder API-Authentifizierung. Für einen größeren öffentlichen Dienst zusätzliche Betreibermaßnahmen gegen Missbrauch, finanzielle Limits und Überlastung vorsehen. Der eingebaute globale Grenzwert, maximal zwei parallele Analysen, Körper-/Headerlimits und Timeouts begrenzen den persönlichen Pilotbetrieb.

## API

- `GET /health`: 200 mit `providerConfigured:true` bei vorhandener Konfiguration, sonst 503 mit `error.code:backend_not_configured` / `Analyse-Backend nicht konfiguriert`. `providerConnectivity:not_tested` verspricht keinen Live-Test.
- `POST /v1/analyze`: rohe JPEG-/PNG-/WebP-Bytes als Requestbody, passender `Content-Type`, maximal 25 MB. **Kein Multipart-Formular**. Header `X-OriginCheck-Consent: yes` erforderlich. Der Client zeigt diese Zustimmung vorher ausdrücklich an; ein Header allein beweist keine menschliche Einwilligung.
- Bilder können optional `X-OriginCheck-Context` mit Base64url-JSON `{"kind":"image"}` senden. Für Video-Kontaktbögen ist `Content-Type:image/jpeg` und dieser Kontext erforderlich: `{"kind":"video_contact_sheet","originalBytes":12345,"durationSeconds":3,"frameTimes":[0.25,0.75,1.25,1.75,2.25,2.75]}`. Das Backend prüft sechs verschiedene gleichmäßig verteilte Zeitpunkte, maximale Dauer und gemeldete Originalgröße; die Originalvideodaten liegen absichtlich nicht auf dem Server. Diese Client-Angaben können serverseitig nicht unabhängig am Original verifiziert werden. Kein Beweis vollständiger Videoanalyse.
- `POST /v1/analyze-link`: JSON `{"url":"öffentliche HTTPS-Bild-URL"}`, Content-Type application/json und derselbe Zustimmungsheader. Nur direkte öffentliche JPEG-/PNG-/WebP-Bildressourcen, keine HTML-Auswertung, Cookies oder Plattform-Logins. DNS und Redirect-Ziele werden vor jedem Abruf vollständig auf öffentliche IPs geprüft und am TLS-Socket fixiert. Privates/reserviertes Netz, Sonderports und Zugangsdaten werden gesperrt. Bei ausgehendem HTTP(S)-Proxy wird dieser Abruf sicher abgelehnt; dann Datei hochladen. Die OpenAI-Verbindung unterstützt den konfigurierten Umgebungsproxy mit normaler Zertifikatsprüfung.

Erfolgsantwort: `schemaVersion:1`, einer der vier dokumentierten `verdict`-Werte, `confidenceBand`, deutsche `summary`, `signals:[{title,status,explanation}]`, `limitations:[string]`, ISO-`analyzedAt`, `providerStatus:ok`. Kein Endpoint liefert einen angeblichen Erfolg ohne gültige Providerantwort. Unkalibrierte visuelle Befunde werden auf **niedrig** begrenzt. Fehler liefern `{error:{code,message}}`, etwa 400 Zustimmung/ungültige URL, 413 Größe, 415 MIME/Signatur, 422 nicht unterstützter Link, 429 Rate-Limit/Parallelität, 502 ungültiger Provider, 503 fehlender Schlüssel, 504 Timeout. `Retry-After:60` bei Ratelimit.

Alle Social-Media-Seiten und Videolinks sind mangels eingerichteter offizieller Plattform-API/oEmbed in 0.1.0 nicht unterstützt. Der Nutzer erhält den dokumentierten Hinweis, stattdessen die Datei zu teilen. Es gibt kein Scraping und keine privaten Inhalte.

## Anbieter, Datenschutz und Tests

`provider.js` verwendet die offizielle OpenAI Responses API mit Bildinput und striktem JSON-Schema. Der Schlüssel wird ausschließlich aus `OPENAI_API_KEY` in der Backend-Umgebung gelesen. Kein Key wird generiert oder mitgeliefert. `store:false` verhindert Responses-Speicherung; mögliche Missbrauchsprotokolle des Anbieters können nach dessen Datenbedingungen bis zu 30 Tage bestehen. API-/Hosting-Kosten und Modellzugang verantwortet der Betreiber. Alle Grenzen und Quellen stehen in der übergeordneten README.

`npm test` prüft den Dienst über echte lokale TLS-Verbindungen mit eigens erzeugtem, temporärem Testzertifikat. Der Testprovider und die Testtransportantworten sind explizite Vertragstestdaten, keine Live-OpenAI-Analyse. OpenSSL muss für diese Tests installiert sein. Testzertifikate werden nach dem Test entfernt. `node --check server.js` prüft die Syntax. Ohne echten API-Key darf kein bestandener Live-Anbietertest behauptet werden.
