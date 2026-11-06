/* Immutable, renderer-neutral print projection. Never persists or edits project data. */
const DAY=86400000;
const parse = iso => { if(!/^\d{4}-\d{2}-\d{2}$/.test(String(iso||''))) return NaN; const n=Date.parse(iso+'T00:00:00Z'); return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===iso?n:NaN; };
const iso = n => new Date(n).toISOString().slice(0,10);
const valid = s => Number.isFinite(parse(s));
const safeArray = value => Array.isArray(value)?value:[];
const sortDates = (a,b)=>String(a||'').localeCompare(String(b||''));
const frozen = value => { if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(frozen);Object.freeze(value);}return value; };
const asSet = value => new Set(safeArray(value).map(String));
export const dateMath=Object.freeze({DAY,parse,iso,valid});

export function createPrintProjection(project,options={},view={}) {
  if(!project||!Array.isArray(project.tasks))throw new TypeError('Ein gültiges Projekt ist erforderlich.');
  const snapshot=structuredClone(project);
  const elements=options.elements||{};
  const phases=safeArray(snapshot.planning?.phases).slice().sort((a,b)=>sortDates(a.start,b.start));
  const phaseMap=new Map(phases.map(p=>[String(p.id),p]));
  const selectedIds=asSet(options.taskIds), selectedPhases=asSet(options.phaseIds);
  const filteredIds=asSet(view.filteredTaskIds);
  const collapsedIds=asSet(view.collapsedPhaseIds);
  const scope=options.scope||'all';
  let tasks=snapshot.tasks.filter(t=>t.showInGantt!==false&&valid(t.start)&&valid(t.end)&&parse(t.start)<=parse(t.end));
  if(scope==='filtered')tasks=tasks.filter(t=>filteredIds.has(String(t.id)));
  if(scope==='selected')tasks=tasks.filter(t=>selectedIds.has(String(t.id)));
  if(scope==='phases')tasks=tasks.filter(t=>selectedPhases.has(String(t.phaseId)));
  if(scope==='summary')tasks=tasks.filter(t=>['milestone','gate'].includes(t.type));
  if(elements.milestones===false)tasks=tasks.filter(t=>!['milestone','gate'].includes(t.type));
  if(options.expandCollapsed===false)tasks=tasks.filter(t=>!collapsedIds.has(String(t.phaseId)));
  const originalIndex=new Map(snapshot.tasks.map((task,i)=>[String(task.id),i]));
  const sortMode=view.sortMode==='date'?'date':'manual';
  const sortTasks=(a,b)=>sortMode==='date'
    ? sortDates(a.start,b.start)||originalIndex.get(String(a.id))-originalIndex.get(String(b.id))
    : (Number.isFinite(Number(a.displayOrder))?Number(a.displayOrder):originalIndex.get(String(a.id)))
       -(Number.isFinite(Number(b.displayOrder))?Number(b.displayOrder):originalIndex.get(String(b.id)))
       ||originalIndex.get(String(a.id))-originalIndex.get(String(b.id));
  const byPhase=new Map(phases.map(p=>[String(p.id),[]])),unphased=[];
  for(const task of tasks){const bucket=byPhase.get(String(task.phaseId));(bucket||unphased).push(task);}
  const rows=[];
  for(const phase of phases) {
    const members=byPhase.get(String(phase.id));if(!members?.length)continue;
    members.sort(sortTasks);
    const starts=members.map(t=>t.start).sort(),ends=members.map(t=>t.end).sort();
    if(elements.phases!==false)rows.push({kind:'phase',id:'phase:'+phase.id,name:phase.name||'Phase',phaseId:phase.id,start:valid(phase.start)?phase.start:starts[0],end:valid(phase.end)?phase.end:ends.at(-1),progress:Math.round(members.reduce((s,t)=>s+Number(t.progress||0),0)/members.length),status:'neutral',owner:members.length+' Aufgaben',color:phase.color||'#DCE8EB'});
    if(scope!=='summary')rows.push(...members.map(t=>({...t,kind:'task'})));
    else rows.push(...members.map(t=>({...t,kind:'task'})));
  }
  rows.push(...unphased.sort(sortTasks).map(t=>({...t,kind:'task'})));
  const relevant=rows.filter(r=>r.kind==='task');
  const markers=safeArray(snapshot.planning?.markers).filter(m=>valid(m.date)).map(m=>({...m,kind:'marker'}));
  const holidays=safeArray(snapshot.planning?.holidays).filter(h=>valid(h.date));
  const dates=[];
  for(const r of rows){if(valid(r.start))dates.push(parse(r.start));if(valid(r.end))dates.push(parse(r.end));
    if(r.kind==='task'&&elements.baselines!==false){if(valid(r.baselineStart))dates.push(parse(r.baselineStart));if(valid(r.baselineEnd))dates.push(parse(r.baselineEnd));}
    if(r.kind==='task'&&elements.buffer!==false&&Number(r.bufferDays)>0&&valid(r.end))dates.push(parse(r.end)+Math.min(365,Math.max(0,Number(r.bufferDays)))*DAY);
  }
  if(elements.markers!==false)for(const m of markers)dates.push(parse(m.date));
  const now=Date.now(); const today=new Date(now).toISOString().slice(0,10);
  let start=dates.length?Math.min(...dates):parse(today);
  let end=dates.length?Math.max(...dates):start+30*DAY;
  const timeframe=options.timeframe||'full';
  if(timeframe==='custom') {
    if(!valid(options.startDate)||!valid(options.endDate)||parse(options.startDate)>parse(options.endDate))throw new Error('Ungültiger benutzerdefinierter Zeitraum.');
    start=parse(options.startDate);end=parse(options.endDate);
  } else if(timeframe==='month') {
    const d=new Date(now);start=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1);end=Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0);
  } else if(timeframe==='quarter') {
    const q=String(options.quarter||'');const match=/^(\d{4})-Q([1-4])$/.exec(q);
    const y=match?Number(match[1]):new Date(now).getUTCFullYear(),n=match?Number(match[2]):Math.floor(new Date(now).getUTCMonth()/3)+1;
    start=Date.UTC(y,(n-1)*3,1);end=Date.UTC(y,n*3,0);
  } else if(timeframe==='phase') {
    const phase=phaseMap.get(String(options.sectionPhase));if(!phase||!valid(phase.start)||!valid(phase.end))throw new Error('Bitte einen gültigen Projektabschnitt wählen.');
    start=parse(phase.start);end=parse(phase.end);
  }
  const inRange=rows.filter(r=>parse(r.start)<=end&&parse(r.end)>=start);
  const activeMarkers=markers.filter(m=>parse(m.date)>=start&&parse(m.date)<=end);
  const ps=snapshot.planning?.settings||{};
  if(elements.relative&&ps.showRelativeToday&&Number.isFinite(Number(ps.relativeOffsetDays))){
    let date=parse(today),step=Number(ps.relativeOffsetDays)>=0?1:-1,remaining=Math.min(3650,Math.abs(Math.trunc(Number(ps.relativeOffsetDays))));
    const excluded=new Set(holidays.map(h=>h.date));
    if(ps.relativeDayMode==='workdays') {
      while(remaining>0){date+=step*DAY;const weekday=new Date(date).getUTCDay();
        if(weekday===0||weekday===6||(ps.relativeSkipHolidays&&excluded.has(iso(date))))continue;remaining--;}
    }else date+=step*remaining*DAY;
    if(date>=start&&date<=end)activeMarkers.push({id:'print-relative-target',name:ps.relativeLabel||'Relativer Zieltermin',date:iso(date),kind:'relative'});
  }
  const projected={projectName:String(snapshot.name||'Unbenanntes Projekt'),projectId:String(snapshot.id||''),revision:snapshot.revision||0,
    printedAt:new Date().toISOString(),start:iso(start),end:iso(end),rows:inRange,markers:activeMarkers,holidays,
    phases,taskCount:relevant.length,scope,options:structuredClone(options)};
  return frozen(projected);
}
