import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrintProjection,dateMath} from '../assets/js/print/print-projection.mjs';
import {computePrintLayout} from '../assets/js/print/print-layout.mjs';
import {renderPrintDocument,renderPrintPage} from '../assets/js/print/print-renderer.mjs';

const {DAY,parse,iso}=dateMath;
function fixture(count=10,years=1){
  const start=parse('2024-01-01');
  const tasks=Array.from({length:count},(_,i)=>{
    const d=start+Math.floor((i%30)*years*365/30)*DAY;
    return {id:'task-'+i,name:'Aufgabe '+i,start:iso(d),end:iso(d+Math.max(1,years*4)*DAY),
      displayOrder:i,progress:i%100,type:i%11===0?'milestone':'workstream',
      showInGantt:true,owner:'Team '+i,status:'green',dependencies:i>0?['task-'+(i-1)]:[],
      phaseId:i%2?'phase-1':'phase-2',baselineStart:iso(d),baselineEnd:iso(d+DAY),
      bufferDays:1,risk:'low'};
  });
  return {id:'project-1',name:'Prüfprojekt',revision:4,tasks,
    planning:{phases:[
      {id:'phase-1',name:'Vorbereitung',start:'2024-01-01',end:'2025-01-01'},
      {id:'phase-2',name:'Umsetzung',start:'2024-01-01',end:'2025-01-01'}],
    markers:[{id:'m1',name:'Gate',date:'2024-06-01'}],
    holidays:[{date:'2024-12-25'}],
    settings:{showRelativeToday:true,relativeOffsetDays:4,relativeDayMode:'days'}}};
}
function prepare(project=fixture(),opts={},view={}){
  const options={strategy:'readable',paper:'A4',orientation:'landscape',margin:10,
    labelWidth:70,fontSize:9,elements:{names:true,baselines:true,buffer:true,markers:true},...opts};
  const projection=createPrintProjection(project,options,view);
  const layout=computePrintLayout(projection,options);
  return {projection,layout,options};
}
test('1: mehrjährige Zeitachse wird vollständig in unabhängige Abschnitte verteilt',()=>{
  const {projection,layout}=prepare(fixture(10,6));
  assert.ok(layout.timePages>1);
  const unique=[...new Map(layout.pages.map(p=>[p.timeIndex,p])).values()];
  assert.equal(unique[0].start,projection.start);
  assert.equal(unique.at(-1).end,projection.end);
  for(let i=1;i<unique.length;i++)assert.equal(parse(unique[i].start),parse(unique[i-1].end)+DAY);
});
test('2: sehr hohe Ansicht wird auf vollständige Zeilenpakete aufgeteilt',()=>{
  const {projection,layout}=prepare(fixture(130));
  assert.ok(layout.rowPages>1);
  const firstTime=layout.pages.filter(p=>p.timeIndex===0).flatMap(p=>p.rows);
  assert.deepEqual(firstTime.map(t=>t.id),projection.rows.map(t=>t.id));
});
test('3: breite und hohe Diagramme benutzen beide Paginierungsdimensionen',()=>{
  const {layout}=prepare(fixture(120,5));
  assert.ok(layout.timePages>1&&layout.rowPages>1);
  assert.equal(layout.pages.length,layout.timePages*layout.rowPages);
});
test('4: Scrollposition wird nicht gelesen',()=>{
  const p=fixture();const a=prepare(p,{},{}).layout;
  const b=prepare(p,{}, {scrollLeft:999999,scrollTop:50000}).layout;
  assert.deepEqual(a.pages.map(x=>[x.start,x.end,x.rows.length]),b.pages.map(x=>[x.start,x.end,x.rows.length]));
});
test('5: Browserfenstergröße verändert keine Printseiten',()=>{
  const p=fixture(80,3);
  const a=prepare(p,{}, {innerWidth:390,innerHeight:400}).layout;
  const b=prepare(p,{}, {innerWidth:2560,innerHeight:1440}).layout;
  assert.equal(a.pages.length,b.pages.length);
});
test('6: Browserzoom verändert keine Daten-/Papiergeometrie',()=>{
  const p=fixture();
  assert.deepEqual(prepare(p,{}, {browserZoom:.5}).layout.pages.map(p=>p.days),
    prepare(p,{}, {browserZoom:2}).layout.pages.map(p=>p.days));
});
test('7: A3 ist physikalisch größer und Hochformat orientiert',()=>{
  const a=prepare(fixture(),{paper:'A3',orientation:'portrait'}).layout;
  const b=prepare(fixture(),{paper:'A4',orientation:'portrait'}).layout;
  assert.deepEqual([a.pageWidth,a.pageHeight],[297,420]);
  assert.deepEqual([b.pageWidth,b.pageHeight],[210,297]);
});
test('8: eine Seite für kleine Projekte, sichere Mehrseiten-Warnung bei großen',()=>{
  const small=fixture(1);small.planning.markers=[];small.planning.phases=[];small.tasks[0].phaseId='';
  const a=prepare(small,{strategy:'one-page'}).layout;
  assert.equal(a.pages.length,1);
  const b=prepare(fixture(190,5),{strategy:'one-page'}).layout;
  assert.ok(b.pages.length>1);assert.ok(b.warnings.some(x=>x.includes('Einzelseite')||x.includes('unlesbar')));
});
test('9: eingeklappte Phasen lassen sich unabhängig von Ansichtseinstellungen erweitern',()=>{
  const p=fixture(),view={collapsedPhaseIds:['phase-1','phase-2']};
  assert.equal(createPrintProjection(p,{expandCollapsed:true},view).taskCount,10);
  assert.equal(createPrintProjection(p,{expandCollapsed:false},view).taskCount,0);
});
test('10: aktive Filterauswahl schließt nicht gefilterte Aufgaben aus',()=>{
  const p=fixture(),result=createPrintProjection(p,{scope:'filtered'},{filteredTaskIds:['task-1','task-3']});
  assert.deepEqual(result.rows.filter(r=>r.kind==='task').map(r=>r.id),['task-1','task-3']);
});
test('11: lange Aufgabennamen werden in mehrere vollständige Zeilen umgebrochen',()=>{
  const p=fixture(1);p.tasks[0].name='Lange Aufgabennamen müssen vollständig sichtbar bleiben und nicht mit Ellipsis abgeschnitten werden '+('Abschnitt '.repeat(13));
  const {layout}=prepare(p,{labelWidth:58});
  const row=layout.pages[0].rows.find(r=>r.kind==='task');
  assert.ok(row.titleLines.length>=3);
  assert.equal(row.titleLines.join(' ').replace(/\s+/g,'').length,p.tasks[0].name.replace(/\s+/g,'').length);
});
test('12: Abhängigkeiten werden im druckfähigen SVG abgebildet',()=>{
  const p=fixture(2);p.tasks[1].phaseId=p.tasks[0].phaseId;
  const {projection,layout,options}=prepare(p,{elements:{dependencies:true}});
  const svg=renderPrintPage(projection,layout,layout.pages[0],options);
  assert.ok(svg.includes('stroke-dasharray="1.1,.7"'));
});
test('13: Meilensteine an Zeitabschnittsgrenzen existieren exakt einmal im richtigen Zeitfenster',()=>{
  const p=fixture(1,5);p.tasks[0].start='2027-12-31';p.tasks[0].end='2027-12-31';
  const {projection,layout}=prepare(p);
  const covered=layout.pages.filter(p=>parse('2027-12-31')>=parse(p.start)&&parse('2027-12-31')<=parse(p.end));
  assert.equal(new Set(covered.map(p=>p.timeIndex)).size,1);
  assert.equal(projection.rows.filter(r=>r.kind==='task').length,1);
});
test('14: Baseline/Marker erweitern den vollständigen Datumsbereich',()=>{
  const p=fixture(1);p.tasks[0].baselineStart='2023-12-01';p.planning.markers[0].date='2028-01-01';
  const x=createPrintProjection(p,{elements:{baselines:true,markers:true}});
  assert.equal(x.start,'2023-12-01');assert.equal(x.end,'2028-01-01');
});
test('15: dunkle Projektdesigns ändern Papierfarben und Geometrie nicht',()=>{
  const p=fixture(),a=prepare(p);p.design={colors:{pageBg:'#07141F',panelBg:'#172536'}};
  const b=prepare(p);
  assert.equal(a.layout.pages.length,b.layout.pages.length);
  assert.equal(renderPrintPage(a.projection,a.layout,a.layout.pages[0],a.options).replace(/Stand \d{2}\.\d{2}\.\d{4}/,''),
    renderPrintPage(b.projection,b.layout,b.layout.pages[0],b.options).replace(/Stand \d{2}\.\d{2}\.\d{4}/,''));
});
test('16: ein leeres Projekt enthält eine druckbare Leerseite',()=>{
  const p=fixture(0);p.planning.markers=[];
  const {projection,layout,options}=prepare(p);
  assert.equal(layout.pages.length,1);
  assert.match(renderPrintDocument(projection,layout,options),/Keine Aufgaben im gewählten Zeitraum/);
});
test('17: Snapshot bleibt bei Projektwechsel unverändert',()=>{
  const p=fixture(),a=createPrintProjection(p,{});
  p.name='Neue Ansicht';p.tasks[0].name='Geändert';p.tasks.push({name:'Neue Aufgabe'});
  assert.equal(a.projectName,'Prüfprojekt');assert.equal(a.taskCount,10);
  assert.ok(Object.isFrozen(a.rows[0]));
});
test('18: mehrfaches Rendern und Verwerfen mutiert Projekt und Revision nicht',()=>{
  const p=fixture(),before=JSON.stringify(p);
  for(let i=0;i<20;i++){const {projection,layout,options}=prepare(p);renderPrintPage(projection,layout,layout.pages[0],options);}
  assert.equal(JSON.stringify(p),before);assert.equal(p.revision,4);
});
test('19: Papierausgabe hat @page, SVG und echten Abschnittskopf',()=>{
  const {projection,layout,options}=prepare(fixture());
  const html=renderPrintDocument(projection,layout,options);
  assert.match(html,/@page\{size:297mm 210mm;margin:0\}/);
  assert.match(html,/<svg/);assert.match(html,/Abschnitt 1\//);
});
test('20: 200%-Zoom und geringe CSS-Breite ändern die Seitenausgabe nicht',()=>{
  const p=fixture(30,4),a=prepare(p,{}, {zoom:2,width:375}),b=prepare(p,{}, {zoom:1,width:1920});
  assert.deepEqual(a.layout.pages.map(x=>[x.start,x.end,x.rows.length]),b.layout.pages.map(x=>[x.start,x.end,x.rows.length]));
});
test('21: Zeitraum und gezielte Auswahl erzeugen erwartete Projektschnitte',()=>{
  const p=fixture(10),o={scope:'selected',taskIds:['task-0'],timeframe:'custom',startDate:'2024-01-01',endDate:'2024-02-01'};
  const x=createPrintProjection(p,o);
  assert.equal(x.taskCount,1);assert.equal(x.rows.filter(r=>r.kind==='task').length,1);
});
test('22: ungültiger Zeitraum darf keinen teilweisen Ausdruck liefern',()=>{
  assert.throws(()=>createPrintProjection(fixture(),{timeframe:'custom',startDate:'2030-01-01',endDate:'2020-01-01'}),/Ungültiger/);
});
test('23: manuelle Skalierung ist deterministisch',()=>{
  const p=fixture(4,3),small=prepare(p,{strategy:'manual',scale:70}).layout;
  const large=prepare(p,{strategy:'manual',scale:140}).layout;
  assert.ok(large.timePages>=small.timePages);
});
test('24: alle Papierkombinationen erzeugen nichtleere SVG-Seiten',()=>{
  for(const paper of ['A4','A3'])for(const orientation of ['portrait','landscape','auto']){
    const {projection,layout,options}=prepare(fixture(),{paper,orientation});
    assert.ok(layout.pages.length>=1);assert.match(renderPrintPage(projection,layout,layout.pages[0],options),/<svg/);
  }
});
