# AppShelf Nacht-Automation

Diese Datei beschreibt den sicheren Arbeitsrahmen für eine verbundene Codex-Cloud-Automation.

## Arbeitsfenster

- Zeitplan: täglich um 22:00 Uhr, Zeitzone `Europe/Berlin`.
- Umfang: genau ein abgeschlossenes Arbeitspaket pro Lauf.
- Ziel: ein neues nützliches Projekt oder eine klar abgegrenzte Verbesserung.
- Branch: `codex/nightly-YYYY-MM-DD`.

## Arbeitsregeln

1. Wähle eine neue Idee für eine App, Web-App, ein Spiel oder ein Tool, die zum persönlichen AppShelf-Archiv passt.
2. Erstelle einen vollständigen, verständlichen Eintrag unter `apps/inbox/<slug>/`.
3. Verwende `projectType` mit einem dieser Werte: `app`, `web-app`, `game` oder `tool`.
4. Liefere Beschreibung, README, Vorschau und die verfügbaren Dateien mit.
5. Führe `npm test` und anschließend `npm run build` aus.
6. Erstelle einen Pull Request und aktiviere Auto-Merge nur, wenn alle Pflichtprüfungen grün sind.
7. Bei einem Fehler nichts veröffentlichen, sondern den Fehler im Pull Request dokumentieren.

Keine Zugangsdaten, persönlichen Daten, erfundenen Rechtsangaben oder offiziellen Store-Versprechen in Projekte einbauen. AppShelf bleibt eine unabhängige Sammlung eigener Projekte.

## Veröffentlichung

Nach einem erfolgreichen Merge übernimmt `.github/workflows/pages.yml` die Releases und den GitHub-Pages-Deploy. Die Automation selbst braucht dafür eine Cloud-Umgebung mit GitHub-Zugriff; dieser Repository-Ordner aktiviert keine externe Codex-Schedule allein.
