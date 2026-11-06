/* README-Dokumentation: echte Chromium-Browserzustände von Gantt Studio. */
'use strict';
const {chromium, expect} = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const HOST=process.env.GANTT_DOCS_URL || 'http://127.0.0.1:4173/';
const OUT=process.env.GANTT_DOCS_TEMP || path.join(os.tmpdir(),'gantt-readme-capture');
const WIDTH=1600, HEIGHT=1000;
fs.mkdirSync(OUT,{recursive:true});
const files=[], errors=[];
let page;
function el(s){return page.locator(s).first();}
async function top(){await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));}
async function shoot(name,title,targets=[]){
  await page.evaluate(async()=>document.fonts.ready);
  await page.waitForTimeout(220);
  const marks=[];
  for(const [selector,label] of targets){
    const node=el(selector);
    await node.waitFor({state:'visible',timeout:15000});
    const b=await node.boundingBox();
    if(!b || b.x>=WIDTH || b.y>=HEIGHT || b.x+b.width<=0 || b.y+b.height<=0)
      throw new Error('Nicht sichtbares Ziel '+selector+' in '+name);
    marks.push({selector,label,x:Math.round(Math.max(22,Math.min(WIDTH-22,b.x+Math.min(65,Math.max(25,b.width*.45))))),y:Math.round(Math.max(22,Math.min(HEIGHT-22,b.y+Math.min(23,Math.max(12,b.height*.2)))))});
  }
  await page.screenshot({path:path.join(OUT,name+'.png'),animations:'disabled'});
  files.push({name,title,marks});
  console.log('PHOTO',name,marks.length,'DOM-geprüfte Markierungen');
}
(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  try{
    const ctx=await browser.newContext({viewport:{width:WIDTH,height:HEIGHT},deviceScaleFactor:1,locale:'de-DE',timezoneId:'Europe/Berlin',acceptDownloads:true,reducedMotion:'reduce',colorScheme:'light'});
    page=await ctx.newPage();
    page.on('pageerror',e=>errors.push(String(e)));
    await page.goto(HOST,{waitUntil:'domcontentloaded'});
    await expect(el('#projectSelect option')).toHaveCount(1,{timeout:15000});
    await expect(el('#saveStatusText')).toContainText('Gespeichert');
    await el('#loadDemoBtn').click();
    await expect(el('#taskTableBody')).toContainText('Projekt-Kick-off',{timeout:15000});
    await expect(el('#saveStatusText')).toContainText('Gespeichert');
    await top();
    await shoot('01-produktuebersicht','Gantt Studio mit Demoprojekt');
    await shoot('02-oberflaeche','Die wichtigsten Bedienbereiche',[
      ['#projectSelect','Projektauswahl'],['[data-management-mode="operational"]','Ansicht steuern'],
      ['#ganttScroller','Gantt-Zeitplan'],['#centralExportBtn','Exportieren']
    ]);
    await shoot('03-projektverwaltung','Projektverwaltung und lokales Speichern',[
      ['#projectSelect','Projekt wechseln'],['#newProjectBtn','Projekt erstellen'],
      ['#loadDemoBtn','Demoprojekt als Kopie laden'],['#openProjectBtn','JSON-Datei importieren'],
      ['#saveStatus','Speicherstatus']
    ]);
    await shoot('04-zeitplan','Zeitplan, Reihenfolge und Zeitskalen',[
      ['#phaseCollapseToolbar','Phasen auf- oder zuklappen'],['[data-management-mode="management"]','Managementansicht'],
      ['[data-zoom="week"]','Tag, Woche oder Monat'],['.gantt-order-switch','Reihenfolge umschalten'],
      ['#ganttScroller','Aufgabenbalken und Zeitraster']
    ]);
    const bar=el('#ganttStage .gantt-bar.workstream');
    await bar.scrollIntoViewIfNeeded();
    await shoot('05-gantt-interaktionen','Aufgaben direkt im Diagramm bearbeiten',[
      ['#ganttStage .gantt-bar.workstream','Balken verschieben, Termin und Fortschritt ändern'],
      ['#ganttScroller','Zeitplan horizontal bewegen']
    ]);
    await bar.focus();await page.keyboard.press('Enter');
    await expect(el('#taskDialog')).toBeVisible();
    await shoot('06-aufgabeneditor','Aufgaben anlegen und bearbeiten',[
      ['#taskName','Aufgabenname'],['#taskStart','Startdatum'],['#taskEnd','Enddatum'],
      ['#taskType','Typ: Workstream, kritisch, Meilenstein, Gate'],['#taskProgress','Fortschritt']
    ]);
    await el('#taskDialog button[value="cancel"]').last().click();
    await expect(el('#taskDialog')).toBeHidden();
    await el('#taskDetailsToggle').click();
    await el('#taskOverviewTitle').scrollIntoViewIfNeeded();
    await shoot('07-aufgabentabelle','Tabellenansicht und direkte Bearbeitung',[
      ['#taskDetailsToggle','Weitere Felder zeigen'],['#taskTableAddBtn','Aufgabe ergänzen'],
      ['#taskOverviewTable','Zellen direkt bearbeiten'],['#taskOverviewTable thead','Status, Risiko und Abhängigkeiten']
    ]);
    await top();
    await shoot('08-phasen','Phasen und Sammelzeilen im Zeitplan',[
      ['#phaseCollapseToolbar','Phasen ein- und ausklappen'],['#ganttScroller','Phasen-Sammelzeilen']
    ]);
    await el('[data-management-mode="management"]').click();
    await shoot('09-managementansicht','Projektansichten und Kriterien',[
      ['[data-management-mode="management"]','Managementansicht auswählen'],['#filterDetails','Filterkriterien festlegen'],
      ['#visibleTaskCount','Sichtbare Aufgaben zählen'],['#ganttScroller','Reduzierter Gantt-Zeitplan']
    ]);
    await el('#planningTabBtn').click();
    await expect(el('#planningView')).toBeVisible();
    await top();
    await shoot('10-planung-darstellung','Planung und Darstellung einstellen',[
      ['#planningTabBtn','Planungsbereich öffnen'],['#displaySection summary','Anzeigeeinstellungen'],
      ['#phaseSection summary','Phasen bearbeiten'],['#markerSection summary','Stichtage und Gates']
    ]);
    await el('#relative-today-editor').scrollIntoViewIfNeeded();
    await shoot('11-dynamische-zieldatumslinie','Relative oder konkrete Zieltermine',[
      ['#relativeEnabled','Zieldatumslinie einschalten'],['#relativeOffset','Versatz in Tagen'],
      ['#relativeMode','Arbeits- oder Kalendertage'],['#relativeTargetDate','Konkretes Zieldatum'],
      ['#relativeStyle','Linienart wählen']
    ]);
    await el('#designBtn').click();
    await expect(el('#designDialog')).toBeVisible();
    await shoot('12-designvorlagen','Helle, dunkle und hybride Designs',[
      ['#designPresetGrid','Elf Vorlagen wählen'],['#designPrimary','Farben gezielt ändern'],
      ['#designPreviewCard','Ergebnis vorab ansehen']
    ]);
    await el('#designDialog button[value="cancel"]').last().click();
    await expect(el('#designDialog')).toBeHidden();
    await el('#projectTabBtn').click();await top();await el('#centralExportBtn').click();
    await expect(el('#exportDialog')).toBeVisible();
    await shoot('13-exportauswahl','Projekt, Aufgaben und Diagramm exportieren',[
      ['#exportJsonBtn','JSON-Projektsicherung'],['#exportCsvBtn','Aufgaben als CSV'],
      ['#printPdfBtn','Diagramm als PDF, PNG oder JPG']
    ]);
    await el('#printPdfBtn').click();
    await expect(el('#printPdfDialog')).toBeVisible();
    await expect(el('[data-print="format"]')).toHaveValue('pdf');
    await shoot('14-pdf-druck','Mehrseitiger PDF-Projektplan',[
      ['[data-print="format"]','PDF auswählen'],['[data-print="profile"]','Profil wählen'],
      ['#printFrame','Druckseiten-Vorschau'],['[data-print-output]','Browserdruckdialog öffnen']
    ]);
    await el('[data-print="format"]').selectOption('png');
    await expect(page.frameLocator('#printFrame').locator('svg[role="img"]')).toBeVisible({timeout:15000});
    await expect(el('[data-print-output]')).toHaveText('PNG-Bild exportieren');
    await shoot('15-bildexport','Einzelnes vollständiges Diagrammbild',[
      ['[data-print="format"]','PNG oder JPG auswählen'],['[data-print="imageScale"]','Bildauflösung einstellen'],
      ['#printFrame','Vollständige Diagramm-Vorschau'],['[data-print-output]','Bilddatei speichern']
    ]);
    const [download]=await Promise.all([page.waitForEvent('download',{timeout:60000}),el('[data-print-output]').click()]);
    if(!download.suggestedFilename().endsWith('.png'))throw new Error('PNG-Export fehlgeschlagen');
    await download.saveAs(path.join(OUT,'16-exportiertes-diagramm.png'));
    files.push({name:'16-exportiertes-diagramm',title:'Echter vollständiger PNG-Export aus der Anwendung',marks:[],exported:true});
    fs.writeFileSync(path.join(OUT,'manifest.json'),JSON.stringify({host:HOST,viewport:{width:WIDTH,height:HEIGHT},files,errors},null,2));
    if(files.length!==16||errors.length)throw new Error('Abnahme fehlgeschlagen: Bilder='+files.length+' Browserfehler='+errors.join('; '));
    console.log('OK: 16 echte Aufnahmen/Exporte');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
