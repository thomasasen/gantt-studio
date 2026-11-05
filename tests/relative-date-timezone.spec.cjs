const {test,expect}=require('@playwright/test');

/**
 * A UTC calendar day is not necessarily the day users see in their timezone.
 * The relative target and the today line must use the same local date.
 */
test('relative target respects local midnight in Berlin, New York and Auckland',async({browser})=>{
  const cases=[
    {timezoneId:'Europe/Berlin',expected:'2026-03-29'},
    {timezoneId:'America/New_York',expected:'2026-03-28'},
    {timezoneId:'Pacific/Auckland',expected:'2026-03-29'}
  ];
  for(const {timezoneId,expected} of cases){
    const context=await browser.newContext({timezoneId});
    try{
      const page=await context.newPage();
      await page.clock.install({time:new Date('2026-03-28T23:30:00.000Z')});
      await page.goto('/');
      const result=await page.evaluate(async()=>{
        const {renderGantt}=await import('/assets/js/gantt.js?v=2.8.0');
        const {localTodayIso}=await import('/assets/js/core/date-only.mjs?v=2.8.0');
        const start=localTodayIso(),stage=document.createElement('div');
        document.body.appendChild(stage);
        const project={
          id:'timezone-probe',tasks:[{
            id:'t',name:'Date probe',type:'workstream',
            start,end:start,progress:0,showInGantt:true
          }],
          planning:{settings:{
            showToday:true,showRelativeToday:true,relativeOffsetDays:0,
            relativeDayMode:'calendar',relativeLabel:'Target'
          },phases:[],holidays:[],markers:[]}
        };
        const rendered=renderGantt(stage,project,{zoom:'day'});
        const target=stage.querySelector('.relative-today-line')?.dataset.relativeTarget;
        const today=stage.querySelector('.today-line')?.style.left;
        const relative=stage.querySelector('.relative-today-line')?.style.left;
        rendered.destroy();stage.remove();
        return{start,target,today,relative};
      });
      expect(result.start,timezoneId).toBe(expected);
      expect(result.target,timezoneId).toBe(expected);
      expect(result.relative,timezoneId).toBe(result.today);
    }finally{await context.close();}
  }
});
