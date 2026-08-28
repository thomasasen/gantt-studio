import { renderGantt } from './gantt.js';
import { saveLocal, loadActive, loadProject, listProjects, deleteProject, setActiveProject } from './storage.js';

const $ = (id) => document.getElementById(id);
const clone = (x) => JSON.parse(JSON.stringify(x));
const uuid = () => crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const todayIso = () => new Date().toISOString().slice(0, 10);

const defaults = {
  schema: 'gantt-studio.project', schemaVersion: 1, generator: 'Gantt Studio Pages',
  project: {
    id: '', name: 'Neues Projekt', createdAt: '', updatedAt: '', tasks: [],
    design: { colors: { pageBg:'#EEF2F3',panelBg:'#FFFFFF',headerBg:'#16324F',primary:'#16324F',accent:'#607A00',critical:'#16324F',workstream:'#3B7280',milestone:'#607A00',arrow:'#657983',grid:'#DCE4E7',text:'#243746',mutedText:'#687D87',border:'#D8E1E4',saturday:'#F1E2E2',sunday:'#F1E2E2',holiday:'#F3CACA' } },
    planning: { settings: { showToday:true,showStatusLine:true,showWeekends:true,showHolidays:true,showPhaseBands:true,showBaseline:true,showBuffer:true,showRisk:true,showOwners:true,showProgressLabels:true,showDateLabels:true,showRelativeToday:false,relativeOffsetDays:14,relativeDayMode:'workdays',relativeSkipHolidays:true,relativeLabel:'Vorbereitungstermin',relativeColor:'#C2007B',relativeStyle:'solid' }, phases:[],markers:[],holidays:[] },
    labelConfig: { enabled:true,tracks:4,leaderLines:true,ellipsis:true,twoLine:true,maxWidth:240,placement:'auto',groups:{name:true,progress:true,owner:false,dates:false,phase:false,status:false,risk:false} },
    revision: 1
  }
};

let envelope = createEnvelope();
let zoom = 'week';
let managementMode = 'operational';
let saveTimer = null;
let toastTimer = null;

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
  await renderAll();
}

function bindEvents() {
  $('newProjectBtn').addEventListener('click', createProject);
  $('deleteProjectBtn').addEventListener('click', removeProject);
  $('projectSelect').addEventListener('change', changeProject);
  $('openProjectBtn').addEventListener('click', () => $('fileInput').click());
  $('fileInput').addEventListener('change', importFile);
  $('saveProjectBtn').addEventListener('click', exportProject);
  $('addTaskBtn').addEventListener('click', () => openTaskDialog());
  $('demoBtn').addEventListener('click', loadDemo);
  $('settingsBtn').addEventListener('click', openSettings);
  $('guideBtn').addEventListener('click', () => $('guideDialog').showModal());
  $('zoomSelect').addEventListener('change', e => { zoom = e.target.value; renderGanttOnly(); });
  $('managementSelect').addEventListener('change', e => { managementMode = e.target.value; renderGanttOnly(); });
  $('projectName').addEventListener('change', async e => { envelope.project.name = e.target.value.trim() || 'Unbenanntes Projekt'; touch(); await persist(); await renderPortfolio(); });
  $('saveTaskBtn').addEventListener('click', saveTask);
  $('deleteTaskBtn').addEventListener('click', deleteTask);
  $('ganttStage').addEventListener('click', e => { const node = e.target.closest('[data-task-id]'); if (node) openTaskDialog(node.dataset.taskId); });
  $('addPhaseBtn').addEventListener('click', () => openEntity('phase'));
  $('addMarkerBtn').addEventListener('click', () => openEntity('marker'));
  $('addHolidayBtn').addEventListener('click', () => openEntity('holiday'));
  $('saveEntityBtn').addEventListener('click', saveEntity);
  $('deleteEntityBtn').addEventListener('click', deleteEntity);
  $('importHolidayBtn').addEventListener('click', importGermanHolidays);
  $('relativeLabel').addEventListener('change', updateRelativeSettings);
  $('relativeOffset').addEventListener('change', updateRelativeSettings);
  for (const id of ['phaseList','markerList','holidayList']) $(id).addEventListener('click', e => { const row=e.target.closest('[data-entity-id]'); if(row) openEntity(row.dataset.entityKind,row.dataset.entityId); });
  window.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==='s') { e.preventDefault(); exportProject(); } });
}

async function renderAll() {
  $('projectName').value = envelope.project.name;
  $('managementSelect').value = managementMode;
  await renderPortfolio();
  renderMeta(); renderMetrics(); renderLegend(); renderGanttOnly(); populateTaskPhases();
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

function renderMetrics() {
  const tasks = envelope.project.tasks;
  const milestones = tasks.filter(t => ['milestone','gate'].includes(t.type)).length;
  const progress = tasks.length ? Math.round(tasks.reduce((s,t)=>s+(Number(t.progress)||0),0)/tasks.length) : 0;
  const end = tasks.length ? tasks.map(t=>t.end).filter(Boolean).sort().at(-1) : '';
  const criticalRisk = tasks.filter(t => t.status==='red' || ['high','critical'].includes(t.risk)).length;
  const cost = tasks.reduce((s,t)=>s+(Number(t.costEur)||0),0);
  const metrics = [['Aufgaben',tasks.length],['Meilensteine / Gates',milestones],['Fortschritt',`${progress} %`],['Projektende',end?formatDate(end):'–'],['Risiken / Budget',`${criticalRisk} · ${formatMoney(cost)}`]];
  $('metrics').innerHTML = metrics.map(([l,v],i)=>`<div class="metric ${i===4&&criticalRisk?'warn':''}"><span>${l}</span><strong>${v}</strong></div>`).join('');
}

function renderLegend() {
  $('legend').innerHTML = [['Workstream','var(--workstream)'],['Kritisch','var(--critical)'],['Meilenstein','var(--milestone)'],['Gate','var(--gate)']].map(([l,c])=>`<span class="legend-item"><i class="legend-swatch" style="background:${c}"></i>${l}</span>`).join('');
}

function visibleTasks() {
  const tasks = envelope.project.tasks;
  if (managementMode === 'operational') return tasks;
  if (managementMode === 'milestones') return tasks.filter(t => ['milestone','gate'].includes(t.type));
  const today = todayIso();
  return tasks.filter(t => t.type==='critical' || ['milestone','gate'].includes(t.type) || ['high','critical'].includes(t.risk) || t.status==='red' || (t.end < today && Number(t.progress||0)<100));
}

function renderGanttOnly() {
  const project = clone(envelope.project);
  project.tasks = visibleTasks();
  const stage = $('ganttStage');
  const result = renderGantt(stage, project, { zoom });
  if (result.empty) {
    stage.innerHTML = `<div class="empty-state"><strong>${envelope.project.tasks.length?'Keine Aufgaben in dieser Ansicht':'Noch keine Aufgaben'}</strong><span>${envelope.project.tasks.length?'Wechsle die Inhaltsansicht oder ergänze relevante Merkmale.':'Erstelle eine Aufgabe oder lade die Demo.'}</span><button class="btn primary" id="emptyAddBtn2" type="button">${envelope.project.tasks.length?'Aufgabe erstellen':'Erste Aufgabe erstellen'}</button></div>`;
    $('emptyAddBtn2').addEventListener('click',()=>openTaskDialog());
  }
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
function populateDependencies(task) {
  $('taskDependencies').innerHTML=envelope.project.tasks.filter(t=>t.id!==task?.id).map(t=>`<option value="${esc(t.id)}" ${(task?.dependencies||[]).includes(t.id)?'selected':''}>${esc(t.name)}</option>`).join('');
}

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

async function deleteTask() {
  const id=$('taskId').value; if(!id)return;
  envelope.project.tasks=envelope.project.tasks.filter(t=>t.id!==id).map(t=>({...t,dependencies:(t.dependencies||[]).filter(dep=>dep!==id)}));
  touch(); await persist(); $('taskDialog').close(); await renderAll(); toast('Aufgabe gelöscht.');
}

async function createProject() {
  const name=(prompt('Name des neuen Projekts:','Neues Projekt')||'').trim(); if(!name)return;
  envelope=createEnvelope(); envelope.project.name=uniqueName(name,await listProjects()); await saveLocal(envelope.project); setActiveProject(envelope.project.id); managementMode='operational'; await renderAll(); toast('Projekt wurde angelegt.');
}

async function changeProject(e) {
  const p=await loadProject(e.target.value); if(!p)return;
  envelope=normalizeEnvelope({schema:'gantt-studio.project',schemaVersion:1,generator:'Gantt Studio',project:p}); setActiveProject(p.id); managementMode='operational'; await renderAll();
}

async function removeProject() {
  const projects=await listProjects(); if(!envelope.project?.id)return;
  if(!confirm(`Projekt „${envelope.project.name}“ vollständig löschen?`))return;
  await deleteProject(envelope.project.id);
  const remaining=projects.filter(p=>p.id!==envelope.project.id);
  if(remaining.length){const p=await loadProject(remaining[0].id); envelope=normalizeEnvelope({schema:'gantt-studio.project',schemaVersion:1,generator:'Gantt Studio',project:p}); setActiveProject(p.id);} else {envelope=createEnvelope();await saveLocal(envelope.project);}
  await renderAll(); toast('Projekt wurde gelöscht.');
}

async function loadDemo() {
  try { const res=await fetch('./examples/demo.gantt.json',{cache:'no-store'}); if(!res.ok)throw new Error(); const raw=await res.json(); envelope=cloneForImport(normalizeEnvelope(raw)); await saveLocal(envelope.project); await renderAll(); toast('Demo als neues Projekt geladen.'); }
  catch { toast('Demo konnte nicht geladen werden.',true); }
}

async function importFile(event) {
  const file=event.target.files?.[0]; if(!file)return;
  try { envelope=cloneForImport(normalizeEnvelope(JSON.parse(await file.text()))); envelope.project.name=uniqueName(envelope.project.name,await listProjects()); await saveLocal(envelope.project); await renderAll(); toast('Projekt importiert.'); }
  catch(e){toast(e.message||'Datei konnte nicht importiert werden.',true);} finally{event.target.value='';}
}

function cloneForImport(source) {
  const e=clone(source), map=new Map();
  e.project.tasks.forEach(t=>map.set(t.id,uuid()));
  e.project.tasks=e.project.tasks.map(t=>({...t,id:map.get(t.id),dependencies:(t.dependencies||[]).map(d=>map.get(d)).filter(Boolean)}));
  const now=new Date().toISOString(); e.project.id=uuid(); e.project.createdAt=now; e.project.updatedAt=now; e.project.revision=1; e.exportedAt=now; return e;
}

function exportProject() {
  const payload=clone(envelope); payload.exportedAt=new Date().toISOString();
  download(JSON.stringify(payload,null,2),`${slug(payload.project.name)}-${todayIso()}.gantt.json`,'application/json'); toast('Projektdatei exportiert.');
}

function openSettings() { syncSettings(); renderPlanningLists(); $('relativeLabel').value=envelope.project.planning.settings.relativeLabel||''; $('relativeOffset').value=envelope.project.planning.settings.relativeOffsetDays??14; $('settingsDialog').showModal(); }

function buildSettings() {
  const labels={showToday:'Heute markieren',showWeekends:'Wochenenden markieren',showHolidays:'Feiertage markieren',showPhaseBands:'Phasen einfärben',showBaseline:'Baseline anzeigen',showBuffer:'Puffer anzeigen',showRisk:'Risiken anzeigen',showOwners:'Owner anzeigen',showProgressLabels:'Fortschritt anzeigen',showDateLabels:'Datumslabels anzeigen',showStatusLine:'Abhängigkeiten anzeigen',showRelativeToday:'Relative Zieldatumslinie anzeigen'};
  $('settingsList').innerHTML=Object.entries(labels).map(([key,label])=>`<label class="toggle-row"><span>${label}</span><input type="checkbox" data-setting="${key}"></label>`).join('');
  $('settingsList').addEventListener('change',async e=>{const key=e.target.dataset.setting;if(!key)return;envelope.project.planning.settings[key]=e.target.checked;touch();await persist();renderGanttOnly();});
}
function syncSettings(){document.querySelectorAll('[data-setting]').forEach(cb=>cb.checked=envelope.project.planning.settings[cb.dataset.setting]!==false);}
async function updateRelativeSettings(){envelope.project.planning.settings.relativeLabel=$('relativeLabel').value.trim().slice(0,80);envelope.project.planning.settings.relativeOffsetDays=clamp(Number($('relativeOffset').value)||0,-3650,3650);touch();await persist();renderGanttOnly();}

function renderPlanningLists(){
  $('phaseList').innerHTML=entityRows('phase',envelope.project.planning.phases,p=>`${formatDate(p.start)} – ${formatDate(p.end)}`);
  $('markerList').innerHTML=entityRows('marker',envelope.project.planning.markers,p=>`${formatDate(p.date)} · ${p.style==='dashed'?'gestrichelt':'durchgezogen'}`);
  $('holidayList').innerHTML=entityRows('holiday',envelope.project.planning.holidays,p=>`${formatDate(p.date)}${p.source?` · ${esc(p.source)}`:''}`);
}
function entityRows(kind,items,detail){return items.length?items.slice().sort((a,b)=>(a.start||a.date||'').localeCompare(b.start||b.date||'')).map(x=>`<button type="button" class="entity-row" data-entity-kind="${kind}" data-entity-id="${esc(x.id)}"><span><strong>${esc(x.name)}</strong><small>${detail(x)}</small></span><i style="background:${esc(x.color||'#DCE8EB')}"></i></button>`).join(''):'<div class="muted-empty">Noch keine Einträge.</div>';}

function openEntity(kind,id=''){
  const list=kind==='phase'?envelope.project.planning.phases:kind==='marker'?envelope.project.planning.markers:envelope.project.planning.holidays;
  const item=list.find(x=>x.id===id)||{}; $('entityKind').value=kind; $('entityId').value=id; $('deleteEntityBtn').style.visibility=id?'visible':'hidden';
  const cfg={phase:['PHASE','Phase bearbeiten'],marker:['STICHTAG','Stichtag bearbeiten'],holiday:['SONDERTAG','Sondertag bearbeiten']}[kind]; $('entityEyebrow').textContent=cfg[0];$('entityTitle').textContent=id?cfg[1]:cfg[1].replace('bearbeiten','anlegen');
  if(kind==='phase') $('entityFields').innerHTML=`<label class="span-2">Name<input id="entityName" maxlength="120" required value="${esc(item.name||'')}"></label><label>Start<input id="entityStart" type="date" required value="${esc(item.start||todayIso())}"></label><label>Ende<input id="entityEnd" type="date" required value="${esc(item.end||todayIso())}"></label><label>Farbe<input id="entityColor" type="color" value="${esc(item.color||'#DCE8EB')}"></label>`;
  if(kind==='marker') $('entityFields').innerHTML=`<label class="span-2">Name<input id="entityName" maxlength="120" required value="${esc(item.name||'')}"></label><label>Datum<input id="entityDate" type="date" required value="${esc(item.date||todayIso())}"></label><label>Farbe<input id="entityColor" type="color" value="${esc(item.color||'#607A00')}"></label><label>Linie<select id="entityStyle"><option value="solid">Durchgezogen</option><option value="dashed">Gestrichelt</option></select></label>`;
  if(kind==='holiday') $('entityFields').innerHTML=`<label class="span-2">Name<input id="entityName" maxlength="120" required value="${esc(item.name||'')}"></label><label>Datum<input id="entityDate" type="date" required value="${esc(item.date||todayIso())}"></label>`;
  if(kind==='marker') $('entityStyle').value=item.style||'solid'; $('entityDialog').showModal();
}

async function saveEntity(){
  const kind=$('entityKind').value,id=$('entityId').value||uuid(),name=$('entityName').value.trim();if(!name)return toast('Name darf nicht leer sein.',true);
  const p=envelope.project.planning; const list=kind==='phase'?p.phases:kind==='marker'?p.markers:p.holidays; let item;
  if(kind==='phase'){const start=$('entityStart').value,end=$('entityEnd').value;if(!start||!end||end<start)return toast('Bitte einen gültigen Phasenzeitraum angeben.',true);item={id,name,start,end,color:$('entityColor').value};}
  else if(kind==='marker'){item={id,name,date:$('entityDate').value,color:$('entityColor').value,style:$('entityStyle').value};}
  else{item={id,name,date:$('entityDate').value,source:'manual',country:'',subdivision:'',imported:false,importedAt:''};}
  const idx=list.findIndex(x=>x.id===id);if(idx>=0)list[idx]=item;else list.push(item);touch();await persist();$('entityDialog').close();renderPlanningLists();populateTaskPhases();renderGanttOnly();toast('Planungselement gespeichert.');
}
async function deleteEntity(){const kind=$('entityKind').value,id=$('entityId').value;if(!id)return;const p=envelope.project.planning;if(kind==='phase'){p.phases=p.phases.filter(x=>x.id!==id);envelope.project.tasks=envelope.project.tasks.map(t=>t.phaseId===id?{...t,phaseId:''}:t);}else if(kind==='marker')p.markers=p.markers.filter(x=>x.id!==id);else p.holidays=p.holidays.filter(x=>x.id!==id);touch();await persist();$('entityDialog').close();renderPlanningLists();populateTaskPhases();renderGanttOnly();toast('Planungselement gelöscht.');}

async function importGermanHolidays(){
  const year=Number(prompt('Jahr für den Feiertagsimport:',String(new Date().getFullYear())));if(!Number.isInteger(year)||year<1975||year>2100)return;
  const subdivision=(prompt('Bundesland-Code (z. B. DE-BY). Leer = nur bundesweite Feiertage:','DE-BY')||'').trim().toUpperCase();
  try{const res=await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/DE`);if(!res.ok)throw new Error(`HTTP ${res.status}`);const raw=await res.json();const existing=new Set(envelope.project.planning.holidays.map(h=>`${h.date}|${h.name.toLowerCase()}`));let added=0;
    for(const h of raw){const counties=Array.isArray(h.counties)?h.counties.map(String):[];const national=h.global===true||!counties.length;if(!national&&(!subdivision||!counties.includes(subdivision)))continue;const name=String(h.localName||h.name||'').trim();const key=`${h.date}|${name.toLowerCase()}`;if(existing.has(key))continue;envelope.project.planning.holidays.push({id:uuid(),name,date:h.date,source:'Nager.Date',country:'DE',subdivision,imported:true,importedAt:new Date().toISOString()});existing.add(key);added++;}
    touch();await persist();renderPlanningLists();renderGanttOnly();toast(`${added} Feiertage importiert.`);
  }catch(e){toast(`Feiertagsimport fehlgeschlagen: ${e.message}`,true);}
}

function validateGraph(tasks){const ids=new Set(tasks.map(t=>t.id)),byId=new Map(tasks.map(t=>[t.id,t]));for(const t of tasks)for(const dep of t.dependencies||[]){if(!ids.has(dep))throw new Error(`Aufgabe „${t.name}“ verweist auf einen unbekannten Vorgänger.`);if(dep===t.id)throw new Error(`Aufgabe „${t.name}“ darf nicht von sich selbst abhängen.`);}const visiting=new Set(),visited=new Set();const visit=id=>{if(visited.has(id))return;if(visiting.has(id))throw new Error('Die Aufgabenabhängigkeiten enthalten einen Zyklus.');visiting.add(id);for(const dep of byId.get(id)?.dependencies||[])visit(dep);visiting.delete(id);visited.add(id);};ids.forEach(visit);}
function sortTasks(){envelope.project.tasks.sort((a,b)=>(a.start||'').localeCompare(b.start||'')||(a.end||'').localeCompare(b.end||''));}
function touch(){envelope.project.updatedAt=new Date().toISOString();envelope.project.revision=Math.max(1,Number(envelope.project.revision)||1)+1;}
async function persist(){clearTimeout(saveTimer);await saveLocal(envelope.project);renderMeta();}
function schedulePersist(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>persist().catch(console.warn),200);}
function uniqueName(name,projects){const used=new Set(projects.map(p=>p.name.toLowerCase()));if(!used.has(name.toLowerCase()))return name;for(let i=2;i<1000;i++){const candidate=`${name} (${i})`;if(!used.has(candidate.toLowerCase()))return candidate;}return `${name} ${Date.now()}`;}
function download(content,name,type){const blob=new Blob([content],{type});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
function safeUrl(v){const raw=String(v||'').trim();if(!raw)return'';try{const u=new URL(raw);return ['http:','https:'].includes(u.protocol)?u.toString():'';}catch{return'';}}
function clamp(n,min,max){return Math.min(max,Math.max(min,n));}
function formatDate(v){return new Intl.DateTimeFormat('de-DE').format(new Date(`${v}T12:00:00`));}
function formatMoney(v){return new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(v||0);}
function slug(v){return String(v||'projekt').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'projekt';}
function toast(message,error=false){const t=$('toast');t.textContent=message;t.classList.toggle('error',error);t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),2600);}
function esc(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}

boot();
