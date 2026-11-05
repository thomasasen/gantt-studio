import {createNativeEngine} from '../../assets/js/engine/native/native-adapter.mjs?v=2.8.0';
import {createFrappeEngine} from '../../assets/js/engine/frappe/frappe-adapter.mjs?v=2.8.0';
import {immutableEngineProjection} from '../../assets/js/engine/engine-contract.mjs?v=2.8.0';
import {sortedProjectTasks} from '../../assets/js/task-order.mjs?v=2.8.0';

const status = document.getElementById('status');
const viewMode = document.getElementById('viewMode');
const native = createNativeEngine();
const frappe = createFrappeEngine();
let project = null;
let initialized = false;

function report(message) { status.textContent = message; }

function renderComparison() {
  if (!project || !initialized) return;
  const request = {project,view:{zoom:viewMode.value,reorderable:false}};
  const left = native.render(request);
  const right = frappe.render(request);
  report('Native: ' + (left.empty ? 'leer' : 'gerendert') +
    '; Frappe: ' + (right.empty ? 'leer' : 'gerendert') +
    '; ' + project.tasks.length + ' Aufgaben; keine Speicherung.');
}
function safeRender() {
  try { renderComparison(); } catch(error) {
    console.error(error); report('Fehler: ' + error.message);
  }
}

try {
  const response = await fetch('../../examples/demo.gantt.json',{cache:'no-store'});
  if(!response.ok) throw new Error('Demoprojekt konnte nicht geladen werden.');
  const file = await response.json();
  if(file.schema !== 'gantt-studio.project' || file.schemaVersion !== 1)
    throw new Error('Unbekanntes Projektformat.');
  project = immutableEngineProjection({
    ...file.project,
    tasks: sortedProjectTasks(file.project,'manual')
  });
  native.mount({container:document.getElementById('nativeRoot'),
    onIntent:async()=>{report('Native-Vergleich: Änderungen werden nicht gespeichert.');safeRender();return false;},
    onSelect:selection=>report('Native-Auswahl: '+selection.id),
    onStatus:report,onError:console.error});
  frappe.mount({container:document.getElementById('frappeRoot'),
    onIntent:async()=>{throw new Error('Read-only: kein Commit erlaubt.');},
    onSelect:selection=>report('Frappe-Auswahl: '+selection.id),
    onError:console.error});
  initialized = true;
  safeRender();
} catch (error) {
  console.error(error);
  report('Fehler: ' + error.message);
}
viewMode.addEventListener('change',safeRender);
document.getElementById('reloadBtn').addEventListener('click',safeRender);
window.addEventListener('beforeunload',()=>{native.destroy();frappe.destroy();},{once:true});
