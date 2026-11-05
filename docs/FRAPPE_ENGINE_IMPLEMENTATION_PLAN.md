# Gantt Studio: Engine-Abstraktion und optionaler Frappe-Gantt-Adapter

> **Status:** Phasen A und B nachweislich abgeschlossen. Phase C nach ausdrücklicher Freigabe am 06.11.2026 als separater Read-only-Spike begonnen; Gate C nicht erreicht. Keine Aktivierung in Produktion.
>
> **Arbeitsbranch Phase B:** `refactor/engine-abstraction`  
> **Experimentbranch Phase C:** `spike/frappe-gantt-adapter` (ab Freigabe-SHA `86397dd762085e2042438802a364f1b71a37d637`)  
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

- [x] **C-01 – Upstream verifizieren:** Bei Start npm-Stable-Version, Tag/Release-Divergenz, Lockfile, Lizenz, dokumentierte öffentliche APIs, bekannte Bugs und Browser-Support erneut prüfen. Ausgangsannahme aus Voranalyse: npm `frappe-gantt@1.2.2` (Stand 05.11.2026), GitHub „Latest Release“ `v1.0.3`; **nicht** ohne erneute Prüfung als aktuell behaupten.
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

### Umsetzungssitzung 06.11.2026: Phase C / autorisierter Frappe-Spike

**Freigabe:** Die ausdrückliche Benutzerfreigabe vom 06.11.2026 gilt für den bestandenen Phase-B-Abstraktionsstand und den Start des separaten Spikes, **nicht** für Merge oder produktive Frappe-Aktivierung. Neuer Branch `spike/frappe-gantt-adapter` entstand genau aus `refactor/engine-abstraction@86397dd762085e2042438802a364f1b71a37d637`; `main` bleibt unverändert.

**C-01 verifizierter Upstream:** Laut npm ist `frappe-gantt@1.2.2` aktuell als `latest` markiert, ohne Runtime-Abhängigkeiten und unter MIT-Lizenz (Abfrage am 06.11.2026). GitHub Releases listet separat `v1.0.3` als „Latest“, deshalb **npm** ist die maßgebliche Paketversion. Öffentliche Optionen: `readonly`, `readonly_dates`, `readonly_progress`, `move_dependencies: false`, `view_mode`, `on_click`; Methoden: `change_view_mode`, `update_options`, `update_task`. **Keine dokumentierte `destroy()`-Methode** und kein belastbarer öffentlicher Vertrag für Escape/Pointer-Cancel vor Commit. Event-Callbacks sind nicht ohne Weiteres eine Validierungs-/Transaktionsgrenze. Quellen: https://www.npmjs.com/package/frappe-gantt?activeTab=versions , https://docs.frappe.io/gantt/config , https://github.com/frappe/gantt/releases , https://github.com/frappe/gantt/issues/425 .

**Implementierte Pakete / Commits (separater Spike, kein produktiver Umschalter):**
- `4c5d2a9`: reiner Task-/Date-only-Mapper. Übernimmt IDs, Reihenfolge, inklusive Daten, Progress und nur sichtbare Vorgänger. Verwirft synthetische Phasenzeilen. Keine Mutation des Projektmodells.
- `6db8b6b`: Engine-Contract-konformer Read-only-Frappe-Adapter. Ausschließlich öffentliche Constructor-Optionen, kein Frappe-Source-Patch, keine private DOM-API. Capability-Flags markieren nicht implementierte Features als `false`.
- `162c79c`: Unit-/Contract-/DST-/Immutable-/Teardown-Tests mit injizierbarem Frappe-Testdouble.
- `fe9179f`, `bed090e`, `d49cc29`: eigene Dependency-Definition, Frappe-Version 1.2.2 fest, lokaler UMD-/CSS-/Lizenz-Build; `npm ci` im Spike-Verzeichnis, die Hauptanwendung bleibt build-frei.
- `172927e`, `310ed84`: nichtproduktive Vergleichsseite `spikes/frappe/index.html`, native und Frappe lesen dieselbe lokale Demo-Projektion. Keine IndexedDB-/localStorage-Speicherung.
- `351d2df`, `ecda4de`, `99055a9`: Browser-Smoke-/Responsive-Tests sowie CI-Einbindung für den Spike-Branch.

**Validierungsstatus dieser Sitzung:** Die Implementierung und Testdefinitionen sind in GitHub committed. Die automatisierten neuen Tests und der npm-Vendor-Build wurden hier **noch nicht nachweislich ausgeführt**; kein grünes Gate C wird behauptet. CI wurde für Branch-Pushes konfiguriert. Build-Artefakte und Laufzeit-Paket-Checks müssen überprüft werden. Der gesperrte lokale Container kann npm nicht über das Internet installieren. Das manuell erzeugte Lockfile fixiert den Paket-Tarball, enthält aber noch keinen npm-SRI-Integritätseintrag; vor einem reproduzierbar verifizierten Build ist dessen Ergänzung notwendig.

**C-07 vorläufige Feature-Gaps (noch nicht durch echte Browsertests bestätigt):**

| Kriterium | Native | Frappe-Spike | Bewertung |
| --- | --- | --- | --- |
| Tag/Woche/Monat und Grundbalken | Vollständig | Read-only vorgesehen | Browserabnahme offen |
| Inklusive Kalender-Enddaten, DST | Projektvertrag | Mapper hält `YYYY-MM-DD` als String | Echte Laufzeitgeometrie und Callback-Konvertierung prüfen |
| Phasen-Sammelzeilen, eingeklappte Phasen | Native unterstützt | Synthetische Phasenzeilen ausgeschlossen | Nicht gleichwertig |
| Baselines, Puffer, Marker, individuelle Labels, Status/Risiko | Native unterstützt | Keine robusten öffentlichen Frappe-Overlays umgesetzt | Große Feature-Lücke |
| Verschieben, Resize, Progress | Vollständig und transaktional | Im Read-only-Spike deaktiviert | Öffentliche Escape/Pointer-Cancel-Semantik unbewiesen |
| Abhängigkeiten ohne automatisches Scheduling | Externe Fachlogik | `move_dependencies:false` | Tatsächlich beobachten |
| Aufgabenreihenfolge per Drag/Tastatur | Beide Richtungen | Nicht verfügbar | Feature-Lücke |
| Zoom/Scroll, Fokus, Themes, Druck | Vollständig | Zum Teil / nicht freigegeben | Keine Feature-Parität |
| Destroy ohne Leaks | Native implementiert | Frappe ohne dokumentiertes Dispose | Risiko für wiederholte Mounts |

**Red-Team-Prioritäten:** Paketintegrität nachtragen; reale Frappe-Date-only-Geometrie an DST und Monatsenden prüfen; mögliche globale Event-Listener nach wiederholtem Render/Destroy nachweisen oder isolieren; Frappe-Interaction nur mit verifizierbarem Cancel-Vertrag freigeben; Layout-/Rollen-/Phase-Parität ohne private DOM-Selektoren bewerten. Frappe darf weder Projektdaten schreiben noch `main` ersetzen.

**Review-PR:** [Draft-PR #14](https://github.com/thomasasen/gantt-studio/pull/14) vergleicht den isolierten Spike ausschließlich mit dem freigegebenen Abstraktionsbranch. Zusatzcommits `5323b28` (Ignorierregeln), `74ed1cc` (Lizenzdateiname), `d9effb8` (Build-Dokumentation), `9abc994` und `46aeef9` (vergleichendes Screenshot-Artefakt). Eine statische Gegenprüfung anhand des GitHub-Diffs bestätigte: `assets/js/app.js`, `assets/js/gantt.js` und Produktiv-`index.html` sind unverändert; der Frappe-Adapter enthält weder Projekt-Persistenzaufrufe noch private DOM-Selektoren, ist `readonly` und schaltet Dependency-Move ab. **Diese statische Prüfung ist kein Runtime-/Browsertest.**

**Nächste Schritte:** (1) Build/Unit-/Chromium-Testläufe auf dem Spike-Branch überprüfen und Fehler beheben. (2) Detaillierte DOM-/Lifecycle-Profilierung mit tatsächlichem Frappe 1.2.2. (3) C-05-Interaktionen nur mit nachweisbarem fachlichem Intent-Commit testen, sonst negatives Gate-C-Signal dokumentieren. (4) Gate C nach echter Gegenprobe Go/No-Go entscheiden. `main`, `refactor/engine-abstraction` und PR #13 bleiben unverändert.


### Gate-C-Gegenprüfung vom 06.11.2026: technische Entscheidung **NO-GO** (Frappe 1.2.2 als vollwertige Engine)

**Geltungsbereich:** Ausschließlich Phase C im Branch `spike/frappe-gantt-adapter`, PR #14. Keine Änderung an `main`, PR #13, Projektschema oder produktiver Native Engine. Die Entscheidung bezieht sich auf den Einsatz von Frappe 1.2.2 **als Ersatz der vollständigen Native Engine**. Ein separat isoliertes, rein lesendes Chart-Widget in einer anderen Anwendung wäre eine andere Architekturfrage.

**Verifizierter Paket- und CI-Stand:**
- npm Registry führt `frappe-gantt@1.2.2` als `latest`; keine Runtime-Dependencies; MIT. Offizielle UMD-Datei `dist/frappe-gantt.umd.js`, CSS `dist/frappe-gantt.css`; die originale `license.txt` wurde vom tatsächlichen CI-Build gelesen und ausgeliefert.
- GitHub Actions [Validate #42128331295](https://github.com/thomasasen/gantt-studio/actions/runs/42128331295): erfolgreich; **7/7** Frappe-Unit-/Contract-Tests.
- GitHub Actions [UI #42128331083](https://github.com/thomasasen/gantt-studio/actions/runs/42128331083): erfolgreich; `npm ci`, Vendor-Build, lokale Frappe-UMD/CSS, **60/60** Playwright-Tests; Frappe-Smoke/Responsive 390/768/1024/1440 und keine externen Browser-Requests.
- GitHub Actions [UI #42129315854](https://github.com/thomasasen/gantt-studio/actions/runs/42129315854): erfolgreich; **61/61** Playwright-Tests, einschließlich des neu instrumentierten Lifecycle-Gegenbeweises. Browserprotokoll: `FRAPPE_LIFECYCLE_BLOCKER {"afterMount":7,"added":7,"removed":0,"unpaired":7}`.
- `spikes/frappe/package-lock.json` wurde in **Commit `70b556d4`** durch `npm install --package-lock-only` in GitHub Actions aus der npm-Registry neu generiert (nicht von Hand editiert), mit SHA-512-Integrität. Ein vorübergehender CI-Schreibjob wurde danach entfernt; die dauerhafte `validate.yml` prüft die Lockfile-/Versionsintegrität read-only. Die Native Engine benötigt weiterhin weder npm noch den Frappe-Build.
- Ergänzte Browser-Zeitzonen- und Benchmarktests (`tests/frappe-browser.spec.cjs`) müssen anhand ihres konkreten GitHub-Actions-Laufs einzeln als bestanden oder fehlgeschlagen nachgetragen werden; die bloße Aufnahme als Testdatei ist **kein Erfolg**.

**Zwei unabhängige, belastbare Blocker im aktuellen Upstream:**

1. **Lifecycle / Speicherleck (P1):** Frappe 1.2.2 ruft im Konstruktor `bind_events()` auf. In `src/index.js`, `bind_bar_events()`, wird `document.addEventListener('mouseup', () => {...})` registriert, ohne öffentliche `destroy()`-/`dispose()`-API und ohne zugehörige `removeEventListener`-Stelle. In unserem Read-only-Adapter wird pro `render()` ein neuer Chart erzeugt. Der reale Chromium-Gegenbeweis registrierte sieben `mouseup`-Listener, keinen entfernten; selbst `engine.destroy()` bereinigt nur DOM. Das ist für häufiges Neurendern und Engine-Wechsel mit Gantt Studio unverträglich. Ein eigener Hack auf die Frappe-Listener oder das Überschreiben von `document.addEventListener` in Produktion wäre keine wartbare öffentliche API.
2. **Nicht transaktionaler Interaktionsvertrag (P1):** Frappe verarbeitet Drag/Resize über interne `mousedown`-, `mousemove`- und `mouseup`-Handler. In `src/bar.js` führt `update_bar_position()` während der Vorschau bereits `date_changed()` aus; `date_changed()` ruft `on_date_change` auf. Die Callback-Grenze ist also nicht garantiert ein gültiger Pointer-Up. Die internen Handler bieten keinen dokumentierten `Escape`-/`pointercancel`-Rollbackvertrag. Nur `move_dependencies:false` verhindert das automatische Dependent-Shifting; es behebt nicht Cancel, Commit-Once, fachliche Validierung oder Fehlerrücknahme. Die Read-only-Variante vermeidet Datentransaktionen, erfüllt aber auch keine editierbare Feature-Parität.

**Upstream-Belege:** https://github.com/frappe/gantt/blob/master/src/index.js (Konstruktor/`bind_bar_events`), https://github.com/frappe/gantt/blob/master/src/bar.js (`update_bar_position`, `date_changed`), https://github.com/frappe/gantt/blob/master/README.md (öffentliche Optionen und Methoden), npm-Registry `frappe-gantt@1.2.2`. Die Master-Quellen geben die Paketversion 1.2.2 an; bei künftigen Upstream-Veränderungen sind die konkreten Quellen erneut zu verifizieren.

#### Vollständige Feature-Paritätsmatrix für Gate C

Legende: **J** = aktuell nachgewiesen; **Ö** = über dokumentierte öffentliche API prinzipiell abbildbar; **O** = eigenes unabhängiges Overlay denkbar, Geometrie/Parität noch nicht nachgewiesen; **P** = für volle Parität voraussichtlich private/invasive Upstream-Anbindung notwendig; **N** = zurzeit keine tragfähige, sichere Lösung. `—` heißt nicht implementiert bzw. nicht getestet, keine allgemeine technische Unmöglichkeit.

| Funktionsbereich | Native Engine | Frappe 1.2.2 / Spike | Einordnung |
| --- | --- | --- | --- |
| Tag-/Wochen-/Monatsansicht | J | J, realer Browser-Smoke | J |
| Aufgaben/Balken/Fortschrittsanzeige | J | J, Read-only-Grundchart | J |
| Stabile Task-IDs/Phasenzuordnung | J | Mapper übernimmt IDs, Reihenfolge; Phase nur im externen Modell | J / O |
| Phasen-/Sammelzeilen | J | Synthetische Phasen bewusst ausgeschlossen | P |
| Eingeklappte Phasen | J | Externe Filterung denkbar; gemeinsamer link/rechts Zeilenbaum fehlt | O / P |
| Abhängigkeitspfeile ohne Termin-Autoshift | J | Frappe unterstützt Pfeile, `move_dependencies:false` | Ö, Read-only |
| Meilensteine und Gates | J, spezifische Semantik | Nur `custom_class`, keine echte Parität | O / P |
| Baselines | J | Kein bestehender Layer | O / P |
| Puffer | J | Kein bestehender Layer | O / P |
| Marker/Stichtage | J | Kein bestehender Layer | O / P |
| Heute-Linie und kalendarisches Heute | J | Frappe-eigene Darstellung, Parität nicht belegt | Ö / O |
| Wochenenden/Sondertage | J | Upstream `ignored_dates`, Semantik abweichend möglich | Ö / O |
| Status und Risiken | J | Keine gleichwertige sichtbare Kennzeichnung | O |
| Manuelle Reihenfolge in Phase | J | Externes Sortieren und `refresh` denkbar; kein interaktiver Chart-Reorder | Ö / P |
| Task-Drag | J, abbrechbar | Read-only; Callback vor gültigem Commit möglich | N |
| Resize Start/Ende | J, abbrechbar | Read-only; gleiche Callback-/Cancel-Lücke | N |
| Fortschrittsänderung | J, transaktional | Read-only; kein validierter Commit-Once-Vertrag | N |
| Aufgabenliste ↔ Chart | J | Keine gleichwertige gemeinsame Liste/Zeilengeometrie | P |
| Elf Designvorlagen | J | Spike ohne Theme-Parität | O / P |
| Dark-/Hybrid-Kontraste | J | Noch nicht validiert | O |
| Tastatur/Accessibility | J, getestet | Frappe-Interaktionen nicht gleichwertig nachgewiesen | — / P |
| Responsive 390/768/1024/1440 | J | Grundchart-Smoke erfolgreich | J, nur Grundchart |
| 200-%-Zoom | J | Keine vollständige Frappe-Parität nachgewiesen | — |
| Druckansicht | J | Kein paritätisches Drucklayout | O / P |
| Reproduzierbarer Build / Offline | J | npm ci, lokaler Vendor-Build und no-CDN-Smoke erfolgreich | J |
| Kalenderdaten/DST | J | Mapper-Unit-Tests erfolgreich; zusätzliche echte Geometrie-Tests laufen | Ö / — |
| Performance 0/1/25/250/1000 | Native als Referenz | Zusätzlicher Chromium-Benchmark eingereicht, noch auszuwerten | — |
| Wiederholtes Mount/Destroy | J | Aktive document-Listener bleiben nach Destroy | **N / No-Go** |

**Datenintegritäts-/Red-Team-Fazit:** Der aktuelle Frappe-Spike ist ausdrücklich read-only; kein Frappe-Code wurde mit einem fachlichen `onIntent`-Speicherpfad verdrahtet. Dadurch wurde kein Datenverlust im kanonischen Projektmodell beobachtet; das ist kein Nachweis einer sicheren editierbaren Integration. `readonly` und `move_dependencies:false` bleiben zwingend. Die Native Engine behält den transaktionalen Projektkommando-Pfad und den vollständigen Cancel-/Rollbackvertrag.

**Gate C: NO-GO für den Ersatz der Native Engine durch Frappe 1.2.2.** Der mangelnde Upstream-Teardown ist im Browser bewiesen; die Interaktionsarchitektur verletzt den geforderten transaktionalen Vertrag. Die übrigen zahlreichen Paritätslücken würden erhebliche Overlays und Geometrie-Kopplung erfordern. Die Vorteile der aktuellen Rendering-Bibliothek rechtfertigen diese zusätzliche Fehler- und Wartungsfläche nicht. Es gibt **keine Freigabe für Phase D, keinen Merge nach `main`, keine Änderung des JSON-v1-Formats und keinen produktiven Frappe-Umschalter**. PR #14 bleibt ein dokumentierter experimenteller Draft; PR #13 und seine Native-Architektur werden unabhängig bewertet.

**Nächster konkreter Schritt:** Die laufenden erweiterten Chromium-Tests anhand ihrer Run-IDs abschließen und Messwerte dokumentieren, ggf. Testfehler korrigieren; die Phase-C-Befunde im PR #14 festhalten. Weiterarbeit an der Native Engine priorisieren. Neue Frappe-Bewertung nur bei einer künftigen stabilen Version mit öffentlichem und getestetem `destroy`-/Cancel-/Commit-Once-Vertrag, nicht allein wegen Release-Nummer oder bereits investierter Entwicklungsarbeit.

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
