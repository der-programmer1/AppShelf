# Factory League – Einrichtung und Betrieb

## Was du einrichten musst

Für Accounts brauchst du **keinen zusätzlichen Anbieter**. Spielername, Passwort und persönlicher Rettungscode reichen aus. Die Spielstände und gehashten Zugangsdaten liegen auf dem dauerhaften Render-Speicher.

Der Hosting-Blueprint ist unter `projects/Factory-League/render.yaml` im AppShelf-Repository vorbereitet. Für den Betrieb werden ein Render-Konto mit hinterlegter Zahlungsart und der ausgewählte Workspace „My Workspace“ benötigt. Die Anwendung erzeugt ihre Tabellen selbst.

## Dein eigener Spieleraccount

Auf der öffentlichen Website „Fabrik gründen“ wählen, Spielernamen und Passwort eingeben und den einmal angezeigten Rettungscode herunterladen. Verwende auf deinem Handy und Computer denselben Spielernamen, um dieselbe Fabrik zu öffnen.

Bei vergessenem Passwort: „Anmelden → Passwort vergessen?“ öffnen. Spielernamen, Rettungscode und neues Passwort eingeben. Den anschließend neu angezeigten Rettungscode speichern. Der alte Rettungscode und bisherige Anmeldesitzungen werden dabei ungültig.

## Tägliche Backups

Die Workflow-Datei `.github/workflows/factory-league-backup.yml` im AppShelf-Repository lädt täglich eine konsistente SQLite-Sicherung. Sie wird mit einem zufälligen AES-Schlüssel verschlüsselt; dieser wiederum mit deinem öffentlichen RSA-Schlüssel. Nur verschlüsselte `.flbackup`-Dateien werden als Actions-Artefakte hochgeladen. Sie bleiben sieben Tage verfügbar.

Für die einmalige Konfiguration:

1. `BACKUP_TOKEN` in der Render-Umgebung des Factory-League-Dienstes auf einen zufälligen geheimen Wert setzen. Derselbe Wert gehört in **AppShelf → Settings → Secrets and variables → Actions → Secrets** als `FACTORY_LEAGUE_BACKUP_TOKEN`.
2. Die öffentliche HTTPS-Adresse als Actions-Variable `FACTORY_LEAGUE_URL` hinterlegen.
3. Den öffentlichen Schlüssel als `projects/Factory-League/backup-public.pem` versionieren. Den privaten Schlüssel ausschließlich bei dir sicher aufbewahren, außerhalb des Repositories.
4. Unter **Actions → Factory League – encrypted backup → Run workflow** eine erste Sicherung starten. Ein erfolgreicher Lauf bietet ein verschlüsseltes Backup als Artefakt zum Download.

Die Einrichtung wird bei der automatischen Veröffentlichung vorgenommen, soweit die verbundenen Zugänge dies erlauben. Fehlt eine Einstellung, schlägt der Sicherungslauf mit einer konkreten Meldung fehl; er veröffentlicht keine unverschlüsselte Datenbank.

Ein Schlüsselpaar kannst du bei Bedarf selbst erzeugen:

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out factory-league-backup-private.pem
openssl pkey -in factory-league-backup-private.pem -pubout -out backup-public.pem
```

Ein neues Schlüsselpaar ersetzt die früheren Schlüssel nicht: Alte Backups benötigen weiterhin den damals verwendeten privaten Schlüssel.

## Backup entschlüsseln

Das verschlüsselte Artefakt herunterladen und entpacken. Auf einem Rechner mit Node.js:

```bash
node scripts/decrypt-backup.mjs backup.flbackup factory-league-backup-private.pem backup.sqlite
```

Der Befehl schreibt nur in einen neuen Dateinamen. Der private Schlüssel wird nicht ausgegeben und nicht an den Spielserver übertragen.

## Spielstände wiederherstellen

Eine Wiederherstellung setzt die Spieldaten auf den Zeitpunkt der Sicherung zurück. Verwendet wird stets eine neue Datei; die laufende Datenbank wird nicht überschrieben.

```bash
npm run restore -- backup.sqlite restored-factory.sqlite
```

Der Befehl prüft die SQLite-Integrität und entfernt alle gespeicherten Sitzungen. Spieler müssen sich nach der Wiederherstellung neu anmelden.

1. Die geprüfte `restored-factory.sqlite` mit dem von Render unterstützten SCP/SFTP-Zugang nach `/var/data/restored-factory.sqlite` übertragen. Die SSH-Adresse findest du im Render-Dashboard des Dienstes.
2. In dessen Environment-Einstellungen `DATABASE_PATH=/var/data/restored-factory.sqlite` setzen und neu deployen. Die neue Instanz öffnet diese Datei.
3. `/health`, Anmeldung, Fabrik und Rangliste prüfen. Die vorherige Datei bleibt erhalten.

Verwende für SQLite keine ungeprüfte Wiederherstellung eines Dateisystem-Snapshots. Die Sicherungen dieser Anwendung entstehen über die SQLite-Backup-Funktion und werden vor dem Einsatz geprüft.

## Updates und Fehlersuche

Änderungen unter `projects/Factory-League` werden durch den Factory-League-Workflow geprüft. Render veröffentlicht nach erfolgreichen CI-Prüfungen. Durch den dauerhaften Datenträger bleibt der Spielstand erhalten; während des Instanzwechsels kann die Website kurz nicht erreichbar sein.

- `/health` muss `status: ok`, `database: ok` und `authentication: local` melden.
- Bei Loginproblemen zuerst Spielernamen und Passwort prüfen; alternativ den persönlichen Rettungscode verwenden.
- Bei verlorener Verbindung keine Datenbankdatei löschen. Nach Rückkehr der Verbindung wird der Fortschritt vom Server geladen.
- Speicherbelegung, Serverauslastung und Bandbreite im Render-Dashboard beobachten. Der vorgesehene Basistarif ist eine Startkonfiguration, kein automatisches Skalierungsbudget.
