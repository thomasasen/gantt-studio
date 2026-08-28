# Gantt Studio

**Gantt Studio** ist eine vollständig browserbasierte Projektplanungs-Anwendung für GitHub Pages. Projekte werden lokal im Browser gespeichert und können als portable `.gantt.json`-Dateien importiert und exportiert werden. Es ist kein Backend und kein GitHub-Token im Browser erforderlich.

## Live

Nach Aktivierung von GitHub Pages ist die Anwendung unter

`https://thomasasen.github.io/gantt-studio/`

erreichbar.

## Funktionen v1.0.0

- Aufgaben mit Start, Ende, Fortschritt, Typ, Owner, Status und Risiko
- Typen: Workstream, kritisch, Meilenstein und Gate
- Abhängigkeiten zwischen Aufgaben
- Phasenzuordnung und Phasenbänder
- Baseline und Puffer
- Kosten und Projektkennzahlen
- Marker, Feiertage und Heute-Linie aus dem bestehenden Gantt-Studio-Datenmodell
- Zoom: Tag, Woche, Monat
- automatische lokale Sicherung über IndexedDB
- Import und Export des bestehenden `gantt-studio.project`-Schemas
- responsive GitHub-Pages-Oberfläche
- keine serverseitige Komponente und keine Zugangsdaten im Frontend

## Datenformat

Die Anwendung verwendet das bestehende Schema:

```json
{
  "schema": "gantt-studio.project",
  "schemaVersion": 1,
  "generator": "Gantt Studio",
  "project": {
    "id": "…",
    "name": "…",
    "tasks": [],
    "design": {},
    "planning": {
      "settings": {},
      "phases": [],
      "markers": [],
      "holidays": []
    },
    "revision": 1
  }
}
```

Vorhandene Gantt-Studio-JSON-Dateien mit Schema-Version 1 können direkt geöffnet werden.

## Speicherung

Der aktuelle Projektstand wird automatisch in **IndexedDB** des Browsers gespeichert. Die explizite Aktion **Speichern** lädt zusätzlich eine `.gantt.json`-Datei herunter. Damit bleibt die Anwendung serverlos und die Projektdaten verlassen nicht automatisch den Browser.

## GitHub Pages

Der Workflow `.github/workflows/pages.yml` veröffentlicht den Repository-Inhalt bei jedem Push auf `main`. In den Repository-Einstellungen muss unter **Settings → Pages → Build and deployment → Source** einmalig **GitHub Actions** ausgewählt sein, falls GitHub das nicht bereits automatisch erkannt hat.

## Lokale Entwicklung

Da die Anwendung ausschließlich statische Dateien verwendet, reicht ein einfacher HTTP-Server, zum Beispiel:

```bash
python -m http.server 8080
```

Danach `http://localhost:8080` öffnen.

## Sicherheit

Gantt Studio enthält bewusst **keinen GitHub Personal Access Token** und schreibt nicht direkt aus dem Browser in das Repository. Eine spätere Cloud-Synchronisierung sollte über einen sicheren OAuth-/Backend-Flow erfolgen, nicht über eingebettete Secrets.
