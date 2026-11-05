const { test, expect } = require('@playwright/test');
const { execFileSync } = require('node:child_process');
const { resolve } = require('node:path');
const { pathToFileURL } = require('node:url');

const moduleUrl = pathToFileURL(resolve('assets/js/core/project-commits.mjs')).href;
const dateUrl = pathToFileURL(resolve('assets/js/core/date-only.mjs')).href;
const sample = id => ({
  id, revision: 1, updatedAt: '2026-11-01T00:00:00.000Z',
  tasks: [{ id: 'task', start: '2026-11-10', end: '2026-11-13', progress: 0 }]
});

test('failed IndexedDB-equivalent write leaves the canonical snapshot and revision unchanged', async () => {
  const { createProjectCommitter } = await import(moduleUrl);
  let fail = true;
  const saved = [];
  const queue = createProjectCommitter(async p => {
    if (fail) throw new Error('QuotaExceededError');
    saved.push(structuredClone(p));
  });
  const initial = sample('p1');
  queue.remember(initial);
  await expect(queue.commit(initial,p => { p.tasks[0].start = '2026-11-11'; }))
    .rejects.toThrow('QuotaExceededError');
  expect(initial.tasks[0].start).toBe('2026-11-10');
  expect(initial.revision).toBe(1);
  expect(saved).toHaveLength(0);
  fail = false;
  const result = await queue.commit(initial,p => { p.tasks[0].progress = 25; });
  expect(result.project.tasks[0]).toMatchObject({start:'2026-11-10', progress:25});
  expect(result.project.revision).toBe(2);
  expect(saved).toHaveLength(1);
});

test('rapid same-project commands serialize and preserve both edits', async () => {
  const { createProjectCommitter } = await import(moduleUrl);
  const writes = [];
  const queue = createProjectCommitter(async p => {
    await new Promise(resolve => setTimeout(resolve, 2));
    writes.push(structuredClone(p));
  });
  const initial = sample('fast');
  const changes = [
    queue.commit(initial,p => { p.tasks[0].start = '2026-11-11'; }),
    queue.commit(initial,p => { p.tasks[0].end = '2026-11-14'; }),
    queue.commit(initial,p => { p.tasks[0].progress = 50; })
  ];
  const results = await Promise.all(changes);
  expect(writes.map(p => p.revision)).toEqual([2,3,4]);
  expect(results.at(-1).project.tasks[0]).toMatchObject({
    start:'2026-11-11', end:'2026-11-14', progress:50
  });
  expect(initial.revision).toBe(1);
  const noOp = await queue.commit(initial,() => false);
  expect(noOp.changed).toBe(false);
  expect(writes).toHaveLength(3);
});

test('slow save for old project never writes or overwrites new project', async () => {
  const { createProjectCommitter } = await import(moduleUrl);
  let releaseOld;
  const oldGate = new Promise(resolve => { releaseOld = resolve; });
  let startedOld;
  const started = new Promise(resolve => { startedOld = resolve; });
  const writes = [];
  const queue = createProjectCommitter(async p => {
    if (p.id === 'old') { startedOld(); await oldGate; }
    writes.push(p);
  });
  const old = sample('old'), next = sample('next');
  const slow = queue.commit(old,p => {p.tasks[0].progress=30;});
  await started;
  const fast = await queue.commit(next,p => {p.tasks[0].progress=75;});
  expect(fast.project.id).toBe('next');
  expect(writes.map(p => p.id)).toEqual(['next']);
  releaseOld();
  const completed = await slow;
  expect(completed.project.id).toBe('old');
  expect(writes.map(p => p.id)).toEqual(['next','old']);
});

test('local today and strict date-only values survive DST and UTC midnight', async () => {
  const { isValidIsoDate } = await import(dateUrl);
  expect(isValidIsoDate('2028-02-29')).toBe(true);
  expect(isValidIsoDate('2026-02-29')).toBe(false);
  expect(isValidIsoDate('2026-03-29')).toBe(true);
  expect(isValidIsoDate('2026-10-25')).toBe(true);
  expect(isValidIsoDate('2026-11-31')).toBe(false);
  expect(isValidIsoDate('2026-00-10')).toBe(false);
  const source = `import { localTodayIso } from '${dateUrl}';
console.log(localTodayIso(new Date('2026-03-28T23:30:00.000Z'))));
console.log(localTodayIso(new Date('2026-10-25T00:30:00.000Z'))));`;
  const read = TZ => execFileSync(process.execPath,['--input-type=module','-e',source],
    {env:{...process.env,TZ},encoding:'utf8'}).trim().split('\\n');
  expect(read('Europe/Berlin')).toEqual(['2026-03-29','2026-10-25']);
  expect(read('America/Los_Angeles')).toEqual(['2026-03-28','2026-10-24']);
});

test('Gantt save failure keeps table and IndexedDB unchanged; retry persists once', async ({page}) => {
  await page.goto('/');
  await page.locator('#addTaskBtn').click();
  await page.locator('#taskName').fill('Transactional task');
  await page.locator('#taskStart').fill('2026-11-10');
  await page.locator('#taskEnd').fill('2026-11-13');
  await page.locator('#saveTaskBtn').click();
  await expect(page.locator('#taskDialog')).toBeHidden();
  await page.locator('[data-zoom="day"]').click();
  const read = () => page.evaluate(async () => {
    const id = document.querySelector('#projectSelect').value;
    const db = await new Promise((ok,bad) => {
      const request=indexedDB.open('gantt-studio');
      request.onsuccess=()=>ok(request.result);
      request.onerror=()=>bad(request.error);
    });
    const value=await new Promise((ok,bad) => {
      const request=db.transaction('projects','readonly').objectStore('projects').get(id);
      request.onsuccess=()=>ok(request.result);
      request.onerror=()=>bad(request.error);
    });
    db.close();
    return value;
  });
  const initial = await read();
  await page.evaluate(() => {
    const original=IDBObjectStore.prototype.put;
    let remaining=1;
    IDBObjectStore.prototype.put=function(...args) {
      if(remaining-- > 0)throw new DOMException('Simulated write failure','QuotaExceededError');
      return original.apply(this,args);
    };
  });
  const drag = async () => {
    const bar=page.locator('#ganttStage .gantt-bar.workstream');
    const rect=await bar.boundingBox();
    const x=rect.x+Math.min(43,rect.width/3),y=rect.y+rect.height/2;
    await page.mouse.move(x,y);
    await page.mouse.down();
    await page.mouse.move(x+34,y,{steps:5});
    await page.mouse.up();
  };
  await drag();
  await expect(page.locator('#saveStatusText')).toHaveText('Nicht gespeichert');
  expect((await read()).tasks).toEqual(initial.tasks);
  await expect(page.locator('#taskTableBody tr').first()).toContainText('10.11.2026');
  await drag();
  await expect(page.locator('#saveStatusText')).toHaveText('Gespeichert');
  const after=await read();
  expect(after.tasks[0].start).toBe('2026-11-11');
  expect(after.tasks[0].end).toBe('2026-11-14');
  expect(after.revision).toBe(initial.revision+1);
  await page.reload();
  await expect(page.locator('#taskTableBody tr').first()).toContainText('11.11.2026');
});

test('stale tab cannot overwrite a newer IndexedDB project revision', async ({page}) => {
  await page.goto('/');
  await page.locator('#addTaskBtn').click();
  await page.locator('#taskName').fill('Original from two tabs');
  await page.locator('#taskStart').fill('2026-11-10');
  await page.locator('#taskEnd').fill('2026-11-13');
  await page.locator('#saveTaskBtn').click();
  await expect(page.locator('#taskDialog')).toBeHidden();

  const stale = await page.context().newPage();
  await stale.goto('/');
  await expect(stale.locator('#taskTableBody')).toContainText('Original from two tabs');

  await page.locator('#ganttStage .gantt-bar.workstream').click();
  await page.locator('#taskName').fill('Newer change in first tab');
  await page.locator('#saveTaskBtn').click();
  await expect(page.locator('#taskDialog')).toBeHidden();

  await stale.locator('#ganttStage .gantt-bar.workstream').click();
  await stale.locator('#taskName').fill('Stale write from second tab');
  await stale.locator('#saveTaskBtn').click();
  await expect(stale.locator('#saveStatusText')).toHaveText('Nicht gespeichert');
  await expect(stale.locator('#taskDialog')).toBeVisible();

  await stale.reload();
  await expect(stale.locator('#taskTableBody')).toContainText('Newer change in first tab');
  await expect(stale.locator('#taskTableBody')).not.toContainText('Stale write from second tab');
  await stale.close();
});
