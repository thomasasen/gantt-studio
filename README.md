# Gantt Studio

**Gantt Studio** ist eine vollständig browserbasierte Projektplanungs-Anwendung für GitHub Pages. Die Pages-Portierung orientiert sich funktional an der bestehenden Docker-Version auf Odin, speichert Projekte jedoch lokal im Browser statt über den Express-Dateispeicher.

## Live

Nach einmaliger Aktivierung von GitHub Pages unter **Settings → Pages → Source → GitHub Actions** ist die Anwendung unter

`https://thomasasen.github.io/gantt-studio/`

erreichbar.

## Stand v1.2.0

### Projektportfolio

- mehrere Projekte im Browser verwalten
- Projekt auswählen, neu anlegen, umbenennen und löschen
- automatische lokale Speicherung über IndexedDB
- Projektimport und -export im bestehenden `gantt-studio.project`-JSON-Format
- Import erzeugt neue Projekt- und Task-IDs, damit vorhandene Projekte nicht überschrieben werden

### Aufgaben und Gantt

- Workstreams, kritische Aufgaben, Meilensteine und Gates
- Start, Ende und Fortschritt
- Owner, Ampelstatus und Risiko
- Abhängigkeiten zwischen Aufgaben
- Zyklusprüfung für Abhängigkeiten
- Baseline und Puffer
- Kosten
- Tag-, Wochen- und Monatsansicht
- Operativ-, Management- und Meilensteinansicht

Die Managementansicht zeigt insbesondere kritische Aufgaben, Meilensteine, Gates, hohe/kritische Risiken, roten Status und überfällige Aufgaben.

### Planung & Darstellung

- Phasen anlegen, bearbeiten und löschen
- Stichtage/Gates als vertikale Linien verwalten
- Feiertage und Sondertage verwalten
- Feiertagsimport für Deutschland über Nager.Date mit optionalem Bundesland-Code
- Heute-Linie
- relative Zieldatumslinie
- Wochenenden, Feiertage, Phasenbänder, Baseline, Puffer, Risiken, Owner, Fortschritt und Abhängigkeiten ein-/ausblenden
- integrierte Symbolerklärung

## Datenformat

Die Anwendung verwendet weiterhin das bestehende Schema:

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
    "labelConfig": {},
    "revision": 1
  }
}
```

## Architektur auf GitHub Pages

GitHub Pages führt keinen Node-/Express-Server aus. Deshalb wird die Odin-Architektur bewusst so übersetzt:

```text
Odin / Docker                     GitHub Pages
────────────────────────────────────────────────────
Express REST API            →     Browserlogik
/data/gantts.json            →     IndexedDB
Server-Autosave             →     Browser-Autosave
Server-Projektrevision      →     lokale Revision
Nager.Date Proxy            →     Browser-Abruf Nager.Date
JSON Import/Export          →     Browser File API
```

Es werden keine GitHub-Tokens oder andere Secrets im Frontend gespeichert.

## Noch nicht 1:1 aus Odin portiert

Der analysierte Odin-Build `frappe-gantt-online-editor` v1.1.3 besitzt weitere Komfortfunktionen, die schrittweise übernommen werden sollen:

- vollständiger Design-Editor mit Vorlagen und projektspezifischem Designtransfer
- erweiterter Label-Manager mit Tracks, Leader Lines, Ellipsis und Zwei-Zeilen-Modus
- PNG-, JPG- und PDF-Export des kompletten Projektplans
- Microsoft-Project-XML-Import/-Export
- umfangreiche Aufgaben-Tabelle mit Inline-Editing
- vollständige Odin-Symbol-/Projektmanagement-Erklärseite
- Drag/Resize direkt über Frappe Gantt
- serverseitige Daily Backups entfallen auf Pages konzeptbedingt; die portable JSON-Datei dient als explizites Backup

## Sicherheit und Datenschutz

Projekte werden standardmäßig ausschließlich im IndexedDB-Speicher des jeweiligen Browsers gehalten. Ein Projekt verlässt den Browser nur durch eine explizite Exportaktion oder beim Abruf externer Feiertagsdaten. Es gibt keine zentrale Cloud-Datenbank und keine Benutzerkonten.
