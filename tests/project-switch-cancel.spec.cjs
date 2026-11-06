const {test,expect}=require('@playwright/test');

test('switching projects during a table reorder cancels the gesture and prevents a stale commit',async({page})=>{
  await page.goto('/');
  await page.locator('#loadDemoBtn').click();
  await expect(page.locator('#taskTableBody tr[data-task-row-id]')).toHaveCount(10);
  const sourceId=await page.locator('#projectSelect').inputValue();
  const original=await page.locator('#taskTableBody tr[data-task-row-id]')
    .evaluateAll(rows=>rows.map(r=>r.dataset.taskRowId));
  page.once('dialog',dialog=>dialog.accept('Switch target'));
  await page.locator('#newProjectBtn').click();
  await expect(page.locator('#taskTableBody tr[data-task-row-id]')).toHaveCount(0);
  const targetId=await page.locator('#projectSelect').inputValue();
  await page.locator('#projectSelect').selectOption(sourceId);
  await expect(page.locator('#taskTableBody tr[data-task-row-id]')).toHaveCount(10);

  const grip=page.locator('#taskTableBody [data-task-drag-handle]').first();
  const bounds=await grip.boundingBox();
  expect(bounds).toBeTruthy();
  const x=bounds.x+bounds.width/2,y=bounds.y+bounds.height/2;
  await page.mouse.move(x,y);
  await page.mouse.down();
  await page.mouse.move(x,y+40,{steps:4});
  await page.evaluate(id=>{
    const select=document.querySelector('#projectSelect');
    select.value=id;select.dispatchEvent(new Event('change',{bubbles:true}));
  },targetId);
  await expect(page.locator('#taskTableBody tr[data-task-row-id]')).toHaveCount(0);
  await page.mouse.up();
  await page.locator('#projectSelect').selectOption(sourceId);
  await expect(page.locator('#taskTableBody tr[data-task-row-id]')).toHaveCount(10);
  const actual=await page.locator('#taskTableBody tr[data-task-row-id]')
    .evaluateAll(rows=>rows.map(r=>r.dataset.taskRowId));
  expect(actual).toEqual(original);
});

test('switching projects during Gantt drag discards the preview',async({page})=>{
  await page.goto('/');
  await page.locator('#loadDemoBtn').click();
  const sourceId=await page.locator('#projectSelect').inputValue();
  const bar=page.locator('#ganttStage .gantt-bar.workstream').first();
  const original=await bar.evaluate(el=>({left:el.style.left,taskId:el.dataset.taskId}));
  page.once('dialog',dialog=>dialog.accept('Target'));
  await page.locator('#newProjectBtn').click();
  // The project creation handler is async; wait until the new empty project
  // is displayed before capturing its id.
  await expect(page.locator('#taskTableBody tr[data-task-row-id]')).toHaveCount(0);
  const targetId=await page.locator('#projectSelect').inputValue();
  await page.locator('#projectSelect').selectOption(sourceId);
  await expect(page.locator('#projectSelect')).toHaveValue(sourceId);
  await expect(page.locator('#taskTableBody tr[data-task-row-id]')).toHaveCount(10);
  await expect(bar).toBeVisible();
  const bounds=await bar.boundingBox();
  const x=bounds.x+Math.min(bounds.width/3,40),y=bounds.y+bounds.height/2;
  await page.mouse.move(x,y);await page.mouse.down();
  await page.mouse.move(x+32,y,{steps:5});
  await page.evaluate(id=>{
    const select=document.querySelector('#projectSelect');
    select.value=id;select.dispatchEvent(new Event('change',{bubbles:true}));
  },targetId);
  await expect(page.locator('#taskTableBody tr[data-task-row-id]')).toHaveCount(0);
  await page.mouse.up();
  await page.locator('#projectSelect').selectOption(sourceId);
  const restored=page.locator('#ganttStage .gantt-bar[data-task-id="'+original.taskId+'"]');
  await expect(restored).toHaveCSS('left',original.left);
});
