import {createNativeEngine} from '../../assets/js/engine/native/native-adapter.mjs?v=2.8.1';
import {createDhtmlxEngine} from '../../assets/js/engine/dhtmlx/dhtmlx-adapter.mjs';
import {immutableEngineProjection} from '../../assets/js/engine/engine-contract.mjs?v=2.8.1';
import {sortedProjectTasks} from '../../assets/js/task-order.mjs?v=2.8.1';
import {createMemoryRevisionStore} from '../../assets/js/engine/frappe/independent-gesture.mjs?v=2.8.1';
const editable=new URLSearchParams(location.search).get('edit')==='1';
document.getElementById('mode').textContent=editable?'(Diagnose, nur RAM)':'(schreibgeschützt)';
const status=document.getElementById('status'),zoom=document.getElementById('viewMode');
const native=createNativeEngine(),engine=createDhtmlxEngine({diagnosticEditable:editable});
window.__dhtmlxTestIntents=[];window.__dhtmlxCommits=[];
let project,store,ready=false;
const report=text=>{status.textContent=text};
const render=()=>{
  if(!ready)return;
  const request={project:immutableEngineProjection(project),view:{zoom:zoom.value,reorderable:false}};
  native.render(request);engine.render(request);
};
try{
  const response=await fetch('../../examples/demo.gantt.json',{cache:'no-store'});
  if(!response.ok)throw new Error('Demo missing');
  const json=await response.json();
  if(json.schema!=='gantt-studio.project'||json.schemaVersion!==1)throw new Error('Invalid demo schema');
  project={...json.project,revision:1,tasks:sortedProjectTasks(json.project,'manual')};
  store=createMemoryRevisionStore(project);
  window.__dhtmlxMemoryStore=store;
  window.__dhtmlxTrace=()=>engine.getTrace();
  window.__dhtmlxSwitchProject=()=>{
    const newProject={...store.snapshot(),id:'dhtmlx-second-project',revision:1};
    store.activate(newProject);project=store.snapshot();render();
  };
  native.mount({container:document.getElementById('nativeRoot'),onIntent:async()=>false,onSelect:()=>{},onError:console.error,onStatus:()=>{}});
  engine.mount({container:document.getElementById('dhtmlxRoot'),onIntent:intent=>{
    window.__dhtmlxTestIntents.push(structuredClone(intent));
    const result=store.commit(intent);
    window.__dhtmlxCommits.push({intent:structuredClone(intent),result});
    if(result.ok){project=store.snapshot();report('RAM-Commit Revision '+result.revision);queueMicrotask(render);}
    else report('Abgelehnt: '+result.reason);
    return result.ok;
  },onSelect:s=>report('Aufgabe: '+s.id),onError:e=>{console.error(e);report('Fehler: '+e.message)},onStatus:report});
  ready=true;render();
}catch(error){console.error(error);report('Fehler: '+error.message);}
zoom.addEventListener('change',()=>{try{render()}catch(e){report('Fehler: '+e.message)}});
document.getElementById('reloadBtn').addEventListener('click',render);
document.getElementById('switchBtn').addEventListener('click',window.__dhtmlxSwitchProject);
window.addEventListener('beforeunload',()=>{engine.destroy();native.destroy()},{once:true});
