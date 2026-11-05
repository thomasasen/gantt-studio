const {test,expect}=require('@playwright/test');
const {pathToFileURL}=require('node:url');
const {resolve}=require('node:path');

const contractURL=pathToFileURL(resolve('assets/js/engine/engine-contract.mjs')).href;
const controllerURL=pathToFileURL(resolve('assets/js/engine/engine-controller.mjs')).href;

function stubEngine(log) {
  const caps=Object.freeze({id:'stub',zoom:Object.freeze(['day']),offline:true});
  return {
    mount(options){log.push(['mount',options.container]);},
    render(request){log.push(['render',request]);return {empty:false};},
    setViewport(v){log.push(['viewport',v]);},
    cancelInteraction(){log.push(['cancel']);},
    locateMarker(kind){return kind==='relative-target'?{x:88}:null;},
    focusTask(id){log.push(['focus',id]);return true;},
    destroy(){log.push(['destroy']);},
    getCapabilities(){return caps;}
  };
}

test('contract rejects missing lifecycle and mutable capability declarations',async()=>{
  const {assertEngineContract}=await import(contractURL);
  expect(()=>assertEngineContract({})).toThrow(/missing mount/);
  expect(()=>assertEngineContract({
    mount(){},render(){},setViewport(){},cancelInteraction(){},locateMarker(){},
    focusTask(){},destroy(){},getCapabilities(){return {taskMove:true};}
  })).toThrow(/frozen object/);
});

test('controller sends immutable independent project projections and emits intent only',async()=>{
  const {createEngineController}=await import(controllerURL);
  const log=[],controller=createEngineController(()=>stubEngine(log));
  const project={id:'p1',tasks:[{id:'t1',start:'2026-11-10',end:'2026-11-13'}]};
  const container={};
  controller.mount({container,onIntent:async()=>{}});
  const result=controller.render({project,view:{zoom:'day',reorderable:true}});
  expect(result.empty).toBe(false);
  const rendering=log.find(entry=>entry[0]==='render')[1];
  expect(rendering.project).not.toBe(project);
  expect(Object.isFrozen(rendering.project)).toBe(true);
  expect(Object.isFrozen(rendering.project.tasks[0])).toBe(true);
  expect(Object.isFrozen(rendering.view)).toBe(true);
  try { rendering.project.tasks[0].start='2026-11-11'; }
  catch(error) { expect(error).toBeInstanceOf(TypeError); }
  expect(rendering.project.tasks[0].start).toBe('2026-11-10');
  expect(project.tasks[0].start).toBe('2026-11-10');
  controller.setViewport({scrollLeft:42});
  expect(log.find(entry=>entry[0]==='viewport')[1]).toEqual({scrollLeft:42});
  expect(controller.locateMarker('relative-target')).toEqual({x:88});
  expect(controller.focusTask('t1')).toBe(true);
  controller.cancelInteraction();
  controller.destroy();
  controller.destroy();
  expect(log.filter(entry=>entry[0]==='destroy')).toHaveLength(1);
  expect(()=>controller.render({project,view:{zoom:'day'}})).toThrow(/mounted/);
});

test('native adapter uses contract, has honest capabilities and mounts repeatedly',async({page})=>{
  await page.goto('/');
  await page.locator('#loadDemoBtn').click();
  await expect(page.locator('#ganttStage .gantt-grid')).toBeVisible();
  await page.locator('[data-zoom="month"]').click();
  await expect(page.locator('#ganttStage .timeline-header')).toBeVisible();
  await page.locator('[data-zoom="day"]').click();
  expect(await page.locator('#ganttStage .gantt-bar').count()).toBeGreaterThanOrEqual(10);
});

test('controller switches adapters and restores old renderer after failed mount',async()=>{
  const {createEngineController}=await import(controllerURL);
  const first=[],second=[];
  const controller=createEngineController(()=>stubEngine(first));
  controller.mount({container:{},onIntent:async()=>{}});
  const project={id:'p',tasks:[]};
  controller.render({project,view:{zoom:'day',reorderable:false}});
  controller.switchEngine(()=>stubEngine(second));
  expect(first.filter(x=>x[0]==='destroy')).toHaveLength(1);
  expect(second.filter(x=>x[0]==='render')).toHaveLength(1);
  expect(second.find(x=>x[0]==='render')[1].project).not.toBe(project);
  const bad=()=>({
    ...stubEngine([]),mount(){throw new Error('Adapter mount failure');}
  });
  expect(()=>controller.switchEngine(bad)).toThrow('Adapter mount failure');
  expect(second.filter(x=>x[0]==='render')).toHaveLength(2);
  expect(controller.getCapabilities().id).toBe('stub');
  controller.destroy();
});

test('native mount/render/destroy can repeat without leftover grid DOM',async({page})=>{
  await page.goto('/');
  const state=await page.evaluate(async()=>{
    const {createNativeEngine}=await import('/assets/js/engine/native/native-adapter.mjs?v=2.8.0');
    const host=document.createElement('div');
    host.id='engine-probe-host';
    const stage=document.createElement('div');
    stage.id='engine-probe-stage';
    host.appendChild(stage);
    document.body.appendChild(host);
    const project={id:'probe',name:'Probe',tasks:[{
      id:'t',name:'One task',start:'2026-11-10',end:'2026-11-11',
      progress:15,showInGantt:true,type:'workstream'
    }],planning:{settings:{showToday:false},phases:[],markers:[],holidays:[]}};
    const engine=createNativeEngine();
    const iterations=[];
    for(let i=0;i<12;i++){
      engine.mount({container:stage,onIntent:async()=>{},onSelect:()=>{},onError:()=>{}});
      const result=engine.render({project,view:{zoom:'day',reorderable:true}});
      iterations.push({empty:result.empty,rows:stage.querySelectorAll('.task-row-left').length});
      engine.destroy();
      iterations[i].remaining=stage.children.length;
    }
    host.remove();
    return iterations;
  });
  expect(state).toHaveLength(12);
  expect(state.every(s=>!s.empty&&s.rows===1&&s.remaining===0)).toBe(true);
});

test('native engine remains operable at 200% CSS zoom',async({page})=>{
  await page.goto('/');
  await page.locator('#loadDemoBtn').click();
  await expect(page.locator('#taskTableBody tr[data-task-row-id]')).toHaveCount(10);
  await page.evaluate(()=>{document.documentElement.style.zoom='200%';});
  await expect(page.locator('#ganttStage .gantt-grid')).toBeVisible();
  expect(await page.locator('#ganttStage .gantt-bar').count()).toBeGreaterThanOrEqual(10);
  const rows=page.locator('#ganttStage .task-row-left[data-task-id]');
  const ids=await rows.evaluateAll(elements=>elements.map(element=>element.dataset.taskId));
  const grip=page.locator('#ganttStage [data-gantt-order-handle][data-task-id="'+ids[1]+'"]');
  await grip.focus();
  await page.keyboard.press('ArrowUp');
  await expect(rows.first()).toHaveAttribute('data-task-id',ids[1]);
  await expect(page.locator('#taskTableBody tr[data-task-row-id]').first())
    .toHaveAttribute('data-task-row-id',ids[1]);
  await page.screenshot({path:'visual-review/native-zoom-200.png',fullPage:true});
});
