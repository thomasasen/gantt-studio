const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');

/**
 * Check all eleven persisted themes at all supported widths on the actual UI.
 * The left task list must stay vertically aligned with the SVG/DOM timeline.
 */
test('eleven themes across four viewports preserve Gantt row geometry',async({page})=>{
  test.setTimeout(180000);
  await page.goto('/');
  await page.locator('#loadDemoBtn').click();
  await expect(page.locator('#taskTableBody tr[data-task-row-id]')).toHaveCount(10);
  const themes=[
    ['odin','light'],['neutral','light'],['nordlicht','light'],
    ['sandstein','light'],['waldgruen','light'],['marine','light'],
    ['mitternacht','dark'],['graphit','dark'],['waldnacht','dark'],
    ['fjordlicht','hybrid'],['kupferatelier','hybrid']
  ];
  fs.mkdirSync('visual-review/engine-matrix',{recursive:true});
  const observations=[];
  for(const [theme,mode] of themes){
    await page.setViewportSize({width:1440,height:900});
    await page.locator('#designBtn').click();
    await page.locator('#designPresetGrid [data-design-preset="'+theme+'"]').click();
    await page.locator('#saveDesignBtn').click();
    await expect(page.locator('#designDialog')).toBeHidden();
    await expect(page.locator('html')).toHaveAttribute('data-theme-mode',mode);
    for(const width of [390,768,1024,1440]){
      await page.setViewportSize({width,height:900});
      await expect(page.locator('#ganttStage .gantt-grid')).toBeVisible();
      const snapshot=await page.evaluate(()=>{
        const stage=document.querySelector('#ganttStage');
        const left=[...stage.querySelectorAll('.task-row-left[data-task-id]')];
        const right=[...stage.querySelectorAll('.task-row-right[data-task-id]')];
        const rightById=new Map(right.map(row=>[row.dataset.taskId,row]));
        const misalignments=left.map(row=>{
          const counterpart=rightById.get(row.dataset.taskId);
          return counterpart?Math.abs(row.getBoundingClientRect().top-
            counterpart.getBoundingClientRect().top):Infinity;
        });
        return{
          documentOverflow:document.documentElement.scrollWidth-innerWidth,
          leftCount:left.length,rightCount:right.length,
          maxVerticalMismatchPx:Math.max(0,...misalignments),
          timelinePresent:!!stage.querySelector('.timeline-header')
        };
      });
      expect(snapshot.documentOverflow,theme+'/'+width).toBeLessThanOrEqual(2);
      expect(snapshot.leftCount,theme+'/'+width).toBe(10);
      expect(snapshot.rightCount,theme+'/'+width).toBe(10);
      expect(snapshot.maxVerticalMismatchPx,theme+'/'+width).toBeLessThanOrEqual(1);
      expect(snapshot.timelinePresent).toBe(true);
      observations.push({theme,mode,width,...snapshot});
      if(width===1440 || (width===390 && ['odin','graphit','fjordlicht'].includes(theme))){
        await page.screenshot({
          path:path.join('visual-review/engine-matrix',theme+'-'+width+'.png'),
          fullPage:true
        });
      }
    }
  }
  fs.writeFileSync('visual-review/engine-matrix/geometry.json',
    JSON.stringify(observations,null,2)+'\n');
  expect(observations).toHaveLength(44);
});
