# AppShelf Nacht-Automation

Diese Datei beschreibt den sicheren Arbeitsrahmen für eine verbundene Codex-Cloud-Automation.

Der vollständige, direkt kopierbare Produktentwickler-Command steht in
[`automation/app-product-agent-command.md`](app-product-agent-command.md). Er übernimmt die
Recherche echter Alltagsprobleme, die Auswahl einer begründeten Idee, Android-first-Bau,
APK-/Quellcode-Handoff, Tests und die Vorbereitung von Marketingmaterial.

## Arbeitsfenster

- Zeitplan: täglich um 22:00 Uhr, Zeitzone `Europe/Berlin`.
- Umfang: genau ein abgeschlossenes Arbeitspaket pro Lauf.
- Ziel: ein neues nützliches Projekt oder eine klar abgegrenzte Verbesserung.
- Branch: `codex/nightly-YYYY-MM-DD`.

## Arbeitsregeln

1. Recherchiere mindestens zehn Alltagsprobleme. Wenn darunter keine überzeugende Idee ist, erweitere die Recherche, bis eine sinnvoll umsetzbare Idee gefunden ist; Ziel ist eine zusätzliche fertige App pro Nacht. Veröffentliche weiterhin nur tatsächlich funktionsfähige und vollständig geprüfte Ergebnisse.
2. Erstelle einen vollständigen, verständlichen Eintrag unter `apps/inbox/<slug>/`.
3. Verwende `projectType` mit einem dieser Werte: `app`, `web-app`, `game` oder `tool`.
4. Für Android-Projekte sind APK, Quellcode-ZIP, README und Vorschau Pflicht. App-Start und AppShelf-Beschreibung erklären zuerst das Problem, die Zielgruppe und konkrete Anwendungsfälle in Alltagssprache; ein funktionierendes Beispiel erleichtert den Einstieg.
5. Führe App-Tests, `npm test` und anschließend `npm run build` aus.
6. Erstelle einen Pull Request und aktiviere Auto-Merge nur, wenn alle Pflichtprüfungen grün sind.
7. Offene kritische Fehler blockieren die Veröffentlichung. Behobene Zwischenfehler dokumentieren und die betroffenen sowie abschließend alle Pflichtprüfungen erneut erfolgreich ausführen; danach ist eine Veröffentlichung erlaubt.

Keine Zugangsdaten, persönlichen Daten, erfundenen Rechtsangaben oder offiziellen Store-Versprechen in Projekte einbauen. AppShelf bleibt eine unabhängige Sammlung eigener Projekte.

Marketing wird zunächst nur als Entwurf vorbereitet. Automatische Posts, Direktnachrichten oder Social-Media-Veröffentlichungen sind nicht Bestandteil des aktuellen Workflows.

## Veröffentlichung

Nach einem erfolgreichen Merge übernimmt `.github/workflows/pages.yml` die Releases und den GitHub-Pages-Deploy. Die Automation selbst braucht dafür eine Cloud-Umgebung mit GitHub-Zugriff; dieser Repository-Ordner aktiviert keine externe Codex-Schedule allein.
