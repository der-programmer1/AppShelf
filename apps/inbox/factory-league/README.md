# Factory League

Baue deine Fabrik aus und arbeite dich auf einer gemeinsamen Rangliste nach oben. Drei feste Produktionsketten – Metall, Elektronik und Robotik – belohnen den gezielten Ausbau der jeweils langsamsten Maschine. Die gesamte produzierte Menge entscheidet über den Rang; ausgegebene Credits verringern den Punktestand nicht.

## Stand der Veröffentlichung

Quellcode, Oberfläche und automatische Tests sind bereit. Dieser Katalogeintrag bleibt bis zur Serverfreigabe ein Entwurf. Der öffentliche Spielserver wartet auf die Zahlungsfreigabe in Render. Einen Online-Spielen-Link ergänzen wir nach erfolgreicher Freischaltung und Prüfung. Die Screenshots zeigen die ausdrücklich gekennzeichnete Vorschau.

## Anmeldung und Spielstand

Spielername und Passwort genügen. Bei der Registrierung erhältst du einen persönlichen Rettungscode zum Wiederherstellen deines Kontos. Speichere ihn sicher. Firebase, eine E-Mail-Adresse oder ein zusätzlicher Kontodienst werden nicht benötigt.

Die Fabrik bleibt dauerhaft bestehen. Während deiner Abwesenheit produziert sie bis zu 24 Stunden weiter. Dieselben Zugangsdaten öffnen auf Handy und Computer dieselbe Fabrik. Internetzugang ist zum Spielen erforderlich.

## Selbst starten

Das Quellcode-Archiv entpacken, Node.js 24 installieren und im Projektordner ausführen:

```bash
npm ci
npm run dev
```

Danach `http://localhost:5173` öffnen. Die lokale SQLite-Datei entsteht automatisch. In der beiliegenden **BETRIEB.md** stehen Render-Einrichtung, Kosten, verschlüsselte Backups und Wiederherstellung.

[Quellcode im Repository](https://github.com/der-programmer1/AppShelf/tree/main/projects/Factory-League)
