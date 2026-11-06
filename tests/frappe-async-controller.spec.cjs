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
    bars:host.querySelector('iframe')?.contentDocument?.querySelectorAll('.bar-wrapper').length,
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
 await page.route('**/spikes/frappe/frame.html',route=>route.fulfill({
   status:200,contentType:'text/html',body:'<!doctype html><title>no ready event</title>'
 }));
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
   await controller.render({project:{id:'A',tasks:[]},view:{zoom:'day'}});
   await controller.setViewport({scrollLeft:55});
   let error;
   try{await controller.switchEngine(()=>createFrappeEngine({readyTimeoutMs:350}));}
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
