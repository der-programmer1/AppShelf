> Zwischenstand der ersten Prüfung. Nach dem Nutzerauftrag, weiterzusuchen, wird dieser Lauf mit [LeistenPlan](2026-11-01-product.md) fortgesetzt. Die nachfolgende damalige Entscheidung „keine neue App“ ist nicht das Endergebnis der Work Session.

# Nightly 2026-11-01: Nachprüfung in der vorbereiteten Cloud-Umgebung

## Ergebnis und Umfang

Der manuell ausgelöste Folgelauf begann am 1. November 2026 um 23:02 Uhr Europe/Berlin. Er setzt den bestehenden Tagesbranch `codex/nightly-2026-11-01` und den offenen Draft-PR [#1](https://github.com/der-programmer1/AppShelf/pull/1) fort. Der frühere Laufbericht bleibt als historischer Stand erhalten. Es entsteht kein zweiter Tagesbranch und keine doppelte App.

**Keine neue App ausgewählt.** Alle zehn untersuchten Problemfelder bleiben unter dem festgelegten Produkt-Gate von 40/50 Punkten. Besonders die zunächst erwogene lokale Parknotiz überschneidet sich direkt mit einem vorhandenen Offline-Projekt. Einen gleichartigen Eintrag nur für einen erfolgreichen Probelauf zu erzeugen, würde dem Qualitätsauftrag widersprechen.

Es wurde kein neuer Eintrag unter `apps/inbox/` angelegt. Bestehende Apps, APKs, Quellarchive und Website-Dateien werden nicht verändert. Es gibt keine neue APK, keine neue App-Version und keine Veröffentlichung.

Dieser manuelle Lauf prüft die tatsächlich vorhandene Cloud-Arbeitsumgebung. Er beweist weder das Auslösen des täglichen Zeitplans noch eine Ausführung bei ausgeschaltetem Mac. Dafür muss ein späterer geplanter Lauf anhand seines Verlaufs geprüft werden.

## Recherche: Fakten, Beobachtungen, Einschätzung

Alle nachfolgend genannten Seiten wurden im aktuellen Lauf öffentlich abgerufen und gelesen. Suchtreffer allein wurden nicht als Produktbeleg übernommen. Die Quellen sind qualitative Berichte einzelner Nutzer und Projektbeschreibungen; sie belegen keine Häufigkeit, Marktgröße oder repräsentativen Nutzerzahlen. Ältere offene Issues belegen ein beschriebenes Problem, nicht automatisch heutige Nachfrage. Die Recherche ist durch das verfügbare Netzwerk auf öffentlich zugängliche GitHub-Seiten begrenzt.

1. **Abstellort im Parkhaus oder in wechselnden Straßen vergessen.** [Organic Maps #3825](https://github.com/organicmaps/organicmaps/issues/3825) beschreibt einen leicht überschreibbaren einzelnen Parkplatz, Zeitstempel und ausdrücklich Notizen zu Ebene/Stellplatz. [OsmAnd #24371](https://github.com/osmandapp/OsmAnd/issues/24371), eröffnet 2026, fragt nach automatischem Markieren; ein Projektmitglied verweist auf die vorhandene Parkfunktion. **Beobachtung:** Der Wunsch nach wenig Aufwand und eindeutiger aktueller Notiz ist konkret. **Einschätzung:** Ein reiner manueller Offline-Merker wäre machbar, hat aber keinen ausreichend belegten Abstand: Die gelesene [ParkNote-README](https://github.com/StanleyLl0yd/parknote) beschreibt bereits einen einzelnen lokalen Datensatz mit Etage, Sektor, Stellplatz, Orientierungspunkt, optionalen Fotos und ohne Netzwerkberechtigung. Dessen Qualitäts-/CI-Aussagen wurden nicht unabhängig getestet; die dokumentierte Funktionsüberschneidung allein spricht gegen einen Nachbau.

2. **Bei langen Checklisten den Fortschritt nicht erkennen.** [Fossify Notes #113](https://github.com/FossifyOrg/Notes/issues/113) wünscht einen dauerhaft sichtbaren Erledigt-/Gesamtzähler; eine weitere Rückmeldung stammt aus Juni 2026. **Beobachtung:** Das Scrollen zum Zähler stört diesen Arbeitsablauf. **Einschätzung:** Eine gezielte Verbesserung einer bestehenden Notiz-App ist plausibler als eine neue allgemeine Checklisten-App. Ein konkreter Bedarf an einer neuen Packlisten-App wurde daraus nicht abgeleitet.

3. **Bei parallelen Haushaltstimern den verbleibenden Timer übersehen.** [Fossify Clock #72](https://github.com/FossifyOrg/Clock/issues/72) beschreibt ausbleibende Benachrichtigungen nach dem Beenden eines von mehreren Timern; es gibt eine weitere Rückmeldung aus April 2026. **Beobachtung:** Es geht um zuverlässiges Hintergrundverhalten. **Einschätzung:** Eine belastbare Alternative verlangt Tests zu Prozessende, Energiesparen und unterschiedlichen Geräten. Ein neuer Timer wäre ohne diese Absicherung kein verlässliches Nachtprojekt.

4. **Gewogene Lebensmittel nicht zuverlässig im Vorrat erfassen.** [Grocy #1013](https://github.com/grocy/grocy/issues/1013) beschreibt variable Produkt-/Gewichtsanteile in Barcodes und den Wunsch nach Vorlagen. **Beobachtung:** Die Produktidentität kann nicht immer durch einen identischen Barcode abgeglichen werden. **Einschätzung:** Ein belastbarer Scanner braucht Barcode-/Händlerregeln und einen Bestandspflegeablauf; eine einfache manuelle Liste löst den belegten Sonderfall nicht. Der zusätzlich gelesene Bericht [#2894](https://github.com/grocy/grocy/issues/2894) wurde wegen der dort dokumentierten ungültigen technischen Angaben ausdrücklich nicht als bestätigter Fehlerbeleg übernommen.

5. **Wiederkehrende Hausarbeit nicht vorausschauend planen können.** [Grocy #2219](https://github.com/grocy/grocy/issues/2219) wünscht künftige wiederkehrende Aufgaben im Kalender. **Beobachtung:** Eine Erledigt-Liste reicht dem beschriebenen Planungsablauf nicht. **Einschätzung:** Kalender und Aufgaben-Apps decken viel davon bereits ab; zusätzliche Wiederholungs-/Zeitzonenregeln erhöhen den Testumfang.

6. **Hausarbeit zwischen Personen in einem anderen Rhythmus verteilen.** [Grocy #929](https://github.com/grocy/grocy/issues/929) nennt als Beispiel eine zweimal wöchentliche Aufgabe bei wöchentlich wechselnder Zuständigkeit. **Beobachtung:** Aufgabenhäufigkeit und Personenrotation sind unterschiedliche Regeln. **Einschätzung:** Das ist ein konkreter Sonderfall, aber gemeinsame Haushaltsnutzung erfordert Abstimmung und gegebenenfalls Synchronisierung. Für eine einzelne lokale App ist der Zusatznutzen noch nicht validiert.

7. **Scheinbar doppelte Fotos riskant löschen.** [Fossify Gallery #440](https://github.com/FossifyOrg/Gallery/issues/440) berichtet von doppelten Anzeigen derselben Datei und weiteren Rückmeldungen. **Beobachtung:** Der ursprüngliche Bericht sagt ausdrücklich, dass nur eine Datei existiert. Die dort zitierte KI-Erklärung für die Ursache ist keine bestätigte Diagnose. **Einschätzung:** Ein neuer Dateiduplikat-Löscher könnte gerade den einzigen Bestand löschen; eine Anzeige-/Indexkorrektur mit Reproduktion ist angemessener.

8. **Eine vorgezogene Geburtstagserinnerung mit dem Ereignistag verwechseln.** [Fossify Calendar #1374](https://github.com/FossifyOrg/Calendar/issues/1374), eröffnet am 18. Oktober 2026, beschreibt den Wunsch nach „morgen“ beziehungsweise „in drei Tagen“ im Benachrichtigungstitel. **Beobachtung:** Es geht um verständliche Darstellung vorhandener Termindaten. **Einschätzung:** Eine kleine Verbesserung einer bestehenden Kalender-App ist naheliegender als eine weitere App mit Kontakt-/Erinnerungsdaten.

9. **Pflanzenpflege und Anbauvorgänge nicht im Blick behalten.** [Grocy #179](https://github.com/grocy/grocy/issues/179) beschreibt Pflanzenbestand, Pflegeaufgaben und Gartenplanung. **Beobachtung:** Der ausführliche Vorschlag enthält mehrere unterschiedliche Produktbereiche. **Einschätzung:** Ein Pflegeprotokoll wäre klein machbar; automatische Pflegeempfehlungen, Planung und belastbarer Vorteil gegenüber vorhandenen Aufgabenlösungen sind für diesen Lauf nicht belegt.

10. **Viele Dateinamen für weitere Verarbeitung vereinheitlichen.** [Fossify File Manager #475](https://github.com/FossifyOrg/File-Manager/issues/475), eröffnet im August 2026, wünscht Ersetzungen und reguläre Ausdrücke für einzelne und mehrere Dateien. **Beobachtung:** Im Bericht behindern Leerzeichen die weitere Verarbeitung. **Einschätzung:** Eine sichere Umsetzung benötigt Vorschau, Kollisionsbehandlung, Tests für unterschiedliche Dokumentanbieter und Schutz vor Datenverlust. Dafür ist eine gezielte Erweiterung eines Dateimanagers geeigneter als ein schnell erstellter neuer Dateimanager.

### Eigene Bewertung, jeweils 0–5

Diese Punkte sind Produkturteile mit begrenzter Evidenz, keine externen Messwerte. H = vermutete Häufigkeit, R = vermutete Reichweite, N = Nutzen, K = Erklärbarkeit, M = zuverlässige Umsetzbarkeit in einer Nacht, O = Offline-Eignung, B = wenige Berechtigungen, A = Abstand zu vorhandenen Alternativen, V = plausibler Vorteil durch Einfachheit/Preis/Privatsphäre, D = in kurzem Video demonstrierbar. Bei A bedeutet eine hohe Punktzahl wenig Konkurrenzüberschneidung. H und R sind unsichere Einschätzungen und keine Nutzerstatistik.

| Problem | H | R | N | K | M | O | B | A | V | D | Summe |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Parkplatznotiz | 3 | 3 | 4 | 5 | 5 | 5 | 5 | 1 | 1 | 5 | 37/50 |
| Checklistenfortschritt | 3 | 3 | 3 | 5 | 4 | 5 | 5 | 1 | 1 | 4 | 34/50 |
| Parallele Haushaltstimer | 4 | 4 | 4 | 5 | 2 | 5 | 3 | 1 | 2 | 5 | 35/50 |
| Variable Lebensmittelbarcodes | 3 | 3 | 4 | 4 | 2 | 4 | 3 | 2 | 2 | 4 | 31/50 |
| Hausarbeit vorausplanen | 4 | 4 | 4 | 5 | 3 | 5 | 4 | 1 | 2 | 4 | 36/50 |
| Zuständigkeit rotieren | 3 | 3 | 4 | 4 | 3 | 5 | 5 | 2 | 2 | 4 | 35/50 |
| Doppelte Fotoanzeigen | 3 | 3 | 4 | 4 | 2 | 5 | 1 | 1 | 1 | 3 | 27/50 |
| Terminvorlauf verstehen | 3 | 3 | 3 | 5 | 3 | 5 | 3 | 1 | 1 | 4 | 31/50 |
| Pflanzenpflege | 3 | 3 | 3 | 4 | 3 | 5 | 4 | 1 | 2 | 4 | 32/50 |
| Dateinamen vereinheitlichen | 3 | 3 | 4 | 4 | 2 | 5 | 2 | 1 | 1 | 4 | 29/50 |

Kein Kandidat erreicht 40/50. Es gibt deshalb keine ausgewählte App, keine behaupteten neuen Funktionen, keine künstliche Demo und keine Marketingveröffentlichung. Ein späterer Lauf sollte andere Situationen und weitere freigegebene öffentliche Quellen untersuchen, statt dieselbe Liste erneut abzuarbeiten.

## Vorhandene Umgebung und erfolgreich ausgeführte Prüfungen

- Node.js 22.23.4, Temurin JDK 21.0.13, Gradle 9.6.0, Android SDK 36 / Build-Tools 36.0.0 und ein API-30-AOSP-Testgerät sind tatsächlich vorhanden.
- `npm ci --ignore-scripts --no-audit --no-fund`: erfolgreich, 29 gesperrte Abhängigkeiten installiert.
- `npm test`: erfolgreich. Zwei Manifestordner, ein veröffentlichter Eintrag, vorhandene APK-/ZIP-Archive sowie erzeugte Katalogdaten, Detailseite, Screenshot und QR-Asset geprüft.
- `npm run build`: sowohl mit `CI=true GITHUB_REPOSITORY=der-programmer1/AppShelf` als auch als lokaler Build erfolgreich; jeweils ein veröffentlichter Eintrag. Diese Builds veröffentlichen nichts.
- Das vorhandene SehPlus-Quellarchiv wurde außerhalb des Repositorys entpackt und tatsächlich mit `gradle --offline --no-daemon --max-workers=2 --console=plain testDebugUnitTest assembleDebug` gebaut: erfolgreich, 36 Aufgaben aus dem Cache aktuell.
- APK-Integrität: `unzip -tq`, `apksigner verify --verbose` und Android-Metadatenprüfung erfolgreich. Die neu gebaute Prüf-APK enthält `AndroidManifest.xml` und `classes.dex`, ist 953.200 Bytes groß und ihre APK-v2-Signatur ist gültig. Sie ersetzt nicht die vorhandene Repository-APK.
- **Android-Unit-Tests: `NO-SOURCE`.** Im vorhandenen SehPlus-Archiv gibt es keine Unit-Tests. Der erfolgreiche Gradle-Prozess darf nicht als bestandene Unit-Test-Suite ausgegeben werden.

### Vertiefte Geräteprüfung

Die offizielle AOSP-ATD-Abbildung setzt `debug.hwui.drawing_enabled=0`. Ein reiner Hierarchietexttest kann daher trotz schwarzem Bildschirm positiv sein. Die Folgeprüfung aktiviert die Darstellung vor dem App-Neustart und verschärft den Helfer: vorherigen Dump löschen, Fehlertexte trotz Exitcode 0 erkennen, auf einen neuen gültigen XML-Dump warten und tatsächlich sichtbare Trefferflächen verlangen. Ein `uiautomator`-Fehler darf keine alte XML-Datei als aktuellen Erfolg verwenden.

Ergebnisse des finalen Gerätestands:

- **Bestanden:** Installation der neu gebauten Prüf-APK, aktivierte Bilddarstellung, frische Hierarchiedaten und sichtbare nichtleere Bedienflächen auf dem nativen Emulatorprofil. Der anfangs leere Navigationsbereich im Test war nach Zurücksetzen des alten Dichte-/Größen-Overrides behoben. Ein früherer Testfehler wurde damit korrigiert; er wird nicht als dauerhaftes Veröffentlichungsverbot behandelt.
- **Bestanden:** erneutes Öffnen der App mit gespeichertem Zustand der abgeschlossenen Einführung. Die Einführung war bereits abgeschlossen und musste in diesem Folgelauf nicht erneut weggeklickt werden.
- **Bestanden:** echte Touch-Navigation zur Über-Seite, Öffnen des Werkzeugbereichs und des Offline-Testlabors.
- **Fehlgeschlagen:** Im Testlabor fehlt die auswählbare Probe „Beiger Stoff“. Der frische Dialog enthält nur Titel, Beschreibung und „ABBRECHEN“. Der erwartete Schritt „Beispielbild laden“ wurde nicht erreicht. Folgeschritte für Farbanalyse/Pipette sind deshalb nicht ausgeführt, nicht bestanden.
- **Nicht ausgeführt:** reale Kamera-/OEM-Gerätetests. Die verwendete API-30-AOSP-Instanz hat keine physische Kamera.

Belege: [Screenshot](2026-11-01-evidence/offline-testlab.png), [frischer UI-Dump](2026-11-01-evidence/offline-testlab.xml), [maschinenlesbares Ergebnis](2026-11-01-evidence/core-result.json).

Der aus dem bestehenden Quellarchiv gebaute Code verwendet in `showTestLabDialog()` zugleich `AlertDialog.Builder.setMessage(...)` und `setItems(...)`. Das beobachtete Verhalten passt dazu, dass der Nachrichtentext die Auswahlliste im Dialog verdrängt. Die bestehenden App-Dateien und das Archiv wurden gemäß Schutzregel nicht geändert. Getestet wurde die neu gebaute Prüf-APK; die hochgeladene Repository-APK wurde nicht zusätzlich separat installiert. Das ist ein reproduzierbarer App-Befund im vorhandenen Quellstand, kein fehlendes SDK.

**HTTP-Prüfung bestanden:** Homepage, aktueller Katalog, Build-Bericht, Skripte/Styles/Logo, Detailseite, QR-Code, Screenshot und alle drei lokalen Downloads liefern die erwarteten aktuellen Dateien: 13 Antworten, ein veröffentlichter Eintrag. Diese Prüfung belegt weder GitHub Pages nach Deployment noch neue App-Funktionen.

## Erforderliche Korrektur am PR-Ablauf

Der bestehende Pages-/Release-Workflow reagiert auf Push nach `main` und auf manuellen Start, aber nicht auf Pull Requests. Damit entstanden für den bisherigen Draft-PR keine Katalogprüfungen. Für den verlangten Ablauf „erst prüfen, dann zusammenführen“ ist dies eine konkrete Lücke.

Neu ergänzt wird ausschließlich `.github/workflows/pull-request.yml`: ein `pull_request`-Workflow mit nur lesendem Repositoryzugriff, Node 22, `npm ci --ignore-scripts`, `npm test` und `npm run build`. Er erstellt weder Releases noch Pages-Deployments und verwendet keine Veröffentlichungszugangsdaten. Das YAML wurde geparst, Trigger/Berechtigungen/Befehle geprüft und die Befehle lokal ausgeführt. Das ersetzt kein tatsächliches GitHub-Workflow-Ergebnis. Der Katalog-Job ersetzt außerdem keine app-spezifischen Android-Unit- oder Gerätetests.

## Netzwerk und Grenzen des vollständigen Probelaufs

Die aktuelle Instanz meldet `spec_revision=1` und eine durchgesetzte eingeschränkte Netzwerkpolicy ohne benutzerdefinierte Hosts. `git ls-remote origin` und das Abrufen des vorhandenen Tagesbranches funktionieren. Der tatsächlich versuchte Repository-Aufruf über `gh api` endet weiter mit `Forbidden`; `api.github.com` ist in dieser laufenden Policy nicht freigegeben. Es wird deshalb weder eine funktionierende PR-API noch eine fehlende GitHub-Anmeldung behauptet. Die API-Domain ist bereits im Umgebungsentwurf vorgesehen; eine aktive Freigabe in dieser Instanz ist noch nicht nachgewiesen.

Öffentliche GitHub-Seiten konnten gelesen werden. Eine Suchabfrage wurde nach mehreren Aufrufen mit HTTP 429 begrenzt; weitere Recherchen wurden mit weniger und zeitlich verteilten Abfragen fortgesetzt. Es wurde kein Zugriffsschutz umgangen.

Der vorhandene Draft-PR kann durch einen normalen Push auf seinen vorhandenen Branch aktualisiert werden. Das ist kein Nachweis dafür, dass eine zukünftige Automation selbst neue PRs über die API erstellen kann. Eine Änderung von PR-Titel/-Beschreibung beziehungsweise ein Auto-Merge über die API bleibt ungeprüft. Ohne nachgewiesene Pflichtprüfungen wird nichts zusammengeführt.


## Veröffentlichungsregel nach Fehlerkorrektur

Die Nutzerklarstellung aus dieser Work Session gilt für künftige Läufe: Ein vorheriger Fehler sperrt einen später funktionsfähigen Build nicht dauerhaft. Nach Behebung müssen die betroffenen Prüfungen und sämtliche Pflichtprüfungen für den endgültigen Stand erneut erfolgreich sein. Nur offene Fehler oder fehlende Pflichtnachweise verhindern dann eine Veröffentlichung. Fehlgeschlagene Versuche und ihre Behebung bleiben nachvollziehbar dokumentiert. Diese Regel wurde in den Repository-Anweisungen und der gespeicherten Nightly-Vorlage präzisiert.

## Abschluss und nächste Schritte

Dieser Lauf erzeugt einen Recherche-/Prüfbericht, reale Gerätebelege und den fehlenden PR-Katalogcheck. Das Produkt-Gate führt regulär zu keiner neuen App. Der nicht behobene Testlabor-Befund und die nicht freigegebene GitHub-API werden nicht als grün ausgegeben. Keine App, kein Release und kein Pages-Deployment wurde durch den Agenten veröffentlicht. Der Tages-PR bleibt Draft; Auto-Merge ist nicht aktiviert.

Für die wiederverwendbare Cloud-Konfiguration wurden die getesteten Korrekturen am Geräte-Helfer in `install_script` und `start_skill` gespeichert. Ein gespeicherter Entwurf ist noch kein angewendeter oder veröffentlichter Umgebungsstand. Die Freigabe von `api.github.com` muss in der laufenden Umgebung wirksam sein und der Repository-API-Aufruf erfolgreich wiederholt werden, bevor eine zukünftige selbständige PR-Erstellung als geprüft gelten kann. Auch der tatsächliche tägliche Zeitplan muss noch anhand eines geplanten Laufs geprüft werden.
