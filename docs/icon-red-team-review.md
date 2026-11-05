# Icon-System – Red-Team-Review (UX / Architektur / QA)

**Referenz:** Ausgangsstand `main` vom 05.11.2026, Commit `09bc8c5`. Änderungen in PR #12.

## 1. UX-Design – kritische Sicht

| Befund | Schwere | Korrektur |
| --- | --- | --- |
| Inkonsistente Zeichen in Dialogen, Tabellen, Phasen und Drag-Griffen | Mittel | Zentrale Lucide-artige Outline-SVGs statt verschiedenster Unicode-Glyphen; einheitliche Chevron- und Griffzuordnung |
| Die längeren Icon+Text-Buttons verdrängten „Weitere Einstellungen“ bei 1440 px in eine zweite Zeile | Mittel | Beschriftung auf „Einstellungen“ verkürzt; Playwright schützt die gleiche Zeilenhöhe gegenüber dem Zeitskalen-Control |
| „Alle ausklappen/einklappen“ verwendete gegensinnige Doppelpfeile, deren Formen sich zu wenig unterscheiden | Niedrig | Zwei übereinanderliegende Chevrons nach unten bzw. oben |
| Zusätzlicher Bearbeiten-Stift verschob zunächst die Farbmuster am Ende von Phasen-/Terminzeilen | Niedrig | Farbmuster wieder als letztes Element, Stift davor |
| Icon-Überfrachtung wäre in KPI-Karten und Gantt-Raster kontraproduktiv | Mittel | KPI- und Fachnotation unverändert, primär Aktionen illustriert |

## 2. Frontend-Architektur – kritische Sicht

- Keine Sprite-CDN-, Icon-Font- oder Frameworkabhängigkeit. Markup stammt aus fester Registry und verwendet `currentColor`.
- `hydrateIcons` ersetzt ausschließlich innere Platzhalter-Inhalte, nie Buttons, Handles, Tabellenreihen oder deren gebundene Events. Dynamische Templates verwenden denselben zentralen `icon()`-Generator.
- Keine Änderung an IndexedDB, Import-/Export-Schema, `displayOrder`, Drag-Datumslogik, Undo/Cancel oder gespeicherten Projektdaten.
- Cache-Risiko: `app.js` und sämtliche statischen Imports sowie `gantt.js` → `icons.mjs` erhalten einheitlich `v=2.6.0`; statischer Regressionstest erweitert.
- CSS-Ergänzung nur in kanonischer `design-system.css`, erbt Farben/States vom jeweiligen Control. Größentokens für SVGs; keine unkontrollierten Farbüberschreibungen.

## 3. QA und Accessibility – kritische Sicht

- Playwright prüft alle elf Designs auf `currentColor`, erhaltene Klickbarkeit, Dialog-/Navigationsevents und Pointer-Transparenz der SVGs.
- Icon-only in Dialogen und Inline-Editoren mit `aria-label`, der Rest mit sichtbaren Textlabels; dekorative SVGs sind `aria-hidden`.
- Bestehende Regressionen prüfen Import/Export, Gantt-Drag/Resize, Tastatursortierung, Designs und WCAG-Axe-Regeln. Zusätzlicher Test simuliert Reflow bei 200 % Zoom als halbierten CSS-Viewport; echter Browser-Zoom und reale Screenreader bleiben separate manuelle Abnahmefälle.
- Desktop-, Tablet-/Mobile- und Print-Zustände durch bestehende Tests und Screenshot-Artefakte abgedeckt.
- Die ersten visuellen Aufnahmen enthielten eine temporäre Demo-Toast-Überlagerung; die reproduzierbaren Vergleichsaufnahmen blenden nur für den Screenshot diese Meldung aus.

## Merge-Gate

Aktuelle CI- und Screenshot-Auswertung in [PR #12](https://github.com/thomasasen/gantt-studio/pull/12) prüfen. Ein grüner Workflow allein ersetzt keine Sichtprüfung. Wenn die Zeilenkonsistenz oder eine WCAG-Prüfung fehlschlägt, ist ein Merge ausgeschlossen.
