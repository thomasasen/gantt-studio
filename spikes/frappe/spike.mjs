import {createNativeEngine} from '../../assets/js/engine/native/native-adapter.mjs?v=2.8.1';
import {createFrappeEngine} from '../../assets/js/engine/frappe/frappe-adapter.mjs?v=2.8.1';
import {immutableEngineProjection} from '../../assets/js/engine/engine-contract.mjs?v=2.8.1';
import {sortedProjectTasks} from '../../assets/js/task-order.mjs?v=2.8.1';
import {createMemoryRevisionStore} from '../../assets/js/engine/frappe/independent-gesture.mjs?v=2.8.1';
const status=document.getElementById('status');
const viewMode=document.getElementById('viewMode');
const native=createNativeEngine();
const params=new URLSearchParams(location.search);
const experimentalEditable=params.get('edit')==='1';
const experimentalIndependentLayer=params.get('layer')==='1';
if(experimentalIndependentLayer)viewMode.value='day';
if(experimentalIndependentLayer)viewMode.disabled=true;
const frappe=createFrappeEngine({experimentalEditable,experimentalIndependentLayer});
window.__frappeTestIntents=[];
window.__independentCommits=[];
let project,memoryStore,initialized=false;
const report=message=>{status.textContent=message;};
function renderComparison(){
  if(!initialized)return;
  const request={project,view:{zoom:viewMode.value,reorderable:false}};
  native.render(request);
  frappe.render(request);
}
function safeRender(){try{renderComparison();}catch(error){console.error(error);report('Fehler: '+error.message);}}
try{
  const response=await fetch('../../examples/demo.gantt.json',{cache:'no-store'});
  if(!response.ok)throw new Error('Demoprojekt konnte nicht geladen werden.');
  const file=await response.json();
  if(file.schema!=='gantt-studio.project'||file.schemaVersion!==1)throw new Error('Unbekanntes Projektformat.');
  project=immutableEngineProjection({...file.project,revision:1,
    tasks:sortedProjectTasks(file.project,'manual')});
  if(experimentalIndependentLayer){
    memoryStore=createMemoryRevisionStore(project);
    window.__independentMemoryStore=memoryStore; // diagnostic only
    document.querySelector('.notice').textContent=
      'Isolierter Day-Mode-Spike: Frappe rendert schreibgeschützt. Eigene Pointer-Vorschau und rein speicherinterner Compare-and-Swap-Commit. Keine Speicherung.';
  }
  native.mount({container:document.getElementById('nativeRoot'),
    onIntent:async()=>false,onSelect:()=>{},onError:console.error,onStatus:()=>{}});
  frappe.mount({container:document.getElementById('frappeRoot'),
    onIntent:async intent=>{
      if(experimentalIndependentLayer){
        const result=memoryStore.commit(intent);
        window.__independentCommits.push({intent:structuredClone(intent),result});
        if(result.ok){
          window.__frappeTestIntents.push(structuredClone(intent));
          project=immutableEngineProjection(memoryStore.snapshot());
          report('Speicherinterner Commit Revision '+result.revision+' (nicht gespeichert)');
          // A fresh, disposable iframe receives the new canonical projection.
          queueMicrotask(safeRender);
        }else report('Commit abgewiesen: '+result.reason);
        return result.ok;
      }
      if(!experimentalEditable)throw new Error('Read-only: no commit permitted');
      window.__frappeTestIntents.push(structuredClone(intent));
      report('Vorschau-Intent (nicht gespeichert): '+intent.change.id);
      return false;
    },
    onSelect:selection=>report('Frappe: gerendert, Aufgabe '+selection.id),
    onError:error=>{console.error(error);report('Fehler: '+error.message);},
    onStatus:report});
  initialized=true;safeRender();
}catch(error){console.error(error);report('Fehler: '+error.message);}
// Escape must reach the active frame even if focus has returned to the host.
if(experimentalIndependentLayer)window.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();frappe.cancelInteraction();}
},true);
viewMode.addEventListener('change',safeRender);
document.getElementById('reloadBtn').addEventListener('click',safeRender);
window.addEventListener('beforeunload',()=>{native.destroy();frappe.destroy();},{once:true});
