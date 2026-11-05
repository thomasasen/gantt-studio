# Icon- und Symbolsystem – Gantt Studio

**Verbindlich ab UI-Version 2.6.0.** Ergänzt [design-guidelines.md](design-guidelines.md); dort definierte Prioritäten, Geometrie und Farbwelten haben Vorrang.

## Ziel und technische Grundlage
- Eine einzige Familie für **Bedien-Icons**: lokal eingebettete, Lucide-inspirierte 24er-Outline-Pfade in `assets/js/icons.mjs`. Keine externen Fonts, Emoji, CDN, separate UI-Bibliothek oder Netzwerkanfrage; Quellgeometrie unter ISC (Lucide).
- `icon(name)` erzeugt ausschließlich bekannte, dekorative SVGs mit `aria-hidden="true"`, `focusable="false"`, `currentColor`, runden Enden und konsistenter Strichstärke 1,8. `hydrateIcons()` füllt `data-icon`-Platzhalter, ohne die bedienbaren Elternknoten/Event-Handler zu ersetzen.
- Standardgröße 18 px, engere Metadaten 14–16 px, Dialog-Schließen 20 px. SVG-Ansichtsfenster stets 24 × 24; Trefferfläche ist die Schaltfläche, nicht die Zeichnung. CSS-Zentrum ist `assets/css/design-system.css` mit `--ui-icon-size`.
- **Fachliche Gantt-Notation** (Meilenstein-Raute, Gate, Baseline, Puffer, Risiko, Status, Abhängigkeit, Fortschritt) bleibt als eigens erklärtes diagrammatisches Zeichensystem bestehen. Diese Grafiken sind keine Toolbar-Icons.

## Verbindliche Funktionszuordnung

| Funktion | Icon-Name | Typischer Einsatz |
| --- | --- | --- |
| Projekt/Aufgabe/Phase hinzufügen | `plus` | Icon + Text |
| Bestehendes Element bearbeiten | `pencil` | Icon + Text in Tabelle |
| Löschen | `trash-2` | Icon + Text, bestehende Sicherheitsabfrage |
| Speichern/gespeichert | `check` | Speicherstatus mit Text, nicht als Export-Schaltfläche |
| Laufender Speicherprozess | `loader-circle` | Status mit „Speichert…“ |
| Speicherfehler | `circle-alert` | Status mit „Nicht gespeichert“ |
| Import von Projekt/Feiertagen | `upload` | Icon + Text |
| Export | `download` | Icon + Text |
| JSON-/CSV-Datei | `file-json` / `file-spreadsheet` | Exportdialog |
| Druck/PDF | `printer` | Exportdialog |
| Projektplan | `chart-gantt` | Navigation |
| Planung | `calendar-days` | Navigation/Zeitplanung |
| Filter | `filter` | Dropdown |
| Darstellung und Optionen | `sliders-horizontal` | Einstellungen |
| Farbvorlagen | `palette` | Design |
| Hilfe | `help-circle` | Hilfe und Legende |
| Einzelne Phase ein-/ausklappen | `chevron-up`, `chevron-down`, `chevron-right` | Zustandsabhängig |
| Alle Phasen auf-/zuklappen | `chevrons-down`, `chevrons-up` | Eindeutige Richtungszeichen |
| Manuelle Reihenfolge | `grip-vertical` | Ausschließlich Drag-Griff |
| Externer Dokumentlink | `external-link` | Link + Text |
| Bestätigen/Abbrechen | `check` / `x` | Icon-only nur mit `aria-label` |
| Zur Zeitlinie springen | `arrow-right-to-line` | Icon + Text |

Nicht dieselbe Form für zwei widersprüchliche Funktionen einsetzen; vor neuen Icons zunächst die Registry prüfen. Kein Icon-Dekor für KPI-Karten, jede Datumszelle oder jede Überschrift.

## Zugänglichkeit und Verhalten
- Ein Icon im beschrifteten Button ist **dekorativ**; der sichtbare Text bleibt die accessible name. Icon-only benötigt `aria-label` und, bei Bedarf, `title`.
- Zustandswechsel dürfen nicht nur die Form/Farbe ändern: `aria-expanded`, `aria-pressed`, Live-Region und sichtbare Texte bleiben maßgeblich.
- SVGs erhalten `pointer-events:none`; die gesamte Schaltfläche bleibt klickbar. Nie einen Event-Handler auf den SVG-Pfad binden.
- Farben ausschließlich über `currentColor` und vorhandene Oberflächen-Tokens. Keine kodierten Schwarz-/Weiß-Fills. Alle 11 Farbwelten einschließlich Hybrid und Druck prüfen.
- Hover/Focus/Active/Disabled werden am übergeordneten Control gestaltet. Touch-Ziele mindestens 44px, wo praktikabel, Gantt-Griff mit Tastaturalternative.
- Neue statische `data-icon`-Platzhalter werden beim Bootstrapping hydratisiert. Dynamische Templates verwenden `icon(name)` direkt; neue Imports müssen die gemeinsame Versionskennung des ESM-Graphen besitzen.

## Bestandsaufnahme (Stand main vor Umsetzung)
- `index.html`: uneinheitliche `+`, Vollbreiten-Plus, `⇩`, `▾`, `▸`, `⌄`, `⌃`, `×`, `✓` in Navigation, Tabellenkopf, Akkordeons und Dialogen.
- `app.js`: andere `▶/▼` für Phasen; weitere Varianten `✓/×` in Inline-Editoren; `⠿` in der Tabelle; `↗` als Dokumentlink, `!` als Speicherfehler.
- `gantt.js`: `▶/▼` und `⠿` in der linken Aufgabenliste.
- Teilweise vollständig ausgeschriebene, aber ungruppierte Aktionen ohne Icon, besonders Export, Import, Projektverwaltung und Toolbars.
- Fachliche Notation bleibt bewusst erhalten. Drag-Handle und Chevron sind dagegen **Interaktionssymbole**, daher vereinheitlicht.

## Prüfregeln
Tests müssen die vollständige ESM-Versionierung, korrektes Mounting, Zugänglichkeitsnamen, eventfreie SVGs, reaktive Chevron-Zustände, Drag-Griff-Parität, 11 Designs und Druck prüfen. Visuelle Browser-Screenshots vor/nach dem Wechsel archivieren; ein Code-Review allein reicht nicht.
