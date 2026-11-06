import test from 'node:test';
import assert from 'node:assert/strict';
import {projectForPrint,paginatePrint,sanitizePrintSettings,days,add} from '../assets/js/print/print-model.mjs';

const task=(i,start,end,extras={})=>({id:'task-'+i,name:'Aufgabe '+i,start,end,showInGantt:true,displayOrder:i,...extras});
const project=(items)=>({id:'p',name:'Großer Projektplan',revision:3,
  tasks:items,planning:{phases:[],markers:[],holidays:[]}});
function assertCoverage(projection,layout) {
  assert.equal(layout.pageCount,layout.horizontal*layout.vertical);
  for(let y=1;y<=layout.vertical;y++) {
    const band=layout.pages.filter(page=>page.y===y).sort((a,b)=>a.x-b.x);
    assert.equal(band[0].from,projection.from);
    assert.equal(band.at(-1).to,projection.to);
    for(let i=1;i<band.length;i++)assert.equal(band[i].from,add(band[i-1].to,1));
    assert.equal(band[0].rowHeights.length,band[0].rows.length);
    assert.ok(band[0].rowHeights.every(height=>height>=6));
  }
  const byVertical=layout.pages.filter(page=>page.x===1).flatMap(page=>page.rows.map(r=>r.id));
  assert.deepEqual(byVertical,projection.rows.map(r=>r.id));
}
test('projects are isolated, do not mutate revision, and include off-screen rows',()=>{
  const original=project(Array.from({length:75},(_,i)=>task(i,'2026-01-01','2028-12-31')));
  const before=JSON.stringify(original);
  const projected=projectForPrint(original,{scope:'all'},{filteredTaskIds:['task-1']});
  assert.equal(projected.rows.length,75);
  assert.equal(JSON.stringify(original),before);
  original.tasks[0].name='Changed outside snapshot';
  assert.equal(projected.rows[0].name,'Aufgabe 0');
  assert.equal(projected.revision,3);
  assert.equal(Object.isFrozen(projected.rows[0]),true);
  assert.equal(Object.isFrozen(projected.rows),true);
});
test('multi-year and many rows paginate in both axes without gaps',()=>{
  const p=project(Array.from({length:135},(_,i)=>task(i,'2023-01-01','2028-12-31')));
  for(const paper of ['A4','A3'])for(const orientation of ['portrait','landscape','auto']){
    const projected=projectForPrint(p,{paper,orientation,strategy:'readable'});
    const layout=paginatePrint(projected);
    assert.ok(layout.horizontal>1);assert.ok(layout.vertical>1);
    assertCoverage(projected,layout);
  }
});
test('fit width repeats all task bands, one-page falls back when illegible',()=>{
  const projected=projectForPrint(project(Array.from({length:95},(_,i)=>task(i,'2020-01-01','2029-12-31'))),{strategy:'fitWidth'});
  const fit=paginatePrint(projected);assert.equal(fit.horizontal,1);assert.ok(fit.vertical>1);assertCoverage(projected,fit);
  const dense=paginatePrint(projectForPrint(project(Array.from({length:95},(_,i)=>task(i,'2020-01-01','2029-12-31'))),{strategy:'one'}));
  assert.ok(dense.warnings.length);assert.ok(dense.vertical>1);
});
test('filtered, milestone-only, date range, and hidden tasks behave independently',()=>{
  const p=project([
    task(1,'2026-01-01','2026-01-05'),
    task(2,'2026-03-01','2026-03-05',{type:'milestone'}),
    task(3,'2026-04-01','2026-04-05',{showInGantt:false})
  ]);
  assert.deepEqual(projectForPrint(p,{scope:'filtered'},{filteredTaskIds:['task-1','task-3']}).rows.map(r=>r.id),['task-1']);
  assert.deepEqual(projectForPrint(p,{scope:'milestones'}).rows.map(r=>r.id),['task-2']);
  const range=projectForPrint(p,{range:'custom',from:'2026-03-01',to:'2026-03-31'});
  assert.deepEqual(range.rows.map(r=>r.id),['task-2']);
});
test('sanitizes hostile preference values and rejects invalid ISO dates',()=>{
  const s=sanitizePrintSettings({paper:'A0',margin:-8,scale:900,profile:'unknown',fontSize:1});
  assert.equal(s.paper,'A4');assert.equal(s.margin,5);assert.equal(s.scale,200);assert.equal(s.fontSize,7);
  assert.equal(days('2026-01-01','2026-01-31'),30);
});

test('selected phases, tasks and collapsed phase decisions do not depend on viewport',()=>{
 const p=project([task(1,'2026-01-01','2026-01-04',{phaseId:'phase-A'}),task(2,'2026-02-01','2026-02-04',{phaseId:'phase-B'})]);
 p.planning.phases=[{id:'phase-A',name:'Konzeption',start:'2026-01-01',end:'2026-01-04'},{id:'phase-B',name:'Umsetzung',start:'2026-02-01',end:'2026-02-04'}];
 const a=projectForPrint(p,{scope:'phases',selectedPhaseIds:['phase-B']});
 assert.equal(a.rows.some(row=>row.id==='task-1'),false);
 assert.equal(a.rows.some(row=>row.id==='task-2'),true);
 const b=projectForPrint(p,{scope:'selected',selectedTaskIds:['task-1'],expandCollapsed:false},{collapsedPhaseIds:['phase-A']});
 assert.equal(b.rows.some(row=>row.id==='task-1'),false);
 const c=projectForPrint(p,{scope:'selected',selectedTaskIds:['task-1'],expandCollapsed:true},{collapsedPhaseIds:['phase-A']});
 assert.equal(c.rows.some(row=>row.id==='task-1'),true);
});
