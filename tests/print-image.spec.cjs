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
