import {createNativeEngine} from '../../assets/js/engine/native/native-adapter.mjs?v=2.8.1';
import {createFrappeEngine} from '../../assets/js/engine/frappe/frappe-adapter.mjs?v=2.8.1';
import {immutableEngineProjection} from '../../assets/js/engine/engine-contract.mjs?v=2.8.1';
import {sortedProjectTasks} from '../../assets/js/task-order.mjs?v=2.8.1';
const status=document.getElementById('status');
const viewMode=document.getElementById('viewMode');
const native=createNativeEngine();
const experimentalEditable=new URLSearchParams(location.search).get('edit')==='1';
const frappe=createFrappeEngine({experimentalEditable});
window.__frappeTestIntents=[];
let project,initialized=false;
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
  project=immutableEngineProjection({...file.project,tasks:sortedProjectTasks(file.project,'manual')});
  native.mount({container:document.getElementById('nativeRoot'),
    onIntent:async()=>false,onSelect:()=>{},onError:console.error,onStatus:()=>{}});
  frappe.mount({container:document.getElementById('frappeRoot'),
    onIntent:async intent=>{
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
viewMode.addEventListener('change',safeRender);
document.getElementById('reloadBtn').addEventListener('click',safeRender);
window.addEventListener('beforeunload',()=>{native.destroy();frappe.destroy();},{once:true});
