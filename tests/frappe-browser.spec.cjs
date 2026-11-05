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

for (const timezone of ['Europe/Berlin', 'America/New_York', 'Pacific/Auckland']) {
  test.describe('date-only rendering in ' + timezone, () => {
    test.use({timezoneId: timezone});
    test('keeps inclusive dates across DST, leap day, and year boundaries', async ({page}) => {
      await page.goto('/spikes/frappe/index.html');
      await expect(page.locator('#status')).toContainText('Frappe: gerendert');
      const samples = await page.evaluate(async () => {
        const {mapProjectToFrappeTasks} = await import(
          '/assets/js/engine/frappe/frappe-task-mapper.mjs?v=2.8.0'
        );
        const iso = date => [
          String(date.getFullYear()).padStart(4,'0'),
          String(date.getMonth()+1).padStart(2,'0'),
          String(date.getDate()).padStart(2,'0')
        ].join('-');
        const boundaries = [
          ['2026-03-08','2026-03-08'],
          ['2026-03-29','2026-03-29'],
          ['2026-04-05','2026-04-05'],
          ['2028-02-29','2028-02-29'],
          ['2026-12-31','2027-01-01']
        ];
        const outcomes = [];
        for (const [start,end] of boundaries) {
          const root = document.createElement('div');
          document.body.append(root);
          try {
            const tasks = mapProjectToFrappeTasks({tasks:[
              {id:'boundary',name:'Boundary',start,end,progress:0}
            ]});
            const chart = new globalThis.Gantt(root,tasks,{
              view_mode:'Day',readonly:true,readonly_dates:true,
              readonly_progress:true,move_dependencies:false,
              infinite_padding:false,today_button:false,view_mode_select:false,
              scroll_to:'start'
            });
            // Test-only inspection of Frappe's internal parsed dates; no
            // application adapter relies on these private properties.
            const parsed = chart.tasks[0];
            const inclusiveEnd = new Date(parsed._end.getTime()-1000);
            const rect = root.querySelector('.bar-wrapper .bar');
            outcomes.push({
              expectedStart:start,expectedEnd:end,
              actualStart:iso(parsed._start),actualEnd:iso(inclusiveEnd),
              width:rect ? Number(rect.getAttribute('width')) : 0
            });
          } finally {
            root.remove();
          }
        }
        return outcomes;
      });
      for(const sample of samples) {
        expect(sample.actualStart).toBe(sample.expectedStart);
        expect(sample.actualEnd).toBe(sample.expectedEnd);
        expect(sample.width).toBeGreaterThan(0);
      }
    });
  });
}

test('records repeatable Frappe render and rerender costs for 0/1/25/250/1000 tasks', async ({page}) => {
  test.setTimeout(120000);
  await page.goto('/spikes/frappe/index.html');
  await expect(page.locator('#status')).toContainText('Frappe: gerendert');
  const metrics = await page.evaluate(async () => {
    const {createFrappeEngine} = await import(
      '/assets/js/engine/frappe/frappe-adapter.mjs?v=2.8.0'
    );
    const samples = [];
    for(const count of [0,1,25,250,1000]) {
      const tasks = Array.from({length:count}, (_,i)=>({
        id:'task-'+i,name:'Task '+i,start:'2026-05-01',
        end:'2026-05-10',progress:i%101
      }));
      const project={tasks};
      const snapshot=JSON.stringify(project);
      const root=document.createElement('div');
      document.body.append(root);
      const engine=createFrappeEngine();
      try {
        engine.mount({container:root});
        const start=performance.now();
        const result=engine.render({project,view:{zoom:'week'}});
        const initialMs=performance.now()-start;
        const firstBars=root.querySelectorAll('.bar-wrapper').length;
        const rerenderStart=performance.now();
        engine.render({project,view:{zoom:'week'}});
        const rerenderMs=performance.now()-rerenderStart;
        const zoomStart=performance.now();
        engine.render({project,view:{zoom:'day'}});
        const zoomMs=performance.now()-zoomStart;
        samples.push({
          count,initialMs:Math.round(initialMs),
          rerenderMs:Math.round(rerenderMs),zoomMs:Math.round(zoomMs),
          bars:firstBars,empty:result.empty,
          unchanged:JSON.stringify(project)===snapshot
        });
      } finally {
        engine.destroy();
        root.remove();
      }
    }
    return samples;
  });
  for(const metric of metrics) {
    expect(metric.unchanged).toBe(true);
    expect(metric.empty).toBe(metric.count===0);
    if(metric.count)expect(metric.bars).toBe(metric.count);
    expect(metric.initialMs).toBeGreaterThanOrEqual(0);
    expect(metric.rerenderMs).toBeGreaterThanOrEqual(0);
  }
  console.log('FRAPPE_BENCHMARK_MS',JSON.stringify(metrics));
});

test('interactive Frappe emits date callback before mouseup and Escape cannot undo it', async ({page}) => {
  await page.goto('/spikes/frappe/index.html');
  await expect(page.locator('#status')).toContainText('Frappe: gerendert');
  await page.evaluate(() => {
    const host = document.createElement('div');
    host.id = 'frappe-edit-audit';
    host.style.cssText = 'width:1000px;height:400px;overflow:auto;background:white';
    document.body.prepend(host);
    window.__frappeEditAudit = {changes:[]};
    window.__frappeEditAudit.chart = new globalThis.Gantt(host, [{
      id:'editable',name:'Drag audit',start:'2026-11-01',end:'2026-11-10',progress:25
    }],{
      view_mode:'Day', readonly:false, readonly_dates:false,
      readonly_progress:false, move_dependencies:false,
      scroll_to:'start', infinite_padding:false,
      view_mode_select:false, today_button:false, popup:false,
      on_date_change:(task,start,end) => {
        window.__frappeEditAudit.changes.push({
          id:task.id,start:start.toISOString(),end:end.toISOString()
        });
      }
    });
  });
  const bar = page.locator('#frappe-edit-audit .bar-wrapper .bar').first();
  await expect(bar).toBeVisible();
  await bar.scrollIntoViewIfNeeded();
  const bounds = await bar.boundingBox();
  const x=bounds.x+bounds.width/2, y=bounds.y+bounds.height/2;
  await page.mouse.move(x,y);
  await page.mouse.down();
  await page.mouse.move(x+90,y,{steps:6});
  const beforePointerUp=await page.evaluate(() => window.__frappeEditAudit.changes.length);
  await page.keyboard.press('Escape');
  const afterEscape=await page.evaluate(() => window.__frappeEditAudit.changes.length);
  await page.mouse.up();
  expect(beforePointerUp).toBeGreaterThan(0);
  expect(afterEscape).toBeGreaterThanOrEqual(beforePointerUp);
  console.log('FRAPPE_PRECOMMIT_CALLBACKS',JSON.stringify({beforePointerUp,afterEscape}));
});
