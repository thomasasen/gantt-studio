const { test, expect } = require('@playwright/test');

async function createTask(page, name='UI Regression') {
  await page.locator('#addTaskBtn').click();
  await expect(page.locator('#taskDialog')).toBeVisible();
  await page.locator('#taskName').fill(name);
  await page.locator('#taskStart').fill('2026-11-10');
  await page.locator('#taskEnd').fill('2026-11-13');
  await page.locator('#saveTaskBtn').click();
  await expect(page.locator('#taskDialog')).toBeHidden();
  await expect(page.locator('#taskTableBody')).toContainText(name);
}

async function checkAlignedFields(page, selector) {
  const data = await page.locator(selector).evaluate(root => {
    const labels = [...root.querySelectorAll(':scope > label')];
    return labels.map(label => {
      const field = label.querySelector(':scope > input, :scope > select, :scope > .input-suffix');
      if (!field) return null;
      const rect = field.getBoundingClientRect();
      const parent = label.getBoundingClientRect();
      return { x: rect.x, y: rect.y, h: rect.height, rowY: parent.y };
    }).filter(Boolean);
  });
  const groups = [];
  for (const f of data) {
    let group = groups.find(g => Math.abs(g[0].rowY - f.rowY) < 3);
    if (!group) { group = []; groups.push(group); }
    group.push(f);
  }
  for (const group of groups.filter(g => g.length > 1)) {
    const top = group[0].y, height = group[0].h;
    for (const field of group) {
      expect(Math.abs(field.y - top), 'Fields in a row must have the same top').toBeLessThanOrEqual(2);
      expect(Math.abs(field.h - height), 'Fields in a row must be the same height').toBeLessThanOrEqual(2);
    }
  }
  expect(data.length).toBeGreaterThan(0);
}


test('demonstration project loads without overwriting existing projects', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#loadDemoBtn')).toBeVisible();
  await expect(page.locator('#emptyDemoBtn')).toBeVisible();
  const originalId = await page.locator('#projectSelect').inputValue();
  const originalName = await page.locator('#projectName').inputValue();

  await page.locator('#emptyDemoBtn').click();
  await expect(page.locator('#projectName')).toHaveValue('Dynamisches Demo-Projekt');
  await expect(page.locator('#taskTableBody')).toContainText('Projekt-Kick-off');
  const firstDemoId = await page.locator('#projectSelect').inputValue();
  expect(firstDemoId).not.toBe(originalId);
  const firstTaskId = await page.locator('#taskTableBody tr').first().getAttribute('data-task-row-id');

  // Repeated loading creates a separate copy instead of overwriting the first.
  await page.locator('#loadDemoBtn').click();
  await expect(page.locator('#projectName')).toHaveValue('Dynamisches Demo-Projekt (2)');
  const secondDemoId = await page.locator('#projectSelect').inputValue();
  expect(secondDemoId).not.toBe(firstDemoId);
  const secondTaskId = await page.locator('#taskTableBody tr').first().getAttribute('data-task-row-id');
  expect(secondTaskId).not.toBe(firstTaskId);
  await expect(page.locator('#projectSelect option')).toHaveCount(3);

  // All projects must survive navigation and a full browser reload.
  await page.reload();
  await expect(page.locator('#projectName')).toHaveValue('Dynamisches Demo-Projekt (2)');
  await page.locator('#projectSelect').selectOption(originalId);
  await expect(page.locator('#projectName')).toHaveValue(originalName);
  await expect(page.locator('#taskTableBody tr')).toHaveCount(1); // Empty placeholder, no imported demo task.
  await page.locator('#projectSelect').selectOption(firstDemoId);
  await expect(page.locator('#taskTableBody')).toContainText('Projekt-Kick-off');
});

test('demo fetch failure preserves current project and shows an error', async ({ page }) => {
  await page.goto('/');
  const originalId = await page.locator('#projectSelect').inputValue();
  const originalName = await page.locator('#projectName').inputValue();
  await page.route('**/examples/demo.gantt.json', route => route.fulfill({
    status: 503, body: 'Unavailable', contentType: 'text/plain',
  }));
  await page.locator('#loadDemoBtn').click();
  await expect(page.locator('#toast')).toContainText('Demoprojekt konnte nicht geladen werden');
  await expect(page.locator('#loadDemoBtn')).toBeEnabled();
  await expect(page.locator('#projectSelect')).toHaveValue(originalId);
  await expect(page.locator('#projectName')).toHaveValue(originalName);
  await expect(page.locator('#projectSelect option')).toHaveCount(1);
});

test('new visual system loads and has working top-level navigation', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.brand strong')).toContainText('Gantt Studio');
  await expect(page.locator('#saveStatusText')).toContainText('Gespeichert');
  const css = await page.locator('body').evaluate(node => ({
    font: getComputedStyle(node).fontFamily,
    panelRadius: getComputedStyle(document.querySelector('.project-head')).borderRadius,
    headerBg: getComputedStyle(document.querySelector('.topbar')).backgroundColor,
  }));
  expect(css.font).toContain('system-ui');
  expect(parseFloat(css.panelRadius)).toBeGreaterThanOrEqual(14);
  expect(css.headerBg).not.toBe('rgb(22, 50, 79)');
  await page.locator('#planningTabBtn').click();
  await expect(page.locator('#planningView')).toBeVisible();
  await page.locator('#projectTabBtn').click();
  await expect(page.locator('#projectView')).toBeVisible();
  await page.locator('#projectTabBtn').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#planningView')).toBeVisible();
  await expect(page.locator('#planningTabBtn')).toHaveAttribute('aria-selected','true');
});

test('task dialog fields align, task can be saved and edited', async ({ page }) => {
  await page.goto('/');
  await page.locator('#addTaskBtn').click();
  await checkAlignedFields(page, '#taskDialog .form-grid');
  await page.locator('#taskName').fill('Design QA');
  await page.locator('#taskStart').fill('2026-11-10');
  await page.locator('#taskEnd').fill('2026-11-13');
  await page.locator('#saveTaskBtn').click();
  await expect(page.locator('#taskTableBody')).toContainText('Design QA');
  await expect(page.locator('#ganttStage .gantt-bar.workstream')).toHaveCount(1);
  await page.locator('#ganttStage .gantt-bar.workstream').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#taskDialog')).toBeVisible();
  await expect(page.locator('#taskName')).toHaveValue('Design QA');
});

test('planning inputs align and colors stay editable', async ({ page }) => {
  await page.goto('/');
  await page.locator('#planningTabBtn').click();
  await checkAlignedFields(page, '.relative-editor-grid');
  await page.locator('#designBtn').click();
  await expect(page.locator('#designDialog')).toBeVisible();
  await checkAlignedFields(page, '#designDialog .design-grid');
  await page.locator('#designPresetOdin').click();
  await expect(page.locator('#designPrimary')).toHaveValue('#20374e');
  await page.locator('#designDialog button[value=cancel]').last().click();
});

test('Gantt drag can be cancelled with Escape and committed precisely', async ({ page }) => {
  await page.goto('/');
  await createTask(page,'Move and cancel');
  await page.locator('[data-zoom="day"]').click();
  const bar = page.locator('#ganttStage .gantt-bar.workstream');
  await expect(bar).toHaveCount(1);
  const before = await page.locator('#taskTableBody tr').first().innerText();
  const box = await bar.boundingBox();
  expect(box).not.toBeNull();
  // Start in the bar body, away from its resize and progress handles.
  const x=box.x + Math.min(43, box.width/3), y=box.y + box.height/2;
  await page.mouse.move(x,y);
  await page.mouse.down();
  await page.mouse.move(x+34,y,{steps:5});
  await page.keyboard.press('Escape');
  await page.mouse.up();
  const afterCancel = await page.locator('#taskTableBody tr').first().innerText();
  expect(afterCancel).toBe(before);
  await expect(page.locator('#taskDialog')).toBeHidden();
  await page.mouse.move(x,y);
  await page.mouse.down();
  await page.mouse.move(x+34,y,{steps:5});
  await page.mouse.up();
  await expect(page.locator('#taskTableBody tr').first()).toContainText('11.11.2026');
  await expect(page.locator('#taskTableBody tr').first()).toContainText('14.11.2026');
});

for (const width of [1440, 1024, 768, 390]) {
  test('responsive chrome has no document-level horizontal overflow at ' + width, async ({ page }) => {
    await page.setViewportSize({width,height:900});
    await page.goto('/');
    await expect(page.locator('#projectName')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'Only Gantt/table scrollers may overflow horizontally').toBeLessThanOrEqual(2);
    await page.locator('#planningTabBtn').click();
    await checkAlignedFields(page, '.relative-editor-grid');
    const planningOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(planningOverflow).toBeLessThanOrEqual(2);
  });
}

test('reduced motion preserves functionality', async ({ page }) => {
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/');
  const duration=await page.locator('#newProjectBtn').evaluate(el=>getComputedStyle(el).transitionDuration);
  expect(duration).toMatch(/0\.00001s|1e-05s|0s/);
  await page.locator('#planningTabBtn').click();
  await expect(page.locator('#planningView')).toBeVisible();
});

test('capture design review screenshots', async ({ page }) => {
  const { mkdirSync } = require('node:fs');
  mkdirSync('visual-review', { recursive: true });
  await page.setViewportSize({width:1440,height:900});
  await page.goto('/');
  await createTask(page, 'Design Review · Konzeptphase');
  await page.waitForTimeout(2700);
  await page.evaluate(() => { document.documentElement.style.scrollBehavior='auto'; window.scrollTo(0,0); document.activeElement?.blur?.(); });
  await page.screenshot({path:'visual-review/desktop-project.png',fullPage:true});
  await page.locator('#planningTabBtn').click();
  await page.evaluate(() => { document.documentElement.style.scrollBehavior='auto'; window.scrollTo(0,0); document.activeElement?.blur?.(); });
  await page.screenshot({path:'visual-review/desktop-planning.png',fullPage:true});
  await page.locator('#designBtn').click();
  await page.evaluate(() => { document.documentElement.style.scrollBehavior='auto'; window.scrollTo(0,0); document.activeElement?.blur?.(); });
  await page.screenshot({path:'visual-review/desktop-design-dialog.png',fullPage:true});
  await page.locator('#designDialog button[value=cancel]').last().click();
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await page.locator('#projectTabBtn').click();
  await page.evaluate(() => { document.documentElement.style.scrollBehavior='auto'; window.scrollTo(0,0); document.activeElement?.blur?.(); });
  await page.screenshot({path:'visual-review/mobile-project.png',fullPage:true});
  await page.locator('#planningTabBtn').click();
  await page.evaluate(() => { document.documentElement.style.scrollBehavior='auto'; window.scrollTo(0,0); document.activeElement?.blur?.(); });
  await page.screenshot({path:'visual-review/mobile-planning.png',fullPage:true});
});

test('Gantt resizing and progress remain date-precise', async ({ page }) => {
  await page.goto('/');
  await createTask(page,'Resize QA');
  await page.locator('[data-zoom="day"]').click();
  const bar=page.locator('#ganttStage .gantt-bar.workstream');
  let box=await bar.boundingBox();
  expect(box).not.toBeNull();

  // Right-edge resize: add exactly one calendar day.
  await page.mouse.move(box.x+box.width-5,box.y+box.height/2);
  await page.mouse.down();
  await page.mouse.move(box.x+box.width+29,box.y+box.height/2,{steps:5});
  await page.mouse.up();
  await expect(page.locator('#taskTableBody tr').first()).toContainText('14.11.2026');

  // Left-edge resize: move start exactly one day, leaving end fixed.
  box=await bar.boundingBox();
  await page.mouse.move(box.x+7,box.y+box.height/2);
  await page.mouse.down();
  await page.mouse.move(box.x+41,box.y+box.height/2,{steps:5});
  await page.mouse.up();
  await expect(page.locator('#taskTableBody tr').first()).toContainText('11.11.2026');

  // Adjust progress through the native editor, then move its diagram handle.
  await bar.focus();
  await page.keyboard.press('Enter');
  await page.locator('#taskProgress').fill('25');
  await page.locator('#saveTaskBtn').click();
  await expect(page.locator('#taskDialog')).toBeHidden();
  box=await bar.boundingBox();
  const startX=box.x+box.width*.25, y=box.y+box.height/2;
  await page.mouse.move(startX,y);
  await page.mouse.down();
  await page.mouse.move(startX+box.width*.25,y,{steps:5});
  await page.mouse.up();
  await expect(page.locator('#taskTableBody tr').first()).toContainText('50 %');
});

test('mobile Gantt exposes both task list and time grid', async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await createTask(page,'Mobile Gantt');
  const width=await page.locator('.gantt-left').evaluate(el=>el.getBoundingClientRect().width);
  expect(width).toBeLessThanOrEqual(195);
  expect(width).toBeGreaterThanOrEqual(175);
  const scroller=await page.locator('.gantt-scroller').boundingBox();
  expect(scroller.height).toBeLessThan(300);
});

test('preview dense demo at desktop and mobile sizes', async ({ page }) => {
  await page.goto('/');
  await page.locator('#loadDemoBtn').click();
  await expect(page.locator('#taskTableBody tr')).toHaveCount(10);
  const { mkdirSync } = require('node:fs');
  mkdirSync('visual-review',{recursive:true});
  await page.setViewportSize({width:1440,height:900});
  await page.screenshot({path:'visual-review/demo-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'visual-review/demo-mobile.png',fullPage:true});
});
