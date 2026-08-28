from pathlib import Path

ROOT = Path('.')


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'Patch anchor not found: {label}')
    return text.replace(old, new, 1)

# index.html
p = ROOT / 'index.html'
text = p.read_text(encoding='utf-8')
if 'v=1.4.0' not in text:
    nav_start = text.index('    <section class="studio-nav panel"')
    project_start = text.index('    <section class="project-head panel">')
    nav = text[nav_start:project_start]
    text = text[:nav_start] + text[project_start:]
    metrics = '    <section class="metrics" id="metrics" aria-label="Projektkennzahlen"></section>\n'
    text = replace_once(text, metrics, metrics + '\n' + nav, 'move studio nav')

    pstart = text.index('    <section id="planningView"')
    pend = text.index('  </main>', pstart)
    planning = '''    <section id="planningView" class="studio-view" role="tabpanel" aria-labelledby="planningTabBtn" hidden>
      <section class="planning-page panel">
        <div class="planning-page-head">
          <div>
            <h1>Planung &amp; Darstellung</h1>
            <p>Darstellung, Phasen, Stichtage und Sondertage übersichtlich verwalten.</p>
          </div>
          <div class="planning-cost-card"><span>Gesamtkosten</span><strong id="planningCost">0,00 €</strong></div>
        </div>

        <div class="planning-accordion-stack">
          <details id="displaySection" class="planning-accordion" open>
            <summary><span><strong>Darstellung</strong><small>Linien, Hervorhebungen und Balkeninformationen</small></span><span class="planning-summary-right"><span id="displayActiveCount" class="planning-count-badge">0 von 12 aktiv</span><span class="planning-chevron">⌃</span></span></summary>
            <div class="planning-accordion-body">
              <div class="toggle-list planning-toggle-grid" id="settingsList"></div>
              <section id="relative-today-editor" class="relative-editor">
                <div class="relative-editor-head"><div><h3>Dynamische Zieldatumslinie</h3><p>Zeigt automatisch „Heute plus oder minus X“ und wird bei jedem Öffnen neu berechnet.</p></div><label class="switch-label"><input id="relativeEnabled" type="checkbox"> Linie aktivieren</label></div>
                <div class="relative-editor-grid">
                  <label>Versatz<div class="input-suffix"><input id="relativeOffset" type="number" min="-3650" max="3650" step="1"><span>Tage</span></div></label>
                  <label>Berechnung<select id="relativeMode"><option value="workdays">Arbeitstage</option><option value="calendar">Kalendertage</option></select></label>
                  <label>Zieldatum direkt wählen<input id="relativeTargetDate" type="date"></label>
                  <label>Eigene Bezeichnung<input id="relativeLabel" maxlength="80" placeholder="z. B. Tag 90"></label>
                  <label>Linienfarbe<input id="relativeColor" class="color-wide" type="color"></label>
                  <label>Linienart<select id="relativeStyle"><option value="solid">Durchgezogen</option><option value="dashed">Gestrichelt</option><option value="dotted">Gepunktet</option></select></label>
                </div>
                <label class="relative-skip-row"><input id="relativeSkipHolidays" type="checkbox"> Wochenenden und importierte Feiertage bei Arbeitstagen überspringen</label>
                <div class="relative-result-row"><div><span>Berechnetes Datum</span><strong id="relativeResultText">–</strong></div><button id="relativeJumpBtn" class="btn" type="button">Zur Linie springen</button></div>
              </section>
            </div>
          </details>

          <details id="phaseSection" class="planning-accordion">
            <summary><span><strong>Phasen</strong><small>Beispiel: Analyse, Build, Test oder Go-live</small></span><span class="planning-summary-right"><span id="phaseCountBadge" class="planning-count-badge">0 Phasen</span><span class="planning-chevron">⌄</span></span></summary>
            <div class="planning-accordion-body"><div class="section-title-row"><h3>Phasen verwalten</h3><button class="btn small" id="addPhaseBtn" type="button">+ Phase</button></div><div id="phaseList" class="entity-list"></div></div>
          </details>

          <details id="markerSection" class="planning-accordion">
            <summary><span><strong>Stichtage und Gates</strong><small>Go-live, Freigaben, Termine oder Deadlines</small></span><span class="planning-summary-right"><span id="markerCountBadge" class="planning-count-badge">0 Stichtage</span><span class="planning-chevron">⌄</span></span></summary>
            <div class="planning-accordion-body"><div class="section-title-row"><h3>Stichtage verwalten</h3><button class="btn small" id="addMarkerBtn" type="button">+ Stichtag</button></div><p class="planning-note">Gates bleiben eigenständige Aufgaben vom Typ „Gate“. Diese Liste verwaltet zusätzliche vertikale Stichtagslinien.</p><div id="markerList" class="entity-list"></div></div>
          </details>

          <details id="holidaySection" class="planning-accordion">
            <summary><span><strong>Feiertage und Sondertage</strong><small>Importieren oder einzelne Kalendertage markieren</small></span><span class="planning-summary-right"><span id="holidayCountBadge" class="planning-count-badge">0 Sondertage</span><span class="planning-chevron">⌄</span></span></summary>
            <div class="planning-accordion-body"><div class="section-title-row"><h3>Kalenderausnahmen verwalten</h3><div><button class="btn small" id="importHolidayBtn" type="button">DE importieren</button><button class="btn small" id="addHolidayBtn" type="button">+ Sondertag</button></div></div><div id="holidayList" class="entity-list"></div></div>
          </details>
        </div>
      </section>
    </section>
'''
    text = text[:pstart] + planning + text[pend:]
    text = text.replace('v=1.3.0', 'v=1.4.0')
    p.write_text(text, encoding='utf-8')

# app.js
p = ROOT / 'assets/js/app.js'
text = p.read_text(encoding='utf-8')
if 'showDependencies:true' not in text:
    text = replace_once(text, 'showToday:true,showStatusLine:true,showWeekends:true', 'showToday:true,showStatusLine:true,showDependencies:true,showWeekends:true', 'settings showDependencies')
    text = replace_once(text,
"""  $('relativeLabel').addEventListener('change', updateRelativeSettings);\n  $('relativeOffset').addEventListener('change', updateRelativeSettings);\n""",
"""  for (const id of ['relativeEnabled','relativeOffset','relativeMode','relativeLabel','relativeColor','relativeStyle','relativeSkipHolidays']) {\n    $(id).addEventListener('change', handleRelativeSettingChange);\n  }\n  $('relativeTargetDate').addEventListener('change', handleRelativeTargetDateChange);\n  $('relativeJumpBtn').addEventListener('click', jumpToRelativeLine);\n""", 'relative bindings')

    a = text.index('function renderMetrics() {')
    b = text.index('\nfunction renderLegend()', a)
    text = text[:a] + '''function renderMetrics() {
  const tasks = envelope.project.tasks;
  const milestones = tasks.filter(t => ['milestone','gate'].includes(t.type)).length;
  const progress = tasks.length ? Math.round(tasks.reduce((sum,t)=>sum+(Number(t.progress)||0),0)/tasks.length) : 0;
  const end = tasks.length ? tasks.map(t=>t.end).filter(Boolean).sort().at(-1) : '';
  const metrics = [['Aufgaben',tasks.length],['Meilensteine',milestones],['Fortschritt',`${progress} %`],['Projektende',end?formatDate(end):'–']];
  $('metrics').innerHTML = metrics.map(([label,value])=>`<div class="metric"><span>${label}</span><strong>${value}</strong></div>`).join('');
}
''' + text[b:]

    a = text.index('function renderQuickSettings(){')
    b = text.index('\nfunction openTaskDialog', a)
    text = text[:a] + '''function renderQuickSettings(){
  const labels={showToday:'Heute-Linie',showStatusLine:'Fortschrittslinie',showDependencies:'Abhängigkeiten',showWeekends:'Wochenenden',showHolidays:'Feiertage',showPhaseBands:'Phasenbänder',showBaseline:'Baseline / Soll-Plan',showBuffer:'Pufferzeiten',showRisk:'Risikoindikatoren',showOwners:'Verantwortliche',showProgressLabels:'Fortschritt im Balken',showDateLabels:'Start- und Enddatum'};
  $('quickSettingsList').innerHTML=Object.entries(labels).map(([key,label])=>`<label><input type="checkbox" data-setting="${key}"> <span>${label}</span></label>`).join('');
  syncSettings();
}
''' + text[b:]

    a = text.index('function buildSettings()')
    b = text.index('\nfunction entityRows', a)
    block = r'''function buildSettings() {
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
'''
    text = text[:a] + block + text[b:]
    text = text.replace('<option value="solid">Durchgezogen</option><option value="dashed">Gestrichelt</option></select>', '<option value="solid">Durchgezogen</option><option value="dashed">Gestrichelt</option><option value="dotted">Gepunktet</option></select>', 1)
    p.write_text(text, encoding='utf-8')

# gantt.js
p = ROOT / 'assets/js/gantt.js'
text = p.read_text(encoding='utf-8')
if 'makeStatusLine(tasks' not in text:
    text = replace_once(text, "else{const risk=task.risk&&task.risk!=='none'?`<span class=\"risk-dot ${task.risk}\"></span>`:'';title.innerHTML=`<strong>${risk}${escapeHtml(task.name)}</strong><small>${fmtDate(toDate(task.start),{day:'2-digit',month:'2-digit',year:'2-digit'})} – ${fmtDate(toDate(task.end),{day:'2-digit',month:'2-digit',year:'2-digit'})}${settings.showProgressLabels?` · ${clamp(Number(task.progress)||0,0,100)} %`:''}</small>`;}", "else{const risk=settings.showRisk!==false&&task.risk&&task.risk!=='none'?`<span class=\"risk-dot ${task.risk}\"></span>`:'';title.innerHTML=`<strong>${risk}${escapeHtml(task.name)}</strong><small>${fmtDate(toDate(task.start),{day:'2-digit',month:'2-digit',year:'2-digit'})} – ${fmtDate(toDate(task.end),{day:'2-digit',month:'2-digit',year:'2-digit'})}${settings.showProgressLabels?` · ${clamp(Number(task.progress)||0,0,100)} %`:''}</small>`;}", 'risk setting')
    text = replace_once(text, "    else{if(settings.showProgressLabels!==false&&!['milestone','gate'].includes(task.type)){const prog=el('div','progress-fill');prog.style.width=`${clamp(Number(task.progress)||0,0,100)}%`;bar.appendChild(prog);}if(!['milestone','gate'].includes(task.type))bar.appendChild(el('span','bar-label',task.name));addInteractionHandles(bar,task,settings);}\n", "    else{if(settings.showProgressLabels!==false&&!['milestone','gate'].includes(task.type)){const prog=el('div','progress-fill');prog.style.width=`${clamp(Number(task.progress)||0,0,100)}%`;bar.appendChild(prog);}if(!['milestone','gate'].includes(task.type)){const parts=[task.name];if(settings.showProgressLabels!==false)parts.push(`${clamp(Number(task.progress)||0,0,100)} %`);if(settings.showOwners!==false&&task.owner)parts.push(task.owner);if(settings.showDateLabels!==false)parts.push(`${fmtDate(toDate(task.start),{day:'2-digit',month:'2-digit'})}–${fmtDate(toDate(task.end),{day:'2-digit',month:'2-digit'})}`);bar.appendChild(el('span','bar-label',parts.join(' · ')));}addInteractionHandles(bar,task,settings);}\n", 'bar labels')
    text = replace_once(text, "  if(settings.showToday!==false)addVerticalLine(right,start,cfg.px,new Date(),'today-line','today-label','Heute',timelineWidth,totalHeight);\n  (project.planning?.markers||[]).forEach(marker=>{if(marker.date)addVerticalLine(right,start,cfg.px,toDate(marker.date),`marker-line ${marker.style==='solid'?'solid':''}`,'marker-label',marker.name||'Marker',timelineWidth,totalHeight,marker.color)});\n  if(settings.showRelativeToday&&Number.isFinite(Number(settings.relativeOffsetDays))){const relative=addDays(new Date(),Number(settings.relativeOffsetDays));addVerticalLine(right,start,cfg.px,relative,`marker-line ${settings.relativeStyle==='solid'?'solid':''}`,'marker-label',settings.relativeLabel||'Relativer Termin',timelineWidth,totalHeight,settings.relativeColor);}\n  if(settings.showStatusLine!==false)right.appendChild(makeDependencies(tasks,start,cfg.px,timelineWidth,totalHeight));\n", "  if(settings.showToday!==false)addVerticalLine(right,start,cfg.px,new Date(),'today-line','today-label','Heute',timelineWidth,totalHeight);\n  (project.planning?.markers||[]).forEach(marker=>{if(!marker.date)return;const line=addVerticalLine(right,start,cfg.px,toDate(marker.date),'marker-line','marker-label',marker.name||'Marker',timelineWidth,totalHeight,marker.color);if(line)line.style.borderLeftStyle=marker.style==='solid'?'solid':marker.style==='dotted'?'dotted':'dashed';});\n  if(settings.showRelativeToday&&Number.isFinite(Number(settings.relativeOffsetDays))){const relativeIso=calculateRelativeDate(settings,project.planning?.holidays||[]);const line=addVerticalLine(right,start,cfg.px,toDate(relativeIso),'marker-line relative-today-line','marker-label',`${relativeLabel(settings)} · ${fmtDate(toDate(relativeIso),{day:'2-digit',month:'2-digit',year:'numeric'})}`,timelineWidth,totalHeight,settings.relativeColor);if(line){line.style.borderLeftStyle=settings.relativeStyle==='solid'?'solid':settings.relativeStyle==='dotted'?'dotted':'dashed';line.dataset.relativeTarget=relativeIso;}}\n  if(settings.showDependencies!==false)right.appendChild(makeDependencies(tasks,start,cfg.px,timelineWidth,totalHeight));\n  if(settings.showStatusLine!==false)right.appendChild(makeStatusLine(tasks,start,cfg.px,timelineWidth,totalHeight));\n", 'overlay logic')
    text = replace_once(text, "function addVerticalLine(parent,start,px,date,lineClass,labelClass,label,width,height,color){const utc=new Date(Date.UTC(date.getUTCFullYear?.()??date.getFullYear(),date.getUTCMonth?.()??date.getMonth(),date.getUTCDate?.()??date.getDate()));const pos=Math.floor((utc-start)/DAY)*px;if(pos<0||pos>width)return;const line=el('div',lineClass);line.style.left=`${pos}px`;line.style.top='56px';line.style.height=`${height-56}px`;if(color)line.style.borderLeftColor=color;const lab=el('span',labelClass,label);if(color)lab.style.color=color;line.appendChild(lab);parent.appendChild(line);}\n", "function addVerticalLine(parent,start,px,date,lineClass,labelClass,label,width,height,color){const utc=new Date(Date.UTC(date.getUTCFullYear?.()??date.getFullYear(),date.getUTCMonth?.()??date.getMonth(),date.getUTCDate?.()??date.getDate()));const pos=Math.floor((utc-start)/DAY)*px;if(pos<0||pos>width)return null;const line=el('div',lineClass);line.style.left=`${pos}px`;line.style.top='56px';line.style.height=`${height-56}px`;if(color)line.style.borderLeftColor=color;const lab=el('span',labelClass,label);if(color)lab.style.color=color;line.appendChild(lab);parent.appendChild(line);return line;}\n", 'vertical line return')
    pos = text.index('function statusLabel')
    helpers = '''function calculateRelativeDate(settings,holidays){const offset=Number(settings.relativeOffsetDays)||0,d=new Date(),base=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));if(settings.relativeDayMode!=='workdays'||offset===0){base.setUTCDate(base.getUTCDate()+offset);return iso(base);}const skipHolidays=settings.relativeSkipHolidays!==false,holidaySet=new Set((holidays||[]).map(h=>h.date).filter(Boolean)),step=offset>0?1:-1;let remaining=Math.abs(offset);while(remaining>0){base.setUTCDate(base.getUTCDate()+step);const day=base.getUTCDay(),dateIso=iso(base);if(day!==0&&day!==6&&(!skipHolidays||!holidaySet.has(dateIso)))remaining--;}return iso(base);}\nfunction relativeLabel(settings){if(settings.relativeLabel)return settings.relativeLabel;const n=Number(settings.relativeOffsetDays)||0;if(n===0)return'Heute';return`Heute ${n>0?'+':'−'} ${Math.abs(n)} ${settings.relativeDayMode==='workdays'?'AT':'T'}`;}\nfunction makeStatusLine(tasks,start,px,width,height){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('class','status-line-layer');svg.setAttribute('width',width);svg.setAttribute('height',height-56);svg.setAttribute('viewBox',`0 0 ${width} ${height-56}`);const points=[];tasks.forEach((task,index)=>{if(task.syntheticPhase||!task.start||!task.end)return;const duration=Math.max(1,daysBetween(task.start,task.end)+1),progress=clamp(Number(task.progress)||0,0,100)/100,x=daysBetween(iso(start),task.start)*px+duration*px*progress,y=index*48+24;points.push([x,y]);});if(points.length<2)return svg;const poly=document.createElementNS('http://www.w3.org/2000/svg','polyline');poly.setAttribute('class','status-progress-line');poly.setAttribute('points',points.map(([x,y])=>`${x},${y}`).join(' '));svg.appendChild(poly);points.forEach(([x,y])=>{const dot=document.createElementNS('http://www.w3.org/2000/svg','circle');dot.setAttribute('class','status-progress-dot');dot.setAttribute('cx',x);dot.setAttribute('cy',y);dot.setAttribute('r','2.5');svg.appendChild(dot);});return svg;}\n'''
    text = text[:pos] + helpers + text[pos:]
    p.write_text(text, encoding='utf-8')

# odin.css
p = ROOT / 'assets/css/odin.css'
text = p.read_text(encoding='utf-8')
if 'Odin planning parity v1.4.0' not in text:
    text += r'''
/* Odin planning parity v1.4.0 */
.metrics{grid-template-columns:repeat(4,minmax(0,1fr))}.planning-page-head{display:flex;align-items:center;justify-content:space-between;gap:24px}.planning-cost-card{min-width:150px;border:1px solid var(--border);border-radius:7px;background:#f8fafb;padding:11px 14px}.planning-cost-card span{display:block;color:var(--muted);font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:.7px}.planning-cost-card strong{display:block;margin-top:5px;color:var(--primary);font-size:17px}.planning-accordion-stack{display:grid;gap:10px;padding:14px}.planning-accordion{border:1px solid var(--border);border-radius:7px;background:#fff;overflow:hidden}.planning-accordion>summary{list-style:none;display:flex;align-items:center;justify-content:space-between;gap:20px;padding:12px 14px;cursor:pointer;background:#fff}.planning-accordion>summary::-webkit-details-marker{display:none}.planning-accordion[open]>summary{background:#f8fbf2;border-bottom:1px solid #dfe8ca}.planning-accordion>summary>span:first-child strong,.planning-accordion>summary>span:first-child small{display:block}.planning-accordion>summary>span:first-child strong{font-size:11px;color:var(--primary)}.planning-accordion>summary>span:first-child small{margin-top:2px;color:var(--muted);font-size:8px}.planning-summary-right{display:flex;align-items:center;gap:10px}.planning-count-badge{display:inline-flex;align-items:center;border:1px solid var(--border);border-radius:999px;background:#fff;padding:4px 8px;color:var(--muted);font-size:8px;font-weight:800;white-space:nowrap}.planning-chevron{color:var(--muted);font-size:13px}.planning-accordion[open] .planning-chevron{transform:rotate(180deg)}.planning-accordion-body{padding:14px}.planning-toggle-grid{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px!important}.planning-toggle-grid .toggle-row{display:flex;align-items:center;justify-content:flex-start;gap:8px;margin:0;padding:9px 10px;border:1px solid var(--border);border-radius:5px;background:#fff;color:var(--ink);font-size:9px}.planning-toggle-grid .toggle-row input{width:15px;height:15px;flex:0 0 auto}.relative-editor{margin-top:12px;border:1px solid var(--border);border-radius:7px;background:#fbfcfc;padding:14px;transition:opacity .15s}.relative-editor.inactive .relative-editor-grid,.relative-editor.inactive .relative-skip-row,.relative-editor.inactive .relative-result-row{opacity:.58}.relative-editor-head{display:flex;justify-content:space-between;align-items:flex-start;gap:20px}.relative-editor-head h3{margin:0;color:var(--primary);font-size:11px}.relative-editor-head p{margin:4px 0 0;color:var(--muted);font-size:8px}.switch-label{display:flex!important;align-items:center;gap:7px!important;border:1px solid var(--border);background:#fff;border-radius:5px;padding:7px 9px;color:var(--ink)!important;white-space:nowrap}.relative-editor-grid{display:grid;grid-template-columns:120px 1fr 1fr 1fr 95px 1fr;gap:8px;margin-top:13px}.relative-editor-grid>label{display:grid;gap:5px;color:var(--muted);font-size:8px;font-weight:800}.relative-editor-grid input,.relative-editor-grid select{width:100%;min-width:0}.input-suffix{display:flex;align-items:center;border:1px solid var(--border);border-radius:6px;background:#fff;overflow:hidden}.input-suffix input{border:0;border-radius:0}.input-suffix span{padding:0 8px;color:var(--muted);font-size:8px;border-left:1px solid var(--border)}.color-wide{height:35px;padding:2px!important}.relative-skip-row{display:flex!important;align-items:center;gap:7px!important;margin-top:10px;padding:8px 10px;border:1px solid var(--border);border-radius:5px;background:#fff;color:var(--muted)!important;font-size:8px!important}.relative-result-row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:10px;padding:10px 12px;border:1px solid var(--border);border-radius:6px;background:#fff}.relative-result-row span,.relative-result-row strong{display:block}.relative-result-row span{font-size:7px;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);font-weight:900}.relative-result-row strong{margin-top:3px;color:var(--primary);font-size:10px}.planning-note{margin:0 0 10px;color:var(--muted);font-size:8px;line-height:1.45}.status-line-layer{position:absolute;inset:56px 0 0;z-index:6;pointer-events:none;overflow:visible}.status-progress-line{fill:none;stroke:#c17d00;stroke-width:1.5;stroke-dasharray:5 4;opacity:.82}.status-progress-dot{fill:#c17d00;stroke:#fff;stroke-width:1}.relative-today-line{z-index:10!important}.relative-today-line .marker-label{font-weight:900;background:#fff}@media(max-width:1250px){.planning-toggle-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.relative-editor-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:760px){.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.planning-page-head{align-items:flex-start;flex-direction:column}.planning-cost-card{width:100%}.planning-toggle-grid{grid-template-columns:1fr}.relative-editor-grid{grid-template-columns:1fr}.relative-editor-head{flex-direction:column}.relative-result-row{align-items:flex-start;flex-direction:column}}
'''
    p.write_text(text, encoding='utf-8')

# validate workflow
p = ROOT / '.github/workflows/validate.yml'
if p.exists():
    text = p.read_text(encoding='utf-8').replace('v=1.3.0', 'v=1.4.0').replace('v=1.2.2', 'v=1.4.0')
    anchors = ["grep -q 'Dynamische Zieldatumslinie' index.html", "grep -q 'showDependencies' assets/js/app.js", "grep -q 'makeStatusLine' assets/js/gantt.js"]
    if anchors[0] not in text:
        text += '\n'.join('          ' + x for x in anchors) + '\n'
    p.write_text(text, encoding='utf-8')

# README
p = ROOT / 'README.md'
if p.exists():
    text = p.read_text(encoding='utf-8')
    text = text.replace('## Stand v1.3.0', '## Stand v1.4.0').replace('## Stand v1.2.1', '## Stand v1.4.0')
    marker = '### Planung & Darstellung\n'
    if marker in text and 'Dynamische Zieldatumslinie mit Arbeits- oder Kalendertagen' not in text:
        text = text.replace(marker, marker + '\n- Odin-nahe Akkordeonseite mit Zählern für Darstellung, Phasen, Stichtage/Gates und Sondertage\n- Dynamische Zieldatumslinie mit Arbeits- oder Kalendertagen, direkter Datumsauswahl, eigener Bezeichnung, Farbe und Linienart\n- Arbeitstage können Wochenenden und importierte Feiertage überspringen\n- Fortschrittslinie und Abhängigkeiten sind getrennt schaltbar\n- Gesamtkosten werden in der Planungsansicht separat ausgewiesen\n')
    p.write_text(text, encoding='utf-8')

print('v1.4.0 patch applied')
