const { test, expect } = require('@playwright/test');
const { mkdirSync } = require('node:fs');

test('registry renders static and dynamic controls without intercepting clicks', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#projectSelect')).not.toHaveValue('');
  for (const id of ['newProjectBtn','openProjectBtn','deleteProjectBtn','addTaskBtn',
    'projectTabBtn','planningTabBtn','guideBtn','designBtn','centralExportBtn',
    'taskTableAddBtn','taskDetailsToggle']) {
    await expect(page.locator('#'+id+' .ui-icon'), id).toHaveCount(1);
  }
  const svg=page.locator('.ui-icon').first();
  await expect(svg).toHaveAttribute('stroke','currentColor');
  await expect(svg).toHaveAttribute('aria-hidden','true');
  expect(await svg.evaluate(node => getComputedStyle(node).pointerEvents)).toBe('none');
  await page.locator('#planningTabBtn').click();
  await expect(page.locator('#planningView')).toBeVisible();
  await page.locator('#phaseSection > summary').click();
  await page.locator('#addPhaseBtn').click();
  await expect(page.locator('#entityDialog')).toBeVisible();
  await page.locator('#entityDialog .icon-btn').click();
  await expect(page.locator('#entityDialog')).toBeHidden();
  await page.locator('#projectTabBtn').click();
  await page.locator('#addTaskBtn').click();
  await page.locator('#taskName').fill('Icon-Regression');
  await page.locator('#taskStart').fill('2026-11-10');
  await page.locator('#taskEnd').fill('2026-11-12');
  await page.locator('#saveTaskBtn').click();
  await expect(page.locator('#taskDialog')).toBeHidden();
  await expect(page.locator('#taskTableBody tr[data-task-row-id] .task-link-button .ui-icon').first()).toBeVisible();
  await expect(page.locator('.task-drag-handle').first().locator('.ui-icon')).toHaveCount(1);
  await expect(page.locator('.gantt-order-handle').first().locator('.ui-icon')).toHaveCount(1);
  await page.locator('#taskTableBody [data-task-field="owner"]').first().click();
  await expect(page.locator('.task-inline-save')).toHaveAttribute('aria-label','Änderung übernehmen');
  await expect(page.locator('.task-inline-cancel')).toHaveAttribute('aria-label','Bearbeitung abbrechen');
  await page.locator('.task-inline-cancel').click();
  await page.locator('#taskDetailsToggle').click();
  await expect(page.locator('#taskDetailsToggle .ui-icon')).toHaveCount(1);
  await page.locator('#centralExportBtn').click();
  await expect(page.locator('#exportDialog')).toBeVisible();
  await expect(page.locator('.export-option .ui-icon')).toHaveCount(3);
  await page.locator('#exportDialog .icon-btn').click();
  expect(errors).toEqual([]);
});

test('all eleven designs inherit color correctly and retain functional controls', async ({ page }) => {
  test.setTimeout(120000);
  const { DESIGN_PRESETS } = await import('../assets/js/design-presets.mjs');
  await page.goto('/');
  await expect(page.locator('#projectSelect')).not.toHaveValue('');
  expect(DESIGN_PRESETS).toHaveLength(11);
  mkdirSync('visual-review',{recursive:true});
  for (const preset of DESIGN_PRESETS) {
    await page.locator('#designBtn').click();
    await page.locator(`[data-design-preset="${preset.id}"]`).click();
    await page.locator('#saveDesignBtn').click();
    const state=await page.locator('#centralExportBtn').evaluate(button => {
      const svg=button.querySelector('svg');
      return {
        stroke:svg.getAttribute('stroke'),
        color:getComputedStyle(svg).color,
        parentColor:getComputedStyle(button).color,
        pointer:getComputedStyle(svg).pointerEvents,
        width:Math.round(svg.getBoundingClientRect().width)
      };
    });
    expect(state.stroke,preset.id).toBe('currentColor');
    expect(state.color,preset.id).toBe(state.parentColor);
    expect(state.pointer,preset.id).toBe('none');
    expect(state.width,preset.id).toBeGreaterThanOrEqual(16);
    await page.locator('#centralExportBtn').click();
    await expect(page.locator('#exportDialog')).toBeVisible();
    await page.locator('#exportDialog .icon-btn').click();
    await page.locator('#planningTabBtn').click();
    await expect(page.locator('#addPhaseBtn .ui-icon')).toHaveCount(1);
    await page.locator('#projectTabBtn').click();
    if (preset.id==='fjordlicht'||preset.id==='kupferatelier'||preset.id==='mitternacht') {
      await page.screenshot({path:`visual-review/icon-palette-${preset.id}.png`,fullPage:true});
    }
  }
  await page.emulateMedia({media:'print'});
  await expect(page.locator('#centralExportBtn .ui-icon')).toHaveCount(1);
});

test('keyboard controls, narrow screens and baseline comparison screenshots', async ({ page }) => {
  test.setTimeout(90000);
  mkdirSync('visual-review',{recursive:true});
  // Deployed main is the pre-change reference; reachability must not be a CI gate.
  try {
    await page.goto('https://thomasasen.github.io/gantt-studio/',{waitUntil:'domcontentloaded',timeout:14000});
    await page.locator('#loadDemoBtn').click({timeout:6000});
    await expect(page.locator('#taskTableBody [data-task-row-id]')).toHaveCount(10,{timeout:9000});
    await page.locator('#toast').evaluate(node => node.classList.remove('show'));
    await page.screenshot({path:'visual-review/icon-before-desktop.png',fullPage:true});
  } catch {
    test.info().annotations.push({type:'baseline',description:'Public pre-change screenshot unavailable'});
  }
  await page.goto('/');
  await expect(page.locator('#projectSelect')).not.toHaveValue('');
  await page.locator('#loadDemoBtn').click();
  await expect(page.locator('#taskTableBody [data-task-row-id]')).toHaveCount(10);
  await page.locator('#toast').evaluate(node => node.classList.remove('show'));
  const toolbarRows=await page.evaluate(() => ({settings:document.querySelector('#moreSettingsDetails').getBoundingClientRect().y,zoom:document.querySelector('.zoom-cluster').getBoundingClientRect().y}));
  expect(Math.abs(toolbarRows.settings-toolbarRows.zoom),'Settings must share the first toolbar row on desktop').toBeLessThanOrEqual(6);
  await page.screenshot({path:'visual-review/icon-after-desktop.png',fullPage:true});
  await page.locator('#planningTabBtn').click();
  await page.screenshot({path:'visual-review/icon-after-planning.png',fullPage:true});
  await page.locator('#guideBtn').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#guideDialog')).toBeVisible();
  await expect(page.locator('#guideDialog .icon-btn')).toHaveAttribute('aria-label','Schließen');
  await page.locator('#guideDialog .icon-btn').click();
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await expect(page.locator('#projectSelect')).not.toHaveValue('');
  await page.screenshot({path:'visual-review/icon-after-mobile.png',fullPage:true});
  const overflow=await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(2);
});

test('200-percent-equivalent CSS viewport preserves operability and focus', async ({ page }) => {
  // 1440 physical px / 2 = 720 CSS px: responsive reflow at 200% desktop zoom.
  // This checks layout equivalence, not the browser chrome's actual zoom setting.
  await page.setViewportSize({width:720,height:900});
  await page.goto('/');
  await expect(page.locator('#projectSelect')).not.toHaveValue('');
  const overflow=await page.evaluate(() => document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(2);
  await page.locator('#planningTabBtn').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#planningView')).toBeVisible();
  await page.locator('#designBtn').click();
  await expect(page.locator('#designDialog')).toBeVisible();
  await expect(page.locator('#designDialog .icon-btn')).toHaveAttribute('aria-label','Schließen');
  await page.locator('#designDialog .icon-btn').click();
  await expect(page.locator('#designDialog')).toBeHidden();
  await page.locator('#projectTabBtn').click();
  await expect(page.locator('#projectView')).toBeVisible();
});
