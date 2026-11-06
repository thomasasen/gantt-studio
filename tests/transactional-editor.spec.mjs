import test from 'node:test';
import assert from 'node:assert/strict';
import {createProjectCommitter} from '../assets/js/core/project-commits.mjs';
import {createTransactionalEditor,validateEditorIntent,applyEditorIntent}
  from '../assets/js/core/transactional-editor.mjs';

const project = (id='p') => ({
  id,revision:1,updatedAt:'2026-11-06T00:00:00Z',
  tasks:[{id:'t',start:'2026-03-29',end:'2026-03-29',progress:0,
    dependencies:['other'],phaseId:'phase',displayOrder:3,showInGantt:true},
    {id:'hidden',start:'2026-01-01',end:'2026-01-02',showInGantt:false},
    {id:'other',start:'2026-04-01',end:'2026-04-02',showInGantt:true}]
});
const intent = change => ({type:'task-change',change:{id:'t',...change}});
function setup({save=async()=>{}}={}) {
  let current=project();
  const writes=[],states=[],rollbacks=[],errors=[];
  const committer=createProjectCommitter(async (next,expected)=>{
    await save(next,expected);
    writes.push(structuredClone(next));
  });
  committer.remember(current);
  const editor=createTransactionalEditor({
    committer,getActiveProject:()=>current,
    onCommitted:next=>{current=next;},
    onRollback:p=>rollbacks.push(p),
    onState:s=>states.push(s),
    onError:e=>errors.push(String(e))
  });
  const open=()=>editor.open({project:current,generation:1,visibleTaskIds:['t','other']});
  return {committer,editor,open,writes,states,rollbacks,errors,
    current:()=>current,setCurrent:p=>{current=p;}};
}

test('strict date-only semantics, leap day and inclusive one-day minimum',()=>{
  const p=project();
  for(const end of ['2028-02-29','2026-12-31','2026-10-25']){
    const start=end;
    assert.equal(validateEditorIntent(intent({start,end}),p,new Set(['t'])).end,end);
  }
  for(const x of [{start:'2026-02-29'},{start:'2026-04-03',end:'2026-04-02'},
    {end:'2026-11-31'},{progress:-1},{progress:101},{progress:NaN},
    {progress:'12'},{unexpected:1},{start:null}])
    assert.throws(()=>validateEditorIntent(intent(x),p,new Set(['t'])));
  assert.throws(()=>validateEditorIntent({type:'TaskMove',change:{id:'t',start:'2026-01-01'}},p,new Set(['t'])));
});
test('hidden, filtered, missing and synthetic task IDs are rejected',()=>{
  const p=project();
  p.tasks.push({id:'synthetic',syntheticPhase:true,start:'2026-01-01',end:'2026-01-01'});
  for(const id of ['hidden','synthetic','missing']){
    assert.throws(()=>validateEditorIntent({type:'task-change',
      change:{id,progress:12}},p,new Set([id])));
  }
  assert.throws(()=>validateEditorIntent(intent({progress:12}),p,new Set(['other'])));
});
test('move, start/end resize and progress do not modify unrelated task fields',()=>{
  const p=project(),before=structuredClone(p.tasks[0]);
  assert.equal(applyEditorIntent(p,intent({start:'2026-04-01',end:'2026-04-01'}),new Set(['t'])),true);
  assert.equal(applyEditorIntent(p,intent({start:'2026-03-31'}),new Set(['t'])),true);
  assert.equal(applyEditorIntent(p,intent({end:'2026-04-02'}),new Set(['t'])),true);
  assert.equal(applyEditorIntent(p,intent({progress:45.6}),new Set(['t'])),true);
  assert.deepEqual(p.tasks[0],{...before,start:'2026-03-31',end:'2026-04-02',progress:46});
  assert.equal(applyEditorIntent(p,intent({progress:46}),new Set(['t'])),false);
  assert.equal(p.tasks[0].displayOrder,3);
});
test('preview callbacks do not touch canonical state, and only one submit saves',async()=>{
  const t=setup(),token=t.open();
  assert.equal(t.editor.preview(token,intent({start:'2026-03-30',end:'2026-03-30'})),true);
  assert.equal(t.editor.preview(token,intent({start:'2026-03-31',end:'2026-03-31'})),true);
  assert.equal(t.current().tasks[0].start,'2026-03-29');
  assert.equal(t.writes.length,0);
  assert.equal(await t.editor.submit(token),true);
  assert.equal(await t.editor.submit(token),false);
  assert.equal(t.writes.length,1);
  assert.equal(t.current().revision,2);
  assert.equal(t.current().tasks[0].start,'2026-03-31');
  assert.deepEqual(t.states.slice(-3),['preview','pending','committed']);
});
test('cancel/escape and no-op cannot persist',async()=>{
  const t=setup(),token=t.open();
  t.editor.preview(token,intent({progress:33}));
  assert.equal(t.editor.cancel(token),true);
  assert.equal(await t.editor.submit(token),false);
  assert.equal(t.writes.length,0);
  assert.equal(t.rollbacks.length,1);
  const again=t.open();
  t.editor.preview(again,intent({progress:0}));
  assert.equal(await t.editor.submit(again),false);
  assert.equal(t.editor.getState(),'cancelled');
  assert.equal(t.writes.length,0);
});
test('save error rolls back, recovers and permits a new session',async()=>{
  let fail=true;
  const t=setup({save:async()=>{if(fail)throw new Error('QuotaExceededError');}});
  let token=t.open();
  t.editor.preview(token,intent({progress:77}));
  assert.equal(await t.editor.submit(token),false);
  assert.equal(t.editor.getState(),'failed');
  assert.equal(t.current().revision,1);
  assert.equal(t.rollbacks.at(-1).tasks[0].progress,0);
  assert.equal(t.writes.length,0);
  fail=false;
  token=t.open();
  t.editor.preview(token,intent({progress:77}));
  assert.equal(await t.editor.submit(token),true);
  assert.equal(t.current().tasks[0].progress,77);
  assert.equal(t.writes.length,1);
});
test('duplicate submissions, out-of-order preview and pending cancel fail closed',async()=>{
  let release,started;
  const gate=new Promise(r=>{release=r;});
  const startedP=new Promise(r=>{started=r;});
  const t=setup({save:async()=>{started();await gate;}});
  const token=t.open();
  assert.equal(t.editor.preview(token+1,intent({progress:1})),false);
  t.editor.preview(token,intent({progress:50}));
  const first=t.editor.submit(token);
  await startedP;
  assert.equal(t.editor.getState(),'pending');
  assert.equal(t.editor.preview(token,intent({progress:90})),false);
  assert.equal(await t.editor.submit(token),false);
  assert.equal(t.editor.cancel(token),false);
  release();
  assert.equal(await first,true);
  assert.equal(t.writes.length,1);
});
test('generation invalidation during queue wait prevents an old project write',async()=>{
  let release,started;
  const gate=new Promise(r=>{release=r;});
  const startedP=new Promise(r=>{started=r;});
  const t=setup({save:async()=>{started();await gate;}});
  const block=t.committer.commit(t.current(),p=>{p.tasks[1].end='2026-01-03';});
  await startedP;
  const token=t.open();
  t.editor.preview(token,intent({progress:10}));
  const stale=t.editor.submit(token);
  t.editor.invalidate();
  release();
  await block;
  assert.equal(await stale,false);
  assert.equal(t.writes.length,1);
  assert.equal(t.writes[0].tasks[0].progress,0);
});
test('project change during an in-flight write suppresses stale UI publication',async()=>{
  let release,started;
  const gate=new Promise(r=>{release=r;});
  const startedP=new Promise(r=>{started=r;});
  const t=setup({save:async()=>{started();await gate;}});
  const token=t.open();
  t.editor.preview(token,intent({progress:90}));
  const pending=t.editor.submit(token);
  await startedP;
  const newProject=project('new-project');
  t.setCurrent(newProject);
  t.editor.invalidate();
  release();
  assert.equal(await pending,false);
  assert.equal(t.current().id,'new-project');
  // Already submitted IndexedDB writes cannot be undone by an iframe cancel.
  assert.equal(t.writes[0].id,'p');
});
test('stale revision and wrong view are rejected before commit',async()=>{
  const t=setup(),token=t.open();
  t.editor.preview(token,intent({progress:70}));
  const newer=structuredClone(t.current());newer.revision=2;
  t.setCurrent(newer);
  assert.equal(await t.editor.submit(token),false);
  assert.equal(t.writes.length,0);
});
test('invalid preview fails closed with a rollback and no save',async()=>{
  const t=setup(),token=t.open();
  assert.equal(t.editor.preview(token,intent({end:'2026-01-01'})),false);
  assert.equal(t.editor.getState(),'failed');
  assert.equal(await t.editor.submit(token),false);
  assert.equal(t.writes.length,0);
  assert.equal(t.rollbacks.length,1);
});
test('sessions are fenced after replacement or destroy',async()=>{
  const t=setup();
  const old=t.open();
  const next=t.open();
  assert.notEqual(old,next);
  assert.equal(t.editor.preview(old,intent({progress:20})),false);
  assert.equal(t.editor.preview(next,intent({progress:21})),true);
  t.editor.invalidate();
  assert.equal(await t.editor.submit(next),false);
  assert.equal(t.writes.length,0);
});
