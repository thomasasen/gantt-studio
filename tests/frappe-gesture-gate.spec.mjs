import test from 'node:test';
import assert from 'node:assert/strict';
import {createFrappeGestureGate} from '../assets/js/engine/frappe/frappe-gesture-gate.mjs';

test('no edit leaves Frappe before a matching completed pointer gesture',()=>{
  const intents=[];let rollbacks=0;
  const gate=createFrappeGestureGate({emit:x=>intents.push(x),rollback:()=>rollbacks++});
  assert.equal(gate.start('task-a',42),true);
  assert.equal(gate.preview({id:'task-a',start:'2026-11-01',end:'2026-11-08'}),true);
  assert.equal(gate.preview({id:'task-a',start:'2026-11-02',end:'2026-11-09'}),true);
  assert.deepEqual(intents,[]);
  assert.equal(gate.finish(41),false);
  assert.deepEqual(intents,[]);
  assert.equal(gate.finish(42),true);
  assert.deepEqual(intents,[{type:'task-change',
    change:{id:'task-a',start:'2026-11-02',end:'2026-11-09'}}]);
  assert.equal(gate.finish(42),false);
  assert.equal(rollbacks,0);
});
test('Escape and pointercancel discard previews without emitting commits',()=>{
  const intents=[];let rollbacks=0;
  const gate=createFrappeGestureGate({emit:x=>intents.push(x),rollback:()=>rollbacks++});
  gate.start('a',1);gate.preview({id:'a',progress:60});
  assert.equal(gate.cancel(),true); // Escape
  assert.equal(gate.finish(1),false);
  gate.start('a',2);gate.preview({id:'a',start:'2026-11-03'});
  assert.equal(gate.cancel(2),true); // pointercancel
  assert.equal(gate.finish(2),false);
  assert.deepEqual(intents,[]);
  assert.equal(rollbacks,2);
});
test('rejects unrelated tasks and stale pointers; mouseup outside cancels',()=>{
  const intents=[];let rolled=0;
  const gate=createFrappeGestureGate({emit:v=>intents.push(v),rollback:()=>rolled++});
  gate.start('A',7);
  assert.equal(gate.start('B',8),false);
  assert.equal(gate.preview({id:'B',progress:75}),false);
  gate.preview({id:'A',progress:70});
  assert.equal(gate.cancel(8),false);
  assert.equal(gate.finish(7,{inside:false}),false);
  assert.equal(rolled,1);
  assert.deepEqual(intents,[]);
});
test('no preview never emits a commit',()=>{
  const intents=[];
  const gate=createFrappeGestureGate({emit:x=>intents.push(x)});
  gate.start('A',5);
  assert.equal(gate.finish(5),false);
  assert.deepEqual(intents,[]);
});

test('asynchronous emit blocks reentry and rejects safely with rollback',async()=>{
  let rejectCommit; const pending=new Promise((_,reject)=>{rejectCommit=reject;});
  const errors=[];let rollbacks=0;
  const gate=createFrappeGestureGate({
    emit:()=>pending,rollback:()=>rollbacks++,
    onError:error=>errors.push(error.message)
  });
  assert.equal(gate.start('t',9),true);
  assert.equal(gate.preview({id:'t',progress:35}),true);
  assert.equal(gate.finish(9),true);
  assert.equal(gate.getState(),'pending');
  assert.equal(gate.start('t',10),false);
  rejectCommit(new Error('IDB failed'));
  await Promise.resolve();await Promise.resolve();
  assert.equal(gate.getState(),'failed');
  assert.equal(rollbacks,1);
  assert.deepEqual(errors,['IDB failed']);
  assert.equal(gate.start('t',10),true);
  gate.cancel(10);
});
test('destroy fences late asynchronous errors and callbacks',async()=>{
  let rejectCommit; const pending=new Promise((_,reject)=>{rejectCommit=reject;});
  let errors=0,rollbacks=0;
  const gate=createFrappeGestureGate({
    emit:()=>pending,rollback:()=>rollbacks++,onError:()=>errors++
  });
  gate.start('task',2);gate.preview({id:'task',progress:20});
  assert.equal(gate.finish(2),true);
  gate.destroy();
  rejectCommit(new Error('stale'));
  await Promise.resolve();await Promise.resolve();
  assert.equal(errors,0);
  assert.equal(rollbacks,0);
  assert.equal(gate.start('task',3),false);
  assert.equal(gate.preview({id:'task',progress:50}),false);
  assert.equal(gate.finish(2),false);
});
test('invalid progress, invalid pointer and callbacks after cancel never emit',()=>{
  const intents=[];const gate=createFrappeGestureGate({emit:v=>intents.push(v)});
  assert.equal(gate.start('task',-1),false);
  assert.equal(gate.start('task',3),true);
  assert.equal(gate.preview({id:'task',progress:Infinity}),false);
  assert.equal(gate.preview({id:'task',progress:101}),false);
  assert.equal(gate.cancel(3),true);
  assert.equal(gate.preview({id:'task',progress:50}),false);
  assert.equal(gate.finish(3),false);
  assert.deepEqual(intents,[]);
});
