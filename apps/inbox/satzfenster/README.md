# Satzfenster

Wird die Zeit mitten im Training knapp, zeigt Satzfenster, welche offenen Sätze noch in die verfügbare Zeit passen. Grundlage sind dein eigener Plan, deine geschätzte Zeit pro Satz und deine Prioritäten.

1. Übungen, Satzanzahl und Minuten pro Satz eintragen. Pause und Gerätewechsel gehören in diese Schätzung.
2. Wichtige Übungen markieren und die verbleibenden Minuten starten. Wichtige Sätze werden zuerst eingeplant. Innerhalb derselben Priorität gilt die Reihenfolge im Plan.
3. Sätze abhaken und belegte Geräte markieren. Nach jeder Änderung berechnet die App, was noch hineinpasst. Belegte Sätze lassen sich wieder freigeben.

Der Beispielplan zeigt das Verfahren mit vier Übungen. Die Vorschau rechnet vor dem Start mit dem eingestellten Zeitfenster. Nach dem Start läuft die Zeit über eine gespeicherte Endzeit weiter, auch wenn der Tab vorübergehend im Hintergrund liegt. Der Plan und der Fortschritt bleiben lokal im Browser. Nach dem ersten erfolgreichen Laden ist die App offline nutzbar.

Auf dem iPhone lässt sich die Seite in Safari über **Teilen → Zum Home-Bildschirm** installieren. Auf Android bietet Chrome die Installation im Menü an. Die Web-App liegt in AppShelf unter `apps/satzfenster/demo/`.

## Produktrecherche

Fitbod dokumentiert, dass Nutzer bei deutlich kürzeren Workouts ganze Übungen streichen und trotz vorhandener Zeiteinstellung häufig selbst kürzen. AGUNA bietet bereits einen Übungswechsel für belegte Geräte an. Satzfenster konzentriert sich auf eine laufende Endzeit, offene Sätze und selbst gesetzte Prioritäten in einem vorhandenen Plan.

- [Fitbod-Auswertung zu kurzen Trainingseinheiten](https://fitbod.me/blog/what-gets-cut-when-lifters-are-short-on-time/)
- [AGUNA zu belegten Geräten](https://aguna.app/machine-taken-busy-gym)
- [Apple zum Installieren von Web-Apps](https://support.apple.com/de-de/guide/iphone/iphea86e5236/ios)

## Entwicklung

`demo/` enthält die statische App. Für eine lokale Vorschau aus dem AppShelf-Repository `npm run build` und `python3 -m http.server 8080 --directory dist` ausführen. Beim Ändern der App-Shell die Cache-Version in `demo/sw.js` erhöhen, damit installierte Browser die neue Version laden.
