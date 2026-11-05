# Frappe Gantt – isolierter Evaluierungsaufbau

Dieser Spike ist absichtlich **nicht** in `index.html` oder `app.js` eingebunden.
Die Native Engine bleibt der einzige Produktivrenderer.

## Lokal ausführen

Voraussetzungen: Node.js 22 oder neuer, Python 3 und für UI-Tests Playwright/Chromium.

```sh
npm ci --prefix spikes/frappe --ignore-scripts --no-audit --no-fund
npm run build --prefix spikes/frappe
node --test tests/frappe-spike.spec.mjs
python3 -m http.server 4173
```

Dann `http://127.0.0.1:4173/spikes/frappe/index.html` öffnen.

Für den Chromium-Test im Repository-Stamm nach Installation der projektüblichen
Playwright-Abhängigkeit:

```sh
npx playwright test tests/frappe-browser.spec.cjs
```

Der Build erzeugt ausschließlich lokale Dateien unter `spikes/frappe/vendor/`:
Frappe-UMD, CSS und originale MIT-Lizenz. **Keine Runtime-CDNs**.
`node_modules` und `vendor` sind nicht im Repository eingecheckt. Die
GitHub-Action baut die Assets vor den Browserprüfungen neu.

## Evaluation und technische Grenzen

- Frappe ist bewusst `readonly`, auch für Fortschritt und Termine.
- Es erhält pro Rendering eine neu erzeugte Task-Projektion und speichert nicht.
- Die Datumswerte sind `YYYY-MM-DD` mit inklusivem Enddatum. Callback-Dates
  werden gesondert mit lokalen Kalenderkomponenten zurückübersetzt.
- Phasen-Sammelzeilen, Reorder, Overlays, zehn weitere Detailfunktionen und
  vollständiges Design- und A11y-Verhalten sind **noch nicht paritätisch**.
- Die dokumentierte Frappe-API stellt kein `destroy()` bereit. DOM-Entfernung
  beweist keine Freigabe globaler Listener und ersetzt kein Lifecycle-Profiling.
- `move_dependencies:false` verhindert nur das automatische Verschieben durch
  Frappe; es implementiert nicht die Terminregeln von Gantt Studio.
- Der Lockfile-Tarball ist auf 1.2.2 fixiert, ein SRI-Integritätseintrag fehlt
  vorerst noch. Für ein freigabefähiges Gate C ergänzen und CI nachvollziehen.

Der Masterplan `docs/FRAPPE_ENGINE_IMPLEMENTATION_PLAN.md` dokumentiert Gate C,
Testbelege, Risiken, Feature-Lücken und die spätere Go/No-Go-Entscheidung.

## Verifizierter Befund (06.11.2026)

Die bestehenden GitHub-Actions-Läufe `42128331295` (7/7 Adapter-Tests) und
`42128331083` (60/60 Playwright-Tests) waren erfolgreich. Dies ist noch keine
Lifecycle-Abnahme: Frappe 1.2.2 registriert im Konstruktor über
`bind_bar_events()` einen globalen `document.addEventListener('mouseup', ...)`
ohne passende öffentliche Dispose-API. Der bisherige Adapter konstruiert bei
jedem `render()` neu. DOM-Bereinigung allein löst das Listener-Risiko nicht.
Deshalb ist Gate C bis zum Nachweis einer sauberen Isolation gesperrt.
