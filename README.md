# Gantt Studio

**Gantt Studio** ist eine vollständig browserbasierte Projektplanungs-Anwendung für GitHub Pages. Die Pages-Portierung orientiert sich funktional an der bestehenden Docker-Version auf Odin, speichert Projekte jedoch lokal im Browser statt über den Express-Dateispeicher.

## Live

Die Anwendung ist unter

`https://thomasasen.github.io/gantt-studio/`

erreichbar.

## Stand v1.4.0

### Projektportfolio und lokale Speicherung

- mehrere Projekte im Browser verwalten
- Projekt auswählen, neu anlegen, umbenennen und löschen
- automatische lokale Speicherung über IndexedDB
- sichtbarer Speicherstatus `Speichert… / Gespeichert / Nicht gespeichert`
- Projektimport und -export im bestehenden `gantt-studio.project`-JSON-Format
- Import erzeugt neue Projekt- und Task-IDs, damit vorhandene Projekte nicht überschrieben werden
- prominenter Hinweis, dass keine serverseitige Projektablage oder Cloud-Synchronisierung existiert

### Zeitplan

- Workstreams, manuell als kritisch markierte Aufgaben, Meilensteine und Gates
- Start, Ende und Fortschritt
- Owner, Ampelstatus und Risiko
- Abhängigkeiten zwischen Aufgaben mit Zyklusprüfung
- Baseline und Puffer
- Kosten
- Tag-, Wochen- und Monatsansicht
- Operativ-, Management- und Meilensteinansicht
- konfigurierbarer Managementfilter für kritische Aufgaben, Meilensteine, Gates, hohe/kritische Risiken, roten Status und überfällige offene Aufgaben
- sichtbarer Zähler der aktuell angezeigten Aufgaben
- Balken direkt im Zeitplan verschieben
- Start und Ende per Resize-Griff ändern
- Fortschritt direkt am Balken anpassen

**Wichtig:** Die Kennzeichnung `critical` ist derzeit eine manuelle Aufgabenklassifikation. Gantt Studio berechnet aktuell keinen mathematischen Critical Path / CPM.

### Phasen

Die Odin-Phasenlogik wurde auf GitHub Pages übertragen:

- Phasenleiste oberhalb des Zeitplans
- Aufgabenanzahl je Phase
- Phase einzeln ein- oder ausklappen
- `Alle ausklappen` / `Alle einklappen`
- eigene Phasen-Sammelzeile im Zeitplan
- Ein-/Ausklappzustand wird pro Projekt lokal gespeichert
- Phasen anlegen, bearbeiten und löschen

### Planung & Darstellung

- Odin-nahe Akkordeonseite mit Zählern für Darstellung, Phasen, Stichtage/Gates und Sondertage
- Dynamische Zieldatumslinie mit Arbeits- oder Kalendertagen, direkter Datumsauswahl, eigener Bezeichnung, Farbe und Linienart
- Arbeitstage können Wochenenden und importierte Feiertage überspringen
- Fortschrittslinie und Abhängigkeiten sind getrennt schaltbar
- Gesamtkosten werden in der Planungsansicht separat ausgewiesen

- separater Arbeitsbereich `Planung & Darstellung`
- zentrale Anzeigeoptionen
- Schnellzugriff über `Weitere Einstellungen`
- Stichtage/Marker als vertikale Linien verwalten
- Feiertage und Sondertage verwalten
- Feiertagsimport für Deutschland über Nager.Date mit optionalem Bundesland-Code
- Heute-Linie
- relative Zieldatumslinie
- Wochenenden, Feiertage, Phasenbänder, Baseline, Puffer, Risiken, Owner, Fortschritt und Abhängigkeiten ein-/ausblenden
- integrierte Symbol-, Speicher- und Backup-Erklärung

### Design

- Einstieg `Design bearbeiten` wie in der Odin-Oberfläche
- projektspezifische Farben für Primärfarbe, Akzent, Workstream, kritische Aufgaben, Meilensteine, Gates, Seiten- und Panelhintergrund
- Presets `Gantt Studio` und `Neutral`
- Live-Vorschau
- Design wird im Projekt gespeichert

Der Design-Editor ist noch nicht so umfangreich wie die Odin-Version; insbesondere der vollständige Designtransfer und alle dort vorhandenen Detailoptionen fehlen noch.

### Export

Der zentrale Export bietet aktuell:

- vollständige `.gantt.json`-Projektdatei als portable Sicherung
- CSV-Aufgabenübersicht
- Browser-Druckdialog für Drucken bzw. `Als PDF speichern`

PNG/JPG sowie der direkte PDF-Export mit der Odin-Renderinglogik sind noch nicht vollständig portiert.

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
- In `localStorage` werden lediglich die ID des aktiven Projekts sowie lokale Ansichtspräferenzen wie Zoom, Filter und eingeklappte Phasen gespeichert.
- Es gibt keine Gantt-Studio-Cloud-Datenbank, keinen eigenen Projektserver und keine automatische Synchronisierung zwischen Geräten oder Browserprofilen.
- GitHub Pages liefert die statischen Anwendungsdateien HTML, CSS und JavaScript aus; Projektinhalte werden von Gantt Studio nicht an GitHub übertragen oder dort gespeichert.
- Löscht der Nutzer Website-/Browserdaten oder nutzt ein anderes Gerät bzw. Browserprofil, stehen die lokalen Projekte dort nicht automatisch zur Verfügung.
- Für portable und dauerhafte Sicherungen sollte regelmäßig der Projekt-Export verwendet werden.
- Beim optionalen Feiertagsimport fragt der Browser `date.nager.at` für ein Jahr und Deutschland ab. Dabei werden keine Projektinhalte an Nager.Date übertragen.

Wie bei jeder über das Web ausgelieferten Anwendung können der Hostinganbieter und externe Dienste technisch normale HTTP-Verbindungsdaten verarbeiten. Die Aussage „keine serverseitige Speicherung“ bedeutet daher ausdrücklich: **keine Speicherung der Gantt-Studio-Projekt- und Planungsdaten auf einem Server**.

## Noch nicht 1:1 aus Odin portiert

Der analysierte Odin-Build `frappe-gantt-online-editor` v1.1.3 besitzt weiterhin Funktionen, die noch nicht vollständig auf Pages vorliegen:

- vollständiger Odin-Design-Editor inklusive aller Presets und Designtransfer-Funktionen
- erweiterter Label-Manager mit Tracks, Leader Lines, Ellipsis und Zwei-Zeilen-Modus
- nativer PNG-, JPG- und direkter PDF-Export des kompletten Projektplans
- Microsoft-Project-XML-Import/-Export
- umfangreiche Aufgaben-Tabelle mit Inline-Editing
- weitere Detailfunktionen der Odin-Erklär- und Einstellungsoberfläche
- serverseitige Daily Backups entfallen auf Pages konzeptbedingt; die portable Projektdatei dient als explizites Backup
