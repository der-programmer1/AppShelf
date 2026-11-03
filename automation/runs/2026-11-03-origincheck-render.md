# OriginCheck: Render-Einrichtung vorbereiten

Es gibt weiterhin keine verbundene Hosting-Identität und keinen bereitgestellten OpenAI-Key in der Cloud-Arbeitsumgebung. Es wurde **kein öffentliches Backend-Deployment** behauptet, keine URL erfunden und keine Standard-Backend-Adresse in einen Client eingetragen.

Die konkrete Einrichtung ist nun im Repository vorbereitet: `render.yaml` im Stamm, tatsächlicher Docker-Build im Backend, ein ohne Root laufender Ingress und eine neue Containerprüfung. Render fragt mit `sync: false` nach `OPENAI_API_KEY`; im Repository steht ausschließlich der Name. Die einzelne Instanz nutzt den aktuellen Compute-Plan `0.5c-512mb` in Frankfurt. Dieser Dienst und OpenAI-API-Nutzung kosten Geld; die Preise werden vor dem Anlegen bei Render beziehungsweise im OpenAI-Konto geprüft.

Der unveränderte Node-Server akzeptiert weiterhin ausschließlich echtes TLS. Ein interner Proxy reicht Plattform-Anfragen über zertifikatsgeprüftes TLS an den nur auf Loopback erreichbaren Node-Port weiter. Private Schlüssel/Zertifikate entstehen erst beim Containerstart. Das öffentliche, automatisch erneuerte Zertifikat und die HTTP-zu-HTTPS-Weiterleitung verwaltet Render. Der interne Container-Eingang ist für eine TLS-terminierende Plattform vorgesehen, kein alleinstehender öffentlicher HTTP-Dienst.

Die Vorlage setzt zehn Analyseversuche pro Minute, 25.000.000 Upload-Bytes und 45 Sekunden Timeout. Alle Clients teilen in dieser Variante das globale Budget. Genau eine Instanz verhindert, dass parallele Instanzen das Budget vervielfachen. CORS bleibt auf die tatsächliche AppShelf-Origin beschränkt. Ingress-Pufferung und Zugriffslogs sind deaktiviert.

## Tatsächlich geprüft

- Echtes Docker-Image gebaut, ohne API-Key und ohne Session-Zertifikate in Image-Layern. Die optionale lokale Build-CA wird nur als BuildKit-Secret gemountet.
- Neun reale Containerprüfungen bestanden: HTTPS-Backend erreicht; ehrlicher 503 ohne Key; AppShelf-CORS und Preflight; fremde Origins gesperrt; Zustimmung erforderlich; echtes PNG erzeugt ohne Key kein Fake-Ergebnis; exaktes 25-MB-Limit; Ratelimit; keine temporären Medienpuffer oder Inhalts-/Zugriffslogs.
- 21 Backend-Tests bestanden, Syntaxprüfung `node --check server.js` und `bash -n hosting/entrypoint.sh` erfolgreich.
- Blueprint als YAML geparst; Secret-Eintrag besitzt keinen `value` und keine hartkodierten Zugangsdaten.
- Source-ZIP mit den zusätzlichen Backend-Hostingdateien neu gepackt und auf vollständige, bytegleiche Inhalte geprüft. Die Android-APK und bestehende Apps bleiben unverändert.
- Vor der Übergabe werden Katalog und PR-CI geprüft. Der tatsächliche GitHub-Status steht im zugehörigen PR; dieser Bericht behauptet keine zukünftigen CI-Ergebnisse.

Offen bleiben das Anlegen im eigenen Render-Konto, Hosting-Secret, die echte zugewiesene öffentliche URL und die Live-OpenAI-Analyse. Diese Schritte erfordern Kontozugang beziehungsweise die Eingabe des Schlüssels direkt beim Hosting-Anbieter. Der Schlüssel soll nicht in den Chat, in GitHub oder in die Arbeitsumgebung kopiert werden. Sobald die echte URL vorhanden ist, kann sie öffentlich getestet und anschließend als Web-Standard eingetragen werden.

Offizielle Grundlage am 3. November 2026: https://render.com/docs/blueprint-spec, https://render.com/docs/tls, https://render.com/docs/docker, https://render.com/docs/configure-environment-variables und https://nginx.org/en/docs/http/ngx_http_proxy_module.html.
