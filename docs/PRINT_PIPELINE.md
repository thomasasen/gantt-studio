# Druck-Pipeline (Feature-Branch)

## Architekturentscheidung

Die Druckausgabe verwendet nicht die DOM-Struktur oder das Scrollfenster des Native-Renderers. Aus einem kopierten Projektsnapshot erzeugt `assets/js/print/print-model.mjs` eine eigenständige Projektion und eine zweidimensionale Paginierung. `assets/js/print/print-ui.mjs` rendert HTML/SVG-Seiten in einem isolierten `iframe`. Die Vorschau und die spätere Browserdruckausgabe verwenden dasselbe Dokument. Über den Browserdruckdialog kann als PDF gespeichert werden.

Die Projektdatei und IndexedDB werden durch die Druckfunktion nicht geschrieben. Optionen werden getrennt in `localStorage` unter `gantt-studio.print-preferences-v1` gespeichert. Der Snapshot wird beim Öffnen erzeugt und beim Schließen freigegeben.

## Technische Grenzen und offene Abnahmepunkte

- Das Browser-Druckdialogfenster bestimmt letztlich den Drucker und seine Skalierungsoptionen. `@page` und CSS-mm sind Vorgaben, keine für jeden Druckertreiber erzwingbare Zusicherung.
- Die 2D-Aufteilung ordnet horizontale Zeitabschnitte und vertikale Aufgabenabschnitte zu. Ein Querformat mit mehrjähriger Timeline benötigt mehrere Seiten, statt die Schrift zwangsläufig unleserlich zu schrumpfen.
- Abhängigkeits-Pfeile über Seiten hinweg, Ferien/Feiertagsdarstellung, Risiken/Puffer/Statuslinie, frei auswählbare Phasen/Aufgaben, zusätzliche Berichtstitelseite, benannte Benutzerprofile und gesonderter Vorschauzoom sind in diesem Stand **noch nicht umgesetzt**.
- Die Legende ist eine einfache Typenlegende. Besonders lange Bezeichnungen werden mit CSS-Ellipsis abgeschnitten; für die vollständige Textausgabe sind Umbruchregeln zu ergänzen.
- Ein Projektwechsel mit offenem Dialog hält den Snapshot fest; Filterkontext wird aktuell bei Neuberechnung gelesen und muss ebenfalls mit dem Snapshot eingefroren werden.
- PDF-Ausgabe sowie Seitenabmessungen müssen in Chromium/Playwright visuell überprüft werden, bevor eine Freigabe erfolgen kann.

## Validierung

- `node --test tests/print-model.spec.mjs`: Projektsnapshot, Zeitachsen- und Aufgaben-Paginierung, Format/Ausrichtung, Filter- und Datumsbereich.
- `tests/print-dialog.spec.cjs`: Dialog, scrollunabhängiger Ausdruck und heller Druckhintergrund.
- GitHub Actions `validate.yml` prüft statische Dateien und Syntax sowie den neuen Node-Test.

**Status:** Implementierung in Arbeit, nicht für Merge freigegeben.
