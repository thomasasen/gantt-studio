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
 assert.ok(a.filter(x=>x==='native:renderAsync:A').length>=2);
 assert.ok(a.filter(x=>x==='native:viewport:32').length>=2);
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
 assert.equal(a.filter(x=>x==='native:renderAsync:A').length,2);
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
test('switch restoration fails closed with explicit aggregate errors',async()=>{
 const a=[],b=[];let mountCount=0;
 const c=createAsyncEngineController(()=>mock('native',a,{mount(){if(++mountCount>1)throw Error('restore fails');}}));
 c.mount({container:{}});await c.render({project:project('A'),view});
 let err;try{await c.switchEngine(()=>mock('frappe',b,{renderAsync(){throw Error('candidate fails');}}));}catch(e){err=e;}
 assert.equal(err instanceof AggregateError,true);
 assert.ok(err.errors.map(x=>x.message).includes('candidate fails'));
 assert.ok(err.errors.map(x=>x.message).includes('restore fails'));
 await assert.rejects(c.render({project:project('B'),view}),/mounted/);
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
