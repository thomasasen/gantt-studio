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


### Physische Frappe-Editor-API-Diagnose (Draft, Branch `spike/frappe-public-editor-api`)

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
