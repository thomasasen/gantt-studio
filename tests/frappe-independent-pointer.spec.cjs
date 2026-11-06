const {test,expect}=require('@playwright/test');
async function start(page,kind='move'){
  await page.goto('/spikes/frappe/index.html?layer=1');
  await expect(page.locator('#status')).toContainText('Frappe: gerendert');
  const frame=page.frameLocator('#frappeRoot iframe');
  const handle=frame.locator('.studio-independent-controls[data-task-id="demo-core"] [data-independent-kind="'+kind+'"]');
  await expect(handle,'Physical handle must exist').toBeVisible();
  await handle.scrollIntoViewIfNeeded();
  await expect(handle).toBeInViewport();
  return {frame,handle};
}
async function drag(page,handle,delta,{release=true}={}){
  const box=await handle.boundingBox();
  expect(box).toBeTruthy();
  const x=box.x+box.width/2,y=box.y+box.height/2;
  await page.mouse.move(x,y);
  await page.mouse.down();
  const raw=await page.frames().find(f=>f.url().includes('/spikes/frappe/frame.html'))
    .evaluate(()=>window.__frappeInteractionTrace);
  expect(raw.some(e=>e.type==='independent-pointerdown'), 'Actual down must start our gesture').toBe(true);
  await page.mouse.move(x+delta,y,{steps:6});
  if(release)await page.mouse.up();
  return {x,y};
}
const noDB=async page=>expect(await page.evaluate(async()=>indexedDB.databases())).toEqual([]);
for(const [kind,delta] of [
  ['move',90],['resize-left',70],['resize-right',70],['progress',90]
]){
  test('independent physical '+kind+': preview then exactly one CAS commit',async({page})=>{
    const {frame,handle}=await start(page,kind);
    const old=await page.evaluate(()=>window.__independentMemoryStore.snapshot().tasks.find(t=>t.id==='demo-core'));
    await drag(page,handle,delta,{release:false});
    const trace=await frame.locator('#chart').evaluate(()=>window.__frappeInteractionTrace);
    expect(trace.some(e=>e.type==='independent-preview'&&e.kind===kind)).toBe(true);
    expect(await frame.locator('#independent-gesture-preview').evaluate(el=>getComputedStyle(el).display)).toBe('block');
    expect(await page.evaluate(()=>window.__independentCommits.length)).toBe(0);
    await page.mouse.up();
    await expect.poll(()=>page.evaluate(()=>window.__independentCommits.length)).toBe(1);
    const outcome=await page.evaluate(()=>({
      commits:window.__independentCommits,
      intents:window.__frappeTestIntents,
      project:window.__independentMemoryStore.snapshot()
    }));
    expect(outcome.commits[0].result).toEqual({ok:true,revision:2});
    expect(outcome.intents).toHaveLength(1);
    expect(outcome.commits[0].intent.kind).toBe(kind);
    const now=outcome.project.tasks.find(t=>t.id==='demo-core');
    if(kind==='move')expect(now.start).not.toBe(old.start);
    if(kind==='resize-left')expect(now.start).not.toBe(old.start);
    if(kind==='resize-right')expect(now.end).not.toBe(old.end);
    if(kind==='progress')expect(now.progress).not.toBe(old.progress);
    expect(outcome.project.revision).toBe(2);
    await noDB(page);
  });
}
test('click without movement emits nothing',async({page})=>{
  const {handle}=await start(page);
  await drag(page,handle,0);
  expect(await page.evaluate(()=>window.__independentCommits.length)).toBe(0);
  await noDB(page);
});
test('Escape during physical drag prevents commit',async({page})=>{
  const {handle}=await start(page);await drag(page,handle,90,{release:false});
  await page.keyboard.press('Escape');await page.mouse.up();
  expect(await page.evaluate(()=>window.__independentCommits.length)).toBe(0);
  expect(await page.evaluate(()=>window.__independentMemoryStore.snapshot().revision)).toBe(1);
  await noDB(page);
});
test('pointercancel after physical pointerdown prevents commit',async({page})=>{
  const {handle,frame}=await start(page);await drag(page,handle,90,{release:false});
  await frame.locator('#chart').evaluate(root=>{
    const id=window.__independentEditor && 1;
    const down=window.__frappeInteractionTrace.find(e=>e.type==='independent-pointerdown');
    root.dispatchEvent(new PointerEvent('pointercancel',{pointerId:down.pointerId,bubbles:true}));
  });
  await page.mouse.up();
  expect(await page.evaluate(()=>window.__independentCommits.length)).toBe(0);
  await noDB(page);
});
test('blur cancels an active gesture',async({page})=>{
  const {handle,frame}=await start(page);await drag(page,handle,90,{release:false});
  await frame.locator('#chart').evaluate(()=>window.dispatchEvent(new Event('blur')));
  await page.mouse.up();
  expect(await page.evaluate(()=>window.__independentCommits.length)).toBe(0);
  await noDB(page);
});
test('real drag followed by iframe rerender has no stale intent',async({page})=>{
  const {handle}=await start(page);
  const oldFrame=page.frames().find(f=>f.url().includes('/spikes/frappe/frame.html'));
  await drag(page,handle,90,{release:false});
  await page.evaluate(()=>document.getElementById('reloadBtn').click());
  await expect(page.locator('#status')).toContainText('Frappe: gerendert');
  expect(oldFrame.isDetached()).toBe(true);
  await page.mouse.up();
  expect(await page.evaluate(()=>window.__independentCommits.length)).toBe(0);
  await noDB(page);
});
test('canonical project activation rejects stale pointer result',async({page})=>{
  const {handle}=await start(page);
  await drag(page,handle,90,{release:false});
  await page.evaluate(()=>{
    const store=window.__independentMemoryStore;
    store.activate({...store.snapshot(),id:'another-project'});
  });
  await page.mouse.up();
  await expect.poll(()=>page.evaluate(()=>window.__independentCommits.length)).toBe(1);
  const outcome=await page.evaluate(()=>window.__independentCommits[0].result);
  expect(outcome).toEqual({ok:false,reason:'stale'});
  expect(await page.evaluate(()=>window.__frappeTestIntents.length)).toBe(0);
  await noDB(page);
});
test('sequential physical interactions use updated revision with no lost update',async({page})=>{
  let info=await start(page);
  await drag(page,info.handle,90);
  await expect.poll(()=>page.evaluate(()=>window.__independentMemoryStore.snapshot().revision)).toBe(2);
  await expect(page.locator('#status')).toContainText('Frappe: gerendert');
  info=await startExisting(page);
  await drag(page,info.handle,90);
  await expect.poll(()=>page.evaluate(()=>window.__independentMemoryStore.snapshot().revision)).toBe(3);
  const commits=await page.evaluate(()=>window.__independentCommits);
  expect(commits).toHaveLength(2);
  expect(commits.map(c=>c.result.ok)).toEqual([true,true]);
  await noDB(page);
});
async function startExisting(page){
  const frame=page.frameLocator('#frappeRoot iframe');
  const handle=frame.locator('.studio-independent-controls[data-task-id="demo-core"] [data-independent-kind="move"]');
  await expect(handle).toBeVisible();await handle.scrollIntoViewIfNeeded();
  return {frame,handle};
}
