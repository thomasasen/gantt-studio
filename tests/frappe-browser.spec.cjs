const {test,expect} = require('@playwright/test');
const {mkdirSync} = require('node:fs');

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
    mkdirSync('visual-review',{recursive:true});
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

/*
 * Red-team regression. PASS means the upstream disposal defect has been
 * reproduced, not that the Frappe engine passes the lifecycle acceptance gate.
 */
test('upstream document mouseup listeners remain registered after rerenders and destroy', async ({page}) => {
  await page.addInitScript(() => {
    const added = [], removed = [];
    const add = document.addEventListener.bind(document);
    const remove = document.removeEventListener.bind(document);
    document.addEventListener = function(type, listener, options) {
      if (type === 'mouseup') added.push(listener);
      return add(type, listener, options);
    };
    document.removeEventListener = function(type, listener, options) {
      if (type === 'mouseup') removed.push(listener);
      return remove(type, listener, options);
    };
    window.__frappeListenerAudit = {added, removed};
  });

  await page.goto('/spikes/frappe/index.html');
  await expect(page.locator('#status')).toContainText('Frappe: gerendert');
  const initial = await page.evaluate(() => window.__frappeListenerAudit.added.length);
  expect(initial).toBeGreaterThanOrEqual(1);
  for (let i = 0; i < 5; i++) {
    await page.locator('#reloadBtn').click();
    await expect(page.locator('#status')).toContainText('Frappe: gerendert');
  }
  const afterRerender = await page.evaluate(() => window.__frappeListenerAudit.added.length);
  expect(afterRerender - initial).toBeGreaterThanOrEqual(5);

  const result = await page.evaluate(async () => {
    const {createFrappeEngine} = await import(
      '/assets/js/engine/frappe/frappe-adapter.mjs?v=2.8.0'
    );
    const container = document.createElement('div');
    document.body.append(container);
    const engine = createFrappeEngine();
    engine.mount({container});
    engine.render({project:{tasks:[
      {id:'teardown-check',name:'Cleanup',start:'2026-11-01',end:'2026-11-02',progress:0}
    ]},view:{zoom:'day'}});
    const afterMount = window.__frappeListenerAudit.added.length;
    engine.destroy();
    container.remove();
    return {
      afterMount,
      added:window.__frappeListenerAudit.added.length,
      removed:window.__frappeListenerAudit.removed.length,
      unpaired:window.__frappeListenerAudit.added.filter(listener =>
        !window.__frappeListenerAudit.removed.includes(listener)).length
    };
  });
  expect(result.afterMount).toBeGreaterThan(afterRerender);
  expect(result.unpaired).toBeGreaterThanOrEqual(6);
  console.log('FRAPPE_LIFECYCLE_BLOCKER', JSON.stringify(result));
});
