# Gantt Studio – verbindliche Agent-Anweisungen

Diese Datei gilt repositoryweit. Bei Änderungen an HTML, CSS, Gantt-Interaktionen, Tabellen, Formularen, Dialogen, Navigation, responsivem Layout oder Accessibility **zuerst** `docs/design-guidelines.md` und `.agents/skills/gantt-studio-design/SKILL.md` lesen.

## Prioritäten
1. Fachlich korrekte Projektplanung, Datenintegrität, sichere Persistenz.
2. Barrierefreiheit, Lesbarkeit, vorhersehbare und präzise Bedienung.
3. Einheitliche Komponenten und Layouts sowie Performance.
4. Dekorative Optik und Animation.

Die Regeln adaptieren [apple-design von Emil Kowalski](https://github.com/emilkowalski/skills/tree/main/skills/apple-design). Bei Widersprüchen gilt die projektspezifische Richtlinie vor dem Original. Gantt Studio soll nicht macOS imitieren.

## Architektur und Funktionsschutz
- Browserbasierte statische HTML/CSS/JS-Anwendung auf GitHub Pages; keine Design-Frameworks oder Animationsbibliotheken ohne funktionalen Mehrwert.
- IndexedDB für Projekte, localStorage für Ansichtspräferenzen und bestehendes JSON-Format samt Import/Export und Auto-Save erhalten.
- Datumslogik, Zeitskalen, Abhängigkeiten, Baselines, Status, Druckansicht und Synchronisierung Gantt ↔ Tabelle schützen.
- „Kritisch“ ist derzeit eine manuelle Kennzeichnung, keine berechnete CPM-Funktion.
- Projektfarben, Design-Presets und lokale Speicherhinweise respektieren.
- Wiederkehrende CSS-Werte zentralisieren statt weitere widersprüchliche Overrides zu ergänzen.

## Verbindliche UX-Anforderungen
- **Alle Felder in derselben Formularzeile beginnen auf derselben Höhe und haben dieselbe sichtbare Höhe.** Labels bleiben ausgerichtet; Hilfe- und Fehlertexte stehen unterhalb der Felder, ohne andere Felder nach unten zu verschieben.
- Direkte Gantt-Manipulation folgt dem Pointer ohne verzögernde Effekte. Datumsänderungen sind exakt: kein Momentum oder Springen auf einen anderen Tag.
- Pointer-Cancel und Escape verwerfen eine laufende Interaktion. Nur ein gültiger Pointer-Up/Commit darf speichern.
- Unmittelbares Feedback, zuverlässiger Speicherstatus, Fokus mit `:focus-visible`, Tastaturalternative, ausreichender Kontrast, reduzierte Bewegung.
- Statusinformationen nie ausschließlich über Farben vermitteln. Animationen dürfen Eingaben nicht blockieren.

## Qualitätssicherung
Vor Abschluss betroffene Fälle aus `docs/design-guidelines.md` prüfen: Feldhöhen/-ausrichtung, Drag/Resize/Cancel, Datumssnap, Editoren und Tabellensynchronisierung, Speichern, Tastatur/Fokus, verschiedene Viewports, 200-%-Zoom, reduzierte Bewegung, Druck und Performance. Bestehenden Workflow `.github/workflows/validate.yml` ausführen und gezielte Browsertests ergänzen. Nicht ausgeführte Tests klar benennen.

Neue oder geänderte UI-Standards zuerst in `docs/design-guidelines.md` aktualisieren; AGENTS.md und Skill dürfen dem Dokument nicht widersprechen.
