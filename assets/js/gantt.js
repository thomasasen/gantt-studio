const DAY = 86400000;
const toDate = (s) => new Date(`${s}T00:00:00`);
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * DAY);
const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / DAY);
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

const ZOOM = {
  day: { px: 34, pad: 4 },
  week: { px: 15, pad: 8 },
  month: { px: 6, pad: 16 },
};

function bounds(project) {
  const tasks = project.tasks.filter(t => t.showInGantt !== false && t.start && t.end);
  const dates = tasks.flatMap(t => [t.start, t.end, t.baselineStart, t.baselineEnd]).filter(Boolean);
  const phaseDates = (project.planning?.phases || []).flatMap(p => [p.start, p.end]).filter(Boolean);
  const markerDates = (project.planning?.markers || []).map(m => m.date).filter(Boolean);
  dates.push(...phaseDates, ...markerDates);
  if (!dates.length) {
    const now = new Date();
    return { start: addDays(now, -7), end: addDays(now, 35) };
  }
  const sorted = dates.map(toDate).sort((a,b) => a-b);
  return { start: sorted[0], end: sorted[sorted.length - 1] };
}

function fmtDate(date, options) {
  return new Intl.DateTimeFormat('de-DE', options).format(date);
}

function headerSegments(start, end, px, zoom) {
  const result = { major: [], minor: [] };
  const total = Math.floor((end - start) / DAY) + 1;
  if (zoom === 'day') {
    for (let i=0;i<total;i++) {
      const d = addDays(start, i);
      result.minor.push({ left: i*px, width: px, label: fmtDate(d,{day:'2-digit'}), date:d });
      if (i === 0 || d.getDate() === 1) result.major.push({ left:i*px, width: Math.min((new Date(d.getFullYear(), d.getMonth()+1, 1)-d)/DAY*px, (total-i)*px), label:fmtDate(d,{month:'long',year:'numeric'}) });
    }
  } else if (zoom === 'week') {
    for (let i=0;i<total;i++) {
      const d = addDays(start, i);
      if (i===0 || d.getDay()===1) {
        result.minor.push({ left:i*px, width:Math.min(7*px,(total-i)*px), label:`KW ${weekNumber(d)}`, date:d });
      }
      if (i===0 || d.getDate()<=7) result.major.push({ left:i*px, width:Math.min(31*px,(total-i)*px), label:fmtDate(d,{month:'long',year:'numeric'}) });
    }
  } else {
    for (let i=0;i<total;i++) {
      const d = addDays(start, i);
      if (i===0 || d.getDate()===1) result.minor.push({ left:i*px, width:Math.min(31*px,(total-i)*px), label:fmtDate(d,{month:'short'}), date:d });
      if (i===0 || (d.getMonth()===0 && d.getDate()===1)) result.major.push({ left:i*px, width:Math.min(366*px,(total-i)*px), label:String(d.getFullYear()) });
    }
  }
  return result;
}

function weekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
  return Math.ceil((((date-yearStart)/DAY)+1)/7);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function renderGantt(container, project, options = {}) {
  const tasks = project.tasks.filter(t => t.showInGantt !== false && t.start && t.end);
  container.innerHTML = '';
  if (!tasks.length) return { empty: true };

  const zoom = options.zoom || 'week';
  const cfg = ZOOM[zoom];
  const raw = bounds(project);
  const start = addDays(raw.start, -cfg.pad);
  const end = addDays(raw.end, cfg.pad);
  const totalDays = Math.floor((end-start)/DAY)+1;
  const timelineWidth = Math.max(880, totalDays * cfg.px);
  const leftWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--left-width')) || 430;
  const totalHeight = 56 + tasks.length * 48;

  const grid = el('div','gantt-grid');
  grid.style.gridTemplateColumns = `${leftWidth}px ${timelineWidth}px`;
  grid.style.width = `${leftWidth + timelineWidth}px`;

  const left = el('div','gantt-left');
  const leftHead = el('div','gantt-head-left');
  leftHead.innerHTML = '<span>Aufgabe</span><span>Owner</span><span>Status</span>';
  left.appendChild(leftHead);

  const right = el('div','gantt-right');
  right.style.width = `${timelineWidth}px`;
  right.style.height = `${totalHeight}px`;
  const rightHead = el('div','gantt-head-right');
  const timelineHeader = el('div','timeline-header');
  timelineHeader.style.width = `${timelineWidth}px`;
  const segments = headerSegments(start, end, cfg.px, zoom);
  segments.major.forEach(s => {
    const n = el('div','time-major',s.label); n.style.left=`${s.left}px`; n.style.width=`${s.width}px`; timelineHeader.appendChild(n);
  });
  segments.minor.forEach(s => {
    const n = el('div','time-minor',s.label); n.style.left=`${s.left}px`; n.style.width=`${s.width}px`; timelineHeader.appendChild(n);
  });
  rightHead.appendChild(timelineHeader);
  right.appendChild(rightHead);

  const holidays = new Set((project.planning?.holidays || []).map(h => h.date));
  const settings = project.planning?.settings || {};
  const phases = project.planning?.phases || [];

  tasks.forEach((task, index) => {
    const rowL = el('div','task-row-left');
    rowL.dataset.taskId = task.id;
    const title = el('div','task-title');
    const risk = task.risk && task.risk !== 'none' ? `<span class="risk-dot ${task.risk}"></span>` : '';
    title.innerHTML = `<strong>${risk}${escapeHtml(task.name)}</strong><small>${fmtDate(toDate(task.start),{day:'2-digit',month:'2-digit',year:'2-digit'})} – ${fmtDate(toDate(task.end),{day:'2-digit',month:'2-digit',year:'2-digit'})}${settings.showProgressLabels ? ` · ${clamp(Number(task.progress)||0,0,100)} %` : ''}</small>`;
    rowL.append(title, el('div','owner',settings.showOwners === false ? '' : (task.owner || '—')));
    rowL.appendChild(el('span',`status-pill ${task.status || 'neutral'}`,statusLabel(task.status)));
    left.appendChild(rowL);

    const rowR = el('div','task-row-right');
    rowR.dataset.taskId = task.id;
    rowR.style.width = `${timelineWidth}px`;

    for (let d=0; d<totalDays; d++) {
      const date = addDays(start,d);
      const weekend = [0,6].includes(date.getDay());
      const holiday = holidays.has(iso(date));
      if ((settings.showWeekends !== false && weekend) || (settings.showHolidays !== false && holiday)) {
        const band = el('div',`day-band${weekend?' weekend':''}${holiday?' holiday':''}`);
        band.style.left=`${d*cfg.px}px`; band.style.width=`${cfg.px}px`; rowR.appendChild(band);
      }
    }

    if (settings.showPhaseBands !== false && task.phaseId) {
      const phase = phases.find(p => p.id === task.phaseId);
      if (phase) {
        const p = el('div','phase-band'); p.style.left='0'; p.style.right='0'; p.style.background=phase.color||'#dde7f0'; rowR.appendChild(p);
      }
    }

    const leftPx = daysBetween(iso(start), task.start) * cfg.px;
    const widthPx = Math.max(cfg.px, (daysBetween(task.start,task.end)+1)*cfg.px);
    const bar = el('div',`gantt-bar ${task.type || 'workstream'}`);
    bar.dataset.taskId = task.id; bar.style.left=`${leftPx}px`; bar.style.width=`${widthPx}px`;
    if (settings.showProgressLabels !== false && !['milestone','gate'].includes(task.type)) {
      const prog = el('div','progress-fill'); prog.style.width=`${clamp(Number(task.progress)||0,0,100)}%`; bar.appendChild(prog);
    }
    if (!['milestone','gate'].includes(task.type)) bar.appendChild(el('span','bar-label',task.name));
    rowR.appendChild(bar);

    if (settings.showBaseline !== false && task.baselineStart && task.baselineEnd) {
      const b = el('div','baseline');
      b.style.left=`${daysBetween(iso(start),task.baselineStart)*cfg.px}px`;
      b.style.width=`${Math.max(cfg.px,(daysBetween(task.baselineStart,task.baselineEnd)+1)*cfg.px)}px`;
      rowR.appendChild(b);
    }
    if (settings.showBuffer !== false && Number(task.bufferDays)>0) {
      const b = el('div','buffer');
      b.style.left=`${leftPx+widthPx}px`; b.style.width=`${Number(task.bufferDays)*cfg.px}px`; rowR.appendChild(b);
    }
    right.appendChild(rowR);
  });

  if (settings.showToday !== false) addVerticalLine(right, start, cfg.px, new Date(), 'today-line', 'today-label', 'Heute', timelineWidth, totalHeight);
  (project.planning?.markers || []).forEach(marker => {
    if (!marker.date) return;
    addVerticalLine(right,start,cfg.px,toDate(marker.date),`marker-line ${marker.style === 'solid' ? 'solid' : ''}`,'marker-label',marker.name||'Marker',timelineWidth,totalHeight,marker.color);
  });

  if (settings.showRelativeToday && Number.isFinite(Number(settings.relativeOffsetDays))) {
    const base = new Date();
    const relative = addDays(base, Number(settings.relativeOffsetDays));
    addVerticalLine(right,start,cfg.px,relative,`marker-line ${settings.relativeStyle === 'solid' ? 'solid' : ''}`,'marker-label',settings.relativeLabel||'Relativer Termin',timelineWidth,totalHeight,settings.relativeColor);
  }

  if (settings.showStatusLine !== false) right.appendChild(makeDependencies(tasks,start,cfg.px,timelineWidth,totalHeight));

  grid.append(left,right); container.appendChild(grid);
  return { empty:false, start, end, timelineWidth, leftWidth };
}

function makeDependencies(tasks,start,px,width,height) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('class','dependency-layer'); svg.setAttribute('width',width); svg.setAttribute('height',height-56); svg.setAttribute('viewBox',`0 0 ${width} ${height-56}`);
  svg.innerHTML = '<defs><marker id="arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#657983"/></marker></defs>';
  const map = new Map(tasks.map((t,i)=>[t.id,{task:t,index:i}]));
  tasks.forEach((task,index) => {
    (task.dependencies || []).forEach(depId => {
      const dep = map.get(depId); if (!dep) return;
      const x1=(daysBetween(iso(start),dep.task.end)+1)*px;
      const y1=dep.index*48+24;
      const x2=daysBetween(iso(start),task.start)*px;
      const y2=index*48+24;
      const mid=Math.max(x1+10, x1+(x2-x1)/2);
      const path=document.createElementNS('http://www.w3.org/2000/svg','path');
      path.setAttribute('class','dependency-line'); path.setAttribute('d',`M ${x1} ${y1} H ${mid} V ${y2} H ${Math.max(mid,x2-5)}`); svg.appendChild(path);
    });
  });
  return svg;
}

function addVerticalLine(parent,start,px,date,lineClass,labelClass,label,width,height,color) {
  const pos = Math.floor((new Date(date.getFullYear(),date.getMonth(),date.getDate())-start)/DAY)*px;
  if (pos<0 || pos>width) return;
  const line=el('div',lineClass); line.style.left=`${pos}px`; line.style.top='56px'; line.style.height=`${height-56}px`;
  if (color) line.style.borderLeftColor=color;
  const lab=el('span',labelClass,label); if(color) lab.style.color=color; line.appendChild(lab); parent.appendChild(line);
}

function statusLabel(status) { return ({green:'Grün',amber:'Gelb',red:'Rot',neutral:'Neutral'})[status] || 'Neutral'; }
function escapeHtml(value='') { return String(value).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
