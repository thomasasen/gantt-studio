import test from 'node:test';
import assert from 'node:assert/strict';
import {createAsyncEngineController} from '../assets/js/engine/engine-async-controller.mjs';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const project=id=>({id,tasks:[{id:'t',start:'2026-11-10',end:'2026-11-12'}]});
const view={zoom:'day',reorderable:true};
function mock(name,log,behavior={}) {
 const cap=Object.freeze({id:name,offline:true});
 return {
  mount(opts){log.push(name+':mount');behavior.mount?.(opts);},
  render(req){log.push(name+':render:'+req.project.id);return behavior.render?.(req) || {empty:false};},
  renderAsync(req,{signal}={}){log.push(name+':renderAsync:'+req.project.id);return behavior.renderAsync?.(req,signal) ?? {empty:false};},
  setViewport(v){log.push(name+':viewport:'+v.scrollLeft);return behavior.setViewport?.(v);},
  cancelInteraction(){log.push(name+':cancel');},
  locateMarker(){return null;},focusTask(){return false;},
  destroy(){log.push(name+':destroy');behavior.destroy?.();},
  getCapabilities(){return cap;}
 };
}
test('async readiness only commits newest immutable snapshot',async()=>{
 const log=[],gate=deferred();let called=0;
 const c=createAsyncEngineController(()=>mock('old',log,{renderAsync(req){if(++called===1)return gate.promise;return {empty:false};}}));
 c.mount({container:{}});
 const a=c.render({project:project('A'),view});
 await Promise.resolve();await Promise.resolve();
 const b=c.render({project:project('B'),view});
 gate.resolve({empty:false});
 assert.deepEqual(await a,{superseded:true});
 assert.deepEqual(await b,{empty:false});
 assert.deepEqual(log.filter(x=>x.includes(':renderAsync:')),['old:renderAsync:A','old:renderAsync:B']);
 c.destroy();
});
test('rejected async render restores last committed request and is retryable',async()=>{
 const log=[];let fail=true;
 const c=createAsyncEngineController(()=>mock('old',log,{renderAsync(req){if(req.project.id==='B'&&fail)throw Error('no frame');return {empty:false};}}));
 c.mount({container:{}});await c.render({project:project('A'),view});
 await assert.rejects(c.render({project:project('B'),view}),/no frame/);
 assert.deepEqual(log.filter(x=>x.includes(':renderAsync:')),['old:renderAsync:A','old:renderAsync:B','old:renderAsync:A']);
 fail=false;await c.render({project:project('C'),view});c.destroy();
});
test('async render fails closed when no snapshot can be restored',async()=>{
 const log=[];let bad=true;
 const c=createAsyncEngineController(()=>mock('old',log,{renderAsync(){if(bad)throw Error('fail');return {empty:false};}}));
 c.mount({container:{}});
 await assert.rejects(c.render({project:project('A'),view}),AggregateError);
 await assert.rejects(c.render({project:project('B'),view}),/mounted/);
 bad=false;c.mount({container:{}});await c.render({project:project('A'),view});c.destroy();
});
test('rollback failure is aggregated and controller fails closed',async()=>{
 const log=[];let count=0;
 const c=createAsyncEngineController(()=>mock('old',log,{renderAsync(){if(++count>=2)throw Error('bad');return {empty:false};}}));
 c.mount({container:{}});await c.render({project:project('A'),view});
 let thrown;try{await c.render({project:project('B'),view});}catch(e){thrown=e;}
 assert.equal(thrown instanceof AggregateError,true);
 assert.equal(thrown.errors.length,2);
 await assert.rejects(c.render({project:project('C'),view}),/mounted/);
});
test('switch commits adapter only after async readiness and preserves viewport',async()=>{
 const a=[],b=[],gate=deferred();
 const c=createAsyncEngineController(()=>mock('native',a));
 c.mount({container:{}});await c.render({project:project('A'),view});await c.setViewport({scrollLeft:55});
 const switched=c.switchEngine(()=>mock('frappe',b,{renderAsync(){return gate.promise;}}));
 await Promise.resolve();await Promise.resolve();
 assert.equal(c.getCapabilities().id,'native');
 gate.resolve({empty:false});
 assert.equal(await switched,true);
 assert.equal(c.getCapabilities().id,'frappe');
 assert.ok(b.includes('frappe:viewport:55'));
 c.destroy();
});
test('switch failure after async frame rejection restores old engine and data',async()=>{
 const a=[],b=[];
 const c=createAsyncEngineController(()=>mock('native',a));
 c.mount({container:{}});await c.render({project:project('A'),view});await c.setViewport({scrollLeft:32});
 await assert.rejects(c.switchEngine(()=>mock('frappe',b,{renderAsync(){throw Error('frame rejected');}})),/frame rejected/);
 assert.equal(c.getCapabilities().id,'native');
 assert.ok(a.includes('native:renderAsync:A'));
 assert.equal(a.filter(x=>x==='native:renderAsync:A').length,1);
 assert.equal(a.filter(x=>x==='native:destroy').length,0);
 assert.equal(a.filter(x=>x==='native:mount').length,1);
 await c.render({project:project('B'),view});c.destroy();
});
test('superseding a pending switch restores old engine before executing newest request',async()=>{
 const a=[],b=[],gate=deferred();
 const c=createAsyncEngineController(()=>mock('native',a));
 c.mount({container:{}});await c.render({project:project('A'),view});
 const sw=c.switchEngine(()=>mock('frappe',b,{renderAsync(){return gate.promise;}}));
 await Promise.resolve();await Promise.resolve();
 const newRequest=c.render({project:project('B'),view});
 gate.resolve({empty:false});
 assert.deepEqual(await sw,{superseded:true});
 assert.deepEqual(await newRequest,{empty:false});
 assert.equal(c.getCapabilities().id,'native');
 assert.equal(a.filter(x=>x==='native:renderAsync:A').length,1);
 assert.equal(a.filter(x=>x==='native:destroy').length,0);
 assert.ok(a.includes('native:renderAsync:B'));
 c.destroy();
});
test('destroy during pending switch forbids stale activation and cleans both engines',async()=>{
 const a=[],b=[],gate=deferred();
 const c=createAsyncEngineController(()=>mock('native',a));
 c.mount({container:{}});await c.render({project:project('A'),view});
 const sw=c.switchEngine(()=>mock('frappe',b,{renderAsync(){return gate.promise;}}));
 await Promise.resolve();await Promise.resolve();
 c.destroy();gate.resolve({empty:false});
 assert.deepEqual(await sw,{superseded:true});
 assert.equal(c.getCapabilities().id,'native');
 assert.ok(a.includes('native:destroy'));
 assert.ok(b.includes('frappe:destroy'));
 await assert.rejects(c.render({project:project('B'),view}),/mounted/);
});
test('failed prepare does not remount or destroy the visible old engine',async()=>{
 const a=[],b=[];let mounts=0;
 const c=createAsyncEngineController(()=>mock('native',a,{mount(){++mounts;}}));
 c.mount({container:{}});await c.render({project:project('A'),view});
 await assert.rejects(c.switchEngine(()=>mock('frappe',b,{
   renderAsync(){throw Error('candidate fails');}
 })),/candidate fails/);
 assert.equal(mounts,1);
 assert.equal(a.filter(x=>x==='native:destroy').length,0);
 assert.equal(c.getStatus(),'active');
 assert.equal(c.getCapabilities().id,'native');
 await c.render({project:project('B'),view});
 c.destroy();
});

test('stale failures from superseded render do not roll back newer successful render',async()=>{
 const log=[],gate=deferred();let first=true;
 const c=createAsyncEngineController(()=>mock('native',log,{renderAsync(){if(first){first=false;return gate.promise;}return {empty:false};}}));
 c.mount({container:{}});
 const slow=c.render({project:project('A'),view});await Promise.resolve();await Promise.resolve();
 const newest=c.render({project:project('B'),view});
 gate.reject(Error('late stale failure'));
 assert.deepEqual(await slow,{superseded:true});
 assert.deepEqual(await newest,{empty:false});
 c.destroy();
});
test('viewport requests do not abort pending renderer readiness',async()=>{
 const log=[],gate=deferred();let signal;
 const c=createAsyncEngineController(()=>mock('native',log,{renderAsync(req,s){signal=s;return gate.promise;}}));
 c.mount({container:{}});
 const rendering=c.render({project:project('A'),view});
 await Promise.resolve();await Promise.resolve();
 const scrolling=c.setViewport({scrollLeft:52});
 assert.equal(signal.aborted,false);
 gate.resolve({empty:false});
 assert.deepEqual(await rendering,{empty:false});
 assert.equal(await scrolling,true);
 assert.equal(signal.aborted,false);
 assert.ok(log.includes('native:viewport:52'));
 c.destroy();
});
test('newer render aborts previous asynchronous render signal',async()=>{
 const log=[],seen=[];let first=true;
 const c=createAsyncEngineController(()=>mock('native',log,{renderAsync(req,signal){
  seen.push(signal);
  if(first){first=false;return new Promise((resolve,reject)=>{
   signal.addEventListener('abort',()=>reject(Error('aborted')), {once:true});
  });}
  return {empty:false};
 }}));
 c.mount({container:{}});
 const a=c.render({project:project('A'),view});
 await Promise.resolve();await Promise.resolve();
 const b=c.render({project:project('B'),view});
 assert.deepEqual(await a,{superseded:true});
 assert.deepEqual(await b,{empty:false});
 assert.equal(seen[0].aborted,true);
 c.destroy();
});

test('stale viewport work cannot mutate a new mount session after destroy and remount',async()=>{
 const first=[],second=[];
 let calls=0;
 const c=createAsyncEngineController(()=>mock('session-'+(++calls),calls===1?first:second));
 c.mount({container:{}});await c.render({project:project('A'),view});
 const stale=c.setViewport({scrollLeft:999});
 c.destroy();
 c.mount({container:{}});await c.render({project:project('B'),view});
 assert.deepEqual(await stale,{superseded:true});
 assert.equal(second.some(s=>s.includes('999')),false);
 c.destroy();
});
test('invalid async engine factory restores last confirmed projection after aborting in-flight work',async()=>{
 const log=[],block=deferred();
 const c=createAsyncEngineController(()=>mock('native',log,{
  renderAsync(req,signal){
   if(req.project.id==='B'){
    signal?.addEventListener('abort',()=>block.reject(new Error('aborted')), {once:true});
    return block.promise;
   }
   return {empty:false};
  }
 }));
 c.mount({container:{}});await c.render({project:project('A'),view});
 const interrupted=c.render({project:project('B'),view});
 await Promise.resolve();await Promise.resolve();
 await assert.rejects(c.switchEngine(()=>({})),/contract|missing/);
 assert.deepEqual(await interrupted,{superseded:true});
 assert.equal(log.filter(x=>x==='native:renderAsync:A').length,1);
 assert.equal(c.getCapabilities().id,'native');
 c.destroy();
});


test('prepare retains the old engine and publishes only after readiness',async()=>{
 const a=[],b=[],ready=deferred();
 const c=createAsyncEngineController(()=>mock('native',a));
 c.mount({container:{}});await c.render({project:project('A'),view});
 const transition=c.switchEngine(()=>mock('frappe',b,{renderAsync:()=>ready.promise}));
 await Promise.resolve();await Promise.resolve();await Promise.resolve();
 assert.equal(c.getStatus(),'preparing');
 assert.equal(c.getCapabilities().id,'native');
 assert.equal(a.includes('native:destroy'),false);
 assert.equal(b.includes('frappe:mount'),true);
 ready.resolve({empty:false});
 assert.equal(await transition,true);
 assert.equal(c.getStatus(),'active');
 assert.equal(a.filter(x=>x==='native:destroy').length,1);
 c.destroy();
 assert.equal(b.filter(x=>x==='frappe:destroy').length,1);
});

test('abort unblocks a candidate that ignores AbortSignal and destroys it once',async()=>{
 const old=[],pending=[],started=deferred();
 const c=createAsyncEngineController(()=>mock('native',old));
 c.mount({container:{}});await c.render({project:project('A'),view});
 const slow=c.switchEngine(()=>mock('stuck',pending,{
  renderAsync(){started.resolve();return new Promise(()=>{});}
 }));
 await started.promise;
 const newest=c.render({project:project('B'),view});
 assert.deepEqual(await slow,{superseded:true});
 assert.deepEqual(await newest,{empty:false});
 assert.equal(c.getCapabilities().id,'native');
 assert.equal(old.filter(x=>x==='native:destroy').length,0);
 assert.equal(pending.filter(x=>x==='stuck:destroy').length,1);
 c.destroy();
});

test('failed factory and mount keep original instance and snapshot without rollback draw',async()=>{
 const log=[];
 const c=createAsyncEngineController(()=>mock('native',log));
 c.mount({container:{}});await c.render({project:project('A'),view});
 await assert.rejects(c.switchEngine(()=>{throw Error('factory');}),/factory/);
 await assert.rejects(c.switchEngine(()=>mock('bad',[],{
  mount(){throw Error('mount');}
 })),/mount/);
 assert.deepEqual(log.filter(x=>x==='native:renderAsync:A'),['native:renderAsync:A']);
 assert.equal(log.filter(x=>x==='native:destroy').length,0);
 c.destroy();
});

test('postcommit destroy exception is reported while new engine stays active',async()=>{
 const errors=[],log=[];
 const c=createAsyncEngineController(()=>mock('old',log,{
  destroy(){throw Error('old cleanup');}
 }));
 c.mount({container:{},onError:e=>errors.push(e.message)});
 await c.render({project:project('A'),view});
 const result=await c.switchEngine(()=>mock('new',[]));
 assert.equal(result,true);
 assert.equal(c.getCapabilities().id,'new');
 assert.deepEqual(errors,['old cleanup']);
 c.destroy();
});

test('destroy during an uncooperative pending switch settles without stale commit',async()=>{
 const gate=deferred(),started=deferred(),a=[],b=[];
 const c=createAsyncEngineController(()=>mock('old',a));
 c.mount({container:{}});await c.render({project:project('A'),view});
 const slow=c.switchEngine(()=>mock('new',b,{
  renderAsync(){started.resolve();return gate.promise;}
 }));
 await started.promise;
 c.destroy();
 assert.deepEqual(await slow,{superseded:true});
 assert.equal(b.filter(x=>x==='new:destroy').length,1);
 assert.equal(a.filter(x=>x==='old:destroy').length,1);
 gate.resolve({empty:false});
});


test('only latest of simultaneous switch intents may publish',async()=>{
 const old=[],first=[],second=[],started=deferred();
 const c=createAsyncEngineController(()=>mock('native',old));
 c.mount({container:{}});await c.render({project:project('A'),view});
 const a=c.switchEngine(()=>mock('candidate-A',first,{
  renderAsync(){started.resolve();return new Promise(()=>{});}
 }));
 await started.promise;
 const b=c.switchEngine(()=>mock('candidate-B',second));
 assert.deepEqual(await a,{superseded:true});
 assert.equal(await b,true);
 assert.equal(c.getCapabilities().id,'candidate-B');
 assert.equal(first.filter(x=>x==='candidate-A:destroy').length,1);
 assert.equal(old.filter(x=>x==='native:destroy').length,1);
 c.destroy();
});

test('candidate receives frozen confirmed project even if caller mutates its original',async()=>{
 const original=project('A'),observed=[];
 const c=createAsyncEngineController(()=>mock('native',[]));
 c.mount({container:{}});
 await c.render({project:original,view});
 original.tasks[0].start='2040-01-01';
 const result=await c.switchEngine(()=>mock('candidate',[],{
  renderAsync(req){
   observed.push({
    date:req.project.tasks[0].start,
    projectFrozen:Object.isFrozen(req.project),
    tasksFrozen:Object.isFrozen(req.project.tasks),
    taskFrozen:Object.isFrozen(req.project.tasks[0]),
    viewFrozen:Object.isFrozen(req.view)
   });
   return {empty:false};
  }
 }));
 assert.equal(result,true);
 assert.deepEqual(observed,[{
  date:'2026-11-10',projectFrozen:true,tasksFrozen:true,taskFrozen:true,viewFrozen:true
 }]);
 c.destroy();
});


test('a factory returning the active adapter is rejected without destroying it',async()=>{
 const log=[],adapter=mock('same',log);
 const c=createAsyncEngineController(()=>adapter);
 c.mount({container:{}});await c.render({project:project('A'),view});
 await assert.rejects(c.switchEngine(()=>adapter),/fresh adapter/);
 assert.equal(log.filter(x=>x==='same:destroy').length,0);
 assert.equal(c.getCapabilities().id,'same');
 await c.render({project:project('B'),view});
 c.destroy();
 assert.equal(log.filter(x=>x==='same:destroy').length,1);
});
