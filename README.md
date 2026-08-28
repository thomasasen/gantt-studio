# Gantt Studio

**Gantt Studio** ist eine vollständig browserbasierte Projektplanungs-Anwendung für GitHub Pages. Die Pages-Portierung orientiert sich funktional an der bestehenden Docker-Version auf Odin, speichert Projekte jedoch lokal im Browser statt über den Express-Dateispeicher.

## Live

Die Anwendung ist unter

`https://thomasasen.github.io/gantt-studio/`

erreichbar.

## Stand v1.2.1

### Projektportfolio

- mehrere Projekte im Browser verwalten
- Projekt auswählen, neu anlegen, umbenennen und löschen
- automatische lokale Speicherung über IndexedDB
- Projektimport und -export im bestehenden `gantt-studio.project`-JSON-Format
- Import erzeugt neue Projekt- und Task-IDs, damit vorhandene Projekte nicht überschrieben werden
- sichtbarer Hinweis in der Anwendung, dass keine serverseitige Projektablage oder Cloud-Synchronisierung existiert
- „Backup / Export“ als portable Sicherung der lokalen Projektdaten

### Aufgaben und Gantt

- Workstreams, manuell als kritisch markierte Aufgaben, Meilensteine und Gates
- Start, Ende und Fortschritt
- Owner, Ampelstatus und Risiko
- Abhängigkeiten zwischen Aufgaben
- Zyklusprüfung für Abhängigkeiten
- Baseline und Puffer
- Kosten
- Tag-, Wochen- und Monatsansicht
- Operativ-, Management- und Meilensteinansicht

Die Managementansicht zeigt insbesondere als kritisch markierte Aufgaben, Meilensteine, Gates, hohe/kritische Risiken, roten Status und überfällige Aufgaben.

**Wichtig:** Die Kennzeichnung `critical` ist derzeit eine manuelle Aufgabenklassifikation. Gantt Studio berechnet aktuell keinen mathematischen Critical Path / CPM.

### Planung & Darstellung

- Phasen anlegen, bearbeiten und löschen
- Stichtage/Marker als vertikale Linien verwalten
- Feiertage und Sondertage verwalten
- Feiertagsimport für Deutschland über Nager.Date mit optionalem Bundesland-Code
- Heute-Linie
- relative Zieldatumslinie
- Wochenenden, Feiertage, Phasenbänder, Baseline, Puffer, Risiken, Owner, Fortschritt und Abhängigkeiten ein-/ausblenden
- integrierte Symbol-, Speicher- und Backup-Erklärung

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

GitHub Pages führt keinen Node-/Express-Server für Gantt Studio aus. Deshalb wird die Odin-Architektur bewusst so übersetzt:

```text
Odin / Docker                     GitHub Pages
────────────────────────────────────────────────────
Express REST API            →     Browserlogik
/data/gantts.json            →     IndexedDB
Server-Autosave             →     Browser-Autosave
Server-Projektrevision      →     lokale Revision
Nager.Date Proxy            →     direkter Browser-Abruf Nager.Date
JSON Import/Export          →     Browser File API
```

Es werden keine GitHub-Tokens oder andere Secrets im Frontend gespeichert.

## Datenspeicherung und Datenschutz

Die Aussage „nur lokal gespeichert“ bezieht sich auf **Projekt- und Planungsdaten**:

- Projekte werden ausschließlich in **IndexedDB des jeweiligen Browserprofils** gespeichert.
- In `localStorage` wird lediglich die ID des aktuell aktiven Projekts gemerkt.
- Es gibt keine Gantt-Studio-Cloud-Datenbank, keinen eigenen Projektserver und keine automatische Synchronisierung zwischen Geräten oder Browserprofilen.
- GitHub Pages liefert die statischen Anwendungsdateien HTML, CSS und JavaScript aus; Projektinhalte werden von Gantt Studio nicht an GitHub übertragen oder dort gespeichert.
- Löscht der Nutzer Website-/Browserdaten oder nutzt ein anderes Gerät bzw. Browserprofil, stehen die lokalen Projekte dort nicht automatisch zur Verfügung.
- Für portable und dauerhafte Sicherungen sollte regelmäßig **Backup / Export** verwendet werden.
- Beim optionalen Feiertagsimport fragt der Browser `date.nager.at` für ein Jahr und Deutschland ab. Dabei werden keine Projektinhalte an Nager.Date übertragen.

Wie bei jeder über das Web ausgelieferten Anwendung können der Hostinganbieter und externe Dienste technisch normale HTTP-Verbindungsdaten verarbeiten. Die Aussage „keine serverseitige Speicherung“ bedeutet daher ausdrücklich: **keine Speicherung der Gantt-Studio-Projekt- und Planungsdaten auf einem Server**.

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
