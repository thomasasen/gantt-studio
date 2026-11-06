const {test,expect}=require('@playwright/test');

test('vendor document listeners remain isolated through repeated renders',async({page})=>{
  await page.addInitScript(()=>{
    const original=document.addEventListener.bind(document);
    const captured=[];
    document.addEventListener=function(type,listener,options){
      if(type==='mouseup')captured.push(listener);
      return original(type,listener,options);
    };
    window.__hostMouseups=captured;
  });
  await page.goto('/spikes/frappe/index.html');
  await expect(page.locator('#status')).toContainText('Frappe: gerendert');
  const bars=page.frameLocator('#frappeRoot iframe').locator('.bar-wrapper');
  await expect(bars).toHaveCount(10);
  const initial=await page.evaluate(()=>window.__hostMouseups.length);
  for(let i=0;i<7;i++){
    await page.locator('#reloadBtn').click();
    await expect(page.locator('#status')).toContainText('Frappe: gerendert');
    await expect(bars).toHaveCount(10);
  }
  expect(await page.evaluate(()=>window.__hostMouseups.length)).toBe(initial);
  await expect(page.locator('#frappeRoot iframe')).toHaveCount(1);
  expect(await page.evaluate(async()=>({db:await indexedDB.databases(),local:localStorage.length})))
    .toEqual({db:[],local:0});
});

test('generation guards outdated events and zoom never saves data',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/spikes/frappe/index.html');
  await expect(page.locator('#status')).toContainText('Frappe: gerendert');
  for(const mode of ['day','month','week']){
    await page.locator('#viewMode').selectOption(mode);
    await expect(page.locator('#status')).toContainText('Frappe: gerendert');
  }
  await page.evaluate(()=>window.postMessage({
    channel:'gantt-studio-frappe-isolated-v1',type:'selected',generation:999999,id:'fake'
  },location.origin));
  await expect(page.locator('#status')).not.toContainText('fake');
  for(let i=0;i<4;i++)await page.locator('#reloadBtn').click();
  await expect(page.locator('#status')).toContainText('Frappe: gerendert');
  await expect(page.frameLocator('#frappeRoot iframe').locator('.bar-wrapper')).toHaveCount(10);
  expect(errors).toEqual([]);
});
for(const width of [390,768,1024,1440]){
  test('isolated Frappe frame stays inside '+width+'px viewport',async({page})=>{
    await page.setViewportSize({width,height:900});
    await page.goto('/spikes/frappe/index.html');
    await expect(page.locator('#status')).toContainText('Frappe: gerendert');
    const bounds=await page.evaluate(()=>({
      actual:document.documentElement.scrollWidth,
      limit:document.documentElement.clientWidth
    }));
    expect(bounds.actual).toBeLessThanOrEqual(bounds.limit+2);
  });
}
