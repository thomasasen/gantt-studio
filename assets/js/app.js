import { renderGantt } from './gantt.js?v=1.4.3';
import { saveLocal, loadActive, loadProject, listProjects, deleteProject, setActiveProject } from './storage.js';

const $ = (id) => document.getElementById(id);
const clone = (x) => JSON.parse(JSON.stringify(x));
const uuid = () => crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const todayIso = () => new Date().toISOString().slice(0, 10);
const DAY = 86400000;

const defaults = {
  schema: 'gantt-studio.project', schemaVersion: 1, generator: 'Gantt Studio Pages',
  project: {
    id: '', name: 'Neues Projekt', createdAt: '', updatedAt: '', tasks: [],
    design: { colors: { pageBg:'#EEF2F3',panelBg:'#FFFFFF',headerBg:'#16324F',primary:'#16324F',accent:'#607A00',critical:'#16324F',workstream:'#3B7280',milestone:'#607A00',gate:'#8B5A2B',arrow:'#657983',grid:'#DCE4E7',text:'#243746',mutedText:'#687D87',border:'#D8E1E4',saturday:'#F1E2E2',sunday:'#F1E2E2',holiday:'#F3CACA' } },
    planning: { settings: { showToday:true,showStatusLine:true,showDependencies:true,showWeekends:true,showHolidays:true,showPhaseBands:true,showBaseline:true,showBuffer:true,showRisk:true,showOwners:true,showProgressLabels:true,showDateLabels:true,showRelativeToday:false,relativeOffsetDays:14,relativeDayMode:'workdays',relativeSkipHolidays:true,relativeLabel:'Vorbereitungstermin',relativeColor:'#C2007B',relativeStyle:'solid' }, phases:[],markers:[],holidays:[] },
    labelConfig: { enabled:true,tracks:4,leaderLines:true,ellipsis:true,twoLine:true,maxWidth:240,placement:'auto',groups:{name:true,progress:true,owner:false,dates:false,phase:false,status:false,risk:false} },
    revision: 1
  }
};

const managementDefaults = { critical:true,milestones:true,gates:true,risks:true,redStatus:true,overdue:true };
let envelope = createEnvelope();
let zoom = 'week';
let managementMode = 'operational';
let managementCriteria = { ...managementDefaults };
let collapsedPhases = new Set();
let saveTimer = null;
let toastTimer = null;
let activeTab = 'project';

function createEnvelope() {
  const now = new Date().toISOString();
  const x = clone(defaults);
  x.exportedAt = now; x.project.id = uuid(); x.project.createdAt = now; x.project.updatedAt = now;
  return x;
}

function normalizeEnvelope(raw) {
  if (!raw || raw.schema !== 'gantt-studio.project' || !raw.project || !Array.isArray(raw.project.tasks)) throw new Error('Keine gültige Gantt-Studio-Projektdatei.');
  const n = clone(defaults);
  n.exportedAt = raw.exportedAt || new Date().toISOString();
  n.generator = raw.generator || 'Gantt Studio';
  n.schemaVersion = raw.schemaVersion || 1;
  n.project = {
    ...n.project, ...raw.project,
    design: { ...n.project.design, ...(raw.project.design || {}), colors: { ...n.project.design.colors, ...(raw.project.design?.colors || {}) } },
    planning: { ...n.project.planning, ...(raw.project.planning || {}), settings: { ...n.project.planning.settings, ...(raw.project.planning?.settings || {}) }, phases: raw.project.planning?.phases || [], markers: raw.project.planning?.markers || [], holidays: raw.project.planning?.holidays || [] },
    labelConfig: { ...n.project.labelConfig, ...(raw.project.labelConfig || {}), groups: { ...n.project.labelConfig.groups, ...(raw.project.labelConfig?.groups || {}) } }
  };
  n.project.id ||= uuid();
  n.project.tasks = n.project.tasks.map(t => ({ dependencies:[],progress:0,type:'workstream',owner:'',status:'neutral',risk:'none',baselineStart:'',baselineEnd:'',bufferDays:0,costEur:0,url:'',notes:'',showInGantt:true,...t }));
  validateGraph(n.project.tasks);
  return n;
}

async function boot() {
  bindEvents();
  buildSettings();
  let local = null;
  try { local = await loadActive(); } catch (e) { console.warn(e); }
  if (!local) {
    const projects = await listProjects();
    if (projects.length) local = projects[0];
  }
  if (local) envelope = normalizeEnvelope({ schema:'gantt-studio.project', schemaVersion:1, generator:'Gantt Studio', project:local });
  else await saveLocal(envelope.project);
  loadViewState();
  await renderAll();
}

function bindEvents() {
  $('newProjectBtn').addEventListener('click', createProject);
  $('deleteProjectBtn').addEventListener('click', removeProject);
  $('projectSelect').addEventListener('change', changeProject);
  $('openProjectBtn').addEventListener('click', () => $('fileInput').click());
  $('fileInput').addEventListener('change', importFile);
  $('addTaskBtn').addEventListener('click', () => openTaskDialog());
  $('guideBtn').addEventListener('click', () => $('guideDialog').showModal());
  $('designBtn').addEventListener('click', openDesignDialog);
  $('saveDesignBtn').addEventListener('click', saveDesign);
  $('designPresetOdin').addEventListener('click', () => setDesignPreset('odin'));
  $('designPresetNeutral').addEventListener('click', () => setDesignPreset('neutral'));
  $('centralExportBtn').addEventListener('click', () => $('exportDialog').showModal());
  $('exportJsonBtn').addEventListener('click', exportProject);
  $('exportCsvBtn').addEventListener('click', exportCsv);
  $('printPdfBtn').addEventListener('click', () => { $('exportDialog').close(); window.print(); });
  $('projectTabBtn').addEventListener('click', () => switchTab('project'));
  $('planningTabBtn').addEventListener('click', () => switchTab('planning'));
  document.querySelectorAll('[data-zoom]').forEach(btn => btn.addEventListener('click', () => setZoom(btn.dataset.zoom)));
  document.querySelectorAll('[data-management-mode]').forEach(btn => btn.addEventListener('click', () => setManagementMode(btn.dataset.managementMode)));
  document.querySelectorAll('[data-management-criterion]').forEach(cb => cb.addEventListener('change', () => { managementCriteria[cb.dataset.managementCriterion] = cb.checked; saveViewState(); renderGanttOnly(); syncControlStates(); }));
  $('projectName').addEventListener('change', async e => { envelope.project.name = e.target.value.trim() || 'Unbenanntes Projekt'; touch(); await persist(); await renderPortfolio(); });
  $('saveTaskBtn').addEventListener('click', saveTask);
  $('deleteTaskBtn').addEventListener('click', deleteTask);
  $('ganttStage').addEventListener('click', e => { if (Date.now() < (window.__ganttDragUntil || 0)) return; const phaseRow=e.target.closest('[data-phase-id]'); const phaseId=phaseRow?.dataset.phaseId; if(phaseId){ collapsedPhases.has(phaseId)?collapsedPhases.delete(phaseId):collapsedPhases.add(phaseId); saveViewState(); renderPhaseToolbar(); renderGanttOnly(); return; } const node=e.target.closest('[data-task-id]'); const id=node?.dataset.taskId; if(id) openTaskDialog(id); });
  $('ganttStage').addEventListener('keydown', e => { if(!['Enter',' '].includes(e.key)) return; const phaseRow=e.target.closest('[data-phase-id]'); const phaseId=phaseRow?.dataset.phaseId; if(!phaseId)return; e.preventDefault(); collapsedPhases.has(phaseId)?collapsedPhases.delete(phaseId):collapsedPhases.add(phaseId); saveViewState(); renderPhaseToolbar(); renderGanttOnly(); });
  $('phaseCollapseToolbar').addEventListener('click', handlePhaseCollapseClick);
  $('addPhaseBtn').addEventListener('click', () => openEntity('phase'));
  $('addMarkerBtn').addEventListener('click', () => openEntity('marker'));
  $('addHolidayBtn').addEventListener('click', () => openEntity('holiday'));
  $('saveEntityBtn').addEventListener('click', saveEntity);
  $('deleteEntityBtn').addEventListener('click', deleteEntity);
  $('importHolidayBtn').addEventListener('click', importGermanHolidays);
  for (const id of ['relativeEnabled','relativeOffset','relativeMode','relativeLabel','relativeColor','relativeStyle','relativeSkipHolidays']) {
    $(id).addEventListener('change', handleRelativeSettingChange);
  }
  $('relativeTargetDate').addEventListener('change', handleRelativeTargetDateChange);
  $('relativeJumpBtn').addEventListener('click', jumpToRelativeLine);
  for (const id of ['phaseList','markerList','holidayList']) $(id).addEventListener('click', e => { const row=e.target.closest('[data-entity-id]'); if(row) openEntity(row.dataset.entityKind,row.dataset.entityId); });
  document.addEventListener('change', async e => { const key=e.target?.dataset?.setting; if(!key)return; envelope.project.planning.settings[key]=e.target.checked; touch(); await persist(); syncSettings(); renderGanttOnly(); });
  window.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==='s') { e.preventDefault(); exportProject(); } });
  document.addEventListener('input', e => { if (['designPrimary','designAccent','designWorkstream','designCritical','designMilestone','designGate','designPageBg','designPanelBg'].includes(e.target.id)) updateDesignPreview(); });
}

async function renderAll() {
  applyDesign();
  $('projectName').value = envelope.project.name;
  await renderPortfolio();
  renderMeta(); renderMetrics(); renderPlanningLists(); syncSettings(); renderQuickSettings(); renderPhaseToolbar(); renderGanttOnly(); populateTaskPhases(); syncControlStates();
}

async function renderPortfolio() {
  const projects = await listProjects();
  $('projectSelect').innerHTML = projects.map(p => `<option value="${esc(p.id)}">${esc(p.name)} · ${p.tasks.length} Aufgaben</option>`).join('');
  $('projectSelect').value = envelope.project.id;
}

function renderMeta() {
  const p = envelope.project;
  const updated = p.updatedAt ? new Intl.DateTimeFormat('de-DE',{dateStyle:'medium',timeStyle:'short'}).format(new Date(p.updatedAt)) : '—';
  $('projectMeta').textContent = `Revision ${p.revision || 1} · zuletzt geändert ${updated} · lokal im Browser gespeichert`;
}

function setSaveStatus(state, detail='Lokal im Browser') {
  const box=$('saveStatus'); if(!box)return;
  box.className=`save-status ${state}`;
  $('saveStatusText').textContent=state==='saving'?'Speichert…':state==='error'?'Nicht gespeichert':'Gespeichert';
  $('saveStatusDetail').textContent=detail;
  box.querySelector('.save-status-icon').textContent=state==='saving'?'…':state==='error'?'!':'✓';
}

function renderMetrics() {
  const tasks = envelope.project.tasks;
  const milestones = tasks.filter(t => t.type === 'milestone').length;
  const progress = tasks.length ? Math.round(tasks.reduce((sum,t)=>sum+(Number(t.progress)||0),0)/tasks.length) : 0;
  const end = tasks.length ? tasks.map(t=>t.end).filter(Boolean).sort().at(-1) : '';
  const metrics = [['Aufgaben',tasks.length],['Meilensteine',milestones],['Fortschritt',`${progress} %`],['Projektende',end?formatDate(end):'–']];
  $('metrics').innerHTML = metrics.map(([label,value])=>`<div class="metric"><span>${label}</span><strong>${value}</strong></div>`).join('');
}

function filteredBaseTasks() {
  const tasks = envelope.project.tasks.filter(t=>t.showInGantt!==false);
  if (managementMode === 'operational') return tasks;
  if (managementMode === 'milestones') return tasks.filter(t => ['milestone','gate'].includes(t.type));
  const today = todayIso();
  return tasks.filter(t =>
    (managementCriteria.critical && t.type==='critical') ||
    (managementCriteria.milestones && t.type==='milestone') ||
    (managementCriteria.gates && t.type==='gate') ||
    (managementCriteria.risks && ['high','critical'].includes(t.risk)) ||
    (managementCriteria.redStatus && t.status==='red') ||
    (managementCriteria.overdue && t.end < today && Number(t.progress||0)<100)
  );
}

function visibleTasks() {
  const base=filteredBaseTasks();
  const phases=(envelope.project.planning?.phases||[]).slice().sort((a,b)=>(a.start||'').localeCompare(b.start||''));
  if(!phases.length) return base;
  const byPhase=new Map(phases.map(p=>[p.id,[]]));
  const unphased=[];
  for(const task of base){ if(task.phaseId && byPhase.has(task.phaseId)) byPhase.get(task.phaseId).push(task); else unphased.push(task); }
  const out=[];
  for(const phase of phases){
    const tasks=byPhase.get(phase.id)||[];
    if(!tasks.length) continue;
    out.push(makePhaseSummary(phase,tasks));
    if(!collapsedPhases.has(String(phase.id))) out.push(...tasks);
  }
  out.push(...unphased);
  return out;
}

function makePhaseSummary(phase,tasks){
  const starts=tasks.map(t=>t.start).filter(Boolean).sort(), ends=tasks.map(t=>t.end).filter(Boolean).sort();
  const start=phase.start||starts[0]||todayIso(), end=phase.end||ends.at(-1)||start;
  const progress=tasks.length?Math.round(tasks.reduce((s,t)=>s+Number(t.progress||0),0)/tasks.length):0;
  return {id:`phase-summary-${phase.id}`,name:phase.name||'Phase',start,end,progress,type:'phase-summary',dependencies:[],phaseId:phase.id,owner:`${tasks.length} Aufgaben`,status:'neutral',risk:'none',showInGantt:true,syntheticPhase:true,phaseColor:phase.color||'#DCE8EB',collapsed:collapsedPhases.has(String(phase.id)),taskCount:tasks.length};
}

function renderGanttOnly() {
  const project = clone(envelope.project);
  const tasks = visibleTasks();
  project.tasks = tasks;
  const stage = $('ganttStage');
  const result = renderGantt(stage, project, { zoom, onTaskChange:applyTimelineChange });
  const actualCount=tasks.filter(t=>!t.syntheticPhase).length;
  $('visibleTaskCount').textContent = actualCount===1?'1 Aufgabe':`${actualCount} Aufgaben`;
  if (result.empty) {
    stage.innerHTML = `<div class="empty-state"><strong>${envelope.project.tasks.length?'Keine Aufgaben in dieser Ansicht':'Noch keine Aufgaben'}</strong><span>${envelope.project.tasks.length?'Passe Filter oder Phasen an.':'Erstelle eine Aufgabe oder importiere ein Projekt.'}</span><button class="btn primary" id="emptyAddBtn2" type="button">Aufgabe erstellen</button></div>`;
    $('emptyAddBtn2').addEventListener('click',()=>openTaskDialog());
  }
}

async function applyTimelineChange(change){
  const task=envelope.project.tasks.find(t=>t.id===change.id); if(!task)return;
  if(change.start)task.start=change.start; if(change.end)task.end=change.end; if(Number.isFinite(change.progress))task.progress=clamp(Math.round(change.progress),0,100);
  if(task.end<task.start){const x=task.start;task.start=task.end;task.end=x;}
  sortTasks(); touch(); await persist(); renderMetrics(); renderPhaseToolbar(); renderGanttOnly();
}

function renderPhaseToolbar(){
  const phases=(envelope.project.planning?.phases||[]).slice().sort((a,b)=>(a.start||'').localeCompare(b.start||''));
  const box=$('phaseCollapseToolbar');
  if(!phases.length){box.hidden=true;box.innerHTML='';return;} box.hidden=false;
  const counts=new Map(phases.map(p=>[p.id,envelope.project.tasks.filter(t=>t.phaseId===p.id).length]));
  box.innerHTML=`<div class="phase-collapse-heading"><div><strong>Phasen</strong><span>Aufgaben im Zeitplan ein- oder ausblenden</span></div><div class="phase-collapse-actions"><button class="link-button" type="button" data-phase-action="expand-all">Alle ausklappen</button><button class="link-button" type="button" data-phase-action="collapse-all">Alle einklappen</button></div></div><div class="phase-collapse-list">${phases.map(p=>{const collapsed=collapsedPhases.has(String(p.id));return `<button type="button" class="phase-collapse-button ${collapsed?'collapsed':'expanded'}" data-phase-id="${esc(p.id)}" aria-expanded="${!collapsed}" style="--phase-control-color:${esc(p.color||'#DCE8EB')}"><span class="phase-collapse-icon">${collapsed?'▶':'▼'}</span><span class="phase-collapse-label">${esc(p.name||'Phase')}</span><span class="phase-collapse-count">${counts.get(p.id)||0}</span></button>`}).join('')}</div>`;
}

function handlePhaseCollapseClick(e){
  const action=e.target.closest('[data-phase-action]')?.dataset.phaseAction;
  if(action==='expand-all')collapsedPhases.clear();
  else if(action==='collapse-all')collapsedPhases=new Set((envelope.project.planning?.phases||[]).map(p=>String(p.id)));
  else {const id=e.target.closest('[data-phase-id]')?.dataset.phaseId;if(!id)return;collapsedPhases.has(id)?collapsedPhases.delete(id):collapsedPhases.add(id);}
  saveViewState();renderPhaseToolbar();renderGanttOnly();
}

function switchTab(tab){
  activeTab=tab==='planning'?'planning':'project';
  $('projectView').hidden=activeTab!=='project';$('planningView').hidden=activeTab!=='planning';
  $('projectTabBtn').classList.toggle('active',activeTab==='project');$('planningTabBtn').classList.toggle('active',activeTab==='planning');
  $('projectTabBtn').setAttribute('aria-selected',String(activeTab==='project'));$('planningTabBtn').setAttribute('aria-selected',String(activeTab==='planning'));
  if(activeTab==='planning'){syncSettings();renderPlanningLists();}
}

function setZoom(value){zoom=['day','week','month'].includes(value)?value:'week';saveViewState();syncControlStates();renderGanttOnly();}
function setManagementMode(value){managementMode=['operational','management','milestones'].includes(value)?value:'operational';saveViewState();syncControlStates();renderGanttOnly();}
function syncControlStates(){
  document.querySelectorAll('[data-zoom]').forEach(b=>b.classList.toggle('active',b.dataset.zoom===zoom));
  document.querySelectorAll('[data-management-mode]').forEach(b=>b.classList.toggle('active',b.dataset.managementMode===managementMode));
  document.querySelectorAll('[data-management-criterion]').forEach(cb=>cb.checked=managementCriteria[cb.dataset.managementCriterion]!==false);
}

function viewKey(){return `gantt-studio.view-v2:${envelope.project.id}`;}
function loadViewState(){try{const v=JSON.parse(localStorage.getItem(viewKey())||'{}');zoom=['day','week','month'].includes(v.zoom)?v.zoom:'week';managementMode=['operational','management','milestones'].includes(v.managementMode)?v.managementMode:'operational';managementCriteria={...managementDefaults,...(v.managementCriteria||{})};collapsedPhases=new Set(Array.isArray(v.collapsedPhases)?v.collapsedPhases.map(String):[]);}catch{zoom='week';managementMode='operational';managementCriteria={...managementDefaults};collapsedPhases=new Set();}}
function saveViewState(){localStorage.setItem(viewKey(),JSON.stringify({zoom,managementMode,managementCriteria,collapsedPhases:[...collapsedPhases]}));}

function renderQuickSettings(){
  const labels={showToday:'Heute-Linie',showStatusLine:'Fortschrittslinie',showDependencies:'Abhängigkeiten',showWeekends:'Wochenenden',showHolidays:'Feiertage',showPhaseBands:'Phasenbänder',showBaseline:'Baseline / Soll-Plan',showBuffer:'Pufferzeiten',showRisk:'Risikoindikatoren',showOwners:'Verantwortliche',showProgressLabels:'Fortschritt im Balken',showDateLabels:'Start- und Enddatum'};
  $('quickSettingsList').innerHTML=Object.entries(labels).map(([key,label])=>`<label><input type="checkbox" data-setting="${key}"> <span>${label}</span></label>`).join('');
  syncSettings();
}

function openTaskDialog(id=null) {
  const task=id ? envelope.project.tasks.find(t=>t.id===id) : null;
  const today=todayIso();
  $('taskDialogTitle').textContent=task?'Aufgabe bearbeiten':'Neue Aufgabe';
  $('taskId').value=task?.id||''; $('taskName').value=task?.name||''; $('taskStart').value=task?.start||today; $('taskEnd').value=task?.end||today;
  $('taskType').value=task?.type||'workstream'; $('taskProgress').value=task?.progress??0; $('taskOwner').value=task?.owner||''; $('taskStatus').value=task?.status||'neutral'; $('taskRisk').value=task?.risk||'none';
  populateTaskPhases(task?.phaseId||''); populateDependencies(task);
  $('taskBaselineStart').value=task?.baselineStart||''; $('taskBaselineEnd').value=task?.baselineEnd||''; $('taskBuffer').value=task?.bufferDays??0; $('taskCost').value=task?.costEur??''; $('taskUrl').value=task?.url||''; $('taskNotes').value=task?.notes||'';
  $('deleteTaskBtn').style.visibility=task?'visible':'hidden'; $('taskDialog').showModal(); $('taskName').focus();
}

function populateTaskPhases(selected='') {
  $('taskPhase').innerHTML=['<option value="">Keine Phase</option>',...(envelope.project.planning?.phases||[]).map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`)].join('');
  $('taskPhase').value=selected;
}
function populateDependencies(task) {$('taskDependencies').innerHTML=envelope.project.tasks.filter(t=>t.id!==task?.id).map(t=>`<option value="${esc(t.id)}" ${(task?.dependencies||[]).includes(t.id)?'selected':''}>${esc(t.name)}</option>`).join('');}

async function saveTask() {
  const name=$('taskName').value.trim(), start=$('taskStart').value, end=$('taskEnd').value;
  if(!name||!start||!end) return toast('Name, Start und Ende sind Pflicht.',true);
  if(end<start) return toast('Das Enddatum darf nicht vor dem Start liegen.',true);
  const baselineStart=$('taskBaselineStart').value, baselineEnd=$('taskBaselineEnd').value;
  if(baselineStart&&baselineEnd&&baselineEnd<baselineStart) return toast('Das Baseline-Enddatum darf nicht vor dem Start liegen.',true);
  const id=$('taskId').value||uuid();
  const task={id,name,start,end,progress:clamp(Number($('taskProgress').value)||0,0,100),type:$('taskType').value,dependencies:[...$('taskDependencies').selectedOptions].map(o=>o.value),phaseId:$('taskPhase').value||'',owner:$('taskOwner').value.trim().slice(0,80),status:$('taskStatus').value,risk:$('taskRisk').value,baselineStart,baselineEnd,bufferDays:clamp(Number($('taskBuffer').value)||0,0,365),costEur:Math.max(0,Number($('taskCost').value)||0),url:safeUrl($('taskUrl').value),notes:$('taskNotes').value.trim().slice(0,2000),showInGantt:true};
  const copy=envelope.project.tasks.map(t=>t.id===id?task:t); if(!copy.some(t=>t.id===id)) copy.push(task);
  try { validateGraph(copy); } catch(e) { return toast(e.message,true); }
  const idx=envelope.project.tasks.findIndex(t=>t.id===id); if(idx>=0) envelope.project.tasks[idx]=task; else envelope.project.tasks.push(task);
  sortTasks(); touch(); await persist(); $('taskDialog').close(); await renderAll(); toast(idx>=0?'Aufgabe aktualisiert.':'Aufgabe erstellt.');
}

async function deleteTask() {const id=$('taskId').value;if(!id)return;envelope.project.tasks=envelope.project.tasks.filter(t=>t.id!==id).map(t=>({...t,dependencies:(t.dependencies||[]).filter(dep=>dep!==id)}));touch();await persist();$('taskDialog').close();await renderAll();toast('Aufgabe gelöscht.');}

async function createProject() {const name=(prompt('Name des neuen Projekts:','Neues Projekt')||'').trim();if(!name)return;envelope=createEnvelope();envelope.project.name=uniqueName(name,await listProjects());await saveLocal(envelope.project);setActiveProject(envelope.project.id);loadViewState();await renderAll();toast('Projekt wurde angelegt.');}
async function changeProject(e) {const p=await loadProject(e.target.value);if(!p)return;envelope=normalizeEnvelope({schema:'gantt-studio.project',schemaVersion:1,generator:'Gantt Studio',project:p});setActiveProject(p.id);loadViewState();await renderAll();}
async function removeProject() {const projects=await listProjects();if(!envelope.project?.id)return;if(!confirm(`Projekt „${envelope.project.name}“ vollständig löschen?`))return;await deleteProject(envelope.project.id);const remaining=projects.filter(p=>p.id!==envelope.project.id);if(remaining.length){const p=await loadProject(remaining[0].id);envelope=normalizeEnvelope({schema:'gantt-studio.project',schemaVersion:1,generator:'Gantt Studio',project:p});setActiveProject(p.id);}else{envelope=createEnvelope();await saveLocal(envelope.project);}loadViewState();await renderAll();toast('Projekt wurde gelöscht.');}

async function importFile(event) {const file=event.target.files?.[0];if(!file)return;try{envelope=cloneForImport(normalizeEnvelope(JSON.parse(await file.text())));envelope.project.name=uniqueName(envelope.project.name,await listProjects());await saveLocal(envelope.project);loadViewState();await renderAll();toast('Projekt importiert.');}catch(e){toast(e.message||'Datei konnte nicht importiert werden.',true);}finally{event.target.value='';}}
function cloneForImport(source) {const e=clone(source),map=new Map();e.project.tasks.forEach(t=>map.set(t.id,uuid()));e.project.tasks=e.project.tasks.map(t=>({...t,id:map.get(t.id),dependencies:(t.dependencies||[]).map(d=>map.get(d)).filter(Boolean)}));const now=new Date().toISOString();e.project.id=uuid();e.project.createdAt=now;e.project.updatedAt=now;e.project.revision=1;e.exportedAt=now;return e;}

function exportProject() {const payload=clone(envelope);payload.exportedAt=new Date().toISOString();download(JSON.stringify(payload,null,2),`${slug(payload.project.name)}-${todayIso()}.gantt.json`,'application/json');$('exportDialog').close();toast('Projektdatei exportiert.');}
function exportCsv(){const q=v=>`"${String(v??'').replaceAll('"','""')}"`;const rows=[['Name','Start','Ende','Fortschritt','Typ','Owner','Status','Risiko','Phase','Kosten','Vorgänger'].join(';'),...envelope.project.tasks.map(t=>[t.name,t.start,t.end,t.progress,t.type,t.owner,t.status,t.risk,(envelope.project.planning.phases.find(p=>p.id===t.phaseId)?.name||''),t.costEur,(t.dependencies||[]).join(',')].map(q).join(';'))];download('\ufeff'+rows.join('\n'),`${slug(envelope.project.name)}-${todayIso()}.csv`,'text/csv;charset=utf-8');$('exportDialog').close();toast('Aufgabenübersicht exportiert.');}

function buildSettings() {
  const labels={showToday:'Heute-Linie',showStatusLine:'Fortschrittslinie',showWeekends:'Wochenenden markieren',showHolidays:'Feiertage markieren',showPhaseBands:'Phasenbänder',showBaseline:'Baseline / Soll-Plan',showBuffer:'Pufferzeiten',showRisk:'Risikoindikatoren',showOwners:'Verantwortliche an Balken',showProgressLabels:'Fortschritt im Balkentext',showDateLabels:'Start- und Enddatum im Balkentext',showDependencies:'Abhängigkeiten'};
  $('settingsList').innerHTML=Object.entries(labels).map(([key,label])=>`<label class="toggle-row"><input type="checkbox" data-setting="${key}"><span>${label}</span></label>`).join('');
}
function syncSettings(){const settings=envelope.project.planning.settings;document.querySelectorAll('[data-setting]').forEach(cb=>cb.checked=settings[cb.dataset.setting]!==false);const keys=[...document.querySelectorAll('#settingsList [data-setting]')].map(cb=>cb.dataset.setting);const active=keys.filter(key=>settings[key]!==false).length;if($('displayActiveCount'))$('displayActiveCount').textContent=`${active} von ${keys.length} aktiv`;}
function normalizeRelativeSettings(settings){const n=Number(settings.relativeOffsetDays);settings.showRelativeToday=!!settings.showRelativeToday;settings.relativeOffsetDays=Number.isFinite(n)?clamp(Math.round(n),-3650,3650):14;settings.relativeDayMode=settings.relativeDayMode==='workdays'?'workdays':'calendar';settings.relativeSkipHolidays=settings.relativeSkipHolidays!==false;settings.relativeLabel=String(settings.relativeLabel||'').trim().slice(0,80);settings.relativeColor=/^#[0-9A-F]{6}$/i.test(String(settings.relativeColor||''))?String(settings.relativeColor).toUpperCase():'#C2007B';settings.relativeStyle=['solid','dashed','dotted'].includes(settings.relativeStyle)?settings.relativeStyle:'dashed';}
function holidaySet(){return new Set((envelope.project.planning.holidays||[]).map(h=>h.date).filter(Boolean));}
function isWorkdayIso(dateIso,skipHolidays=envelope.project.planning.settings.relativeSkipHolidays!==false){const d=new Date(`${dateIso}T00:00:00Z`),day=d.getUTCDay();if(day===0||day===6)return false;return !skipHolidays||!holidaySet().has(dateIso);}
function calculateRelativeTarget(baseIso=todayIso()){const settings=envelope.project.planning.settings;normalizeRelativeSettings(settings);const offset=Number(settings.relativeOffsetDays)||0,d=new Date(`${baseIso}T00:00:00Z`);if(settings.relativeDayMode!=='workdays'||offset===0){d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10);}const step=offset>0?1:-1;let remaining=Math.abs(offset);while(remaining>0){d.setUTCDate(d.getUTCDate()+step);const candidate=d.toISOString().slice(0,10);if(isWorkdayIso(candidate,settings.relativeSkipHolidays!==false))remaining--;}return d.toISOString().slice(0,10);}
function offsetFromTarget(targetIso){const settings=envelope.project.planning.settings;normalizeRelativeSettings(settings);const base=todayIso();if(settings.relativeDayMode!=='workdays')return Math.round((new Date(`${targetIso}T00:00:00Z`)-new Date(`${base}T00:00:00Z`))/DAY);const target=new Date(`${targetIso}T00:00:00Z`),current=new Date(`${base}T00:00:00Z`);if(target.getTime()===current.getTime())return 0;const step=target>current?1:-1;let count=0;while(current.getTime()!==target.getTime()){current.setUTCDate(current.getUTCDate()+step);const candidate=current.toISOString().slice(0,10),weekend=[0,6].includes(current.getUTCDay()),holiday=settings.relativeSkipHolidays!==false&&holidaySet().has(candidate);if(!weekend&&!holiday)count+=step;}return count;}
function relativeDisplayLabel(){const settings=envelope.project.planning.settings;if(settings.relativeLabel)return settings.relativeLabel;const n=Number(settings.relativeOffsetDays)||0;if(n===0)return'Heute';return`Heute ${n>0?'+':'−'} ${Math.abs(n)} ${settings.relativeDayMode==='workdays'?'AT':'T'}`;}
function syncRelativeEditor(){const settings=envelope.project.planning.settings;normalizeRelativeSettings(settings);$('relativeEnabled').checked=settings.showRelativeToday;$('relativeOffset').value=String(settings.relativeOffsetDays);$('relativeMode').value=settings.relativeDayMode;$('relativeLabel').value=settings.relativeLabel;$('relativeColor').value=settings.relativeColor;$('relativeStyle').value=settings.relativeStyle;$('relativeSkipHolidays').checked=settings.relativeSkipHolidays;$('relativeSkipHolidays').disabled=settings.relativeDayMode!=='workdays';const target=calculateRelativeTarget();$('relativeTargetDate').value=target;$('relativeResultText').textContent=`${relativeDisplayLabel()} · ${formatDate(target)}`;$('relativeJumpBtn').disabled=!settings.showRelativeToday;$('relative-today-editor').classList.toggle('inactive',!settings.showRelativeToday);}
async function handleRelativeSettingChange(e){const settings=envelope.project.planning.settings;if(e.target.id==='relativeEnabled')settings.showRelativeToday=e.target.checked;if(e.target.id==='relativeOffset')settings.relativeOffsetDays=Number(e.target.value);if(e.target.id==='relativeMode')settings.relativeDayMode=e.target.value;if(e.target.id==='relativeLabel')settings.relativeLabel=e.target.value;if(e.target.id==='relativeColor')settings.relativeColor=e.target.value;if(e.target.id==='relativeStyle')settings.relativeStyle=e.target.value;if(e.target.id==='relativeSkipHolidays')settings.relativeSkipHolidays=e.target.checked;normalizeRelativeSettings(settings);touch();await persist();syncRelativeEditor();renderGanttOnly();}
async function handleRelativeTargetDateChange(){const target=$('relativeTargetDate').value;if(!target)return;const settings=envelope.project.planning.settings;normalizeRelativeSettings(settings);if(settings.relativeDayMode==='workdays'&&!isWorkdayIso(target,settings.relativeSkipHolidays!==false)){toast('Das gewählte Datum ist kein Arbeitstag. Bitte einen Arbeitstag wählen oder auf Kalendertage umstellen.',true);syncRelativeEditor();return;}settings.relativeOffsetDays=offsetFromTarget(target);touch();await persist();syncRelativeEditor();renderGanttOnly();}
function jumpToRelativeLine(){if(!envelope.project.planning.settings.showRelativeToday)return;switchTab('project');renderGanttOnly();requestAnimationFrame(()=>{const line=document.querySelector('.relative-today-line'),scroller=$('ganttScroller');if(!line||!scroller){toast(`Das Zieldatum ${formatDate(calculateRelativeTarget())} liegt außerhalb des aktuell dargestellten Projektzeitraums.`,true);return;}const leftWidth=parseInt(getComputedStyle(document.documentElement).getPropertyValue('--left-width'))||430;scroller.scrollTo({left:Math.max(0,leftWidth+line.offsetLeft-scroller.clientWidth/2),behavior:'smooth'});});}
function renderPlanningLists(){const planning=envelope.project.planning,cost=envelope.project.tasks.reduce((sum,t)=>sum+(Number(t.costEur)||0),0);if($('planningCost'))$('planningCost').textContent=formatMoney(cost);if($('phaseCountBadge'))$('phaseCountBadge').textContent=`${planning.phases.length} ${planning.phases.length===1?'Phase':'Phasen'}`;const gates=envelope.project.tasks.filter(t=>t.type==='gate').length,markerTotal=planning.markers.length;if($('markerCountBadge'))$('markerCountBadge').textContent=`${markerTotal} ${markerTotal===1?'Stichtag':'Stichtage'}${gates?` · ${gates} ${gates===1?'Gate':'Gates'}`:''}`;if($('holidayCountBadge'))$('holidayCountBadge').textContent=`${planning.holidays.length} ${planning.holidays.length===1?'Sondertag':'Sondertage'}`;$('phaseList').innerHTML=entityRows('phase',planning.phases,p=>`${formatDate(p.start)} – ${formatDate(p.end)}`);$('markerList').innerHTML=entityRows('marker',planning.markers,p=>`${formatDate(p.date)} · ${p.style==='dashed'?'gestrichelt':p.style==='dotted'?'gepunktet':'durchgezogen'}`);$('holidayList').innerHTML=entityRows('holiday',planning.holidays,p=>`${formatDate(p.date)}${p.source?` · ${esc(p.source)}`:''}`);syncRelativeEditor();syncSettings();}

function entityRows(kind,items,detail){return items.length?items.slice().sort((a,b)=>(a.start||a.date||'').localeCompare(b.start||b.date||'')).map(x=>`<button type="button" class="entity-row" data-entity-kind="${kind}" data-entity-id="${esc(x.id)}"><span><strong>${esc(x.name)}</strong><small>${detail(x)}</small></span><i style="background:${esc(x.color||'#DCE8EB')}"></i></button>`).join(''):'<div class="muted-empty">Noch keine Einträge.</div>';}

function openEntity(kind,id=''){const list=kind==='phase'?envelope.project.planning.phases:kind==='marker'?envelope.project.planning.markers:envelope.project.planning.holidays;const item=list.find(x=>x.id===id)||{};$('entityKind').value=kind;$('entityId').value=id;$('deleteEntityBtn').style.visibility=id?'visible':'hidden';const cfg={phase:['PHASE','Phase bearbeiten'],marker:['STICHTAG','Stichtag bearbeiten'],holiday:['SONDERTAG','Sondertag bearbeiten']}[kind];$('entityEyebrow').textContent=cfg[0];$('entityTitle').textContent=id?cfg[1]:cfg[1].replace('bearbeiten','anlegen');if(kind==='phase')$('entityFields').innerHTML=`<label class="span-2">Name<input id="entityName" maxlength="120" required value="${esc(item.name||'')}"></label><label>Start<input id="entityStart" type="date" required value="${esc(item.start||todayIso())}"></label><label>Ende<input id="entityEnd" type="date" required value="${esc(item.end||todayIso())}"></label><label>Farbe<input id="entityColor" type="color" value="${esc(item.color||'#DCE8EB')}"></label>`;if(kind==='marker')$('entityFields').innerHTML=`<label class="span-2">Name<input id="entityName" maxlength="120" required value="${esc(item.name||'')}"></label><label>Datum<input id="entityDate" type="date" required value="${esc(item.date||todayIso())}"></label><label>Farbe<input id="entityColor" type="color" value="${esc(item.color||'#607A00')}"></label><label>Linie<select id="entityStyle"><option value="solid">Durchgezogen</option><option value="dashed">Gestrichelt</option><option value="dotted">Gepunktet</option></select></label>`;if(kind==='holiday')$('entityFields').innerHTML=`<label class="span-2">Name<input id="entityName" maxlength="120" required value="${esc(item.name||'')}"></label><label>Datum<input id="entityDate" type="date" required value="${esc(item.date||todayIso())}"></label>`;if(kind==='marker')$('entityStyle').value=item.style||'solid';$('entityDialog').showModal();}
async function saveEntity(){const kind=$('entityKind').value,id=$('entityId').value||uuid(),name=$('entityName').value.trim();if(!name)return toast('Name darf nicht leer sein.',true);const p=envelope.project.planning;const list=kind==='phase'?p.phases:kind==='marker'?p.markers:p.holidays;let item;if(kind==='phase'){const start=$('entityStart').value,end=$('entityEnd').value;if(!start||!end||end<start)return toast('Bitte einen gültigen Phasenzeitraum angeben.',true);item={id,name,start,end,color:$('entityColor').value};}else if(kind==='marker'){item={id,name,date:$('entityDate').value,color:$('entityColor').value,style:$('entityStyle').value};}else{item={id,name,date:$('entityDate').value,source:'manual',country:'',subdivision:'',imported:false,importedAt:''};}const idx=list.findIndex(x=>x.id===id);if(idx>=0)list[idx]=item;else list.push(item);touch();await persist();$('entityDialog').close();renderPlanningLists();populateTaskPhases();renderPhaseToolbar();renderGanttOnly();toast('Planungselement gespeichert.');}
async function deleteEntity(){const kind=$('entityKind').value,id=$('entityId').value;if(!id)return;const p=envelope.project.planning;if(kind==='phase'){p.phases=p.phases.filter(x=>x.id!==id);envelope.project.tasks=envelope.project.tasks.map(t=>t.phaseId===id?{...t,phaseId:''}:t);collapsedPhases.delete(String(id));}else if(kind==='marker')p.markers=p.markers.filter(x=>x.id!==id);else p.holidays=p.holidays.filter(x=>x.id!==id);touch();await persist();$('entityDialog').close();renderPlanningLists();populateTaskPhases();renderPhaseToolbar();renderGanttOnly();toast('Planungselement gelöscht.');}

async function importGermanHolidays(){const year=Number(prompt('Jahr für den Feiertagsimport:',String(new Date().getFullYear())));if(!Number.isInteger(year)||year<1975||year>2100)return;const subdivision=(prompt('Bundesland-Code (z. B. DE-BY). Leer = nur bundesweite Feiertage:','DE-BY')||'').trim().toUpperCase();try{const res=await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/DE`);if(!res.ok)throw new Error(`HTTP ${res.status}`);const raw=await res.json();const existing=new Set(envelope.project.planning.holidays.map(h=>`${h.date}|${h.name.toLowerCase()}`));let added=0;for(const h of raw){const counties=Array.isArray(h.counties)?h.counties.map(String):[];const national=h.global===true||!counties.length;if(!national&&(!subdivision||!counties.includes(subdivision)))continue;const name=String(h.localName||h.name||'').trim();const key=`${h.date}|${name.toLowerCase()}`;if(existing.has(key))continue;envelope.project.planning.holidays.push({id:uuid(),name,date:h.date,source:'Nager.Date',country:'DE',subdivision,imported:true,importedAt:new Date().toISOString()});existing.add(key);added++;}touch();await persist();renderPlanningLists();renderGanttOnly();toast(`${added} Feiertage importiert.`);}catch(e){toast(`Feiertagsimport fehlgeschlagen: ${e.message}`,true);}}

function openDesignDialog(){const c=envelope.project.design?.colors||{};$('designPrimary').value=c.primary||c.headerBg||'#16324F';$('designAccent').value=c.accent||'#607A00';$('designWorkstream').value=c.workstream||'#3B7280';$('designCritical').value=c.critical||'#16324F';$('designMilestone').value=c.milestone||'#607A00';$('designGate').value=c.gate||'#8B5A2B';$('designPageBg').value=c.pageBg||'#EEF2F3';$('designPanelBg').value=c.panelBg||'#FFFFFF';updateDesignPreview();$('designDialog').showModal();}
function setDesignPreset(name){const p=name==='neutral'?{primary:'#334155',accent:'#64748B',workstream:'#64748B',critical:'#1E293B',milestone:'#475569',gate:'#78716C',pageBg:'#F1F5F9',panelBg:'#FFFFFF'}:{primary:'#16324F',accent:'#607A00',workstream:'#3B7280',critical:'#16324F',milestone:'#607A00',gate:'#8B5A2B',pageBg:'#EEF2F3',panelBg:'#FFFFFF'};for(const [k,v] of Object.entries(p))$(`design${k[0].toUpperCase()+k.slice(1)}`).value=v;updateDesignPreview();}
function updateDesignPreview(){const d=$('designDialog');if(!d)return;d.style.setProperty('--preview-primary',$('designPrimary').value);d.style.setProperty('--preview-accent',$('designAccent').value);d.style.setProperty('--preview-work',$('designWorkstream').value);d.style.setProperty('--preview-critical',$('designCritical').value);d.style.setProperty('--preview-milestone',$('designMilestone').value);d.style.setProperty('--preview-gate',$('designGate').value);}
async function saveDesign(){const c=envelope.project.design.colors;c.primary=$('designPrimary').value;c.headerBg=c.primary;c.accent=$('designAccent').value;c.workstream=$('designWorkstream').value;c.critical=$('designCritical').value;c.milestone=$('designMilestone').value;c.gate=$('designGate').value;c.pageBg=$('designPageBg').value;c.panelBg=$('designPanelBg').value;touch();await persist();applyDesign();renderGanttOnly();$('designDialog').close();toast('Design gespeichert.');}
function applyDesign(){const c=envelope.project.design?.colors||{};const r=document.documentElement;const map={'--bg':c.pageBg,'--panel':c.panelBg,'--primary':c.primary||c.headerBg,'--accent':c.accent,'--workstream':c.workstream,'--critical':c.critical,'--milestone':c.milestone,'--gate':c.gate,'--ink':c.text,'--muted':c.mutedText,'--border':c.border,'--grid':c.grid};for(const [k,v] of Object.entries(map))if(v)r.style.setProperty(k,v);}

function validateGraph(tasks){const ids=new Set(tasks.map(t=>t.id)),byId=new Map(tasks.map(t=>[t.id,t]));for(const t of tasks)for(const dep of t.dependencies||[]){if(!ids.has(dep))throw new Error(`Aufgabe „${t.name}“ verweist auf einen unbekannten Vorgänger.`);if(dep===t.id)throw new Error(`Aufgabe „${t.name}“ darf nicht von sich selbst abhängen.`);}const visiting=new Set(),visited=new Set();const visit=id=>{if(visited.has(id))return;if(visiting.has(id))throw new Error('Die Aufgabenabhängigkeiten enthalten einen Zyklus.');visiting.add(id);for(const dep of byId.get(id)?.dependencies||[])visit(dep);visiting.delete(id);visited.add(id);};ids.forEach(visit);}
function sortTasks(){envelope.project.tasks.sort((a,b)=>(a.start||'').localeCompare(b.start||'')||(a.end||'').localeCompare(b.end||''));}
function touch(){envelope.project.updatedAt=new Date().toISOString();envelope.project.revision=Math.max(1,Number(envelope.project.revision)||1)+1;setSaveStatus('saving','Änderungen werden lokal gesichert');}
async function persist(){clearTimeout(saveTimer);try{await saveLocal(envelope.project);renderMeta();setSaveStatus('saved',`Lokal · ${new Intl.DateTimeFormat('de-DE',{hour:'2-digit',minute:'2-digit'}).format(new Date())}`);}catch(e){setSaveStatus('error','Browser-Speicherung fehlgeschlagen');throw e;}}
function uniqueName(name,projects){const used=new Set(projects.map(p=>p.name.toLowerCase()));if(!used.has(name.toLowerCase()))return name;for(let i=2;i<1000;i++){const candidate=`${name} (${i})`;if(!used.has(candidate.toLowerCase()))return candidate;}return `${name} ${Date.now()}`;}
function download(content,name,type){const blob=new Blob([content],{type});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
function safeUrl(v){const raw=String(v||'').trim();if(!raw)return'';try{const u=new URL(raw);return ['http:','https:'].includes(u.protocol)?u.toString():'';}catch{return'';}}
function clamp(n,min,max){return Math.min(max,Math.max(min,n));}
function formatDate(v){if(!v)return'–';return new Intl.DateTimeFormat('de-DE',{timeZone:'UTC'}).format(new Date(`${v}T12:00:00Z`));}
function formatMoney(v){return new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(v||0);}
function slug(v){return String(v||'projekt').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'projekt';}
function toast(message,error=false){const t=$('toast');t.textContent=message;t.classList.toggle('error',error);t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),2600);}
function esc(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}

boot();
