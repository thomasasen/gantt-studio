const {test,expect}=require('@playwright/test');
const {resolve}=require('node:path');
const {pathToFileURL}=require('node:url');
const moduleUrl=pathToFileURL(resolve('assets/js/core/project-activation.mjs')).href;
const deferred=()=>{
  let resolve,reject;
  const promise=new Promise((ok,bad)=>{resolve=ok;reject=bad;});
  return {promise,resolve,reject};
};

test('out-of-order A -> B -> A loads publish only the newest intent',async()=>{
  const {createProjectActivationCoordinator}=await import(moduleUrl);
  const reads=[],presented=[];
  const coordinator=createProjectActivationCoordinator({
    load:id=>{const gate=deferred();reads.push({id,...gate});return gate.promise;},
    present:data=>presented.push(data)
  });
  const first=coordinator.activate('A',coordinator.begin());
  const second=coordinator.activate('B',coordinator.begin());
  const third=coordinator.activate('A',coordinator.begin());
  reads[1].resolve({id:'B',tasks:[]});
  reads[0].resolve({id:'A',tasks:[1]});
  expect(await second).toBe(false);
  expect(await first).toBe(false);
  expect(presented).toEqual([]);
  reads[2].resolve({id:'A',tasks:[1,2,3]});
  expect(await third).toBe(true);
  expect(presented).toEqual([{id:'A',tasks:[1,2,3]}]);
});

test('fast A -> B switching rejects a slower stale IndexedDB response',async()=>{
  const {createProjectActivationCoordinator}=await import(moduleUrl);
  const slow=deferred(),presented=[];
  const controller=createProjectActivationCoordinator({
    load:id=>id==='A'?slow.promise:Promise.resolve({id:'B',tasks:[]}),
    present:snapshot=>presented.push(snapshot.id)
  });
  const older=controller.activate('A',controller.begin());
  const newest=controller.activate('B',controller.begin());
  expect(await newest).toBe(true);
  slow.resolve({id:'A',tasks:[1,2]});
  expect(await older).toBe(false);
  expect(presented).toEqual(['B']);
});

test('failed load does not activate and a subsequent retry succeeds',async()=>{
  const {createProjectActivationCoordinator}=await import(moduleUrl);
  let fail=true,active='A',saved='A';
  const controller=createProjectActivationCoordinator({
    load:async id=>{if(fail)throw Error('IndexedDB unavailable');return{id};},
    present:next=>{active=next.id;saved=next.id;}
  });
  await expect(controller.activate('B',controller.begin())).rejects.toThrow('IndexedDB unavailable');
  expect({active,saved}).toEqual({active:'A',saved:'A'});
  fail=false;
  expect(await controller.activate('B',controller.begin())).toBe(true);
  expect({active,saved}).toEqual({active:'B',saved:'B'});
});

test('pending save completes before a returning project is read',async()=>{
  const {createProjectActivationCoordinator}=await import(moduleUrl);
  const commit=deferred();let stored={id:'A',tasks:[1]},active='B';
  const read=async id=>{if(id==='A')await commit.promise;return structuredClone(stored);};
  const controller=createProjectActivationCoordinator({
    load:read,present:project=>{active=project.id;expect(project.tasks).toHaveLength(2);}
  });
  const activation=controller.activate('A',controller.begin());
  expect(active).toBe('B');
  stored={id:'A',tasks:[1,2]};commit.resolve();
  expect(await activation).toBe(true);
  expect(active).toBe('A');
});

test('stale read failure cannot overwrite or report a successful newer activation',async()=>{
  const {createProjectActivationCoordinator}=await import(moduleUrl);
  const old=deferred();let active='A';
  const controller=createProjectActivationCoordinator({
    load:id=>id==='B'?old.promise:Promise.resolve({id:'A'}),
    present:p=>{active=p.id;}
  });
  const stale=controller.activate('B',controller.begin());
  const newest=controller.activate('A',controller.begin());
  expect(await newest).toBe(true);
  old.reject(Error('IndexedDB failed for B'));
  await expect(stale).rejects.toThrow('IndexedDB failed for B');
  expect(active).toBe('A');
  expect(controller.isCurrent(controller.current())).toBe(true);
});

test('synchronous publication contract rejects an async presenter',async()=>{
  const {createProjectActivationCoordinator}=await import(moduleUrl);
  const controller=createProjectActivationCoordinator({
    load:async id=>({id}),present:async()=>{}
  });
  await expect(controller.activate('A',controller.begin())).rejects.toThrow('synchronous');
});

test('superseded activation never publishes a missing or invalid selection',async()=>{
  const {createProjectActivationCoordinator}=await import(moduleUrl);
  const first=deferred(),seen=[];
  const controller=createProjectActivationCoordinator({
    load:id=>id==='missing'?first.promise:Promise.resolve({id}),
    present:p=>seen.push(p.id)
  });
  const stale=controller.activate('missing',controller.begin());
  const current=controller.activate('valid',controller.begin());
  expect(await current).toBe(true);
  first.resolve(null);
  expect(await stale).toBe(false);
  expect(seen).toEqual(['valid']);
  await expect(controller.activate('missing',controller.begin())).rejects.toThrow('nicht mehr vorhanden');
});
