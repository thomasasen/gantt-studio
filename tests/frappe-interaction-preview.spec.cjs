const {test,expect}=require('@playwright/test');

async function openEditable(page){
  await page.goto('/spikes/frappe/index.html?edit=1');
  await expect(page.locator('#status')).toContainText('Frappe: gerendert');
  const frame=page.frames().find(f=>f.url().includes('/spikes/frappe/frame.html'));
  expect(frame).toBeTruthy();
  return frame;
}
async function beginPreview(frame){
  return frame.evaluate(()=>{
    const {chart,gate}=window.__frappeExperimental;
    const bar=chart.get_bar('demo-core');
    if(!bar)throw new Error('Missing demonstration task');
    bar.group.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));
    const active=gate.isActive();
    bar.update_bar_position({x:bar.$bar.getX()+chart.config.column_width*3});
    return {active,previewStillPending:gate.isActive(),barId:bar.task.id};
  });
}
test('real Frappe preview callback is buffered until one mouseup and never saved',async({page})=>{
  const frame=await openEditable(page);
  const result=await beginPreview(frame);
  expect(result.active).toBe(true);
  expect(result.previewStillPending).toBe(true);
  expect(await page.evaluate(()=>window.__frappeTestIntents)).toEqual([]);
  await frame.evaluate(()=>{
    window.__frappeExperimental.chart.get_bar('demo-core').group
      .dispatchEvent(new MouseEvent('mouseup',{bubbles:true,button:0}));
  });
  await expect.poll(()=>page.evaluate(()=>window.__frappeTestIntents.length)).toBe(1);
  const intents=await page.evaluate(()=>window.__frappeTestIntents);
  expect(intents[0].type).toBe('task-change');
  expect(intents[0].change.id).toBe('demo-core');
  expect(await page.evaluate(async()=>indexedDB.databases())).toHaveLength(0);
});
for(const cancel of ['Escape','pointercancel']){
  test(cancel+' discards actual Frappe drag preview and resets the frame',async({page})=>{
    const frame=await openEditable(page);
    await beginPreview(frame);
    expect(await page.evaluate(()=>window.__frappeTestIntents)).toEqual([]);
    await frame.evaluate(type=>{
      if(type==='Escape')
        window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
      else
        window.dispatchEvent(new PointerEvent('pointercancel',{
          bubbles:true,pointerId:1,pointerType:'mouse'
        }));
    },cancel);
    await expect(page.locator('#status')).toContainText('Frappe: gerendert');
    await expect.poll(()=>page.frames().filter(f=>f.url().includes('/spikes/frappe/frame.html')).length).toBe(1);
    expect(await page.evaluate(()=>window.__frappeTestIntents)).toEqual([]);
    expect(await page.evaluate(async()=>indexedDB.databases())).toHaveLength(0);
  });
}
