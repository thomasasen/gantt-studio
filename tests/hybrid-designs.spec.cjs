const {test,expect}=require('@playwright/test');
const AxeBuilder=require('@axe-core/playwright').default;
const {mkdirSync,readFileSync}=require('node:fs');

const hybrids=['fjordlicht','kupferatelier'];
const rgb=hex=>{
  const h=hex.replace('#','');
  return 'rgb('+[0,2,4].map(i=>parseInt(h.slice(i,i+2),16)).join(', ')+')';
};
const wcag=async(page,label)=>{
  const result=await new AxeBuilder({page})
    .withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
  expect(result.violations.map(v=>({
    id:v.id,impact:v.impact,targets:v.nodes.map(n=>n.target)
  })),label).toEqual([]);
};

test('hybrid palettes keep the chart bright and the application shell dark',async({page})=>{
  test.setTimeout(120000);
  const {findDesignPreset}=await import('../assets/js/design-presets.mjs');
  mkdirSync('visual-review',{recursive:true});
  await page.goto('/');
  await expect(page.locator('#projectSelect')).not.toHaveValue('');
  const initialLightId=await page.locator('#projectSelect').inputValue();
  await page.locator('#loadDemoBtn').click();
  await expect(page.locator('#taskTableBody tr[data-task-row-id]')).toHaveCount(10);

  for(const id of hybrids){
    const preset=findDesignPreset(id);
    await page.locator('#designBtn').click();
    await expect(page.locator('#designDialog')).toBeVisible();
    const choice=page.locator(`#designPresetGrid [data-design-preset="${id}"]`);
    await choice.click();
    await expect(choice).toHaveAttribute('aria-pressed','true');
    await expect(page.locator('#designPreviewMode')).toContainText('Hybrid Design');
    await expect(page.locator('#designPreviewCard')).toHaveAttribute('data-preview-mode','hybrid');
    await expect(page.locator('#designPanelBg')).toHaveValue(preset.colors.panelBg.toLowerCase());
    // Preview must not change the active project before explicit save.
    if(id==='fjordlicht')await expect(page.locator('html')).toHaveAttribute('data-theme-mode','light');
    await page.locator('#saveDesignBtn').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme-mode','hybrid');
    await expect(page.locator('#designDialog')).toBeHidden();

    const styles=await page.evaluate(()=>{
      const bg=(selector)=>getComputedStyle(document.querySelector(selector)).backgroundColor;
      const color=(selector)=>getComputedStyle(document.querySelector(selector)).color;
      return {
        shell:bg('body'),topbar:bg('.topbar'),project:bg('.project-head'),
        metric:bg('.metric'),navigation:bg('.studio-nav'),
        commandbar:bg('.timeline-panel-head'),
        gantt:bg('.gantt-left'),ganttTimeline:bg('.gantt-right'),
        table:bg('.task-overview-table'),
        tableHeader:bg('.task-overview-table th'),
        taskName:color('#ganttStage .task-title strong'),
        topbarLabel:color('.brand strong'),
        tableCell:color('.task-overview-table td')
      };
    });
    expect(styles.shell,id+' body').toBe(rgb(preset.colors.pageBg));
    expect(styles.topbar,id+' topbar').toBe(rgb(preset.colors.pageBg));
    expect(styles.gantt,id+' Gantt left').toBe(rgb(preset.colors.panelBg));
    expect(styles.ganttTimeline,id+' Gantt right').toBe(rgb(preset.colors.panelBg));
    expect(styles.table,id+' task table').toBe(rgb(preset.colors.panelBg));
    expect(styles.commandbar).not.toBe(styles.gantt);
    expect(styles.metric).not.toBe(styles.gantt);
    expect(styles.tableHeader).not.toBe(styles.table);
    // Imported phase colors may be pale; the summarized bar itself is dark,
    // so its visible label must be explicitly light rather than inheriting
    // the dark data typography.
    await expect(page.locator('#ganttStage .gantt-bar.phase-summary .bar-label').first())
      .toHaveCSS('color','rgb(248, 250, 251)');
    await page.screenshot({path:`visual-review/hybrid-${id}-project.png`,fullPage:true});
    await wcag(page,id+' project');

    await page.locator('#planningTabBtn').click();
    await expect(page.locator('#planningView')).toBeVisible();
    const planning=await page.evaluate(()=>{
      const bg=selector=>getComputedStyle(document.querySelector(selector)).backgroundColor;
      return {heading:bg('.planning-page-head'),form:bg('.planning-accordion'),
        planning:bg('.planning-page')};
    });
    expect(planning.heading).not.toBe(planning.form);
    await page.screenshot({path:`visual-review/hybrid-${id}-planning.png`,fullPage:true});
    await wcag(page,id+' planning');

    await page.locator('#designBtn').click();
    await expect(page.locator('#designDialog')).toBeVisible();
    await expect(page.locator(`#designPresetGrid [data-design-preset="${id}"]`)).toHaveAttribute('aria-pressed','true');
    await expect(page.locator('#saveDesignBtn')).toBeInViewport();
    if(id==='fjordlicht'){
      await page.screenshot({path:'visual-review/hybrid-fjordlicht-dialog.png',fullPage:true});
      await wcag(page,'hybrid design dialog');
    }
    await page.locator('#designDialog button[value="cancel"]').last().click();
    await page.locator('#projectTabBtn').click();

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme-mode','hybrid');
    await expect(page.locator('#taskTableBody tr[data-task-row-id]')).toHaveCount(10);
  }
  const exportDownload=page.waitForEvent('download');
  await page.locator('#centralExportBtn').click();
  await page.locator('#exportJsonBtn').click();
  const file=await exportDownload;
  const exported=JSON.parse(readFileSync(await file.path(),'utf8'));
  expect(exported.schema).toBe('gantt-studio.project');
  expect(exported.project.design.colors.pageBg.toLowerCase()).toBe('#373332');
  expect(exported.project.design.colors.panelBg.toLowerCase()).toBe('#ece4db');
  expect(exported.project.design.preset).toBeUndefined();
  expect(exported.project.tasks).toHaveLength(10);

  await page.locator('#projectSelect').selectOption(initialLightId);
  await expect(page.locator('html')).toHaveAttribute('data-theme-mode','light');
  await page.locator('#projectSelect').selectOption(exported.project.id);
  await expect(page.locator('html')).toHaveAttribute('data-theme-mode','hybrid');
});

test('hybrid action buttons, controls, print, accessibility and mobile layout remain usable',async({page})=>{
  test.setTimeout(90000);
  await page.goto('/');
  await page.locator('#loadDemoBtn').click();
  await expect(page.locator('#taskTableBody tr[data-task-row-id]')).toHaveCount(10);
  await page.locator('#designBtn').click();
  await page.locator('#designPresetGrid [data-design-preset="fjordlicht"]').click();
  await page.locator('#saveDesignBtn').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme-mode','hybrid');

  // These interactions would all be broken if the JavaScript module bootstrap
  // or any dark-on-light overlay blocked the input surfaces.
  await page.locator('.gantt-order-switch [data-task-sort-mode="date"]').click();
  await expect(page.locator('.task-overview-actions [data-task-sort-mode="date"]')).toHaveAttribute('aria-pressed','true');
  await page.locator('.task-overview-actions [data-task-sort-mode="manual"]').click();
  await expect(page.locator('.gantt-order-switch [data-task-sort-mode="manual"]')).toHaveAttribute('aria-pressed','true');
  await page.locator('#addTaskBtn').click();
  await expect(page.locator('#taskDialog')).toBeVisible();
  await wcag(page,'hybrid task dialog');
  await page.locator('#taskDialog button[value="cancel"]').last().click();
  await page.locator('#planningTabBtn').click();
  await expect(page.locator('#planningView')).toBeVisible();
  await page.locator('#projectTabBtn').click();
  await expect(page.locator('#projectView')).toBeVisible();

  await page.setViewportSize({width:390,height:844});
  const layout=await page.evaluate(()=>({
    overflow:document.documentElement.scrollWidth-innerWidth,
    ganttWidth:document.querySelector('.gantt-left').getBoundingClientRect().width
  }));
  expect(layout.overflow).toBeLessThanOrEqual(2);
  expect(layout.ganttWidth).toBeLessThanOrEqual(195);
  await page.locator('#designBtn').click();
  await expect(page.locator('#designDialog')).toBeVisible();
  await expect(page.locator('#designPresetGrid button')).toHaveCount(11);
  await expect(page.locator('#saveDesignBtn')).toBeInViewport();
  mkdirSync('visual-review',{recursive:true});
  await page.screenshot({path:'visual-review/hybrid-mobile-dialog.png',fullPage:true});
  await wcag(page,'hybrid mobile design dialog');
  await page.locator('#designDialog button[value="cancel"]').last().click();
  await wcag(page,'hybrid mobile project');

  await page.emulateMedia({media:'print'});
  const print=await page.evaluate(()=>{
    const root=getComputedStyle(document.documentElement);
    return {
      colorScheme:root.colorScheme,
      page:getComputedStyle(document.body).backgroundColor,
      gantt:getComputedStyle(document.querySelector('.task-row-left[data-task-id]')).backgroundColor
    };
  });
  expect(print.colorScheme).toBe('light');
  expect(print.page).toBe('rgb(255, 255, 255)');
  expect(print.gantt).toBe('rgb(255, 255, 255)');
  await page.emulateMedia({media:'screen'});
  await expect(page.locator('html')).toHaveAttribute('data-theme-mode','hybrid');
});

test('customized hybrid colors stay hybrid but cancel never writes a preview',async({page})=>{
  await page.goto('/');
  await expect(page.locator('#projectSelect')).not.toHaveValue('');
  await page.locator('#designBtn').click();
  await page.locator('#designPresetGrid [data-design-preset="kupferatelier"]').click();
  await page.locator('#designAccent').fill('#725343');
  await expect(page.locator('#designPresetSelection')).toContainText('Individuelle');
  await expect(page.locator('#designPreviewCard')).toHaveAttribute('data-preview-mode','hybrid');
  await expect(page.locator('html')).toHaveAttribute('data-theme-mode','light');
  await page.locator('#designDialog button[value="cancel"]').last().click();
  await expect(page.locator('html')).toHaveAttribute('data-theme-mode','light');
  await page.locator('#designBtn').click();
  await page.locator('#designPresetGrid [data-design-preset="kupferatelier"]').click();
  await page.locator('#designAccent').fill('#725343');
  await page.locator('#saveDesignBtn').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme-mode','hybrid');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme-mode','hybrid');
  await page.locator('#designBtn').click();
  await expect(page.locator('#designPresetSelection')).toContainText('Individuelle');
});
