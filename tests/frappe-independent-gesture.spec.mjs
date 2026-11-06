import test from 'node:test';
import assert from 'node:assert/strict';
import {createIndependentGesture,createMemoryRevisionStore,inclusiveDays,shiftCalendarDay}
  from '../assets/js/engine/frappe/independent-gesture.mjs';
const task={id:'a',start:'2026-03-28',end:'2026-03-30',progress:40};
const project={id:'project-a',revision:1,tasks:[task]};
const setup=()=>{
  const emitted=[],previews=[],cancels=[];
  const layer=createIndependentGesture({emit:x=>emitted.push(x),
    onPreview:x=>previews.push(x),onCancel:x=>cancels.push(x)});
  const start=(kind='move',pointerId=1)=>layer.start({
    task,projectId:'project-a',revision:1,pointerId,kind,barWidth:120});
  return {layer,start,emitted,previews,cancels};
};
test('date-only shifting survives DST and leap year boundaries',()=>{
  assert.equal(inclusiveDays('2026-03-28','2026-03-30'),3);
  assert.equal(shiftCalendarDay('2026-03-28',2),'2026-03-30');
  assert.equal(shiftCalendarDay('2024-02-28',1),'2024-02-29');
  assert.equal(shiftCalendarDay('0099-12-31',1),'0100-01-01');
});
for(const [kind,dx,expectStart,expectEnd,expectProgress] of [
  ['move',40,'2026-03-29','2026-03-31',40],
  ['resize-left',40,'2026-03-29','2026-03-30',40],
  ['resize-right',40,'2026-03-28','2026-03-31',40],
  ['progress',30,'2026-03-28','2026-03-30',65]
]){
  test(kind+' previews without commit and emits exactly one complete intent',()=>{
    const a=setup();assert.equal(a.start(kind),true);
    a.layer.move(1,dx);
    assert.equal(a.previews.length,1);
    assert.equal(a.emitted.length,0);
    const intent=a.layer.finish(1);
    assert.deepEqual(intent.change,{id:'a',start:expectStart,end:expectEnd,progress:expectProgress});
    assert.equal(intent.projectId,'project-a');
    assert.equal(intent.expectedRevision,1);
    assert.equal(intent.kind,kind);
    assert.deepEqual(intent.before,{start:task.start,end:task.end,progress:task.progress});
    assert.equal(a.emitted.length,1);
    assert.equal(a.layer.finish(1),false);
    assert.equal(a.emitted.length,1);
  });
}
test('shortening cannot invert inclusive dates',()=>{
  const a=setup();a.start('resize-left');a.layer.move(1,500);
  assert.equal(a.layer.finish(1).change.start,'2026-03-30');
  const b=setup();b.start('resize-right');b.layer.move(1,-500);
  assert.equal(b.layer.finish(1).change.end,'2026-03-28');
});
test('unchanged click is not a commit',()=>{
  const a=setup();a.start();a.layer.move(1,0);
  assert.equal(a.layer.finish(1),false);assert.deepEqual(a.emitted,[]);
});
test('Escape and pointercancel consume gesture without intent',()=>{
  const a=setup();a.start();a.layer.move(1,40);assert.equal(a.layer.cancel('escape'),true);
  assert.equal(a.layer.finish(1),false);
  a.start('progress',2);a.layer.move(2,30);a.layer.cancel('pointercancel');
  assert.equal(a.emitted.length,0);assert.equal(a.cancels.length,2);
});
test('second pointer and wrong pointer cannot hijack active gesture',()=>{
  const a=setup();a.start('move',21);
  assert.equal(a.start('progress',22),false);
  assert.equal(a.layer.move(22,200),null);
  assert.equal(a.layer.finish(22),false);
  assert.equal(a.layer.getActive().pointerId,21);
  a.layer.cancel('lost-focus');assert.equal(a.emitted.length,0);
});
test('destroy cancels active and fences stale callbacks',()=>{
  const a=setup();a.start();a.layer.move(1,40);a.layer.destroy();
  assert.equal(a.layer.finish(1),false);
  assert.equal(a.start(),false);assert.equal(a.emitted.length,0);
  assert.equal(a.cancels.length,1);
});
test('memory CAS: version advances once and rejects replay and older version',()=>{
  const a=setup(),store=createMemoryRevisionStore(project);
  a.start();a.layer.move(1,40);const intent=a.layer.finish(1);
  assert.deepEqual(store.commit(intent),{ok:true,revision:2});
  assert.equal(store.snapshot().tasks[0].start,'2026-03-29');
  assert.equal(store.snapshot().revision,2);
  assert.deepEqual(store.commit(intent),{ok:false,reason:'duplicate'});
  const stale={...intent,gestureId:78};
  assert.deepEqual(store.commit(stale),{ok:false,reason:'stale'});
});
test('memory CAS: project activation fences stale gestures',()=>{
  const a=setup(),store=createMemoryRevisionStore(project);
  a.start();a.layer.move(1,40);const intent=a.layer.finish(1);
  store.activate({...project,id:'project-b'});
  assert.deepEqual(store.commit(intent),{ok:false,reason:'stale'});
});
test('memory CAS: before-state conflict and invalid payload rejected',()=>{
  const store=createMemoryRevisionStore(project);
  const a=setup();a.start();a.layer.move(1,40);const intent=a.layer.finish(1);
  assert.deepEqual(store.commit({...intent,before:{...task,start:'2026-01-01'}}),
    {ok:false,reason:'conflict'});
  assert.deepEqual(store.commit({...intent,change:{id:'a',start:'2026-03-30',end:'2026-03-28',progress:40}}),
    {ok:false,reason:'invalid'});
  assert.equal(store.snapshot().revision,1);
});
