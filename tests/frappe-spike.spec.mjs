import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {assertEngineContract, immutableEngineProjection} from '../assets/js/engine/engine-contract.mjs';
import {createFrappeEngine} from '../assets/js/engine/frappe/frappe-adapter.mjs';
import {mapProjectToFrappeTasks, mapFrappeDateChange} from '../assets/js/engine/frappe/frappe-task-mapper.mjs';
import {sortedProjectTasks} from '../assets/js/task-order.mjs';

const root = new URL('../examples/demo.gantt.json', import.meta.url);
const demo = JSON.parse(readFileSync(root, 'utf8')).project;

test('pure mapper keeps dates, task order, dependencies and input unchanged', () => {
  const original = structuredClone(demo);
  const project = {...demo, tasks: sortedProjectTasks(demo, 'manual')};
  const mapped = mapProjectToFrappeTasks(immutableEngineProjection(project));
  assert.deepEqual(demo, original);
  assert.equal(mapped.length, demo.tasks.length);
  assert.deepEqual(mapped.map(t => t.id), project.tasks.map(t => t.id));
  for(const task of mapped) {
    const source = demo.tasks.find(t => String(t.id) === task.id);
    assert.equal(task.start, source.start);
    assert.equal(task.end, source.end);
    assert.equal(task.progress, source.progress);
    assert.deepEqual(task.dependencies, source.dependencies);
    assert.notEqual(task, source);
  }
});

test('hidden tasks, synthetic phase summaries and invisible dependencies are not passed to Frappe', () => {
  const tasks = [
    {id: 'phase', syntheticPhase: true, start:'2026-06-01', end:'2026-06-20'},
    {id: 'visible', name:'V', start:'2026-06-01',end:'2026-06-02',dependencies:['hidden','other']},
    {id: 'hidden', name:'H',start:'2026-06-01',end:'2026-06-02',showInGantt:false},
    {id: 'other', name:'O',start:'2026-06-03',end:'2026-06-05'}
  ];
  const result=mapProjectToFrappeTasks({tasks});
  assert.deepEqual(result.map(t=>t.id), ['visible','other']);
  assert.deepEqual(result[0].dependencies, ['other']);
});

test('rejects invalid and duplicate date-only project tasks', () => {
  for (const end of ['2026-02-29','2026-01-00','2026-01-32','2025-12-31']) {
    assert.throws(()=>mapProjectToFrappeTasks({tasks:[{id:'x',start:'2026-01-01',end}]}));
  }
  assert.throws(()=>mapProjectToFrappeTasks({tasks:[
    {id:'x',start:'2026-01-01',end:'2026-01-02'},
    {id:'x',start:'2026-01-03',end:'2026-01-04'}
  ]}));
});

test('Frappe callback date mapping retains local final date at 23:59:59', () => {
  const change = mapFrappeDateChange('abc',new Date(2026,2,29,0,0,0),
    new Date(2026,2,30,23,59,59));
  assert.deepEqual(change,{id:'abc',start:'2026-03-29',end:'2026-03-30'});
  assert.throws(()=>mapFrappeDateChange('abc',new Date('invalid'),new Date()));
});

test('calendar-only conversion survives DST and non-European timezones', () => {
  const code = [
    "import {mapFrappeDateChange} from " + JSON.stringify(fileURLToPath(new URL('../assets/js/engine/frappe/frappe-task-mapper.mjs', import.meta.url))) + ";",
    "const result=mapFrappeDateChange('t',new Date(2026,2,29,0,0,0),new Date(2026,2,29,23,59,59));",
    "if(result.start!=='2026-03-29'||result.end!=='2026-03-29')process.exit(5);"
  ].join('\n');
  for (const TZ of ['Europe/Berlin','America/New_York','Pacific/Auckland']) {
    const result=spawnSync(process.execPath,['--input-type=module','-e',code],
      {env:{...process.env,TZ},encoding:'utf8'});
    assert.equal(result.status,0,TZ+': '+result.stderr);
  }
});


test('isolated adapter obeys engine contract and explicitly forbids edits',async()=>{
  const {createFrappeEngine}=await import('../assets/js/engine/frappe/frappe-adapter.mjs');
  const engine=assertEngineContract(createFrappeEngine());
  const caps=engine.getCapabilities();
  for(const key of ['taskMove','resizeStart','resizeEnd','progress','reorder',
    'keyboardReorder','phaseRows'])assert.equal(caps[key],false,key);
  assert.equal(caps.offline,true);
  assert.equal(caps.asyncRendering,true);
  assert.equal(caps.zoom.length,3);
});
