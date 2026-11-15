# Factory League – Einrichtung und Betrieb

## Was du einrichten musst

Für Accounts brauchst du **keinen zusätzlichen Anbieter**. Spielername, Passwort und persönlicher Rettungscode reichen aus. Die Spielstände und gehashten Zugangsdaten liegen auf dem dauerhaften Render-Speicher.

Der Hosting-Blueprint ist unter `projects/Factory-League/render.yaml` im AppShelf-Repository vorbereitet. Für den Betrieb werden ein Render-Konto mit hinterlegter Zahlungsart und der ausgewählte Workspace „My Workspace“ benötigt. Die Anwendung erzeugt ihre Tabellen selbst.

Falls Render `need_payment_info` meldet:

1. [Render Dashboard](https://dashboard.render.com) öffnen und „My Workspace“ auswählen.
2. In den Workspace-Einstellungen **Billing** öffnen und eine Zahlungsart hinterlegen. Zahlungsdaten bleiben bei Render.
3. Den bestehenden Blueprint **Factory League** erneut planen und anwenden. Falls du das selbst erledigst: Repository `der-programmer1/AppShelf`, Branch `main`, Blueprint-Datei `projects/Factory-League/render.yaml` verwenden.
4. Der vorgesehene Dienst kostet 7 US-Dollar pro Monat plus 0,25 US-Dollar für 1 GB Speicher, vor Steuern. Sobald der Deploy „Live“ meldet, die HTTPS-Adresse öffnen. Eine eigene Domain ist optional.

Der Blueprint wurde bereits angelegt. Ein fehlgeschlagener Plan erzeugt noch keinen laufenden Spielserver. Accounts benötigen nach erfolgreicher Veröffentlichung keine weiteren Schlüssel oder Freischaltungen.

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

Der verbundene GitHub-Zugang darf keine Actions-Secrets setzen (`HTTP 403`). Deshalb musst du das Geheimnis einmal selbst in GitHub hinterlegen. Kopiere den Wert direkt von Render nach GitHub; sende ihn nicht in den Chat. Solange die URL nicht gesetzt ist, bleibt der Sicherungsjob deaktiviert. Ist die URL gesetzt, aber ein Geheimnis fehlt oder ungültig, schlägt der Lauf mit einer konkreten Meldung fehl. Er veröffentlicht keine unverschlüsselte Datenbank.

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

## AppShelf und patrice-lab freischalten

Der vorbereitete AppShelf-Eintrag liegt unter `apps/inbox/factory-league`. Er bleibt als `draft` zurückgehalten, bis ein funktionierender Spielserver erreichbar ist. Nach erfolgreichem Deploy dessen tatsächliche HTTPS-Adresse als `webUrl` in `app.json` eintragen, `status` auf `published` setzen und die Hinweise zum ausstehenden Onlinebetrieb aktualisieren. Die Katalogprüfung unterstützt extern gehostete Browser-Spiele.

Die Portfolio-Karte, echte Vorschauaufnahme, Filter und Terminal-Eintrag sind im Portfolio-Entwurf vorbereitet. Erst nach Veröffentlichung des AppShelf-Eintrags freigeben und den Status auf öffentlich ändern. So entstehen keine Links auf ein noch nicht verfügbares Spiel.

## Geprüfter Stand

17 Server- und Spieltests sowie sechs Browserprüfungen für Desktop und Handy bestehen lokal und in GitHub Actions. Anmeldung, mehrere getrennte Spieler, gemeinsame Rangliste, Offline-Obergrenze und Passwortrettung sind geprüft. Zusätzlich wurde eine Sicherung über einen lokalen HTTPS-Endpunkt abgerufen, verschlüsselt, entschlüsselt und in eine neue SQLite-Datei wiederhergestellt. Produktionsstand und Account blieben erhalten, alte Sitzungen wurden entfernt.

Ein laufender Render-Spielserver und tägliche Backups sind damit noch nicht bestätigt: Dafür fehlen die Zahlungsfreigabe und die oben genannten GitHub-Einstellungen. Physische Handyprüfungen wurden nicht durchgeführt.

## Updates und Fehlersuche

Änderungen unter `projects/Factory-League` werden durch den Factory-League-Workflow geprüft. Render veröffentlicht nach erfolgreichen CI-Prüfungen. Durch den dauerhaften Datenträger bleibt der Spielstand erhalten; während des Instanzwechsels kann die Website kurz nicht erreichbar sein.

- `/health` muss `status: ok`, `database: ok` und `authentication: local` melden.
- Bei Loginproblemen zuerst Spielernamen und Passwort prüfen; alternativ den persönlichen Rettungscode verwenden.
- Bei verlorener Verbindung keine Datenbankdatei löschen. Nach Rückkehr der Verbindung wird der Fortschritt vom Server geladen.
- Speicherbelegung, Serverauslastung und Bandbreite im Render-Dashboard beobachten. Der vorgesehene Basistarif ist eine Startkonfiguration, kein automatisches Skalierungsbudget.
