const {test,expect}=require('@playwright/test');

test('manual reorder by pointer persists, synchronizes Gantt and preserves planning data',async({page})=>{
  await page.goto('/');
  await page.locator('#loadDemoBtn').click();
  await expect(page.locator('#taskTableBody tr[data-task-row-id]')).toHaveCount(10);
  const before=await page.evaluate(async()=>{
    const selected=document.querySelector('#projectSelect').value;
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('gantt-studio');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    return await new Promise((resolve,reject)=>{const r=db.transaction('projects','readonly').objectStore('projects').get(selected);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  });
  const originalRows=await page.locator('#taskTableBody tr[data-task-row-id]').evaluateAll(rows=>rows.map(row=>({id:row.dataset.taskRowId,phase:row.dataset.taskPhaseId})));
  const a=originalRows.find((v,i)=>i+1<originalRows.length && originalRows[i+1].phase===v.phase);
  const i=originalRows.findIndex(v=>v.id===a.id);
  const b=originalRows[i+1];
  const grip=page.locator(`#taskTableBody tr[data-task-row-id="${a.id}"] .task-drag-handle`);
  const target=page.locator(`#taskTableBody tr[data-task-row-id="${b.id}"]`);
  const from=await grip.boundingBox(),to=await target.boundingBox();
  await page.mouse.move(from.x+from.width/2,from.y+from.height/2);
  await page.mouse.down();
  await page.mouse.move(to.x+55,to.y+to.height*.83,{steps:8});
  await expect(target).toHaveClass(/task-drop-after/);
  await page.mouse.up();
  await expect(page.locator('#taskReorderStatus')).toContainText('gespeichert');
  const rows=await page.locator('#taskTableBody tr[data-task-row-id]').evaluateAll(els=>els.map(row=>row.dataset.taskRowId));
  expect(rows.indexOf(a.id)).toBe(i+1);
  expect(rows.indexOf(b.id)).toBe(i);
  const gantt=await page.locator('#ganttStage .task-row-left[data-task-id]').evaluateAll(els=>els.map(e=>e.dataset.taskId));
  const visible=rows.filter(id=>gantt.includes(id));expect(gantt).toEqual(visible);
  const after=await page.evaluate(async()=>{
    const selected=document.querySelector('#projectSelect').value;
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('gantt-studio');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    return await new Promise((resolve,reject)=>{const r=db.transaction('projects','readonly').objectStore('projects').get(selected);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  });
  for(const task of before.tasks){
    const afterTask=after.tasks.find(t=>t.id===task.id);
    expect(afterTask.start).toBe(task.start);
    expect(afterTask.end).toBe(task.end);
    expect(afterTask.phaseId).toBe(task.phaseId);
    expect(afterTask.dependencies).toEqual(task.dependencies);
  }
  await page.reload();
  await expect(page.locator('#taskTableBody tr[data-task-row-id]').nth(i)).toHaveAttribute('data-task-row-id',b.id);
  await page.locator('[data-task-sort-mode="date"]').click();
  await expect(page.locator('#taskTableBody .task-drag-handle')).toHaveCount(0);
  await page.locator('[data-task-sort-mode="manual"]').click();
  await expect(page.locator('#taskTableBody tr[data-task-row-id]').nth(i)).toHaveAttribute('data-task-row-id',b.id);
});

test('keyboard reorder, Escape cancellation, other-phase rejection',async({page})=>{
  await page.goto('/');
  await page.locator('#loadDemoBtn').click();
  const rows=await page.locator('#taskTableBody tr[data-task-row-id]').evaluateAll(els=>els.map(e=>({id:e.dataset.taskRowId,phase:e.dataset.taskPhaseId})));
  const idx=rows.findIndex((row,i)=>i+1<rows.length&&rows[i+1].phase===row.phase);
  const first=rows[idx],second=rows[idx+1];
  const handle=page.locator(`tr[data-task-row-id="${second.id}"] .task-drag-handle`);
  await handle.focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#taskTableBody tr[data-task-row-id]').nth(idx)).toHaveAttribute('data-task-row-id',second.id);
  const handle2=page.locator(`tr[data-task-row-id="${second.id}"] .task-drag-handle`);
  const target=page.locator(`tr[data-task-row-id="${first.id}"]`);
  const from=await handle2.boundingBox(),to=await target.boundingBox();
  await page.mouse.move(from.x+10,from.y+12);await page.mouse.down();
  await page.mouse.move(to.x+40,to.y+to.height*.84,{steps:6});
  await page.keyboard.press('Escape');await page.mouse.up();
  await expect(page.locator('#taskTableBody tr[data-task-row-id]').nth(idx)).toHaveAttribute('data-task-row-id',second.id);
  const cross=rows.find(row=>row.phase!==second.phase);
  const from2=await handle2.boundingBox(),to2=await page.locator(`tr[data-task-row-id="${cross.id}"]`).boundingBox();
  await page.mouse.move(from2.x+10,from2.y+12);await page.mouse.down();
  await page.mouse.move(to2.x+60,to2.y+20,{steps:6});await page.mouse.up();
  await expect(page.locator('#taskTableBody tr[data-task-row-id]').nth(idx)).toHaveAttribute('data-task-row-id',second.id);
});

test('new and edited task keeps or appends its stable phase position',async({page})=>{
  await page.goto('/');
  await page.locator('#loadDemoBtn').click();
  const phase=await page.locator('#taskPhase').locator('option').evaluateAll(options=>options.filter(o=>o.value).map(o=>o.value));
  await page.locator('#addTaskBtn').click();
  await page.locator('#taskName').fill('Stable order QA');
  await page.locator('#taskStart').fill('2026-05-01');
  await page.locator('#taskEnd').fill('2026-05-03');
  await page.locator('#taskPhase').selectOption(phase[0]);
  await page.locator('#saveTaskBtn').click();
  const groupRows=page.locator(`#taskTableBody tr[data-task-phase-id="${phase[0]}"]`);
  await expect(groupRows.last()).toContainText('Stable order QA');
  await page.locator('[data-task-sort-mode="date"]').click();
  await expect(groupRows.first()).toContainText('Stable order QA');
  await page.locator('[data-task-sort-mode="manual"]').click();
  await expect(groupRows.last()).toContainText('Stable order QA');
});

test('ordering model migrates legacy dates and prevents cross-phase moves',async()=>{
  const {normalizeTaskOrder,sortedProjectTasks,reorderTask,nudgeTask,nextDisplayOrder}=await import('../assets/js/task-order.mjs');
  const p={planning:{phases:[{id:'a',start:'2026-01-01'},{id:'b',start:'2026-02-01'}]},tasks:[
    {id:'later',phaseId:'a',start:'2026-01-12',end:'2026-01-15',dependencies:['early']},
    {id:'other',phaseId:'b',start:'2026-02-02',end:'2026-02-03',dependencies:[]},
    {id:'early',phaseId:'a',start:'2026-01-03',end:'2026-01-05',dependencies:[]}
  ]};
  const original=p.tasks.map(t=>({id:t.id,start:t.start,end:t.end,phaseId:t.phaseId,dependencies:[...t.dependencies]}));
  normalizeTaskOrder(p);
  expect(sortedProjectTasks(p,'manual').map(t=>t.id)).toEqual(['early','later','other']);
  const prev=p.tasks.find(t=>t.id==='early').displayOrder;
  expect(reorderTask(p,'later','early','before')).toBe(true);
  expect(sortedProjectTasks(p,'manual').map(t=>t.id)).toEqual(['later','early','other']);
  expect(sortedProjectTasks(p,'date').map(t=>t.id)).toEqual(['early','later','other']);
  expect(reorderTask(p,'early','other','before')).toBe(false);
  expect(nudgeTask(p,'later',-1)).toBe(false);
  expect(nudgeTask(p,'early',-1)).toBe(true);
  expect(nextDisplayOrder(p,'a')).toBeGreaterThan(prev);
  for(const t of p.tasks){
    const before=original.find(v=>v.id===t.id);
    expect({id:t.id,start:t.start,end:t.end,phaseId:t.phaseId,dependencies:t.dependencies}).toEqual(before);
  }
});

test('capture manual ordering UI on desktop and mobile',async({page})=>{
  await page.goto('/');
  await page.locator('#loadDemoBtn').click();
  await expect(page.locator('#taskTableBody tr[data-task-row-id]')).toHaveCount(10);
  const {mkdirSync}=require('node:fs');
  mkdirSync('visual-review',{recursive:true});
  await page.screenshot({path:'visual-review/manual-task-order-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'visual-review/manual-task-order-mobile.png',fullPage:true});
});
