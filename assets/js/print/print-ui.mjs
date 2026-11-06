import { PRINT_DEFAULTS, sanitizePrintSettings, projectForPrint, paginatePrint, days, add } from './print-model.mjs?v=2.9.0';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = s => new Intl.DateTimeFormat('de-DE',{timeZone:'UTC',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(s+'T00:00:00Z'));
const choices = (key,label,values,s) => '<label><span>'+label+'</span><select data-print="'+key+'">'+values.map(([k,v])=>'<option value="'+k+'"'+(s[key]===k?' selected':'')+'>'+v+'</option>').join('')+'</select></label>';
const numeric = (key,label,s,min,max) => '<label><span>'+label+'</span><input type="number" min="'+min+'" max="'+max+'" data-print="'+key+'" value="'+s[key]+'"></label>';
const toggle = (key,label,s) => '<label class="print-toggle"><input type="checkbox" data-print="'+key+'"'+(s[key]?' checked':'')+'><span>'+label+'</span></label>';
function fields(s,project){
 return '<div class="print-fields">'+
 choices('profile','Profil',[['management','Management'],['detail','Detaillierter Projektplan'],['custom','Benutzerdefiniert']],s)+
 choices('strategy','Skalierung',[['one','Eine Seite'],['fitWidth','Breite anpassen'],['readable','Lesbarkeit optimieren'],['manual','Manuell']],s)+
 choices('paper','Papierformat',[['A4','A4'],['A3','A3']],s)+
 choices('orientation','Ausrichtung',[['auto','Automatisch'],['portrait','Hochformat'],['landscape','Querformat']],s)+
 choices('scope','Aufgaben',[['all','Alle Gantt-Aufgaben'],['filtered','Aktuelle Filterauswahl'],['milestones','Meilensteine / Gates'],['phases','Ausgewählte Phasen'],['selected','Ausgewählte Aufgaben']],s)+
 choices('range','Zeitraum',[['full','Projektgrenzen'],['custom','Datumsbereich'],['month','Aktueller Monat'],['quarter','Aktuelles Quartal']],s)+
 '<label><span>Von</span><input type="date" data-print="from" value="'+escape(s.from)+'"></label>'+
 '<label><span>Bis</span><input type="date" data-print="to" value="'+escape(s.to)+'"></label>'+
 numeric('margin','Rand (mm)',s,5,30)+numeric('labelWidth','Aufgabenspalte (mm)',s,32,100)+
 numeric('rowHeight','Zeilenhöhe (mm)',s,6,16)+numeric('fontSize','Schrift (pt)',s,7,14)+
 numeric('scale','Zeitskala (%)',s,30,200)+
 '<label><span>Berichtstitel</span><input type="text" data-print="title" maxlength="120" value="'+escape(s.title)+'"></label></div>'+
 '<fieldset class="print-toggles"><legend>Inhalte</legend>'+
 [['names','Aufgabennamen'],['owners','Verantwortliche'],['status','Status'],['progress','Fortschritt'],['dates','Datumsangaben'],['phases','Phasen'],['milestones','Meilensteine und Gates'],['baseline','Baselines'],['markers','Marker'],['dependencies','Abhängigkeiten'],['buffers','Puffer'],['risks','Risiken'],['weekends','Wochenenden'],['holidays','Feiertage'],['today','Heute-Linie'],['expandCollapsed','Eingeklappte Phasen erweitern'],['legend','Legende'],['header','Kopfzeile'],['footer','Fußzeile'],['color','Farben']].map(([k,v])=>toggle(k,v,s)).join('')+'</fieldset>'+selectionFields(s,project);
}
function selectionFields(s,project){
 if(!project||!['phases','selected'].includes(s.scope))return '';
 const phases=project.planning?.phases||[];
 const items=s.scope==='phases'?phases:project.tasks.filter(t=>t.showInGantt!==false);
 const key=s.scope==='phases'?'selectedPhaseIds':'selectedTaskIds';
 const chosen=new Set(s[key]);
 const checkboxes=items.map(item=>'<label class="print-selection-item"><input data-print-select="'+key+'" type="checkbox" value="'+escape(String(item.id))+'"'+(chosen.has(String(item.id))?' checked':'')+'><span>'+escape(item.name||item.id)+'</span></label>').join('');
 return '<fieldset class="print-selection"><legend>'+(s.scope==='phases'?'Phasen auswählen':'Aufgaben auswählen')+'</legend><div class="print-selection-list">'+checkboxes+'</div></fieldset>';
}
const sheetCss = [
 '*,*:before,*:after{box-sizing:border-box}body{margin:0;background:#e9edf0;color:#253746;font:12px system-ui,sans-serif}',
 '.pages{display:grid;justify-content:center;gap:18px;padding:20px}.sheet{position:relative;background:#fff;overflow:hidden;box-shadow:0 4px 18px #20304022;break-after:page}',
 '.inside{position:absolute;overflow:hidden}.title{font-size:13pt;font-weight:700;border-bottom:.2mm solid #bdcbd4;padding-bottom:2mm}',
 '.meta{font-size:8pt;margin:2mm 0 3mm;display:flex;justify-content:space-between;color:#516b79}',
 'table{border-collapse:collapse;table-layout:fixed;width:100%}th{background:#eaf1f5;text-align:left;font-size:8pt;padding:1mm 2mm;border:.2mm solid #cdd8df;vertical-align:top}',
 'td{border-bottom:.2mm solid #e0e7eb;height:var(--row-height);padding:1mm;white-space:normal;overflow-wrap:anywhere;overflow:hidden;font-size:var(--font-size)}tr.phase{background:#edf3f6;font-weight:700}',
 'td.gantt{padding:0}svg{display:block;width:100%;height:8mm}small{display:block;color:#647884;font-size:7pt}',
 '.footer{position:absolute;bottom:0;left:0;right:0;border-top:.2mm solid #ccd8df;padding-top:2mm;display:flex;justify-content:space-between;font-size:8pt;color:#516b79}',
 '.legend{margin-top:3mm;font-size:8pt;color:#516b79}',
 '@media print{body{background:#fff!important}.pages{display:block;padding:0;gap:0}.sheet{margin:0;box-shadow:none;break-after:page;page-break-after:always}.sheet:last-child{break-after:auto;page-break-after:auto}@page{margin:0}}'
].join('');
function timeHeader(page,layout){
 const span=days(page.from,page.to)+1;
 const step=Math.max(1,Math.ceil(17/layout.mmPerDay));
 let ticks='';
 for(let day=0;day<span;day+=step){
  const date=add(page.from,day),x=day*layout.mmPerDay;
  ticks+='<line x1="'+x+'" x2="'+x+'" y1="0" y2="8" stroke="#bdcdd5" stroke-width=".2"/>';
  ticks+='<text x="'+(x+.8)+'" y="5.1" font-size="2.8" fill="#425c6b">'+escape(fmt(date))+'</text>';
 }
 return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+layout.timeW+' 8" preserveAspectRatio="none">'+ticks+'</svg>';
}
function timeline(row,page,layout,s){
 const span=days(page.from,page.to)+1, width=layout.timeW, unit=layout.mmPerDay;
 let shapes='';
 if(s.weekends)for(let i=0;i<span;i++){const day=new Date(add(page.from,i)+'T00:00:00Z').getUTCDay();if(day===0||day===6)shapes+='<rect x="'+i*unit+'" y="0" width="'+unit+'" height="8" fill="#f0f2f4"/>';}
 const start=days(page.from,row.start),end=days(page.from,row.end)+1, l=Math.max(0,start),r=Math.min(span,end);
 const color=s.color?(row.type==='critical'?'#a34b42':row.type==='phase-summary'?'#c2dbe6':row.type==='milestone'?'#94703a':row.type==='gate'?'#795a9a':'#286c83'):'#667783';
 if(r>l){
  if(row.type==='milestone'||row.type==='gate'){const x=Math.min(width-2,Math.max(2,start*unit));shapes+='<path d="M '+x+' 1 L '+(x+2)+' 4 L '+x+' 7 L '+(x-2)+' 4 Z" fill="'+color+'"/>';}
  else{const x=l*unit,w=(r-l)*unit;shapes+='<rect x="'+x+'" y="2" width="'+w+'" height="4" rx=".5" fill="'+color+'"/>';if(s.progress&&Number(row.progress)>0)shapes+='<rect x="'+x+'" y="2" width="'+w*Math.min(100,Number(row.progress))/100+'" height="4" fill="#15384c" opacity=".45"/>';}
 }
 if(s.baseline&&row.baselineStart&&row.baselineEnd){const a=Math.max(0,days(page.from,row.baselineStart))*unit,b=Math.min(span,days(page.from,row.baselineEnd)+1)*unit;if(b>a)shapes+='<rect x="'+a+'" y="7" width="'+(b-a)+'" height=".7" fill="#687b87"/>';}
 if(s.markers)for(const marker of page.markers){const x=days(page.from,marker.date)*unit;shapes+='<line x1="'+x+'" y1="0" x2="'+x+'" y2="8" stroke="#a77d35" stroke-width=".35" stroke-dasharray="1 1"/>';}
 return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+width+' 8" preserveAspectRatio="none">'+shapes+'</svg>';
}
export function printHtml(projection,layout){
 const s=projection.settings;
 const sheets=layout.pages.map(page=>{
  const markers=projection.markers.filter(m=>m.date>=page.from&&m.date<=page.to);
  const p={...page,markers};
  const headers='<thead><tr><th style="width:'+layout.labelW+'mm">Aufgabe</th><th>Zeitraum '+escape(fmt(page.from))+' – '+escape(fmt(page.to))+timeHeader(page,layout)+'</th></tr></thead>';
  const body=page.rows.map((row,rowIndex)=>{
   let label=s.names?escape(row.name):escape(row.id);
   if(s.owners&&row.owner)label+='<small>'+escape(row.owner)+'</small>';
   if(s.status&&row.status&&row.status!=='neutral')label+=' ['+escape(row.status)+']';
   if(s.dates)label+='<small>'+escape(fmt(row.start))+' – '+escape(fmt(row.end))+'</small>';
   return '<tr style="height:'+page.rowHeights[rowIndex]+'mm"'+(row.type==='phase-summary'?' class="phase"':'')+'><td>'+label+'</td><td class="gantt">'+timeline(row,p,layout,s)+'</td></tr>';
  }).join('');
  return '<section class="sheet" style="width:'+layout.w+'mm;height:'+layout.h+'mm;--row-height:'+layout.rowHeight+'mm;--font-size:'+s.fontSize+'pt"><div class="inside" style="left:'+s.margin+'mm;top:'+s.margin+'mm;width:'+layout.usableW+'mm;height:'+layout.usableH+'mm">'+
  (s.header?'<div class="title">'+escape(s.title||projection.name)+'</div><div class="meta"><span>'+escape(fmt(projection.from))+' – '+escape(fmt(projection.to))+'</span><span>Projektplan · Revision '+escape(projection.revision||'–')+'</span></div>':'')+
  '<table><colgroup><col style="width:'+layout.labelW+'mm"><col></colgroup>'+headers+'<tbody>'+body+'</tbody></table>'+
  (s.legend?'<div class="legend">■ Aufgabe　◆ Meilenstein / Gate　━ Baseline</div>':'')+
  (s.footer?'<div class="footer"><span>'+escape(projection.name)+'</span><span>Abschnitt '+page.x+'/'+layout.horizontal+' · '+page.y+'/'+layout.vertical+' | Seite '+page.index+'/'+layout.pageCount+'</span></div>':'')+
  '</div></section>';
 }).join('');
 return '<!doctype html><html lang="de"><head><meta charset="utf-8"><style>'+sheetCss+'@page{size:'+layout.w+'mm '+layout.h+'mm;margin:0}</style></head><body><main class="pages">'+sheets+'</main></body></html>';
}
export function createPrintController({getProject,getContext,onError=console.error}){
 const dialog=document.createElement('dialog');dialog.className='print-dialog';dialog.id='printPdfDialog';
 dialog.innerHTML='<header class="print-dialog-head"><div><h2>Drucken &amp; PDF</h2><p>Vollständiger Projektzeitplan, unabhängig vom sichtbaren Ausschnitt</p></div><button class="btn" type="button" data-print-close>Schließen</button></header>'+
 '<div class="print-dialog-body"><aside class="print-controls"><div id="printOptions"></div><div class="print-actions"><button class="btn" type="button" data-print-reset>Zurücksetzen</button><button class="btn primary" type="button" data-print-output>Drucken / PDF speichern</button></div></aside>'+
 '<section class="print-preview" aria-label="Druckvorschau"><div class="print-preview-head"><strong id="printCount"></strong><span id="printWarning" role="status"></span></div><iframe title="Mehrseitige Druckvorschau" id="printFrame"></iframe></section></div>';
 document.body.append(dialog);
 const options=dialog.querySelector('#printOptions'),frame=dialog.querySelector('#printFrame'),storageKey='gantt-studio.print-preferences-v1';
 let settings={...PRINT_DEFAULTS},snapshot,contextSnapshot,html='',pending=null;
 const update=()=>{
  try{
   const projection=projectForPrint(snapshot,settings,contextSnapshot);
   const layout=paginatePrint(projection);
   html=printHtml(projection,layout);
   frame.srcdoc=html;
   dialog.querySelector('#printCount').textContent=layout.pageCount+' Seiten · '+layout.horizontal+' Zeitabschnitte × '+layout.vertical+' Aufgabenabschnitte';
   dialog.querySelector('#printWarning').textContent=layout.warnings.join(' ');
  }catch(error){onError(error);dialog.querySelector('#printWarning').textContent='Fehler beim Erstellen der Druckseiten.';}
 };
 const draw=()=>{options.innerHTML=fields(settings,snapshot);update();};
 const persist=()=>{try{localStorage.setItem(storageKey,JSON.stringify(settings));}catch{/* preferences are optional */}};
 options.addEventListener('change',event=>{
  const selected=event.target.closest('[data-print-select]');
  if(selected){const key=selected.dataset.printSelect,ids=new Set(settings[key]);if(selected.checked)ids.add(selected.value);else ids.delete(selected.value);settings=sanitizePrintSettings({...settings,[key]:[...ids]});persist();update();return;}
  const el=event.target.closest('[data-print]');if(!el)return;
  const key=el.dataset.print,value=el.type==='checkbox'?el.checked:el.type==='number'?Number(el.value):el.value;
  if(key==='profile'){
   settings={...settings,profile:value};
   if(value==='management')settings={...settings,scope:'milestones',strategy:'fitWidth',legend:true,rowHeight:8};
   if(value==='detail')settings={...settings,scope:'all',strategy:'readable',rowHeight:9};
  }else settings={...settings,[key]:value};
  settings=sanitizePrintSettings(settings);persist();draw();
 });
 dialog.querySelector('[data-print-close]').addEventListener('click',()=>dialog.close());
 dialog.querySelector('[data-print-reset]').addEventListener('click',()=>{settings={...PRINT_DEFAULTS};persist();draw();});
 dialog.querySelector('[data-print-output]').addEventListener('click',()=>{
  if(!html)return;
  if(pending){pending.remove();pending=null;}
  const iframe=document.createElement('iframe');iframe.title='Druckdokument';iframe.style.cssText='position:fixed;left:-10000px;top:0;opacity:0;width:1px;height:1px;border:0;';
  pending=iframe;document.body.append(iframe);
  iframe.addEventListener('load',()=>{try{iframe.contentWindow.addEventListener('afterprint',()=>{iframe.remove();if(pending===iframe)pending=null;},{once:true});iframe.contentWindow.focus();iframe.contentWindow.print();}catch(error){onError(error);iframe.remove();}},{once:true});
  iframe.srcdoc=html;
 });
 dialog.addEventListener('close',()=>{snapshot=null;contextSnapshot=null;html='';frame.removeAttribute('srcdoc');if(pending){pending.remove();pending=null;}});
 return {open(){
  if(dialog.open)return;
  snapshot=JSON.parse(JSON.stringify(getProject()));
  contextSnapshot=JSON.parse(JSON.stringify(getContext()));
  try{settings=sanitizePrintSettings(JSON.parse(localStorage.getItem(storageKey)||'{}'));}catch{settings={...PRINT_DEFAULTS};}
  draw();dialog.showModal();
 },destroy(){if(dialog.open)dialog.close();dialog.remove();}};
}
