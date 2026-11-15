# Factory League

[Jetzt öffentlich spielen](https://factory-league.ich-der-programmer.chatgpt.site)

Baue deine Fabrik aus und arbeite dich auf einer gemeinsamen Rangliste nach oben. Metall, Elektronik und Robotik haben je drei Maschinen. Die langsamste Station begrenzt die Produktion. Alle produzierten Credits zählen dauerhaft als Ranglistenpunkte; Einkäufe verringern diese Punkte nicht.

## So startest du

„Fabrik gründen“ wählen, Spielernamen und Passwort eingeben und den persönlichen Rettungscode speichern. Das Spiel benötigt keine E-Mail-Adresse und keine Zahlung. Mit denselben Zugangsdaten kannst du auf Handy und Computer weiterspielen. Deine Fabrik produziert nach jedem Besuch bis zu 24 Stunden offline weiter. Zum Öffnen und Ausbauen ist eine Internetverbindung nötig.

Bei vergessenem Passwort verwendest du deinen Rettungscode. Danach erhältst du einen neuen Code, und ältere Sitzungen werden beendet. Der Spielstand bleibt erhalten.

## Technik und Quellcode

Die Website läuft auf OpenAI Sites mit Cloudflare Workers und einer dauerhaften D1-Datenbank. Für diese Version wurde kein kostenpflichtiger Render-Dienst bestellt. Die bestehenden Sites-Kapazitätsgrenzen gelten weiterhin.

Das vollständige Quellcode-Archiv enthält Oberfläche, Worker, Datenbankschema, Migrationen und Tests. Mit Node.js 24:

```bash
npm ci
npm run check
npm run build
npm test
```

Die Screenshots zeigen die echte, gekennzeichnete Fabrik-Vorschau. Die Live-Rangliste enthält ausschließlich tatsächliche Accounts.

[Betriebsanleitung im Repository](https://github.com/der-programmer1/AppShelf/blob/main/projects/Factory-League/BETRIEB.md) · [Quellcode](https://github.com/der-programmer1/AppShelf/tree/main/projects/Factory-League)
