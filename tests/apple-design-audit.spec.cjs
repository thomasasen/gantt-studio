const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { mkdirSync, writeFileSync } = require('node:fs');

test('Apple Design QA: WCAG 2.1 AA across real planning workflows', async ({ page }) => {
  test.setTimeout(120000);
  const results = [];
  const check = async name => {
    const scan = await new AxeBuilder({page})
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    results.push({
      name,
      violations: scan.violations.map(v=>({
        id:v.id,impact:v.impact,description:v.description,
        help:v.help, nodes:v.nodes.map(n=>({
          target:n.target,summary:n.failureSummary,html:n.html.slice(0,500)
        }))
      })),
      passes: scan.passes.length,
      incomplete: scan.incomplete.length
    });
  };
  await page.goto('/');
  await expect(page.locator('#projectName')).toBeVisible();
  await check('empty-project-desktop');
  await page.locator('#loadDemoBtn').click();
  await expect(page.locator('#projectName')).toHaveValue('Dynamisches Demo-Projekt');
  await check('demo-project-desktop');
  await page.locator('#planningTabBtn').click();
  await check('planning-desktop');
  await page.locator('#designBtn').click();
  await check('design-dialog');
  await page.locator('#designDialog button[value="cancel"]').last().click();
  await page.locator('#projectTabBtn').click();
  await page.locator('#addTaskBtn').click();
  await check('task-dialog');
  await page.locator('#taskDialog button[value="cancel"]').last().click();
  await expect(page.locator('#taskDialog')).toBeHidden();
  await page.setViewportSize({width:390,height:844});
  await check('demo-project-mobile');
  await page.locator('#planningTabBtn').click();
  await check('planning-mobile');

  mkdirSync('design-audit', {recursive:true});
  writeFileSync('design-audit/axe-findings.json', JSON.stringify(results,null,2));
  const issues=results.flatMap(r=>r.violations.map(v=>({
    screen:r.name,id:v.id,impact:v.impact,nodeCount:v.nodes.length,
    targets:v.nodes.map(n=>n.target).slice(0,10)
  })));
  console.log('APPLE_QA_FINDINGS '+JSON.stringify(issues));
  expect(issues.filter(x=>['critical','serious'].includes(x.impact)),
    'Critical/serious WCAG failures must be addressed (see design-audit artifact)').toEqual([]);
});

test('Apple Design QA: responsive metrics and Gantt demo visual layout', async ({ page }) => {
  await page.goto('/');
  await page.locator('#loadDemoBtn').click();
  await expect(page.locator('#taskTableBody tr')).toHaveCount(10);
  mkdirSync('design-audit',{recursive:true});
  for(const width of [1440,1024,768,390]){
    await page.setViewportSize({width,height:900});
    await page.screenshot({path:`design-audit/demo-${width}.png`,fullPage:true});
    const stats=await page.evaluate(()=>{
      const metrics=[...document.querySelectorAll('#metrics .metric')].map(e=>{
        const r=e.getBoundingClientRect();
        return {x:r.x,y:r.y,width:r.width,height:r.height};
      });
      const main=document.querySelector('.app-shell').getBoundingClientRect();
      const grid=document.querySelector('.gantt-left').getBoundingClientRect();
      return {docOverflow:document.documentElement.scrollWidth-innerWidth,
        metrics, main:{x:main.x,width:main.width},ganttLeftWidth:grid.width};
    });
    expect(stats.docOverflow,`Unexpected page overflow at ${width}`).toBeLessThanOrEqual(2);
    expect(stats.metrics).toHaveLength(4);
    if(width<=600){
      expect(Math.abs(stats.metrics[3].width-stats.metrics[0].width),
        'All four KPI cards should form a balanced 2x2 grid').toBeLessThanOrEqual(2);
    }
  }
  await page.locator('#designBtn').click();
  await expect(page.locator('#designDialog')).toBeVisible();
  const alignment=await page.locator('#designDialog .design-grid > label').evaluateAll(labels=>labels.map(label=>{
    const r=label.querySelector('input').getBoundingClientRect();
    return {top:r.top,height:r.height};
  }));
  expect(new Set(alignment.map(r=>Math.round(r.height))).size).toBe(1);
});
