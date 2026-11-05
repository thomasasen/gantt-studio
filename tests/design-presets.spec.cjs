const {test,expect}=require('@playwright/test');
const AxeBuilder=require('@axe-core/playwright').default;
const {mkdirSync,readFileSync}=require('node:fs');

const newPresets=['nordlicht','sandstein','waldgruen','marine'];

function contrast(foreground,background='#FFFFFF'){
  const lum=color=>{
    const rgb=color.slice(1).match(/.{2}/g).map(s=>parseInt(s,16)/255);
    const linear=rgb.map(v=>v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4));
    return .2126*linear[0]+.7152*linear[1]+.0722*linear[2];
  };
  const a=lum(foreground),b=lum(background);
  return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
}

test('six design presets preserve both originals, have distinct colors and accessible new palettes',async()=>{
  const {DESIGN_PRESETS,DESIGN_COLOR_FIELDS,findDesignPreset,matchDesignPreset}
    =await import('../assets/js/design-presets.mjs');
  expect(DESIGN_PRESETS.map(p=>p.id)).toEqual(['odin','neutral',...newPresets]);
  expect(findDesignPreset('odin').colors.primary).toBe('#20374E');
  expect(findDesignPreset('neutral').colors.primary).toBe('#334155');
  expect(findDesignPreset('unknown')).toBeNull();
  const combos=new Set();
  for(const p of DESIGN_PRESETS){
    for(const key of DESIGN_COLOR_FIELDS)
      expect(p.colors[key],p.id+' '+key).toMatch(/^#[0-9a-fA-F]{6}$/);
    const match=matchDesignPreset({...p.colors,accent:p.colors.accent.toLowerCase()});
    expect(match?.id).toBe(p.id);
    combos.add(DESIGN_COLOR_FIELDS.map(key=>p.colors[key]).join('|'));
  }
  expect(combos.size).toBe(6);
  expect(matchDesignPreset({...DESIGN_PRESETS[0].colors,accent:'#112233'})).toBeNull();
  for(const id of newPresets){
    const p=findDesignPreset(id);
    for(const key of ['primary','accent','workstream','critical','milestone','gate']){
      expect(contrast(p.colors[key]),id+' '+key+' contrasts with white').toBeGreaterThanOrEqual(4.5);
    }
  }
});

test('design gallery presents six selectable miniature palettes and keeps cancel non-destructive',async({page})=>{
  await page.goto('/');
  await expect(page.locator('#projectSelect')).not.toHaveValue('');
  const startingPrimary=await page.locator('html').evaluate(el=>getComputedStyle(el).getPropertyValue('--primary').trim().toLowerCase());
  const startingName=await page.locator('#projectName').inputValue();
  await page.locator('#designBtn').click();
  await expect(page.locator('#designDialog')).toBeVisible();
  const grid=page.locator('#designPresetGrid');
  await expect(grid.locator('button')).toHaveCount(6);
  await expect(page.locator('#designPresetOdin')).toBeVisible();
  await expect(page.locator('#designPresetNeutral')).toBeVisible();
  mkdirSync('visual-review',{recursive:true});
  await page.screenshot({path:'visual-review/design-gallery-desktop.png',fullPage:true});
  for(const id of newPresets){
    const button=grid.locator(`[data-design-preset="${id}"]`);
    await expect(button).toBeVisible();
    await expect(button.locator('.design-preset-art')).toBeVisible();
  }
  await grid.locator('[data-design-preset="nordlicht"]').click();
  await expect(page.locator('#designPrimary')).toHaveValue('#184e67');
  await expect(grid.locator('[data-design-preset="nordlicht"]')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#designPresetSelection')).toContainText('Nordlicht');
  expect(await page.locator('html').evaluate(el=>getComputedStyle(el).getPropertyValue('--primary').trim().toLowerCase())).toBe(startingPrimary);
  await page.locator('#designAccent').fill('#124455');
  await expect(page.locator('#designPresetSelection')).toContainText('Individuelle');
  await expect(grid.locator('[aria-pressed="true"]')).toHaveCount(0);
  await page.locator('#designDialog button[value="cancel"]').last().click();
  await expect(page.locator('#designDialog')).toBeHidden();
  await expect(page.locator('#projectName')).toHaveValue(startingName);
  expect(await page.locator('html').evaluate(el=>getComputedStyle(el).getPropertyValue('--primary').trim().toLowerCase())).toBe(startingPrimary);
  await page.locator('#designBtn').click();
  await expect(page.locator('#designPrimary')).not.toHaveValue('#184e67');
});

test('all new designs can be saved, restored and selected after reload',async({page})=>{
  await page.goto('/');
  await page.locator('#loadDemoBtn').click();
  await expect(page.locator('#taskTableBody tr[data-task-row-id]')).toHaveCount(10);
  const {findDesignPreset}=await import('../assets/js/design-presets.mjs');
  mkdirSync('visual-review',{recursive:true});
  for(const id of newPresets){
    const preset=findDesignPreset(id);
    await page.locator('#designBtn').click();
    await expect(page.locator('#designDialog')).toBeVisible();
    await page.locator(`#designPresetGrid [data-design-preset="${id}"]`).click();
    await expect(page.locator('#designPrimary')).toHaveValue(preset.colors.primary.toLowerCase());
    await expect(page.locator('#designPanelBg')).toHaveValue(preset.colors.panelBg.toLowerCase());
    await expect(page.locator('#designPresetSelection')).toContainText(preset.label);
    await page.locator('#saveDesignBtn').click();
    await expect(page.locator('#designDialog')).toBeHidden();
    const theme=await page.evaluate(()=>{
      const css=getComputedStyle(document.documentElement);
      return {primary:css.getPropertyValue('--primary').trim().toLowerCase(),
        panel:css.getPropertyValue('--panel').trim().toLowerCase(),
        work:css.getPropertyValue('--workstream').trim().toLowerCase()};
    });
    expect(theme).toEqual({
      primary:preset.colors.primary.toLowerCase(),panel:preset.colors.panelBg.toLowerCase(),
      work:preset.colors.workstream.toLowerCase()
    });
    await expect(page.locator('#taskTableBody tr[data-task-row-id]')).toHaveCount(10);
    await expect(page.locator('#ganttStage .gantt-bar[data-task-id]').first()).toBeVisible();
    await page.screenshot({path:`visual-review/design-theme-${id}.png`,fullPage:true});
    const scan=await new AxeBuilder({page})
      .withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
    expect(scan.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})),id).toEqual([]);
    await page.reload();
    await expect(page.locator('#projectSelect')).not.toHaveValue('');
    await page.locator('#designBtn').click();
    await expect(page.locator(`#designPresetGrid [data-design-preset="${id}"]`)).toHaveAttribute('aria-pressed','true');
    await page.locator('#designDialog button[value="cancel"]').last().click();
  }
  // JSON backups must retain the applied palette without changing the schema.
  const exportedPromise=page.waitForEvent('download');
  await page.locator('#centralExportBtn').click();
  await page.locator('#exportJsonBtn').click();
  const download=await exportedPromise;
  const exported=JSON.parse(readFileSync(await download.path(),'utf8'));
  expect(exported.schema).toBe('gantt-studio.project');
  expect(exported.project.design.colors.primary).toBe(findDesignPreset('marine').colors.primary.toLowerCase());
  expect(exported.project.tasks).toHaveLength(10);
});

test('mobile design gallery remains usable without overflow, checked with accessibility audit',async({page})=>{
  await page.goto('/');
  await page.locator('#loadDemoBtn').click();
  await expect(page.locator('#taskTableBody tr[data-task-row-id]')).toHaveCount(10);
  await page.setViewportSize({width:390,height:844});
  await page.locator('#designBtn').click();
  await expect(page.locator('#designDialog')).toBeVisible();
  await expect(page.locator('#designPresetGrid button')).toHaveCount(6);
  await expect(page.locator('#designPresetGrid')).toBeInViewport();
  await expect(page.locator('#designPresetGrid [data-design-preset="marine"]')).toBeVisible();
  mkdirSync('visual-review',{recursive:true});
  await page.screenshot({path:'visual-review/design-gallery-mobile.png',fullPage:true});
  const sizing=await page.evaluate(()=>{
    const dialog=document.querySelector('#designDialog');
    const bounds=dialog.getBoundingClientRect();
    const cards=[...dialog.querySelectorAll('#designPresetGrid button')].map(el=>{
      const r=el.getBoundingClientRect();return {left:r.left,right:r.right,height:r.height};
    });
    return {width:innerWidth,documentOverflow:document.documentElement.scrollWidth-innerWidth,
      dialogLeft:bounds.left,dialogRight:bounds.right,
      cards};
  });
  expect(sizing.documentOverflow).toBeLessThanOrEqual(2);
  expect(sizing.dialogLeft).toBeGreaterThanOrEqual(0);
  expect(sizing.dialogRight).toBeLessThanOrEqual(390);
  for(const item of sizing.cards){
    expect(item.left).toBeGreaterThanOrEqual(sizing.dialogLeft);
    expect(item.right).toBeLessThanOrEqual(sizing.dialogRight);
    expect(item.height).toBeGreaterThanOrEqual(115);
  }
  const scan=await new AxeBuilder({page})
    .withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
  expect(scan.violations.map(v=>({id:v.id,impact:v.impact,targets:v.nodes.map(n=>n.target)}))).toEqual([]);
});
