import { renderGantt } from './gantt.js';
import { saveLocal, loadActive, clearActive } from './storage.js';

const $ = (id) => document.getElementById(id);
const deepClone = (x) => JSON.parse(JSON.stringify(x));
const uuid = () => crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const defaults = {
  schema: 'gantt-studio.project', schemaVersion: 1, generator: 'Gantt Studio',
  project: {
    id: '', name: 'Neues Projekt', createdAt: '', updatedAt: '', tasks: [],
    design: {
      colors: { pageBg:'#EEF2F3',panelBg:'#FFFFFF',headerBg:'#16324F',primary:'#16324F',accent:'#607A00',critical:'#16324F',workstream:'#3B7280',milestone:'#607A00',arrow:'#657983',grid:'#DCE4E7',text:'#243746',mutedText:'#687D87',border:'#D8E1E4',saturday:'#F1E2E2',sunday:'#F1E2E2',holiday:'#F3CACA' }
    },
    planning: { settings: { showToday:true,showStatusLine:true,showWeekends:true,showHolidays:true,showPhaseBands:true,showBaseline:true,showBuffer:true,showRisk:true,showOwners:true,showProgressLabels:true,showDateLabels:true,showRelativeToday:false,relativeOffsetDays:0,relativeDayMode:'workdays',relativeSkipHolidays:true,relativeLabel:'Vorbereitungstermin',relativeColor:'#C2007B',relativeStyle:'solid' }, phases:[],markers:[],holidays:[] },
    revision: 1
  }
};

let envelope = createNewEnvelope();
let zoom = 'week';
let saveTimer = null;

function createNewEnvelope() {
  const now = new Date().toISOString();
  const x = deepClone(defaults);
  x.exportedAt = now; x.project.id=uuid(); x.project.createdAt=now; x.project.updatedAt=now;
  return x;
}

function normalizeEnvelope(raw) {
  if (!raw || raw.schema !== 'gantt-studio.project' || !raw.project || !Array.isArray(raw.project.tasks)) throw new Error('Keine gültige Gantt-Studio-Projektdatei.');
  const normalized = deepClone(defaults);
  normalized.exportedAt = raw.exportedAt || new Date().toISOString();
  normalized.generator = raw.generator || 'Gantt Studio';
  normalized.schemaVersion = raw.schemaVersion || 1;
  normalized.project = {
    ...normalized.project,
    ...raw.project,
    design: { ...normalized.project.design, ...(raw.project.design || {}), colors: { ...normalized.project.design.colors, ...(raw.project.design?.colors || {}) } },
    planning: { ...normalized.project.planning, ...(raw.project.planning || {}), settings: { ...normalized.project.planning.settings, ...(raw.project.planning?.settings || {}) }, phases: raw.project.planning?.phases || [], markers: raw.project.planning?.markers || [], holidays: raw.project.planning?.holidays || [] }
  };
  normalized.project.id ||= uuid();
  normalized.project.tasks = normalized.project.tasks.map(t => ({ dependencies:[],progress:0,type:'workstream',owner:'',status:'neutral',risk:'none',bufferDays:0,costEur:0,url:'',notes:'',showInGantt:true,...t }));
  return normalized;
}

async function boot() {
  bindEvents();
  buildSettings();
  try {
    const local = await loadActive();
    if (local) envelope = normalizeEnvelope({schema:'gantt-studio.project',schemaVersion:1,generator:'Gantt Studio',project:local});
  } catch (err) { console.warn('Lokales Projekt konnte nicht geladen werden',err); }
  render();
}

function bindEvents() {
  $('newProjectBtn').addEventListener('click', newProject);
  $('openProjectBtn').addEventListener('click', () => $('fileInput').click());
  $('fileInput').addEventListener('change', importFile);
  $('saveProjectBtn').addEventListener('click', exportProject);
  $('addTaskBtn').addEventListener('click', () => openTaskDialog());
  $('emptyAddBtn').addEventListener('click', () => openTaskDialog());
  $('demoBtn').addEventListener('click', loadDemo);
  $('settingsBtn').addEventListener('click', () => { syncSettings(); $('settingsDialog').showModal(); });
  $('zoomSelect').addEventListener('change', e => { zoom=e.target.value; renderGanttOnly(); });
  $('projectName').addEventListener('input', e => { envelope.project.name=e.target.value || 'Unbenanntes Projekt'; touch(); renderMeta(); scheduleSave(); });
  $('saveTaskBtn').addEventListener('click', saveTaskFromDialog);
  $('deleteTaskBtn').addEventListener('click', deleteCurrentTask);
  $('ganttStage').addEventListener('click', e => {
    const node=e.target.closest('[data-task-id]'); if(node) openTaskDialog(node.dataset.taskId);
  });
  window.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==='s') { e.preventDefault(); exportProject(); }
  });
}

function render() {
  $('projectName').value = envelope.project.name || 'Unbenanntes Projekt';
  renderMeta(); renderMetrics(); renderLegend(); renderGanttOnly(); populateTaskPhases();
}

function renderMeta() {
  const p=envelope.project;
  const updated=p.updatedAt ? new Intl.DateTimeFormat('de-DE',{dateStyle:'medium',timeStyle:'short'}).format(new Date(p.updatedAt)) : '—';
  $('projectMeta').textContent = `Revision ${p.revision || 1} · zuletzt geändert ${updated} · automatische lokale Sicherung`;
}

function renderMetrics() {
  const tasks=envelope.project.tasks;
  const active=tasks.filter(t=>Number(t.progress||0)<100);
  const red=tasks.filter(t=>t.status==='red').length;
  const criticalRisk=tasks.filter(t=>['high','critical'].includes(t.risk)).length;
  const cost=tasks.reduce((s,t)=>s+(Number(t.costEur)||0),0);
  const progress=tasks.length ? Math.round(tasks.reduce((s,t)=>s+(Number(t.progress)||0),0)/tasks.length) : 0;
  const metrics=[
    ['Aufgaben',tasks.length,''],['Offen',active.length,''],['Fortschritt',`${progress} %`,''],['Rot / hohes Risiko',`${red} / ${criticalRisk}`,(red||criticalRisk)?'bad':''],['Budget',new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(cost),'']
  ];
  $('metrics').innerHTML=metrics.map(([l,v,c])=>`<div class="metric ${c}"><span>${l}</span><strong>${v}</strong></div>`).join('');
}

function renderLegend() {
  $('legend').innerHTML=[['Workstream','var(--workstream)'],['Kritisch','var(--critical)'],['Meilenstein','var(--milestone)'],['Gate','var(--gate)']].map(([l,c])=>`<span class="legend-item"><i class="legend-swatch" style="background:${c}"></i>${l}</span>`).join('');
}

function renderGanttOnly() {
  const stage=$('ganttStage');
  const result=renderGantt(stage,envelope.project,{zoom});
  if (result.empty) {
    stage.innerHTML='';
    const empty=document.createElement('div'); empty.className='empty-state'; empty.innerHTML='<strong>Noch keine Aufgaben</strong><span>Erstelle eine Aufgabe oder lade die Demo.</span><button class="btn primary" id="emptyAddBtn2" type="button">Erste Aufgabe erstellen</button>'; stage.appendChild(empty);
    $('emptyAddBtn2').addEventListener('click',()=>openTaskDialog());
  }
}

function openTaskDialog(id=null) {
  const task=id ? envelope.project.tasks.find(t=>t.id===id) : null;
  const today=new Date().toISOString().slice(0,10);
  $('taskDialogTitle').textContent=task?'Aufgabe bearbeiten':'Neue Aufgabe';
  $('taskId').value=task?.id||''; $('taskName').value=task?.name||''; $('taskStart').value=task?.start||today; $('taskEnd').value=task?.end||today;
  $('taskType').value=task?.type||'workstream'; $('taskProgress').value=task?.progress??0; $('taskOwner').value=task?.owner||''; $('taskStatus').value=task?.status||'neutral'; $('taskRisk').value=task?.risk||'none';
  populateTaskPhases(task?.phaseId||''); populateDependencies(task);
  $('taskBaselineStart').value=task?.baselineStart||''; $('taskBaselineEnd').value=task?.baselineEnd||''; $('taskBuffer').value=task?.bufferDays??0; $('taskCost').value=task?.costEur??''; $('taskUrl').value=task?.url||''; $('taskNotes').value=task?.notes||'';
  $('deleteTaskBtn').style.visibility=task?'visible':'hidden'; $('taskDialog').showModal(); $('taskName').focus();
}

function populateTaskPhases(selected='') {
  const opts=['<option value="">Keine Phase</option>',...(envelope.project.planning?.phases||[]).map(p=>`<option value="${escAttr(p.id)}">${esc(p.name)}</option>`)];
  $('taskPhase').innerHTML=opts.join(''); $('taskPhase').value=selected;
}
function populateDependencies(task) {
  $('taskDependencies').innerHTML=envelope.project.tasks.filter(t=>t.id!==task?.id).map(t=>`<option value="${escAttr(t.id)}" ${(task?.dependencies||[]).includes(t.id)?'selected':''}>${esc(t.name)}</option>`).join('');
}

function saveTaskFromDialog() {
  const name=$('taskName').value.trim(); const start=$('taskStart').value; const end=$('taskEnd').value;
  if(!name || !start || !end) { toast('Name, Start und Ende sind Pflicht.'); return; }
  if(end<start) { toast('Das Enddatum darf nicht vor dem Start liegen.'); return; }
  const id=$('taskId').value||uuid();
  const task={ id,name,start,end,progress:Math.max(0,Math.min(100,Number($('taskProgress').value)||0)),type:$('taskType').value,dependencies:[...$('taskDependencies').selectedOptions].map(o=>o.value),phaseId:$('taskPhase').value||'',owner:$('taskOwner').value.trim(),status:$('taskStatus').value,risk:$('taskRisk').value,baselineStart:$('taskBaselineStart').value||'',baselineEnd:$('taskBaselineEnd').value||'',bufferDays:Number($('taskBuffer').value)||0,costEur:Number($('taskCost').value)||0,url:$('taskUrl').value.trim(),notes:$('taskNotes').value.trim(),showInGantt:true };
  const idx=envelope.project.tasks.findIndex(t=>t.id===id); if(idx>=0) envelope.project.tasks[idx]=task; else envelope.project.tasks.push(task);
  sortTasks(); touch(); scheduleSave(); $('taskDialog').close(); render(); toast(idx>=0?'Aufgabe aktualisiert.':'Aufgabe erstellt.');
}

function deleteCurrentTask() {
  const id=$('taskId').value; if(!id) return;
  envelope.project.tasks=envelope.project.tasks.filter(t=>t.id!==id).map(t=>({...t,dependencies:(t.dependencies||[]).filter(dep=>dep!==id)}));
  touch(); scheduleSave(); $('taskDialog').close(); render(); toast('Aufgabe gelöscht.');
}

function sortTasks() { envelope.project.tasks.sort((a,b)=>(a.start||'').localeCompare(b.start||'') || (a.end||'').localeCompare(b.end||'')); }
function touch() { envelope.project.updatedAt=new Date().toISOString(); envelope.project.revision=(Number(envelope.project.revision)||0)+1; }
function scheduleSave() { clearTimeout(saveTimer); saveTimer=setTimeout(async()=>{ try{await saveLocal(envelope.project); renderMeta();}catch(e){console.warn(e);} },250); }

async function newProject() {
  envelope=createNewEnvelope(); await clearActive(); await saveLocal(envelope.project); render(); toast('Neues Projekt erstellt.');
}

async function loadDemo() {
  try {
    const res=await fetch('./examples/demo.gantt.json',{cache:'no-store'}); if(!res.ok) throw new Error(`HTTP ${res.status}`);
    envelope=normalizeEnvelope(await res.json()); envelope.project.id=uuid(); envelope.project.name='Dynamisches Demo-Projekt'; touch(); await saveLocal(envelope.project); render(); toast('Demo geladen.');
  } catch(err) { console.error(err); toast('Demo konnte nicht geladen werden.'); }
}

async function importFile(event) {
  const file=event.target.files?.[0]; if(!file) return;
  try { envelope=normalizeEnvelope(JSON.parse(await file.text())); touch(); await saveLocal(envelope.project); render(); toast('Projekt importiert.'); }
  catch(err) { console.error(err); toast(err.message || 'Datei konnte nicht importiert werden.'); }
  finally { event.target.value=''; }
}

function exportProject() {
  const payload=deepClone(envelope); payload.exportedAt=new Date().toISOString(); payload.project.updatedAt=new Date().toISOString();
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  const safe=(payload.project.name||'projekt').toLowerCase().replace(/[^a-z0-9äöüß]+/gi,'-').replace(/^-|-$/g,''); a.download=`${safe||'projekt'}.gantt.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); toast('Projektdatei gespeichert.');
}

function buildSettings() {
  const labels={showToday:'Heute markieren',showWeekends:'Wochenenden markieren',showHolidays:'Feiertage markieren',showPhaseBands:'Phasen einfärben',showBaseline:'Baseline anzeigen',showBuffer:'Puffer anzeigen',showOwners:'Owner anzeigen',showProgressLabels:'Fortschritt anzeigen',showStatusLine:'Abhängigkeiten anzeigen',showRelativeToday:'Relativen Termin anzeigen'};
  $('settingsList').innerHTML=Object.entries(labels).map(([key,label])=>`<label class="toggle-row"><span>${label}</span><input type="checkbox" data-setting="${key}"></label>`).join('');
  $('settingsList').addEventListener('change',e=>{ const key=e.target.dataset.setting;if(!key)return;envelope.project.planning.settings[key]=e.target.checked;touch();scheduleSave();renderGanttOnly(); });
}
function syncSettings() { document.querySelectorAll('[data-setting]').forEach(cb=>{cb.checked=envelope.project.planning.settings[cb.dataset.setting]!==false;}); }

let toastTimer; function toast(message){const t=$('toast');t.textContent=message;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),2200);}
function esc(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function escAttr(v=''){return esc(v);}

boot();
