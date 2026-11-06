# Dokumentationsbilder reproduzieren

Die Bilder unter `docs/images/readme/` stammen aus der **echten Gantt-Studio-Anwendung** und wurden mit Playwright/Chromium auf dem jeweiligen Branch aufgenommen. Nummerierte Pins liegen auf anhand des DOM ermittelten Koordinaten. Die erklärende Legende steht unterhalb des Originalbildes. Es werden weder synthetische UI-Funktionen noch KI-generierte Oberflächen verwendet.

## Ausführung

Voraussetzungen: Node.js 22, Python 3, Chromium für Playwright, `@playwright/test@1.56.1` und Pillow. Anschließend:

```bash
npm install --no-save --no-package-lock @playwright/test@1.56.1
npx playwright install chromium
python3 -m pip install Pillow
python3 -m http.server 4173 --bind 127.0.0.1 &
node scripts/docs/capture-screenshots.cjs
python3 scripts/docs/annotate-screenshots.py
```

Die Sitzung verwendet einen frischen Browserkontext mit 1600 × 1000 CSS-Pixeln, deutschem Gebietsschema, Zeitzone Europe/Berlin und dem öffentlichen Demoprojekt. Das sechzehnte Motiv stammt aus einem **wirklichen PNG-Download** der Exportfunktion. Kein persönliches Projekt wird geladen.

Rohdaten und Koordinatenmanifest liegen unter `/tmp/gantt-readme-capture/`, außerhalb des Repositorys. Nur optimierte WebP-Dateien und die Kontaktübersicht werden eingecheckt. Der branchgebundene Workflow `.github/workflows/readme-screenshots.yml` erzeugt und prüft sie automatisch.

## Qualitätssicherung und Grenzen

Die Aufnahme schlägt fehl, wenn eine beschriftete Funktion nicht sichtbar ist, der Browser einen JavaScript-Fehler meldet oder der Bildexport fehlschlägt. Alle lokalen Bildverweise werden validiert. Export-Playwright-Tests kontrollieren PDF/PNG/JPG und die Beschriftungen.

Automatische Prüfungen ersetzen keine **menschliche Sichtprüfung** der gerenderten README. Insbesondere bei Änderungen an Dialoggrößen, GitHub-Dark-Mode, 200-%-Browserzoom oder mobiler Darstellung ist eine erneute visuelle Abnahme nötig. Datumsabhängige Inhalte können sich bei erneuter Ausführung ändern.
