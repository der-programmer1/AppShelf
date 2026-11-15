# Factory League – kostenloser Start und Betrieb

## Was du einrichten musst

Für den Start brauchst du weder Firebase noch einen kostenpflichtigen Render-Server. Die Website wird über den vorhandenen Sites-Zugang veröffentlicht. Cloudflare D1 speichert Accounts und Fabriken unabhängig von Worker-Neustarts dauerhaft. Ein Ablaufdatum wie bei einer zeitlich begrenzten Testdatenbank wurde nicht eingerichtet.

Auf der Website „Fabrik gründen“ wählen, Spielernamen und Passwort eingeben und den persönlichen Rettungscode sicher speichern. Auf Handy und Computer dieselben Zugangsdaten verwenden. Bei vergessenem Passwort: „Anmelden → Passwort vergessen?“ und den Rettungscode verwenden. Ohne Passwort und ohne Code ist keine automatische Kontowiederherstellung möglich.

## Kostenloser Betrieb

Keine kostenpflichtigen Render-Ressourcen sind Teil dieser Version. Es gelten die Kapazitätsgrenzen des vorhandenen Sites-Angebots. Bei Erreichen dieser Grenzen kann die Erreichbarkeit begrenzt werden. Eine spätere kostenpflichtige Erweiterung wird nicht automatisch als Teil dieser Einrichtung bestellt.

## Veröffentlichung und Updates

Die Sites-Quelle enthält `.openai/hosting.json` mit der bestehenden Projektkennung und `d1: "DB"`. Diese Kennung und Datenbankbindung beibehalten, damit Updates dieselbe Datenbank verwenden. Nicht für jedes Update eine neue Site erstellen.

Vor einem Update `npm ci`, `npm run check`, `npm run build` und `npm test` ausführen. In GitHub Actions laufen zusätzlich die Desktop- und Handy-Browserprüfungen. Dann den exakten Quellstand im Sites-Quellrepository speichern und das passende Buildpaket als neue Version veröffentlichen. Die D1-Migrationen gehören zum Paket. Keine lokalen Testdatenbanken hochladen.

Die erreichbare HTTPS-Adresse gehört in AppShelf als `webUrl`. Der Eintrag ist für Browser-Spiele ausgelegt. Die Portfolio-Karte und der Terminal-Eintrag verweisen auf das öffentliche Spiel beziehungsweise dessen AppShelf-Seite.

## Betrieb prüfen

`/health` muss `status: ok`, `database: ok`, `authentication: local` und `storage: D1` melden. Fabrikstände werden auf dem Server berechnet. Der Browser darf keine gültigen Kontostände oder Ränge vorgeben. Bei Verbindungsproblemen bleiben bestätigte Spielstände in D1 erhalten. Erneut versuchte Kaufanfragen verwenden dieselbe Kennung, damit ein bereits verarbeiteter Kauf nicht doppelt berechnet wird.

## Zusätzliche verschlüsselte Backups

Der geschützte Endpunkt `/api/admin/backup` exportiert Accounts, Fabriken und Kaufkennungen als konsistente JSON-Sicherung. Sitzungstokens werden nicht exportiert. `BACKUP_TOKEN` wird als Sites-Runtime-Secret gesetzt. Dieses Geheimnis nicht in Quellcode oder Chat kopieren.

Der optionale tägliche GitHub-Workflow benötigt unter **AppShelf → Settings → Secrets and variables → Actions**:

1. Variable `FACTORY_LEAGUE_URL`: die tatsächliche öffentliche HTTPS-Adresse.
2. Secret `FACTORY_LEAGUE_BACKUP_TOKEN`: denselben geheimen Wert wie `BACKUP_TOKEN` in Sites.

Der verbundene GitHub-Zugang konnte Actions-Secrets nicht verwalten. Dieser zusätzliche tägliche Offsite-Job bleibt deshalb deaktiviert, bis die beiden Einstellungen vollständig hinterlegt sind. Der eigentliche Spielbetrieb benötigt diese GitHub-Einstellungen nicht.

`scripts/remote-backup.mjs` lädt die Sicherung über HTTPS und verschlüsselt sie mit AES-256-GCM und dem öffentlichen RSA-Schlüssel aus `backup-public.pem`. Nur verschlüsselte `.flbackup`-Dateien werden als Artefakte gespeichert, sieben Tage lang. Der private Schlüssel bleibt außerhalb des Repositories bei dir.

## Backup entschlüsseln und wiederherstellen

Mit dem zuvor bereitgestellten privaten Schlüssel:

```bash
node scripts/decrypt-backup.mjs backup.flbackup Factory-League-Backup-Schluessel.pem backup.json
node scripts/backup-to-sql.mjs backup.json restored-factory.sql
```

Die Befehle überschreiben keine vorhandene Zieldatei. Der SQL-Export enthält Schema und validierte Datensätze für eine **neue, leere D1-Datenbank**. Er enthält keine Löschbefehle und keine alten Sitzungen. Erst nach Import, Prüfung der Datensätze und `/health` die wiederhergestellte Datenbank mit der Anwendung verbinden. Die bisherige Datenbank erhalten; keine ungeprüfte Sicherung in die laufende Datenbank importieren.

## Gestaltung und Daten

Fabrik und Maschinen sind eigene SVG-Zeichnungen. Lokale Schriften: Space Grotesk und IBM Plex Mono mit beigefügten OFL-Lizenzen. Die Vorschau vor der Anmeldung ist als solche gekennzeichnet. Die Rangliste zeigt ausschließlich tatsächliche Accounts. Keine Werbung, Analyse-Tracker, Zahlungsfunktionen oder erfundenen Spieler.
