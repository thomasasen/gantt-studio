const {test,expect}=require('@playwright/test');
async function setup(page,editable=true){
 await page.goto('/spikes/dhtmlx/index.html'+(editable?'?edit=1':''));
 await expect(page.locator('#status')).toContainText('gerendert');
 await expect(page.locator('.gantt_task_line[task_id="demo-core"]')).toBeVisible();
 return page.locator('.gantt_task_line[task_id="demo-core"]');
}
async function drag(page,bar,kind,delta,options={}){
 await bar.scrollIntoViewIfNeeded();
 await expect(bar).toBeInViewport();
 const handles={
   left:'.gantt_task_drag.task_start_date',
   right:'.gantt_task_drag.task_end_date',
   progress:'.gantt_task_progress_drag'
 };
 // Target the actual documented DHTMLX drag handle. Center-of-bar
 // movement is NOT evidence for progress or edge resizing.
 let target=bar;
 if(Object.hasOwn(handles,kind)){
   await bar.hover();
   target=bar.locator(handles[kind]);
   await expect(target,'Specific '+kind+' handle must be rendered and visible').toBeVisible();
 }
 const b=await target.boundingBox();expect(b).toBeTruthy();
 const x=kind==='move'?b.x+b.width*.6:b.x+b.width/2;
 const y=b.y+b.height/2;
 const traceBefore=await page.evaluate(()=>window.__dhtmlxTrace());
 await page.mouse.move(x,y);await page.mouse.down();
 await page.mouse.move(x+delta,y,{steps:10});
 const moving=await page.evaluate(()=>window.__dhtmlxTrace());
 expect(moving.some(e=>e.type==='onBeforeTaskDrag'),'DHTMLX must receive a physical drag start').toBe(true);
 expect(moving.some(e=>e.type==='onTaskDrag'),'DHTMLX must report an actual drag preview').toBe(true);
 expect(await page.evaluate(()=>window.__dhtmlxTestIntents.length),'No early commit').toBe(0);
 if(options.cancel)await page.keyboard.press('Escape');
 else if(options.pointercancel)await page.evaluate(()=>window.dispatchEvent(new PointerEvent('pointercancel',{pointerId:1,bubbles:true})));
 else if(options.rerender)await page.evaluate(()=>document.getElementById('reloadBtn').click());
 await page.mouse.up();
 return {traceBefore,moving,after:await page.evaluate(()=>window.__dhtmlxTrace())};
}
for(const [kind,delta] of [['move',75],['left',-42],['right',42],['progress',25]]){
 test('real DHTMLX '+kind+' gesture: one validated RAM-only intent',async({page})=>{
   const bar=await setup(page);
   const old=await page.evaluate(()=>window.__dhtmlxMemoryStore.snapshot().tasks.find(t=>t.id==='demo-core'));
   const e=await drag(page,bar,kind,delta);
   await expect.poll(()=>page.evaluate(()=>window.__dhtmlxTestIntents.length)).toBe(1);
   const result=await page.evaluate(()=>({intents:window.__dhtmlxTestIntents,commits:window.__dhtmlxCommits,after:window.__dhtmlxMemoryStore.snapshot().tasks.find(t=>t.id==='demo-core')}));
   expect(result.commits).toHaveLength(1);
   expect(result.commits[0].result.ok).toBe(true);
   expect(result.after.revision).toBeUndefined();
   const expectedMode={left:'resize',right:'resize',move:'move',progress:'progress'}[kind];
   expect(e.moving.filter(t=>t.type==='onBeforeTaskDrag').at(-1)?.mode,
     'Physical gesture must use the actual DHTMLX '+expectedMode+' mode').toBe(expectedMode);
   expect(e.after.filter(t=>t.type==='onBeforeTaskChanged').at(-1)?.mode).toBe(expectedMode);
   const changed=['start','end','progress'].filter(k=>result.after[k]!==old[k]);
   const expectedFields={left:['start'],right:['end'],move:['start','end'],progress:['progress']}[kind];
   expect(changed,'Only the requested field(s) may change').toEqual(expectedFields);
   // DHTMLX 10.0.3 omits onAfterTaskDrag when onBeforeTaskChanged returns false.
   expect(e.after.some(t=>t.type==='onAfterTaskDrag')).toBe(false);
   expect(await page.evaluate(()=>indexedDB.databases())).toEqual([]);
 });
}
test('default readonly does not emit an intent',async({page})=>{
 const bar=await setup(page,false);
 await bar.scrollIntoViewIfNeeded();const b=await bar.boundingBox();
 await page.mouse.move(b.x+b.width*.5,b.y+b.height/2);await page.mouse.down();
 await page.mouse.move(b.x+b.width*.5+65,b.y+b.height/2,{steps:8});await page.mouse.up();
 expect(await page.evaluate(()=>window.__dhtmlxTestIntents.length)).toBe(0);
 expect(await page.evaluate(()=>indexedDB.databases())).toEqual([]);
});
for(const opt of [{cancel:true},{pointercancel:true},{rerender:true}]){
 test('abort DHTMLX gesture '+Object.keys(opt)[0]+' without any intent',async({page})=>{
   const bar=await setup(page);
   await drag(page,bar,'move',75,opt);
   expect(await page.evaluate(()=>window.__dhtmlxTestIntents.length)).toBe(0);
   expect(await page.evaluate(()=>indexedDB.databases())).toEqual([]);
 });
}
test('project switch during gesture discards stale state',async({page})=>{
 const bar=await setup(page);
 await bar.scrollIntoViewIfNeeded();
 const b=await bar.boundingBox(),x=b.x+b.width*.6,y=b.y+b.height/2;
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+65,y,{steps:8});
 await page.evaluate(()=>window.__dhtmlxSwitchProject());await page.mouse.up();
 expect(await page.evaluate(()=>window.__dhtmlxTestIntents.length)).toBe(0);
 expect(await page.evaluate(()=>window.__dhtmlxMemoryStore.snapshot().id)).toBe('dhtmlx-second-project');
});
test('zoom and fresh instance repeatedly tear down without duplicate intents',async({page})=>{
 await setup(page);
 for(const zoom of ['day','month','week','day','week']){
   await page.selectOption('#viewMode',zoom);
   await expect(page.locator('.gantt_task_line[task_id="demo-core"]')).toBeVisible();
 }
 await page.locator('#reloadBtn').click();
 await expect(page.locator('.gantt_task_line[task_id="demo-core"]')).toBeVisible();
 expect(await page.evaluate(()=>window.__dhtmlxTestIntents.length)).toBe(0);
});

test('physical click with no movement cannot commit',async({page})=>{
 const bar=await setup(page);
 await bar.scrollIntoViewIfNeeded();
 const b=await bar.boundingBox();expect(b).toBeTruthy();
 await page.mouse.move(b.x+b.width*.55,b.y+b.height/2);
 await page.mouse.down();await page.mouse.up();
 expect(await page.evaluate(()=>window.__dhtmlxTestIntents.length)).toBe(0);
 expect(await page.evaluate(()=>indexedDB.databases())).toEqual([]);
});

test('physical release outside the original task bar commits at most once',async({page})=>{
 const bar=await setup(page);
 await bar.scrollIntoViewIfNeeded();await expect(bar).toBeInViewport();
 const b=await bar.boundingBox();expect(b).toBeTruthy();
 const x=b.x+b.width/2,y=b.y+b.height/2;
 await page.mouse.move(x,y);await page.mouse.down();
 await page.mouse.move(b.x+b.width+30,y,{steps:15});
 const moving=await page.evaluate(()=>window.__dhtmlxTrace());
 expect(moving.some(e=>e.type==='onTaskDrag'&&e.mode==='move')).toBe(true);
 expect(await page.evaluate(()=>window.__dhtmlxTestIntents.length)).toBe(0);
 await page.mouse.up();
 await expect.poll(()=>page.evaluate(()=>window.__dhtmlxTestIntents.length)).toBe(1);
 expect(await page.evaluate(()=>window.__dhtmlxCommits[0].result.ok)).toBe(true);
 expect(await page.evaluate(()=>indexedDB.databases())).toEqual([]);
});

test('destroy during real drag cancels gesture and removes all DHTMLX nodes',async({page})=>{
 const bar=await setup(page);
 await bar.scrollIntoViewIfNeeded();const b=await bar.boundingBox();
 const x=b.x+b.width*.6,y=b.y+b.height/2;
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+65,y,{steps:8});
 const moving=await page.evaluate(()=>window.__dhtmlxTrace());
 expect(moving.some(e=>e.type==='onTaskDrag')).toBe(true);
 await page.evaluate(()=>window.__dhtmlxDestroy());
 await page.mouse.up();
 expect(await page.evaluate(()=>window.__dhtmlxTestIntents.length)).toBe(0);
 expect(await page.locator('#dhtmlxRoot').evaluate(node=>node.children.length)).toBe(0);
 expect(await page.evaluate(()=>indexedDB.databases())).toEqual([]);
});

test('physical browser focus loss cancels in-flight task drag',async({page,context})=>{
 const bar=await setup(page);
 await bar.scrollIntoViewIfNeeded();const b=await bar.boundingBox();
 const x=b.x+b.width*.6,y=b.y+b.height/2;
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+65,y,{steps:8});
 expect((await page.evaluate(()=>window.__dhtmlxTrace())).some(e=>e.type==='onTaskDrag')).toBe(true);
 const other=await context.newPage();await other.goto('about:blank');await other.bringToFront();
 await expect.poll(()=>page.evaluate(()=>window.__dhtmlxTrace().some(e=>e.type==='cancel'&&e.reason==='focus-lost'))).toBe(true);
 await page.mouse.up();await other.close();
 expect(await page.evaluate(()=>window.__dhtmlxTestIntents.length)).toBe(0);
 expect(await page.evaluate(()=>indexedDB.databases())).toEqual([]);
});

test('two physical sequential drags have exactly two commits and reject replay',async({page})=>{
 let bar=await setup(page);
 await drag(page,bar,'move',70);
 await expect.poll(()=>page.evaluate(()=>window.__dhtmlxCommits.length)).toBe(1);
 bar=page.locator('.gantt_task_line[task_id="demo-core"]');
 await drag(page,bar,'move',-50);
 await expect.poll(()=>page.evaluate(()=>window.__dhtmlxCommits.length)).toBe(2);
 const result=await page.evaluate(()=>{
  const before=window.__dhtmlxMemoryStore.snapshot();
  const duplicate=window.__dhtmlxMemoryStore.commit(window.__dhtmlxCommits[0].intent);
  const after=window.__dhtmlxMemoryStore.snapshot();
  return {revision:after.revision,duplicate,unchanged:JSON.stringify(before)===JSON.stringify(after),
    commits:window.__dhtmlxCommits.map(c=>c.result)};
 });
 expect(result.revision).toBe(3);
 expect(result.commits.every(c=>c.ok)).toBe(true);
 expect(result.duplicate.ok).toBe(false);
 expect(result.unchanged).toBe(true);
 expect(await page.evaluate(()=>indexedDB.databases())).toEqual([]);
});

test('second simultaneous browser pointer aborts first drag',async({page})=>{
 const bar=await setup(page);
 await bar.scrollIntoViewIfNeeded();const b=await bar.boundingBox();
 const x=b.x+b.width*.6,y=b.y+b.height/2;
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+50,y,{steps:7});
 expect((await page.evaluate(()=>window.__dhtmlxTrace())).some(e=>e.type==='onTaskDrag')).toBe(true);
 const session=await page.context().newCDPSession(page);
 try{
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x+22,y:y+32,id:17}]});
  await expect.poll(()=>page.evaluate(()=>window.__dhtmlxTrace().some(e=>e.type==='cancel'&&e.reason==='second-pointer'))).toBe(true);
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.mouse.up();
  expect(await page.evaluate(()=>window.__dhtmlxTestIntents.length)).toBe(0);
  expect(await page.evaluate(()=>indexedDB.databases())).toEqual([]);
 }finally{await session.detach();}
});

test('read-only DHTMLX renders across responsive widths, CSS zoom and reduced motion',async({page})=>{
 await setup(page,false);
 for(const width of [390,768,1024,1440]){
  await page.setViewportSize({width,height:900});
  await expect(page.locator('#dhtmlxRoot .gantt_container')).toBeVisible();
  await expect(page.locator('#nativeRoot')).toBeVisible();
 }
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.evaluate(()=>{document.body.style.zoom='200%';document.getElementById('reloadBtn').click();});
 await expect(page.locator('#dhtmlxRoot .gantt_container')).toBeVisible();
 expect(await page.evaluate(()=>window.__dhtmlxTestIntents.length)).toBe(0);
 expect(await page.evaluate(()=>indexedDB.databases())).toEqual([]);
});

test('Escape restores visible vendor task geometry before physical pointer-up',async({page})=>{
 const bar=await setup(page);
 await bar.scrollIntoViewIfNeeded();const original=await bar.boundingBox();
 expect(original).toBeTruthy();
 const x=original.x+original.width*.6,y=original.y+original.height/2;
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+80,y,{steps:10});
 expect((await page.evaluate(()=>window.__dhtmlxTrace())).some(e=>e.type==='onTaskDrag')).toBe(true);
 const preview=await bar.boundingBox();
 expect(Math.abs(preview.x-original.x),'Physical drag must visibly move the vendor bar').toBeGreaterThan(5);
 await page.keyboard.press('Escape');
 await expect.poll(()=>page.evaluate(()=>window.__dhtmlxTrace().some(e=>e.type==='rollback-render'&&e.reason==='escape'))).toBe(true);
 const restored=await page.locator('.gantt_task_line[task_id="demo-core"]').boundingBox();
 expect(restored).toBeTruthy();
 expect(Math.abs(restored.x-original.x),'Escape must restore the original date geometry').toBeLessThan(3);
 await page.mouse.up();
 expect(await page.evaluate(()=>window.__dhtmlxTestIntents.length)).toBe(0);
 expect(await page.evaluate(()=>indexedDB.databases())).toEqual([]);
});
