import test from 'node:test';
import assert from 'node:assert/strict';
import {projectForPrint,PRINT_DEFAULTS} from '../assets/js/print/print-model.mjs';
import {createGanttChartSvg} from '../assets/js/print/print-export.mjs';

const sample=()=>({
  name:'Komplettes Projekt & Mehr',
  revision:7,
  design:{colors:{workstream:'#287f8a',milestone:'#95732c'}},
  planning:{phases:[],markers:[{date:'2026-07-01',name:'Gate'}],holidays:[]},
  tasks:[
    {id:'first',name:'Anfang & <Plan>',start:'2026-01-02',end:'2026-01-15',type:'task',progress:50,owner:'Team A'},
    {id:'last',name:'Abschluss im Dezember',start:'2026-12-01',end:'2026-12-18',type:'task',progress:0,dependencies:['first'],owner:'Team B'}
  ]
});

test('entire project timeline is in one SVG with both end tasks',()=>{
  const projection=projectForPrint(sample(),{...PRINT_DEFAULTS,format:'png',scope:'all',range:'full'});
  const chart=createGanttChartSvg(projection);
  assert.match(chart.svg,/Anfang &amp; &lt;Plan&gt;/);
  assert.match(chart.svg,/Abschluss im Dezember/);
  assert.match(chart.svg,/01\.2026/);
  assert.match(chart.svg,/12\.2026/);
  assert.match(chart.svg,/marker-end="url\(#gantt-arrow\)"/);
  assert.match(chart.svg,/Gantt-Diagramm/);
  assert.equal(chart.rows,2);
  assert.ok(chart.width>1600);
  assert.ok(chart.height>150);
  assert.equal((chart.svg.match(/<svg /g)||[]).length,1);
  assert.ok(!chart.svg.includes('<foreignObject'));
  assert.ok(!chart.svg.includes('Anfang & <Plan>'));
});

test('selected scope changes the complete chart without affecting project',()=>{
  const source=sample(),original=structuredClone(source);
  const projection=projectForPrint(source,{...PRINT_DEFAULTS,scope:'selected',selectedTaskIds:['last'],format:'jpg'});
  const chart=createGanttChartSvg(projection);
  assert.equal(chart.rows,1);
  assert.ok(!chart.svg.includes('Anfang &amp; &lt;Plan&gt;'));
  assert.match(chart.svg,/Abschluss im Dezember/);
  assert.deepEqual(source,original);
});

test('chart creates no print page breaks or ZIP and reports invalid ranges',()=>{
  const chart=createGanttChartSvg(projectForPrint(sample(),PRINT_DEFAULTS));
  assert.ok(!chart.svg.includes('class="sheet"'));
  assert.ok(!chart.svg.includes('page-break'));
  assert.throws(()=>createGanttChartSvg({settings:PRINT_DEFAULTS,rows:[],from:'2026-12-01',to:'2026-01-01'}),/Zeitraum/);
});
