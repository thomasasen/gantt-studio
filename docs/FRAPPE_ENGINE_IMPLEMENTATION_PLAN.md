# Gantt Studio: Engine-Abstraktion und optionaler Frappe-Gantt-Adapter

> **Status:** Phasen A und B implementiert; Phase C im getrennten Draft-PR #14 mit **NO-GO für Frappe Gantt 1.2.2** abgeschlossen. Phase-B-PR #13 wurde am 06.11.2026 nach main gemergt. PR #15 bleibt als experimentelle, schreibgeschützte Frappe-Integration Draft. Native bleibt der einzige produktiv unterstützte Renderer.
>
> **Arbeitsbranch:** `refactor/engine-abstraction`  
> **Repository:** https://github.com/thomasasen/gantt-studio  
> **Basis-Commit (main, 05.11.2026):** `1ef29c9388b555308242bb6174ff6ed60127ea5d`  
> **Stand:** 05.11.2026  
> **Leitentscheidung:** Zuerst die Anwendung von ihrer eigenen Gantt-Engine entkoppeln. Frappe Gantt anschließend **als experimentellen, austauschbaren Adapter** erproben. Eine vollständige Migration ist **nicht beschlossen**.
>
> **Wichtig:** Diese Markdown-Datei ist das Steuerungsdokument. Jede abgeschlossene Aufgabe wird hier mit Commit/PR, Testergebnissen und offenen Risiken dokumentiert. Änderungen an `main`, Merge und produktive Aktivierung sind eigenständige Freigabeentscheidungen.

## 1. Ziel und Nicht-Ziele

### Ziele

1. Projektlogik, Planungsregeln, Interaktions-Commit und Persistenz unabhängig vom Timeline-Renderer machen.
2. Eine kleine, dokumentierte, testbare Engine-Schnittstelle definieren und die bestehende Native Engine darüber betreiben.
3. Frappe Gantt als **gepinnten, lokal ausgelieferten** Dependency-Adapter ausprobieren, ohne Frappe-Quellen zu verändern.
4. Beide Engines gegen dieselben Fixtures, Interaktionsverträge, Designvorgaben und Performance-Szenarien vergleichen.
5. Ein zukünftiges Frappe-Upgrade auf eine neue Version grundsätzlich auf Dependency-Update, Adapter-Anpassung und Regressionstests begrenzen.
6. Native Engine und bestehendes Dateiformat als funktionierenden Rückfallweg erhalten.

### Nicht-Ziele

- Kein paralleler Rewrite der gesamten Anwendung, keine Frameworkmigration.
- Kein automatischer Wechsel zu Frappe und kein Merge in `main` ohne bestandene Gates.
- Keine Änderung des exportierten Schemas `gantt-studio.project` / `schemaVersion: 1` allein wegen der Rendering-Bibliothek.
- Keine serverseitige Projektablage, kein CDN-Zwang, kein Projekt-Upload, keine Telemetrie.
- Kein eigener Frappe-Fork und kein Patch im `node_modules`- oder vendorten Upstream-Code als reguläre Lösung.
- Keine Änderung der Fachbedeutung von `critical` (manuell, **kein** Critical-Path-Algorithmus).
- Keine neue Kalender- oder Terminsemantik durch Frappe-Defaults, insbesondere kein automatisches Verschieben abhängiger Aufgaben.

## 2. Verbindliche Quellen und Bestandsaufnahme

**Vor jedem technischen Eingriff lesen:**

- [AGENTS.md](../AGENTS.md)
- [Designrichtlinien](design-guidelines.md)
- [Icon-System](icon-system.md)
- [UI-Testdokumentation](ui-tests.md)
- [Lokaler Design-Skill](../.agents/skills/gantt-studio-design/SKILL.md)
- [Anwendungslogik](../assets/js/app.js), [Native Gantt](../assets/js/gantt.js), [Persistenz](../assets/js/storage.js)
- [Sortierregeln](../assets/js/task-order.mjs), [Design-Presets](../assets/js/design-presets.mjs)
- [Validation-Workflow](../.github/workflows/validate.yml), [Browser-Workflow](../.github/workflows/ui-regression.yml)
- [README und Datenformat](../README.md)

**Festgestellter Ausgangszustand am Basis-Commit:**

- Reine statische HTML-/CSS-/ESM-App auf GitHub Pages; aktuell **kein verpflichtender Node-Build** für die Runtime.
- Eigener DOM/SVG-Gantt-Renderer in `assets/js/gantt.js`; keine aktuell eingebundene Frappe-Gantt-Runtime.
- `renderGanttOnly()` in `app.js` erstellt eine gefilterte Projektkopie, rendert Gantt und übergibt `applyTimelineChange`.
- Zeitskalen: Tag, Woche, Monat. Ansichtsfilter: operativ, Management, Meilensteine.
- `displayOrder` ist eine reine **Darstellungsreihenfolge innerhalb der Phase**, niemals eine Scheduling-Abhängigkeit.
- Projektdaten bleiben in IndexedDB, Ansichtspräferenzen in localStorage. Import/Export nutzt das bestehende JSON.
- Elf Design-Presets einschließlich Dark-/Hybrid-Varianten; vertraglich bindende UX-/Icon-/Caching-Anforderungen.
- `validate.yml` enthält teils strukturelle `grep`-Annahmen über `app.js`, `gantt.js` und Version-Strings. Diese bei Refactoring **sinnvoll in Verhaltenstests überführen** statt ungeprüft zu entfernen.
- `ui-regression.yml` prüft Pull Requests nach `main`; der reine `validate.yml`-Push-Trigger läuft nur für `main` oder `workflow_dispatch`. Branch-Tests müssen explizit lokal oder per PR ausgeführt werden.

**Bekanntes P0-Risiko vor der Entkopplung:**

`applyTimelineChange()` in `app.js` mutiert derzeit das aktive `envelope.project.tasks` bereits vor erfolgreichem `persist()`. Bei einem Persistenzfehler kann der In-Memory-Zustand von IndexedDB abweichen. Diese Commit-/Rollback-Semantik muss vor dem Einbau einer zweiten Engine abgesichert werden; andere Schreibpfade sind auf dieselbe Fehlerklasse zu auditieren.

## 3. Architekturregeln (nicht verhandelbar)

1. **Single Source of Truth:** Ausschließlich das Gantt-Studio-Projektmodell enthält den fachlichen Zustand. Die Engine erhält ein projektioniertes, kopiertes, möglichst eingefrorenes View-Model.
2. **Intent statt Mutation:** Engine-Events erzeugen lediglich fachliche Änderungswünsche (`TaskMove`, `TaskResize`, `ProgressChange`, `Reorder` etc.). Keine Engine schreibt selbst in das Projekt, IndexedDB oder localStorage.
3. **Transactional Commit:** Validieren → nächste Projektversion aus aktuellem Snapshot berechnen → persistieren → erst nach Commit als gespeichert bestätigen und den kanonischen Zustand konsistent veröffentlichen; bei Fehler/Abbruch ist die alte Version wiederherstellbar. Race Conditions, schnell aufeinanderfolgende Edits und Projektwechsel berücksichtigen.
4. **Kalenderdaten:** Projekttermine bleiben `YYYY-MM-DD` mit **inklusivem Ende**. Kein unbemerkter Wechsel in Zeitzonen oder exklusive Endzeitpunkte; DST, Schaltjahre und Monatsgrenzen testen.
5. **Unveränderte Fachlogik:** Sortierung, Phasenzugehörigkeit, Abhängigkeiten, Arbeits-/Kalendertage, Marker, Puffer, Baselines, Gates, Status und Risiko liegen außerhalb der Rendering-Bibliothek.
6. **Interaktionsvertrag:** Vorschau ohne Speicherung; gültiger Pointer-Up einmaliger Commit; Escape/Pointer-Cancel vollständig ohne Commit; Tastaturalternative, korrekter Fokus und saubere Listener-/Pointer-Capture-Bereinigung.
7. **Renderer-Lebenszyklus:** Mount, Update, Layout-/View-Wechsel und Destroy sind explizit; keine Leaks, verwaisten Overlay-Knoten oder globalen Listener nach Projekt-/Engine-Wechsel.
8. **Design statt DOM-Hacks:** Gemeinsame Tokens und die elf Farbwelten gelten für beide Engines. Keine Korrektheit durch unversionierte interne Frappe-Selektoren/Private APIs erzwingen.
9. **Offline-/Datenschutz:** Frappe und nötige Assets werden bei Build lokal ins statische Deployment übernommen. Keine Runtime-CDN-Requests, keine Projektinhalte an Drittserver.
10. **Reproduzierbarkeit:** Upstream-Version und transitiver Dependency-Stand sind gelockt; Lizenzen/Notices geprüft; der Build ist dokumentiert und deterministisch.
11. **Kleine, reviewbare PRs:** Architektur-Refactor, Frappe-Spike und etwaige Produktionseinführung getrennt. Keine willkürliche Veröffentlichung von Experimenten.

## 4. Zielstruktur als Orientierung, keine blind anzulegende Dateiliste

```text
assets/js/
  app.js                         # Komposition und UI-Orchestrierung, keine Engine-Details
  core/
    project-model.mjs            # Normalisierung und Projektionen
    scheduling.mjs               # Kalender-/Terminregeln und Validierung
    project-commands.mjs         # Fachliche Intents, Transaktionen, Revisionen
  engine/
    engine-contract.mjs          # Capability- und Event-Vertrag, JSDoc
    engine-controller.mjs        # Adapter-Auswahl, Lebenszyklus und Wechsel
    native/
      native-adapter.mjs         # Kapselt die bestehende Engine
    frappe/
      frappe-adapter.mjs         # Kapselt exakt versioniertes Frappe
      frappe-task-mapper.mjs     # Ein-/ausgehende Datums-/Task-Konvertierung
      frappe-events.mjs          # Frappe-Callbacks → fachliche Intents
      frappe-overlays.mjs        # Nur unabhängige Gantt-Studio-Visualisierung
tests/
  fixtures/
  engine-contract.spec.cjs
  engine-parity.spec.cjs
  engine-upgrade.spec.cjs
docs/
  FRAPPE_ENGINE_IMPLEMENTATION_PLAN.md
```

Dateinamen/Module werden nur angelegt, wenn sie echte Verantwortlichkeiten trennen. Vorhandene Module (`task-order.mjs`, `storage.js`, `design-presets.mjs`) werden weiterverwendet, nicht redundant kopiert. Das Beispiel bedeutet **nicht**, dass jedes Modul sofort einzeln entstehen muss.

### Entwurf des Engine-Vertrags

Der tatsächliche Vertrag ist in Phase B durch Tests und JSDoc zu schärfen:

```js
// Illustrativer Vertrag, keine bereits implementierte API:
engine.mount({ container, onIntent, onSelect, onError });
engine.render({ tasks, phases, planning, view, theme }); // kopierte Daten
engine.setViewport({ zoom, scrollLeft, scrollTop });
engine.destroy();               // idempotent, listener- und DOM-sauber
engine.getCapabilities();       // objektive Unterstützung statt Annahmen
```

**Pflichtregeln:** kein direktes `saveLocal()` im Engine-Code; kein globales Event-Bus-Monster; keine stillschweigende Feldkonvertierung; keine fachliche Auswertung von `displayOrder` oder Dependencies durch den Renderer. Bei einem Engine-Wechsel wird die aktuelle Projektversion neu gerendert, nicht aus dem alten DOM extrahiert.

## 5. Arbeitspakete und Abnahmekriterien

**Statuslegende:** `[ ]` offen, `[x]` nach nachweislichem Abschluss. Pro Paket Ergebnis, Testbeleg und Commit/PR nachtragen; nicht nur Code „fertig“ markieren.

### Phase A – Baseline und Datenintegrität (P0)

- [x] **A-01 – Reproduzierbare Baseline:** Versionsstand und Branch-SHA erfassen; vorhandene Node-/Playwright-Checks ausführen; Ergebnisse und bisherige Warnungen protokollieren. Mindestens Demo, leeres Projekt und mehrere Phasen als Referenzdaten nutzen.
- [x] **A-02 – Schreibpfade-Audit:** Alle Commit-Pfade aus Gantt, Tabelle, Dialogen, Phasen, Import und Projektwechsel auf Fehler bei IndexedDB, Out-of-order-Writes und verlorene Updates prüfen. Kritische Befunde priorisieren, keine ungezielte Totalneuschreibung.
- [x] **A-03 – Sicheren Timeline-Commit implementieren:** Insbesondere `applyTimelineChange()` mit getesteter Validierung, Revision, Save-Fehler/Rollback und korrektem UI-Speicherstatus absichern. Bei Fehler keine heimlich mutierten Tasks; bereits bestätigte Edits nicht verlieren.
- [x] **A-04 – Date-only-Vertrag:** DST, lokale Kalendertage, `YYYY-MM-DD`, inklusive Enddaten und reine Sortierung explizit testen; den bekannten UTC-/Lokalzeit-Mismatch von „heute“ beheben, falls reproduziert.
- [x] **A-05 – Regression-Gate:** Vorher/nachher gleiche Exportdateien und gleiches Nutzerverhalten abgesehen von notwendigen Bugfixes. Tests für Persistenzfehler, schnelle Folgeänderungen und Projektwechsel erfolgreich.

**Gate A (Pflicht):** Keine Engine-Abstraktion auf unsicherer Commit-Basis.

### Phase B – Engine-Abstraktion mit Native Engine (P1)

- [x] **B-01 – Verantwortlichkeiten kartieren:** In `app.js` und `gantt.js` Anwendungs-/Planungslogik, DOM-Rendering, Interaktion und Speichern einzeln zuordnen; dokumentieren, welche bestehende Regel in welches Modul wandert.
- [x] **B-02 – Minimalen Engine-Vertrag definieren:** Mount/Render/Update/Destroy, einheitliche Intents, Capabilities und View-State. JSDoc + Unit-/Contract-Tests; ausschließlich öffentliche Schnittstellen.
- [x] **B-03 – Native-Adapter erstellen:** Vorhandenen Renderer zunächst weitgehend unverändert kapseln; korrektes Mounting, Re-Rendering und idempotentes Teardown. Nicht gleichzeitig visuell redesignen.
- [x] **B-04 – Anwendung entkoppeln:** `app.js` spricht nur Controller/Vertrag; keine direkten Native-Gantt-Aufrufe außerhalb des Adapters. Projektzustand, Filter, Phasenprojektion und Befehle liegen außerhalb des Renderers.
- [x] **B-05 – Cache-/Build-Konsistenz:** Statische ESM-Importpfade und Versionsparameter in `index.html`/`app.js`/abhängigen Modulen atomar aktualisieren. Bestehenden „alte ESM-Module“-Regressionstest erhalten.
- [x] **B-06 – Technische Tests:** Vertrag für Empty State, Mount/Destroy, Zoom, Projektwechsel, mehrfaches Rendern, Event-Duplikate, Filter, Phasen sowie Klick/Drag/Resize/Progress/Reorder.
- [x] **B-07 – Visuelle Regression:** Native Engine bleibt in allen elf Designs, 390/768/1024/1440px, 200-%-Zoom, Tastatur, Reduced Motion und Druck gleichwertig.

**Gate B (mergefähiger Zustand):** Native Engine ist vollständig kompatibel; Auslieferung ohne Frappe-Dependency möglich. Erst dann darf der reine Architektur-PR für `main` zur Freigabe vorbereitet werden. **Nicht selbstständig mergen.**

### Phase C – Isolierter Frappe-Spike (P2, experimentell)

Erst nach Gate B den separaten Branch `spike/frappe-gantt-adapter` von einem **freigegebenen** Abstraktionsstand erstellen; bis dahin diesen Folgeschritt nicht vorwegnehmen.

- [ ] **C-01 – Upstream verifizieren:** Bei Start npm-Stable-Version, Tag/Release-Divergenz, Lockfile, Lizenz, dokumentierte öffentliche APIs, bekannte Bugs und Browser-Support erneut prüfen. Ausgangsannahme aus Voranalyse: npm `frappe-gantt@1.2.2` (Stand 05.11.2026), GitHub „Latest Release“ `v1.0.3`; **nicht** ohne erneute Prüfung als aktuell behaupten.
- [ ] **C-02 – Reproduzierbaren, minimalen Vendor-Build:** Frappe lokal aus npm beziehen und bundeln; keine dynamische Fremd-CDN-Quelle. Wenn dafür ein Build-Schritt nötig wird, dessen Nutzen/Kosten und GitHub-Pages-Deployment dokumentieren; Native-Betrieb muss weitergehen.
- [ ] **C-03 – Task-Mapping:** IDs, Aufgabenreihenfolge, feste Datumssemantik, Progress, Meilensteine, Abhängigkeiten und Sondertypen eindeutig konvertieren. Keine Mutation des Originalprojekts; Frappe-Ende ↔ inklusives Projektende explizit lösen.
- [ ] **C-04 – Read-only Rendering:** Gleiche Fixtures in beiden Engines rendern. Phase-Sammelzeilen und Layer, links/rechts synchronisierte Zeilen, Filter, Scroll-/Zoom-Position und Leerzustand untersuchen; fehlende Fähigkeiten dokumentieren.
- [ ] **C-05 – Interaktions-Spike:** Datum verschieben, beidseitiges Resize, Fortschritt, Task-Selektion sowie Reihenfolge per Drag und Tastatur. Frappe-interne Terminänderung/automatisches Dependency-Shifting deaktivieren oder effektiv kontrollieren; ausschließlich Intents an Projektkommando-Schicht liefern.
- [ ] **C-06 – Lifecycle-/Sicherheitstest:** Nach wiederholtem Mount/Destroy keine hängen gebliebenen Handler, SVG-Layer oder Observer; keinerlei Datenbank- oder Netzwerkzugriff durch Frappe auf Projektinhalte.
- [ ] **C-07 – Feature-Gap-Protokoll:** Jede notwendige private Upstream-Abhängigkeit und jeder erhebliche Eingriff in Bar-/Zeilen-Geometrie als **negatives Upgrade-Signal** erfassen.

**Gate C (Go/No-Go):** Frappe muss die notwendige Basis ohne unvertretbare DOM-Hacks, Upstream-Patches oder Verlust der Datums-/Interaktionssemantik liefern. Bei No-Go: Experiment dokumentieren, Native als Standard behalten, Frappe nicht aktivieren.

### Phase D – Nur bei Go: fachliche Overlays, Designs, Parität (P2)

- [ ] **D-01 – Erweiterungs-Layer:** Phasen, Gates, Marker/Heute-/Ziellinien, Baselines, Puffer, Wochenenden/Feiertage, Status/Risiko, Owner, Abhängigkeiten und individuelle Labels robust über/mit der Frappe-Geometrie darstellen, möglichst ohne interne API-Abhängigkeit.
- [ ] **D-02 – Aufgabenliste und Sortierung:** Links und rechts sowie Aufgabentabelle behalten exakt dieselbe Reihenfolge; Sortieren innerhalb einer Phase ändert nur `displayOrder`, nie Datum oder Dependencies. Bei Filtern/zugeklappten Phasen kein illegaler Drop.
- [ ] **D-03 – Designsystem:** Alle sechs hellen, drei dunklen und zwei hybriden Vorlagen (inklusive Druck) prüfen, keine neuen ad-hoc CSS-Overrides. Icons bleiben projektkonform.
- [ ] **D-04 – Gleichwertige Bedienung:** Pointer-Cancel, Escape, „nur gültiger Commit“, 1:1-Feedback, Tastaturalternativen, Fokus, Accessibility und minimale Trefferflächen. Keine doppelt ausgelösten Events.
- [ ] **D-05 – JSON-/Projekt-Parität:** Speicherort, Import/Export, Projektwechsel, Einstellungen, Revisionen und Designfarben bleiben byte-/semantisch kompatibel; keine projektspezifischen Engine-Felder.

**Gate D:** Alle verpflichtenden Funktionen durch Engine-Paritätstests und visuelle QS nachgewiesen. Offene Abweichungen transparent dokumentieren; keine Produktivfreigabe bei fachlicher Regression.

### Phase E – Benchmark, Upgrade-Probe und Architekturentscheid (P2)

- [ ] **E-01 – Vergleichs-Fixtures:** 0, 1, 25, 250 und 1000 Aufgaben mit Phasen, Abhängigkeiten, Markern, verschiedenen Zeitspannen, langen Titeln und Sonderzeichen; reproduzierbar erzeugt.
- [ ] **E-02 – Messen:** Initialrender, wiederholtes Rendering, Eingabelatenz bei Drag, Scroll, Zoom, RAM/DOM-Knoten, Leaks, ggf. Page-Load-/Bundle-Größe. Gleicher Browser, gleiche Hardware, identische Fixtures, mehrfach messen und Median/Range dokumentieren. Keine erfundenen Messwerte.
- [ ] **E-03 – Codepflege vergleichen:** Neue Adapter-/Overlay-LOC, private API-Kopplung, Testaufwand, Build-Komplexität, Zahl entfallender Eigenimplementierungen und technisches Risiko bewerten.
- [ ] **E-04 – Reale Upgrade-Probe:** Soweit ein höheres stabiles Frappe-Release verfügbar ist, Update in separatem Test-Commit/Branch durchführen; sonst öffentliches API gegen aktuelle Version dokumentieren und die Probe als **nicht ausführbar** kennzeichnen. Keine fiktive `1.3.0` voraussetzen.
- [ ] **E-05 – Red-Team-Review:** Unabhängige Prüfung von Datum, Persistenz, Abhängigkeiten, Reordering, A11y, Designs, Caching, Sicherheit, Lizenz und Lifecycle. P0-/P1-Befunde müssen behoben oder als begründete Stop-Kriterien dokumentiert sein.
- [ ] **E-06 – Entscheidung dokumentieren:** `Go` nur wenn Feature-Parität, messbarer Wartungsvorteil, zumutbare Performance und updatefähige öffentliche Integration nachgewiesen sind. Andernfalls `No-Go` oder zeitlich begrenzter `Hold`, mit Fakten und Kosten.

### Phase F – Nur bei freigegebenem Go: Rollout (P3)

- [ ] **F-01 – Produktionstaugliche Engine-Wahl:** Default bleibt Native, Frappe zunächst ausdrücklich opt-in/intern. Engine-Wahl ist Ansichtspräferenz, **kein** Teil der Projektdatei. Fehlerfälle lösen dokumentierten Fallback ohne Datenverlust aus.
- [ ] **F-02 – CI/Deployment härten:** Für neue JS-Dateien Syntax-/Unit-Prüfungen; Browser-Matrix für beide Engines; Lockfile-/Build-Checks, Lizenz-Notices und Cache-Invalidierung. Alte `grep`-Checks sinnvoll ersetzen; keine stillen Entschärfungen.
- [ ] **F-03 – Abschluss-QS:** Manuelle und automatisierte Feature-Parität, keine Fehlermeldungen, Downloads/Print, Performance, Design, Projektimport/-export und Rollback.
- [ ] **F-04 – Entscheidung für Default-Wechsel:** Separater PR und ausdrückliche Freigabe. Native erst entfernen, wenn die Migrations- und Upgrade-Ziele über reale Nutzung bestätigt wurden.

**Gate F:** Kein automatischer Merge, kein stiller Default-Wechsel und kein Löschen der Native Engine.

## 6. Testmatrix – Mindestabdeckung

| Bereich | Fälle | Erwartetes Ergebnis |
| --- | --- | --- |
| Speicherung | IndexedDB-Fehler, Tab-/Projektwechsel, parallele schnelle Edits, Reload | Kein Verlust bestätigter Änderungen; korrekter Status/Rollback |
| Termine | UTC/Berlin, DST-Umstellung, Schaltjahr, Monats-/Jahreswechsel, eintägige Tasks | Exakt dieselben `YYYY-MM-DD`-Werte, inklusives Ende |
| Dependency | Ketten, Zyklen, unverbundene Tasks, ungültige IDs | Bestehende Validierung; keine automatische Verschiebung |
| Reihenfolge | Beide Drag-Griffe, Pfeiltasten, Phasengrenze, Filter, chronologischer Modus | Gleiche Reihenfolge in Chart und Tabelle; keine Terminänderung |
| Interaktion | Move, Resize links/rechts, Progress, Escape, Pointer-Cancel, Fehl-Commit | Vorschau reversibel; genau ein gültiger Commit |
| Phasen & Gantt | Phasenbänder, Sammelzeilen, Collapsing, Meilenstein, Gate, Markierungen | Keine Informationsverluste |
| Darstellung | Day/Week/Month, 11 Presets, Hybrid/Dark, Druck, Resize, Scroll | Sicht-/Bedienbarkeit und visuelle Konsistenz |
| Responsive & A11y | 390/768/1024/1440px, 200 % Zoom, Fokus, Tastatur, Reduced Motion, Kontrast | Projektvorgaben eingehalten |
| Datenformat | Alte Exporte, Demo, Import/Export, IDs, Revision, Design | Schema `gantt-studio.project` v1 kompatibel |
| Deployment | Veralteter ESM-Cache, Asset-Hash/Version, Pages, Offline-Assets | Kein Totalausfall von Buttons/Navigation |

**Nachweis:** Zu jedem abgeschlossenen Paket Testbefehl, Umgebung, Ergebnis sowie nicht getestete Fälle in Abschnitt 8 protokollieren. Vorhandene Browser-Testbasis: `npx playwright test`; Details in `docs/ui-tests.md`. Bei neuen Testabhängigkeiten die Installation reproduzierbar machen, statt zufällige lokale Paketstände zu verwenden.

## 7. Branch- und PR-Strategie

1. **Jetzt:** `refactor/engine-abstraction` von `main@1ef29c9`. Erster Commit enthält **nur dieses Dokument**.
2. **A/B:** Kleine nachvollziehbare Commits und möglichst getrennte PRs für P0-Datenintegrität und Native-Abstraktion. Falls dafür zusätzliche kurze Branches sinnvoll sind, vom aktuell genehmigten Basisstand abzweigen; keine direkten Commits auf `main`.
3. **C:** Nach Gate B separater `spike/frappe-gantt-adapter`, als Draft-PR, zunächst keine Aktivierung und kein Merge.
4. **D/E/F:** Nur nach expliziter Go-Entscheidung `feature/frappe-engine-integration` mit eigenem Review. Nach jeder Freigabe gezielt mit aktueller `main`-Historie synchronisieren.
5. **Schutz:** Niemals `main` force-pushen, Projektdateien migrieren, CI deaktivieren oder produktive Pages-Konfiguration ändern, nur um Tests grün zu bekommen.

**Konfliktregel:** Wenn während der Arbeit `main` voranschreitet, Baseline/SHA nachtragen und Konflikte sorgfältig auflösen; nicht blind den Analyse-SHA als „aktuell“ behandeln.

## 8. Fortschritts- und Entscheidungsprotokoll

| Eintrag | Status | Commit / PR / Nachweis | Risiken / nächste Aktion |
| --- | --- | --- | --- |
| Plan auf neuem Branch initialisiert | [x] | Diese Datei, erster Branch-Commit | Implementierung noch nicht gestartet |
| Gate A: Datenintegrität | [x] | [Browser #42122701641](https://github.com/thomasasen/gantt-studio/actions/runs/42122701641): 48/48 passed; [Validate #42122701731](https://github.com/thomasasen/gantt-studio/actions/runs/42122701731): success | P0-Codeschutz nachgewiesen; weitere Deep-Performance-/Cross-Tab-UX-Audits bei B beibehalten |
| Gate B: Native-Abstraktion | [x] | [Draft-PR #13](https://github.com/thomasasen/gantt-studio/pull/13); [Browser #42125708815](https://github.com/thomasasen/gantt-studio/actions/runs/42125708815): 55/55; [Validate #42125708860](https://github.com/thomasasen/gantt-studio/actions/runs/42125708860): success; 33 Screenshot-Paare gegen main | Native-only ohne Build erhalten. Merge/Spike weiterhin freigabepflichtig |
| Gate C: Frappe-Spike | [ ] | — | Upstream-/DOM-Kopplung untersuchen |
| Gate D: Erweiterungen/Parität | [ ] | — | Nur bei Go |
| Gate E: Entscheidung/Upgrade-Probe | [ ] | — | Messergebnisse und Red Team |
| Gate F: produktive Freigabe | [ ] | — | Separates Approval |

**Fortschrittsregel:** Bei jeder Implementierungssitzung erst diesen Abschnitt und die offenen Checkboxen aktualisieren; abgeschlossene Punkte müssen nachvollziehbar testbar sein. Bei Änderungen an der Zielarchitektur zuerst die Entscheidung und Begründung dokumentieren.

### Umsetzungssitzung 05.11.2026: Phase A / P0 (laufend)

**Basis und Historie.** Ursprünglicher Arbeitsbranch `7ded49b` (ein Dokumentationscommit nach `main@1ef29c9`). Es gab beim Start keine Abweichungen zwischen der Codebasis von `main` und dem Arbeitsbranch. Letzter bereits abgeschlossener Baseline-Lauf auf `main@1ef29c9`: [Validate #42111424927](https://github.com/thomasasen/gantt-studio/actions/runs/42111424927) **success**, [UI #42111424663](https://github.com/thomasasen/gantt-studio/actions/runs/42111424663) **success**. Diese Baseline enthielt Demo-, Empty-State-, Mehrphasen-, Drag-, Responsive- und Design-Suites. Der experimentelle Arbeitsbranch wird separat geprüft; frühere CI-Erfolge gelten nicht als Beweis für den neuen Code.

**Schreibpfad-Audit (A-02).** Die Vorgängerversion schrieb vor dem Persistenz-Commit mutierend in `envelope.project`, etwa über `applyTimelineChange`, `saveTask`, `updateTaskFromTable`, `deleteTask`, `commitTaskMove`, Settings, relativen Termin, Phasen/Marker/Feiertage, Feiertagsimport und Design. `saveLocal` hatte zudem einen versteckten Nebeneffekt auf die aktive Auswahl in `localStorage`. Die mutierenden `touch()/persist()`-Aufrufe sind im Arbeitsstand aus den Projektedits entfernt. Neue Projektanlage, Demo und JSON-Import schreiben ein separates Projekt zunächst vollständig und wechseln erst danach die Auswahl; Löschen wartet auf noch laufende projektbezogene Commits. Erhebliche Restrisiken aus dem Audit: zweite Browser-Tabs mit veralteten Revisionen, fehlgeschlagene lokale Speicherung, erneuter Projektwechsel während asynchroner UI-Aktualisierungen, nicht im Browser verifizierte Export-Parität.

**Implementierung A-03/A-04, unter Regressionstest:** `assets/js/core/project-commits.mjs` (per Projekt serialisierte, isolierte Drafts, Commit erst nach erfolgreichem Save, fehlgeschlagene Queue-Einträge blockieren spätere Edits nicht), `assets/js/storage.js` (keine verdeckte Aktivierung des zuletzt geschriebenen Projekts; atomare Revision-Prüfung im IndexedDB-Readwrite-Transaction), `assets/js/core/date-only.mjs` (strenge Gregorian-Daten und lokale »Heute«-Berechnung), `assets/js/app.js` (alle zentralen Änderungsoperationen als Projektkommando), `assets/js/gantt.js` (lokale Heute-Linie), synchron versionierte ESM-Imports `2.7.0` und GitHub-Actions-Validierung. Das Projektdateischema bleibt `gantt-studio.project` / v1; Native Engine bleibt aktiv.

**Reviewbare Commits:** `d9b881b`, `116ab03`, `46d912d`, `be1b693`, `e2236dc`, `bee3342`, `26e634f`, `5a35bfc`, `588fa64`, `27bd111`, `00f7739`, `ab74224`, `047a44f`, `e1c4ef1`, `269cd6f`, `c157fd2`, `5b41c94`, `c731f23`. Keine Änderung an `main`, kein Frappe, kein PR-Merge.

**Tests / Red Team:**
- GitHub-Actions-Validate für `c731f230`: [Run #42122701731](https://github.com/thomasasen/gantt-studio/actions/runs/42122701731), **success** (ESM-/JS-Syntax und strukturelle Prüfungen).
- Der erste vollständige Browserlauf `ab742241`: [Run #42122138588](https://github.com/thomasasen/gantt-studio/actions/runs/42122138588), **failure**, sechs konkrete Testfehler. Ursache für mehrere Gantt-Interaktionen war ein doppelt escaptes Regex (`isValidIsoDate`, Fix `c157fd2`); die Tabellen-Tastatur-Reihenfolge editierte noch das kanonische Projekt (Fix `c731f23`); ein neues DST-Subprozess-Testfixture enthielt Klammer-/Zeilenumbruchfehler (Fix `5b41c94`).
- Neue Suite `tests/persistence.spec.cjs` überprüft simulierte IndexedDB-Fehler und Rollback, sequentielle Revisionen bei raschen Edits, isolierte Projekte bei verzögerter Speicherung, Schaltjahre/DST, Gantt-Datenbankparität sowie konkurrierende Tabs. **Diese Tests sind noch nicht insgesamt als erfolgreich freigegeben.**
- Die laufenden Browser-Gates sind unter [GitHub Actions](https://github.com/thomasasen/gantt-studio/actions/workflows/ui-regression.yml) zu prüfen. Ein erneut grüner Testlauf auf dem **endgültigen Branch-Commit** ist notwendig, um A-03, A-04, A-05 und Gate A abzuhaken. Die vollständige Fehlerpfadabdeckung, der Test des Exportformats und Cross-Tab-Konflikte bleiben explizite Reviewpunkte.

**Nachprüfung Gate A:** Mit `c731f230` liefen **48/48 Chromium-Tests erfolgreich** ([Run #42122701641](https://github.com/thomasasen/gantt-studio/actions/runs/42122701641)); statisches Validate ebenfalls erfolgreich ([Run #42122701731](https://github.com/thomasasen/gantt-studio/actions/runs/42122701731)). Die späteren Änderungen `49c2b8f` und diese Planpflege sind ausschließlich Dokumentation. A-03/A-04/A-05 und Gate A sind nach den vorhandenen automatisierten Prüfkriterien freigegeben; eine vollständige manuelle Browserabnahme und ein unabhängiger Cross-Tab-UX-Audit bleiben als weitere Qualitätssicherung offen.

**Nächster Schritt:** B-01/B-02 auf derselben Branchbasis: native Verantwortlichkeiten kapseln, dokumentierten Engine-Vertrag definieren und ohne UI-/Schemaänderung durch Contract-Tests prüfen. Frappe bleibt bis zum positiven Gate B und der gesonderten Freigabe ausgeschlossen. Keine produktive Freischaltung und keine Abweichung vom Branch-/Freigabemodell.

### B-01 – Verantwortlichkeitskarte (Ausgangszustand, vor dem Refactor)

| Komponente | Aktuell belegte Aufgabe | Ziel / Schnittstellengrenze |
| --- | --- | --- |
| `app.js` / `renderGanttOnly` | Visibility-Projektion, Filter, Zoom, Theme-Vorgaben, Aufruf `renderGantt` | Nur noch `engineController.render({project,view})`, keine direkte Native-Renderfunktion |
| `app.js` / `applyTimelineChange`, `commitTaskMove` | Validierung und IndexedDB-Commit | Bleibt außerhalb jeder Engine als zentrale fachliche Intent-/Commit-Verarbeitung |
| `app.js` / `startGanttTaskDrag` und Stage-Listener | Native-DOM-spezifische Tabellenlisten-Drag-/Keyboard-Interaktionen | Als Native-Adapter-Interaktionsschicht kapseln, ausschließlich `Reorder`-Intent ausgeben |
| `app.js` / `jumpToRelativeLine` | Direkte DOM-Abfrage einer Native-Markierung | Über öffentliche Capability für Marker-Navigation oder explizit dokumentierten Fallback |
| `gantt.js` / `renderGantt` | DOM-/SVG-Balken, Linien, Phasendarstellung, Zoom und Zeitskala | Unverändert als Renderer im Native-Adapter wiederverwenden |
| `gantt.js` / `attachInteraction` | Pointer-Preview, Escape/Cancel, Move/Resize/Progress | Native-private UI, emitierte fachliche Intents und bereinigbarer Lifecycle |
| `task-order.mjs` | Phasenreihenfolge und `displayOrder`-Datenlogik | Ausschließlich Domain/Kommandoebene, nicht im Render-Core implementieren |
| `storage.js`, `core/project-commits.mjs` | IndexedDB-Revisionsschutz, Queue und canonical publish | Domain-/Persistenzebene unabhängig von allen Engines |
| `design-presets.mjs`, CSS, Icons | Elf Themen, Print, Accessibility, v2.x ESM-Cache | Engineübergreifendes Design-/Auslieferungssystem |

**Red-Team-Risiken vor B:** Ein direkter Rendererwechsel darf keine Stage-Handler doppelt registrieren, Pointer-Listener beim Destroy zurücklassen oder den DOM der Native-Engine auslesen, um Projektzustände zu rekonstruieren. Die Revisionsprüfung verhindert stille Mehrtab-Überschreibung, aber die UI muss einen Konflikt verständlich anzeigen. Die Cache-Regression muss mit jedem neuen ESM-Knoten erweitert werden.

### Umsetzungssitzung 05.11.2026: Phase B / Native-Abstraktion (laufend)

**Engine-Vertrag:** `assets/js/engine/engine-contract.mjs` definiert den Lifecycle `mount`, `render`, `setViewport`, `cancelInteraction`, `locateMarker`, `destroy` und `getCapabilities`. Controller/Adapter erhalten eine isolierte, rekursiv eingefrorene Projektion; der kanonische Projektstand wird nie an einen Renderer übergeben. Fachliche Intents sind `task-change`, `reorder` und `nudge` (kein Speichern in der Engine). Zustandsfeedback zum abgebrochenen/ungültigen Drag wird separat ohne Commit zugestellt.

**Adapterstruktur:** `engine-controller.mjs` stellt eine austauschbare Factory mit wiederherstellbarem View-State, Zoom-/Scrollzustand und Rückfall bei fehlgeschlagenem Adapterwechsel bereit. `native/native-adapter.mjs` kapselt den existierenden `gantt.js`-Renderer, `native/native-interactions.mjs` die native DOM-spezifischen Selektions-, Pointer- und Keyboard-Handler. Die Anwendung `app.js` behält nur Projektprojektion, fachliches Validieren/Committen, Phasenstatus und Engine-Intent-Verarbeitung. `gantt.js` räumt aktive Pointer-Listener durch den expliziten `destroy`-Rückgabevertrag ab. Native ist weiterhin die **einzige** Engine; Frappe ist keine Dependency. Keine Schema- oder CSS-Änderung.

**Cache/CI:** Die vollständige ESM-Importkette ist versioniert mit `v=2.8.0`; verschachtelte Module werden durch `tests/module-cache.spec.cjs` geprüft. Die beiden bestehenden Workflows prüfen die neuen Engine-Dateien. Der Betrieb bleibt statisch ohne Build, Node-Laufzeit im Browser oder Fremd-CDN.

**Testnachweise:** [Run #42124584311](https://github.com/thomasasen/gantt-studio/actions/runs/42124584311) **53/53 Browser-/Contract-Tests erfolgreich**, einschließlich Native-Interaktionen, Lifecycle (12 × Mount/Destroy), Adapterwechsel und Rückfall. [Run #42124953256](https://github.com/thomasasen/gantt-studio/actions/runs/42124953256) **54/54 erfolgreich**, inklusive JSON-v1-Roundtrip; das ergänzte 200-%-Zoom-Szenario und die vollständige CI auf dem neuesten Commit stehen noch aus. Bestehende Design-, A11y-, Dark-/Hybrid-, Print-, Responsive-, Drag-/Resize- und Reorder-Tests bleiben aktiv und sind nicht abgeschwächt worden.

**Red-Team-Befunde und Korrekturen:** (1) Native-DOM-spezifische Stage-Handler in `app.js` hätten andere Engines blockiert; in den Native-Adapter verlegt. (2) Aus einem Teardown während laufendem Pointer-Drag konnten Listener verbleiben; explizites Cancel-Register implementiert. (3) Nach Handler-Extraktion fehlte die verständliche Abbruch-Statusmeldung; nach Browser-Gegenprobe wiederhergestellt. (4) Contract-Tests dürfen das strikte JS-Verhalten bei mutierten `Object.freeze`-Objekten nicht falsch bewerten; Prüfung korrigiert. (5) ESM-Importe über mehrere verschachtelte Module überprüfbar versioniert. Restrisiko: keine manuell durchgeführte vollständige visuelle Vorher/Nachher-Pixelprüfung aller elf Themen; diese ist unabhängig von der erfolgreichen Browser-Suite zu behandeln.

**Nächster Schritt:** 200-%-Zoom und letzte CI-Suite auswerten. Danach B-07/Gate B nur bei grünem Teststand prüfen; PR ausschließlich als Draft für Review vorbereiten, niemals automatisch mergen. Frappe-Spike erst von **freigegebenem** Abstraktionsstand und in separatem Branch.

### Gate B – Abschlussbeleg und Freigabegrenze

**Abnahme:** [Run #42125708815](https://github.com/thomasasen/gantt-studio/actions/runs/42125708815) auf `ad309ca4`: **55/55 Playwright-Tests bestanden**; [Run #42125708860](https://github.com/thomasasen/gantt-studio/actions/runs/42125708860) statische Validierung **success**. Die Matrix umfasst alle elf Designvorlagen, dunkle/hybride Oberflächen, Screenshots, 390/768/1024/1440px, 200-%-CSS-Zoom mit Tastaturreihenfolge, Print-CSS, Reduced Motion, Bar-Move/Resize/Progress, Abbruch, Phasengrenzen, Keyboard, IndexedDB-Fehler, Revision-Races, Multitab-Konflikt, JSON-Schema-v1-Roundtrip sowie wiederholtes Mount/Destroy und Engine-Wechsel mit Fallback.

**Unabhängiger visueller Vergleich:** Zwei echte Chromium-Workflow-Artefakte wurden parallel ausgewertet: `main@1ef29c9`, [UI #42111424663](https://github.com/thomasasen/gantt-studio/actions/runs/42111424663), Artifact `design-visual-review` / ID `13453808663`; neuer Native-Adapter-Stand, [UI #42124953256](https://github.com/thomasasen/gantt-studio/actions/runs/42124953256), Artifact `design-visual-review` / ID `13458664583`. **33 von 33 gleich benannte PNG-Paare** hatten identische Originalabmessungen. Nach einheitlichem Downscaling auf maximal 900 × 900 Pixel (Lanczos, RGB) und Differenz der Farbkanäle hatten höchstens **0,41 % der Pixel** eine maximale Kanalabweichung über 20/255; der höchste mittlere absolute Kanalunterschied war **0,58/255**. Die geringfügigen Differenzen liegen insbesondere in zwei Planungsscreenshots; ein systematischer Layout- oder Theme-Unterschied ist im Vergleich nicht erkennbar. Das ist eine Stichproben- und keine pixelgenaue Garantie für jede Interaktion.

**Review-Paket:** [Draft-PR #13](https://github.com/thomasasen/gantt-studio/pull/13), erstellt von `refactor/engine-abstraction` auf `main@1ef29c9`. Die vollständige Umsetzung bis zum Review-Stand ist durch die Commit-Historie nachvollziehbar; letzter vor PR-Erstellung verifizierter Code-Commit `ad309ca4` (55/55), Planabschluss `d8bfaea`. Kein Merge ausgeführt.

**Freigabevermerk:** Gate B ist auf Basis der vorliegenden automatisierten und unabhängigen visuellen Nachweise erfüllt. `main` bleibt auf `1ef29c9` unverändert; die Native Engine ist Standard und einziger produktiv unterstützter Renderer. Der Architektur-PR kann als **Draft** erstellt werden. Ein Merge oder der Beginn von `spike/frappe-gantt-adapter` setzt einen ausdrücklich **freigegebenen Abstraktionsstand** voraus; die Umsetzung hat diese Freigabe noch nicht. Offenes Restrisiko: manuelle interaktive Browser-Zoom-/Screenreader-Abnahme auf echten Geräten wurde nicht durchgeführt, außerdem Performance unter extrem großen Projekten erst in Phase E zu messen.

## 9. Optimaler Umsetzungs-Prompt für einen neuen Codex-/ChatGPT-Arbeitslauf

Der nachfolgende Prompt ist **direkt verwendbar**. Er ist bewusst auf sichere, schrittweise Umsetzung im verbundenen GitHub-Repository ausgelegt. Er autorisiert **keinen** eigenmächtigen Merge in `main` und **keine** positive Frappe-Entscheidung ohne Testbelege.

```text
Du übernimmst als Senior Frontend Architect, JavaScript Engineer, QA Lead und unabhängiger Red-Team-Reviewer die schrittweise Umsetzung der Engine-Abstraktion von Gantt Studio.

Repository: https://github.com/thomasasen/gantt-studio
Arbeitsbranch: refactor/engine-abstraction
Masterplan: docs/FRAPPE_ENGINE_IMPLEMENTATION_PLAN.md
Produktivseite: https://thomasasen.github.io/gantt-studio/

AUFTRAG
1. Arbeite direkt im verbundenen GitHub-Repository. Prüfe vor jeder Änderung Branch, aktuelle SHAs, bestehende Änderungen und offene PRs. Verwende den vorhandenen Arbeitsbranch; lege keinen zweiten Plan an.
2. Lies vollständig AGENTS.md, docs/design-guidelines.md, docs/icon-system.md, docs/ui-tests.md, .agents/skills/gantt-studio-design/SKILL.md, README.md sowie die betroffenen JS-/CSS-/Workflow-/Testdateien. Der Masterplan ist die verbindliche Reihenfolge.
3. Bearbeite zuerst die noch offenen Pakete von Phase A und dann Phase B. Überspringe keine Gates. Implementiere in kleinen, reviewbaren, funktionsfähigen Schritten; bei bestehender Architektur zunächst minimale risikoreduzierende Extraktionen statt Rewrite.
4. Behebe und teste zuerst Datenintegrität: insbesondere applyTimelineChange() mit sicherem Commit/Rollback, Persistenzfehlern, Revisionen, parallelen Edits und Projektwechseln. Keine UI-Erfolgsmeldung ohne erfolgreichen Datenbank-Commit. Prüfe alle verwandten Schreibpfade.
5. Definiere eine schlanke Renderer-Schnittstelle mit JSDoc, Capability-Vertrag, Datenprojektion, Intent-Events, Mount/Render/Destroy und Tests. Kapsle die bestehende eigene Gantt-Engine zuerst als Native-Adapter; löse app.js von konkreten Renderer-Details.
6. Schütze jede bisherige Funktion: Projektdatei v1, IndexedDB/localStorage, Filter und Phasen, displayOrder nur als Anzeigereihenfolge, bidirektionale Sortierung, Abhängigkeiten, Baselines, Puffer, Marker, Gates, Tag/Woche/Monat, elf Designs, Speichern/Export, Druck, Keyboard/Accessibility und Interaktionsabbruch.
7. Achte besonders auf exakt datumsgebundene Drag-/Resize-Interaktionen: keine ungewollten Verschiebungen durch Frappe, kein offenes Dependency-Shifting, Pointer-Cancel und Escape ohne Commit, gültiger Pointer-Up genau einmal, Tagesgenauigkeit in allen Zeitzonen und kein klammheimliches Datums-/Schreibmodell von Frappe.
8. Beachte den bestehenden statischen GitHub-Pages-Betrieb ohne Node-Runtime und das ESM-Cache-Problem. Wenn Module umbenannt oder exportiert werden, Import-URLs, Asset-Versionen und CI gemeinsam sauber aktualisieren. Ersetze überholte strukturelle grep-Checks durch stärkere Tests, statt Checks ersatzlos zu entfernen.
9. Führe Tests nach jedem Schritt aus. Mindestens Syntax/Unit, vorhandene Playwright-Browsertests, relevante Fehler-/Cancel-/Reorder-/Datenformat-Fälle sowie das aktuelle CI. Ergänze verlässliche Tests für jede neue Gefahr. Dokumentiere explizit nicht ausführbare Prüfungen. Benutze keine erfundenen Testresultate.
10. Führe einen kritischen Red-Team-Pass durch: Datenschutz, Datenverlust, Zeitzonen, doppelte Events, Cleanup, Performance, A11y, CSS- und Modulcache, Projektwechsel und Regressionen. Behebe P0/P1-Befunde, bevor du ein Gate als erfüllt markierst.
11. Aktualisiere den Masterplan nach jedem Paket (Checkbox, Ergebnis, SHA/PR, Testbeleg, verbleibendes Risiko). Lege nur im Arbeitsbranch Commits an; bei abgeschlossenen logisch getrennten Paketen erstelle bei Bedarf Draft-PRs, aber merge nicht selbstständig nach main.
12. Sobald Phase B vollständig abgesichert ist, halte Gate B fest. Beginne den separaten Frappe-Spike erst auf einer dafür freigegebenen Basis. Vor Frappe-Integration stets aktuelle Stable-Version, Public API, Lizenz und Build-Kompatibilität erneut verifizieren. Frappe via lokal gebündelte, exakt versionierte Dependency anbinden. Niemals ungeprüft eine neue Bibliotheksversion produktiv aktivieren oder einen Frappe-Fork erzeugen.
13. Teste Frappe zunächst read-only und vergleiche beide Engines mit identischen Fixtures. Bei Feature-Gaps dokumentiere native Unterstützung, notwendige Adapter/Overlays und Private-API-Risiken. Bei einem nicht vertretbaren Kompromiss dokumentiere No-Go und belasse Native als Standard.
14. Miss Performance reproduzierbar und prüfe bei verfügbarer neuer Stable-Version ein echtes Upgrade. Entscheide Go/No-Go nicht nach Gefallen, sondern nach Feature-Parität, Datenkorrektheit, Wartbarkeit, Upstream-Kopplung und messbaren Ergebnissen.
15. Schließe jede Sitzung mit einem überprüfbaren Bericht ab: geänderte Dateien, Commit/PR-Links, erledigte und offene Pakete, ausgeführte Tests mit Resultat, Red-Team-Befunde, verbleibende Risiken und **nächsten konkreten Arbeitsschritt**.

VERBOTE / FREIGABEGRENZEN
- Kein direkter Commit, Merge oder Force-Push auf main.
- Keine produktive Frappe-Aktivierung ohne ausdrückliches Go und vollständige Regression.
- Keine Änderung von gespeicherten Projekten oder Exportformat nur wegen Frappe.
- Kein stilles Entfernen alter Funktionen, Tests oder Designs.
- Keine externe Telemetrie, CDN-Projektverarbeitung oder serverseitige Speicherung.
- Keine generischen Scheinlösungen, keine erfundenen Testbelege, keine pauschale „alles funktioniert“-Aussage ohne Ausführung.
- Falls sich aus dem Audit eine bessere Architektur ergibt, dokumentiere die Alternative samt Konsequenzen im Masterplan, bevor du sie implementierst.

Starte mit Ist-Stand, Phase A-01 und den aus dem Repository ableitbaren P0-Tests. Arbeite anschließend die nächsten offenen Pakete planmäßig ab. Stelle Rückfragen nur bei tatsächlich nötigen Freigabe-/Produktentscheidungen; ansonsten wähle sichere, dokumentierte Defaults und setze um.
```

## 10. Definition of Done für das Gesamtvorhaben

Das Gesamtvorhaben ist nur dann „abgeschlossen“, wenn

1. **mindestens** Phase A und B nachweislich erfolgreich sind und das bestehende Gantt Studio vollständig über einen Native-Adapter läuft;
2. die Frappe-Option durch einen echten Spike sachlich bewertet und mit Go/No-Go begründet wurde;
3. alle Projektmanagement- und Datenintegritätsverträge testgestützt erhalten sind;
4. alle relevanten automatisierten und manuellen Checks samt bekannten Grenzen dokumentiert sind;
5. GitHub-Pages-Auslieferung, ESM-Versionierung, Lizenz- und Datenschutzprüfung nachvollziehbar sind;
6. die Entscheidung über einen möglichen Default-Wechsel **separat** getroffen wurde und keine unauthorisierte Produktionsänderung erfolgt ist.

**Erfolg heißt ausdrücklich nicht zwingend, Frappe zu verwenden.** Erfolg heißt: eine belastbar austauschbare Engine-Architektur, ein sicherer Datenkern und eine überprüfbare Entscheidung über Frappe-Gantt.


## 11. Abschluss-Audit der Native-Engine-Architektur (06.11.2026)

### Scope und Branch-Schutz

Der Audit läuft ausschließlich auf `refactor/engine-abstraction` in [PR #13](https://github.com/thomasasen/gantt-studio/pull/13). Vergleichsbasis bleibt `main@1ef29c9388b555308242bb6174ff6ed60127ea5d`; der Frappe-Spike [PR #14](https://github.com/thomasasen/gantt-studio/pull/14) bleibt separat und unberührt. **Frappe 1.2.2: NO-GO** wegen nicht zuverlässig bereinigter globaler Listener, asynchroner Callback-Auslösung während einer Drag-Vorschau, nicht nachgewiesenem Commit-Once-/Cancel-Vertrag und fehlender Native-Funktionsparität. Keine produktive Frappe-Abhängigkeit, keine Schemaänderung, kein Merge nach `main`.

### Unabhängiges Red-Team: Befunde, Einstufung und Änderungen

| Nr. | Klasse | Red-Team-Befund | Abhilfe / Prüfnachweis |
| --- | --- | --- | --- |
| RT-01 | P1, behoben | Controller veröffentlichte eine Renderprojektion vor dem erfolgreichen Rendern. Nach Fehler konnte ein Switch den fehlgeschlagenen Zustand wiederverwenden. | Erfolgszustand erst nach Renderbestätigung; Rollback auf letzten gültigen Stand; bei gescheitertem Rollback AggregateError und Fail-Closed. `7ec32e35`; sechs neue Lifecycle-Tests in `tests/engine-resilience.spec.cjs`. |
| RT-02 | **P1, noch nicht abschließend verifiziert (merge-blockierend)** | Konkurrierende Projektwechsel und laufende Drags können sich gegenseitig überholen. Ein neuer Browser-Test besteht in einigen Läufen und scheitert in anderen an der Wiederherstellung der Aufgabenliste. | Cancel und sequenzierte Projektwahl implementiert (`bc4c5110`, `e1a60199`), aber die Timing-Abhängigkeit ist in GitHub Actions noch nicht vollständig erklärt oder reproduzierbar ausgeschlossen. Keine positive Freigabe vor stabiler CI. |
| RT-03 | P1, behoben | Zwei unmittelbar ausgelöste Speichern-Aktionen in Task-/Planungsdialogen konnten zwei IDs und doppelte Datensätze erzeugen. | Reentrancy-Guards und deaktivierte Speicherschaltflächen bis zum Abschluss: `90288047`, `tests/no-duplicate-commit.spec.cjs`. |
| RT-04 | P2, behoben | Relative Kalenderziellinie verwendete UTC-Tagesdatum statt des lokalen `date-only`-Tages. | Anker `localTodayIso()`; `ad104c72`, Zeitzonen-Test Berlin/New York/Auckland `4378a926`. |
| RT-05 | P2, behoben | IndexedDB-Connections blieben bei Lesen/Listen/Löschen offen. | Explizites `db.close()` auf Success/Abort/Error, `459db413`; Lifecycle-Tests `dd66fc49`. |
| RT-06 | P2, verbleibend | Native-Renderer skaliert mit großen Datenmengen annähernd linear; bei 1.000 sichtbaren Aufgaben entstehen blockierende Renderzeiten. | Reproduzierbare Adapter-Messung und gleicher Chromium-Runner-Baseline-Vergleich hinzugefügt; vor einer späteren Virtualisierung konkrete Nutzerlast und neue Benchmarks erheben. Kein riskanter Rewrite im Härtungs-PR. |
| RT-07 | P2, verbleibend | Physischer Touch, echte Screenreader, Firefox/Safari, unterschiedliche GPU-/Endgeräte und manuell kontrollierter Druck sind nicht vollständig automatisiert abgedeckt. | Chromium-, Axe-, CSS-Print-, Viewport-/Reduced-Motion- und 200-%-CSS-Zoom-Suiten bestehen bereits; begrenzte manuelle Abnahme bleibt explizites Restrisiko. |
| RT-08 | P2, verbleibend | Gleichzeitiges Projektlöschen in einer anderen Browser-Tab-Sitzung unterliegt nicht demselben Optimistic-Locking-Vertrag wie das Aktualisieren von Aufgaben. | Bestehender Revisionstest verhindert stilles Überschreiben beim Speichern; Lösch-Sonderfall separat dokumentiert und noch nicht als vollständig abgesichert behauptet. |

### Testabdeckung und Arbeitsartefakte

- `tests/engine-resilience.spec.cjs`: Mount-Fehlschlag und Cleanup, Render-Rollback, Switch-/Viewport-Rollback, doppelte Fehler und Fail-Closed.
- `tests/relative-date-timezone.spec.cjs`: gleicher tatsächlicher UTC-Zeitpunkt in Europe/Berlin, America/New_York und Pacific/Auckland.
- `tests/project-switch-cancel.spec.cjs`: Tabellen- und Gantt-Drag mit Projektwechsel, kein unerwünschter Commit.
- `tests/indexeddb-lifecycle.spec.cjs`: wiederholte Reads und Lösch-Transaktion schließen Datenbankverbindungen.
- `tests/no-duplicate-commit.spec.cjs`: Task- und Markeranlage mit zweimaliger Save-Auslösung.
- `tests/theme-geometry-matrix.spec.cjs`: alle **elf Vorlagen × 390/768/1024/1440 px**; Row-Geometrie, Overflow, Timeline und Screenshot-Review-Artefakte.
- `tests/native-performance.spec.cjs`: 0/1/25/250/1000 Tasks, drei Wiederholungen, Median für sieben Messgrößen; maschinenlesbares JSON.
- `tests/native-main-comparison.spec.cjs`: Main-Renderer vs Native-Adapter auf demselben Chromium-Runner, fünf Wechselmessungen je Taskzahl; maschinenlesbares JSON; Workflow mit kompletter `main`-History.
- `.github/workflows/ui-regression.yml`: neue Tests werden ausgeführt und syntaktisch geprüft; Benchmark-JSON als `native-engine-performance`, Screenshot-Artefakte unter `design-visual-review`.

**Verifizierte Zwischenstände:** [Workflow #42133240847](https://github.com/thomasasen/gantt-studio/actions/runs/42133240847): **63/63 Chromium-Tests bestanden**. [Workflow #42134208818](https://github.com/thomasasen/gantt-studio/actions/runs/42134208818) auf `4a1b6ac3`: **68/68 Chromium-Tests bestanden**. Diese Zwischenstände sind nicht als Erfolg aller späteren Commits zu verstehen. Statische GitHub-Workflow-Prüfungen waren über mehrere Folge-Commits erfolgreich. Die abschließende vollständige CI des letzten Branch-Commits muss unabhängig davon erfolgreich sein; vorher kein positiver Merge-Status.

### Gemessene Performance, kein Schätzwert

Messung A: [Chromium #42133240847](https://github.com/thomasasen/gantt-studio/actions/runs/42133240847), drei Wiederholungen, Median in ms. Es handelt sich um **Adapter-Mikrobenchmarks**, nicht um vollständige Interaktionszeiten inklusive Projektkommandos/IndexedDB:

| Aufgaben | Initial | Re-Render | Zoom | Filter | Task-Änderung | Mount/Destroy |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 0.0 | 0.0 | 0.1 | 0.1 | 0.0 | 0.0 |
| 1 | 5.1 | 4.4 | 1.1 | 1.4 | 1.3 | 1.4 |
| 25 | 12.5 | 18.7 | 12.9 | 5.8 | 10.8 | 14.9 |
| 250 | 144.2 | 136.1 | 138.4 | 71.1 | 122.6 | 133.8 |
| 1.000 | 527.1 | 501.5 | 611.8 | 325.3 | 530.0 | 514.0 |

Der Keyboard-Intent-Dispatch im gleichen Test dauerte für vorhandene Reorder-Griffe zwischen 0 und 0,1 ms. Dieser Wert erfasst **nicht** die anschließende IndexedDB-Latenz.

Messung B: [Chromium #42133839035](https://github.com/thomasasen/gantt-studio/actions/runs/42133839035), im selben Runner abwechselnd fünf Renderdurchläufe je Implementierung. Dieser Workflow enthielt noch einen fehlgeschlagenen IndexedDB-Test, die separat protokollierten Benchmark-Messwerte sind aber tatsächlich ausgeführt worden: Main/Native in ms = **1 Task 1,6/2,3**, **25 Tasks 10,0/10,6**, **250 Tasks 73,2/77,2**, **1.000 Tasks 281,7/298,6**. Bei 1.000 Tasks lag der neue Adapter dort ca. **6 %** über dem bisherigen Renderer, ohne belastbare Hinweise auf eine unvertretbare strukturelle Regression. Die Werte schwanken wegen Hardware-Auslastung; deshalb kein universeller Performance-Grenzwert.

### Merge-Readiness / noch offene Gate-Bedingungen

**Bis zur letzten grünen CI: NOT READY.** Ein Merge ist ausdrücklich nicht genehmigt. Nach bestandenen vollständigen Tests sind verbleibende P2-Risiken gesondert zu bewerten; P0/P1 dürfen dann nicht mehr offen sein. **Kein noch so erfolgreicher CI-Lauf ersetzt den vom Auftraggeber ausdrücklich freizugebenden Merge nach `main`.**


## 12. P1-Projektwechsel-Race: forensische Ursachenanalyse und Härtung (06.11.2026)

**Geltungsbereich:** Nur Draft-PR #13 / `refactor/engine-abstraction`. `main@1ef29c9388b555308242bb6174ff6ed60127ea5d` und der separate Frappe-NO-GO-Spike PR #14 wurden nicht verändert. Projektdatei-Schema v1, Native als alleinige Engine und lokale Datenhaltung bleiben unverändert.

### Tatsächlich nachgewiesene Ursache

Der intermittierende Fehler von `switching projects during Gantt drag discards the preview` war **zunächst ein fehlerhaft synchronisierter Test**. Unmittelbar nach `click('#loadDemoBtn')` ermittelte nur der zweite der beiden Project-Switch-Tests die Quell-ID, **ohne das asynchrone Laden des Demoprojekts und dessen zehn Aufgaben abzuwarten**. So wurde sporadisch die ID des anfänglichen leeren Projekts als `sourceId` gespeichert. Nach Neuanlage eines zweiten Projekts wurde nicht etwa das Demoprojekt, sondern der ursprüngliche Leerstand ausgewählt. Die Assertion mit zehn Aufgaben war dann unmöglich.

Nachweise: fehlgeschlagene [CI #42135853385](https://github.com/thomasasen/gantt-studio/actions/runs/42135853385), [#42134910879](https://github.com/thomasasen/gantt-studio/actions/runs/42134910879) und [#42135276018](https://github.com/thomasasen/gantt-studio/actions/runs/42135276018); Playwright-Trace aus dem Failure-Artefakt von #42135853385: `loadDemoBtn` wurde geklickt und die Quell-ID unmittelbar danach abgefragt. `PROJECT_SWITCH_PROBE` ergab `sourceStoredTasks:0`, `rows:0`, `bars:0`, `name:"Neues Projekt"`. Dies widerlegt für **diesen** Fehlversuch die Annahme, dass ein bestehendes Zehn-Aufgaben-Demoprojekt von IndexedDB gelöscht wurde. Der Test wartet jetzt ausdrücklich auf zehn sichtbare Tabellenzeilen, überprüft zusätzlich zehn persistierte Quellaufgaben und hält die fachliche Erwartung an den Drag-Abbruch vollständig aufrecht (`4a5e3d53`).

### Unabhängig aufgedecktes Anwendungsrisiko und Architekturentscheidung

Der bisherige `projectSelectionSerial` schützte nur `changeProject()`. Demo-Laden, Projektanlage, Import und Löschen konnten parallel aktivieren; ältere `renderPortfolio()`-/`renderAll()`-Aufrufe konnten nach einer neuen Auswahl das `select` erneut aufbauen. Das waren eigenständige, durch Codeprüfung belegte Race-Risiken, auch wenn sie nicht die Primärursache des obigen Trace waren.

**Lösung:** `assets/js/core/project-activation.mjs` führt eine monotone Aktivierungsgeneration für alle Projektaktivierungen ein. Asynchrone IndexedDB-Leseantworten, Portfolioabfragen und Fehlerbehandlungen dürfen nur bei aktuell gültiger Generation veröffentlichen. Der Übergang von validiertem Projektsnapshot zu UI, Engine, aktivem Projekt und localStorage erfolgt synchron ohne `await` innerhalb des Publikationsschritts; bei Fehlern wird der vorherige Zustand gerendert und die aktive Auswahl nicht als erfolgreich ausgegeben. Vor erneuter Aktivierung desselben Projekts wird `projectCommitter.whenIdle(id)` abgewartet. Native- und Tabellen-Drag werden beim beginnenden Wechsel abgebrochen, eine Engine speichert niemals eigenständig. Projektlöschung blockiert neue Commits auf das betroffene Projekt.

**Verworfene Alternativen:** Eine pauschale FIFO-Warteschlange für sämtliche UI-Projektaktionen würde neuere Benutzerauswahlen unnötig hinter veralteten Lesevorgängen stauen; blindes Mehrfachrendern, Sleeps und zusätzliche Zeitlimits beseitigen keine Ursache. Ein bloßer AbortController genügt für bereits laufende IndexedDB-Transaktionen nicht. Der Generation-Guard plus synchroner Commit-Punkt ist gegenüber diesen Ansätzen deterministisch und begrenzt auf den P1-Pfad.

### Änderungen, Tests und bekannte Ausfälle

| Gegenstand | Umsetzung |
| --- | --- |
| Projektaktivierung | `assets/js/core/project-activation.mjs`, `assets/js/app.js` (`9c10cefb`, `49ea2da1`, `34f5d16d`) |
| Korrigierte Testannahme | `tests/project-switch-cancel.spec.cjs` (`4a5e3d53`) |
| Deterministische Unit-Races | `tests/project-activation.spec.cjs`: kontrollierte Promises, A→B→A, verspätete Antworten, Fehler/Retry, Speicher-Commit, Generation `4a6d1542` |
| Browser-Projektwechsel | `tests/project-activation-browser.spec.cjs`: schnelle Wechsel, gehaltene IDB-Reads, neuerer Wechsel vor altem Resultat, geladene/gespeicherte Aufgaben, Ladefehler, Retry, Reload und veraltete Portfolioantworten (`aa03f892`, `71fff3f0`, `67b08682`) |
| IndexedDB-Cleanup | `assets/js/storage.js` schließt Verbindungen zusätzlich bei synchronen Fehlern in `get` und `getAll` (`468b8156`) |
| CI-Härtung | `.github/workflows/ui-regression.yml`: kompletter Browserlauf **plus 20 Einzeltest-Wiederholungen**; die neuen Tests werden syntaktisch geprüft (`045fa10b`) |
| ESM-Cache | `index.html`, `assets/js/app.js`, `assets/js/gantt.js`, Engine-Module, `.github/workflows/validate.yml`: konsistente `?v=2.8.1`-Versionierung (`d56f94c4`, `c5f9b02f`) |
| WCAG-Red-Team | `assets/css/design-system.css`, `docs/design-guidelines.md`, `tests/toast-accessibility.spec.cjs`: sichtbare Toasts bleiben deckend/kontrastfähig und verschwinden ohne Halbtransparenz-Phase (`ddfc4488`) |

**Fehler ausdrücklich nicht verworfen:** Frühe Branch-/PR-Läufe auf `34f5d16d` und `4a6d1542` schlugen noch am ursprünglichen unsynchronisierten Test fehl. Auf `aa03f892` scheiterte der neue gehaltene-IDB-Read-Test, weil sein eigener Stub auch den abschließenden Prüf-Read blockierte; der Stub wurde in `71fff3f0` gezielt repariert (keine abgeschwächte Assertion). Auf `d56f94c4` deckte der bestehende Modulcache-Test gemischte Import-Versionen auf; korrigiert mit `c5f9b02f`. Ein Browserlauf auf `c5f9b02f` zeigte im Hybrid-Mobile-Axe-Test vorübergehend ungenügenden Toast-Kontrast; ohne Änderung an der Axe-Assertion wurde die sichtbare Transparenzanimation entfernt und ein eigener Toast-WCAG-Test ergänzt (`ddfc4488`). Jeder Fehler ist als realer Lauf dokumentiert und erfordert eine neue vollständige CI auf dem finalen SHA.

### Nachgewiesene Zwischenstände (nicht als Finalfreigabe zählen)

- [UI-CI #42195837576](https://github.com/thomasasen/gantt-studio/actions/runs/42195837576) auf `4a5e3d53`: **71/71** Browserprüfungen erfolgreich, einschließlich korrigiertem kritischem Projektwechseltest.
- [UI-CI #42196100407](https://github.com/thomasasen/gantt-studio/actions/runs/42196100407) auf `468b8156`: komplette Suite erfolgreich (vor der 20x-Wiederholung).
- [UI-CI #42196216834](https://github.com/thomasasen/gantt-studio/actions/runs/42196216834) auf `045fa10b`: **82/82** komplette Browsertests und zusätzlich **20/20** Wiederholungen des kritischen Tests erfolgreich. Die gleichzeitig laufenden PR- und Push-Läufe müssen je nach tatsächlich ausgechecktem Head-/Merge-SHA gesondert betrachtet werden.
- [Fehler #42195981100](https://github.com/thomasasen/gantt-studio/actions/runs/42195981100): selbstblockierender neuer Teststub, behoben. [Fehler #42196336543](https://github.com/thomasasen/gantt-studio/actions/runs/42196336543): ESM-Versionen gemischt, behoben. [Fehler #42196914928](https://github.com/thomasasen/gantt-studio/actions/runs/42196914928): Toast-Kontrast bei Axe-Prüfung, daraufhin WCAG-Korrektur implementiert.

### Performance, Red-Team und verbleibende Risiken

Same-run-Baseline [#42196216834](https://github.com/thomasasen/gantt-studio/actions/runs/42196216834), identischer GitHub-Chromium-Runner, gemessene Medianwerte in ms: 0 Aufgaben Main/Native 0,0/0,0; 1 Aufgabe 3,0/3,2; 25 Aufgaben 17,9/18,6; 250 Aufgaben 161,5/151,1; **1.000 Aufgaben 604,0/608,3 (+0,7 %)**. Das sind Renderer-Messungen, keine End-to-End-Projektwechselzeiten. Weitere Messungen und der Native-Performance-Matrix-Test sind in CI-Artefakten enthalten; Hardware-/Runner-Schwankungen verbieten einen absoluten Vergleich mit früheren, anders ausgelasteten Läufen.

Red-Team: P1-Test-Synchronisation, Generation-übergreifende Aktivierung, IDB-Fehler-Cleanup, gemischter Modulcache und WCAG-Toast-Kontrast identifiziert und korrigiert. Der bestehende Engine-Lifecycle inklusive Pointer/Window-Listener-Cleanup, Escape/Pointer-Cancel, Revisionsschutz, Gantt-/Tabellen-Reorder, alle elf Themes, 390/768/1024/1440 px, Print, 200-%-Zoom und Reduced Motion bleiben Gegenstand der kompletten Suite. Restrisiken P2: Mehrtab-Löschkonflikte, native Großprojekt-Vollrenders, echte Touch-/Screenreader-/Safari-/Firefox-Geräte sowie bei von einer neueren Auswahl überholten Importen eventuell ungenutzte, aber gespeicherte Projektkopien. Keine dieser Grenzen wird als bereits abgeprüft ausgegeben.

**Merge-Gate:** `READY FOR MERGE` nur bei nachweislich 0 offenen P0/P1, vollständiger Datenintegrität und Parität, keiner A11y-/Performance-Regression und mindestens **drei vollständig erfolgreichen CI-Durchläufen auf demselben letzten Commit-SHA** inklusive 20 kritischen Wiederholungen. Nach weiteren Commits ist die Abnahme neu erforderlich. Bis dahin ausdrücklich **NOT READY**; PR #13 bleibt Draft, die finale Merge-Freigabe liegt ausschließlich beim Auftraggeber.


### Ergänzung: expliziter Pointer-Cancel-Nachweis

Das Red-Team identifizierte einen fehlenden, ausdrücklich per `PointerEvent('pointercancel')` ausgelösten Browser-Regressionstest (bisher waren Escape und Projektwechsel-Cancel nachgewiesen). `tests/pointercancel-regression.spec.cjs` prüft nun beide unabhängig: Tabellen-Reorder und Native-Gantt-Reorder, begonnen mit echter Playwright-Pointer-Interaktion, danach gezielter `pointercancel`, DOM-Vorschau-Cleanup, Freigabe von Pointer Capture, keine fachliche Änderung in IndexedDB und unveränderte Aufgaben nach Reload. Kein Sleep, keine abgeschwächte Assertion. Der Workflow prüft die Tests auf Syntax und führt sie innerhalb der vollständigen Suite aus. **Dieser neue Testcommit erfordert erneut alle finalen CI-Nachweise und 20 Wiederholungen.**


## 13. Abnahme des Pointer-Cancel-Finalstands vom 06.11.2026

**Geprüfter Code-Head:** `cbbce9dcd75f4ecdec88d88e9b0399d195a4dce2`. `main` bleibt bei `1ef29c9388b555308242bb6174ff6ed60127ea5d`; PR #14, Frappe-NO-GO und Schema v1 unverändert.

### Root Cause, Korrektur und Red-Team

Die forensisch nachgewiesene Primärursache des intermittierenden Gantt-Projektwechseltests war die zu frühe Übernahme einer Quellprojekt-ID vor Abschluss des asynchronen Demo-Ladevorgangs (Trace: `sourceStoredTasks: 0`). Der Test wartet seit `4a5e3d53` auf zehn Aufgaben und validiert das gespeicherte Quellprojekt. Unabhängig davon wurden echte Lücken der bisherigen Auswahlserialisierung gefunden und durch die gemeinsame monotone Projektaktivierung, veraltete-Leseantworten-Guards, synchronen Publikationspunkt, Commit-Drain, Rollback sowie Pointer-Cancel geschlossen (siehe Abschnitt 12). Die jüngste Red-Team-Ergänzung `tests/pointercancel-regression.spec.cjs` prüft Tabellen- und Gantt-Drag einschließlich Pointer-Capture-Freigabe, vollständigem IndexedDB-Snapshot und Reload. Der zunächst rote Griff-Viewport-Test auf `86844b78` wurde mit `scrollIntoViewIfNeeded()` und realem Hover in `cbbce9d` korrigiert, ohne Assertions abzuschwächen.

### Drei vollständige erfolgreiche Push-CI-Versuche auf identischem Code-SHA

| Workflow / Versuch | Ausgecheckter Stand | Vollständige Suite | Kritischer Projektwechsel (20x) |
| --- | --- | --- | --- |
| [Push-UI #42200394670, Versuch 1](https://github.com/thomasasen/gantt-studio/actions/runs/42200394670/attempts/1) | Head `cbbce9d…` | **87/87 erfolgreich** | **20/20 erfolgreich** |
| [Push-UI #42200394670, Versuch 2](https://github.com/thomasasen/gantt-studio/actions/runs/42200394670/attempts/2) | Head `cbbce9d…` | **87/87 erfolgreich** | **20/20 erfolgreich** |
| [Push-UI #42200394670, Versuch 3](https://github.com/thomasasen/gantt-studio/actions/runs/42200394670/attempts/3) | Head `cbbce9d…` | **87/87 erfolgreich** | **20/20 erfolgreich** |
| [PR-UI #42200402334](https://github.com/thomasasen/gantt-studio/actions/runs/42200402334) | Merge-Ref `23dcbba838acf1fbadab8df263c35063c66d8ebe`, **nicht** Head | **87/87 erfolgreich** | **20/20 erfolgreich** |
| [Validate #42200394814](https://github.com/thomasasen/gantt-studio/actions/runs/42200394814) | Head `cbbce9d…` | Statische Validierung erfolgreich | Entfällt |

Diese Auswertung unterscheidet explizit Push-Head und den GitHub-generierten PR-Merge-Ref. Frühere dokumentierte Fehlversuche, einschließlich `86844b78` mit nicht sichtbar gescrolltem Drag-Griff, bleiben als Fehlerhistorie erhalten.

### Gleicher Runner pro Main-/Native-Messpaar

| Aufgaben | Versuch 1 Main/Native | Versuch 2 Main/Native | Versuch 3 Main/Native | PR-Merge-Ref Main/Native |
| ---: | ---: | ---: | ---: | ---: |
| 0 | 0,0 / 0,0 ms | 0,0 / 0,0 ms | 0,0 / 0,0 ms | 0,0 / 0,0 ms |
| 1 | 2,9 / 4,6 ms | 2,5 / 2,0 ms | 5,1 / 2,8 ms | 3,1 / 3,1 ms |
| 25 | 23,9 / 17,6 ms | 13,8 / 14,6 ms | 20,3 / 18,0 ms | 16,8 / 20,4 ms |
| 250 | 138,8 / 157,6 ms | 117,9 / 109,4 ms | 160,8 / 151,7 ms | 159,5 / 167,7 ms |
| 1000 | 601,6 / 637,1 ms | 428,9 / 446,5 ms | 615,4 / 630,6 ms | 580,7 / 630,2 ms |

Native ist im 1.000-Aufgaben-Paar 2,5–8,5 % langsamer, ohne nachgewiesenen gravierenden strukturellen Ausreißer. Rendering großer Projekte bleibt ein dokumentiertes P2-Thema; die Zahlen sind keine End-to-End-Projektwechsel-Latenzen.

**Red-Team-Restpunkte P2:** Mehrtab-Löschkonflikte; große Vollrenders; nicht realgerätgeprüfte Touch-/Screenreader-/Firefox-/Safari-Szenarien; von späteren Aktivierungen überholte Import-Kopien. Keine aktuell nachgewiesenen offenen P0/P1 aus dem geprüften Teststand; manuelle Gerätekontrollen bleiben separat.

**Dokumentations-Gate:** Dieser Abschnitt wird als neuer Commit auf dem Arbeitsbranch gespeichert. Die vorstehenden drei erfolgreichen Läufe gelten strikt für **`cbbce9d…`**, nicht automatisch für den neuen Dokumentations-Commit. Vor abschließendem READY müssen die geforderten CI-Nachweise erneut dem finalen Branch-Head zugeordnet werden. PR #13 bleibt Draft; keine Merge-Aktion.


## 14. Experimental Frappe repairs (Draft-PR #15, 06.11.2026)

**Branch:** `fix/frappe-lifecycle-isolation`. **PR:** https://github.com/thomasasen/gantt-studio/pull/15. This is a new isolated experiment, not a reversal of the NO-GO for Frappe 1.2.2 and not a merge approval. The existing application stays Native-only; no changes to the project schema or IndexedDB protocol.

### A. Global listener leak: isolation instead of monkey-patching

Upstream Frappe 1.2.2 registers a `document.mouseup` listener per chart with no public dispose. The existing comparison rebuilt a Frappe chart in the parent document, so removing only its SVG could not release that global listener.

`assets/js/engine/frappe/frappe-adapter.mjs` now creates a fresh same-origin iframe for each render. `spikes/frappe/frame.html` / `frame.mjs` load the pinned UMD and CSS inside that child document only. Replacing/removing the iframe destroys the vendor document and its listener registrations. The parent has one explicit `message` listener per mount; it is removed on `destroy()`. Every response is checked against origin, source window, message channel and current generation to reject late or forged completion messages. No runtime CDN, no upstream modification, no global monkey-patching.

The browser test `tests/frappe-isolation.spec.cjs` checks repeated rerenders, no new parent `mouseup` listeners, one live iframe, stale-message rejection, same-origin behavior and no new IndexedDB/localStorage projects. This checks *host isolation*, not full memory usage or browser GC timings.

### B. Premature Frappe edit callbacks: explicit gesture gate

Upstream `Bar.update_bar_position()` can invoke `on_date_change` before any valid release. Thus callbacks must never directly create a persistent project command. `assets/js/engine/frappe/frappe-gesture-gate.mjs` adds a small deterministic state machine that buffers the latest date/progress change for one active task and pointer, emits at most one `task-change` intent on a valid matching mouseup, and discards previews on Escape, Pointer-Cancel and invalid releases. Unit tests cover early callbacks, superseded previews, stale pointers, cancel, and double release.

The isolated frame has an *opt-in experiment* `/spikes/frappe/index.html?edit=1`. It records emitted intents in memory only; it never calls IndexedDB and never modifies the canonical project. The regular evaluation page and all production paths remain read-only. The new `tests/frappe-interaction-preview.spec.cjs` uses the upstream bar-preview method only inside the test to check actual callback timing and cancellation. **This does not yet certify a real end-to-end mouse/keyboard editor.** The publicly advertised adapter capabilities remain read-only.

### C. Still-blocking feature gaps / acceptance criteria

The following remain **not implemented and therefore merge-blocking** as a full Native replacement: phase summary rows, chart-side reorder with table sync, baselines, buffers, markers, holidays, eleven themes, print/A11y parity, keyboard editing, task focus and marker navigation. The new iframe adds potential focus/scroll and large-project overhead which must be measured before production consideration. A real-browser drag/resize/progress matrix with Pointer-Cancel/Escape and successful persisted atomic commits remains an explicit separate gate.

**Weitere P1-Integrationsgrenze:** Das isolierte Frame signalisiert seinen Render-Erfolg asynchron über `postMessage`; der aktuelle `engine-controller.mjs` bestätigt Rendering und Rollback synchron. Der Experiment-Adapter darf deshalb nicht in den produktiven Controller eingehängt werden, bevor ein generationensicherer asynchroner Render-/Rollback-Vertrag oder eine gleichwertige atomare Aktivierung implementiert und getestet ist.

**Decision: NOT READY FOR MERGE as a production Gantt engine.** PR #15 must stay Draft. PR #14 unchanged. Native remains the only supported and productive renderer.


## 15. Async Engine-Lifecycle und rollback-sicheres Opt-in (06.11.2026)

**Scope:** Weiterentwicklung auf Draft-PR #15 (`fix/frappe-lifecycle-isolation`), nicht als automatisch produktiv nutzbarer Renderer. `main`, `app.js`, Native-Renderpfad und IndexedDB-Protokoll bleiben unangetastet.

- `engine-async-controller.mjs`: Separater opt-in Async-Controller mit serialisierten Render-/Switch-Intents, monotoner Generation, AbortSignal, immutable Projektionen und Veröffentlichung des letzten bestätigten Renderstands **erst nach erfülltem Render-Promise**. Neue Intents überholen ausstehende Renderbefehle; Scroll-Updates warten stattdessen auf Render-Readiness.
- Ein nicht bestätigter Engine-Wechsel wird nicht als erfolgreich publiziert. Bei Fehler wird der vorherige Adapter mit der letzten bestätigten Projektprojektion und dem alten Viewport wiederhergestellt; schlägt dies fehl, wird der Controller geschlossen und fordert ein neues Mount.
- `frappe-adapter.mjs`: `renderAsync({project,view},{signal})` wartet auf die tatsächliche `ready`-Rückmeldung des richtigen Frames (Origin, Window, Generation); Timeout, Fehler-Message und Abort lehnen die Operation ab. Der Legacy-`render()`-Aufruf behält seinen synchronen Rückgabewert nur für die isolierte Vorschau, **nicht** als Readiness-Bestätigung.
- Der bisherige synchrone Controller weist Adapter mit `asyncRendering:true` vor der Aktivierung ab. Die Native-Engine bleibt sein einziger produktiver Renderer.
- Tests: deterministische Unit-Tests für asynchrone Fehler, Stale/Supersession, Cancel, Viewport, Restore und Fail-Closed sowie separate Chromium-Integration gegen den echten Vendor-Frame.

**Offen:** Die Engine-UI wird beim Test-Switch noch nicht visuell zweiphasig gestaged; kurzzeitig kann der Chart während eines async Switches leer sein. Daher noch keine vollständige atomare *Darstellungsumschaltung* und kein Produktions-GO. Alle bisherigen Funktionsparitäts-, A11y-, Fokus-/Scroll-, Performance- und Persistenz-Gates bleiben offen. Ein grüner Test reicht allein nicht für einen Merge.


## Ergänzung: Zweiphasige Engine-Aktivierung auf PR #15 (06.11.2026)

**Status:** Im Experimentierbranch `fix/frappe-lifecycle-isolation` implementiert; Freigabe nur nach den jeweils neuesten GitHub-Actions-Checks. **PR #15 bleibt Draft / NOT READY für einen produktiven Engine-Ersatz.** Keine Änderung an `main`, `app.js`, dem Projektformat oder dem Persistenzvertrag.

### Entscheidung und Verantwortlichkeiten

Die Staging-Verwaltung ist bewusst Bestandteil des opt-in `engine-async-controller.mjs`. Der synchrone `engine-controller.mjs` und die produktive Native-Integration bleiben unverändert. Der Async-Controller besitzt aktive und vorbereitete Adapter, die Generation, den letzten bestätigten eingefrorenen Projekt-Snapshot, den Viewport und die beiden DOM-Wurzeln. Persistenz bleibt ausschließlich Sache der Anwendung. Das experimentelle Frappe-Rendering bleibt read-only.

**PREPARE:** Der bisherige DOM-Baum und seine Adapterinstanz bleiben sichtbar und bedienbar. Eine neue Engine wird in einem getrennten, inert und `aria-hidden` gesetzten Geschwisterelement unter **demselben Scroll-Parent** gemountet. Der vorbereitete Baum wird mit `opacity:0` und `pointer-events:none` bei realer Geometrie gerendert, nicht mit `display:none`. Mount-Callbacks werden bis zum Commit nach Engine-Identität gegated. Die neue Engine erhält die letzte bestätigte immutable Projektprojektion und den View-Zustand. `renderAsync()` gilt erst nach korrekter Frappe-Frame-Ready-Bestätigung als abgeschlossen; Timeout, Fehler oder Abort verhindern die Veröffentlichung.

**COMMIT:** Nach erneutem Generationencheck wird der *aktuelle* Scrollstand des gemeinsamen Parents erfasst, mit dem neuen Adapter abgeglichen und danach synchron in einem JavaScript-Turn der alte DOM-Baum inert/unsichtbar und der neue sichtbar/aktiv gesetzt. Erst danach werden `engine` und `factory` auf den Kandidaten umgestellt. Der Fokus wird aus dem zuvor erfassten alten Element möglichst an dieselbe Aufgabe, sonst an den neuen Gantt-Container übertragen. Eine explizit gesetzte Root-Breite wird übernommen, um horizontalen Scroll-Clamp zu vermeiden. Es gibt keine künstlichen Animationen.

**CLEANUP:** Erst nach Veröffentlichung wird der Altadapter einmal zerstört und sein alter Mount-Container entfernt. Cleanup-Fehler werden über den vorhandenen `onError`-Kanal gemeldet, ohne eine bereits bestätigte neue Ansicht zu reaktivieren. Der Controller hält ein `WeakSet` für idempotente Destroy-Versuche und gibt auch bei `destroy()` während des Stagings beide Adapter frei. Bei Controller-Destroy wird der ursprüngliche vom Aufrufer bereitgestellte Mount-Container an seine ursprüngliche DOM-Position zurückgestellt.

**ROLLBACK / Nebenläufigkeit:** Factory-, Mount-, Render-, Frame-, Timeout-, Abort-, Generationen- und Aktivierungsfehler vor Commit entfernen ausschließlich den Kandidaten und sein Stage-Element; der bisherige Adapter wird weder zerstört noch neu gemountet oder erneut gerendert. Neuere Projekt- oder Engine-Aufträge invalidieren den älteren Generationstoken und aborten den wartenden Render-Auftrag. Sogar bei einem Adapter, der Abort nicht beachtet, kann die Controller-Queue durch abortfähiges Promise-Racing freigegeben werden. Verspätete Ergebnisse werden nicht veröffentlicht. Fachliche Projektaktivierung und visuelle Engine-Aktivierung sind getrennt.

### Tests und Einschränkungen

- `tests/engine-async-controller.spec.mjs`: deterministische Gate-/Abort-/Rollback-/Factory-/Mount-/Cleanup-/Destroy-Tests, immutable Snapshots und Konkurrenzfälle.
- `tests/frappe-async-controller.spec.cjs`: echter isolierter Frappe-Frame, kontrolliert zurückgehaltener Frame-HTTP-Response (ohne `sleep()`), sichtbarer alter DOM-Baum während PREPARE, Timeout-/Rollback- und Viewport-Matrix, Fokus/Scroll bei simulierter 200-%-CSS-Zoomstufe und `prefers-reduced-motion`.
- Vollständige bestehende Playwright-Suite, 20-facher Projektwechsel-Stresstest sowie PR-merge-ref-CI bleiben verbindliche Freigabegates. Ergebnisse **nur** für die endgültige Branch-SHA zählen.
- Der Zoomtest mit CSS `zoom:200%` ersetzt **keine** manuelle echte Browser-Zoom-/Screenreader-Abnahme.
- Der Native-Adapter nutzt `container.parentElement` als Scrollcontainer. Genau deshalb wird die Engine nicht als Kind des bisherigen Mount-Elements vorbereitet und ein bereits aktiver iframe nicht umgehängt.
- Die neue Darstellung kann sich bei inhaltlich unterschiedlicher Chart-Höhe naturgemäß in ihrer erforderlichen Dokumenthöhe unterscheiden. Vollständige Funktionsparität, Accessibility, UX, Performance großer Projekte, Frappe-Editor-Transaktionen und realistische Langzeit-Ressourcenmessungen bleiben offene Gates.

**Validierter Implementierungs-Commit:** [`60fb8c626c0c85445ee689a37cf93d16950635b3`](https://github.com/thomasasen/gantt-studio/commit/60fb8c626c0c85445ee689a37cf93d16950635b3) (06.11.2026). Der Dokumentationsnachtrag selbst hat einen folgenden SHA und muss separat durch die CI laufen.

**Verifizierte GitHub-Actions-Nachweise für diesen Implementierungs-Commit:**

- [Validate Gantt Studio #42221973122](https://github.com/thomasasen/gantt-studio/actions/runs/42221973122): erfolgreich, inklusive Syntax und Unit-Prüfungen.
- [UI browser regression / Push #42221972913](https://github.com/thomasasen/gantt-studio/actions/runs/42221972913): erfolgreich.
- [UI browser regression / PR-Merge-Ref #42221986134](https://github.com/thomasasen/gantt-studio/actions/runs/42221986134): erfolgreich; **32/32 Unit-Tests, 103/103 Chromium-Browsertests und 20/20 Projektwechsel-Wiederholungen**.

**Red-Team-Befunde und Behebung:** Vorher war der alte Adapter bereits vor Render-Ready zerstört. Bei den ersten Staging-Prototypen trat im 200-%-Zoom ein echter Fokusfehler auf: Der vorbereitete Container behielt in Chromium berechnet `visibility:hidden`, selbst wenn ein Inline-Override `visible` gesetzt wurde. Staging verwendet deshalb bewusst `opacity:0` bei `inert`, `aria-hidden` und unterdrückten Pointer-Events; Commit macht die neue Darstellung ohne Animation deckend. Ein unabhängiger Chromium-Test hat den Fehler zunächst reproduziert und bestätigt die Korrektur im grünen PR-Lauf. Weitere behobene Befunde: Breitenverlust beim Commit, verwaister Cleanup-Aufruf nach Layoutänderung und ein Factory-Kandidat, der dieselbe aktive Adapterinstanz zurückgab.

**Verbleibende Risiken:** Keine vollständige Gesten-/A11y-Editorparität von Frappe, keine produktionsreife Schreibanbindung, keine Langzeit-Leak-Messung und kein eigener Nachweis für echte 200-%-Browser-Zoom-Einstellung oder Screenreader. Bei einem fehlerhaften Adapter-`destroy()` kann der Controller seine internen Referenzen einmalig freigeben, aber nicht die Entfernung aller vom Adapter extern registrierten Ressourcen garantieren. Dieses Verhalten wird über `onError` gemeldet.

**Entscheidung:** Die isolierte zweiphasige Umschaltung ist auf dem verifizierten Implementierungs-SHA technisch bestanden. **PR #15 bleibt Draft und NOT READY zum Merge als produktiver Frappe-Ersatz.** `main` und PR #14 unverändert; keine produktive Frappe-Aktivierung.


## 16. Transaktionaler Frappe-Editorvertrag (experimenteller Folge-PR, 06.11.2026)

**Basis:** `fix/frappe-lifecycle-isolation@86de64e13f004de4b75e5e8f29c04f00bdab3241`. **Branch:** `feature/frappe-transactional-editor`, Draft gegen PR #15. Kein Merge, kein Default-Wechsel und **keine Aktivierung der Frappe-Schreibfunktion in `app.js`**. Auch der reguläre Spike bleibt read-only. Der Testparameter `?edit=1` ist ausschließlich ein Diagnosemodus ohne Projektpersistenz.

### Architekturentscheidung: Engine-unabhängige Transaction Boundary statt vertrauenswürdiger Frappe-Callbacks

1. `assets/js/core/transactional-editor.mjs` implementiert einen vom Renderer unabhängigen Sitzungs- und Änderungsvertrag. Er akzeptiert ausschließlich `task-change`, validiert Aufgabe, sichtbare Task-ID, inklusive Kalenderdaten, Mindestdauer und Fortschritt 0–100 und greift nur über die bestehende `createProjectCommitter`-Schicht auf die Persistenz zu. Unveränderte Felder wie Abhängigkeiten, Phase und `displayOrder` bleiben erhalten.
2. Ein Editor-Sitzungstoken wird mit Projekt-ID, Basisrevision, Engine-Generation und expliziter Aufgaben-Whitelist verknüpft. `preview()` speichert niemals. `submit()` validiert den Zustand nochmals **innerhalb** der Projekt-Commit-Queue. `onCommitted()` wird erst nach erfolgreichem `save()` aufgerufen; fehlgeschlagene Änderungen werden zurückgesetzt und nicht als gespeichert gemeldet. Unpassende Tokens und Revisionen werden verworfen.
3. `frappe-gesture-gate.mjs` akzeptiert maximal eine Abgabe je Gesture, kontrolliert Pointer-ID und Task-ID, blockiert Reentrancy während eines ausstehenden `emit`-Promises und unterscheidet ausdrücklich **Intent versandt** von **Persistenz bestätigt**. Abbruch und Fehler lösen Rollback aus, soweit noch nicht gespeichert wurde.
4. `spikes/frappe/frame.mjs` führt nur im expliziten Diagnosemodus Pointer-/Mouse-Events zusammen. Der Abschluss wird nach den synchronen Upstream-`mouseup`-Callbacks abgewickelt; Escape, Pointer-Cancel, Capture-Verlust und Blur brechen ab. Ohne `?edit=1` ist Frappe schreibgeschützt.
5. `frappe-adapter.mjs` prüft neben Origin, Source und Generation eine pro Render zufällige Session-ID, Render-Readiness, Gesture-Sequenz/Deduplikation und Änderungs-Payloads gegen sichtbare Aufgaben. Ungültige, alte und doppelte Meldungen dürfen keine `onIntent`-Callback-Aufrufe erzeugen. Eine erfolgreiche, gültige Nachricht bleibt trotzdem nur ein *fachlicher Änderungswunsch*, **kein Commit-Nachweis**.

**Zustände:** `idle → preview → pending → committed / cancelled / failed`. `invalidate()` schließt die Sitzung bei Projekt-/Engine-Wechsel. Ein speichernder Aufrufer muss nach erfolgreichem Commit den neuen, bestätigten Projekt-Snapshot veröffentlichen und einen neuen Sitzungstoken ausgeben. Fehlende oder unzulässige Aufgaben werden fail-closed abgewiesen.

### Grenzen, die explizit keine produktive Freigabe zulassen

- **P1 / NO-GO:** Frappe 1.2.2 bietet weiterhin keinen verifizierten öffentlichen, transaktionalen Drag-/Resize-/Progress-Abschlussvertrag mit garantiertem Abort und genau einer verlässlichen finalen Vorschau. Ein Listener-Gate auf internen DOM-Ereignissen ist nur Diagnose, keine belastbare Produkt-API. Die bereits reproduzierten Upstream-Früh-Callbacks sind dadurch nicht behoben.
- **P1 / gespeicherter Schreibvorgang:** Sobald ein IndexedDB-Commit erfolgreich angelaufen ist, kann die übergeordnete Engine ihn nicht rückwirkend durch `destroy()`, Projektwechsel oder iframe-Abbruch annullieren. Das neue Fencing verhindert das **Veröffentlichen** eines veralteten Ergebnisses in der aktiven UI und verwirft vor der Queue-Ausführung ungültige Aufträge. Für den stärkeren Anspruch „keine Persistenz nach Abbruch während laufendem Save“ wäre ein transaktional abbrechbarer Storage-Vertrag mit Abort/Revision-Fencing erforderlich; bislang bewusst nicht als garantiert behauptet.
- **P1 / kein Live-Wiring:** Der isolierte Diagnosemodus zeichnet `EngineIntent` ausschließlich im Arbeitsspeicher der Vergleichsseite auf. Ein reales Frappe→App→IndexedDB→Frappe-Acknowledgement mit sauberem Rollback und UI-/Tabellensynchronisierung ist **nicht implementiert**; deshalb bleibt der Capabilities-Vertrag read-only und PR Draft.
- **P2:** Tastatur-, Touch-/Stift-, tatsächlicher Browserzoom und Screenreader-Parität, Scroll-/Fokuserhalt bei einem schreibenden Render-Rollback sowie das vollständige Frappe-Feature-Delta bleiben externe Abnahmesperren. CSS-Zoom kann echte Browser-Zoom-/Assistive-Tech-Tests nicht ersetzen.
- **P2:** Die iframe-Session reduziert versehentliche alte/replayte Nachrichten, stellt aber keine sichere Sandbox gegenüber kompromittiertem gleichoriginigem JavaScript dar. Die fachliche Validierung **muss** auch vor jedem tatsächlichen Persistenzauftrag im Parent erfolgen.

### Red-Team-Review: vier unabhängige Prüfperspektiven

| Perspektive | Befund | Schweregrad | Maßnahme / Stop-Kriterium |
| --- | --- | --- | --- |
| Architektur | Frappe-interne DOM-Events werden für den Diagnose-Gesture-Abschluss benötigt | P1 | Kein produktives Editor-Wiring; öffentliche Upstream-API zwingend erforderlich |
| Datenintegrität | Gestarteter IndexedDB-Save nicht nachträglich abbrechbar | P1 | Stale Publikation unterdrückt, neues Storage-Abort-/Fencing-Gate nötig |
| Frontend/UX | Upstream-Früh-Callbacks, Move/Resize-Unterscheidung und Touch nicht robust verifiziert | P1 | Reale Pointer-Testmatrix inkl. Progress, Cancel, Resize + A11y als Stop-Kriterium |
| QA/Sicherheit | Fremde/alte/doppelte Frame-Intents zuvor nicht ausreichend geprüft | P1 → mitigiert | Origin+Source+Session+Generation+Whitelist+Payload+Gesture-Deduplizierung |
| Frontend/UX | `committed` konnte zuvor schon beim bloßen Intent-Dispatch suggeriert werden | P2 → behoben | Gate-Zustand heißt `dispatched`; persistierter Erfolg liegt allein beim Committer |
| QA | Reale Mausläufe waren in PR #14 bekanntermaßen teils flaky | P2 | Echte Pointer-Proben ergänzen, negative Ergebnisse nicht durch Mock-Erfolge verdecken |
| Architektur | Funktionsparität zur Native-Engine bleibt offen | P1 | Native bleibt Standard und Referenz, kein Merge |

### Tests und Entscheidung

- Unit-/Contract-Testdatei: `tests/transactional-editor.spec.mjs` (strikte Inputs, Termine, Filter, Move/Resize/Progress, doppelte Abgabe, Commit-Queue, Persistenzfehler, Wiederholung, Projekt-/Generationswechsel).
- Bestehende Gesture-Gate-Tests: `tests/frappe-gesture-gate.spec.mjs`; zusätzlich Browserprüfung mit *echtem* Maus-Pointer und isoliertem Frappe-1.2.2-Vendor in `tests/frappe-transactional-browser.spec.cjs`.
- CI: `validate.yml` und `ui-regression.yml` auf den neuen Branch und Draft-PR gegen den Lifecycle-Branch erweitert; sowohl finaler Head als auch PR-Merge-Ref sind separat zu prüfen.
- **Keine Behauptung eines erfolgreichen realen schreibenden Browser-Commits:** Dafür existiert noch keine freigabefähige Runtime-Schnittstelle.
- **Entscheidung für eine schreibfähige Frappe-Engine: NO-GO.** Teilweise GO nur für die isolierte, engineunabhängige Vertrags- und Negativtest-Infrastruktur, solange sämtliche editierenden Funktionen aus bleiben. Dies setzt das frühere Gate-C-NO-GO aus PR #14 **nicht** außer Kraft.


### Verifizierter CI-Nachweis auf dem Implementierungsstand (06.11.2026)

- **Implementierungs-SHA:** `f967304eeeb2534e65a0c56d480986f767aa5723`; tatsächlicher GitHub Actions **PR-Merge-Ref SHA:** `800fbc2` (Merge von `f967304` in `86de64e`). Die Checks laufen damit gegen den richtigen Zielbranch von PR #16, nicht nur gegen `main`.
- [Static Validate, PR-Merge-Ref #42227444924](https://github.com/thomasasen/gantt-studio/actions/runs/42227444924): **SUCCESS, 43/43 Node-Tests**, 0 fehlgeschlagen.
- [UI browser regression, PR-Merge-Ref #42227444915](https://github.com/thomasasen/gantt-studio/actions/runs/42227444915): **SUCCESS, 107/107 Chromium-Tests**, 0 fehlgeschlagen, anschließend **20/20 Projektwechsel-Stresstests** erfolgreich.
- Diese grünen Läufe belegen die Vertrags-Negativtests, die Pointer-Proben und die Native-/Lifecycle-Regression, nicht den produktiven Frappe-Editor. Der präzise NO-GO-Status bleibt deshalb bestehen. Push-Runs des Feature-Head sind über die verfügbare workflow-run-Abfrage nicht separat verifiziert.
- **Wichtig für einen folgenden Dokumentations-Commit:** Dessen SHA benötigt einen neuen erfolgreichen finalen CI-Lauf, bevor PR #16 als technisch grün auf dem endgültigen Head bezeichnet werden darf.


## 17. Öffentliche Frappe-Editor-API – aktueller Stable-Check und physische Pointer-Diagnose (06.11.2026)

**Ausgangs-SHA:** `feature/frappe-transactional-editor@c91dbefef0a93df19e8a591b8fe5f939abe17e90`. **Arbeitsbranch:** `spike/frappe-public-editor-api`; eigenständiger Draft-PR gegen den Feature-Branch. Keine Änderungen an `main`, `app.js`, dem Projektformat, der Native Engine oder dem vendorten Paket. `?edit=1` bleibt reiner Diagnosemodus ohne IndexedDB-Schreibanbindung.

### A. Release- und API-Abgleich anhand der Primärquellen

- npm: [frappe-gantt Versionsübersicht](https://www.npmjs.com/package/frappe-gantt?activeTab=versions) meldet **1.2.2 als aktuellen Stable-`latest`-Tag** (Veröffentlichung 25.02.2026), davor 1.2.1 (17.02.2026). Im November 2026 existiert **keine neuere stabile npm-Version**.
- [GitHub Releases](https://github.com/frappe/gantt/releases) zeigt weiterhin **v1.0.3** als GitHub-Release an. Dies ist nicht gleich dem neuesten npm-Release; `master`-Commits sind keine geprüften npm-Stable-Versionen.
- Dokumentierte öffentliche Methoden laut [Upstream README](https://github.com/frappe/gantt): `update_options`, `change_view_mode`, `scroll_current`, `update_task`. Dokumentierte Callbacks u. a. `on_date_change`, `on_progress_change`, `on_click`, `on_view_change`.
- **Nicht dokumentiert** als verlässlicher öffentlicher Vertrag: `beforeCommit/afterCommit`, `preventDefault/rollback`, abortbarer Drag-/Resize-/Progress-Commit, Escape-/Pointer-Cancel-Transaktion, `destroy()` mit garantierter Listener-Freigabe. Insbesondere `update_task` ist kein Ersatz für eine transaktionale Bestätigung.
- [Upstream Issue #494](https://github.com/frappe/gantt/issues/494) ist offen und benennt das konkrete Problem mehrfacher `on_date_change`-Aufrufe während eines Drag.
- `move_dependencies:false` ist eine öffentliche Option, die automatische Frappe-Verschiebungen verhindern soll; diese Option **beweist keine** Vollständigkeit der eigenen Projekt-/Abhängigkeitsregeln. Der isolierte Frame und die lokale MIT-lizenzierte Vendor-Auslieferung bleiben erhalten.
- Es gibt keinen Anlass, das geprüfte Paket 1.2.2 durch eine ältere 1.2.1-Version oder einen unveröffentlichten Upstream-`master` zu ersetzen.

| Version/Kandidat | Stable / lokal verifiziert | Öffentlicher Abschluss-/Cancel-Vertrag | Entscheidung |
| --- | --- | --- | --- |
| 1.2.1 | Veröffentlicht, älter als 1.2.2; **nicht** erneut im Browser getestet | Kein neu nachgewiesener transaktionaler Abschlussvertrag | Kein begründeter Downgrade |
| **1.2.2** | **Aktuellstes Stable, lokal im Projekt gepinnt**; bisherige Browser-Negativtests aus PR #14–#16 | Früh-Callbacks/fehlende Commit- und Cancel-Garantien in Vorphasen reproduziert | Beibehalten für Diagnose, **NO-GO** für schreibende Integration |
| GitHub `master` | Unveröffentlichter Entwicklungsstand, keine Stable-Paketversion | Keine verlässliche veröffentlichte API-Zusage ableitbar | Nicht als neue Stable behandeln |

Die Vergleichsmatrix ist ausdrücklich **kein vollständiger 1.2.1-vs.-1.2.2-Interaktions-Benchmark**. Dieser ist nur sinnvoll, wenn ein realer neuer Stable-Kandidat oder ein begründeter Regressionstest gegen die ältere Version erforderlich wird.

### B. Tatsächlich hinzugefügte Diagnose

`spikes/frappe/frame.mjs` protokolliert nur bei `?edit=1` Ereigniszeitpunkte in `window.__frappeInteractionTrace`: native `pointerdown/pointermove/pointerup/pointercancel/lostpointercapture`, `mousedown/mousemove/mouseup`, Escape, Blur sowie **öffentlich** ausgelöste `on_date_change`- und `on_progress_change`-Callbacks. Zusätzlich werden Gate-Intent und Cancel erfasst. Die Protokollierung verwendet **keine private Frappe-Methode** und ist auf 2.000 Einträge je Frame begrenzt. Kein Projekt- oder Browser-Storage wird durch die Diagnose beschrieben.

`tests/frappe-public-editor-pointer.spec.cjs` erfasst per **echter Playwright-Maus und Tastatur** Move, Resize links/rechts, Progress, Klick ohne Bewegung, Escape, Release außerhalb und Frame-Neurendern während des Drags. Die JSON-Dateien werden unter `frappe-evidence/*.json` archiviert. Ein erfolgreicher **Sicherheits-Test** belegt nur `keine vorzeitige/mehrfache Intent-Abgabe` und `keine IndexedDB-Projektspeicherung`. **Null Upstream-Callbacks sind kein positives Funktionszertifikat.** Die tatsächliche Anzahl, Zeitpunkte und Inhalte stehen in den Prüfartefakten. Bis CI/Browser-Resultate dieses Commits vorliegen, sind sie als *implementiert, noch nicht verifiziert* zu behandeln.

### C. Architekturentscheidung mit vier Red-Team-Perspektiven

| Perspektive | Schwere | Befund / Maßnahme |
| --- | --- | --- |
| Architektur | **P1 Stop** | Stabile öffentliche Commit-/Cancel-API fehlt, Herstellerinterne Methoden dürfen nicht zur Laufzeit-Semantik werden. Kein Produktiv-Wiring. |
| Datenintegrität | **P1 Stop** | Gestarteter IndexedDB-Write kann durch Engine-/Projektwechsel nicht verlässlich annulliert werden; vor-Commit-Fencing und Stale-UI-Filter sind vorhanden, Storage-Transaktionscancellation nicht. |
| Frontend/UX | **P1 Stop** | Echtes Drag-/Resize-/Progress-Verhalten einschließlich Touch, Capture-Verlust, Datumssnap, Fokus, Tastatur und A11y nicht positiv zertifiziert. |
| QA/Sicherheit | **P2** | Positivtests dürfen durch null Callback/unechte Pointerereignisse nicht vorgetäuscht werden; jeder reale Lauf liefert Rohdaten und Sicherheitsassertions. Stale-Messages und Replay bleiben mit Sessions/Generation zu schützen. |
| Upgrade-/Paritätsrisiko | **P2** | Keine neue stabile Hersteller-API, weiter hoher Eigenaufwand für Native-Parität, Druck, Designs und Phasen. Native bleibt Referenz. |

**Option 1 (aktuelle Stable direkt): NO-GO**, da der öffentliche Abschlussvertrag nicht nachgewiesen ist. **Option 2 (Adapter um 1.2.2): NO-GO für schreibfähigen Betrieb**, weil der Pointer-Guard auf internem DOM-/Gesture-Verhalten beruht. **Option 3 (read-only Isolation und unabhängige Sicherheitsprüfungen): gewählt.** Keine konkurrierende Commit-Schicht, keine Frappe-Patches, kein Fork.

### D. Technische Abnahme und Sperren

- **Untersucht:** npm-/GitHub-Stable-Stand und öffentliche API, Upstream-Issue #494, Stand PR #14–#16.
- **Experimentell implementiert:** isolierte Ereignis-Telemetrie und echte physische Playwright-Diagnoseszenarien. Keine echte schreibende Engine implementiert.
- **Bereits durch frühere Unit-Tests nachgewiesen:** Transaktions-/Session-/Revisionsschutz des unabhängigen Editors (PR #16).
- **Echte Browserinteraktionen in diesem Branch:** neu angelegt, tatsächliche Resultate nur nach erfolgreichem CI-Lauf und Einsicht in Protokolle bestätigen.
- **Vollständige Persistenzintegration:** **nicht vorhanden und nicht nachgewiesen**.
- **Noch offen:** Herstellervalidierter End-of-Gesture-/Cancel-Vertrag, echte positive Move-/Resize-/Progress-Matrix, Kalender-/DST-/TZ-End-to-end über den Vendor, vollständiger Commit nach IndexedDB und UI-Refresh, Projektwechsel während begonnenem Save, Touch/Keyboard/A11y, Native-Feature-Parität, Memory-/Performance-Langzeitmessungen.
- **Entscheidung:** **NO-GO** für einen schreibfähigen Frappe-Editor. Die neue Diagnostik ist nur eine unabhängige experimentelle Härtung. Kein Merge und keine produktive Aktivierung.

### E. Reale Browsermessung auf PR-Merge-Ref `be37bd2` (CI vom 06.11.2026)

Die erste neue Browser-CI (`44c56670`) schlug bei vier Fällen fehl, weil der unterhalb der Native-Referenzansicht liegende Frappe-iframe vor dem physischen Mauszug **nicht in den sichtbaren Browserviewport gescrollt** wurde. Dadurch erreichte `pointerdown` den iframe überhaupt nicht. Der Messaufbau wurde ausdrücklich korrigiert: `scrollIntoViewIfNeeded()`, `toBeInViewport()` sowie eine im iframe instrumentierte echte `pointerdown`-Bestätigung. Damit lässt sich ein falsch-grüner Offscreen-Maustest künftig nicht als Browsernachweis ausgeben.

**Nachgewiesen auf `20b5f9b0012f53d775b90ba8a9d5e32f0858b190`:** [PR-Validate #42231551668](https://github.com/thomasasen/gantt-studio/actions/runs/42231551668) erfolgreich, **43/43 Node-Tests**; [PR-Merge-Ref-UI #42231551678](https://github.com/thomasasen/gantt-studio/actions/runs/42231551678) erfolgreich, **115/115 Chromium-Tests** und **20/20 Projektwechsel-Stresstests**, tatsächlicher Checkout des PR-Merge-Commits `be37bd2` gegen den Feature-Branch. Ebenfalls erfolgreicher [Branch-Push-Validate #42231539816](https://github.com/thomasasen/gantt-studio/actions/runs/42231539816) und [Branch-Push-UI #42231540108](https://github.com/thomasasen/gantt-studio/actions/runs/42231540108). [Messdaten-Archiv](https://github.com/thomasasen/gantt-studio/actions/runs/42231551678/artifacts/13510170939).

| Echte Playwright-Interaktion | Öffentliche Frappe-Callbacks laut Browsertrace | Diagnose-Gate/IndexedDB | Bewertung |
| --- | --- | --- | --- |
| Balken-Move (+65 px) | **3 × `on_date_change`, alle vor Pointer-Up**; letzter Callback 44,2 ms vor Pointer-Up | **1 Intent erst nach Pointer-Up**, keine Speicherung | Früh-Callbacks real reproduziert |
| Resize links (−30 px) | **1 × `on_date_change` vor Pointer-Up** | 1 Intent nach Up, keine Speicherung | Physische Vorschau/Abgabe demonstriert, nicht API-zertifiziert |
| Resize rechts (+35 px) | **1 × `on_date_change` vor Pointer-Up** | 1 Intent nach Up, keine Speicherung | Wie oben |
| Progress (+25 px) | **1 × `on_progress_change` nach Pointer-Up** | 1 Intent nach Up, keine Speicherung | Abschließender Callback empirisch beobachtet, nicht garantiert |
| Klick ohne Bewegung | 0 Edit-Callbacks | 0 Intents, keine Speicherung | Sicherheitsgate bestanden |
| Escape während Drag | 3 × `on_date_change` **vor Escape** | 0 Intents, keine Speicherung | Rollback-Gate wirksam; Frame wird neu aufgebaut |
| Pointer-Up außerhalb | 3 × `on_date_change` **vor Verlassen** | 0 Intents, keine Speicherung | Kein fachlicher Commit; Frame entfernt/neugeladen |
| iframe-Neurendern während Drag | Alte Frame-Trace durch Teardown nicht vollständig erhalten | 0 Intents, keine Speicherung | Stale-Negativgate, **kein** vollständiger Ablaufnachweis |

**Konkrete Move-Spur:** Callbacks bei 795,7 / 843,4 / 905,7 ms (relative Frame-Zeit), Pointer-Up bei 949,9 ms, Diagnose-Intent bei 950,3 ms. Der letzte Callback enthielt `demo-core` mit `start:2026-07-23`, `end:2026-08-19` und wurde vom Gate nach Pointer-Up einmal weitergereicht. Für Resize links wurde `2026-07-19..2026-08-16`, rechts `2026-07-20..2026-08-17`, für Progress `52` gemessen. Einzelne CI-Messung, kein Nachweis für alle Zeitraster, Zeitgrenzen oder Laufzeitumgebungen.

**Verschärfung nach dieser Messung:** In `tests/frappe-public-editor-pointer.spec.cjs` müssen die vier eigentlichen Edit-Szenarien nun **mindestens einen echten Upstream-Callback, genau einen Intent und dessen Übereinstimmung mit dem letzten Callback** nachweisen. Die bisherige negative Prüfung `maximal ein Intent` bleibt durch diese positive Pflicht verschärft; damit kann ein Stummbleiben des Herstellers nicht mehr als bestandener Edit-Test gelten. Die neue finale CI für diesen nachfolgenden Commit ist gesondert zu bestätigen.

**Red-Team-Auswertung:** Der sichere Gate-Diagnosemodus funktioniert unter den beobachteten Playwright-Mausgesten. Ein garantiertes öffentliches `Preview → Finish / Cancel`-API-Signal fehlt weiterhin. Die neue positive Testpflicht beweist funktionierende Beispielgesten für **die ausgelieferte 1.2.2-Runtime**, aber weder robuste Release-Stabilität noch Touch/Escape/Pointer-Capture-/Blur-Parität, Endzustandskonsistenz in sämtlichen Fällen, Transaktionsabbrüche während IndexedDB-Writes oder die Native-Funktionsparität. **NO-GO bleibt verbindlich; Native bleibt produktiv.**


### F. PR #17: unabhängige abschließende Diagnose- und Red-Team-Prüfung (06.11.2026)

**Geltungsbereich:** ausschließlich der isolierte, optional über `/spikes/frappe/index.html?edit=1` erreichbare Diagnoserenderer. Keine produktive App-Anbindung, keine Frappe-Schreibfreigabe, keine Änderung von `main` oder der Native-Default-Engine.

**Unabhängig verifizierte Ausgangsbasis:** PR #17 Head `de3732fb4023a771f449ca9ba3e72407dede6ff3`, Zielbranch `feature/frappe-transactional-editor@c91dbefef0a93df19e8a591b8fe5f939abe17e90`, Merge-Ref `6bdcbfa4ce03ca2e099c2e3c3e769debbc733b0d`. [Push Validate](https://github.com/thomasasen/gantt-studio/actions/runs/42232296779), [Push Browser](https://github.com/thomasasen/gantt-studio/actions/runs/42232296631), [PR Validate](https://github.com/thomasasen/gantt-studio/actions/runs/42232310534) und [PR Browser](https://github.com/thomasasen/gantt-studio/actions/runs/42232310526) jeweils tatsächlich **SUCCESS**; 43/43 Unit-/Contract-Tests, 115/115 Chromium-Tests und 20/20 kritische Projektwechsel je Browserlauf. Das PR-Merge-Ref-JSON wurde über [Evidence-Artefakt #13509474039](https://github.com/thomasasen/gantt-studio/actions/runs/42232310526/artifacts/13509474039) gesondert analysiert (8 Szenarien).

**Echte Callback-Spuren:** Move 3 × `on_date_change` vor Pointer-Up, Resize links/rechts jeweils 1 × `on_date_change` vor Pointer-Up, Progress 1 × `on_progress_change` nach Pointer-Up. Je gültiger Geste genau ein Diagnose-Intent entsprechend dem letzten Callback; vor der Freigabe kein Intent. Klick ohne Drag sowie Escape und Release außerhalb ergeben 0 Intents. Die Browserprüfung findet keine angelegte IndexedDB-Datenbank. Es handelt sich ausschließlich um punktuelle Chromium-Befunde, nicht um eine stabile Hersteller-Commit-/Cancel-Garantie.

**Neuer Red-Team-Befund und Korrektur, P2 / QA:** Das achte Szenario „iframe-Neurendern während Drag“ war zunächst falsch-positiv: In dessen JSON fehlten `pointerdown` und Upstream-Callbacks vollständig, weil der Balken nicht in den sichtbaren Viewport gescrollt wurde. Der Test ist jetzt auf `scrollIntoViewIfNeeded`, `toBeInViewport`, echten `pointerdown`, echten `on_date_change` vor dem Neustart, nachweislich abgelösten Frame und 0 verbleibende Intents verschärft. **Diese neue Teständerung braucht eigene erfolgreiche CI auf dem finalen Head und PR-Merge-Ref; die vorherigen grünen Läufe gelten nicht als Nachweis für diese Korrektur.**

**Vier unabhängige Review-Perspektiven:**

| Review | Einstufung | Befund und Abgrenzung |
| --- | --- | --- |
| Architektur | P1 für Produktivbetrieb, nicht blockierend für isolierte Diagnose | Offizielles Frappe 1.2.2 besitzt keinen nachgewiesenen öffentlichen finalen Gesture-/Cancel-Vertrag; kein privates Upstream-API als Produktgrundlage verwenden |
| Datenintegrität | P1 für Produktivbetrieb, nicht blockierend für isolierte Diagnose | Bereits gestartete IndexedDB-Transaktionen sind durch Frame-Destroy nicht rückabwickelbar; Diagnose nimmt gar keine Persistenz vor |
| Frontend/UX | P1 für Produktivbetrieb, P2 für Diagnose | Mausgesten exemplarisch gemessen; Touch, Pen, Tastatur, Fokusverlust, Capture-Verlust, Browser-Zoom, Screenreader und Native-Parität nicht vollständig abgenommen |
| QA/Sicherheit | P2 korrigiert, Restrisiken P2 | Falsch-positive Offscreen-Neustartprobe korrigiert; Generation/Session, Replay- und Manipulations-Negativtests vorhanden; gleichoriginiger kompromittierter Code bleibt eine Grenze der iframe-Isolation |

**Drei getrennte Entscheidungen:** (1) **Technische Machbarkeit: bedingtes GO** für die Diagnose und einen unabhängigen Transaktionsadapter als Forschungsergebnis, kein belastbarer End-to-End-Produktnachweis. (2) **Merge von PR #17 in `feature/frappe-transactional-editor`: GO ausschließlich bei vollständiger finaler CI und konfliktfreiem Stand**, da keine schreibende Engine aktiviert wird. (3) **Produktive schreibfähige Frappe-Engine: NO-GO**, bis öffentliche Abschluss-/Abort-Semantik, transaktionale Persistenz und Native-Parität belegt sind.

**Nächste abgegrenzte Entwicklungsphase (nicht Teil von PR #17):** Zuerst mit Upstream ein öffentliches, versioniertes `gesture-finish/gesture-cancel`-API einschließlich gültigem Endzustand und Fehlerfall klären; alternativ die Kosten einer herstellerunabhängigen Pointer-Schicht und einer anderen Gantt-Bibliothek anhand derselben realen Contract-Matrix vergleichen. Danach separat einen CAS-geschützten, vor Transaktionsstart abbrechbaren IndexedDB-Commit-Pfad und eine explizite Native-Paritätsmatrix (Sortierung, Phasen, Kalender, Abhängigkeiten, Themes, Print, Touch, Keyboard, Accessibility) prototypisieren. Ohne diese Gates keinen Frappe-Produktiv-Merge.


## 18. Phase 5 – unabhängige Frappe-Pointer-Schicht (isolierter Architektur-Spike, 06.11.2026)

**Ausgangspunkt:** `feature/frappe-transactional-editor@c3df7e197dc7ad688e0998c9792c4c14b7102df5` (Merge PR #17).
**Arbeitsbranch:** `spike/frappe-independent-interaction-layer`, PR gegen `feature/frappe-transactional-editor`, niemals gegen `main`.
**Produktiver Zustand:** Native-only; weder `app.js`, die Native-Engine, IndexedDB noch Projektschema werden durch diesen Spike umgeschaltet oder erweitert.

### Offizielle API und Alternativen

- npm `frappe-gantt@1.2.2` bleibt aktuelle Stable-Version: https://www.npmjs.com/package/frappe-gantt?activeTab=versions.
- Öffentliche dokumentierte Render-/Update-Funktionen: `update_options`, `change_view_mode`, `scroll_current`, `update_task`. Konfigurierbar sind u.a. `readonly`, `readonly_dates`, `readonly_progress`, `move_dependencies`, `view_mode`, `snap_at`. Quelle: https://github.com/frappe/gantt/blob/master/README.md.
- Die dokumentierte API garantiert **keine atomare begin/preview/commit/cancel/rollback-Sequenz**. Die zuvor gemessenen frühen `on_date_change`-Callbacks bleiben ein Blocker für direkt persistierende Frappe-Edits.
- **A – offizielle Frappe-API:** aktuell NO-GO für die transaktionale Editorsteuerung.
- **B – unabhängige Pointer-Schicht:** als eingeschränkter, schreibfreier Spike umgesetzt; Ergebnis muss anhand echter Browsergesten und Upgrade-Risiko bewertet werden.
- **C – alternative Engine:** DHTMLX Gantt Community ist eine MIT-lizenzierte Alternative mit dokumentierten `onBeforeTaskDrag`, `onTaskDrag`, `onAfterTaskDrag`, Hierarchie-/Summary-Tasks und umfangreichen Events (https://github.com/DHTMLX/gantt, https://docs.dhtmlx.com/gantt/guides/dnd/). Dennoch sind Projektterminologie, inklusives Ende, Fortschritt, Abbruchsicherheit und bestehende Designs nicht automatisch gleichwertig.

### Implementierung von B

- `assets/js/engine/frappe/independent-gesture.mjs`: DOM- und Frappe-unabhängige Single-Pointer-Zustandsmaschine mit immutable Vorher-/Nachher-Snapshots, exakten inklusiven Kalenderdaten, Move, Resize links/rechts, Progress, Änderungsfilter, Cancel und idempotentem Abschluss. Zusätzlicher rein speicherinterner CAS-Testadapter mit Projekt-ID, erwarteter Revision, Gesten-ID, Vorher-Zustand, Revisionsfortschreibung und Replay-/Konfliktschutz.
- `spikes/frappe/frame-independent.mjs`: isolierter Pointer- und Vorschau-Binder für die **schreibgeschützt** gerenderte Frappe-Grafik. Unsere Ebene erzeugt eigene Griffe und Vorschau, hält Pointer Capture, verarbeitet Escape, pointercancel, Fokusverlust und Destroy; Frappe-interne Date-/Progress-Callbacks sind nicht beteiligt.
- `spikes/frappe/frame.mjs`, `spikes/frappe/spike.mjs`, `assets/js/engine/frappe/frappe-adapter.mjs`: strikte opt-in Aktivierung nur über `/spikes/frappe/index.html?layer=1`, eingeschränkt auf Day-Zoom. Host prüft Projekt und Revision; angenommene Änderungen aktualisieren ausschließlich den RAM-Snapshot und erzeugen einen neuen isolierten Frame. Originaler `?edit=1`-Vendor-Diagnoseweg bleibt unangetastet.
- In der Spike-Variante darf **kein** `indexedDB`-/`localStorage`-Write aus der neuen Schicht erfolgen. Durch Designentscheidung kein Aufruf des produktiven `createProjectCommitter`.

### Kritisches Red-Team-Gate

**P1 – strukturelle Frappe-DOM-Abhängigkeit:** Für exakte Trefferflächen/Positionierung nutzt der Diagnose-Binder `.bar-wrapper[data-id]`, `.bar` und SVG-`getBBox()`. Diese SVG-Elemente sind **kein dokumentierter Frappe-API-Vertrag**. Das Experiment belegt deshalb gegebenenfalls Pointer-Lebenszyklus und Datenintegrität, **nicht** Upgrade-Stabilität. Diese Kopplung ist für ein langfristiges GO unzulässig, solange keine stabile öffentliche Geometrie-/Hit-Test-Schnittstelle existiert. Sie darf nicht durch mehr private Selektoren als vermeintliche Lösung verschleiert werden.

**P1 – zweite Engine:** Um die Kopplung ohne Upstream-Support zu lösen, müsste Gantt Studio Trefferflächen und Balken-Geometrie selbst vollständig verwalten. Dann übernimmt die zusätzliche Ebene zunehmend Rendering-/Editorarbeit, die die Native-Engine bereits leistet. Dazu kommen elf Designs, Phasen, Reorder, Abhängigkeiten, Baselines, Puffer, Marker, Druck und A11y. Eine isolierte Positivprobe ist keine wirtschaftliche oder produktive Freigabe.

**P2 – ungetestete Vollständigkeit:** Der Spike konzentriert sich auf Day-Mode und Zeigerinteraktionen. Touch-/Stift- und Tastaturparität, Zoomwechsel, Scroll-/Resize-Synchronität, High-DPI, visuelle Glätte, reale Browserwechsel, Langzeitperformance und vollständige Native-Parität bleiben offene produktive Gates.

### Verifikation und Entscheidung

Testnachweise: `node --test tests/frappe-independent-gesture.spec.mjs`; realer Chromium-Browser `tests/frappe-independent-pointer.spec.cjs`, dazu sämtliche vorhandenen Regressionen. Jede Positivprobe muss echten Pointer-Down, eine sichtbare Vorher-/Nachher-Vorschau, exakt einen angenommenen RAM-Commit und **keinen** IndexedDB-Write prüfen. Cancel-/Fokus-/Rerender-/Projektwechseltests prüfen Null-Commit.

**Architekturempfehlung vor Freigabe:** B nur als Diagnose, nicht als künftige Produkt-Engine akzeptieren, solange die DOM-Abhängigkeit verbleibt. Der betriebswirtschaftlich vernünftige Weg ist derzeit Native weiterbetreiben und für einen möglichen späteren Ersatz eine API-basierte Alternative in einem eigenen Vergleichs-Gate testen. Selbst ein grüner PR bestätigt ausdrücklich **keine** Freigabe für produktive Schreibvorgänge.


### Gegenprüfung und Kosten-/Paritätsmatrix (Phase 5)

| Kriterium | Native (heute) | Frappe mit eigener Pointer-Schicht (B) | Alternative mit Drag-API (C) |
| --- | --- | --- | --- |
| Implementierungsumfang | Bereits vorhanden, nur gezielte Pflege | Eigene Gestensteuerung **plus** Geometrie-, Hit-Test- und Overlay-Bindung | Adapter, Projektionslogik und Designanpassung erforderlich |
| Wartbarkeit / Upgrades | Interne Implementierung in unserer Kontrolle | **Schwach:** Vendor-DOM-Selektoren und Balkengeometrie sind kein stabiler API-Vertrag | Potenziell besser bei dokumentierten Drag-/Lifecycle-Events; gesondert zu verifizieren |
| Datenintegrität | Produktiver, getesteter Commit-Pfad | CAS im Arbeitsspeicher geprüft, produktiver Persistenzpfad **nicht** nachgewiesen | Ziel bleibt derselbe unabhängige, atomare Gantt-Studio-Commit-Vertrag |
| Performance | Bereits bestehende Messungen/Regressionen | JS-Gestensteuerung O(1) pro Move; DOM-Bindung pro Aufgabenbalken; **kein belastbarer Vergleichsbenchmark** | Unbekannt bis Browser-Benchmark gegen Native |
| Funktionsumfang | Phasen, Abhängigkeiten, Reorder, Baselines, Puffer, Marker, elf Designs, Print | Spike ausschließlich Move/Resize/Progress in Tagesansicht, **keine** Feature-Parität | Alternative mit Summary-Tasks und Dependency-API grundsätzlich vorteilhaft; Parität ungeprüft |
| Designintegration | Elf Presets inkl. Dark-/Hybrid, Druck vorhanden | Zusätzliche Overlay-/Vendor-CSS-Schichten für jedes Preset nötig | Ebenfalls erheblicher Adapter-/CSS-Aufwand |
| Zukunftsfähigkeit | Technische Schulden kontrollierbar | Risiko einer zweiten vollständigen Gantt-Engine und permanenter Upstream-Reparaturen | Nur dann attraktiv, wenn öffentlicher Contract und Lizenz-/Paritäts-Gates bestanden werden |

**Unabhängiges Gegenargument gegen Ansatz B:** Die Pure-Logic-Geste selbst hat keine Vendor-Abhängigkeit; der vollständige, richtige Hit-Test benötigt aber die Frappe-Darstellungsgeometrie. Der konkrete Diagnose-Binder greift auf generierte SVG-Knoten zu. Diese Abhängigkeit liegt *genau* an der wichtigsten fachlichen Nahtstelle. Eine Implementierung ohne diese Selektoren müsste weitere proprietäre Geometrie-/Tooltip-/Scroll-/Zoom-Logik hinzufügen und erhöht den Eigenanteil statt ihn zu reduzieren.

**Red-Team-Befunde und Reaktion:**
- **P1 Abbruch bei Fokusverlust:** Erster kompletter Browser-Lauf mit 125/126 erfolgreichen Fällen, aber einem fehlgeschlagenen Escape-Test: Fokus auf Host statt iframe; trotz Escape wurde ein RAM-Commit ausgelöst. Korrektur: explizite Fokusübernahme des Pointer-Binders auf dem Frame-Chart und zusätzlicher Host-Escape-Abbruchpfad. Browser-Test prüft jetzt, dass die Vorschau *vor Mouse-Up* zurückgenommen wird. Neue CI muss den Fix bestätigen.
- **P1 Nichtöffentliche Vendor-Geometrie:** Akzeptiert ausschließlich im Diagnose-Spike, **NO-GO** für Produktionsarchitektur; bleibt dokumentiertes Upgrade-Gate.
- **P2 Datumsbereiche:** `Date.UTC(0..99,...)` hätte Kalenderjahre 0001–0099 falsch interpretiert. Stattdessen `setUTCFullYear`, explizite Bereichsprüfung und zusätzlicher Grenztest.
- **P2 Negative reale Interaktionen:** Tests für Loslassen außerhalb des ursprünglichen Balkens, außerhalb des iframe und echten Projektwechsel während Pointer-Drag ergänzt; echte Pointer-Down-/Preview-Nachweise bleiben verpflichtend.
- **P2 UI/UX und Performance:** Progress erhält visuelle Füllstandsvorschau. Ein Vergleich zu Native in großem Datensatz, Scroll-/Zoom-Synchronität, Touch, Tastatur, 200 % Browserzoom, Langzeit-Listener-, Layout- und Upgrade-Tests ist **nicht durchgeführt**; somit kein Produktions-GO.

**Architekturentscheidung (vorbehaltlich finaler CI für sichere Diagnose): NO-GO** für eine produktive, wartbare Frappe-Schreib-Engine auf Basis des eigenen DOM-/Pointer-Layers. Das Konzept der unabhängigen Gesten-/CAS-Fachschicht ist technisch sinnvoll und sollte vendorneutral weiterverwendbar bleiben; der Frappe-Renderer ist dafür kein akzeptabler stabiler Partner. Ein technisch grüner, rein diagnostischer PR #18 darf sicher in den Feature-Branch einfließen, aber nicht nach `main` und nicht in den produktiven Editor verdrahtet werden.

**Konkretes Folge-Gate:** Mit DHTMLX Gantt Community (MIT, dokumentierte `onBeforeTaskDrag`, `onTaskDrag`, `onAfterTaskDrag`) einen strikt read-only isolierten API-/Paritäts-Spike gegen dieselben Fixtures und Native-Tests aufsetzen. Eine umfassendere Bibliotheksprüfung (Lizenz, Edition, inklusive Date-only-Daten, CSS, Summaries, Reorder, A11y, Offline, Druck, Lifecycle) muss vor einer Implementierungsentscheidung erfolgen.

### Phase 6 – DHTMLX Gantt Community 10.0.3 (isolierter Architektur-Spike, 06.11.2026)

**Branch:** `spike/dhtmlx-community-engine` von `feature/frappe-transactional-editor@b1f32c5`; keine Änderung an `main`, Produktiv-Engine oder IndexedDB-Pfaden. Der experimentelle Adapter liegt ausschließlich unter `assets/js/engine/dhtmlx/`, die Vergleichsseite unter `spikes/dhtmlx/`.

**Upstream:** [DHTMLX/gantt v10.0.3](https://github.com/DHTMLX/gantt/releases/tag/v10.0.3), veröffentlicht 03.09.2026; `dhtmlx-gantt@10.0.3` auf npm, Community Edition MIT ab v10, ältere GPL-Edition nicht verwenden. MIT-Lizenztext wird beim isolierten Build lokal als `vendor/LICENSE.dhtmlx.md` kopiert. Lokale JS/CSS-Assets werden mittels `npm ci --prefix spikes/dhtmlx && npm run build --prefix spikes/dhtmlx` erstellt, kein Laufzeit-CDN. Die Anwendung bleibt außerhalb des Experimentpfads buildfrei.

**Dokumentierte APIs und Sicherheitsgrenze:** `Gantt.getGanttInstance()`, `init()`, `parse()`, `destructor()`, `attachEvent()/detachEvent()`, `onBeforeTaskDrag`, `onTaskDrag`, `onBeforeTaskChanged`, `onAfterTaskDrag`, `getTask()`, `getScrollState()/scrollTo()`. Die Herstellerdokumentation sagt: `onTaskDrag` meldet bereits die interne Mutation; `onBeforeTaskChanged` kann `false` zurückgeben und DHTMLX zurückrollen. Der Adapter verwirft die Vendor-Mutation grundsätzlich und gibt nur nach sichtbarer gültiger Freigabe einen validierten Intent aus. Pointer-/Escape-/Fokus-Verhalten ist durch dokumentierte Events allein **nicht** bewiesen; hierfür sind echte Browserprüfungen maßgeblich.

**Funktionsmatrix (Community-API, keine Produktivparität behauptet):**

| Bereich | Native | Frappe + eigener Layer | DHTMLX Community | Implementierungsrisiko |
| --- | --- | --- | --- | --- |
| Tasks/Progress/Move/Resize | produktiv | experimentell, undokumentierte SVG-Anbindung | nativ, öffentliche Drag-Events | Commit/Abbruch noch browserseitig nachzuweisen |
| Hierarchie/Phasen/Collapse | produktiv | zusätzliche Eigenarbeit | Project-Tasks und Tree-Grid | Phasenzeitraum wird aus Kindern errechnet |
| Links/Dependencies | produktiv | basisnahe Anzeige | vier Linktypen | keine automatische fachliche Terminverschiebung zulassen |
| Meilensteine/Gates | projektkonform | grafischer Eigenbau | Milestone nativ, Gate nur Mapping | inklusives Gate-/Milestone-Ende und Semantik weichen ab |
| Baselines | produktiv | eigener Layer | **PRO**; Community nur Eigenaufbau | hoch |
| Puffer/Marker | produktiv | eigener Layer | Marker öffentliche API; Puffer eigener Layer | mittel |
| Undo/Redo | fachlich vorhandene eigene Grenzen | eigene Logik | **PRO** | hoch |
| Reorder / `displayOrder` | produktiv in Tabelle+Gantt | eigener Layer | Grid-Branch-Order, aber Domänenregeln eigen | hoch |
| Day/Week/Month | produktiv | teilweise | Scales nativ | gering |
| 11 Designs + Hybrid + Print | produktiv | erheblicher Aufwand | Skins/Templates, volle Parität eigen | hoch |
| Offline / Lebenszyklus | produktiv | iframe-Isolation | lokal gebündelt + `destructor()` | gering bis mittel |
| Accessibility/Tastatur | projektkonform getestet | teilweise | WAI-ARIA/Keyboard API | individuelle Abnahme ausstehend |

**Technische Einschränkung:** DHTMLX nutzt ein exklusives `end_date`; Gantt Studio speichert inklusive `end`. Der Mapper addiert/subtrahiert einen lokalen Kalendertag, niemals 86400000 Millisekunden. Projekt- und Revisionsmodell bleiben unverändert. Für Meilensteine wird die grafische Punktdarstellung bewusst als Abweichung ausgewiesen. Datums-/Progress-Änderungen werden mit `validateEditorIntent` validiert und nur vom Host über den bestehenden rein speicherinternen `createMemoryRevisionStore` angenommen. Es gibt keine Verbindung zum produktiven Save-Pfad.

**Red-Team-Hypothesen (zu prüfen, nicht als bestanden werten):** `onAfterTaskDrag` bei Escape trotz fehlendem `pointerup`; Reihenfolge der Browser- und Hersteller-Events; vermeintliche Progress-Handles; `destructor()` während Drag; mutiertes Vendor-Datenmodell vor Rollback; fehlende Projekt-Baselines und Workflows; unvollständige Tastaturalternativen; falsche Vergleichsbenchmarks. Sind diese Fälle nicht nachweislich bestanden, bleibt die Bewertung höchstens **CONDITIONAL GO**. Kein produktiver Wechsel ohne separate Entscheidung.

**Abnahme und Score:** Node-/Playwright- und 20× Native-Switch-Gates laufen über bestehende CI. Empirische Resultate, Median-Messwerte und 0–5-Gewichtung dürfen erst nach finaler grüner CI und echten Browser-Evidenzen eingetragen werden; keine Scheinergebnisse. Harte Blocker haben Vorrang vor Scores.

**Empirischer Browserbefund aus CI #42245936105:** Die erste Suite erreichte echte `onBeforeTaskDrag`- und `onTaskDrag`-Ereignisse für Move, Resize links/rechts und Progress. Alle vier positiven RAM-Intent-Gates schlugen fehl (135/139 gesamt erfolgreich), weil in v10.0.3 **nach Rückgabe von `false` in `onBeforeTaskChanged` kein `onAfterTaskDrag` mehr ausgelöst wird**. Die echte Trace-Reihenfolge war `onBeforeTaskDrag → onTaskDrag* → pointerup → onBeforeTaskChanged`; `onAfterTaskDrag` fehlt. Der nachfolgende Korrektur-Commit verwendet ausschließlich `onBeforeTaskChanged` als public-API-Abschlussgrenze, validiert vor dem Rückgabewert, sendet den RAM-Intent nach dem Rollback in einem Microtask und verhindert doppelte oder nach Projektwechsel veraltete Intents über die Generation. Die Korrektur gilt erst nach einer neuen vollständigen Browser-CI als bestanden.

**Prüfstand nach erstem Fix, CI-Merge-Ref #42247074338:** 139/140 Browserfälle erfolgreich; Move und beide Resize-Fälle erzeugten nun genau einen RAM-Commit. Der nominelle Progress-Fall blieb zurecht rot: Der Test traf keinen Progress-Griff, sondern löste den DHTMLX-`move`-Modus aus. Korrektur: echtes UI-Target über die in [DHTMLX CSS Documentation](https://docs.dhtmlx.com/gantt/guides/css-overview/) beschriebenen Drag-Griffe `.gantt_task_progress_drag`, `.gantt_task_drag.task_start_date` und `.gantt_task_drag.task_end_date`. Jeder positive Test kontrolliert nun zusätzlich Hersteller-Dragmodus und exakte Änderung von `start`, `end` bzw. `progress`. Frühere grüne Teiltests sind damit **nicht** ausreichend für Resize- oder Progress-Parität; die neue CI muss sie bestätigen.

**Red-Team: visuelle Cancel-Sicherheit:** Kein fachlicher Commit beweist noch keinen UI-Rollback. Der Adapter setzt bei Escape, Pointer-Cancel, Fokusverlust, zweitem Pointer und explizitem Cancel die alleinige öffentliche `destructor()/init()/parse()`-Lifecycle-Grenze ein, um die Vendor-Vorschau aus dem unveränderten kanonischen Projekt komplett neu aufzubauen; keine privaten Vendor-Methoden. Ein echter Escape-Browser-Test verlangt die Wiederherstellung der ursprünglichen Balkengeometrie **vor** Pointer-Up. Nicht umgesetzte Marker und Tastatur-Fokusaktionen werden im Capability-Objekt ausdrücklich mit `false` gemeldet, obwohl der Community-Upstream grundsätzlich Marker- und Tastatur-APIs anbietet.
