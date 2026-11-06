import test from 'node:test';
import assert from 'node:assert/strict';
import {PRINT_DEFAULTS,projectForPrint,paginatePrint} from '../assets/js/print/print-model.mjs';
import {createGanttChartSvg} from '../assets/js/print/print-export.mjs';
import {printHtml} from '../assets/js/print/print-ui.mjs';
import {resolveLabelConfig,barAnnotation,wrapAnnotation,planBarAnnotation} from '../assets/js/print/print-labels.mjs';

const sample=()=>({
 name:'Planung & Test',revision:4,
 labelConfig:{enabled:true,leaderLines:true,tracks:4,twoLine:true,ellipsis:true,maxWidth:180,placement:'auto',
  groups:{name:true,progress:true,owner:true,dates:true,phase:true,status:true,risk:true}},
 design:{colors:{workstream:'#276e86',milestone:'#aa7633'}},
 planning:{phases:[{id:'phase',name:'Umsetzung',start:'2026-06-01',end:'2026-08-31'}],
  markers:[{date:'2026-07-02',name:'Freigabe'}],holidays:[]},
 tasks:[
  {id:'first',name:'Arbeitspaket',phaseId:'phase',start:'2026-06-01',end:'2026-07-12',
   owner:'Projektleitung',type:'workstream',progress:75,status:'amber',risk:'high'},
  {id:'last',name:'Gate & Übergabe',phaseId:'phase',start:'2026-08-30',end:'2026-08-30',
   owner:'Lenkungskreis',type:'gate',progress:0,status:'red',risk:'critical',dependencies:['first']}
 ]
});

test('project labelConfig is copied into immutable projection and respected by chart',()=>{
 const source=sample(),copy=structuredClone(source);
 const projection=projectForPrint(source,{...PRINT_DEFAULTS,format:'png',dates:true});
 const chart=createGanttChartSvg(projection);
 assert.deepEqual(source,copy);
 assert.equal(Object.isFrozen(projection.labelConfig),true);
 assert.match(chart.svg,/class="gantt-export-label"/);
 assert.match(chart.svg,/data-task-id="first"/);
 assert.match(chart.svg,/data-task-id="last"/);
 assert.match(chart.svg,/Gate &amp; Übergabe/);
 assert.match(chart.svg,/75 %/);
 assert.match(chart.svg,/Hohes Risiko/);
 assert.match(chart.svg,/Risiko hoch/);
 assert.match(chart.svg,/Grün|Gelb/);
 assert.match(chart.svg,/Umsetzung/);
 assert.match(chart.svg,/Projektleitung/);
 assert.match(chart.svg,/marker-end="url\(#gantt-arrow\)"/);
});

test('label groups and project setting are explicit switches',()=>{
 const row={name:'Beispiel',progress:0,owner:'Team',start:'2026-06-01',end:'2026-06-05',
  type:'workstream',status:'red',risk:'critical'};
 const disabled=barAnnotation(row,PRINT_DEFAULTS,{enabled:false});
 assert.equal(disabled,'');
 const minimal=barAnnotation(row,PRINT_DEFAULTS,{groups:{name:true,progress:false,owner:false,dates:false,status:false,risk:false}});
 assert.equal(minimal,'Beispiel');
 const all=barAnnotation(row,{...PRINT_DEFAULTS,dates:true},{groups:{name:true,progress:true,owner:true,dates:true,status:true,risk:true}});
 assert.match(all,/0 %/);
 assert.match(all,/Rot/);
 assert.match(all,/Kritisches Risiko/);
 assert.match(all,/Team/);
 assert.match(all,/01\.06\.26/);
});

test('annotations never extend past diagram or task-row edges for short bars and end milestones',()=>{
 const config={maxWidth:240,tracks:4,leaderLines:true,twoLine:true,ellipsis:true};
 const cases=[
  {text:'Recht langer Meilensteinname am rechten Diagrammrand',barStart:390,barEnd:400,timelineWidth:400,rowHeight:70,isMilestone:true,trackIndex:0},
  {text:'Kurzer Vorgang 100 %',barStart:0,barEnd:5,timelineWidth:400,rowHeight:70,trackIndex:1},
  {text:'Eine sehr lange und breite Beschriftung, die aus dem Bild hinauslaufen könnte',barStart:175,barEnd:195,timelineWidth:400,rowHeight:72,trackIndex:2},
  {text:'Bearbeitung 45 %',barStart:60,barEnd:300,timelineWidth:400,rowHeight:70,trackIndex:3}
 ];
 for(const entry of cases){
  const place=planBarAnnotation({...entry,config});
  assert.ok(place);
  assert.ok(place.x>=8,JSON.stringify(place));
  assert.ok(place.x+place.width<=entry.timelineWidth-8+1,JSON.stringify(place));
  assert.ok(place.y>=0,JSON.stringify(place));
  assert.ok(place.y+place.height<=entry.rowHeight-1,JSON.stringify(place));
  assert.ok(['left','right','inside','above','below'].includes(place.mode));
  assert.ok(place.lines.length>0);
 }
 assert.ok(wrapAnnotation('Ein extrem langer Titel mit Abschnitten',80,{fontSize:12,twoLine:true,ellipsis:true}).length<=2);
});

test('long labels visibly ellipsize or allocate enough lines, never silently overflow',()=>{
 const text='Sehr langes Projektmanagement-Arbeitspaket mit internationalem Abstimmungsprozess und mehreren Beteiligten';
 const limited=wrapAnnotation(text,125,{fontSize:12,twoLine:true,ellipsis:true});
 assert.equal(limited.length,2);
 assert.match(limited.at(-1),/…$/);
 const full=wrapAnnotation(text,125,{fontSize:12,twoLine:true,ellipsis:false});
 assert.ok(full.length>2);
 assert.ok(full.join('').length>limited.join('').length);
});

test('PDF uses same source annotation policy while preserving readable task names',()=>{
 const projection=projectForPrint(sample(),{...PRINT_DEFAULTS,format:'pdf',dates:true});
 const layout=paginatePrint(projection);
 const html=printHtml(projection,layout);
 assert.match(html,/Gate &amp; Übergabe/);
 assert.match(html,/Hohes Risiko|Risiko: hoch/);
 assert.match(html,/Fortschritt: 75 %/);
 assert.match(html,/Projektleitung/);
 assert.match(html,/font-size="2\.2"/);
 assert.ok(layout.pageCount>0);
});

test('malformed label configuration is bounded and sanitized',()=>{
 const cfg=resolveLabelConfig({tracks:99,maxWidth:9999,placement:'other',groups:{progress:0}});
 assert.equal(cfg.tracks,4);
 assert.equal(cfg.maxWidth,480);
 assert.equal(cfg.placement,'auto');
 assert.equal(cfg.groups.progress,false);
});
