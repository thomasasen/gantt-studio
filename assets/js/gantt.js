const DAY = 86400000;
const toDate = (s) => new Date(`${s}T00:00:00Z`);
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * DAY);
const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / DAY);
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

const ZOOM = { day:{px:34,pad:4}, week:{px:15,pad:8}, month:{px:6,pad:16} };

function bounds(project) {
  const tasks = project.tasks.filter(t => t.showInGantt !== false && t.start && t.end);
  const dates = tasks.flatMap(t => [t.start,t.end,t.baselineStart,t.baselineEnd]).filter(Boolean);
  const phaseDates = (project.planning?.phases || []).flatMap(p => [p.start,p.end]).filter(Boolean);
  const markerDates = (project.planning?.markers || []).map(m => m.date).filter(Boolean);
  dates.push(...phaseDates,...markerDates);
  if (!dates.length) { const now=new Date(); return {start:addDays(now,-7),end:addDays(now,35)}; }
  const sorted=dates.map(toDate).sort((a,b)=>a-b); return {start:sorted[0],end:sorted.at(-1)};
}
function fmtDate(date,options){return new Intl.DateTimeFormat('de-DE',{...options,timeZone:'UTC'}).format(date);}
function weekNumber(d){const date=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));const dayNum=date.getUTCDay()||7;date.setUTCDate(date.getUTCDate()+4-dayNum);const yearStart=new Date(Date.UTC(date.getUTCFullYear(),0,1));return Math.ceil((((date-yearStart)/DAY)+1)/7);}
function el(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!=null)node.textContent=text;return node;}

function periodWidth(periodStart,periodEnd,rangeStart,rangeEnd,px){
  const visibleStart=periodStart<rangeStart?rangeStart:periodStart;
  const visibleEnd=periodEnd>rangeEnd?rangeEnd:periodEnd;
  return (Math.floor((visibleEnd-visibleStart)/DAY)+1)*px;
}
function headerSegments(start,end,px,zoom){
  const result={major:[],minor:[]};
  if(zoom==='day'){
    const total=Math.floor((end-start)/DAY)+1;
    for(let i=0;i<total;i++){
      const d=addDays(start,i);
      result.minor.push({left:i*px,width:px,label:fmtDate(d,{day:'2-digit'}),date:d});
      if(i===0||d.getUTCDate()===1){
        const monthStart=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1));
        const monthEnd=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0));
        const visibleStart=monthStart<start?start:monthStart;
        result.major.push({left:daysBetween(iso(start),iso(visibleStart))*px,width:periodWidth(monthStart,monthEnd,start,end,px),label:fmtDate(monthStart,{month:'long',year:'numeric'})});
      }
    }
    return result;
  }
  if(zoom==='week'){
    let cursor=new Date(start.getTime());
    while(cursor<=end){
      const weekStart=new Date(cursor.getTime());
      const day=weekStart.getUTCDay()||7;
      const weekEnd=addDays(weekStart,7-day);
      result.minor.push({left:daysBetween(iso(start),iso(weekStart))*px,width:periodWidth(weekStart,weekEnd,start,end,px),label:`KW ${weekNumber(weekStart)}`,date:weekStart});
      cursor=addDays(weekEnd,1);
    }
    let monthCursor=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth(),1));
    while(monthCursor<=end){
      const monthStart=new Date(monthCursor.getTime());
      const monthEnd=new Date(Date.UTC(monthCursor.getUTCFullYear(),monthCursor.getUTCMonth()+1,0));
      const visibleStart=monthStart<start?start:monthStart;
      result.major.push({left:daysBetween(iso(start),iso(visibleStart))*px,width:periodWidth(monthStart,monthEnd,start,end,px),label:fmtDate(monthStart,{month:'long',year:'numeric'})});
      monthCursor=new Date(Date.UTC(monthCursor.getUTCFullYear(),monthCursor.getUTCMonth()+1,1));
    }
    return result;
  }
  let monthCursor=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth(),1));
  while(monthCursor<=end){
    const monthStart=new Date(monthCursor.getTime());
    const monthEnd=new Date(Date.UTC(monthCursor.getUTCFullYear(),monthCursor.getUTCMonth()+1,0));
    const visibleStart=monthStart<start?start:monthStart;
    result.minor.push({left:daysBetween(iso(start),iso(visibleStart))*px,width:periodWidth(monthStart,monthEnd,start,end,px),label:fmtDate(monthStart,{month:'short'}),date:monthStart});
    monthCursor=new Date(Date.UTC(monthCursor.getUTCFullYear(),monthCursor.getUTCMonth()+1,1));
  }
  let yearCursor=new Date(Date.UTC(start.getUTCFullYear(),0,1));
  while(yearCursor<=end){
    const yearStart=new Date(yearCursor.getTime());
    const yearEnd=new Date(Date.UTC(yearCursor.getUTCFullYear(),11,31));
    const visibleStart=yearStart<start?start:yearStart;
    result.major.push({left:daysBetween(iso(start),iso(visibleStart))*px,width:periodWidth(yearStart,yearEnd,start,end,px),label:String(yearCursor.getUTCFullYear())});
    yearCursor=new Date(Date.UTC(yearCursor.getUTCFullYear()+1,0,1));
  }
  return result;
}

export function renderGantt(container, project, options={}) {
  const tasks=project.tasks.filter(t=>t.showInGantt!==false&&t.start&&t.end);container.innerHTML='';if(!tasks.length)return{empty:true};
  const zoom=options.zoom||'week',cfg=ZOOM[zoom],raw=bounds(project),start=addDays(raw.start,-cfg.pad),end=addDays(raw.end,cfg.pad),totalDays=Math.floor((end-start)/DAY)+1,timelineWidth=Math.max(880,totalDays*cfg.px),leftWidth=parseInt(getComputedStyle(document.documentElement).getPropertyValue('--left-width'))||430,totalHeight=56+tasks.length*48;
  const grid=el('div','gantt-grid');grid.style.gridTemplateColumns=`${leftWidth}px ${timelineWidth}px`;grid.style.width=`${leftWidth+timelineWidth}px`;
  const left=el('div','gantt-left'),leftHead=el('div','gantt-head-left');leftHead.innerHTML='<span>Aufgabe</span><span>Owner</span><span>Status</span>';left.appendChild(leftHead);
  const right=el('div','gantt-right');right.style.width=`${timelineWidth}px`;right.style.height=`${totalHeight}px`;const rightHead=el('div','gantt-head-right'),timelineHeader=el('div','timeline-header');timelineHeader.style.width=`${timelineWidth}px`;const segments=headerSegments(start,end,cfg.px,zoom);segments.major.forEach(s=>{const n=el('div','time-major',s.label);n.style.left=`${s.left}px`;n.style.width=`${s.width}px`;timelineHeader.appendChild(n)});segments.minor.forEach(s=>{const n=el('div','time-minor',s.label);n.style.left=`${s.left}px`;n.style.width=`${s.width}px`;timelineHeader.appendChild(n)});rightHead.appendChild(timelineHeader);right.appendChild(rightHead);
  const holidays=new Set((project.planning?.holidays||[]).map(h=>h.date)),settings=project.planning?.settings||{},phases=project.planning?.phases||[];

  tasks.forEach((task,index)=>{
    const synthetic=task.syntheticPhase===true,rowL=el('div',`task-row-left${synthetic?' phase-summary-row':''}`);if(synthetic){rowL.dataset.phaseId=String(task.phaseId);rowL.setAttribute('role','button');rowL.tabIndex=0;rowL.setAttribute('aria-expanded',String(!task.collapsed));rowL.title='Phase ein- oder ausklappen';}else rowL.dataset.taskId=task.id;const title=el('div','task-title');
    if(synthetic){title.innerHTML=`<strong><span class="phase-summary-arrow">${task.collapsed?'▶':'▼'}</span>${escapeHtml(task.name)} <span class="phase-summary-count">${task.taskCount}</span></strong><small>${fmtDate(toDate(task.start),{day:'2-digit',month:'2-digit',year:'2-digit'})} – ${fmtDate(toDate(task.end),{day:'2-digit',month:'2-digit',year:'2-digit'})} · ${clamp(Number(task.progress)||0,0,100)} %</small>`;}
    else{const risk=settings.showRisk!==false&&task.risk&&task.risk!=='none'?`<span class="risk-dot ${task.risk}"></span>`:'';title.innerHTML=`<strong>${risk}${escapeHtml(task.name)}</strong><small>${fmtDate(toDate(task.start),{day:'2-digit',month:'2-digit',year:'2-digit'})} – ${fmtDate(toDate(task.end),{day:'2-digit',month:'2-digit',year:'2-digit'})}${settings.showProgressLabels?` · ${clamp(Number(task.progress)||0,0,100)} %`:''}</small>`;}
    rowL.append(title,el('div','owner',synthetic?`${task.taskCount} Aufgaben`:(settings.showOwners===false?'':(task.owner||'—'))));rowL.appendChild(synthetic?el('span','status-pill phase-pill','Phase'):el('span',`status-pill ${task.status||'neutral'}`,statusLabel(task.status)));left.appendChild(rowL);

    const rowR=el('div',`task-row-right${synthetic?' phase-summary-row':''}`);if(!synthetic)rowR.dataset.taskId=task.id;rowR.style.width=`${timelineWidth}px`;
    for(let d=0;d<totalDays;d++){const date=addDays(start,d),weekend=[0,6].includes(date.getUTCDay()),holiday=holidays.has(iso(date));if((settings.showWeekends!==false&&weekend)||(settings.showHolidays!==false&&holiday)){const band=el('div',`day-band${weekend?' weekend':''}${holiday?' holiday':''}`);band.style.left=`${d*cfg.px}px`;band.style.width=`${cfg.px}px`;rowR.appendChild(band);}}
    if(settings.showPhaseBands!==false&&task.phaseId&&!synthetic){const phase=phases.find(p=>p.id===task.phaseId);if(phase){const p=el('div','phase-band');p.style.left='0';p.style.right='0';p.style.background=phase.color||'#dde7f0';rowR.appendChild(p);}}
    const leftPx=daysBetween(iso(start),task.start)*cfg.px,widthPx=Math.max(cfg.px,(daysBetween(task.start,task.end)+1)*cfg.px),bar=el('div',`gantt-bar ${synthetic?'phase-summary':(task.type||'workstream')}`);if(!synthetic)bar.dataset.taskId=task.id;bar.style.left=`${leftPx}px`;bar.style.width=`${widthPx}px`;if(synthetic){bar.style.background=task.phaseColor||'#DCE8EB';bar.appendChild(el('span','bar-label',`${task.name} · ${task.taskCount} Aufgaben`));}
    else{if(settings.showProgressLabels!==false&&!['milestone','gate'].includes(task.type)){const prog=el('div','progress-fill');prog.style.width=`${clamp(Number(task.progress)||0,0,100)}%`;bar.appendChild(prog);}if(!['milestone','gate'].includes(task.type)){const parts=[task.name];if(settings.showProgressLabels!==false)parts.push(`${clamp(Number(task.progress)||0,0,100)} %`);if(settings.showOwners!==false&&task.owner)parts.push(task.owner);if(settings.showDateLabels!==false)parts.push(`${fmtDate(toDate(task.start),{day:'2-digit',month:'2-digit'})}–${fmtDate(toDate(task.end),{day:'2-digit',month:'2-digit'})}`);bar.appendChild(el('span','bar-label',parts.join(' · ')));}addInteractionHandles(bar,task,settings);}
    rowR.appendChild(bar);
    if(!synthetic&&settings.showBaseline!==false&&task.baselineStart&&task.baselineEnd){const b=el('div','baseline');b.style.left=`${daysBetween(iso(start),task.baselineStart)*cfg.px}px`;b.style.width=`${Math.max(cfg.px,(daysBetween(task.baselineStart,task.baselineEnd)+1)*cfg.px)}px`;rowR.appendChild(b);}
    if(!synthetic&&settings.showBuffer!==false&&Number(task.bufferDays)>0){const b=el('div','buffer');b.style.left=`${leftPx+widthPx}px`;b.style.width=`${Number(task.bufferDays)*cfg.px}px`;rowR.appendChild(b);}
    if(!synthetic)attachInteraction(bar,task,cfg,options);
    right.appendChild(rowR);
  });
  const lineItems=[];
if(settings.showToday!==false)lineItems.push({date:new Date(),lineClass:'today-line',labelClass:'today-label',label:'Heute'});
(project.planning?.markers||[]).forEach(marker=>{if(marker.date)lineItems.push({date:toDate(marker.date),lineClass:'marker-line',labelClass:'marker-label',label:marker.name||'Marker',color:marker.color,style:marker.style});});
if(settings.showRelativeToday&&Number.isFinite(Number(settings.relativeOffsetDays))){
  const relativeIso=calculateRelativeDate(settings,project.planning?.holidays||[]);
  lineItems.push({date:toDate(relativeIso),lineClass:'marker-line relative-today-line',labelClass:'marker-label',label:`${relativeLabel(settings)} · ${fmtDate(toDate(relativeIso),{day:'2-digit',month:'2-digit',year:'numeric'})}`,color:settings.relativeColor,style:settings.relativeStyle,relativeTarget:relativeIso});
}
const labelLanes=[];
lineItems.sort((a,b)=>a.date-b.date).forEach(item=>{
  const line=addVerticalLine(right,start,cfg.px,item.date,item.lineClass,item.labelClass,item.label,timelineWidth,totalHeight,item.color,labelLanes);
  if(!line)return;
  if(item.style)line.style.borderLeftStyle=item.style==='solid'?'solid':item.style==='dotted'?'dotted':'dashed';
  if(item.relativeTarget)line.dataset.relativeTarget=item.relativeTarget;
});
  if(settings.showDependencies!==false)right.appendChild(makeDependencies(tasks,start,cfg.px,timelineWidth,totalHeight));
  if(settings.showStatusLine!==false)right.appendChild(makeStatusLine(tasks,start,cfg.px,timelineWidth,totalHeight));
  grid.append(left,right);container.appendChild(grid);return{empty:false,start,end,timelineWidth,leftWidth};
}

function addInteractionHandles(bar,task,settings){if(['milestone','gate'].includes(task.type))return;const l=el('span','bar-handle left'),r=el('span','bar-handle right');l.title='Start verschieben';r.title='Ende verschieben';bar.append(l,r);if(settings.showProgressLabels!==false){const h=el('span','progress-handle');h.style.left=`${clamp(Number(task.progress)||0,0,100)}%`;h.title='Fortschritt anpassen';bar.appendChild(h);}}
function attachInteraction(bar,task,cfg,options){if(typeof options.onTaskChange!=='function')return;bar.addEventListener('pointerdown',e=>{if(e.button!==0)return;const target=e.target,mode=target.classList.contains('progress-handle')?'progress':target.classList.contains('left')?'resize-left':target.classList.contains('right')?'resize-right':'move';e.preventDefault();e.stopPropagation();const startX=e.clientX,origLeft=parseFloat(bar.style.left)||0,origWidth=parseFloat(bar.style.width)||cfg.px;bar.setPointerCapture(e.pointerId);bar.classList.add('dragging');let moved=false;
    const onMove=ev=>{const dx=ev.clientX-startX;if(Math.abs(dx)>2)moved=true;if(mode==='move')bar.style.left=`${origLeft+dx}px`;else if(mode==='resize-left'){const max=origWidth-cfg.px,used=clamp(dx,-999999,max);bar.style.left=`${origLeft+used}px`;bar.style.width=`${origWidth-used}px`;}else if(mode==='resize-right'){bar.style.width=`${Math.max(cfg.px,origWidth+dx)}px`;}else{const rect=bar.getBoundingClientRect(),pct=clamp((ev.clientX-rect.left)/rect.width*100,0,100);target.style.left=`${pct}%`;const fill=bar.querySelector('.progress-fill');if(fill)fill.style.width=`${pct}%`;}};
    const onUp=async ev=>{bar.removeEventListener('pointermove',onMove);bar.removeEventListener('pointerup',onUp);bar.removeEventListener('pointercancel',onUp);bar.classList.remove('dragging');if(!moved&&mode!=='progress')return;window.__ganttDragUntil=Date.now()+350;const change={id:task.id};if(mode==='move'){const delta=Math.round(((parseFloat(bar.style.left)||origLeft)-origLeft)/cfg.px);change.start=iso(addDays(toDate(task.start),delta));change.end=iso(addDays(toDate(task.end),delta));}else if(mode==='resize-left'){const delta=Math.round(((parseFloat(bar.style.left)||origLeft)-origLeft)/cfg.px);const candidate=iso(addDays(toDate(task.start),delta));change.start=candidate>task.end?task.end:candidate;}else if(mode==='resize-right'){const days=Math.max(1,Math.round((parseFloat(bar.style.width)||origWidth)/cfg.px));change.end=iso(addDays(toDate(task.start),days-1));}else{const rect=bar.getBoundingClientRect();change.progress=clamp((ev.clientX-rect.left)/rect.width*100,0,100);}await options.onTaskChange(change);};
    bar.addEventListener('pointermove',onMove);bar.addEventListener('pointerup',onUp);bar.addEventListener('pointercancel',onUp);
  });}

function makeDependencies(tasks,start,px,width,height){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('class','dependency-layer');svg.setAttribute('width',width);svg.setAttribute('height',height-56);svg.setAttribute('viewBox',`0 0 ${width} ${height-56}`);svg.innerHTML='<defs><marker id="arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#657983"/></marker></defs>';const map=new Map(tasks.map((t,i)=>[t.id,{task:t,index:i}]));tasks.forEach((task,index)=>{if(task.syntheticPhase)return;(task.dependencies||[]).forEach(depId=>{const dep=map.get(depId);if(!dep||dep.task.syntheticPhase)return;const x1=(daysBetween(iso(start),dep.task.end)+1)*px,y1=dep.index*48+24,x2=daysBetween(iso(start),task.start)*px,y2=index*48+24,mid=Math.max(x1+10,x1+(x2-x1)/2),path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('class','dependency-line');path.setAttribute('d',`M ${x1} ${y1} H ${mid} V ${y2} H ${Math.max(mid,x2-5)}`);svg.appendChild(path);});});return svg;}
function addVerticalLine(parent,start,px,date,lineClass,labelClass,label,width,height,color,labelLanes=[]){
  const utc=new Date(Date.UTC(date.getUTCFullYear?.()??date.getFullYear(),date.getUTCMonth?.()??date.getMonth(),date.getUTCDate?.()??date.getDate()));
  const pos=Math.floor((utc-start)/DAY)*px;
  if(pos<0||pos>width)return null;
  const line=el('div',lineClass);
  line.style.left=`${pos}px`;line.style.top='56px';line.style.height=`${height-56}px`;
  if(color)line.style.borderLeftColor=color;
  const lab=el('span',labelClass,label);
  if(color)lab.style.color=color;
  const approxWidth=Math.min(220,Math.max(72,String(label).length*6+18));
  let lane=0;
  while(lane<labelLanes.length&&pos<labelLanes[lane]+18)lane++;
  lane=Math.min(lane,2);
  labelLanes[lane]=Math.max(labelLanes[lane]||0,pos+approxWidth);
  lab.style.top=`${4+lane*15}px`;
  lab.style.maxWidth=`${approxWidth}px`;
  line.appendChild(lab);parent.appendChild(line);return line;
}
function calculateRelativeDate(settings,holidays){const offset=Number(settings.relativeOffsetDays)||0,d=new Date(),base=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));if(settings.relativeDayMode!=='workdays'||offset===0){base.setUTCDate(base.getUTCDate()+offset);return iso(base);}const skipHolidays=settings.relativeSkipHolidays!==false,holidaySet=new Set((holidays||[]).map(h=>h.date).filter(Boolean)),step=offset>0?1:-1;let remaining=Math.abs(offset);while(remaining>0){base.setUTCDate(base.getUTCDate()+step);const day=base.getUTCDay(),dateIso=iso(base);if(day!==0&&day!==6&&(!skipHolidays||!holidaySet.has(dateIso)))remaining--;}return iso(base);}
function relativeLabel(settings){if(settings.relativeLabel)return settings.relativeLabel;const n=Number(settings.relativeOffsetDays)||0;if(n===0)return'Heute';return`Heute ${n>0?'+':'−'} ${Math.abs(n)} ${settings.relativeDayMode==='workdays'?'AT':'T'}`;}
function makeStatusLine(tasks,start,px,width,height){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('class','status-line-layer');svg.setAttribute('width',width);svg.setAttribute('height',height-56);svg.setAttribute('viewBox',`0 0 ${width} ${height-56}`);const points=[];tasks.forEach((task,index)=>{if(task.syntheticPhase||!task.start||!task.end)return;const duration=Math.max(1,daysBetween(task.start,task.end)+1),progress=clamp(Number(task.progress)||0,0,100)/100,x=daysBetween(iso(start),task.start)*px+duration*px*progress,y=index*48+24;points.push([x,y]);});if(points.length<2)return svg;const poly=document.createElementNS('http://www.w3.org/2000/svg','polyline');poly.setAttribute('class','status-progress-line');poly.setAttribute('points',points.map(([x,y])=>`${x},${y}`).join(' '));svg.appendChild(poly);points.forEach(([x,y])=>{const dot=document.createElementNS('http://www.w3.org/2000/svg','circle');dot.setAttribute('class','status-progress-dot');dot.setAttribute('cx',x);dot.setAttribute('cy',y);dot.setAttribute('r','2.5');svg.appendChild(dot);});return svg;}
function statusLabel(status){return({green:'Grün',amber:'Gelb',red:'Rot',neutral:'Neutral'})[status]||'Neutral';}
function escapeHtml(value=''){return String(value).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
