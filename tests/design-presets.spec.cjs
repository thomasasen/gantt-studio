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

test('nine design presets preserve the original six palettes and keep bar label contrast',async()=>{
  const {DESIGN_PRESETS,DESIGN_COLOR_FIELDS,findDesignPreset,matchDesignPreset,isDarkDesignColors}
    =await import('../assets/js/design-presets.mjs');
  expect(DESIGN_PRESETS.map(p=>p.id)).toEqual(['odin','neutral',...newPresets,'mitternacht','graphit','waldnacht']);
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
  expect(combos.size).toBe(9);
  expect(matchDesignPreset({...DESIGN_PRESETS[0].colors,accent:'#112233'})).toBeNull();
  for(const id of newPresets){
    const p=findDesignPreset(id);
    expect(isDarkDesignColors(p.colors)).toBe(false);
    for(const key of ['primary','accent','workstream','critical','milestone','gate']){
      expect(contrast(p.colors[key]),id+' '+key+' contrasts with white').toBeGreaterThanOrEqual(4.5);
    }
  }
  for(const id of ['mitternacht','graphit','waldnacht']){
    const p=findDesignPreset(id);
    expect(isDarkDesignColors(p.colors)).toBe(true);
    expect(contrast(p.colors.pageBg,p.colors.panelBg),id+' has subdued dark surface separation').toBeLessThanOrEqual(1.3);
    for(const field of ['workstream','critical','milestone','gate']){
      expect(contrast('#F1F5F7',p.colors[field]),id+' '+field+' contrast to bar labels').toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast('#CED9E3',p.colors.panelBg),id+' primary body text').toBeGreaterThanOrEqual(7);
    expect(contrast('#A9B9C7',p.colors.panelBg),id+' secondary body text').toBeGreaterThanOrEqual(4.5);
  }
});

test('design gallery presents nine selectable miniature palettes and keeps cancel non-destructive',async({page})=>{
  await page.goto('/');
  await expect(page.locator('#projectSelect')).not.toHaveValue('');
  const startingPrimary=await page.locator('html').evaluate(el=>getComputedStyle(el).getPropertyValue('--primary').trim().toLowerCase());
  const startingName=await page.locator('#projectName').inputValue();
  await page.locator('#designBtn').click();
  await expect(page.locator('#designDialog')).toBeVisible();
  await expect(page.locator('#saveDesignBtn')).toBeInViewport();
  const grid=page.locator('#designPresetGrid');
  await expect(grid.locator('button')).toHaveCount(9);
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
  await expect(page.locator('#saveDesignBtn')).toBeInViewport();
  await expect(page.locator('#designPresetGrid button')).toHaveCount(9);
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

function cssRGB(value){
  // color-mix() is returned as modern "color(srgb r g b)" in Chromium.
  let components;
  if(value.startsWith('color(srgb ')){
    components=value.slice(11).replace(')','').split(/\s+/).slice(0,3).map(v=>Math.round(Number(v)*255));
  }else if(value.startsWith('oklab(')){
    // CSS color-mix() can be serialized in Oklab; convert it to sRGB for
    // objective contrast checks instead of assuming opaque RGB strings.
    const match=value.match(/^oklab\(([-.\d]+)\s+([-.\d]+)\s+([-.\d]+)/);
    if(!match)throw Error('Malformed Oklab color: '+value);
    const [L,a,b]=match.slice(1,4).map(Number);
    const l=(L+.3963377774*a+.2158037573*b)**3;
    const m=(L-.1055613458*a-.0638541728*b)**3;
    const sn=(L-.0894841775*a-1.2914855480*b)**3;
    const linear=[
      4.0767416621*l-3.3077115913*m+.2309699292*sn,
      -1.2684380046*l+2.6097574011*m-.3413193965*sn,
      -.0041960863*l-.7034186147*m+1.7076147010*sn
    ];
    components=linear.map(v=>{
      const linearSafe=Math.max(0,Math.min(1,v));
      const gamma=linearSafe<=.0031308?12.92*linearSafe:1.055*linearSafe**(1/2.4)-.055;
      return Math.round(gamma*255);
    });
  }else{
    const match=value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if(!match)throw Error('Unsupported CSS color: '+value);
    components=match.slice(1,4).map(Number);
  }
  return '#'+components.map(v=>v.toString(16).padStart(2,'0')).join('').toUpperCase();
}

test('dark themes update every major UI surface and revert cleanly across projects',async({page})=>{
  test.setTimeout(120000);
  await page.goto('/');
  await expect(page.locator('#projectSelect')).not.toHaveValue('');
  const lightId=await page.locator('#projectSelect').inputValue();
  await page.locator('#loadDemoBtn').click();
  await expect(page.locator('#taskTableBody tr[data-task-row-id]')).toHaveCount(10);
  const darkIds=['mitternacht','graphit','waldnacht'];
  const {findDesignPreset}=await import('../assets/js/design-presets.mjs');
  mkdirSync('visual-review',{recursive:true});

  for(const id of darkIds){
    const preset=findDesignPreset(id);
    await page.locator('#designBtn').click();
    await expect(page.locator('#designDialog')).toBeVisible();
    await page.locator(`#designPresetGrid [data-design-preset="${id}"]`).click();
    await expect(page.locator('#designPreviewCard')).toHaveAttribute('data-preview-mode','dark');
    await expect(page.locator('#designPreviewMode')).toContainText('Dunkles Design');
    await expect(page.locator('#designPresetSelection')).toContainText(preset.label);
    // Selecting a preset is a preview, not a persistent theme switch.
    if(id==='mitternacht')await expect(page.locator('html')).toHaveAttribute('data-theme-mode','light');
    await page.locator('#saveDesignBtn').click();
    await expect(page.locator('#designDialog')).toBeHidden();
    await expect(page.locator('html')).toHaveAttribute('data-theme-mode','dark');
    const surfaces=await page.evaluate(()=>{
      const style=selector=>{
        const element=document.querySelector(selector);
        if(!element)throw Error('Missing '+selector);
        const computed=getComputedStyle(element);
        let bgNode=element,background='transparent';
        while(bgNode){
          const candidate=getComputedStyle(bgNode).backgroundColor;
          if(candidate!=='transparent'&&candidate!=='rgba(0, 0, 0, 0)'){
            background=candidate;
            break;
          }
          bgNode=bgNode.parentElement;
        }
        return {background,color:computed.color};
      };
      return {
        body:style('body'),topbar:style('.topbar'),
        panel:style('.project-head'),gantt:style('.gantt-left'),
        ganttRow:style('.gantt-left .task-row-left[data-task-id]'),
        table:style('.task-overview-table'),
        tableHeader:style('.task-overview-table th'),
        tableCell:style('.task-overview-table td'),
        title:style('.task-title strong'),button:style('.topbar .btn.primary')
      };
    });
    for(const key of ['topbar','panel','gantt','ganttRow','table','tableHeader','tableCell']){
      const bg=cssRGB(surfaces[key].background);
      expect(contrast(bg,'#FFFFFF'),id+' '+key+' is genuinely dark').toBeGreaterThanOrEqual(6);
    }
    expect(contrast(cssRGB(surfaces.tableCell.color),cssRGB(surfaces.tableCell.background)),id+' table text').toBeGreaterThanOrEqual(4.5);
    expect(contrast(cssRGB(surfaces.title.color),cssRGB(surfaces.ganttRow.background)),id+' task title').toBeGreaterThanOrEqual(4.5);
    expect(contrast(cssRGB(surfaces.button.color),cssRGB(surfaces.button.background)),id+' primary action').toBeGreaterThanOrEqual(4.5);

    // Phase-summary bars must not become white-on-pale, even if imported
    // projects define almost-white colors for their phases.
    const summaries=await page.locator('#ganttStage .gantt-bar.phase-summary').evaluateAll(bars=>
      bars.map(bar=>({
        bg:getComputedStyle(bar).backgroundColor,
        text:getComputedStyle(bar.querySelector('.bar-label')).color
      })));
    expect(summaries.length).toBeGreaterThan(0);
    for(const summary of summaries)
      expect(contrast(cssRGB(summary.bg),cssRGB(summary.text)),id+' phase summary contrast').toBeGreaterThanOrEqual(4.5);
    await page.screenshot({path:`visual-review/dark-${id}-gantt.png`,fullPage:true});
    const scan=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
    expect(scan.violations.map(v=>({id:v.id,impact:v.impact,targets:v.nodes.map(n=>n.target)})),id+' project Axe').toEqual([]);

    await page.locator('#planningTabBtn').click();
    const planning=await page.evaluate(()=>{
      const selectors=['.planning-page','.planning-accordion > summary','.planning-cost-card','.relative-editor'];
      return Object.fromEntries(selectors.map(sel=>{
        const node=document.querySelector(sel);
        return [sel,node?getComputedStyle(node).backgroundColor:'missing'];
      }));
    });
    for(const [key,value] of Object.entries(planning)){
      expect(value,id+' '+key).not.toBe('missing');
      expect(contrast(cssRGB(value),'#FFFFFF'),id+' '+key+' is dark').toBeGreaterThanOrEqual(6);
    }
    if(id==='mitternacht'){
      await page.screenshot({path:'visual-review/dark-mitternacht-planning.png',fullPage:true});
      const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
      expect(axe.violations.map(v=>({id:v.id,impact:v.impact,targets:v.nodes.map(n=>n.target)})),id+' planning Axe').toEqual([]);
    }
    await page.locator('#designBtn').click();
    await expect(page.locator('#designDialog')).toBeVisible();
    const modal=await page.evaluate(()=>{
      const selectors=['#designDialog','#designPrimary','#designPresetGrid button'];
      return selectors.map(sel=>getComputedStyle(document.querySelector(sel)).backgroundColor);
    });
    for(const color of modal)
      expect(contrast(cssRGB(color),'#FFFFFF'),id+' modal surface must be dark').toBeGreaterThanOrEqual(5);
    if(id==='mitternacht'){
      await page.screenshot({path:'visual-review/dark-mitternacht-dialog.png',fullPage:true});
      const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
      expect(axe.violations.map(v=>({id:v.id,impact:v.impact,targets:v.nodes.map(n=>n.target)})),id+' dialog Axe').toEqual([]);
    }
    await page.locator('#designDialog button[value="cancel"]').last().click();
    await page.locator('#projectTabBtn').click();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme-mode','dark');
    await page.locator('#designBtn').click();
    await expect(page.locator(`#designPresetGrid [data-design-preset="${id}"]`)).toHaveAttribute('aria-pressed','true');
    await page.locator('#designDialog button[value="cancel"]').last().click();
  }

  // Export from a dark project contains the actual colors, not a browser-local theme id.
  const exportedPromise=page.waitForEvent('download');
  await page.locator('#centralExportBtn').click();
  await page.locator('#exportJsonBtn').click();
  const download=await exportedPromise;
  const saved=JSON.parse(readFileSync(await download.path(),'utf8'));
  expect(saved.schema).toBe('gantt-studio.project');
  expect(saved.project.design.colors.panelBg.toLowerCase()).toBe('#23332d');
  expect(saved.project.design.preset).toBeUndefined();
  expect(saved.project.tasks).toHaveLength(10);

  await page.locator('#projectSelect').selectOption(lightId);
  await expect(page.locator('html')).toHaveAttribute('data-theme-mode','light');
  const light=await page.evaluate(()=>{
    const root=document.documentElement,s=getComputedStyle(root);
    return {
      body:getComputedStyle(document.body).backgroundColor,
      color:s.getPropertyValue('--ui-ink').trim(),
      border:s.getPropertyValue('--border').trim()
    };
  });
  expect(contrast(cssRGB(light.body),'#FFFFFF')).toBeLessThan(1.4);
  expect(light.color).toBe('#192c3e');
  expect(light.border.toLowerCase()).toBe('#d8e1e4');
});

test('dark preset supports custom colors, mobile controls, and light print rendering',async({page})=>{
  test.setTimeout(90000);
  await page.goto('/');
  await page.locator('#loadDemoBtn').click();
  await expect(page.locator('#taskTableBody tr[data-task-row-id]')).toHaveCount(10);
  await page.locator('#designBtn').click();
  await page.locator('#designPresetGrid [data-design-preset="graphit"]').click();
  await page.locator('#designAccent').fill('#a89bc1');
  await expect(page.locator('#designPresetSelection')).toContainText('Individuelle');
  await page.locator('#saveDesignBtn').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme-mode','dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme-mode','dark');

  await page.setViewportSize({width:390,height:844});
  const narrow=await page.evaluate(()=>({
    pageOverflow:document.documentElement.scrollWidth-innerWidth,
    timelineWidth:document.querySelector('.gantt-left').getBoundingClientRect().width
  }));
  expect(narrow.pageOverflow).toBeLessThanOrEqual(2);
  expect(narrow.timelineWidth).toBeLessThanOrEqual(195);
  await page.locator('#designBtn').click();
  await expect(page.locator('#saveDesignBtn')).toBeInViewport();
  const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
  expect(axe.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}))).toEqual([]);
  await page.locator('#designDialog button[value="cancel"]').last().click();

  await page.emulateMedia({media:'print'});
  const print=await page.evaluate(()=>{
    const css=getComputedStyle(document.documentElement);
    return {
      scheme:css.colorScheme,
      bg:getComputedStyle(document.body).backgroundColor,
      gantt:getComputedStyle(document.querySelector('.task-row-left[data-task-id]')).backgroundColor,
      foreground:css.getPropertyValue('--ui-ink').trim()
    };
  });
  expect(print.scheme).toBe('light');
  expect(cssRGB(print.bg)).toBe('#FFFFFF');
  expect(cssRGB(print.gantt)).toBe('#FFFFFF');
  expect(print.foreground).toBe('#273C4A');
  await page.emulateMedia({media:'screen'});
  await expect(page.locator('html')).toHaveAttribute('data-theme-mode','dark');
});
