const {test,expect}=require('@playwright/test');
const {readFileSync}=require('node:fs');

async function openPrint(page){
  await page.goto('/');
  await page.locator('#loadDemoBtn').click();
  await page.locator('#centralExportBtn').click();
  await page.locator('#printPdfBtn').click();
  await expect(page.locator('#printPdfDialog')).toBeVisible();
}

test('PNG exports the whole Gantt in one image and fields share a baseline',async({page})=>{
  await page.setViewportSize({width:1280,height:850});
  await openPrint(page);
  await page.locator('[data-print="format"]').selectOption('png');
  const svg=page.frameLocator('#printFrame').locator('svg[role="img"]');
  await expect(svg).toBeVisible();
  await expect(svg).toContainText('Schnittstellenentwicklung');
  await expect(svg).toContainText('Hypercare und Stabilisierung');
  await expect(page.locator('#printCount')).toContainText('Vollständiges Diagramm');
  await expect(page.locator('[data-print="imageScale"]')).toBeVisible();
  await expect(page.locator('[data-print="imageScope"]')).toHaveCount(0);
  await expect(page.locator('.print-page-tools')).toBeHidden();
  const aligned=await page.evaluate(()=>{
    const boxes=['[data-print="format"]','[data-print="profile"]','[data-print-reset]','[data-print-output]']
      .map(selector=>document.querySelector(selector).getBoundingClientRect());
    const [format,profile,reset,output]=boxes;
    return {labelY:Math.abs(format.top-profile.top),labelHeight:Math.abs(format.height-profile.height),
      actionY:Math.abs(reset.top-output.top),actionHeight:Math.abs(reset.height-output.height)};
  });
  for(const value of Object.values(aligned))expect(value).toBeLessThan(1);
  const base=await svg.getAttribute('width');
  const [download]=await Promise.all([
    page.waitForEvent('download'),
    page.locator('[data-print-output]').click()
  ]);
  expect(download.suggestedFilename()).toMatch(/-gantt\.png$/);
  const bytes=readFileSync(await download.path());
  expect(bytes.subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(bytes.readUInt32BE(16)).toBe(Number(base)*2);
  expect(bytes.readUInt32BE(20)).toBeGreaterThan(500);
  expect(bytes.length).toBeGreaterThan(5000);
});

test('JPG exports the entire timeline as one JPEG and PDF still uses paper pages',async({page})=>{
  await openPrint(page);
  await page.locator('[data-print="format"]').selectOption('jpg');
  await page.locator('[data-print="jpegQuality"]').selectOption('80');
  await page.locator('[data-print="imageScale"]').selectOption('1');
  const svg=page.frameLocator('#printFrame').locator('svg[role="img"]');
  await expect(svg).toBeVisible();
  const [download]=await Promise.all([page.waitForEvent('download'),page.locator('[data-print-output]').click()]);
  expect(download.suggestedFilename()).toMatch(/-gantt\.jpg$/);
  const bytes=readFileSync(await download.path());
  expect(bytes.subarray(0,3).toString('hex')).toBe('ffd8ff');
  expect(bytes.length).toBeGreaterThan(5000);
  await page.locator('[data-print="format"]').selectOption('pdf');
  await expect(page.frameLocator('#printFrame').locator('.sheet').first()).toBeVisible();
  await expect(page.locator('[data-print="paper"]')).toBeVisible();
  await expect(page.locator('.print-page-tools')).toBeVisible();
});

test('complete image export remains independent of the Gantt scroller',async({page})=>{
  await openPrint(page);
  const scroller=page.locator('#ganttScroller');
  await scroller.evaluate(el=>{el.scrollLeft=10000;el.scrollTop=10000;});
  await page.locator('[data-print="format"]').selectOption('png');
  const diagram=page.frameLocator('#printFrame').locator('svg[role="img"]');
  await expect(diagram).toBeVisible();
  await expect(diagram).toContainText('Projekt-Kick-off');
  await expect(diagram).toContainText('Hypercare und Stabilisierung');
});


test('Gantt annotation labels fit inside one complete image without overlapping task rows',async({page})=>{
  await openPrint(page);
  await page.locator('[data-print="format"]').selectOption('png');
  const chart=page.frameLocator('#printFrame').locator('svg[role="img"]');
  await expect(chart).toBeVisible();
  const report=await chart.evaluate(svg=>{
    const labels=[...svg.querySelectorAll('.gantt-export-label')];
    const width=Number(svg.getAttribute('width')),height=Number(svg.getAttribute('height'));
    const bounds=labels.map(node=>{
      const box=node.getBBox();
      return {id:node.dataset.taskId,x:box.x,y:box.y,w:box.width,h:box.height,
        fullText:node.querySelector('title')?.textContent||'',text:node.textContent||''};
    });
    return {width,height,bounds};
  });
  expect(report.bounds.length).toBeGreaterThan(8);
  expect(report.bounds.some(item=>item.fullText.includes('Projekt-Kick-off'))).toBe(true);
  expect(report.bounds.some(item=>item.fullText.includes('Schnittstellenentwicklung'))).toBe(true);
  expect(report.bounds.some(item=>item.fullText.includes('Hypercare und Stabilisierung'))).toBe(true);
  for(const box of report.bounds){
    expect(box.x,box.id).toBeGreaterThanOrEqual(0);
    expect(box.y,box.id).toBeGreaterThanOrEqual(0);
    expect(box.x+box.w,box.id).toBeLessThanOrEqual(report.width+1);
    expect(box.y+box.h,box.id).toBeLessThanOrEqual(report.height+1);
  }
  // Annotations are on dedicated non-overlapping task rows.
  for(let i=0;i<report.bounds.length;i++)for(let j=i+1;j<report.bounds.length;j++){
    const a=report.bounds[i],b=report.bounds[j];
    const overlapX=a.x<b.x+b.w&&b.x<a.x+a.w;
    const overlapY=a.y<b.y+b.h&&b.y<a.y+a.h;
    expect(overlapX&&overlapY,a.id+' ↔ '+b.id).toBe(false);
  }
  await page.screenshot({path:'visual-review/gantt-image-label-preview.png'});
});
