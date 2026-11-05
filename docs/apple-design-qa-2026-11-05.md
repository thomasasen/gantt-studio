# Apple-Design-Qualitätssicherung · 05.11.2026

## Prüfgegenstand
Design 2.0 von Gantt Studio mit Demoprojekt-Lader. Maßstab: `AGENTS.md`, `docs/design-guidelines.md` und der projektspezifische Apple-Design-Skill. Ziel war eine belastbare Prüfung von Lesbarkeit, Komponenten- und Feldkonsistenz, responsiven Ansichten, Nutzerkontrolle und Planungspräzision, **kein** macOS-Nachbau.

## Prüfmatrix und Ergebnis
- Visuelle Chromium-Screenshots für Projektplan, Planungsansicht, Designdialog sowie das vollständige Demoprojekt mit zehn Aufgaben und fünf Phasen.
- Responsive Tests bei **1440, 1024, 768 und 390 CSS-Pixeln**, einschließlich Wechsel zwischen Desktop und Mobil während einer laufenden Sitzung.
- Formulare: identische Oberkanten/Höhen innerhalb einer Zeile; Aufgaben-, Planungs- und Designfelder.
- Bedienung: Tab-Navigation, Tastaturfokus, Dialog-Abbruch, Gantt-Drag/Resize und Escape, exakter Datumssnap, Speichern und mehrfacher Demoprojekt-Import.
- Axe-Core WCAG-2.1-AA-Checks für sieben Zustände: leeres Projekt, Demoprojekt Desktop, Planung Desktop, Design- und Aufgabendialog, Demoprojekt Mobil sowie Planung Mobil.
- **Letzter vollständiger Lauf auf dem QS-Branch: 19 Playwright-Tests bestanden; 0 automatisch erkannte WCAG-Verstöße in den sieben geprüften Zuständen.** Die Ergebnisse liegen als CI-Artefakt `apple-design-qa` vor.

## Befunde und Korrekturen
| Priorität | Nachgewiesener Befund | Korrektur |
| --- | --- | --- |
| Hoch | Abbrechen/Schließen nativer Aufgaben- und Elementdialoge wurde bei leeren Pflichtfeldern von HTML-Validierung blockiert. | Zehn Abbruch-Submit-Controls mit `formnovalidate` versehen; Regressionstest ergänzt. |
| Hoch | Beim Wechsel von breiter auf mobile Ansicht blieb die feste Gantt-Spalte 430 px breit statt 190 px; die Zeitachse war kaum sichtbar. | Gantt-Geometrie wird bei Änderungen der responsiven `--left-width`-Stufe neu berechnet und Scrollposition erhalten. |
| Mittel | Die vierte Kennzahl füllte auf Mobilgeräten wegen einer geerbten CSS-Regel die ganze Zeile. | Vier-Karten-Raster korrigiert und getestet. |
| Hoch | Sekundäre Datums-, Aufgaben- und Dialogtexte unterschritten teils den Kontrast von 4,5:1 (z. B. 3,92:1 oder 4,31:1). | Betroffene Komponenten verwenden den stärkeren Text-Token `--ui-muted`; die geprüften Flächen erreichen mindestens ca. 5,35:1. |

## Was ausdrücklich noch nicht abgedeckt ist
- Frei wählbare, stark abweichende Projektfarben, besonders dunkle Panels oder helle Primärfarben. Dafür ist eine zusätzliche Kontrastvalidierung des Design-Editors sinnvoll.
- Ein vollständiger manueller Screenreader-Test, reales Touchverhalten und Browserabnahmen in Safari/Firefox/Edge. Automatisch geprüft wurde Chromium.
- Eine gesonderte visuelle Abnahme bei echtem 200-%-Browserzoom und auf Papier/PDF; CSS- und responsive Prüfungen ersetzen diese nicht vollständig.
- Die langfristige Bereinigung der älteren CSS-Kaskade. Das neue Stylesheet enthält weiterhin gezielte Overrides auf bestehende Regeln.

## Wartung
Tests: `tests/ui.spec.cjs` und `tests/apple-design-audit.spec.cjs`. CI: `.github/workflows/ui-regression.yml`. Die Berichte und Desktop-/Mobilbilder werden als Workflow-Artefakte archiviert. Weitere UI-Änderungen dürfen diese Prüfschritte nicht entfernen.

**Bewertung:** Im geprüften Standarddesign sind die gefundenen Qualitätsmängel behoben und die automatisierten QS-Gates erfüllt. Eine uneingeschränkte WCAG-Konformitätszusage wäre ohne die oben genannten manuellen und alternativen Farb-/Browserprüfungen nicht seriös.
