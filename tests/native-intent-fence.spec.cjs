const {test,expect}=require('@playwright/test');

test('physical Native drag stamps the origin and a render switch cancels the old gesture',async({page})=>{
  await page.goto('/');
  await page.evaluate(async()=>{
    const {createNativeEngine}=await import('/assets/js/engine/native/native-adapter.mjs?v=2.8.1');
    const host=document.createElement('section');
    host.id='native-intent-probe';
    host.style.cssText='position:relative;width:1100px;min-height:250px;background:white;z-index:10;';
    const stage=document.createElement('div');
    stage.id='native-intent-probe-stage';
    host.appendChild(stage);
    document.body.prepend(host);
    const project={id:'native-probe',revision:7,tasks:[{
      id:'probe-task',name:'Probe',start:'2026-11-10',end:'2026-11-12',
      progress:15,showInGantt:true,type:'workstream'
    }],planning:{settings:{showToday:false},phases:[],markers:[],holidays:[]}};
    const engine=createNativeEngine(),intents=[];
    engine.mount({container:stage,onIntent:intent=>{intents.push(intent);return true;},
      onSelect:()=>{},onError:error=>{throw error;}});
    const render=()=>engine.render({project,view:{zoom:'day',reorderable:false,activationGeneration:3}});
    window.__nativeIntentProbe={engine,intents,render};
    render();
  });
  const bar=page.locator('#native-intent-probe-stage .gantt-bar[data-task-id="probe-task"]');
  await expect(bar).toBeVisible();
  async function beginDrag(){
    await bar.scrollIntoViewIfNeeded();
    const bounds=await bar.boundingBox();
    expect(bounds).toBeTruthy();
    const x=bounds.x+Math.min(30,bounds.width*.5),y=bounds.y+bounds.height/2;
    await page.mouse.move(x,y);await page.mouse.down();
    await page.mouse.move(x+50,y,{steps:8});
  }
  await beginDrag();
  await page.evaluate(()=>window.__nativeIntentProbe.render());
  await page.mouse.up();
  expect(await page.evaluate(()=>window.__nativeIntentProbe.intents.length)).toBe(0);
  await beginDrag();
  await page.mouse.up();
  await expect.poll(()=>page.evaluate(()=>window.__nativeIntentProbe.intents.length)).toBe(1);
  const intent=await page.evaluate(()=>window.__nativeIntentProbe.intents[0]);
  expect(intent.type).toBe('task-change');
  expect(intent.change.id).toBe('probe-task');
  expect(intent.scope).toEqual({
    projectId:'native-probe',expectedRevision:7,activationGeneration:3
  });
  expect(intent.change.start).not.toBe('2026-11-10');
  await page.evaluate(()=>window.__nativeIntentProbe.engine.destroy());
  await expect(page.locator('#native-intent-probe-stage')).toBeEmpty();
});
