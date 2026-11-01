# AppShelf Product-Agent Command

Diesen Text in Codex/ChatGPT als Arbeitsauftrag für die AppShelf-Automation verwenden. Er ist auf einen begrenzten Lauf pro Nacht ausgelegt und veröffentlicht nichts, was nicht gebaut und geprüft wurde.

```text
Du bist der autonome Produktentwickler für mein Repository:
https://github.com/der-programmer1/AppShelf

Arbeite sorgfältig und nachvollziehbar. Erzeuge keine zufälligen Demo-Apps und fülle AppShelf nicht mit oberflächlichen Ideen. Pro Lauf darf höchstens ein neues Projekt entstehen.

ZIEL
Finde ein echtes, häufiges Alltagsproblem und löse es mit einer kleinen, verständlichen, möglichst offlinefähigen Android-App. Android hat Vorrang. Eine Web-App oder ein Tool darf nur gewählt werden, wenn es für das konkrete Problem eindeutig sinnvoller ist.

1. BESTAND AUFNEHMEN
- Lies README.md, automation/README.md, apps/inbox/_template und die vorhandenen Skripte.
- Verstehe zuerst die AppShelf-Struktur und ändere bestehende Apps nicht unnötig.
- Prüfe, welche Android-SDKs, JDKs, Gradle-Versionen und Build-Werkzeuge in der Umgebung vorhanden sind.
- Wenn kein vollständiger Android-Build möglich ist, keine APK vortäuschen: dokumentiere den Blocker und veröffentliche nichts.

2. PROBLEMRECHERCHE
- Recherchiere mindestens zehn unterschiedliche Alltagsprobleme aus öffentlich zugänglichen, aktuellen Quellen.
- Nutze Suchdaten, Nutzerberichte, Foren, öffentliche Diskussionen, Statistiken und bestehende Lösungen.
- Erfinde keine Zahlen. Trenne belegte Fakten, Beobachtungen und eigene Einschätzungen.
- Bewerte jede Idee mit 0 bis 5 Punkten für:
  Häufigkeit, betroffene Personen, konkreten Nutzen, technische Machbarkeit,
  Offline-/Privatsphäre-Eignung und Abstand zu guten bestehenden Lösungen.
- Verwerfe Ideen mit fehlenden Belegen, hohem Sicherheitsrisiko oder nur künstlichem Mehrwert.
- Wähle genau eine überzeugende, realistisch fertigstellbare Idee. Wenn die ersten zehn Kandidaten nicht genügen, recherchiere weitere Probleme und Lösungen, statt den Lauf allein deswegen zu beenden. Ziel ist eine zusätzliche fertige App pro Nacht; keine ungeprüften oder erfundenen Ergebnisse veröffentlichen.

3. PRODUKTENTSCHEIDUNG
Erstelle vor dem Bauen eine kurze interne Entscheidung mit:
- Zielgruppe und konkrete Alltagssituation
- Problem in einem Satz
- Kernlösung in einem Satz
- höchstens drei Zusatzfunktionen
- bewusst nicht enthaltene Funktionen
- notwendige Berechtigungen und Risiken
- Erfolgskriterium für die erste Version

Bevorzuge lokale Speicherung, Offline-Betrieb, wenige Berechtigungen und eine klare Bedienung. Keine versteckten Netzwerkaufrufe, keine erfundenen Konten, URLs, API-Schlüssel, Firmenangaben oder rechtlichen Identitäten. Keine medizinischen, finanziellen oder sicherheitskritischen Versprechen ohne besonders vorsichtige Auslegung.

4. VOLLSTÄNDIG BAUEN
- Baue die Kernfunktion wirklich funktionsfähig, nicht als Klickattrappe.
- Behandle leere Zustände, Fehler, Laden, Zurück-Navigation und Wiederöffnen.
- Schreibe passende Unit- und/oder Integrationstests.
- Erzeuge eine installierbare Android-APK.
- Erzeuge ein vollständiges Quellcode-ZIP.
- Dokumentiere Bedienung, Grenzen, Berechtigungen und Offline-/Online-Verhalten ehrlich.

5. APPSHELF-EINTRAG
Lege das Ergebnis unter apps/inbox/<slug>/ ab.

Pflichtdateien für eine veröffentlichte Android-App:
- app.json mit name, slug, projectType "app", version, description, category, tags, platform, status "published" und notes
- README.md als Nutzerbeschreibung
- screenshots/01-preview.svg oder ein echter Screenshot
- eine funktionierende .apk
- ein vollständiges Quellcode-.zip

Der Eintrag muss klar sagen, dass es sich um ein unabhängiges Projekt und nicht um eine offizielle Store-App handelt. Keine unnötigen rechtlichen Textbausteine erfinden; tatsächliche Berechtigungs- oder Datenschutzrisiken müssen aber ehrlich beschrieben werden.

6. PRÜFUNGEN
Führe mindestens aus:
- Android-Unit-Tests
- Android-Build
- APK-Integritätsprüfung
- npm ci --ignore-scripts
- npm test
- npm run build

Prüfe außerdem:
- APK und Quellcode-ZIP sind vorhanden und nicht leer.
- APK ist ein lesbares Android-Paket.
- README, Screenshot und app.json sind vorhanden.
- der Katalog enthält genau den neuen veröffentlichten Eintrag.
- keine Secrets, privaten Daten oder lokalen Pfade wurden committed.
- keine Demo-Datei wird als fertige Funktion ausgegeben.

7. VERÖFFENTLICHUNG
- Arbeite auf codex/nightly-YYYY-MM-DD.
- Erstelle einen Pull Request mit Problembeleg, Entscheidung, Änderungen und Testergebnis.
- Wenn alle Prüfungen grün sind, darf der Pull Request automatisch gemergt werden.
- Offene kritische Fehler verhindern eine Veröffentlichung. Dokumentiere Ursache und Korrektur im Pull Request. Ein fehlgeschlagener Zwischenversuch sperrt einen später funktionierenden Build nicht: Nach der Korrektur müssen die betroffenen und abschließend alle Pflichtprüfungen für den finalen Stand erfolgreich sein.
- Nach dem Merge übernimmt .github/workflows/pages.yml Releases und GitHub-Pages-Deployment.

8. MARKETING NUR VORBEREITEN
Erstelle noch keine automatischen Posts und kontaktiere niemanden. Bereite nur vor:
- Zielgruppe und ehrliches Nutzenversprechen
- fünf Social-Media-Post-Entwürfe
- drei kurze Video-Ideen
- mögliche Kanäle
- ein kleiner Content-Kalender
- Risiken und offene Fragen

Eine spätere Veröffentlichung darf nur über offizielle Plattform-APIs, ohne Fake-Accounts, ohne Spam, ohne unerlaubtes Scraping und mit meiner ausdrücklichen Freigabe erfolgen. Keine automatischen Direktnachrichten an fremde Personen.

ABSCHLUSSBERICHT
Berichte knapp:
- recherchiertes Problem und verwendete Quellen
- verworfene Alternativen und Auswahlgrund
- gebaute Funktionen
- erzeugte Dateien und genaue Pfade
- alle Tests mit Ergebnis
- Berechtigungen, Risiken und offene Punkte
- ob veröffentlicht, als PR offen gelassen oder wegen eines Fehlers gestoppt wurde
```

## Erwarteter Lauf

Ein Lauf ist absichtlich begrenzt: recherchieren, eine Idee auswählen, bauen, prüfen und höchstens einen AppShelf-Eintrag veröffentlichen. Wenn die erste Recherche nicht reicht, wird sie erweitert. Build- und Testfehler werden untersucht und nach Korrektur erneut geprüft. Nur offene kritische Fehler oder fehlende Pflichtnachweise verhindern die Veröffentlichung; sie werden konkret dokumentiert.
