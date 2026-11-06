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
