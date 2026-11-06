const {test,expect}=require('@playwright/test');
const {execFileSync}=require('node:child_process');
const {mkdirSync,writeFileSync}=require('node:fs');
const {join}=require('node:path');

test('actual Chromium PDF contains every selected task and correct page dimensions',async({page,browser})=>{
  await page.goto('/');
  await page.locator('#loadDemoBtn').click();
  await page.locator('#centralExportBtn').click();
  await page.locator('#printPdfBtn').click();
  await expect(page.locator('#printPdfDialog')).toBeVisible();
  await page.locator('[data-print="paper"]').selectOption('A3');
  await page.locator('[data-print="orientation"]').selectOption('landscape');
  await page.locator('[data-print="strategy"]').selectOption('readable');
  const {html,expected}=await page.evaluate(()=>{
    const frame=document.querySelector('#printFrame');
    const printDocument=frame.contentDocument;
    return {html:frame.srcdoc,expected:printDocument.querySelectorAll('.sheet').length};
  });
  expect(expected).toBeGreaterThan(0);
  mkdirSync('visual-review',{recursive:true});
  await page.frameLocator('#printFrame').locator('.sheet').first().screenshot({path:'visual-review/gantt-print-a3-preview.png'});
  const pdfPage=await browser.newPage();
  await pdfPage.setContent(html,{waitUntil:'load'});
  const pdf=await pdfPage.pdf({printBackground:true,preferCSSPageSize:true});
  await pdfPage.close();
  expect(pdf.subarray(0,5).toString()).toBe('%PDF-');
  const info=execFileSync('pdfinfo',['-'],{input:pdf,encoding:'utf8'});
  const text=execFileSync('pdftotext',['-','-'],{input:pdf,encoding:'utf8'});
  const pages=Number(info.match(/^Pages:\s+(\d+)/m)?.[1]);
  expect(pages).toBe(expected);
  const size=info.match(/Page size:\s+([0-9.]+)\s+x\s+([0-9.]+)\s+pts/);
  expect(size,'Expected PDF page dimensions from pdfinfo').not.toBeNull();
  // Chromium rounds CSS millimetres through device/PDF units. Accept < 1 mm.
  expect(Math.abs(Number(size[1])-420*72/25.4)).toBeLessThan(72/25.4);
  expect(Math.abs(Number(size[2])-297*72/25.4)).toBeLessThan(72/25.4);
  // Poppler may suppress hyphens at rendered line breaks. Match the full
  // alphanumeric task label, not extractor-specific whitespace/hyphenation.
  const normalize=source=>source.toLocaleLowerCase('de-DE').replace(/[^\p{L}\p{N}]/gu,'');
  for(const task of ['Projekt-Kick-off','Ist-Analyse und Stakeholder-Interviews','Schnittstellenentwicklung','Hypercare und Stabilisierung']){
    expect(normalize(text)).toContain(normalize(task));
  }
  expect(text).toContain('2026');
  writeFileSync(join('visual-review','gantt-print-a3-landscape.pdf'),pdf);
});
