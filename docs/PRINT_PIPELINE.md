# Engineunabhängige Druck- und PDF-Pipeline

## Ausgabeformate

- **PDF:** Mehrseitiger Ausdruck über den Browserdruckdialog, A4/A3 und Hoch-/Querformat.
- **PNG/JPG:** Ein einziges zusammenhängendes Bild des vollständigen Gantt-Diagramms; keine Papierseiten, keine ZIP-Datei und kein Screenshot des Viewports. Aufgaben- und Zeitraumauswahl werden aus demselben unveränderlichen Projekt-Snapshot übernommen.
- Die SVG-Bildkomposition verwendet eine eigene Aufgaben-/Zeitachsenprojektion einschließlich Phasen, Meilensteinen, Balken, Fortschritt, Markern, Baselines und Abhängigkeiten. SVG wird lokal über Canvas in PNG beziehungsweise JPG umgewandelt.
- Wählbare Bildauflösung 1×/2×/3× sowie JPG-Qualität 80/90/100 %. Bei Überschreiten von Browser-Canvas-Grenzen bricht der Export mit verständlicher Meldung ab, statt abzuschneiden.
- Das Dialogformular besitzt bündige, gleich hohe Eingabefelder und Aktionen; die Vorschau wechselt zwischen Druckseiten (PDF) und Gesamtübersicht (PNG/JPG).

## Architektur

Die Anwendung verwendet einen unabhängigen, unveränderlichen Projektsnapshot und erzeugt neue Druckseiten statt den aktuell sichtbaren Gantt-Viewport zu kopieren.

- `assets/js/print/print-model.mjs`: Projektion, Aufgaben-/Phasenauswahl, Datumsgrenzen, Layoutparameter und zweidimensionale Paginierung, ohne Bezug auf Native/Frappe
- `assets/js/print/print-ui.mjs`: eigener Dialog, HTML-/SVG-Druckseiten, Vorschau in `iframe`, Bildformatwechsel, Navigation und Browserdruckdialog
- `assets/js/print/print-export.mjs`: reine, engineunabhängige SVG-Diagrammkomposition und lokale PNG-/JPG-Generierung
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

**QS:** Browser- und PDF-Tests sind vor einem Merge auszuführen. Die oben genannten fachlichen Drucklücken bleiben dokumentiert.
