# Designrichtlinien – Gantt Studio

**Status: verbindlicher Designvertrag; Design 2.0 ist in der Anwendung umgesetzt.** Gestaltung und Interaktionen werden weiter anhand dieser Anforderungen geprüft.

Diese projektspezifischen Regeln adaptieren [Emil Kowalskis apple-design-Skill](https://github.com/emilkowalski/skills/tree/main/skills/apple-design) (MIT): unmittelbar wahrnehmbares Feedback, direkte und unterbrechbare Interaktionen, räumliche Orientierung, bewusst eingesetzte Materialien, Typografie und Accessibility.

## 1. Priorität und Zielbild
Gantt Studio ist ein browserbasiertes Planungstool mit hoher Informationsdichte. Fachliche Genauigkeit und Datenintegrität > Bedienbarkeit und Accessibility > Layoutkonsistenz und Performance > visuelle Effekte.

Keine macOS-Kopie, kein Funktionsverlust zugunsten des Minimalismus, keine Animationsbibliothek ohne klaren Bedarf. Der Zeitplan und die Aufgabentabelle bleiben die primären Flächen. Projektdaten bleiben lokal in IndexedDB, Ansichtspräferenzen in localStorage; JSON-Schema, Speichern, Export und Projektfarben respektieren.

## 2. Feldgeometrie und Layout

**Alle Felder innerhalb derselben visuellen Formularzeile müssen dieselbe sichtbare Höhe haben und auf einer gemeinsamen Oberkante stehen.** Das gilt auch bei Kombinationen von Text, Select, Datum, Zahlenwert, Einheit oder Farbe.

- Labeltexte auf einer gemeinsamen Höhe oberhalb der Bedienelemente ausrichten. Unterschiedliche Labellängen dürfen kein Feld nach unten versetzen.
- Hilfetexte, Validierungsfehler und Beschreibungen **unter das jeweilige Feld** setzen. Die Position oder Höhe der benachbarten Felder bleibt unverändert.
- Einheitliche Height-/Padding-/Radius-/Fokus-Token als CSS Custom Properties nutzen. Keine Kaskade immer neuer Sonderüberschreibungen.
- Eingabefelder mit Suffix wie „Tage“ als einheitlich hohe Gruppe behandeln.
- Responsive Raster auf weniger Spalten reduzieren; Formulare, Menüs und Dialoge dürfen keinen unnötigen horizontalen Overflow erzeugen.
- Touch-Ziele möglichst 44 × 44 CSS-Pixel groß oder durch eine ausreichende Trefferfläche kompensiert; Desktop kann optisch kompakter bleiben.

## 3. Typografie und visuelle Hierarchie
- Systemnahe Schrift bevorzugen; Schriftgrad, Gewicht, Laufweite und Zeilenhöhe passend kombinieren. Zoom und vergrößerte Nutzerschrift respektieren.
- Zielwerte: regulärer UI-Text überwiegend 14–16 CSS-Pixel; sekundäre Texte möglichst mindestens 12 CSS-Pixel. Kleinere vorhandene Definitionen schrittweise bereinigen, ohne die Datendichte zu zerstören. Der Textkontrast in der Standardgestaltung muss für normalen Text mindestens 4,5:1 betragen, einschließlich alternierender Tabellenzeilen.
- Gantt-Balken, Datumsraster, Aufgaben und Status klar unterscheidbar. Status/Risiko nie nur über Farben ausdrücken.
- Projektspezifische Presets/Farben und Kontrast berücksichtigen. Kein gestapeltes Glassmorphism oder transluzente Schichten über wichtigen Daten. Dezente Tiefe nur zur Orientierung.
- Die hellen Farbvorlagen sind **Gantt Studio, Neutral, Nordlicht, Sandstein, Waldgrün und Marine**. Ergänzt werden drei **vollwertige dunkle Farbwelten: Mitternacht, Graphit und Waldnacht**.
- **Hybrid-Designs Fjordlicht und Kupferatelier:** Dunkle, ruhige Oberflächen für Topbar, Projektkopf, KPI-Karten, Navigation und Arbeitsleisten; heller, entsättigter Datenbereich für Gantt-Raster, Aufgabenliste und Tabelle. Die Planungsformulare bleiben ebenfalls hell, die Planungs-Kopfleiste dunkel. Diese visuelle Trennung ist fachlich begründet: Steuerung versus konzentrierte Datenarbeit.
- Keine zufälligen Dark/Light-Mischungen oder reine Schwarz-Weiß-Flächen. Für Hybrid-Designs wird der Modus aus dunklem `pageBg` und hellem `panelBg` erkannt, ohne das JSON-Projektformat zu ändern. Projektspezifische Farbänderungen und Wechsel zwischen Projekten müssen Hell/Dunkel/Hybrid zuverlässig wechseln.
- Für gemischte Designs ist der Übergang von dunklen Bedienbereichen auf helle Datenflächen bewusst. Insbesondere Buttons, Inline-Editoren, Datumsraster, Statusmeldungen und WCAG-Kontraste sind auf **beiden** Materialebenen zu prüfen. Druckausgaben bleiben durchgängig hell.
- Dunkle Designs dürfen nicht nur Farben austauschen: Die kanonische Oberflächenebene muss Topbar, Gantt-Raster und Balken, Aufgabenliste, Tabelle, Phasen, Planung, Dialoge, Formulare, Status, Dropdowns, Drag-Vorschau und Fokuszustände konsistent dunkel darstellen.
- Dunkle Vorlagen nutzen niemals reines Schwarz/Weiß für große Flächen. Angestrebt sind ruhige abgestufte Oberflächen, normale Textkontraste mindestens 4,5:1 und kontrastfähige Balkenbeschriftungen, mit zurückhaltenden Akzenten und erkennbaren Phasengrenzen. Die Gantt-Interaktionsmechanik bleibt unverändert.
- Projektfarben bleiben im bestehenden JSON-Schema gespeichert. Dunkel/Hell wird anhand der Panelhelligkeit erkannt (einschließlich importierter und individuell bearbeiteter dunkler Paletten), ohne den Preset-Namen in die Daten zu schreiben. Ein Wechsel zwischen Projekten muss alte CSS-Overrides sauber entfernen.
- Print/PDF bleibt unabhängig vom aktiven dunklen Design auf hellem, gut lesbarem Papierhintergrund. Statusfarben behalten Text/Symbole; Farbauswahl allein erzeugt keine neue Statussemantik.
- Jede Vorlage besitzt eine nachvollziehbare Miniaturvorschau mit Bezeichnung und Kurzbeschreibung. Auswahl und Änderung einzelner Farben betreffen zunächst nur den Design-Dialog; **erst „Design speichern“** aktualisiert Projekt, IndexedDB und Gantt. Abbrechen muss den gespeicherten Stand vollständig erhalten.
- Die beiden bestehenden Vorlagen bleiben farblich unverändert. Neue Vorlagen verwenden für Primär-/Akzent- und Gantt-Markierungsfarben auf Weiß möglichst mindestens **4,5:1 Kontrast**. Der gespeicherte JSON-Projektstand enthält weiterhin reine Farben und keine vom Browser abhängige Vorlagen-ID; vorhandene Dateien bleiben kompatibel.
- Falls die manuelle Farbwahl von einer Vorlage abweicht, muss die Auswahl sichtbar als **individuell** gekennzeichnet werden. Wiedererkennen erfolgt über einen exakten Farbvergleich, ohne eine falsche Auswahl zu markieren.
- Häufige Aktionen sichtbar halten, sekundäre Funktionen logisch gruppieren und beschriften.

## 4. Gantt-Interaktionsvertrag

| Ereignis | Erwartetes Verhalten |
| --- | --- |
| Pointer-Down | Sofortiges visuelles Feedback, noch keine gespeicherte Änderung |
| Pointer-Move | Kontinuierliche 1:1-Vorschau, Grab-Offset erhalten, keine Persistenz pro Frame |
| Pointer-Up | Fachlich gültigen Wert auf exaktes Datumsraster abbilden, prüfen und einmal speichern |
| Pointer-Cancel | Vorschau zurücknehmen, keine Änderung übernehmen |
| Escape | Laufende Bearbeitung abbrechen |
| Ungültige Eingabe | Verständliches Feedback, keine stille Datenkorruption |
| Tastatur | Gleichwertige Änderung über Editor/Aufgabentabelle ermöglichen |
| Persistenzfehler | Fehlerstatus, niemals fälschlich „Gespeichert“ melden |

- Datumswerte niemals geschwindigkeitsabhängig weiterlaufen lassen; kein Bounce, Momentum oder Rubber-Banding im Zeitraster.
- Verschieben, linkes/rechtes Resize, Fortschrittsgriff, Mindestdauer und Abhängigkeiten separat testen.
- Pointer Capture und Listener beim Commit/Abbruch aufräumen; keine unbeabsichtigten Klicks nach Drag.
- Zeitleiste, linke Aufgabenliste, Pfeile, Baselines, Marker und Statuslinien müssen bei Zoom und Scroll konsistent bleiben. Bei responsiven Änderungen der linken Gantt-Spaltenbreite ist die Pixelgeometrie neu zu berechnen.
- Keine vollständigen Gantt-Neurenderings oder Datenbank-Schreibvorgänge auf jedem Pointer-Move.

## 4a. Manuelle Aufgabenreihenfolge
- `displayOrder` ist eine per Aufgabe gespeicherte **Darstellungsreihenfolge** innerhalb der bestehenden Phase (oder der Gruppe ohne Phase), keine Terminfolge und keine Vorgängerbeziehung.
- In der Aufgabentabelle und im Gantt müssen dieselben gefilterten Aufgaben in derselben phasenweisen Sortierung erscheinen. Phasen bleiben chronologisch nach ihrem Start sortiert.
- Die manuelle Sortierung ist der Standard. Bei Bestandsprojekten wird eine chronologische Ausgangsreihenfolge migriert; ein Umschalten auf „Nach Datum“ ändert das gespeicherte `displayOrder` nicht.
- Drag-and-drop nur am ausdrücklich gekennzeichneten Griff und nur innerhalb derselben Phase. Die linke Gantt-Aufgabenliste und die Aufgabentabelle bieten dieselbe Aktion mit identischer gespeicherter Reihenfolge. Die Datums-/Manuell-Schalter sind in beiden Bereichen synchron. Auf der rechten Zeitachse bleiben Balken-Drag und Resize unverändert. Ein anderer Phasenbereich oder eine gefilterte Gantt-Ansicht darf kein unbeabsichtigtes Umordnen auslösen.
- Das Verschieben einer Aufgabe darf weder `start`/`end`, `phaseId` noch `dependencies` verändern.
- Eine Pfeiltasten-Alternative am Griff ist erforderlich. Escape und Pointer-Cancel verwerfen die Vorschau ohne Persistenz. Erst der gültige Drop speichert einmalig; Speicherfehler führen zum Rollback.
- Der Order-Wert ist Teil der portablen Projektdatei und muss beim Import/Export und bei Projektwechseln erhalten bleiben.

## 5. Feedback, Animation und Raum
- Sofort auf Interaktion reagieren und während Bewegung laufend Feedback geben; Erfolg erst nach tatsächlich erfolgreicher Aktion melden.
- Menüs/Popover/Dialoge am Auslöser verankern, Öffnungs-/Schließrichtung konsistent halten und jederzeit unterbrechbar gestalten.
- Springs nur bei nicht-fachlichen Flächen, im Normalfall ohne Overshoot; keine Animation als Ersatz für exaktes Datums-Snapping.
- Compositorfreundliche Transform-/Opacity-Effekte bevorzugen und rAF gezielt einsetzen; nicht mit unkontrolliertem Blur, Schatten oder will-change in vielen Tabellenzeilen arbeiten.
- Reduced Motion beachten und größere Bewegungen durch sanfte Zustandswechsel oder statische Darstellung ersetzen. Bei Transparenzreduktion solide Flächen, bei erhöhtem Kontrast klarere Kanten.

## 6. Bedienung, Sicherheit, Datenzustand
- Nutzer erkennen jederzeit aktuelles Projekt, Arbeitsbereich und nächsten Schritt. Fokus sichtbar, Labels sinnvoll verknüpft, Dialoge mit Tastatur nutzbar.
- Der lokale Speicherstatus („Speichert…“, „Gespeichert“, „Nicht gespeichert“) bleibt korrekt, ebenso die Hinweise auf fehlende Cloud-Synchronisierung und notwendige Backups.
- Gantt, Tabelle, Editoren und gespeichertes Projekt müssen denselben Datenstand repräsentieren. Enter/F2/Escape-Konventionen bestehender Inline-Editoren erhalten.
- Destruktive Aktionen gegen Fehlbedienung schützen; Nutzerkontrolle und Abbruchmöglichkeit priorisieren. Natürliche Dialog-Abbruchaktionen müssen selbst bei ungültigen Pflichtfeldern funktionieren (z. B. `formnovalidate`).

## 6a. JavaScript-Auslieferung und Caching
- Bei Änderungen an einem ES-Modul, insbesondere neuen oder umbenannten **named exports**, müssen **sämtliche statischen Import-URLs** des Anwendungseinstiegspunkts `app.js` und dessen Versionskennung in `index.html` gemeinsam aktualisiert werden.
- Unversionierte ESM-Abhängigkeiten im Produktiv-Einstiegspunkt sind unzulässig: Neue `app.js` plus altes `design-presets.mjs` darf die Bedienoberfläche nicht vollständig deaktivieren.
- Ein Browser-Regressionstest simuliert einen Cache mit **veralteten Modulen für unversionierte URLs** und prüft, dass Navigation, Aufgaben- und Design-Buttons weiterhin reagieren.
- Caching-Probleme ohne Löschen von IndexedDB, localStorage oder Projektdaten beheben.

## 7. Umsetzung und Qualitätssicherung

Bestehende Architektur: `index.html`, `assets/js/app.js`, `assets/js/gantt.js`, `assets/js/storage.js`, `assets/css/`. Designänderungen zuerst über einheitliche Tokens und konsolidierte Komponenten; keine opportunistische Frameworkmigration.

**Prüfmatrix für betroffene Änderungen:**

1. **Formulare:** gleiche Input-Oberkante und Höhe pro Zeile bei langen Labels und Hilfs-/Fehlertexten; gemischte Typen und Einheiten.
2. **Gantt:** Move, beide Resize-Richtungen, Fortschritt, Mindestdauer, Pointer-Cancel, Escape, exakter Datums-Snap und kein Klick nach Drag.
3. **Daten:** Tabelle/Editor/Zeitleiste synchron, Auto-Save-Anzeige korrekt, Import/Export und Projektwechsel funktionieren.
4. **Layout:** 1440/1024/768/390 CSS-Pixel, 200-%-Zoom, lange Texte, leeres und großes Projekt. Nur die Zeitachse darf planmäßig horizontal scrollen.
5. **Accessibility:** Tastatur, Fokus, Labels, kontrastreiche Darstellungen, reduzierte Bewegung, Bedeutung ohne Farbabhängigkeit.
6. **Leistung und Druck:** kein Drag-Lag, keine teuren Frame-Renderings, saubere Druckansicht.
7. **Tests:** vorhandenen Workflow `.github/workflows/validate.yml` ausführen; für neue Interaktionen gezielte Browser-Regressionstests ergänzen (z. B. Playwright). Statische Validierung ersetzt keine visuelle oder funktionale Browserprüfung.

Diese Datei ist **die zentrale Norm**; `AGENTS.md` verweist auf sie und der lokale Skill operationalisiert sie. Neue Standards hier eintragen statt widersprüchlicher Duplikate. Das Designsystem wird zentral in `assets/css/design-system.css` gepflegt; Gantt-Geometrie bleibt an die in `assets/js/gantt.js` festgelegten Zeilenhöhen gekoppelt. Die UI-Browserprüfungen sind in `docs/ui-tests.md` dokumentiert.

## 8. Interaktions-Icons und fachliche Diagrammsymbole
- Bedien-Icons sind zentral in [icon-system.md](icon-system.md) definiert und folgen dem dortigen Funktion-zu-Symbol-Vertrag (Lucide-basierte Outline-SVGs mit currentColor). Nie Emoji, gemischte Sonderzeichensätze oder neue Icon-Fonts verwenden.
- SVGs sind in Textbuttons dekorativ und aus dem Accessibility Tree ausgeschlossen; Icon-only-Schaltflächen erfordern einen aussagekräftigen zugänglichen Namen. Trefferflächen, Fokus und Disabled/Active-Zustände bleiben am interaktiven Element.
- Gantt-Fachnotation für Gate, Meilenstein, Abhängigkeit, Status, Risiko, Baseline und Puffer ist bewusst eigenständig und nicht durch generische Bedien-Icons zu ersetzen.
- Alle elf Farbwelten und die Hybrid-Materialebenen müssen Icons über ihre Textfarbe korrekt erben. Keine festen hellen/dunklen SVG-Farben. Veränderte ESM-Dateien mit gemeinsamer Version ausliefern.
