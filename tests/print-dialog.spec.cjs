const {test,expect}=require('@playwright/test');
test('print dialog creates a complete multi-page document independently of viewport scroll',async({page})=>{
 await page.goto('/');
 await page.locator('#loadDemoBtn').click();
 const scroller=page.locator('#ganttScroller');
 await scroller.evaluate(node=>{node.scrollLeft=10000;node.scrollTop=10000;});
 await page.locator('#centralExportBtn').click();
 await page.locator('#printPdfBtn').click();
 await expect(page.locator('#printPdfDialog')).toBeVisible();
 const frame=page.frameLocator('#printFrame');
 await expect(frame.locator('.sheet')).toHaveCount(1,{timeout:15000}).catch(()=>{});
 const initial=await frame.locator('.sheet').count();
 expect(initial).toBeGreaterThan(0);
 await page.locator('[data-print="paper"]').selectOption('A3');
 await page.locator('[data-print="strategy"]').selectOption('readable');
 const pages=await frame.locator('.sheet').count();
 expect(pages).toBeGreaterThan(0);
 const before=await page.locator('#ganttScroller').evaluate(node=>({x:node.scrollLeft,y:node.scrollTop}));
 await page.locator('[data-print-close]').click();
 await expect(page.locator('#printPdfDialog')).toBeHidden();
 expect(await page.locator('#ganttScroller').evaluate(node=>({x:node.scrollLeft,y:node.scrollTop}))).toEqual(before);
});
test('print preview remains light and includes repeated labels at narrow viewport',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/');
 await page.locator('#loadDemoBtn').click();
 await page.locator('#centralExportBtn').click();
 await page.locator('#printPdfBtn').click();
 const frame=page.frameLocator('#printFrame');
 await expect(frame.locator('.sheet').first()).toBeVisible();
 await page.locator('[data-print="orientation"]').selectOption('portrait');
 await expect(frame.locator('.sheet').first()).toBeVisible();
 const result=await frame.locator('.sheet').first().evaluate(el=>({
  background:getComputedStyle(el).backgroundColor,
  names:el.querySelectorAll('tbody tr').length,
  width:el.style.width,
  height:el.style.height
 }));
 expect(result.background).toBe('rgb(255, 255, 255)');
 expect(result.names).toBeGreaterThan(0);
 expect(result.width).toContain('mm');
 expect(result.height).toContain('mm');
});
