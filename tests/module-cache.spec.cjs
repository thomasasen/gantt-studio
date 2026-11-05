const {test,expect}=require('@playwright/test');
const {readFileSync}=require('node:fs');

test('production entrypoint versions every static ESM dependency',()=>{
  const html=readFileSync('index.html','utf8');
  const app=readFileSync('assets/js/app.js','utf8');
  const gantt=readFileSync('assets/js/gantt.js','utf8');
  const entry=html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"[^>]*><\/script>/);
  expect(entry,'application entrypoint').not.toBeNull();
  const version=new URL(entry[1],'https://example.test/').searchParams.get('v');
  expect(version,'versioned app module').toBeTruthy();
  const imports=[...app.matchAll(/^import\s+[^;]+?\s+from\s+['"]([^'"]+)['"]/gm)].map(m=>m[1]);
  expect(imports.length).toBeGreaterThanOrEqual(5);
  const ganttImports=[...gantt.matchAll(/^import\s+[^;]+?\s+from\s+['"]([^'"]+)['"]/gm)].map(m=>m[1]);
  expect(ganttImports).toContain(`./icons.mjs?v=${version}`);
  for(const modulePath of imports){
    const imported=new URL(modulePath,'https://example.test/assets/js/');
    expect(imported.searchParams.get('v'),`Unversioned ESM dependency: ${modulePath}`).toBe(version);
  }
  // Verify the entire nested browser ESM graph, not only app.js.
  const {dirname,join,resolve}=require('node:path');
  const graph=['assets/js/app.js','assets/js/gantt.js',
    'assets/js/engine/engine-controller.mjs','assets/js/engine/engine-contract.mjs',
    'assets/js/engine/native/native-adapter.mjs',
    'assets/js/engine/native/native-interactions.mjs'];
  for(const moduleFile of graph){
    const source=readFileSync(moduleFile,'utf8');
    const imports=[...source.matchAll(/^import\\s+[^;]+?\\s+from\\s+['"]([^'"]+)['"]/gm)];
    for(const [,specifier] of imports){
      const parsed=new URL(specifier,'https://example.test/'+moduleFile);
      expect(parsed.searchParams.get('v'),moduleFile+' -> '+specifier).toBe(version);
      const filepath=resolve(dirname(moduleFile),specifier.split('?')[0]);
      expect(()=>readFileSync(filepath),moduleFile+' -> '+filepath).not.toThrow();
    }
  }
});

test('stale unversioned module cache must not disable all buttons',async({page})=>{
  const unversionedRequests=[],errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/assets/js/*',async route=>{
    const url=new URL(route.request().url());
    // Old ESM assets lacking exports would disable app.js before handlers bind.
    if(!url.searchParams.has('v')){
      unversionedRequests.push(url.pathname);
      await route.fulfill({status:200,contentType:'text/javascript',
        body:'export const cachedLegacyModule = true;'});
      return;
    }
    await route.continue();
  });
  await page.goto('/');
  await expect(page.locator('#projectSelect')).not.toHaveValue('');
  await expect(page.locator('#saveStatusText')).toContainText('Gespeichert');
  expect(unversionedRequests).toEqual([]);
  expect(errors).toEqual([]);

  await page.locator('#planningTabBtn').click();
  await expect(page.locator('#planningView')).toBeVisible();
  await page.locator('#projectTabBtn').click();
  await expect(page.locator('#projectView')).toBeVisible();
  await page.locator('#addTaskBtn').click();
  await expect(page.locator('#taskDialog')).toBeVisible();
  await page.locator('#taskDialog button[value="cancel"]').last().click();
  await page.locator('#designBtn').click();
  await expect(page.locator('#designDialog')).toBeVisible();
  await expect(page.locator('#designPresetGrid button')).toHaveCount(11);
  await page.locator('#designDialog button[value="cancel"]').last().click();
  expect(errors).toEqual([]);
});
