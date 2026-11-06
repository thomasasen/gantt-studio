const {test,expect}=require('@playwright/test');
const AxeBuilder=require('@axe-core/playwright').default;

test('hybrid toast remains fully opaque when shown and fully hidden on dismissal',async({page})=>{
  await page.goto('/');
  await page.locator('#loadDemoBtn').click();
  await expect(page.locator('#taskTableBody tr[data-task-row-id]')).toHaveCount(10);
  await page.locator('#designBtn').click();
  await page.locator('#designPresetGrid [data-design-preset="fjordlicht"]').click();
  await page.locator('#saveDesignBtn').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme-mode','hybrid');
  const toast=page.locator('#toast');
  await page.evaluate(()=>{
    const toast=document.querySelector('#toast');
    toast.textContent='Design gespeichert.';
    toast.classList.add('show');
  });
  await expect(toast).toBeVisible();
  expect(await toast.evaluate(el=>getComputedStyle(el).opacity)).toBe('1');
  const analysis=await new AxeBuilder({page}).include('#toast').withTags(['wcag2aa','wcag21aa']).analyze();
  expect(analysis.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}))).toEqual([]);
  await page.evaluate(()=>document.querySelector('#toast').classList.remove('show'));
  await expect(toast).toBeHidden();
  expect(await toast.evaluate(el=>getComputedStyle(el).transitionDuration)).toBe('0s');
});
