import test from 'node:test';
import assert from 'node:assert/strict';
import {captureEngineIntentScope,matchesEngineIntentScope}
  from '../assets/js/core/engine-intent-scope.mjs';
import {createProjectCommitter} from '../assets/js/core/project-commits.mjs';

const project=(revision=1,id='A')=>({
  id,revision,updatedAt:'2026-11-06T00:00:00Z',
  tasks:[{id:'same-id',start:'2026-11-10',end:'2026-11-11',progress:0}]
});
const gate=()=>{
  let resolve;
  const promise=new Promise(ok=>{resolve=ok;});
  return {promise,resolve};
};

test('scope requires matching project, revision, and activation generation',()=>{
  const snapshot=project(),scope=captureEngineIntentScope(snapshot,4);
  assert.equal(Object.isFrozen(scope),true);
  assert.equal(matchesEngineIntentScope(scope,snapshot,4),true);
  assert.equal(matchesEngineIntentScope(scope,project(1,'B'),4),false);
  assert.equal(matchesEngineIntentScope(scope,project(2),4),false);
  assert.equal(matchesEngineIntentScope(scope,snapshot,5),false);
  assert.equal(matchesEngineIntentScope({...scope,expectedRevision:null},snapshot,4),false);
  assert.equal(matchesEngineIntentScope(captureEngineIntentScope({id:'A'},4),snapshot,4),false);
  assert.equal(matchesEngineIntentScope(captureEngineIntentScope(snapshot),snapshot,4),false);
});

test('stale renderer intent cannot commit after earlier queued save',async()=>{
  const saved=[],committer=createProjectCommitter(async p=>saved.push(structuredClone(p)));
  const initial=project();
  committer.remember(initial);
  const release=gate(),entered=gate();
  const first=committer.commit(initial,async next=>{
    entered.resolve();await release.promise;
    next.tasks[0].start='2026-11-12';
  });
  await entered.promise;
  const staleScope=captureEngineIntentScope(initial,1);
  const stale=committer.commit(initial,next=>{
    if(!matchesEngineIntentScope(staleScope,next,1))return false;
    next.tasks[0].progress=90;
  });
  release.resolve();
  assert.equal((await first).changed,true);
  assert.equal((await stale).changed,false);
  assert.equal(saved.length,1);
  assert.equal(saved[0].tasks[0].progress,0);
  assert.equal(saved[0].revision,2);
});

test('old remembered snapshot cannot rewind a committed project',async()=>{
  const saved=[],committer=createProjectCommitter(async p=>saved.push(structuredClone(p)));
  const initial=project();
  committer.remember(initial);
  const first=await committer.commit(initial,p=>{p.tasks[0].progress=50;});
  assert.equal(first.project.revision,2);
  assert.throws(()=>committer.remember(project()),{name:'ConcurrentModificationError'});
  const second=await committer.commit(initial,p=>{p.tasks[0].end='2026-11-15';});
  assert.equal(second.project.revision,3);
  assert.equal(second.project.tasks[0].progress,50);
  assert.equal(saved.length,2);
});

test('an invalidated activation generation cannot start a write',async()=>{
  let generation=9;
  const scope=captureEngineIntentScope(project(),generation);
  generation++;
  const committer=createProjectCommitter(async()=>{throw Error('save must not happen');});
  committer.remember(project());
  const result=await committer.commit(project(),next=>{
    if(!matchesEngineIntentScope(scope,next,generation))return false;
    next.tasks[0].progress=100;
  });
  assert.equal(result.changed,false);
});
