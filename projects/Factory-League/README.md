# Factory League

Baue eine dauerhafte Fabrik, verbessere ihre Engpässe und kämpfe auf einer gemeinsamen Rangliste um den höchsten Produktionswert. Drei feste Linien: Metall, Elektronik und Robotik. Die Fabrik produziert nach jedem Besuch bis zu 24 Stunden offline weiter. Es gibt keine saisonalen Neustarts.

## Kostenloser Start

Version 1.1 verwendet **OpenAI Sites mit Cloudflare Workers und einer dauerhaften D1-Datenbank**. Ein kostenpflichtiger Render-Server, eine Zahlungsart bei Render und Firebase sind nicht erforderlich. Es wurden keine kostenpflichtigen Render-Ressourcen angelegt. Es gelten die Kapazitätsgrenzen des vorhandenen Sites-Zugangs; Hosting ist nicht unbegrenzt.

Die Oberfläche ist die bestehende React-Anwendung. Die serverseitigen Spielregeln, Serverzeit und gemeinsame Rangliste bleiben erhalten. Geldbeträge werden als exakte Dezimalzeichenketten gespeichert und mit BigInt berechnet. Optimistische Revisionen und atomare D1-Batches verhindern verlorene Änderungen und doppelte Kaufbuchungen. Auch wiederholte Anfragen mit identischer Kennung werden nur einmal berechnet.

## Accounts

Spielername und Passwort genügen. Bei der Registrierung erscheint ein persönlicher Rettungscode. Speichere ihn, um bei vergessenem Passwort wieder an deine Fabrik zu kommen. Nach einer Passwortrettung werden der Code und alle früheren Sitzungen ungültig; der Spielstand bleibt erhalten.

Passwörter werden serverseitig mit PBKDF2-SHA-256, 100.000 Durchläufen und einem zusätzlichen geheimen Serverschlüssel und individuellem Zufallssalz gehasht. Rettungscodes und Sitzungstokens liegen ebenfalls nur als Hashes vor. HTTPS-Sitzungscookies sind HttpOnly, Secure und SameSite=Lax. Öffentliche Profile enthalten keine Accountkennungen, Geheimnisse oder privaten Creditkontostände.

## Entwicklung und Prüfungen

Node.js 24:

```bash
npm ci
npm run check
npm run build
npm test
```

`npm test` verwendet den echten Cloudflare-Worker-Simulator und eine D1-Datenbank. Geprüft werden unter anderem konkurrierende Käufe, identische Wiederholungen, getrennte Accounts, globale Rangliste, Offline-Obergrenze, Rettungscode-Rennen und Daten nach vollständigem Worker-Neustart. Der Simulator enthält eine ausschließlich lokale Zeitsteuerung; diese wird nicht in den Produktionsworker kompiliert.

Für Oberflächentests auf einer normalen Entwicklungsmaschine oder in GitHub Actions:

```bash
npx playwright install chromium
npm run build
npm run test:e2e
```

Die Sites-Umgebung dieser Sitzung hat keinen unterstützten Browser-QA-Zugang. Die Oberfläche war zuvor auf Desktop und Handy geprüft; für den neuen Worker werden hier API-, Speicher- und Buildprüfungen durchgeführt. Der GitHub-Workflow prüft die aktualisierte Kombination zusätzlich im Browser.

## Datenbank und Veröffentlichung

`.openai/hosting.json` bindet `DB`. Schema und Drizzle-Migrationen liegen in `db/` und `drizzle/`. Migrationen werden bei der Sites-Veröffentlichung eingespielt. Request-Handler legen keine Tabellen an. Bereits angewendete Migrationen nicht verändern; Schemaänderungen mit `npm run db:generate` als neue Migration hinzufügen.

`npm run build` erzeugt `dist/server/index.js`, ein Worker-ES-Modul mit eingebetteten Frontend-Assets, sowie die Hosting- und Migrationsmetadaten. Veröffentlichung über den vorhandenen Sites-Zugang; die AppShelf-Kopie dient als öffentlicher Quellcode. Im Produktivpaket liegen keine Passwörter, privaten Schlüssel, lokalen Datenbanken oder Test-Endpunkte.

[Betrieb, Backups und Wiederherstellung](BETRIEB.md)
