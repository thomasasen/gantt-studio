import { createEngineController } from './engine/engine-controller.mjs?v=2.8.1';
import { createNativeEngine } from './engine/native/native-adapter.mjs?v=2.8.1';
import { createProjectCommitter } from './core/project-commits.mjs?v=2.8.1';
import { createProjectActivationCoordinator } from './core/project-activation.mjs?v=2.8.1';
import { matchesEngineIntentScope } from './core/engine-intent-scope.mjs?v=2.8.1';
import { localTodayIso, isValidIsoDate } from './core/date-only.mjs?v=2.8.1';
import { icon, hydrateIcons } from './icons.mjs?v=2.8.1';
import { saveLocal, loadActive, loadProject, listProjects, deleteProject, setActiveProject } from './storage.js?v=2.8.1';
import { normalizeTaskOrder, nextDisplayOrder, sortedProjectTasks, phaseKey, reorderTask, nudgeTask } from './task-order.mjs?v=2.8.1';
import { DESIGN_COLOR_FIELDS, DESIGN_PRESETS, findDesignPreset, matchDesignPreset, designThemeMode } from './design-presets.mjs?v=2.8.1';

const $ = (id) => document.getElementById(id);
const clone = (x) => JSON.parse(JSON.stringify(x));
const uuid = () => crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const todayIso = () => localTodayIso();
const DAY = 86400000;

const defaults = {
  schema: 'gantt-studio.project', schemaVersion: 1, generator: 'Gantt Studio Pages',
  project: {
    id: '', name: 'Neues Projekt', createdAt: '', updatedAt: '', tasks: [],
    design: { colors: { pageBg:'#F3F6F8',panelBg:'#FFFFFF',headerBg:'#20374E',primary:'#20374E',accent:'#087E75',critical:'#30465F',workstream:'#2C7B88',milestone:'#95732C',gate:'#9C603F',arrow:'#657983',grid:'#DCE4E7',text:'#243746',mutedText:'#687D87',border:'#D8E1E4',saturday:'#F1E2E2',sunday:'#F1E2E2',holiday:'#F3CACA' } },
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
const projectCommitter = createProjectCommitter(saveLocal);
const engineController = createEngineController(createNativeEngine);
const projectActivation = createProjectActivationCoordinator({
  load: async id => {
    // A reactivated project must see any completed in-flight commit, not a
    // stale snapshot loaded before its previous write finishes.
    await projectCommitter.whenIdle(id);
    const project = await loadProject(id);
    if (!project) return null;
    return {project, portfolio: await listProjects()};
  },
  present: ({project, portfolio}) => presentProject(project, portfolio)
});
const deletingProjects = new Set();
let taskSavePending = false;
let entitySavePending = false;
const pendingSaves = new Map();
const lastSaveFailed = new Set();
let toastTimer = null;
let activeTab = 'project';
let taskDetailsExpanded = false;
let taskSortMode = 'manual';
let taskDrag = null;
let ganttLeftWidth = 0;
let resizeRenderQueued = false;

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
  normalizeTaskOrder(n.project);
  return n;
}

async function boot() {
  hydrateIcons();
  engineController.mount({container:$('ganttStage'),onIntent:handleEngineIntent,
    onSelect:handleEngineSelection,onError:error=>console.error('Gantt-Engine:',error),
    onStatus:setTaskOrderStatus});
  window.addEventListener('beforeunload',()=>engineController.destroy(),{once:true});
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
  setActiveProject(envelope.project.id);
  projectCommitter.remember(envelope.project);
  loadViewState();
  await renderAll();
  ganttLeftWidth = currentGanttLeftWidth();
}

function bindEvents() {
  window.addEventListener('resize', queueResponsiveGanttRender);
  $('newProjectBtn').addEventListener('click', createProject);
  $('loadDemoBtn').addEventListener('click', loadDemoProject);
  $('deleteProjectBtn').addEventListener('click', removeProject);
  $('projectSelect').addEventListener('change', changeProject);
  $('openProjectBtn').addEventListener('click', () => $('fileInput').click());
  $('fileInput').addEventListener('change', importFile);
  $('addTaskBtn').addEventListener('click', () => openTaskDialog());
  $('taskTableAddBtn').addEventListener('click', () => openTaskDialog());
  $('taskDetailsToggle').addEventListener('click', toggleTaskDetails);
  $('taskTableBody').addEventListener('click', handleTaskTableClick);
  $('taskTableBody').addEventListener('keydown', handleTaskTableKeydown);
  $('taskTableBody').addEventListener('pointerdown', startTaskDrag);
  document.querySelectorAll('[data-task-sort-mode]').forEach(button =>
    button.addEventListener('click', () => setTaskSortMode(button.dataset.taskSortMode)));

  $('guideBtn').addEventListener('click', () => $('guideDialog').showModal());
  $('designBtn').addEventListener('click', openDesignDialog);
  $('saveDesignBtn').addEventListener('click', saveDesign);
  $('designPresetGrid').addEventListener('click', event=>{
    const button=event.target.closest('button[data-design-preset]');
    if(button)setDesignPreset(button.dataset.designPreset);
  });
  $('centralExportBtn').addEventListener('click', () => $('exportDialog').showModal());
  $('exportJsonBtn').addEventListener('click', exportProject);
  $('exportCsvBtn').addEventListener('click', exportCsv);
  $('printPdfBtn').addEventListener('click', () => { $('exportDialog').close(); window.print(); });
  $('projectTabBtn').addEventListener('click', () => switchTab('project'));
  $('planningTabBtn').addEventListener('click', () => switchTab('planning'));
  document.querySelector('.studio-tabs').addEventListener('keydown', e => {
    const keys=['ArrowLeft','ArrowRight','Home','End'];
    if(!keys.includes(e.key))return;
    e.preventDefault();
    const next=e.key==='Home'?'project':e.key==='End'?'planning':e.key==='ArrowLeft'?'project':'planning';
    switchTab(next);
    $(next==='project'?'projectTabBtn':'planningTabBtn').focus();
  });
  document.querySelectorAll('[data-zoom]').forEach(btn => btn.addEventListener('click', () => setZoom(btn.dataset.zoom)));
  document.querySelectorAll('[data-management-mode]').forEach(btn => btn.addEventListener('click', () => setManagementMode(btn.dataset.managementMode)));
  document.querySelectorAll('[data-management-criterion]').forEach(cb => cb.addEventListener('change', () => { managementCriteria[cb.dataset.managementCriterion] = cb.checked; saveViewState(); renderGanttOnly(); syncControlStates(); }));
  $('projectName').addEventListener('change', async e => { const name=e.target.value.trim() || 'Unbenanntes Projekt'; try { await commitProjectChange(p=>{p.name=name;}); await renderPortfolio(); } catch { $('projectName').value=envelope.project.name; } });
  $('saveTaskBtn').addEventListener('click', saveTask);
  $('deleteTaskBtn').addEventListener('click', deleteTask);
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
  document.addEventListener('change', async e => { const key=e.target?.dataset?.setting; if(!key)return; const checked=e.target.checked; try { await commitProjectChange(p=>{p.planning.settings[key]=checked;}); } catch {} syncSettings(); renderGanttOnly(); });
  window.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==='s') { e.preventDefault(); exportProject(); } });
  document.addEventListener('input', e => { if (['designPrimary','designAccent','designWorkstream','designCritical','designMilestone','designGate','designPageBg','designPanelBg'].includes(e.target.id)) updateDesignPreview(); });
}

// Fetch before touching the DOM. The entire project surface then renders
// synchronously so an older portfolio read cannot repaint a newer selection.
async function renderAll() {
  const token = currentProjectGeneration(), id = envelope.project.id;
  const projects = await listProjects();
  if (!projectActivation.isCurrent(token) || envelope.project.id !== id) return false;
  renderAllFromPortfolio(projects);
  return true;
}

function renderAllFromPortfolio(projects) {
  applyDesign();
  $('projectName').value = envelope.project.name;
  renderPortfolioFromList(projects);
  renderMeta(); renderMetrics(); renderPlanningLists(); syncSettings(); renderQuickSettings(); renderPhaseToolbar(); renderGanttOnly(); renderTaskTable(); populateTaskPhases(); syncControlStates();
}

async function renderPortfolio() {
  const token = currentProjectGeneration(), id = envelope.project.id;
  const projects = await listProjects();
  if (!projectActivation.isCurrent(token) || envelope.project.id !== id) return false;
  renderPortfolioFromList(projects);
  return true;
}

function renderPortfolioFromList(projects) {
  $('projectSelect').innerHTML = projects.map(p => `<option value="${esc(p.id)}">${esc(p.name)} · ${p.tasks.length} Aufgaben</option>`).join('');
  $('projectSelect').value = envelope.project.id;
}

// All project-changing entry points share this generation. An outstanding
// table or Gantt drag is invalidated before any asynchronous work begins.
function beginProjectActivation() {
  cancelTaskDrag();
  engineController.cancelInteraction();
  return projectActivation.begin();
}
function currentProjectGeneration() {
  return projectActivation.current();
}
function restoreProjectSelection(token) {
  if (projectActivation.isCurrent(token)) $('projectSelect').value = envelope.project.id;
}

function presentProject(stored, portfolio) {
  const candidate = normalizeEnvelope({
    schema:'gantt-studio.project', schemaVersion:1, generator:'Gantt Studio', project:stored
  });
  const previous = {
    envelope, zoom, managementMode, managementCriteria, collapsedPhases, taskSortMode
  };
  try {
    envelope = candidate;
    loadViewState();
    renderAllFromPortfolio(portfolio);
    projectCommitter.remember(envelope.project);
    setActiveProject(envelope.project.id);
    if (pendingSaves.has(envelope.project.id))
      setSaveStatus('saving','Änderungen werden lokal gesichert');
    else if (lastSaveFailed.has(envelope.project.id))
      setSaveStatus('error','Browser-Speicherung fehlgeschlagen');
    else setSaveStatus('saved');
    for (const id of ['taskDialog','entityDialog','designDialog']) {
      const dialog = $(id);
      if (dialog?.open) dialog.close();
    }
  } catch (error) {
    envelope = previous.envelope;
    zoom = previous.zoom;
    managementMode = previous.managementMode;
    managementCriteria = previous.managementCriteria;
    collapsedPhases = previous.collapsedPhases;
    taskSortMode = previous.taskSortMode;
    try { renderAllFromPortfolio(portfolio); }
    catch (rollbackError) {
      throw new AggregateError([error,rollbackError],
        'Projektwechsel fehlgeschlagen; vorherige Darstellung konnte nicht wiederhergestellt werden.');
    }
    throw error;
  }
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
  box.querySelector('.save-status-icon').innerHTML=icon(state==='saving'?'loader-circle':state==='error'?'circle-alert':'check');
}

/**
 * Only publishes a project after IndexedDB confirms its transaction.
 * The queue is per project, so a later save cannot overwrite an earlier edit.
 * An in-flight save for another project never changes the active selection.
 */
async function commitProjectChange(change) {
  const project = envelope.project;
  const id = project.id;
  if (deletingProjects.has(id)) throw new Error('Dieses Projekt wird gerade gelöscht.');
  pendingSaves.set(id,(pendingSaves.get(id)||0)+1);
  if (envelope.project.id===id) setSaveStatus('saving','Änderungen werden lokal gesichert');
  try {
    const result = await projectCommitter.commit(project,change);
    if (envelope.project.id===id) {
      envelope.project=result.project;
      renderMeta();
    }
    lastSaveFailed.delete(id);
    return {...result,active:envelope.project.id===id};
  } catch (error) {
    lastSaveFailed.add(id);
    if (envelope.project.id===id) toast(`Speichern fehlgeschlagen: ${error.message||'IndexedDB-Fehler'}`,true);
    throw error;
  } finally {
    const remaining=(pendingSaves.get(id)||1)-1;
    if (remaining) pendingSaves.set(id,remaining);
    else pendingSaves.delete(id);
    if (envelope.project.id===id) {
      if (remaining) setSaveStatus('saving','Weitere Änderungen werden gesichert');
      else if (lastSaveFailed.has(id)) setSaveStatus('error','Browser-Speicherung fehlgeschlagen; Änderung nicht übernommen');
      else setSaveStatus('saved',`Lokal · ${new Intl.DateTimeFormat('de-DE',{hour:'2-digit',minute:'2-digit'}).format(new Date())}`);
    }
  }
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
  const base=sortedProjectTasks(envelope.project,taskSortMode,filteredBaseTasks());
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

function currentGanttLeftWidth() {
  return Number.parseInt(getComputedStyle(document.documentElement).getPropertyValue('--left-width'), 10) || 430;
}

function queueResponsiveGanttRender() {
  if (resizeRenderQueued) return;
  resizeRenderQueued = true;
  requestAnimationFrame(() => {
    resizeRenderQueued = false;
    const nextWidth = currentGanttLeftWidth();
    if (nextWidth === ganttLeftWidth) return;
    ganttLeftWidth = nextWidth;
    const scroller = $('ganttScroller');
    if (!scroller) return;
    const previousX = scroller.scrollLeft;
    const previousY = scroller.scrollTop;
    // The timeline grid uses pixel columns calculated at render time.
    // Re-render only when the responsive left-column token changes.
    renderGanttOnly();
    scroller.scrollLeft = previousX;
    scroller.scrollTop = previousY;
  });
}

function renderGanttOnly() {
  const project = clone(envelope.project);
  const tasks = visibleTasks();
  project.tasks = tasks;
  const stage = $('ganttStage');
  engineController.cancelInteraction();
  const result = engineController.render({project,view:{zoom,reorderable:canReorderTasks(),
    activationGeneration:currentProjectGeneration()}});
  const actualCount=tasks.filter(t=>!t.syntheticPhase).length;
  $('visibleTaskCount').textContent = actualCount===1?'1 Aufgabe':`${actualCount} Aufgaben`;
  if (result.empty) {
    stage.innerHTML = `<div class="empty-state"><strong>${envelope.project.tasks.length?'Keine Aufgaben in dieser Ansicht':'Noch keine Aufgaben'}</strong><span>${envelope.project.tasks.length?'Passe Filter oder Phasen an.':'Erstelle eine Aufgabe oder lade das Demoprojekt.'}</span><div class="empty-actions"><button class="btn primary" id="emptyAddBtn2" type="button">Aufgabe erstellen</button>${envelope.project.tasks.length?'':'<button class="btn demo-btn" id="emptyDemoBtn" type="button">Demoprojekt laden</button>'}</div></div>`;
    $('emptyAddBtn2').addEventListener('click',()=>openTaskDialog());
    $('emptyDemoBtn')?.addEventListener('click', loadDemoProject);
  }
}

// Check again inside the project's serialized commit queue: an intent is
// bound to the rendered revision, never to whatever project is active later.
function commitScopedEngineChange(scope,change) {
  if(!matchesEngineIntentScope(scope,envelope.project,currentProjectGeneration()))
    return Promise.resolve({changed:false,active:false});
  return commitProjectChange(project=>{
    if(!matchesEngineIntentScope(scope,project,currentProjectGeneration()))return false;
    return change(project);
  });
}

function handleEngineIntent(intent) {
  if(!matchesEngineIntentScope(intent?.scope,envelope.project,currentProjectGeneration()))
    return false;
  if(intent.type==='task-change')return applyTimelineChange(intent.change,intent.scope);
  if(intent.type==='reorder')return commitTaskMove(
    project=>reorderTask(project,intent.taskId,intent.targetId,intent.place),
    intent.taskId,intent.surface||'gantt',intent.scope);
  if(intent.type==='nudge')return commitTaskMove(
    project=>nudgeTask(project,intent.taskId,intent.direction),
    intent.taskId,intent.surface||'gantt',intent.scope);
  throw new Error('Unbekannte Engine-Aktion: '+String(intent.type));
}

function handleEngineSelection(selection) {
  if(selection.kind==='phase') {
    const id=selection.id;
    collapsedPhases.has(id)?collapsedPhases.delete(id):collapsedPhases.add(id);
    saveViewState();renderPhaseToolbar();renderGanttOnly();
  } else if(selection.kind==='task') openTaskDialog(selection.id);
}

async function applyTimelineChange(change,scope) {
  if(!matchesEngineIntentScope(scope,envelope.project,currentProjectGeneration()))return false;
  const selectedId=envelope.project.id;
  for (const key of ['start','end']) {
    if (change[key]!==undefined && !isValidIsoDate(change[key]))
      throw new Error('Ungültiges Kalenderdatum im Zeitplan.');
  }
  const result=await commitScopedEngineChange(scope,project=>{
    const task=project.tasks.find(t=>String(t.id)===String(change.id));
    if(!task)return false;
    const start=change.start===undefined?task.start:change.start;
    const end=change.end===undefined?task.end:change.end;
    if(!isValidIsoDate(start)||!isValidIsoDate(end)||end<start)
      throw new Error('Der Aufgabenzeitraum ist ungültig.');
    task.start=start;
    task.end=end;
    if(Number.isFinite(change.progress))task.progress=clamp(Math.round(change.progress),0,100);
  });
  if(result.changed && result.active && envelope.project.id===selectedId
      && scope.activationGeneration===currentProjectGeneration()){
    renderMetrics();renderPhaseToolbar();renderGanttOnly();renderTaskTable();
  }
  return Boolean(result.changed && result.active);
}

function renderPhaseToolbar(){
  const phases=(envelope.project.planning?.phases||[]).slice().sort((a,b)=>(a.start||'').localeCompare(b.start||''));
  const box=$('phaseCollapseToolbar');
  if(!phases.length){box.hidden=true;box.innerHTML='';return;} box.hidden=false;
  const counts=new Map(phases.map(p=>[p.id,envelope.project.tasks.filter(t=>t.phaseId===p.id).length]));
  box.innerHTML=`<div class="phase-collapse-heading"><div><strong>Phasen</strong><span>Aufgaben im Zeitplan ein- oder ausblenden</span></div><div class="phase-collapse-actions"><button class="link-button" type="button" data-phase-action="expand-all">${icon('chevrons-down')} Alle ausklappen</button><button class="link-button" type="button" data-phase-action="collapse-all">${icon('chevrons-up')} Alle einklappen</button></div></div><div class="phase-collapse-list">${phases.map(p=>{const collapsed=collapsedPhases.has(String(p.id));return `<button type="button" class="phase-collapse-button ${collapsed?'collapsed':'expanded'}" data-phase-id="${esc(p.id)}" aria-expanded="${!collapsed}" style="--phase-control-color:${esc(p.color||'#DCE8EB')}"><span class="phase-collapse-icon">${icon(collapsed?'chevron-right':'chevron-down')}</span><span class="phase-collapse-label">${esc(p.name||'Phase')}</span><span class="phase-collapse-count">${counts.get(p.id)||0}</span></button>`}).join('')}</div>`;
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
  $('projectTabBtn').tabIndex=activeTab==='project'?0:-1;$('planningTabBtn').tabIndex=activeTab==='planning'?0:-1;
  if(activeTab==='planning'){syncSettings();renderPlanningLists();}
}

function setZoom(value){zoom=['day','week','month'].includes(value)?value:'week';saveViewState();syncControlStates();renderGanttOnly();}
function setManagementMode(value){managementMode=['operational','management','milestones'].includes(value)?value:'operational';saveViewState();syncControlStates();renderGanttOnly();renderTaskTable();}
function syncControlStates(){
  document.querySelectorAll('[data-zoom]').forEach(b=>{const selected=b.dataset.zoom===zoom;b.classList.toggle('active',selected);b.setAttribute('aria-pressed',String(selected));});
  document.querySelectorAll('[data-management-mode]').forEach(b=>{const selected=b.dataset.managementMode===managementMode;b.classList.toggle('active',selected);b.setAttribute('aria-pressed',String(selected));});
  document.querySelectorAll('[data-management-criterion]').forEach(cb=>cb.checked=managementCriteria[cb.dataset.managementCriterion]!==false);
}

function setTaskSortMode(value) {
  if(!['manual','date'].includes(value) || value===taskSortMode)return;
  cancelTaskDrag();
  engineController.cancelInteraction();
  taskSortMode=value;
  saveViewState();
  renderTaskTable();
  renderGanttOnly();
}

function canReorderTasks() { return taskSortMode==='manual' && managementMode==='operational'; }

function syncTaskSortControls(){
  document.querySelectorAll('[data-task-sort-mode]').forEach(button=>{
    const active=button.dataset.taskSortMode===taskSortMode;
    button.classList.toggle('active',active);
    button.setAttribute('aria-pressed',String(active));
  });
  $('taskOrderHint').textContent=taskSortMode==='date'
    ? 'Chronologisch nach Startdatum. Zum Verschieben auf „Manuell“ wechseln.'
    : managementMode!=='operational'
      ? 'Zum Verschieben zuerst im Zeitplan die Ansicht „Operativ“ auswählen.'
      : 'Aufgaben nur innerhalb ihrer Phase verschieben: Griff ziehen oder am Griff Pfeil nach oben/unten drücken. Termine und Abhängigkeiten bleiben unverändert.';
}

function viewKey(){return `gantt-studio.view-v2:${envelope.project.id}`;}
function loadViewState(){try{const v=JSON.parse(localStorage.getItem(viewKey())||'{}');zoom=['day','week','month'].includes(v.zoom)?v.zoom:'week';managementMode=['operational','management','milestones'].includes(v.managementMode)?v.managementMode:'operational';managementCriteria={...managementDefaults,...(v.managementCriteria||{})};collapsedPhases=new Set(Array.isArray(v.collapsedPhases)?v.collapsedPhases.map(String):[]);taskSortMode=v.taskSortMode==='date'?'date':'manual';}catch{zoom='week';managementMode='operational';managementCriteria={...managementDefaults};collapsedPhases=new Set();taskSortMode='manual';}}
function saveViewState(){localStorage.setItem(viewKey(),JSON.stringify({zoom,managementMode,managementCriteria,collapsedPhases:[...collapsedPhases],taskSortMode}));}

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
  if(taskSavePending)return;
  const name=$('taskName').value.trim(), start=$('taskStart').value, end=$('taskEnd').value;
  if(!name||!start||!end) return toast('Name, Start und Ende sind Pflicht.',true);
  if(end<start) return toast('Das Enddatum darf nicht vor dem Start liegen.',true);
  const baselineStart=$('taskBaselineStart').value, baselineEnd=$('taskBaselineEnd').value;
  if(baselineStart&&baselineEnd&&baselineEnd<baselineStart) return toast('Das Baseline-Enddatum darf nicht vor dem Start liegen.',true);
  const id=$('taskId').value||uuid();
  const old=envelope.project.tasks.find(t=>String(t.id)===String(id));
  const phaseId=$('taskPhase').value||'';
  const order=old && phaseKey(envelope.project,old)===phaseKey(envelope.project,{phaseId})
    ? old.displayOrder : nextDisplayOrder(envelope.project,phaseId);
  const task={id,name,start,end,progress:clamp(Number($('taskProgress').value)||0,0,100),type:$('taskType').value,dependencies:[...$('taskDependencies').selectedOptions].map(o=>o.value),phaseId,displayOrder:order,owner:$('taskOwner').value.trim().slice(0,80),status:$('taskStatus').value,risk:$('taskRisk').value,baselineStart,baselineEnd,bufferDays:clamp(Number($('taskBuffer').value)||0,0,365),costEur:Math.max(0,Number($('taskCost').value)||0),url:safeUrl($('taskUrl').value),notes:$('taskNotes').value.trim().slice(0,2000),showInGantt:true};
  const copy=envelope.project.tasks.map(t=>t.id===id?task:t); if(!copy.some(t=>t.id===id)) copy.push(task);
  try { validateGraph(copy); } catch(e) { return toast(e.message,true); }
  taskSavePending=true;
  $('saveTaskBtn').disabled=true;
  try {
    const result=await commitProjectChange(project=>{
      const previous=project.tasks.find(t=>String(t.id)===String(id));
      const rank=previous&&phaseKey(project,previous)===phaseKey(project,{phaseId})
        ? previous.displayOrder : nextDisplayOrder(project,phaseId);
      const next={...task,displayOrder:rank};
      const copy=project.tasks.map(t=>String(t.id)===String(id)?next:t);
      if(!previous)copy.push(next);
      validateGraph(copy);
      project.tasks=copy;
    });
    if(!result.active)return;
    $('taskDialog').close();await renderAll();toast(old?'Aufgabe aktualisiert.':'Aufgabe erstellt.');
  } catch(error) { toast(error.message||'Aufgabe konnte nicht gespeichert werden.',true); }
  finally { taskSavePending=false; $('saveTaskBtn').disabled=false; }
}

async function deleteTask() {
  const id=$('taskId').value;
  if(!id)return;
  try {
    const result=await commitProjectChange(project=>{
      if(!project.tasks.some(t=>String(t.id)===String(id)))return false;
      project.tasks=project.tasks.filter(t=>String(t.id)!==String(id))
        .map(t=>({...t,dependencies:(t.dependencies||[]).filter(dep=>String(dep)!==String(id))}));
    });
    if(!result.active)return;
    $('taskDialog').close();await renderAll();toast('Aufgabe gelöscht.');
  } catch {}
}

async function loadDemoProject() {
  const button = $('loadDemoBtn');
  const emptyButton = $('emptyDemoBtn');
  if (button.disabled) return;
  const token = beginProjectActivation();
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = 'Lade Demo…';
  if (emptyButton) emptyButton.disabled = true;
  try {
    const demoUrl = new URL('../../examples/demo.gantt.json', import.meta.url);
    const response = await fetch(demoUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Beispieldatei nicht erreichbar (HTTP ${response.status})`);
    const demo = cloneForImport(normalizeEnvelope(await response.json()));
    const projects = await listProjects();
    if (!projectActivation.isCurrent(token)) return;
    demo.project.name = uniqueName(demo.project.name, projects);
    await saveLocal(demo.project);
    if (await projectActivation.activate(demo.project.id, token)) {
      switchTab('project');
      toast('Demoprojekt geladen. Bestehende Projekte bleiben erhalten.');
    }
  } catch (error) {
    if (projectActivation.isCurrent(token)) {
      restoreProjectSelection(token);
      console.error('Demoprojekt konnte nicht geladen werden:', error);
      toast('Demoprojekt konnte nicht geladen werden. Bitte erneut versuchen.', true);
    }
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
    if (emptyButton?.isConnected) emptyButton.disabled = false;
  }
}

async function createProject() {
  const name = (prompt('Name des neuen Projekts:','Neues Projekt')||'').trim();
  if (!name) return;
  const token = beginProjectActivation();
  try {
    const projects = await listProjects();
    if (!projectActivation.isCurrent(token)) return;
    const created = createEnvelope();
    created.project.name = uniqueName(name, projects);
    await saveLocal(created.project);
    if (await projectActivation.activate(created.project.id, token))
      toast('Projekt wurde angelegt.');
  } catch (error) {
    if (projectActivation.isCurrent(token)) {
      restoreProjectSelection(token);
      toast(`Projekt konnte nicht angelegt werden: ${error.message}`,true);
    }
  }
}

async function changeProject(event) {
  const id = event.target.value;
  const token = beginProjectActivation();
  try {
    if (!await projectActivation.activate(id, token) && projectActivation.isCurrent(token))
      restoreProjectSelection(token);
  } catch (error) {
    if (projectActivation.isCurrent(token)) {
      restoreProjectSelection(token);
      toast(`Projektwechsel fehlgeschlagen: ${error.message}`, true);
    }
  }
}

async function removeProject() {
  const id = envelope.project?.id;
  if (!id || !confirm(`Projekt „${envelope.project.name}“ vollständig löschen?`)) return;
  const token = beginProjectActivation();
  deletingProjects.add(id);
  try {
    await projectCommitter.whenIdle(id);
    const projects = await listProjects();
    if (!projectActivation.isCurrent(token)) return;
    const remaining = projects.filter(project => project.id !== id);
    let targetId = remaining[0]?.id;
    if (!targetId) {
      // Prepare a valid fallback before deleting the currently active project.
      const fresh = createEnvelope();
      await saveLocal(fresh.project);
      targetId = fresh.project.id;
    }
    if (!projectActivation.isCurrent(token)) return;
    await deleteProject(id);
    projectCommitter.forget(id);
    if (await projectActivation.activate(targetId, token))
      toast('Projekt wurde gelöscht.');
  } catch (error) {
    if (projectActivation.isCurrent(token)) {
      restoreProjectSelection(token);
      toast(`Projekt konnte nicht gelöscht werden: ${error.message}`,true);
    }
  } finally {
    deletingProjects.delete(id);
  }
}

async function importFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const token = beginProjectActivation();
  try {
    const imported = cloneForImport(normalizeEnvelope(JSON.parse(await file.text())));
    const projects = await listProjects();
    if (!projectActivation.isCurrent(token)) return;
    imported.project.name = uniqueName(imported.project.name, projects);
    await saveLocal(imported.project);
    if (await projectActivation.activate(imported.project.id, token))
      toast('Projekt importiert.');
  } catch (error) {
    if (projectActivation.isCurrent(token)) {
      restoreProjectSelection(token);
      toast(error.message||'Datei konnte nicht importiert werden.',true);
    }
  } finally { event.target.value = ''; }
}

function cloneForImport(source) {const e=clone(source),map=new Map();e.project.tasks.forEach(t=>map.set(t.id,uuid()));e.project.tasks=e.project.tasks.map(t=>({...t,id:map.get(t.id),dependencies:(t.dependencies||[]).map(d=>map.get(d)).filter(Boolean)}));const now=new Date().toISOString();e.project.id=uuid();e.project.createdAt=now;e.project.updatedAt=now;e.project.revision=1;e.exportedAt=now;return e;}

function exportProject() {const payload=clone(envelope);payload.exportedAt=new Date().toISOString();download(JSON.stringify(payload,null,2),`${slug(payload.project.name)}-${todayIso()}.gantt.json`,'application/json');$('exportDialog').close();toast('Projektdatei exportiert.');}
function exportCsv(){const q=v=>`"${String(v??'').replaceAll('"','""')}"`;const rows=[['Name','Start','Ende','Fortschritt','Typ','Owner','Status','Risiko','Phase','Kosten','Vorgänger'].join(';'),...sortedProjectTasks(envelope.project,taskSortMode).map(t=>[t.name,t.start,t.end,t.progress,t.type,t.owner,t.status,t.risk,(envelope.project.planning.phases.find(p=>p.id===t.phaseId)?.name||''),t.costEur,(t.dependencies||[]).join(',')].map(q).join(';'))];download('\ufeff'+rows.join('\n'),`${slug(envelope.project.name)}-${todayIso()}.csv`,'text/csv;charset=utf-8');$('exportDialog').close();toast('Aufgabenübersicht exportiert.');}

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
async function handleRelativeSettingChange(e) {
  const key={
    relativeEnabled:'showRelativeToday',relativeOffset:'relativeOffsetDays',
    relativeMode:'relativeDayMode',relativeLabel:'relativeLabel',
    relativeColor:'relativeColor',relativeStyle:'relativeStyle',
    relativeSkipHolidays:'relativeSkipHolidays'
  }[e.target.id];
  if(!key)return;
  const value=['relativeEnabled','relativeSkipHolidays'].includes(e.target.id)
    ? e.target.checked : e.target.id==='relativeOffset'?Number(e.target.value):e.target.value;
  try {
    await commitProjectChange(project=>{
      const settings=project.planning.settings;
      settings[key]=value;
      normalizeRelativeSettings(settings);
    });
  } catch {}
  syncRelativeEditor();renderGanttOnly();
}

async function handleRelativeTargetDateChange() {
  const target=$('relativeTargetDate').value;
  if(!isValidIsoDate(target))return;
  const settings=envelope.project.planning.settings;
  if(settings.relativeDayMode==='workdays'&&!isWorkdayIso(target,settings.relativeSkipHolidays!==false)) {
    toast('Das gewählte Datum ist kein Arbeitstag. Bitte einen Arbeitstag wählen oder auf Kalendertage umstellen.',true);
    syncRelativeEditor();return;
  }
  const offset=offsetFromTarget(target);
  try { await commitProjectChange(project=>{project.planning.settings.relativeOffsetDays=offset;}); }
  catch {}
  syncRelativeEditor();renderGanttOnly();
}

function jumpToRelativeLine() {
  if(!envelope.project.planning.settings.showRelativeToday)return;
  switchTab('project');
  renderGanttOnly();
  requestAnimationFrame(()=>{
    const marker=engineController.locateMarker('relative-target');
    const scroller=$('ganttScroller');
    if(!marker||!scroller){
      toast(`Das Zieldatum ${formatDate(calculateRelativeTarget())} liegt außerhalb des aktuell dargestellten Projektzeitraums.`,true);
      return;
    }
    scroller.scrollTo({left:Math.max(0,marker.x-scroller.clientWidth/2),behavior:'smooth'});
  });
}

function toggleTaskDetails(){
  taskDetailsExpanded=!taskDetailsExpanded;
  renderTaskTable();
}

function renderTaskTable(){
  const table=$('taskOverviewTable'), body=$('taskTableBody'), toggle=$('taskDetailsToggle');
  if(!table||!body||!toggle)return;
  cancelTaskDrag();
  syncTaskSortControls();
  table.classList.toggle('task-details-collapsed',!taskDetailsExpanded);
  toggle.setAttribute('aria-expanded',String(taskDetailsExpanded));
  toggle.innerHTML=`${icon(taskDetailsExpanded?'chevron-down':'chevron-right')} ${taskDetailsExpanded?'Details ausblenden':'Details anzeigen'}`;

  const tasks=sortedProjectTasks(envelope.project,taskSortMode);
  if(!tasks.length){
    body.innerHTML='<tr><td colspan="11" class="task-table-empty">Noch keine Aufgaben vorhanden.</td></tr>';
    return;
  }
  const phaseMap=new Map((envelope.project.planning?.phases||[]).map(p=>[String(p.id),p.name]));
  const taskMap=new Map(tasks.map(t=>[String(t.id),t.name]));
  let previousGroup=null;
  const reorderEnabled=canReorderTasks();
  body.innerHTML=tasks.map(task=>{
    const group=phaseKey(envelope.project,task);
    const groupStart=group!==previousGroup;
    previousGroup=group;
    const phaseName=group?phaseMap.get(group):'Ohne Phase';
    const phaseHeading=groupStart?`<span class="task-phase-label">${esc(phaseName)}</span>`:'';
    const grip=reorderEnabled
      ? `<button type="button" class="task-drag-handle" data-task-drag-handle data-task-id="${esc(task.id)}" aria-label="${esc(task.name)} innerhalb der Phase verschieben. Pfeiltasten nach oben oder unten." title="Ziehen oder Pfeiltasten ↑/↓ verwenden">${icon('grip-vertical')}</button>`
      : '';
    const dependencies=(task.dependencies||[]).map(id=>taskMap.get(String(id))||id).join(', ');
    const phase=phaseMap.get(String(task.phaseId||''))||'–';
    const note=task.notes?`<small class="task-table-note">${esc(task.notes)}</small>`:'';
    const documentUrl=safeUrl(task.url);
    const link=documentUrl?`<a class="task-table-document" href="${esc(documentUrl)}" target="_blank" rel="noopener noreferrer">${icon('external-link')} Dokument</a>`:'';
    const baseline=task.baselineStart&&task.baselineEnd?`<small class="task-table-baseline">Soll: ${formatDate(task.baselineStart)} – ${formatDate(task.baselineEnd)}</small>`:'';
    return `<tr data-task-row-id="${esc(task.id)}" data-task-phase-id="${esc(group)}" class="${groupStart?'task-phase-start':''}">
      <td class="task-inline-cell task-name-cell" data-task-field="name" tabindex="0"><div class="task-name-layout">${grip}<div class="task-name-content">${phaseHeading}<strong>${esc(task.name)}</strong>${note}${link}</div></div></td>
      <td class="task-detail-column task-inline-cell" data-task-field="phaseId" tabindex="0">${esc(phase)}</td>
      <td class="task-detail-column task-inline-cell" data-task-field="type" tabindex="0"><span class="task-type-badge task-type-${esc(task.type)}">${esc(taskTypeLabel(task.type))}</span></td>
      <td class="task-inline-cell task-period-cell" data-task-field="period" tabindex="0">${formatDate(task.start)} – ${formatDate(task.end)}${baseline}</td>
      <td class="task-inline-cell" data-task-field="progress" tabindex="0"><div class="task-progress-cell"><span class="task-progress-track"><i style="width:${clamp(Number(task.progress)||0,0,100)}%"></i></span><b>${clamp(Number(task.progress)||0,0,100)} %</b></div></td>
      <td class="task-inline-cell" data-task-field="owner" tabindex="0">${task.owner?esc(task.owner):'<span class="muted">–</span>'}</td>
      <td class="task-inline-cell" data-task-field="status" tabindex="0"><span class="task-status"><i class="task-status-dot ${esc(task.status||'neutral')}"></i>${esc(taskStatusLabel(task.status))}</span></td>
      <td class="task-detail-column task-inline-cell" data-task-field="risk" tabindex="0"><span class="task-risk task-risk-${esc(task.risk||'none')}">${esc(taskRiskLabel(task.risk))}</span></td>
      <td class="task-detail-column task-inline-cell" data-task-field="costEur" tabindex="0">${formatMoney(task.costEur||0)}</td>
      <td class="task-detail-column task-inline-cell" data-task-field="dependencies" tabindex="0">${dependencies?esc(dependencies):'<span class="muted">Keine</span>'}</td>
      <td class="task-table-actions"><button type="button" class="task-link-button" data-task-action="edit">${icon('pencil')} Bearbeiten</button><button type="button" class="task-link-button delete" data-task-action="delete">${icon('trash-2')} Löschen</button></td>
    </tr>`;
  }).join('');
}

function handleTaskTableClick(e){
  const action=e.target.closest('[data-task-action]');
  if(action){
    const row=action.closest('[data-task-row-id]'); if(!row)return;
    if(action.dataset.taskAction==='edit')openTaskDialog(row.dataset.taskRowId);
    else if(action.dataset.taskAction==='delete')deleteTaskFromTable(row.dataset.taskRowId);
    return;
  }
  if(e.target.closest('a,button,input,select,textarea,label,[data-task-drag-handle]'))return;
  const cell=e.target.closest('td[data-task-field]');
  if(cell)openTaskInlineEditor(cell);
}

function handleTaskTableKeydown(e){
  if(e.target.closest('.task-inline-editor')){
    if(e.key==='Escape'){e.preventDefault();renderTaskTable();}
    return;
  }
  const handle=e.target.closest('[data-task-drag-handle]');
  if(handle && ['ArrowUp','ArrowDown'].includes(e.key)){
    e.preventDefault();
    if(canReorderTasks())void commitTaskMove(project=>nudgeTask(project,handle.dataset.taskId,e.key==='ArrowUp'?-1:1),handle.dataset.taskId);
    return;
  }
  const cell=e.target.closest('td[data-task-field]');
  if(cell&&(e.key==='Enter'||e.key==='F2')){e.preventDefault();openTaskInlineEditor(cell);}
}

function setTaskOrderStatus(message){$('taskReorderStatus').textContent=message;}

/* Gantt ordering lives on the left task list only; bar drag and resize remain
   exclusively horizontal on the right timeline. Both surfaces share commitTaskMove. */
function cancelTaskDrag(){
  const state=taskDrag;
  if(!state)return;
  taskDrag=null;
  state.row.style.transform='';
  state.row.classList.remove('task-row-dragging');
  state.handle.classList.remove('active');
  state.body.querySelectorAll('.task-drop-before,.task-drop-after').forEach(row=>
    row.classList.remove('task-drop-before','task-drop-after'));
  window.removeEventListener('pointermove',moveTaskDrag);
  window.removeEventListener('pointerup',finishTaskDrag);
  window.removeEventListener('pointercancel',cancelTaskDrag);
  window.removeEventListener('keydown',cancelTaskDragOnEscape,true);
  window.removeEventListener('blur',cancelTaskDrag);
  if(state.handle.hasPointerCapture?.(state.pointerId))
    state.handle.releasePointerCapture(state.pointerId);
}

function cancelTaskDragOnEscape(event){
  if(event.key!=='Escape')return;
  event.preventDefault();
  event.stopPropagation();
  const handle=taskDrag?.handle;
  cancelTaskDrag();
  handle?.focus();
  setTaskOrderStatus('Verschieben abgebrochen.');
}

function startTaskDrag(event){
  if(!canReorderTasks() || event.button!==0 || taskDrag)return;
  const handle=event.target.closest('[data-task-drag-handle]');
  if(!handle)return;
  const row=handle.closest('tr[data-task-row-id]'),body=$('taskTableBody');
  if(!row)return;
  event.preventDefault();
  taskDrag={handle,row,body,pointerId:event.pointerId,startY:event.clientY,active:false,drop:null};
  handle.setPointerCapture(event.pointerId);
  window.addEventListener('pointermove',moveTaskDrag);
  window.addEventListener('pointerup',finishTaskDrag);
  window.addEventListener('pointercancel',cancelTaskDrag);
  window.addEventListener('keydown',cancelTaskDragOnEscape,true);
  window.addEventListener('blur',cancelTaskDrag);
}

function moveTaskDrag(event){
  const drag=taskDrag;
  if(!drag || event.pointerId!==drag.pointerId)return;
  const delta=event.clientY-drag.startY;
  if(!drag.active && Math.abs(delta)<6)return;
  if(!drag.active){
    drag.active=true;
    drag.row.classList.add('task-row-dragging');
    drag.handle.classList.add('active');
  }
  drag.row.style.transform=`translateY(${delta}px)`;
  drag.body.querySelectorAll('.task-drop-before,.task-drop-after').forEach(row=>
    row.classList.remove('task-drop-before','task-drop-after'));
  drag.drop=null;
  const rows=[...drag.body.querySelectorAll('tr[data-task-row-id]')].filter(row=>row!==drag.row);
  const target=rows.find(row=>{
    const rect=row.getBoundingClientRect();
    return event.clientY>=rect.top && event.clientY<=rect.bottom;
  });
  if(!target || target.dataset.taskPhaseId!==drag.row.dataset.taskPhaseId)return;
  const rect=target.getBoundingClientRect();
  const place=event.clientY<rect.top+rect.height/2?'before':'after';
  target.classList.add(place==='before'?'task-drop-before':'task-drop-after');
  drag.drop={targetId:target.dataset.taskRowId,place};
}

async function commitTaskMove(reorder,taskId,focusSurface='table',scope=null) {
  try {
    if(scope&&!matchesEngineIntentScope(scope,envelope.project,currentProjectGeneration()))
      return false;
    const result=await (scope
      ? commitScopedEngineChange(scope,project=>reorder(project))
      : commitProjectChange(project=>reorder(project)));
    if(!result.active || (scope && (scope.projectId!==envelope.project.id
        || scope.activationGeneration!==currentProjectGeneration())))return false;
    if(!result.changed){
      setTaskOrderStatus('Die Reihenfolge bleibt unverändert.');
      return;
    }
    const scroller=$('ganttScroller'),scrollX=scroller.scrollLeft,scrollY=scroller.scrollTop;
    renderGanttOnly();renderTaskTable();
    scroller.scrollLeft=scrollX;scroller.scrollTop=scrollY;
    if(focusSurface==='gantt')engineController.focusTask(taskId,'reorder');
    else for(const grip of $('taskTableBody').querySelectorAll('[data-task-drag-handle]')){
      if(grip.dataset.taskId===String(taskId)){grip.focus({preventScroll:true});break;}
    }
    setTaskOrderStatus('Aufgabenreihenfolge gespeichert.');
  } catch {
    renderGanttOnly();renderTaskTable();
    setTaskOrderStatus('Speichern fehlgeschlagen. Reihenfolge unverändert.');
  }
}

function finishTaskDrag(event){
  const drag=taskDrag;
  if(!drag || event.pointerId!==drag.pointerId)return;
  moveTaskDrag(event);
  const drop=drag.drop,sourceId=drag.row.dataset.taskRowId,wasActive=drag.active;
  cancelTaskDrag();
  if(wasActive && drop && canReorderTasks()){
    void commitTaskMove(project=>reorderTask(project,sourceId,drop.targetId,drop.place),sourceId);
  }else if(wasActive){
    setTaskOrderStatus('Keine gültige Position innerhalb dieser Phase gewählt.');
  }
}

function openTaskInlineEditor(cell){
  if(cell.classList.contains('editing'))return;
  const row=cell.closest('[data-task-row-id]'), task=envelope.project.tasks.find(t=>String(t.id)===String(row?.dataset.taskRowId));
  if(!task)return;
  renderTaskTable();
  const fresh=$('taskTableBody').querySelector(`[data-task-row-id="${cssEscape(task.id)}"] td[data-task-field="${cell.dataset.taskField}"]`);
  if(!fresh)return;
  const field=fresh.dataset.taskField;
  fresh.classList.add('editing');
  fresh.removeAttribute('tabindex');
  fresh.innerHTML=`<div class="task-inline-editor" data-inline-task-id="${esc(task.id)}" data-inline-field="${esc(field)}">${taskInlineControl(field,task)}<span class="task-inline-actions"><button type="button" class="task-inline-save" aria-label="Änderung übernehmen" title="Änderung übernehmen">${icon('check')}</button><button type="button" class="task-inline-cancel" aria-label="Bearbeitung abbrechen" title="Bearbeitung abbrechen">${icon('x')}</button></span></div>`;
  const editor=fresh.querySelector('.task-inline-editor');
  editor.querySelector('.task-inline-save').addEventListener('click',()=>saveTaskInlineEditor(editor));
  editor.querySelector('.task-inline-cancel').addEventListener('click',renderTaskTable);
  editor.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();renderTaskTable();}else if(e.key==='Enter'&&!e.shiftKey&&!e.target.matches('select[multiple]')){e.preventDefault();saveTaskInlineEditor(editor);}});
  const focus=editor.querySelector('input,select'); if(focus)focus.focus();
}

function taskInlineControl(field,task){
  const phases=envelope.project.planning?.phases||[];
  const option=(value,label,selected)=>`<option value="${esc(value)}" ${selected?'selected':''}>${esc(label)}</option>`;
  if(field==='name')return `<input data-inline-value type="text" maxlength="120" value="${esc(task.name)}">`;
  if(field==='phaseId')return `<select data-inline-value><option value="">Keine Phase</option>${phases.map(p=>option(p.id,p.name,String(p.id)===String(task.phaseId||''))).join('')}</select>`;
  if(field==='type')return `<select data-inline-value>${[['workstream','Arbeitspaket'],['critical','Kritisch markiert'],['milestone','Meilenstein'],['gate','Gate']].map(([v,l])=>option(v,l,task.type===v)).join('')}</select>`;
  if(field==='period')return `<div class="task-inline-period"><input data-inline-start type="date" value="${esc(task.start)}"><span>–</span><input data-inline-end type="date" value="${esc(task.end)}"></div>`;
  if(field==='progress')return `<input data-inline-value type="number" min="0" max="100" step="1" value="${clamp(Number(task.progress)||0,0,100)}">`;
  if(field==='owner')return `<input data-inline-value type="text" maxlength="80" value="${esc(task.owner||'')}">`;
  if(field==='status')return `<select data-inline-value>${[['neutral','Neutral'],['green','Grün'],['amber','Gelb'],['red','Rot']].map(([v,l])=>option(v,l,(task.status||'neutral')===v)).join('')}</select>`;
  if(field==='risk')return `<select data-inline-value>${[['none','Kein'],['low','Niedrig'],['medium','Mittel'],['high','Hoch'],['critical','Kritisch']].map(([v,l])=>option(v,l,(task.risk||'none')===v)).join('')}</select>`;
  if(field==='costEur')return `<input data-inline-value type="number" min="0" step="100" value="${Number(task.costEur)||0}">`;
  if(field==='dependencies')return `<select data-inline-value multiple size="4">${envelope.project.tasks.filter(t=>t.id!==task.id).map(t=>option(t.id,t.name,(task.dependencies||[]).includes(t.id))).join('')}</select>`;
  return '';
}

async function saveTaskInlineEditor(editor){
  const id=editor.dataset.inlineTaskId, field=editor.dataset.inlineField;
  const patch={};
  if(field==='period'){
    patch.start=editor.querySelector('[data-inline-start]').value;
    patch.end=editor.querySelector('[data-inline-end]').value;
  }else if(field==='dependencies')patch.dependencies=[...editor.querySelector('[data-inline-value]').selectedOptions].map(o=>o.value);
  else{
    const input=editor.querySelector('[data-inline-value]');
    let value=input.value;
    if(field==='progress')value=clamp(Number(value)||0,0,100);
    if(field==='costEur')value=Math.max(0,Number(value)||0);
    if(field==='name')value=value.trim().slice(0,120);
    if(field==='owner')value=value.trim().slice(0,80);
    patch[field]=value;
  }
  await updateTaskFromTable(id,patch);
}

async function updateTaskFromTable(id,patch){
  const idx=envelope.project.tasks.findIndex(t=>String(t.id)===String(id));
  if(idx<0)return;
  const previous=envelope.project.tasks[idx];
  const next={...previous,...patch};
  if(Object.prototype.hasOwnProperty.call(patch,'phaseId')
     && phaseKey(envelope.project,previous)!==phaseKey(envelope.project,next))
    next.displayOrder=nextDisplayOrder(envelope.project,next.phaseId);
  if(!next.name?.trim())return toast('Der Aufgabenname darf nicht leer sein.',true);
  if(!next.start||!next.end||next.end<next.start)return toast('Der Zeitraum ist ungültig.',true);
  if((next.dependencies||[]).includes(next.id))return toast('Eine Aufgabe kann nicht von sich selbst abhängen.',true);
  const copy=envelope.project.tasks.map((t,i)=>i===idx?next:t);
  try{validateGraph(copy);}catch(e){return toast(e.message,true);}
  try {
    const result=await commitProjectChange(project=>{
      const index=project.tasks.findIndex(t=>String(t.id)===String(id));
      if(index<0)return false;
      const previous=project.tasks[index];
      const next={...previous,...patch};
      if(Object.prototype.hasOwnProperty.call(patch,'phaseId')
         && phaseKey(project,previous)!==phaseKey(project,next))
        next.displayOrder=nextDisplayOrder(project,next.phaseId);
      if(!next.name?.trim()||!isValidIsoDate(next.start)||!isValidIsoDate(next.end)||next.end<next.start)
        throw new Error('Aufgabenname oder Zeitraum ist ungültig.');
      const copy=project.tasks.map((t,i)=>i===index?next:t);
      validateGraph(copy);
      project.tasks=copy;
    });
    if(result.active){await renderAll();toast('Aufgabe aktualisiert.');}
  } catch(error) { toast(error.message||'Aufgabe konnte nicht gespeichert werden.',true); }
}

async function deleteTaskFromTable(id){
  const task=envelope.project.tasks.find(t=>String(t.id)===String(id)); if(!task)return;
  if(!confirm(`Aufgabe „${task.name}“ wirklich löschen?`))return;
  try {
    const result=await commitProjectChange(project=>{
      if(!project.tasks.some(t=>String(t.id)===String(id)))return false;
      project.tasks=project.tasks.filter(t=>String(t.id)!==String(id))
        .map(t=>({...t,dependencies:(t.dependencies||[]).filter(dep=>String(dep)!==String(id))}));
    });
    if(result.active){await renderAll();toast('Aufgabe gelöscht.');}
  } catch {}

}

function taskTypeLabel(type){return({workstream:'Arbeitspaket',critical:'Kritisch',milestone:'Meilenstein',gate:'Gate'})[type]||type||'–';}
function taskStatusLabel(status){return({neutral:'Neutral',green:'Grün',amber:'Gelb',red:'Rot'})[status]||'Neutral';}
function taskRiskLabel(risk){return({none:'Kein',low:'Niedrig',medium:'Mittel',high:'Hoch',critical:'Kritisch'})[risk]||'Kein';}
function cssEscape(value){return String(value).replace(/(["\\])/g,'\\$1');}

function renderPlanningLists(){const planning=envelope.project.planning,cost=envelope.project.tasks.reduce((sum,t)=>sum+(Number(t.costEur)||0),0);if($('planningCost'))$('planningCost').textContent=formatMoney(cost);if($('phaseCountBadge'))$('phaseCountBadge').textContent=`${planning.phases.length} ${planning.phases.length===1?'Phase':'Phasen'}`;const gates=envelope.project.tasks.filter(t=>t.type==='gate').length,markerTotal=planning.markers.length;if($('markerCountBadge'))$('markerCountBadge').textContent=`${markerTotal} ${markerTotal===1?'Stichtag':'Stichtage'}${gates?` · ${gates} ${gates===1?'Gate':'Gates'}`:''}`;if($('holidayCountBadge'))$('holidayCountBadge').textContent=`${planning.holidays.length} ${planning.holidays.length===1?'Sondertag':'Sondertage'}`;$('phaseList').innerHTML=entityRows('phase',planning.phases,p=>`${formatDate(p.start)} – ${formatDate(p.end)}`);$('markerList').innerHTML=entityRows('marker',planning.markers,p=>`${formatDate(p.date)} · ${p.style==='dashed'?'gestrichelt':p.style==='dotted'?'gepunktet':'durchgezogen'}`);$('holidayList').innerHTML=entityRows('holiday',planning.holidays,p=>`${formatDate(p.date)}${p.source?` · ${esc(p.source)}`:''}`);syncRelativeEditor();syncSettings();}

function entityRows(kind,items,detail){return items.length?items.slice().sort((a,b)=>(a.start||a.date||'').localeCompare(b.start||b.date||'')).map(x=>`<button type="button" class="entity-row" data-entity-kind="${kind}" data-entity-id="${esc(x.id)}"><span><strong>${esc(x.name)}</strong><small>${detail(x)}</small></span><span class="entity-row-edit">${icon('pencil')}</span><i style="background:${esc(x.color||'#DCE8EB')}"></i></button>`).join(''):'<div class="muted-empty">Noch keine Einträge.</div>';}

function openEntity(kind,id=''){const list=kind==='phase'?envelope.project.planning.phases:kind==='marker'?envelope.project.planning.markers:envelope.project.planning.holidays;const item=list.find(x=>x.id===id)||{};$('entityKind').value=kind;$('entityId').value=id;$('deleteEntityBtn').style.visibility=id?'visible':'hidden';const cfg={phase:['PHASE','Phase bearbeiten'],marker:['STICHTAG','Stichtag bearbeiten'],holiday:['SONDERTAG','Sondertag bearbeiten']}[kind];$('entityEyebrow').textContent=cfg[0];$('entityTitle').textContent=id?cfg[1]:cfg[1].replace('bearbeiten','anlegen');if(kind==='phase')$('entityFields').innerHTML=`<label class="span-2">Name<input id="entityName" maxlength="120" required value="${esc(item.name||'')}"></label><label>Start<input id="entityStart" type="date" required value="${esc(item.start||todayIso())}"></label><label>Ende<input id="entityEnd" type="date" required value="${esc(item.end||todayIso())}"></label><label>Farbe<input id="entityColor" type="color" value="${esc(item.color||'#DCE8EB')}"></label>`;if(kind==='marker')$('entityFields').innerHTML=`<label class="span-2">Name<input id="entityName" maxlength="120" required value="${esc(item.name||'')}"></label><label>Datum<input id="entityDate" type="date" required value="${esc(item.date||todayIso())}"></label><label>Farbe<input id="entityColor" type="color" value="${esc(item.color||'#607A00')}"></label><label>Linie<select id="entityStyle"><option value="solid">Durchgezogen</option><option value="dashed">Gestrichelt</option><option value="dotted">Gepunktet</option></select></label>`;if(kind==='holiday')$('entityFields').innerHTML=`<label class="span-2">Name<input id="entityName" maxlength="120" required value="${esc(item.name||'')}"></label><label>Datum<input id="entityDate" type="date" required value="${esc(item.date||todayIso())}"></label>`;if(kind==='marker')$('entityStyle').value=item.style||'solid';$('entityDialog').showModal();}
async function saveEntity() {
  if(entitySavePending)return;
  const kind=$('entityKind').value,id=$('entityId').value||uuid(),name=$('entityName').value.trim();
  if(!name)return toast('Name darf nicht leer sein.',true);
  let item;
  if(kind==='phase'){
    const start=$('entityStart').value,end=$('entityEnd').value;
    if(!isValidIsoDate(start)||!isValidIsoDate(end)||end<start)
      return toast('Bitte einen gültigen Phasenzeitraum angeben.',true);
    item={id,name,start,end,color:$('entityColor').value};
  } else if(kind==='marker'){
    const date=$('entityDate').value;
    if(!isValidIsoDate(date))return toast('Ungültiges Datum.',true);
    item={id,name,date,color:$('entityColor').value,style:$('entityStyle').value};
  } else {
    const date=$('entityDate').value;
    if(!isValidIsoDate(date))return toast('Ungültiges Datum.',true);
    item={id,name,date,source:'manual',country:'',subdivision:'',imported:false,importedAt:''};
  }
  entitySavePending=true;
  $('saveEntityBtn').disabled=true;
  try {
    const result=await commitProjectChange(project=>{
      const planning=project.planning;
      const list=kind==='phase'?planning.phases:kind==='marker'?planning.markers:planning.holidays;
      const index=list.findIndex(x=>String(x.id)===String(id));
      if(index>=0)list[index]=item;else list.push(item);
    });
    if(!result.active)return;
    $('entityDialog').close();renderPlanningLists();populateTaskPhases();renderPhaseToolbar();renderGanttOnly();
    toast('Planungselement gespeichert.');
  } catch {}
  finally { entitySavePending=false; $('saveEntityBtn').disabled=false; }
}

async function deleteEntity() {
  const kind=$('entityKind').value,id=$('entityId').value;
  if(!id)return;
  try {
    const result=await commitProjectChange(project=>{
      const planning=project.planning;
      if(kind==='phase'){
        planning.phases=planning.phases.filter(x=>String(x.id)!==String(id));
        project.tasks=project.tasks.map(t=>String(t.phaseId)===String(id)?{...t,phaseId:''}:t);
      } else if(kind==='marker') planning.markers=planning.markers.filter(x=>String(x.id)!==String(id));
      else planning.holidays=planning.holidays.filter(x=>String(x.id)!==String(id));
    });
    if(!result.active)return;
    if(kind==='phase')collapsedPhases.delete(String(id));
    $('entityDialog').close();renderPlanningLists();populateTaskPhases();renderPhaseToolbar();renderGanttOnly();
    toast('Planungselement gelöscht.');
  } catch {}
}

async function importGermanHolidays() {
  const year=Number(prompt('Jahr für den Feiertagsimport:',String(new Date().getFullYear())));
  if(!Number.isInteger(year)||year<1975||year>2100)return;
  const subdivision=(prompt('Bundesland-Code (z. B. DE-BY). Leer = nur bundesweite Feiertage:','DE-BY')||'').trim().toUpperCase();
  try {
    const res=await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/DE`);
    if(!res.ok)throw new Error(`HTTP ${res.status}`);
    const raw=await res.json();
    let added=0;
    const result=await commitProjectChange(project=>{
      const holidays=project.planning.holidays;
      const existing=new Set(holidays.map(h=>`${h.date}|${h.name.toLowerCase()}`));
      for(const h of raw){
        const counties=Array.isArray(h.counties)?h.counties.map(String):[];
        const national=h.global===true||!counties.length;
        if(!national&&(!subdivision||!counties.includes(subdivision)))continue;
        const name=String(h.localName||h.name||'').trim();
        if(!name||!isValidIsoDate(h.date))continue;
        const key=`${h.date}|${name.toLowerCase()}`;
        if(existing.has(key))continue;
        holidays.push({id:uuid(),name,date:h.date,source:'Nager.Date',country:'DE',subdivision,imported:true,importedAt:new Date().toISOString()});
        existing.add(key);added++;
      }
    });
    if(result.active){renderPlanningLists();renderGanttOnly();toast(`${added} Feiertage importiert.`);}
  } catch(error) { toast(`Feiertagsimport fehlgeschlagen: ${error.message}`,true); }
}

function designInputId(key){return `design${key[0].toUpperCase()+key.slice(1)}`;}

function readDesignColors(){
  return Object.fromEntries(DESIGN_COLOR_FIELDS.map(key=>[key,$(designInputId(key)).value.toUpperCase()]));
}

function renderDesignPresets(){
  $('designPresetGrid').innerHTML=DESIGN_PRESETS.map(preset=>{
    const c=preset.colors;
    // Preset names and colors are constants, never HTML from project imports.
    const legacyId=preset.id==='odin'?'designPresetOdin':preset.id==='neutral'?'designPresetNeutral':`designPreset-${preset.id}`;
    return `<button type="button" id="${legacyId}" class="design-preset-option" data-design-preset="${preset.id}" aria-pressed="false">
      <span class="design-preset-art" aria-hidden="true" style="--preset-primary:${c.primary};--preset-canvas:${c.pageBg};--preset-panel:${c.panelBg};--preset-work:${c.workstream};--preset-accent:${c.accent};--preset-milestone:${c.milestone}">
        <span class="preset-art-head"></span>
        <span class="preset-art-surface"><span class="preset-art-line"></span><span class="preset-art-bar"></span><span class="preset-art-line short"></span><span class="preset-art-milestone"></span></span>
      </span>
      <span class="design-preset-name">${preset.label}</span>
      <span class="design-preset-description">${preset.description}</span>
    </button>`;
  }).join('');
}

function openDesignDialog(){
  const c=envelope.project.design?.colors||{};
  $('designPrimary').value=c.primary||c.headerBg||'#16324F';
  $('designAccent').value=c.accent||'#607A00';
  $('designWorkstream').value=c.workstream||'#3B7280';
  $('designCritical').value=c.critical||'#16324F';
  $('designMilestone').value=c.milestone||'#607A00';
  $('designGate').value=c.gate||'#8B5A2B';
  $('designPageBg').value=c.pageBg||'#EEF2F3';
  $('designPanelBg').value=c.panelBg||'#FFFFFF';
  renderDesignPresets();
  updateDesignPreview();
  $('designDialog').showModal();
}

function setDesignPreset(id){
  const preset=findDesignPreset(id);
  if(!preset)return;
  for(const [key,value] of Object.entries(preset.colors))$(designInputId(key)).value=value;
  updateDesignPreview();
}

function updateDesignPreview(){
  const dialog=$('designDialog');
  if(!dialog)return;
  const colors=readDesignColors();
  for(const [key,cssKey] of [
    ['primary','--preview-primary'],['accent','--preview-accent'],
    ['workstream','--preview-work'],['critical','--preview-critical'],
    ['milestone','--preview-milestone'],['gate','--preview-gate'],
    ['pageBg','--preview-page'],['panelBg','--preview-panel']
  ])dialog.style.setProperty(cssKey,colors[key]);
  const matched=matchDesignPreset(colors);
  for(const button of $('designPresetGrid').querySelectorAll('[data-design-preset]')){
    const selected=button.dataset.designPreset===matched?.id;
    button.classList.toggle('selected',selected);
    button.setAttribute('aria-pressed',String(selected));
  }
  const themeMode=designThemeMode(colors);
  const label=themeMode==='hybrid'?'Hybrid':themeMode==='dark'?'Dunkles':'Helles';
  $('designPreviewMode').textContent=`${label} Design · Vorschau`;
  $('designPreviewCard').dataset.previewMode=themeMode;
  $('designPresetSelection').textContent=matched
    ? `Vorschau: ${matched.label}. Erst „Design speichern“ übernimmt diese Farben.`
    : 'Individuelle Farbauswahl. Erst „Design speichern“ übernimmt diese Farben.';
}
async function saveDesign() {
  const colors={
    primary:$('designPrimary').value,accent:$('designAccent').value,
    workstream:$('designWorkstream').value,critical:$('designCritical').value,
    milestone:$('designMilestone').value,gate:$('designGate').value,
    pageBg:$('designPageBg').value,panelBg:$('designPanelBg').value
  };
  try {
    const result=await commitProjectChange(project=>{
      Object.assign(project.design.colors,colors,{headerBg:colors.primary});
    });
    if(!result.active)return;
    applyDesign();renderGanttOnly();$('designDialog').close();toast('Design gespeichert.');
  } catch {}
}

function applyDesign(){
  const c=envelope.project.design?.colors||{};
  const root=document.documentElement;
  root.dataset.themeMode=designThemeMode(c);
  const dark=root.dataset.themeMode==='dark';
  const hybrid=root.dataset.themeMode==='hybrid';
  const map={
    '--bg':c.pageBg,'--panel':c.panelBg,
    '--primary':c.primary||c.headerBg,'--accent':c.accent,
    '--workstream':c.workstream,'--critical':c.critical,
    '--milestone':c.milestone,'--gate':c.gate,
    '--ink':dark?'#CDD9E2':hybrid?'#DCE5E8':c.text,
    '--muted':dark?'#AABAC8':hybrid?'#B6C6CD':c.mutedText,
    '--border':dark?'#3A4A56':hybrid?'#B8C8CD':c.border,
    '--grid':dark?'#334451':hybrid?'#CED9DD':c.grid
  };
  // Do not leak stale project color overrides into another project.
  for(const [key,value] of Object.entries(map)){
    if(value)root.style.setProperty(key,value);
    else root.style.removeProperty(key);
  }
}

function validateGraph(tasks){const ids=new Set(tasks.map(t=>t.id)),byId=new Map(tasks.map(t=>[t.id,t]));for(const t of tasks)for(const dep of t.dependencies||[]){if(!ids.has(dep))throw new Error(`Aufgabe „${t.name}“ verweist auf einen unbekannten Vorgänger.`);if(dep===t.id)throw new Error(`Aufgabe „${t.name}“ darf nicht von sich selbst abhängen.`);}const visiting=new Set(),visited=new Set();const visit=id=>{if(visited.has(id))return;if(visiting.has(id))throw new Error('Die Aufgabenabhängigkeiten enthalten einen Zyklus.');visiting.add(id);for(const dep of byId.get(id)?.dependencies||[])visit(dep);visiting.delete(id);visited.add(id);};ids.forEach(visit);}
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
