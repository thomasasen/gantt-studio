const {test,expect}=require('@playwright/test');

async function loadDemo(page){
  await page.goto('/');
  await page.locator('#loadDemoBtn').click();
  await expect(page.locator('#taskTableBody tr[data-task-row-id]')).toHaveCount(10);
  return page.locator('#projectSelect').inputValue();
}
const savedTasks=(page,id)=>page.evaluate(async projectId=>{
  const {loadProject}=await import('/assets/js/storage.js?v=2.8.1');
  return (await loadProject(projectId)).tasks;
},id);

async function cancelPointerDrag(page,handleSelector,dragClass){
  const handle=page.locator(handleSelector).first();
  await expect(handle).toBeVisible();
  await handle.evaluate(node=>{
    node.addEventListener('pointerdown',event=>{
      window.__qaPointerId=event.pointerId;
    },{once:true,capture:true});
  });
  const bounds=await handle.boundingBox();
  expect(bounds).toBeTruthy();
  const x=bounds.x+bounds.width/2,y=bounds.y+bounds.height/2;
  await page.mouse.move(x,y);
  await page.mouse.down();
  await page.mouse.move(x,y+50,{steps:6});
  await expect(page.locator(dragClass)).toHaveCount(1);
  const state=await page.evaluate(selector=>{
    const node=document.querySelector(selector);
    const pointerId=window.__qaPointerId;
    const hadCapture=node.hasPointerCapture(pointerId);
    window.dispatchEvent(new PointerEvent('pointercancel',{
      bubbles:true,pointerId,pointerType:'mouse',isPrimary:true
    }));
    return {hadCapture,released:!node.hasPointerCapture(pointerId)};
  },handleSelector);
  expect(state.hadCapture).toBe(true);
  expect(state.released).toBe(true);
  await expect(page.locator(dragClass)).toHaveCount(0);
  await page.mouse.up();
  await expect(page.locator(dragClass)).toHaveCount(0);
}

test('table pointercancel discards reorder and releases pointer capture without a commit',async({page})=>{
  const id=await loadDemo(page);
  const original=await savedTasks(page,id);
  await cancelPointerDrag(page,'#taskTableBody [data-task-drag-handle]','.task-row-dragging');
  expect(await savedTasks(page,id)).toEqual(original);
  await page.reload();
  await expect(page.locator('#taskTableBody tr[data-task-row-id]')).toHaveCount(10);
  expect(await savedTasks(page,id)).toEqual(original);
});

test('Gantt pointercancel discards reorder and releases pointer capture without a commit',async({page})=>{
  const id=await loadDemo(page);
  const original=await savedTasks(page,id);
  await cancelPointerDrag(page,'#ganttStage [data-gantt-order-handle]','.gantt-row-dragging');
  expect(await savedTasks(page,id)).toEqual(original);
  await page.reload();
  await expect(page.locator('#taskTableBody tr[data-task-row-id]')).toHaveCount(10);
  expect(await savedTasks(page,id)).toEqual(original);
});
