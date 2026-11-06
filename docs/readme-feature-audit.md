# README-Funktionsmatrix und Red-Team-Abnahme

**Gegenstand:** `README.md` und `docs/images/readme/` auf `docs/readme-visual-guide-20261106`, Basis `main` vom 06.11.2026.

**Prüfmethode:** Quervergleich der Oberfläche in `index.html`, des Anwendungseinstiegs `assets/js/app.js`, des Gantt-Renderers `assets/js/gantt.js`, der Druck- und Bildexportmodule unter `assets/js/print/`, der Design-Presets, der geltenden Designrichtlinien und der relevanten Playwright-Tests. Die Bildzustände wurden in einem frischen Chromium-Browserkontext auf dem Feature-Branch mit `examples/demo.gantt.json` durchgespielt. Die Tabelle beschreibt den in der Anwendung vorhandenen Stand und keinen Funktionswunsch.

## Funktionsmatrix

| Funktion | Tatsächlicher UI-Einstieg | Nachgewiesener Status | Alt-README / Handlungsbedarf | Bild |
| --- | --- | --- | --- | --- |
| Portfolio und Projektwechsel | `Projekt auswählen` | Produktiv | Vorher nur als Featureliste; Ablauf erklären | 03 |
| Neues Projekt und Name | `Neues Projekt`, Projektname | Produktiv | Schnellstart ergänzen | 03 |
| Demoprojekt | `Demo laden` | Produktiv, zusätzliche Kopie | Verhalten beim erneuten Laden erklären | 03 |
| Import und ID-Trennung | `Import` | Produktiv | Konfliktfreiheit, Projektkopie und Portabilität erklären | 03 |
| IndexedDB-Autosave | `Gespeichert` / `Speichert…` | Produktiv, lokal | Klare Grenzen und JSON-Backup | 03 |
| Aufgaben und Workstreams | `Aufgabe`, `Neue Aufgabe` | Produktiv | Erstes Arbeitsbeispiel anbieten | 06, 07 |
| Meilensteine / Gates | `Typ` im Aufgabeneditor | Produktiv | Semantik von Workstreams/Gates unterscheiden | 06 |
| Phasen-Sammelzeilen | Phasenleiste im `Zeitplan` | Produktiv | Zusammenhänge erklären | 08 |
| Phasen bearbeiten | `Planung & Darstellung → Phasen` | Produktiv | Klickweg und Einklappen erklären | 10 |
| Direkter Gantt-Move/Resize/Progress | Aufgabenbalken und Griffe | Produktiv, Native | Anwendungsbeispiele ergänzen | 05 |
| Manuelle Aufgabensortierung | `Manuell` / `Nach Datum` | Produktiv | Reine Darstellungsfolge von Terminänderung trennen | 04, 07 |
| Gantt-/Tabellensynchronisierung | `Aufgaben & Abhängigkeiten` | Produktiv | In beiden Abschnitten konkret erklären | 07 |
| Inline-Bearbeitung | Tabellenzelle, `Enter`/`F2` | Produktiv | Tastaturbedienung ergänzen | 07 |
| Aufgabeneditor | `Bearbeiten` | Produktiv | Felder verständlich anordnen | 06 |
| Vorgänger und Zyklusprüfung | `Abhängigkeiten` | Produktiv | Bearbeitung und Grenzen erklären | 06, 07 |
| Baseline und Puffer | Aufgabeneditor / `Darstellung` | Produktiv | Bedeutung der Linien und Puffer erklären | 06, 10 |
| Status / Risiko | `Status`, `Risiko` | Produktiv | Kein automatisches Scoring unterstellen | 06, 07 |
| Filter und Ansichtsmodi | `Operativ`, `Management`, `Meilensteine`, `Filter` | Produktiv | Grund für ausgeblendete Aufgaben erklären | 09 |
| Tag-/Wochen-/Monatsskala | `Tag`, `Woche`, `Monat` | Produktiv | Bedienung anhand Zeitplan erklären | 04 |
| Dynamische Zieldatumslinie | `Planung & Darstellung → Darstellung` | Produktiv | Arbeits- vs. Kalendertage und Ziel-Datum erklären | 11 |
| Stichtage und Feiertage | `Stichtage und Gates`, `Feiertage und Sondertage` | Produktiv | Gate-Aufgabe von Marker unterscheiden | 10 |
| Designvorlagen | `Design bearbeiten` | Produktiv: 6 hell, 3 dunkel, 2 hybrid | Altstände widersprachen späterer Liste; konsolidieren | 12 |
| Projektfarben | `Design bearbeiten` | Produktiv | Speichern erst nach Bestätigung | 12 |
| JSON-Projektdatei | `Exportieren → Projektdatei` | Produktiv | Klare Backup-Funktion statt nur Formatname | 13 |
| CSV-Aufgabentabelle | `Exportieren → Aufgabenübersicht CSV` | Produktiv | Von vollem Projekt-Backup abgrenzen | 13 |
| Mehrseitiges PDF | `Exportieren → Diagramm / PDF exportieren` | Produktiv via Browserdruckdialog | PDF als Druckseiten, nicht Direktdownload darstellen | 14 |
| Ganzes PNG-/JPG-Diagramm | Im Exportdialog `PNG` / `JPG` | Produktiv, 1 zusammenhängende Datei | Veraltete Aussage „nicht portiert“ entfernen | 15, 16 |
| Bildauflösung / JPG-Qualität | Exportdialog | Produktiv | 1×/2×/3× und JPG-Stufen ergänzen | 15 |
| Diagrammbeschriftung | SVG-/Canvas-Exportpipeline | Produktiv; Labelkonfiguration | Beschriftungen und Exportbeleg ergänzen | 16 |
| Kritisch-Kennzeichnung | Aufgabentyp `Kritisch markiert` | **Manuell**, keine CPM-Analyse | Einschränkung hervorgehoben | 06 |
| Alternative Frappe- und DHTMLX-Engines | `spikes/` / `assets/js/engine/` | Experimentell/diagnostisch | Nicht als produktiv dokumentieren | keines |
| Microsoft-Project-XML | Kein produktiver Einstieg | Nicht verfügbar | Als Grenze dokumentieren | keines |
| Automatische Cloud-Synchronisierung | Kein produktiver Einstieg | Nicht verfügbar | Lokalität und JSON-Sicherung transparent machen | 03 |

## Red-Team-Review

**Einsteigerperspektive:** Die Reihenfolge beginnt mit Produktnutzen, sofortigem Link und Fünf-Schritte-Schnellstart; danach folgt die Oberfläche, erst dann Spezialthemen. Konkrete Klickwege ersetzen die historische Liste. Dokumentierte Aufgaben und Exportwege folgen den echten UI-Bezeichnungen.

**UX- und Visual-Documentation-Perspektive:** Die 15 Zustände wurden in einem identischen Chromium-Viewport mit Demodaten aufgenommen. Nummerierte Markierungen verweisen auf im DOM gemessene Elemente, Erklärungen stehen getrennt unter der Oberfläche. Die sechzehnte Darstellung ist ein tatsächlicher PNG-Download. Nach Sichtprüfung wurden Markierungen von Feldwerten an den oberen Feldrand verschoben und kollidierende Tabellenpins korrigiert. 17 WebP-Dateien einschließlich Kontaktübersicht wurden erzeugt, validiert und versioniert.

**Redaktionelle Perspektive:** Die README unterscheidet Projektdatei (JSON), Aufgabenliste (CSV), Browserdruck/PDF und ein einziges vollständiges Diagrammbild (PNG/JPG). Die manuelle Kritisch-Kennzeichnung, Datenspeicherung, Feiertagsabfrage, gerätegebundene Speicherung und Engine-Spikes sind richtig eingeordnet. Historische Detaildiskussionen bleiben in `docs/`.

**QA-Perspektive:** Der Screenshot-Workflow prüft echte Browserzustände, JavaScript-Fehler, die Anzahl der Bilder, korrekte Dateien sowie jeden referenzierten README-Bildpfad. Die gezielten Playwright-Checks für Exportdialog, PNG, JPG, PDF-Umschaltung, Scrollunabhängigkeit und SVG-Beschriftungen wurden in Chromium ausgeführt (5/5 erfolgreich). Die übrige Produktivlogik blieb unverändert.

## Verbleibende Prüfgrenzen

- Die Sichtprüfung betrifft die Bildübersicht sowie repräsentative Bilder in Originalgröße. Die vollständig gerenderte GitHub-README wurde nicht zusätzlich als getrennte mobile/dunkle Browservorschau über alle Breakpoints abgenommen.
- Die Bildschirmpositionen hängen teilweise vom Browserviewport ab; bei künftigem Layoutwechsel müssen Bilder neu aufgenommen werden.
- Einige umfangreiche Dialoge sind bei 1600 × 1000 Pixel größer als der sichtbare Ausschnitt; die Bildserie zeigt bewusst die relevanten oberen Steuerelemente. Bei Bedarf kann eine zusätzliche separate Detailaufnahme folgen.
- Der Screenshot-Workflow besteht aus Dokumentationswerkzeugen; `assets/js/` und das Nutzerprojektformat wurden nicht verändert.
