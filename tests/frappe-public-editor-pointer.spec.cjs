/**
 * Empirical upstream edit probe, not an editor conformance certificate.
 * Uses real Playwright mouse/key input and the shipped, locally built vendor.
 * Measurements are deliberately retained even if Frappe fires zero callbacks.
 * Safety assertions (no early intent, no duplicates, no IDB) are strict.
 */
const {test,expect}=require('@playwright/test');
const {mkdirSync,writeFileSync}=require('node:fs');

async function fixture(page){
  await page.goto('/spikes/frappe/index.html?edit=1');
  await expect(page.locator('#status')).toContainText('Frappe: gerendert');
  const frame=page.frameLocator('#frappeRoot iframe');
  await expect(frame.locator('.bar-wrapper[data-id="demo-core"]')).toBeVisible();
  return frame;
}
async function capture(page){
  const f=page.frames().find(f=>f.url().includes('/spikes/frappe/frame.html'));
  return f?f.evaluate(()=>window.__frappeInteractionTrace||[]).catch(()=>[]):[];
}
async function evidence(page,scenario,beforeRelease=[]){
  const frames=page.frames().filter(f=>f.url().includes('/spikes/frappe/frame.html'));
  const trace=frames.length===1?await frames[0].evaluate(()=>window.__frappeInteractionTrace||[])
    .catch(()=>[{type:'frame-detached'}]):[{type:'frame-not-present',count:frames.length}];
  const intents=await page.evaluate(()=>window.__frappeTestIntents);
  const payload={scenario,version:'frappe-gantt@1.2.2',
    scope:'diagnostic-only; no positive editor certification',
    traceBeforeRelease:beforeRelease,traceAfterRelease:trace,intents,
    callbacksBeforeRelease:beforeRelease.filter(e=>e.type.startsWith('on_')),
    callbacksAfterRelease:trace.filter(e=>e.type.startsWith('on_')),
    initialPointer:beforeRelease.find(e=>e.type==='pointerdown')||trace.find(e=>e.type==='pointerdown')||null};
  mkdirSync('frappe-evidence',{recursive:true});
  writeFileSync('frappe-evidence/'+scenario+'.json',JSON.stringify(payload,null,2)+'\n');
  await test.info().attach(scenario+'.json',{
    body:Buffer.from(JSON.stringify(payload,null,2)),
    contentType:'application/json'
  });
  return payload;
}
async function noStorage(page){
  expect(await page.evaluate(async()=>indexedDB.databases())).toEqual([]);
}
async function physicalGesture(page,locator,delta,{cancel=false}={}){
  await expect(locator).toBeVisible();
  // The Frappe comparison is BELOW a tall native chart: ensure physical
  // Chromium coordinates are in the actual visible iframe viewport.
  await locator.scrollIntoViewIfNeeded();
  await expect(locator).toBeInViewport();
  const b=await locator.boundingBox();
  expect(b).toBeTruthy();
  const x=b.x+b.width/2,y=b.y+b.height/2;
  await page.mouse.move(x,y);
  await page.mouse.down();
  const started=await capture(page);
  const pointerdown=started.find(e=>e.type==='pointerdown')||null;
  expect(pointerdown,'Real pointerdown must reach the original iframe before movement').not.toBeNull();
  await page.mouse.move(x+delta,y,{steps:9});
  // A documented upstream callback, even if emitted early, is NOT authorization.
  expect(await page.evaluate(()=>window.__frappeTestIntents.length)).toBe(0);
  const beforeRelease=await capture(page);
  if(cancel)await page.keyboard.press('Escape');
  await page.mouse.up();
  return {x,y,delta,pointerdown,beforeRelease};
}
for(const [scenario,part,delta] of [
  ['move','.bar',65],
  ['resize-left','.handle.left',-30],
  ['resize-right','.handle.right',35],
  ['progress','.handle.progress',25]
]){
  test('physical '+scenario+': trace public callbacks, never commit early or twice',async({page})=>{
    const frame=await fixture(page);
    const bar=frame.locator('.bar-wrapper[data-id="demo-core"]');
    const handle=bar.locator(part);
    const gesture=await physicalGesture(page,handle,delta);
    // A green safety-only test must not disguise a vendor that never
    // produces a date/progress change for an actual physical gesture.
    await expect.poll(()=>page.evaluate(()=>window.__frappeTestIntents.length)).toBe(1);
    const result=await evidence(page,scenario,gesture.beforeRelease);
    expect(result.initialPointer,'Real pointerdown must reach the iframe').not.toBeNull();
    const callbackType=scenario==='progress'?'on_progress_change':'on_date_change';
    const callbacks=result.callbacksAfterRelease.filter(e=>e.type===callbackType);
    expect(callbacks.length,'A real Frappe edit callback is required').toBeGreaterThan(0);
    expect(result.intents).toHaveLength(1);
    expect(result.intents[0].change).toEqual(callbacks.at(-1).change);
    await noStorage(page);
  });
}
test('physical click without movement is not an edit',async({page})=>{
  const frame=await fixture(page);
  const bar=frame.locator('.bar-wrapper[data-id="demo-core"] .bar');
  const gesture=await physicalGesture(page,bar,0);
  const result=await evidence(page,'click-no-drag',gesture.beforeRelease);
  expect(result.intents).toEqual([]);
  await noStorage(page);
});
test('physical Escape during movement rejects the pending gesture',async({page})=>{
  const frame=await fixture(page);
  const gesture=await physicalGesture(page,frame.locator('.bar-wrapper[data-id="demo-core"] .bar'),65,{cancel:true});
  const result=await evidence(page,'escape-cancel',gesture.beforeRelease);
  expect(result.intents).toEqual([]);
  await noStorage(page);
});
test('physical release outside the iframe never writes or duplicates',async({page})=>{
  const frame=await fixture(page);
  const bar=frame.locator('.bar-wrapper[data-id="demo-core"] .bar');
  await bar.scrollIntoViewIfNeeded();
  await expect(bar).toBeInViewport();
  const b=await bar.boundingBox();
  const x=b.x+b.width/2,y=b.y+b.height/2;
  await page.mouse.move(x,y);await page.mouse.down();
  await page.mouse.move(x+60,y,{steps:5});
  const beforeRelease=await capture(page);
  expect(await page.evaluate(()=>window.__frappeTestIntents.length)).toBe(0);
  await page.mouse.move(2,2,{steps:7});
  await page.mouse.up();
  const result=await evidence(page,'release-outside',beforeRelease);
  expect(result.intents).toEqual([]);
  await noStorage(page);
});
test('re-render during physical movement fences stale callbacks',async({page})=>{
  const frame=await fixture(page);
  const bar=frame.locator('.bar-wrapper[data-id="demo-core"] .bar');
  const b=await bar.boundingBox();
  const x=b.x+b.width/2,y=b.y+b.height/2;
  await page.mouse.move(x,y);await page.mouse.down();
  await page.mouse.move(x+40,y,{steps:5});
  const beforeRelease=await capture(page);
  expect(await page.evaluate(()=>window.__frappeTestIntents.length)).toBe(0);
  // Native/iframe lifecycle transition while a gesture is still active.
  await page.evaluate(()=>document.getElementById('reloadBtn').click());
  await expect(page.locator('#status')).toContainText('Frappe: gerendert');
  await page.mouse.up();
  const result=await evidence(page,'rerender-during-drag',beforeRelease);
  expect(result.intents).toEqual([]);
  await noStorage(page);
});
