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
