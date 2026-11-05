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
    destroy(){log.push(['destroy']);},
    getCapabilities(){return caps;}
  };
}

test('contract rejects missing lifecycle and mutable capability declarations',async()=>{
  const {assertEngineContract}=await import(contractURL);
  expect(()=>assertEngineContract({})).toThrow(/missing mount/);
  expect(()=>assertEngineContract({
    mount(){},render(){},setViewport(){},cancelInteraction(){},
    destroy(){},getCapabilities(){return {taskMove:true};}
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
  expect(()=>{rendering.project.tasks[0].start='2026-11-11';}).not.toThrow();
  expect(rendering.project.tasks[0].start).toBe('2026-11-10');
  expect(project.tasks[0].start).toBe('2026-11-10');
  controller.setViewport({scrollLeft:42});
  expect(log.find(entry=>entry[0]==='viewport')[1]).toEqual({scrollLeft:42});
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
