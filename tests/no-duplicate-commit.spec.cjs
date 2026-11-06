const {test,expect}=require('@playwright/test');

test('rapid duplicate task save is committed exactly once',async({page})=>{
  await page.goto('/');
  await expect(page.locator('#projectSelect')).not.toHaveValue('');
  await page.locator('#addTaskBtn').click();
  await page.locator('#taskName').fill('Exactly one task');
  await page.locator('#taskStart').fill('2026-12-01');
  await page.locator('#taskEnd').fill('2026-12-03');
  await page.evaluate(()=>{
    const save=document.querySelector('#saveTaskBtn');
    save.click();save.click();
  });
  await expect(page.locator('#taskDialog')).toBeHidden();
  await expect(page.locator('#taskTableBody tr[data-task-row-id]')).toHaveCount(1);
  const stored=await page.evaluate(async()=>{
    const {loadActive}=await import('/assets/js/storage.js?v=2.8.0');
    return loadActive();
  });
  expect(stored.tasks.filter(t=>t.name==='Exactly one task')).toHaveLength(1);
  expect(stored.revision).toBe(2);
});

test('rapid duplicate marker save is committed exactly once',async({page})=>{
  await page.goto('/');
  await expect(page.locator('#projectSelect')).not.toHaveValue('');
  await page.locator('#planningTabBtn').click();
  await page.locator('#markerSection summary').click();
  await expect(page.locator('#addMarkerBtn')).toBeVisible();
  await page.locator('#addMarkerBtn').click();
  await expect(page.locator('#entityDialog')).toBeVisible();
  await page.locator('#entityName').fill('Only one marker');
  await page.locator('#entityDate').fill('2026-12-12');
  await page.evaluate(()=>{
    const save=document.querySelector('#saveEntityBtn');
    save.click();save.click();
  });
  await expect(page.locator('#entityDialog')).toBeHidden();
  const stored=await page.evaluate(async()=>{
    const {loadActive}=await import('/assets/js/storage.js?v=2.8.0');
    return loadActive();
  });
  expect(stored.planning.markers.filter(m=>m.name==='Only one marker')).toHaveLength(1);
  expect(stored.revision).toBe(2);
});
