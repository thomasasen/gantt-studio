const {test,expect}=require('@playwright/test');

async function open(page,editable=false) {
  await page.goto('/spikes/frappe/index.html'+(editable?'?edit=1':''));
  await expect(page.locator('#status')).toContainText('Frappe: gerendert');
  return page.frameLocator('#frappeRoot iframe');
}

test('real mouse drag in the opt-in iframe never emits an early or duplicate edit',async({page})=>{
  const frame=await open(page,true);
  const bar=frame.locator('.bar-wrapper[data-id="demo-core"]');
  await expect(bar).toBeVisible();
  const bounds=await bar.boundingBox();
  expect(bounds).toBeTruthy();
  const x=bounds.x+Math.min(35,bounds.width/3),y=bounds.y+bounds.height/2;
  await page.mouse.move(x,y);
  await page.mouse.down();
  await page.mouse.move(x+30,y,{steps:7});
  expect(await page.evaluate(()=>window.__frappeTestIntents.length)).toBe(0);
  await page.mouse.up();
  // Upstream's physical drag is not a certified editor contract: some runs
  // produce no date callback. It must never produce two or write to IDB.
  await expect.poll(()=>page.evaluate(()=>window.__frappeTestIntents.length))
    .toBeLessThanOrEqual(1);
  expect(await page.evaluate(async()=>indexedDB.databases())).toEqual([]);
});

test('real mouse drag in read-only mode never creates a domain intent',async({page})=>{
  const frame=await open(page);
  const bar=frame.locator('.bar-wrapper[data-id="demo-core"]');
  const b=await bar.boundingBox();
  const x=b.x+Math.min(35,b.width/3),y=b.y+b.height/2;
  await page.mouse.move(x,y);
  await page.mouse.down();
  await page.mouse.move(x+45,y,{steps:6});
  await page.mouse.up();
  expect(await page.evaluate(()=>window.__frappeTestIntents)).toEqual([]);
  expect(await page.evaluate(async()=>indexedDB.databases())).toEqual([]);
});

test('spoofed frame payload and stale generation are ignored even in opt-in mode',async({page})=>{
  const frame=await open(page,true);
  await frame.locator('.bar-wrapper[data-id="demo-core"]').evaluate(node=>{
    node.ownerDocument.defaultView.parent.postMessage({
      channel:'gantt-studio-frappe-isolated-v1',type:'intent',
      generation:1,session:'spoofed-session-of-sufficient-length',
      gestureId:1,intent:{type:'task-change',
        change:{id:'demo-core',start:'2026-12-01',end:'2026-12-03'}}
    },location.origin);
  });
  expect(await page.evaluate(()=>window.__frappeTestIntents)).toEqual([]);
  expect(await page.evaluate(async()=>indexedDB.databases())).toEqual([]);
});

test('opt-in Frappe remains contained at 200 percent CSS zoom',async({page})=>{
  await page.evaluate(()=>{}); // Deliberately no global zoom state.
  await page.addInitScript(()=>{document.documentElement.style.zoom='200%';});
  const frame=await open(page,true);
  await expect(frame.locator('.bar-wrapper')).toHaveCount(10);
  expect(await page.evaluate(async()=>indexedDB.databases())).toEqual([]);
});
