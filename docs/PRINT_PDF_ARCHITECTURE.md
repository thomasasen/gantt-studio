# Druck- und PDF-Pipeline (Feature-Branch)

## Architekturentscheidung

Die produktive Gantt-Ansicht ist eine interaktive, scrollbar begrenzte Native-Engine. Sie ist **nicht** die Grundlage des Ausdrucks. Die Druckausgabe wird unabhängig davon aus dem Projekt-Datenmodell abgeleitet. Ein künftiger Frappe-Adapter kann dieselbe Pipeline verwenden.

1. `print-projection.mjs`: tiefer Projektsnapshot (`structuredClone`), Auswahl nach Ansicht, Filter, Phase, Aufgaben-IDs und Zeitraum; Berechnung relevanter Marker und Baselines. Keine Schreibzugriffe.
2. `print-layout.mjs`: feste Papiermaße in Millimetern, Zeilenumbruch, Lesbarkeitsgrenzen und zweidimensionale Paginierung (Zeit × Aufgaben); das Fenstermaß und der Bildschirmzoom kommen nicht in die Berechnung.
3. `print-renderer.mjs`: SVG-Vektorzeichnung mit wiederholten Aufgabenbezeichnungen, Monaten, Zeitachsen und Seitenkopf/-fuß. Papierfarben bleiben hell.
4. `print-controller.mjs`: Dialog, Zustandsverwaltung, Vorschau-iframe, Einstellungen im lokalen `localStorage`, getrennt vom Projektmodell.
5. Ausgabe: dediziertes verborgenes iframe mit vollständig gerendertem Druckdokument und `@page`. `window.print()` wird ausschließlich auf diesem Druckdokument aufgerufen.

Es gibt keine Änderungen an Projektdatei, Revisionslogik, IndexedDB oder Gantt-Engine. Ein Projektwechsel nach Öffnen des Dialogs beeinflusst den eingefrorenen Druckstand nicht.

## Physikalische Seiten und Browsergrenzen

- A4/A3, Hoch/Quer und automatische Ausrichtung sind als reale mm-Maße berechnet.
- Alle Seiten werden mit denselben SVG-Funktionen gezeichnet, die auch der Vorschau dienen; Vorschau wird in einem isolierten iframe gehalten.
- Chromium berücksichtigt in der automatischen PDF-Ausgabe `preferCSSPageSize`; der menschlich bediente Druckdialog kann Papierformat, Ränder, Skalierung, eigene Kopf-/Fußzeilen und Hintergrunddruck **überschreiben**. Diese Einschränkung ist nicht zuverlässig aus JavaScript zu umgehen.
- Druckkommandos in versteckten iframes sind in bestimmten Browsern restriktiv; Browserdialoge können blockiert oder abgebrochen werden. Ein lokales PDF entsteht durch die Druckzielauswahl des Browsers, nicht durch einen serverseitigen Download.
- Abhängigkeitspfeile werden nur gezeichnet, wenn Quelle und Ziel im selben Zeit- **und** Zeilenabschnitt liegen. Abschnittsübergreifende Kanten brauchen gesonderte Fortsetzungsmarkierungen; Datumszuordnung und Aufgaben bleiben auch ohne diese Kanten korrekt.
- Bei unlesbarer Einseiten- oder Breite-anpassen-Ansicht wechselt die Zeitachse auf lesbare Abschnitte und zeigt eine Warnung. Eine sehr hohe Seitenzahl wird mit einer Fehlermeldung abgelehnt statt still unvollständig ausgegeben.
- Die Vorschau rendert jeweils nur eine Seite; über die Seitennavigation sind alle Seiten erreichbar. Das vollständige Druckdokument wird erst bei Ausgabe erstellt.

## Qualitäts- und Freigabekriterien

Die automatisierte Prüfung muss mindestens Datumskontinuität ohne Lücken, Zeilenabdeckung, Papierränder, Profile, Filter, eingefrorene Projektdaten, verschiedene Formate, gezielten PDF-Export, PDF-Seitenzahl und Textinhalt sowie Browser-/Design-Regressionen nachweisen.

Vor Freigabe auf `main` sind die tatsächlichen PDF-Seiten auf abgeschnittenen Text, Meilensteine an Schnittkanten, Kontrast, Baselines, Folgeachsen und Ausgabe unter Dark/Hybrid visuell zu kontrollieren. Grün laufende Unit-Tests alleine sind keine visuelle Freigabe.
