const {test,expect}=require('@playwright/test');

const demoView={zoom:'week',reorderable:false};
const staticFactory=()=>{
 let root;
 const caps=Object.freeze({id:'native-probe',offline:true});
 return {
  mount(options){root=options.container;},
  render({project}){root.textContent='SAFE:'+project.id;return {empty:false};},
  setViewport(view){root.dataset.scrollLeft=String(view.scrollLeft||0);},
  cancelInteraction(){},locateMarker(){return null;},focusTask(){return false;},
  destroy(){root?.replaceChildren();root=null;},
  getCapabilities(){return caps;}
 };
};

test('real isolated Frappe frame confirms readiness before async controller activation',async({page})=>{
 await page.goto('/spikes/frappe/index.html');
 await expect(page.locator('#status')).toContainText('Frappe: gerendert');
 const result=await page.evaluate(async()=>{
  const {createAsyncEngineController}=await import('/assets/js/engine/engine-controller.mjs?v=2.8.1');
  const {createFrappeEngine}=await import('/assets/js/engine/frappe/frappe-adapter.mjs?v=2.8.1');
  const file=await (await fetch('/examples/demo.gantt.json')).json();
  const host=document.createElement('div');document.body.append(host);
  const caps=Object.freeze({id:'previous'});
  const old=()=>{let root;return{
   mount(o){root=o.container;},render(){root.textContent='previous';return{empty:false};},
   setViewport(){},cancelInteraction(){},locateMarker(){return null;},focusTask(){return false;},
   destroy(){root?.replaceChildren();root=null;},getCapabilities(){return caps;}
  };};
  const controller=createAsyncEngineController(old);
  try{
   controller.mount({container:host,onError:()=>{},onSelect:()=>{},onStatus:()=>{},onIntent:async()=>{}});
   await controller.render({project:file.project,view:{zoom:'week',reorderable:false}});
   const switching=controller.switchEngine(createFrappeEngine);
   const during=controller.getCapabilities().id;
   const success=await switching;
   return{
    during,success,after:controller.getCapabilities().id,
    bars:document.body.lastElementChild.querySelector('iframe')?.contentDocument?.querySelectorAll('.bar-wrapper').length,
    noProjectMutation:file.project.tasks.length===10
   };
  }finally{controller.destroy();host.remove();}
 });
 expect(result).toEqual({
  during:'previous',success:true,after:'frappe-isolated-readonly',
  bars:10,noProjectMutation:true
 });
});

test('failed iframe readiness rejects switch and restores confirmed old project and viewport',async({page})=>{
 await page.goto('/spikes/frappe/index.html');
 await expect(page.locator('#status')).toContainText('Frappe: gerendert');
 const result=await page.evaluate(async()=>{
  const {createAsyncEngineController}=await import('/assets/js/engine/engine-controller.mjs?v=2.8.1');
  const {createFrappeEngine}=await import('/assets/js/engine/frappe/frappe-adapter.mjs?v=2.8.1');
  const host=document.createElement('div');document.body.append(host);
  let instance;
  const factory=()=>{
   let root;
   const caps=Object.freeze({id:'previous'});
   return instance={
    mount(o){root=o.container;},render({project}){root.textContent='SAFE:'+project.id;return{empty:false};},
    setViewport(v){root.dataset.scrollLeft=String(v.scrollLeft||0);},
    cancelInteraction(){},locateMarker(){return null;},focusTask(){return false;},
    destroy(){root?.replaceChildren();root=null;},getCapabilities(){return caps;}
   };
  };
  const controller=createAsyncEngineController(factory);
  try{
   controller.mount({container:host,onError:()=>{},onSelect:()=>{},onStatus:()=>{},onIntent:async()=>{}});
   await controller.render({project:{id:'A',tasks:[{
    id:'a-task',name:'Confirmed task',start:'2026-11-01',end:'2026-11-04',progress:0
   }]},view:{zoom:'day'}});
   await controller.setViewport({scrollLeft:55});
   let error;
   try{await controller.switchEngine(()=>createFrappeEngine({readyTimeoutMs:350,frameUrl:'/spikes/frappe/fixture-no-ready.html'}));}
   catch(e){error=e.message;}
   return{
    error,active:controller.getCapabilities().id,
    restored:host.textContent,scroll:host.dataset.scrollLeft,
    frames:host.querySelectorAll('iframe').length
   };
  }finally{controller.destroy();host.remove();}
 });
 expect(result.error).toMatch(/readiness timed out/);
 expect(result.active).toBe('previous');
 expect(result.restored).toContain('SAFE:A');
 expect(result.scroll).toBe('55');
 expect(result.frames).toBe(0);
});

test('rapid A-B-A project requests discard older frames and display only latest project',async({page})=>{
 await page.goto('/spikes/frappe/index.html');
 await expect(page.locator('#status')).toContainText('Frappe: gerendert');
 const data=await page.evaluate(async()=>{
  const {createAsyncEngineController}=await import('/assets/js/engine/engine-controller.mjs?v=2.8.1');
  const {createFrappeEngine}=await import('/assets/js/engine/frappe/frappe-adapter.mjs?v=2.8.1');
  const host=document.createElement('div');document.body.append(host);
  const controller=createAsyncEngineController(createFrappeEngine);
  const task=id=>({id,name:id,start:'2026-11-01',end:'2026-11-04',progress:0});
  const request=(id,count)=>({
   project:{id,tasks:Array.from({length:count},(_,i)=>task(id+'-'+i))},
   view:{zoom:'day',reorderable:false}
  });
  try{
   controller.mount({container:host,onError:()=>{},onSelect:()=>{},onStatus:()=>{},onIntent:async()=>{}});
   const a=controller.render(request('A',1));
   const b=controller.render(request('B',2));
   const c=controller.render(request('A',3));
   return{
    first:await a,second:await b,third:await c,
    bars:host.querySelector('iframe')?.contentDocument?.querySelectorAll('.bar-wrapper').length,
    frames:host.querySelectorAll('iframe').length
   };
  }finally{controller.destroy();host.remove();}
 });
 expect(data.first.superseded).toBe(true);
 expect(data.second.superseded).toBe(true);
 expect(data.third.empty).toBe(false);
 expect(data.bars).toBe(3);
 expect(data.frames).toBe(1);
});

test('synchronous production controller rejects async Frappe before disturbing renderer',async({page})=>{
 await page.goto('/spikes/frappe/index.html');
 const result=await page.evaluate(async()=>{
  const {createEngineController}=await import('/assets/js/engine/engine-controller.mjs?v=2.8.1');
  const {createFrappeEngine}=await import('/assets/js/engine/frappe/frappe-adapter.mjs?v=2.8.1');
  const host=document.createElement('div');document.body.append(host);
  const controller=createEngineController(createFrappeEngine);
  try{
   let reason;
   try{controller.mount({container:host});}catch(error){reason=error.message;}
   return {reason,frames:host.querySelectorAll('iframe').length};
  }finally{controller.destroy();host.remove();}
 });
 expect(result.reason).toContain('createAsyncEngineController');
 expect(result.frames).toBe(0);
});


test('atomic stage preserves visible DOM until a real frame is allowed to load',async({page})=>{
 await page.goto('/spikes/frappe/index.html');
 await expect(page.locator('#status')).toContainText('Frappe: gerendert');
 let allowFrame;
 const frameGate=new Promise(resolve=>{allowFrame=resolve;});
 await page.route('**/spikes/frappe/frame.html',async route=>{
  await frameGate;
  await route.continue();
 });
 const pending=page.evaluate(async()=>{
  const {createAsyncEngineController}=await import('/assets/js/engine/engine-controller.mjs?v=2.8.1');
  const {createFrappeEngine}=await import('/assets/js/engine/frappe/frappe-adapter.mjs?v=2.8.1');
  const file=await (await fetch('/examples/demo.gantt.json')).json();
  const host=document.createElement('div');host.id='atomic-old';
  host.style.height='410px';
  document.body.append(host);
  const caps=Object.freeze({id:'old'});
  const factory=()=>{let root;return{
   mount(options){root=options.container;},
   render(){root.textContent='CONFIRMED CHART';return{empty:false};},
   setViewport(){},cancelInteraction(){},locateMarker(){return null;},
   focusTask(){return false;},getCapabilities(){return caps;},
   destroy(){root?.replaceChildren();root=null;}
  };};
  const controller=createAsyncEngineController(factory);
  try{
   controller.mount({container:host,onError:()=>{},onSelect:()=>{},onStatus:()=>{},onIntent:async()=>false});
   await controller.render({project:file.project,view:{zoom:'week',reorderable:false}});
   const switched=await controller.switchEngine(createFrappeEngine);
   const active=document.body.lastElementChild;
   return{
    switched,
    oldGone:!document.getElementById('atomic-old'),
    newFrameCount:active.querySelectorAll('iframe').length,
    bars:active.querySelector('iframe')?.contentDocument?.querySelectorAll('.bar-wrapper').length,
    activeHidden:active.hasAttribute('aria-hidden')||active.inert,
    projectUnchanged:file.project.tasks.length===10
   };
  }finally{controller.destroy();host.remove();}
 });
 try{
  const old=page.locator('#atomic-old');
  const stage=page.locator('#atomic-old + div[aria-hidden="true"]');
  await expect(stage).toHaveCount(1);
  await expect(old).toHaveText('CONFIRMED CHART');
  await expect(old).toBeVisible();
  await expect(stage).toBeHidden();
  expect(await stage.evaluate(el=>el.inert)).toBe(true);
  expect(await old.evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThan(0);
  const during=await page.evaluate(()=>({
   stageCount:document.querySelectorAll('#atomic-old + div[aria-hidden="true"] iframe').length,
   nativeAlive:document.getElementById('atomic-old').textContent==='CONFIRMED CHART'
  }));
  expect(during).toEqual({stageCount:1,nativeAlive:true});
 }finally{allowFrame();}
 expect(await pending).toEqual({
  switched:true,oldGone:true,newFrameCount:1,bars:10,
  activeHidden:false,projectUnchanged:true
 });
});

test('failed staged iframe does not destroy or re-render old DOM across viewport sizes',async({page})=>{
 await page.goto('/spikes/frappe/index.html');
 for(const width of [390,768,1024,1440]){
  await page.setViewportSize({width,height:850});
  const result=await page.evaluate(async()=>{
   const {createAsyncEngineController}=await import('/assets/js/engine/engine-controller.mjs?v=2.8.1');
   const {createFrappeEngine}=await import('/assets/js/engine/frappe/frappe-adapter.mjs?v=2.8.1');
   const host=document.createElement('div');host.style.width='100%';
   document.body.append(host);
   const cap=Object.freeze({id:'old'});let renders=0,destroys=0;
   const c=createAsyncEngineController(()=>{let root;return{
    mount(o){root=o.container;},render(){++renders;root.textContent='VISIBLE';return{empty:false};},
    setViewport(){},cancelInteraction(){},locateMarker(){return null;},
    focusTask(){return false;},destroy(){++destroys;root?.replaceChildren();root=null;},
    getCapabilities(){return cap;}
   };});
   try{
    c.mount({container:host});await c.render({project:{id:'p',tasks:[{
     id:'t',name:'T',start:'2026-11-01',end:'2026-11-03'
    }]},view:{zoom:'day'}});
    let rejected=false;
    try{await c.switchEngine(()=>createFrappeEngine({
     readyTimeoutMs:80,frameUrl:'/spikes/frappe/fixture-no-ready.html'
    }));}catch(e){rejected=/timed out/.test(e.message);}
    return {rejected,text:host.textContent,renders,destroys,
     active:c.getCapabilities().id,orphanFrames:host.parentElement.querySelectorAll('.studio-frappe-frame').length};
   }finally{c.destroy();host.remove();}
  });
  expect(result).toEqual({
   rejected:true,text:'VISIBLE',renders:1,destroys:0,active:'old',orphanFrames:1
  });
 }
});
