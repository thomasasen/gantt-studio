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
