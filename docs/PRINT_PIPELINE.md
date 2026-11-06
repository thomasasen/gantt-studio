# Engineunabhängige Druck- und PDF-Pipeline

## Architektur

Die Anwendung verwendet einen unabhängigen, unveränderlichen Projektsnapshot und erzeugt neue Druckseiten statt den aktuell sichtbaren Gantt-Viewport zu kopieren.

- `assets/js/print/print-model.mjs`: Projektion, Aufgaben-/Phasenauswahl, Datumsgrenzen, Layoutparameter und zweidimensionale Paginierung, ohne Bezug auf Native/Frappe
- `assets/js/print/print-ui.mjs`: eigener Dialog, HTML-/SVG-Druckseiten, Vorschau in `iframe`, Navigation, Vorschau-Zoom, Aufruf des Browserdruckdialogs
- `assets/css/print.css`: responsives, barrierearmes Layout für den Konfigurationsdialog
- Zuletzt verwendete Einstellungen und benannte Profile werden ausschließlich in `localStorage` gespeichert. Projektmodell, Revision und IndexedDB werden durch Druck nicht verändert. Der Druck-Snapshot enthält auch aktuelle Filter- und eingeklappte Phasen und bleibt bei Projektwechsel stabil.

## Enthaltene Funktionen

- A4/A3, Hoch-/Querformat und automatische Ausrichtung, konfigurierbare Ränder
- Profile Management, Detail, Benutzerdefiniert sowie selbst benannte Profile
- Skalierungen „Eine Seite“, „Breite anpassen“, „Lesbarkeit optimieren“ und „Manuell“; Warnung und Fallback bei unlesbarem Ein-Seiten-Layout
- Zweidimensionale Umbrüche nach Zeitraum und Aufgabenzeilen, wiederholte Aufgabenbeschriftungen und Zeitachsenbeschriftung
- Vollständiger Zeitraum, eigener Datumsbereich, aktueller Monat / aktuelles Quartal; alle Gantt-Aufgaben, aktive Filter, ausgewählte Phasen, ausgewählte Aufgaben, Meilensteine/Gates
- Ein- und Ausschalter für Projektphasen, Besitzer, Status, Fortschritt, Datumsangaben, Baselines, Marker, Abhängigkeiten, Puffer, Risiken, Wochenenden, Feiertage, Heute-Linie, Legende, Farben sowie Kopf-/Fußzeile
- Projekt- und Phasenfarben, heller Papierhintergrund bei dunklen und Hybrid-Designs; weitgehend vektorbasierte Druckdarstellung

## Grenzen und noch nicht erfüllte Abnahmekriterien

- Für Abhängigkeiten innerhalb einer einzelnen Seite werden SVG-Pfeile gerendert. Bei Zeit- oder Zeilenumbrüchen werden Vorgänger als Textreferenz ausgegeben, aber **kein durchgehender seitenübergreifender Pfeil** gezeichnet. Die Textreferenzen enthalten die Projekt-ID und sind nicht als Navigationsreferenzen aufbereitet.
- Statuslinie, relativ berechnete Zieltermine, Gate-/Meilenstein-Kollisionsvermeidung, unabhängige Legenden-/Titelseiten sowie Management-Kennzahlen sind noch nicht vollständig implementiert.
- Beim Quartal wird bisher das **aktuelle Quartal** unterstützt, keine explizite Quartalsauswahl. Weitere Diagrammoptionen wie individuelle Feiertagslegenden und Seitenüberlappung fehlen.
- Bei sehr langen Einzelbeschriftungen wird die Zeilenhöhe geschätzt. Extrem lange Texte können weiterhin durch das Seitenlimit begrenzt werden.
- Die tatsächliche PDF-Ausgabe muss durch den Chromium-Test `tests/print-pdf.spec.cjs` einschließlich PDF-Seitenzahl, Textinhalt, Papiergröße und Screenshot überprüft werden. Eine zusätzliche visuelle Red-Team-Abnahme der PDF-Seiten ist offen.
- Browser-/Druckertreiber-Einstellungen können `@page`-Größen und Hintergründe verändern. Das Dokument ist eine Vorgabe für den Druckdialog, keine Garantie für jeden Treiber.

## Tests

`tests/print-model.spec.mjs` prüft unter anderem Snapshot-Isolation, Filter, Phasenauswahl, mehrjährige Zeitachsen und 2D-Seitenabdeckung. `tests/print-dialog.spec.cjs` prüft Browser-Scrollunabhängigkeit, responsive Vorschau und hellen Hintergrund. `tests/print-pdf.spec.cjs` erzeugt ein echtes Chromium-PDF und kontrolliert es maschinell mit `pdfinfo` und `pdftotext`; Vorschau-Screenshot und PDF werden in `visual-review/` gespeichert.

**Freigabestatus: Draft.** Ohne fehlerfreie Browser-PDF-Ausgabe, visuelle Abnahme und Nacharbeit der kritischen Lücken ist ein Merge in `main` nicht zulässig.
