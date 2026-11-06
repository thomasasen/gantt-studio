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
- Das Lockfile wurde in GitHub Actions mit regulärem npm `install --package-lock-only`
  neu erstellt (Commit `70b556d4`); die SHA-512-Integrität der exakt gepinnten
  npm-Version ist enthalten und wird in `validate.yml` dauerhaft geprüft.

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

## Gate-C-Abnahme 06.11.2026: NO-GO für einen produktiven Engine-Ersatz

Die ersten überprüften CI-Läufe belegen den erfolgreichen lokalen `npm ci`-Build,
7 Frappe-Contract-Tests und 65 Chromium-Tests auf
[UI #42129659264](https://github.com/thomasasen/gantt-studio/actions/runs/42129659264).
Die tatsächliche date-only-Darstellung bestand in `Europe/Berlin`,
`America/New_York` und `Pacific/Auckland` die DST-/Schaltjahr-Grenzfälle.

**Blocker 1: Listener/Dispose.** Frappe registriert in
`src/index.js:bind_bar_events` einen globalen `document.mouseup`-Listener
pro Chart, ohne öffentliche Dispose-API. Der instrumentierte Browserlauf
hat sieben registrierte und null entfernte Listener nach wiederholtem
Rendern und explizitem `engine.destroy()` bestätigt. Nur den DOM zu
entfernen reicht nicht. Der Spike nimmt keine privaten Frappe-Patches vor.

**Blocker 2: Interaktions-Commit.** In Upstream-`src/bar.js` ruft
`update_bar_position` aus laufender Mausbewegung bereits
`date_changed`/den öffentlichen `on_date_change`-Callback auf;
`Escape`/`pointercancel` haben keinen dokumentierten transaktionalen
Cancel-Vertrag. Der verpflichtende Gantt-Studio-Vertrag (nur Vorschau,
Escape ohne Commit, höchstens ein Intent auf gültigen Pointer-Up) lässt
sich so nicht sicher übernehmen.

Ergebnis: Die Native Engine bleibt der einzige unterstützte Renderer.
PR #14 bleibt ein isolierter Draft und wird **nicht** in `main` gemergt.
Eine neue Bewertung erfordert eine Upstream-Version mit öffentlichen,
nachgewiesen belastbaren Lifecycle- und Interaktionsschnittstellen.

Die vollständige Feature-Paritätsmatrix, Einzelmessungen und Red-Team-Befunde
stehen im verbindlichen Masterplan
`docs/FRAPPE_ENGINE_IMPLEMENTATION_PLAN.md`.
