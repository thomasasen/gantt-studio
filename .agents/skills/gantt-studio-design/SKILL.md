---
name: gantt-studio-design
description: Projektspezifische Apple-inspirierte UI-/UX-Regeln für Gantt Studio. Bei Änderungen oder Reviews von Gantt-Timeline, Drag/Resize, HTML, CSS, Formularen, Dialogen, Aufgabentabellen, Navigation, Feedback, Animation, Responsive Design und Accessibility verwenden. Nicht für rein datenbezogene Arbeiten ohne UI-Bezug.
---

# Gantt Studio Design

Dieser lokale Codex-Skill adaptiert die relevanten Prinzipien von [Emil Kowalskis apple-design](https://github.com/emilkowalski/skills/tree/main/skills/apple-design) für ein präzises, informationsreiches Gantt-Planungswerkzeug. Die Projektvorgaben aus `AGENTS.md` und `docs/design-guidelines.md` gehen bei Konflikten vor. Kein Apple-Lookalike und kein visuelles Redesign ohne konkreten Auftrag.

## Vorgehen

1. `AGENTS.md`, `docs/design-guidelines.md` und betroffene bestehende Implementierungen lesen (Gantt: `assets/js/gantt.js`, Anwendung: `assets/js/app.js`, Styles: `assets/css/`).
2. Für jede Interaktion Start, laufende Vorschau, Commit, Abbruch, Fehlerfall, Tastaturweg und Speicherzustand definieren.
3. Bestehende Komponenten und Design-Tokens wiederverwenden; CSS-Override-Schichten vermeiden und keine unnötigen Bibliotheken hinzufügen.
4. Rückmeldung, Interaktionsmechanik und visuelle Gestaltung gemeinsam implementieren; fachliche Logik unverändert oder explizit abgesichert halten.
5. Abnahmecheckliste aus den Designrichtlinien anwenden, Regressionen prüfen und offene Testlücken nennen.

## Reaktion und direkte Manipulation
- Auf Pointer-Down **sofort** visuelles Feedback; fachliche Änderung erst beim gültigen Commit.
- Bei Drag und Resize 1:1-Bewegung mit dem Pointer, Greifversatz erhalten, Pointer Capture korrekt verwenden und Klick vs. Drag durch kleine Bewegungsschwelle unterscheiden.
- Feedback während des gesamten Drags, nicht erst beim Loslassen. Keine künstlichen Verzögerungen oder blockierenden Animationen.
- Pointer-Up validiert und speichert genau einmal. Pointer-Cancel und Escape **verwerfen** die Vorschau ohne Commit. Listener, Capture und temporäre Stile zuverlässig aufräumen.
- Datum, Dauer und Fortschritt aus tatsächlicher Bewegung ermitteln; exakt auf das Tagesraster rasten, Mindestdauer, Abhängigkeiten und gültige Grenzen respektieren.
- **Keine Momentum-Projektion, kein Bounce, Overshoot oder Rubber-Banding für fachliche Terminwerte.** Die Gantt-Balken dürfen sich nach Loslassen nicht eigenmächtig weiterbewegen.
- Gleichwertige Bearbeitungsmöglichkeit über Tabelle/Editor für Tastaturbedienung erhalten.

## Unterbrechbare Animation und Raumgefühl
- Panels, Dialoge und Popover bleiben während Übergängen steuerbar. Bei neuer Interaktion vom aktuellen visuellen Zustand starten.
- Öffnen und Schließen entlang konsistenter Wege; Popover an ihren Auslösern verankern.
- Federbewegungen nur für nicht-semantische Oberflächen, vorzugsweise ohne Überschwingen. Keine Federn in Gantt-Drag-Vorschauen.
- Bewegung nur für verständliche Ursache/Wirkung einsetzen; keine Dauerschleifen, Sound-/Haptikdekoration oder Blur-Effekte in Datenrastern.
- Häufige visuelle Updates möglichst compositorfreundlich über Transform/Opacity und gezieltes requestAnimationFrame; keine teuren Full-Renderings oder IndexedDB-Schreibvorgänge pro Pointer-Move.
- Speicherrückmeldung erst bei tatsächlichem Erfolg geben.

## Typografie, Materialien und Konsistenz
- Gantt und Tabelle haben höchste visuelle Priorität. Systemnahe gut lesbare Schrift, geeignete Größen/Zeilenhöhen/Laufweiten und klare Gewichtung einsetzen.
- Formulare: Felder derselben Reihe gleich hoch und oben exakt ausgerichtet, auch bei gemischten Input/Select/Date/Number-Typen. Labels auf gemeinsamer Ebene; Hilfe- und Fehlertexte **darunter**, ohne Nachbarfelder zu verschieben.
- Wiederkehrende Höhen, Abstände, Radien und Farben zentral definieren. Gleiche Komponenten müssen gleich aussehen und reagieren.
- Keine unlesbaren transparenten Flächen oder übereinandergeschichtetes Glas vor Zeitleiste/Tabellen. Sparsame Schatten und funktionale Trennung erlaubt.
- Häufige Handlungen nicht zugunsten minimalistischer Optik verstecken; seltene Handlungen sinnvoll gruppieren.
- Projektindividuelle Farben und Printansicht behalten.

## Kontrolle und Accessibility
- Status, Abschluss, Warnungen und Fehler verständlich und kausal anzeigen. Fehler in der Nähe des betreffenden Controls erklären; keine rein farblichen Signale.
- Fokus sichtbar gestalten, Labels und ARIA sinnvoll setzen, Dialoge per Tastatur nutzbar halten. Keine Sackgassen bei der Navigation.
- `prefers-reduced-motion: reduce`, bei Nutzung von Glas auch `prefers-reduced-transparency: reduce`, und erhöhten Kontrast beachten.
- Bei 200-%-Zoom und vergrößerter Schrift muss die Oberfläche bedienbar bleiben.
- Destruktive Aktionen schützen, ohne unnötige Bestätigungsdialoge; Abbruch/Undo wo möglich.

## Definition of Done
Prüfen: Feldgeometrie inkl. Hilfetext; Balken-Move, Resize links/rechts, Fortschritt, 1-Tages-Grenze, Cancel und Escape; korrekte Speicherung und Synchronisierung mit Tabelle; Maus/Tastatur/Touch soweit unterstützt; Breiten 1440/1024/768/390 CSS-Pixel; 200-%-Zoom; Fokus, Kontrast, reduzierte Bewegung; Druck und Performance. Bestehende GitHub-Validierung und geeignete Browsertests ausführen, fehlende Tests benennen. Die ausführlichen Kriterien stehen in `docs/design-guidelines.md`.
