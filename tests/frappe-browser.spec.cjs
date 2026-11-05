const {test,expect} = require('@playwright/test');

test.describe('isolated Frappe 1.2.2 feasibility page', () => {
  test('local assets, two renderers, switches and never writes project storage', async ({page}) => {
    const errors=[], external=[];
    page.on('pageerror', error=>errors.push(error.message));
    page.on('request', request=>{
      if(!request.url().startsWith('http://127.0.0.1:4173/'))external.push(request.url());
    });
    await page.goto('/spikes/frappe/index.html');
    await expect(page.locator('#status')).toContainText('Frappe: gerendert');
    await expect(page.locator('#nativeRoot .gantt-grid')).toHaveCount(1);
    await expect.poll(()=>page.locator('#frappeRoot svg').count()).toBeGreaterThan(0);
    await expect(page.locator('#frappeRoot')).toContainText('Kernkonfiguration');
    for(const mode of ['day','month','week']) {
      await page.locator('#viewMode').selectOption(mode);
      await expect(page.locator('#status')).toContainText('Frappe: gerendert');
    }
    const initial = await page.locator('#frappeRoot svg').count();
    for(let i=0;i<5;i++) await page.locator('#reloadBtn').click();
    expect(await page.locator('#frappeRoot svg').count()).toBe(initial);
    const storage = await page.evaluate(async () => ({
      indexedDB: await indexedDB.databases(),
      localStorage: localStorage.length
    }));
    await page.screenshot({path:'visual-review/frappe-native-comparison.png',fullPage:true});
    expect(storage.indexedDB).toHaveLength(0);
    expect(storage.localStorage).toBe(0);
    expect(errors).toEqual([]);
    expect(external).toEqual([]);
  });

  for(const width of [390,768,1024,1440]) {
    test('isolated chart remains contained at '+width+'px',async({page})=>{
      await page.setViewportSize({width,height:900});
      await page.goto('/spikes/frappe/index.html');
      await expect(page.locator('#status')).toContainText('Frappe: gerendert');
      const result=await page.evaluate(()=>({
        doc:document.documentElement.scrollWidth,
        width:document.documentElement.clientWidth,
        frame:document.querySelector('#frappeRoot').getBoundingClientRect().width
      }));
      expect(result.doc).toBeLessThanOrEqual(result.width+2);
      expect(result.frame).toBeGreaterThan(0);
    });
  }
});
