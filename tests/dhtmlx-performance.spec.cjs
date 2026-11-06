const {test,expect}=require('@playwright/test');
const {mkdirSync,writeFileSync}=require('node:fs');
test('measured Native vs DHTMLX: identical 0, 1, 25, 250 and 1000 task fixtures',async({page})=>{
 test.setTimeout(240000);
 await page.goto('/spikes/dhtmlx/bench.html');
 await page.waitForFunction(()=>typeof window.__runDhtmlxBench==='function');
 const results=[];
 for(const count of [0,1,25,250,1000]){
  const metric=await page.evaluate(async c=>window.__runDhtmlxBench(c,3),count);
  expect(metric.count).toBe(count);
  for(const row of Object.values(metric.ms)){
    expect(row.samples).toHaveLength(3);
    for(const sample of row.samples)expect(sample).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(row.median)).toBe(true);
  }
  results.push(metric);
 }
 mkdirSync('performance-results',{recursive:true});
 writeFileSync('performance-results/dhtmlx-community-10.0.3.json',JSON.stringify(results,null,2)+'\n');
 await test.info().attach('dhtmlx-performance.json',{body:Buffer.from(JSON.stringify(results,null,2)),contentType:'application/json'});
});
