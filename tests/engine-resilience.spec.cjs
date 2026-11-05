const {test,expect}=require('@playwright/test');
const {pathToFileURL}=require('node:url');
const {resolve}=require('node:path');
const url=pathToFileURL(resolve('assets/js/engine/engine-controller.mjs')).href;
const sample=id=>({id,tasks:[{id:'t',start:'2026-11-10',end:'2026-11-11'}]});
const view={zoom:'day',reorderable:true};
function fake(log,behaviors={}){
 const caps=Object.freeze({id:'test'});
 return {
  mount(o){log.push(['mount']);behaviors.mount?.(o);},
  render(r){log.push(['render',r.project.id]);behaviors.render?.(r);return{empty:false};},
  setViewport(v){log.push(['viewport',v.scrollLeft]);behaviors.viewport?.(v);},
  cancelInteraction(){log.push(['cancel']);},
  locateMarker(){return null;},focusTask(){return false;},
  destroy(){log.push(['destroy']);behaviors.destroy?.();},
  getCapabilities(){return caps;}
 };
}
test('mount failure cleans partially initialized adapter',async()=>{
 const {createEngineController}=await import(url);let fail=true;const log=[];
 const c=createEngineController(()=>fake(log,{mount(){if(fail)throw Error('mount failed');}}));
 expect(()=>c.mount({container:{}})).toThrow('mount failed');
 expect(log.map(x=>x[0])).toEqual(['mount','destroy']);
 fail=false;c.mount({container:{}});c.render({project:sample('ok'),view});c.destroy();
});
test('failed render restores last successful projection before switching',async()=>{
 const {createEngineController}=await import(url);const old=[],next=[];
 const c=createEngineController(()=>fake(old,{render(r){if(r.project.id==='bad')throw Error('render failed');}}));
 c.mount({container:{}});c.render({project:sample('ok'),view});
 expect(()=>c.render({project:sample('bad'),view})).toThrow('render failed');
 expect(old.filter(x=>x[0]==='render').map(x=>x[1])).toEqual(['ok','bad','ok']);
 c.switchEngine(()=>fake(next));
 expect(next.filter(x=>x[0]==='render').map(x=>x[1])).toEqual(['ok']);
 c.destroy();
});
test('failed switch rendering rolls back previous engine and viewport',async()=>{
 const {createEngineController}=await import(url);const old=[],next=[];
 const c=createEngineController(()=>fake(old));
 c.mount({container:{}});c.render({project:sample('ok'),view});c.setViewport({scrollLeft:55});
 expect(()=>c.switchEngine(()=>fake(next,{render(){throw Error('new renderer failed');}}))).toThrow('new renderer failed');
 expect(old.filter(x=>x[0]==='mount')).toHaveLength(2);
 expect(old.filter(x=>x[0]==='viewport').at(-1)[1]).toBe(55);
 expect(next.filter(x=>x[0]==='destroy')).toHaveLength(1);
 c.render({project:sample('again'),view});c.destroy();
});
test('failed render rollback is reported and controller fails closed',async()=>{
 const {createEngineController}=await import(url);const log=[];let fail=true;
 const c=createEngineController(()=>fake(log,{render(){if(fail&&log.filter(x=>x[0]==='render').length>1)throw Error('broken');}}));
 c.mount({container:{}});c.render({project:sample('ok'),view});
 let caught;try{c.render({project:sample('bad'),view});}catch(e){caught=e;}
 expect(caught).toBeInstanceOf(AggregateError);expect(caught.errors).toHaveLength(2);
 expect(()=>c.render({project:sample('again'),view})).toThrow(/mounted/);
 fail=false;c.mount({container:{}});c.render({project:sample('recovered'),view});c.destroy();
});
test('failed restoration on engine switch is never silently swallowed',async()=>{
 const {createEngineController}=await import(url);let mounts=0;const old=[];
 const c=createEngineController(()=>fake(old,{mount(){if(++mounts>1)throw Error('restore failed');}}));
 c.mount({container:{}});c.render({project:sample('ok'),view});
 let caught;try{c.switchEngine(()=>fake([],{mount(){throw Error('switch failed');}}));}catch(e){caught=e;}
 expect(caught).toBeInstanceOf(AggregateError);
 expect(caught.errors.map(e=>e.message)).toEqual(expect.arrayContaining(['restore failed','switch failed']));
 expect(()=>c.render({project:sample('ok'),view})).toThrow(/mounted/);
});
test('failed viewport update preserves last successful viewport',async()=>{
 const {createEngineController}=await import(url);const log=[],next=[];
 const c=createEngineController(()=>fake(log,{viewport(v){if(v.scrollLeft===999)throw Error('viewport failed');}}));
 c.mount({container:{}});c.render({project:sample('ok'),view});
 c.setViewport({scrollLeft:18});
 expect(()=>c.setViewport({scrollLeft:999})).toThrow('viewport failed');
 expect(log.filter(x=>x[0]==='viewport').map(x=>x[1])).toEqual([18,999,18]);
 c.switchEngine(()=>fake(next));expect(next.find(x=>x[0]==='viewport')[1]).toBe(18);c.destroy();
});
