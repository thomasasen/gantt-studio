const {test,expect}=require('@playwright/test');

async function projects(page) {
  await page.goto('/');
  await page.locator('#loadDemoBtn').click();
  await expect(page.locator('#taskTableBody tr[data-task-row-id]')).toHaveCount(10);
  const demo=await page.locator('#projectSelect').inputValue();
  const tasks=await page.evaluate(async id=>{
    const {loadProject}=await import('/assets/js/storage.js?v=2.8.0');
    return (await loadProject(id)).tasks;
  },demo);
  expect(tasks).toHaveLength(10);
  page.once('dialog',dialog=>dialog.accept('Empty race target'));
  await page.locator('#newProjectBtn').click();
  await expect(page.locator('#taskTableBody tr[data-task-row-id]')).toHaveCount(0);
  const empty=await page.locator('#projectSelect').inputValue();
  expect(empty).not.toBe(demo);
  return {demo,empty,tasks};
}
async function active(page,id,count) {
  await expect(page.locator('#projectSelect')).toHaveValue(id);
  await expect(page.locator('#taskTableBody tr[data-task-row-id]')).toHaveCount(count);
  await expect.poll(()=>page.evaluate(
    ()=>localStorage.getItem('gantt-studio.active-project'))).toBe(id);
}
async function readTasks(page,id) {
  return page.evaluate(async projectId=>{
    const {loadProject}=await import('/assets/js/storage.js?v=2.8.0');
    return (await loadProject(projectId))?.tasks;
  },id);
}

test('rapid empty/demo/empty/demo activation keeps persisted selection and Native view in sync',async({page})=>{
  const {demo,empty,tasks}=await projects(page);
  await page.evaluate(({demo,empty})=>{
    const select=document.querySelector('#projectSelect');
    for(const id of [demo,empty,demo,empty,demo]){
      select.value=id;
      select.dispatchEvent(new Event('change',{bubbles:true}));
    }
  },{demo,empty});
  await active(page,demo,10);
  await expect(page.locator('#ganttStage .gantt-bar.workstream').first()).toBeVisible();
  expect(await readTasks(page,demo)).toEqual(tasks);
  expect(await readTasks(page,empty)).toEqual([]);
});

test('held IndexedDB read cannot overtake a newer project selection',async({page})=>{
  const {demo,empty,tasks}=await projects(page);
  await page.evaluate(id=>{
    const get=IDBObjectStore.prototype.get,waiting=[];
    window.__projectReadGate={
      waiting, enabled:true,
      release(){this.enabled=false;for(const resolve of waiting.splice(0))resolve();}
    };
    IDBObjectStore.prototype.get=function(key){
      const request=get.call(this,key);
      if(this.transaction.mode!=='readonly'||String(key)!==id||!window.__projectReadGate.enabled)return request;
      return new Proxy(request,{
        get(target,property){return Reflect.get(target,property,target);},
        set(target,property,value){
          if(property==='onsuccess'){
            target.onsuccess=event=>waiting.push(()=>value(event));
            return true;
          }
          return Reflect.set(target,property,value,target);
        }
      });
    };
  },demo);
  await page.locator('#projectSelect').selectOption(demo);
  await page.waitForFunction(()=>window.__projectReadGate.waiting.length>0);
  await page.locator('#projectSelect').selectOption(empty);
  await active(page,empty,0);
  await page.evaluate(()=>window.__projectReadGate.release());
  await active(page,empty,0);
  expect(await readTasks(page,demo)).toEqual(tasks);
  expect(await readTasks(page,empty)).toEqual([]);
});

test('project load failure restores the selected project and retry succeeds',async({page})=>{
  const {demo,empty,tasks}=await projects(page);
  await page.evaluate(id=>{
    const get=IDBObjectStore.prototype.get;
    let fail=true;
    IDBObjectStore.prototype.get=function(key){
      if(fail&&this.transaction.mode==='readonly'&&String(key)===id){
        fail=false;
        throw new DOMException('Simulated project read error','AbortError');
      }
      return get.call(this,key);
    };
  },demo);
  await page.locator('#projectSelect').selectOption(demo);
  await expect(page.locator('#toast')).toContainText('Projektwechsel fehlgeschlagen');
  await active(page,empty,0);
  await page.locator('#projectSelect').selectOption(demo);
  await active(page,demo,10);
  await expect(page.locator('#ganttStage .gantt-bar.workstream').first()).toBeVisible();
  expect(await readTasks(page,demo)).toEqual(tasks);
});

test('project switching and page reload restore the exact ten-task project',async({page})=>{
  const {demo,empty,tasks}=await projects(page);
  await page.locator('#projectSelect').selectOption(demo);
  await active(page,demo,10);
  await page.reload();
  await active(page,demo,10);
  await expect(page.locator('#ganttStage .gantt-bar.workstream').first()).toBeVisible();
  await page.locator('#projectSelect').selectOption(empty);
  await active(page,empty,0);
  await page.reload();
  await active(page,empty,0);
  expect(await readTasks(page,demo)).toEqual(tasks);
});
