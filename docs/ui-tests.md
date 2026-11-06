# UI browser regression

Gantt Studio uses a statically served website without a build step. The dedicated GitHub Actions workflow `.github/workflows/ui-regression.yml` starts a local server and runs Playwright Chromium against the real application.

Tests include navigation, project/task editing, unified field geometry in dialogs and planning forms, exact and cancelable Gantt pointer movement, 390/768/1024/1440-pixel layouts, and reduced-motion behavior. They also check for unexpected page-level horizontal overflow. These tests complement, but do not replace, manual review of large datasets, touch devices, browser-specific color pickers, print/PDF output, visual design quality and accessibility with assistive technology.

To run locally with Node.js:

```bash
npm install --no-save --no-package-lock @playwright/test@1.56.1
npx playwright install chromium
npx playwright test
```

The runtime application itself has no Playwright dependency.


### Zweiphasige Engine-Umschaltung (Draft PR #15)

- Unit: `node --test tests/engine-async-controller.spec.mjs`; Prepare, Commit, ungültige Factory/Mount, Abort, Supersession, doppelfreies Cleanup und Destroy.
- Browser: `tests/frappe-async-controller.spec.cjs`; realer Vendor-Frame, verzögerte HTTP-Freigabe als deterministische Ready-Schranke, bestehender DOM während Prepare, sichtbarer Commit, Timeout-Rollback und Fokus/Scroll.
- Viewports 390/768/1024/1440 sowie CSS-`zoom:200%` und Reduced Motion. Echte Browser-Zoomstufe und Assistive-Technology-Navigation bedürfen zusätzlich einer manuellen Abnahme.
- Weiterhin komplette `npx playwright test`-Suite sowie kritischen Projektwechsel mit `--repeat-each=20 --workers=1` ausführen.
- Für Merge-Readiness ausschließlich den neuesten Branch-SHA, zugehörige Push-/Pull-Request-Runs und den PR-Merge-Ref gegen das aktuelle `main` auswerten.


**CI-Referenz zum Implementierungsstand `60fb8c6` (06.11.2026):** [Static Validate](https://github.com/thomasasen/gantt-studio/actions/runs/42221973122), [103 Chromium-Tests + 20 Projektwechsel / Push](https://github.com/thomasasen/gantt-studio/actions/runs/42221972913), [103 Chromium-Tests + 20 Projektwechsel / PR-Merge-Ref](https://github.com/thomasasen/gantt-studio/actions/runs/42221986134). Alle drei Runs erfolgreich; 32/32 Unit, 103/103 Browser und 20/20 Projektwechsel. Nachfolgende Dokumentations-Commits benötigen ihre eigenen erfolgreichen CI-Runs.


### Transactional Frappe editor contract (Draft follow-up to PR #15)

- Node contract: `node --test tests/transactional-editor.spec.mjs tests/frappe-gesture-gate.spec.mjs`. Test-only `createTransactionalEditor` validates the full engine-independent edit boundary with project revision and generation fencing, allowed tasks, date-only changes and failed-save rollback. No production switch is enabled.
- Browser probes: `tests/frappe-transactional-browser.spec.cjs` performs genuine Playwright mouse movements against the actual locally built Frappe 1.2.2 iframe; it also checks frame-message spoofing, CSS zoom, and absence of IndexedDB writes in the diagnostic spike.
- The real-pointer probe is a **negative safety gate**, not a proof of reliably editable Frappe. The current upstream sometimes does not emit a final edit from a physical drag. Existing direct upstream callback probes are retained unchanged for timing diagnostics.
- A verified Frappe-to-IndexedDB UI commit, keyboard/touch parity, session abort after a begun IndexedDB save and a renderer acknowledgment remain **not tested as passing**, because the Frappe editor is intentionally not wired to production.
- CI must run both feature-branch head and PR-merge-ref against `fix/frappe-lifecycle-isolation`; a green main-only status or earlier SHA is insufficient.


**Verifizierte PR-Merge-Ref-CI der Transaktionsimplementierung `f967304`:** [43 Unit-Tests](https://github.com/thomasasen/gantt-studio/actions/runs/42227444924) und [107 Chromium-Tests plus 20 Projektwechsel-Stresstests](https://github.com/thomasasen/gantt-studio/actions/runs/42227444915), beide **SUCCESS**. Getestet wurde der berechnete Merge-Commit `800fbc2` gegen `fix/frappe-lifecycle-isolation@86de64e`. Der experimentelle Frappe-Diagnosemodus schreibt nicht in IndexedDB; die Tests beanspruchen ausdrücklich keine Schreibfreigabe.


### Physische Frappe-Editor-API-Diagnose (experimenteller PR #17)

Aktuelle veröffentlichte Stable-Version: `frappe-gantt@1.2.2`; es gibt Stand 06.11.2026 kein neueres stabiles npm-Paket. Upstream-Issue [#494](https://github.com/frappe/gantt/issues/494) beschreibt die mehrfachen `on_date_change`-Aufrufe während des Drags.

- Browser-Befehl nach `npm ci --prefix spikes/frappe && npm run build --prefix spikes/frappe`: `npx playwright test tests/frappe-public-editor-pointer.spec.cjs --workers=1 --reporter=line`.
- Der Test `?edit=1` verwendet die ausgelieferte lokale Frappe-UMD-Bibliothek und echte Playwright-Maus-/Tastaturereignisse. Fälle: Move, Resize links, Resize rechts, Progress, Klick ohne Bewegung, Escape, Loslassen außerhalb und iframe-Neurendern während der Geste.
- Ereignisspur je Fall: `frappe-evidence/*.json`. Enthält native Browser-Events, `on_date_change`, `on_progress_change`, Gate-Intent, Gate-Cancel und verbleibende Intents. Sie wird durch den CI-Workflow auch bei Testfehlern hochgeladen, sofern vorhanden.
- **Abnahmegrenze:** Tests prüfen zunächst streng Negativ-Sicherheit (kein früher Commit, höchstens ein Intent, keine IndexedDB-Schreibung). Wenn keine Callback-Ereignisse eintreffen, **ist das kein Nachweis für Editor-Funktionsfähigkeit**. Positive Anforderungen wie exakt ein gültiger Endzustand bei Drag/Resize/Progress und der vollständige persistente Datenfluss bleiben gesonderte Blocker.
- Tests in `tests/frappe-interaction-preview.spec.cjs` nutzen zu Diagnosezwecken teilweise private Upstream-Aufrufe. Sie sind **keine** Ersatznachweise für physische Pointer-Bedienung.
- Für die aktuelle Branch-/PR-Abnahme sind vollständige Static-Validate- und Browser-CI auf finalem Head **und** PR-Merge-Ref gegen `feature/frappe-transactional-editor` erforderlich. Ein älterer Erfolg von PR #16 zählt nicht als Beleg für neue Änderungen.

### Verifizierter physischer Vendor-Test (06.11.2026)

Beim ersten Lauf lagen die echten Frappe-Balken wegen des hohen Native-Referenzcharts unterhalb des Viewports; Mausbewegungen ohne vorheriges Scrollen erreichten den iframe nicht. Die Tests scrollen die Frappe-Controls deshalb explizit in den sichtbaren Bereich, verifizieren `toBeInViewport` und protokollieren ein tatsächliches Browser-`pointerdown`. Jeder positive Edit-Test muss nun mindestens **einen echten Frappe-Änderungs-Callback, genau einen passenden Diagnose-Intent und keinen IndexedDB-Write** liefern.

Auf dem geprüften Stand `20b5f9b` und dem PR-Merge-Ref `be37bd2`: [CI-Run #42231551678](https://github.com/thomasasen/gantt-studio/actions/runs/42231551678) **115/115 Chromium-Browser-Tests + 20/20 Projektwechsel**; [JSON-Ereignisspuren](https://github.com/thomasasen/gantt-studio/actions/runs/42231551678/artifacts/13510170939). Reale Interaktionen: Move = 3 `on_date_change` vor Pointer-Up; Resize links/rechts = je 1 `on_date_change` vor Pointer-Up; Progress = 1 `on_progress_change` nach Pointer-Up; Escape und Release außerhalb = 0 fachliche Intents. Das beweist exemplarische physische Interaktionen und das eigene Gate, **nicht** eine öffentlich dokumentierte transaktionale Hersteller-API. Die erneut verschärften Positivassertions benötigen ihren eigenen abschließenden CI-Nachweis.


### Unabhängige Abschlussprüfung PR #17 (06.11.2026)

- **Nachweis auf Head `de3732fb` und zugehörigem PR-Merge-Ref `6bdcbfa4`:** [Branch-Validierung](https://github.com/thomasasen/gantt-studio/actions/runs/42232296779) und [PR-Validierung](https://github.com/thomasasen/gantt-studio/actions/runs/42232310534) jeweils SUCCESS (43/43 Unit-/Contract-Tests); [Branch-Browser](https://github.com/thomasasen/gantt-studio/actions/runs/42232296631) und [PR-Merge-Ref-Browser](https://github.com/thomasasen/gantt-studio/actions/runs/42232310526) jeweils SUCCESS (115/115 Chromium, 20/20 Projektwechsel).
- [Tatsächliche Rohspuren des PR-Merge-Refs](https://github.com/thomasasen/gantt-studio/actions/runs/42232310526/artifacts/13509474039): 8 JSON-Dateien. Move 3 frühe `on_date_change`; Resize links und rechts jeweils 1 früher `on_date_change`; Progress 1 `on_progress_change` nach Pointer-Up. In allen vier Fällen genau 1 Intent mit dem letzten Callback-Inhalt; Klick/Escape/Release außerhalb jeweils 0 Intents. Keine angelegte IndexedDB-Datenbank. Keine Garantie für allgemeine Callback-Stabilität.
- **Identifizierte falsch-positive Probe:** `rerender-during-drag.json` auf diesem früheren Stand enthielt überhaupt keinen `pointerdown` und keinen Änderungs-Callback. Ursache war ein Offscreen-Mauszug. Der Test wird nun durch Scroll-/Viewport-Kontrolle sowie Pflichtassertions für echten `pointerdown`, mindestens einen `on_date_change` vor Frame-Neustart und nachgewiesenes Frame-Teardown abgesichert. Ohne diese Vorbedingungen darf der Test nicht grün sein.
- **Neue Testversion:** Die abschließenden GitHub-Actions-Läufe müssen ausdrücklich auf dem **neuen** Head einschließlich dieser Testkorrektur und auf dessen PR-Merge-Ref erfolgreich sein. Die oben genannten Ergebnisse sind nur die historische Baseline vor der Korrektur. Finale Referenzen und Merge-Entscheidung sind in der Beschreibung von PR #17 zu hinterlegen.
- Browser-seitig bereits vorhandene synthetische Negativtests für `pointercancel` und ESC sowie Session-/Revisions-/Replay-Tests ersetzen keine physische Touch-/Pen-/Keyboard- und IndexedDB-Transaktionsabnahme. Der Frappe-Modus bleibt Diagnose und besitzt keine schreibende Produktanbindung.


### Independent Frappe pointer experiment (Phase 5, separate PR)

- Optional static experiment: `/spikes/frappe/index.html?layer=1`. **Only Day mode**; Frappe runs `readonly:true`, external pointer binder shows the transient drag/resize/progress preview. No product activation and no IndexedDB write.
- Core contract: `node --test tests/frappe-independent-gesture.spec.mjs`, covering four gesture types, inclusive date-only arithmetic/DST, one-intent semantics, Escape, pointercancel, lifecycle, revision fencing, CAS replay/conflict and stale project activation.
- Real Chromium gestures: `npx playwright test tests/frappe-independent-pointer.spec.cjs --workers=1 --reporter=line`. Tests assert visible editor handles, physical `pointerdown` recorded by the isolated frame, actual preview before pointer-up, no early intent, exactly one memory CAS result (or zero for abort), no IndexedDB databases and revision increment on success. Synthetic cancellation events are used **only** for the pointercancel/blur negative paths after a physical pointer-down.
- Full validation: `node --test` in the modified Validate workflow, plus complete `npx playwright test` and 20× critical Native project-switch stress test in the UI workflow, on both the PR head and GitHub-created merge-ref against `feature/frappe-transactional-editor`.
- Critical review limit: the implementation-level overlay hooks into Frappe's generated SVG selectors. Passing tests do not make those selectors supported upstream APIs. The Spike is not a production-ready engine or a proven replacement for Native.

### Phase 6: DHTMLX Community 10.0.3, isolierter Vergleich

Die Vergleichsseite `/spikes/dhtmlx/index.html` lädt **ausschließlich nach lokalem Build** die feste Community-Version von `spikes/dhtmlx/vendor/`. Standardmäßig read-only; `?edit=1` schaltet nur auf RAM-Diagnose ohne IndexedDB, localStorage oder produktive Engine-Umschaltung. `tests/dhtmlx-mapper.spec.mjs` prüft inklusive Kalendertage, DST-Grenzen, Projekt-/Task-IDs und Links. `tests/dhtmlx-pointer.spec.cjs` erfordert echte Playwright-Gesten, Vendor-Vorschauereignisse und einen abgeschlossenen RAM-Commit, nicht bloß triviale Sicherheitsprüfungen.

Lokale Befehle:

```bash
npm ci --prefix spikes/dhtmlx --ignore-scripts
npm run build --prefix spikes/dhtmlx
node --test tests/dhtmlx-mapper.spec.mjs
npx playwright test tests/dhtmlx-pointer.spec.cjs --workers=1 --reporter=line
npx playwright test
npx playwright test tests/project-switch-cancel.spec.cjs --grep "switching projects during Gantt drag" --repeat-each=20 --workers=1
```

Ein grüner statischer Test allein ist keine Editor-Freigabe. CI-Ergebnisse auf endgültigem Head und tatsächlichem PR-Merge-Ref dokumentieren. Bei fehlschlagenden Positivtests bleiben exakt diese Fälle offen.

**Zusätzliche Abbruch- und Session-Gates:** Reiner Klick ohne Bewegung; reales Loslassen außerhalb des ursprünglichen Balkens; Destroy während echter Geste; Browser-Fokusverlust über Aktivieren eines weiteren Tabs; zwei unmittelbar folgende echte Drags mit Revisionsprüfung und Replay-Abwehr; zweiter gleichzeitiger Browser-Pointer via Chromium-CDP-Touchstart; Read-only-Rendering bei 390/768/1024/1440px, CSS-Zoom 200 % und Reduced Motion. Diese Tests dürfen nicht als bestanden gelten, bevor der finale GitHub-PR-Merge-Ref grün ist. CDP erzeugt einen echten Browser-Touchpointer, aber ersetzt keine manuelle Mehrfingerprüfung am Touchgerät.

**Red-Team-Korrektur zu Browser-Blur (#42248674630, 145/147 erfolgreich):** Das Aktivieren eines weiteren Chromium-Tabs über Playwright `bringToFront()` löst im Headless-Lauf nicht zuverlässig `window.blur` aus; ein fehlendes Blur-Ereignis ist kein Fehler des DHTMLX-Cancel-Handlers. Der Test startet weiterhin einen echten Maus-Drag und überprüft anschließend den Cancel-Handler durch **explizit synthetisches** `window.blur`. Das gilt nur als Handler-Diagnose, **nicht** als Nachweis für echte Betriebssystem-Fokuswechsel. Ein zweiter Fehler lag ausschließlich im Test-Helfer, der für aufeinanderfolgende Gesten fälschlich `0` bestehende Intents erwartete. Der Helfer prüft nun die Anzahl **neuer** Intents und die pro Geste **neuen** Herstellerereignisse; bestehende Intents dürfen nicht überdeckte neue Gesten vortäuschen. Physischer Fokusverlust außerhalb Headless bleibt manuell abzuprüfen.


**Phase 6: verifizierte DHTMLX-PR-Merge-Ref-Basis vor Abschlussdokumentation.** Head `be856c872e55cfa8e179814f80430989c8a2160e`: [Static Validate #42251548759](https://github.com/thomasasen/gantt-studio/actions/runs/42251548759) SUCCESS; [UI browser regression #42251548777](https://github.com/thomasasen/gantt-studio/actions/runs/42251548777) SUCCESS, **149/149 Chromium-Tests und 20/20 Native-Projektwechsel**. Inklusive vier echter positiver DHTMLX-Dragmodi (Move, linkes/rechtes Resize, Progress), Negativtests für Escape, Cancel, Projektwechsel, Destroy, Fokus-Handler, zweiten Pointer und fehlende Remote-Anfragen. DHTMLX-Performance-Rohdaten [Artefakt 13520547959](https://github.com/thomasasen/gantt-studio/actions/runs/42251548777/artifacts/13520547959): je drei Wiederholungen bei 0/1/25/250/1000 Aufgaben, Mediane im zentralen Architekturplan. Das ist eine *diagnostische* Browserabnahme, nicht die Freigabe für einen Produktivwechsel. Ein finales zusätzliches Dokumentations-Commit erfordert erneut Checks auf dem PR-Merge-Ref.


### Phase 7: Native intent revision fencing

Der neue reine Node-Test `node --test tests/native-intent-scope.spec.mjs` prüft die Herkunft eines Engine-Intents (Projekt-ID, Revision, Aktivierungsgeneration), stale Intents hinter bereits eingereihten Commits und verspätete Projektsnapshots nach erfolgreicher Speicherung.

`npx playwright test tests/native-intent-fence.spec.cjs --workers=1` überprüft mit einer echten Mausgeste, dass Native nach einem Rerender keinen Intent der alten Gesture ausgeben kann, und dass ein gültiger Intent genau den ursprünglichen Projekt-/Revisions-/Generationskontext trägt. Die komplette Browser-Suite und der 20× kritische Native-Projektwechsel sind weiterhin Pflicht. Tests auf dem PR-Merge-Ref sind für den endgültigen Head zu verifizieren.
