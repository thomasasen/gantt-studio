import {createPrintProjection} from './print-projection.mjs?v=2.9.0';
import {computePrintLayout} from './print-layout.mjs?v=2.9.0';
import {renderPrintPage,renderPrintDocument,printStyles} from './print-renderer.mjs?v=2.9.0';

const KEY='gantt-studio.print-preferences.v1';
const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const defaults=()=>({
  profile:'detailed',paper:'A4',orientation:'auto',margin:10,labelWidth:79,density:'comfortable',
  strategy:'readable',scale:100,fontSize:9,scope:'all',expandCollapsed:true,
  timeframe:'full',startDate:'',endDate:'',quarter:'',sectionPhase:'',taskIds:[],phaseIds:[],
  reportTitle:'',footerNote:'',color:true,header:true,footer:true,legend:true,
  elements:{names:true,owners:true,status:false,progress:true,dates:false,phases:true,
    milestones:true,dependencies:true,baselines:true,buffer:true,today:false,markers:true,
    relative:false,statusLine:false,risk:true,weekends:false,holidays:false}
});
const preset=kind=>{
  const base=defaults();
  if(kind==='management')return {...base,profile:'management',scope:'summary',strategy:'one-page',
    density:'compact',fontSize:9,legend:true,header:true,elements:{...base.elements,owners:false,
      dates:false,dependencies:false,baselines:false,buffer:false,progress:true,risk:true}};
  if(kind==='custom')return {...base,profile:'custom'};
  return base;
};
const field=(id,label,kind,attrs='')=>'<label class="print-field" for="'+id+'"><span>'+label+'</span><'+kind+' id="'+id+'" '+attrs+'></'+kind+'></label>';
const select=(id,label,items)=>field(id,label,'select', 'data-print="'+id.replace('pr-','')+'"') // overwritten below by options
  .replace('</select>',items.map(([value,text])=>'<option value="'+esc(value)+'">'+esc(text)+'</option>').join('')+'</select>');
const controls=[
  ['names','Aufgabenbezeichnungen'],['owners','Verantwortliche'],['status','Status'],
  ['progress','Fortschritt'],['dates','Start- und Enddatum'],['phases','Projektphasen'],
  ['milestones','Meilensteine und Gates'],['dependencies','Abhängigkeiten'],
  ['baselines','Baselines'],['buffer','Puffer'],['today','Heutige-Datum-Linie'],
  ['markers','Stichtage und Marker'],['relative','Relativer Zieltermin'],['statusLine','Statuslinie'],
  ['risk','Risiken'],['weekends','Wochenenden'],['holidays','Feiertage']
];
function optionHTML(){
  return '<div class="print-fields">'+
    select('pr-paper','Papierformat',[['A4','A4'],['A3','A3']])+
    select('pr-orientation','Ausrichtung',[['auto','Automatisch'],['landscape','Querformat'],['portrait','Hochformat']])+
    select('pr-strategy','Skalierung',[['readable','Lesbarkeit optimieren'],['one-page','Eine Seite, falls lesbar'],['fit-width','Gesamte Breite anpassen'],['manual','Manuell']])+
    select('pr-density','Zeilenhöhe',[['comfortable','Komfortabel'],['compact','Kompakt']])+
    '<label class="print-field"><span>Seitenrand (mm)</span><input id="pr-margin" data-print="margin" type="number" min="5" max="25" step="1"></label>'+
    '<label class="print-field"><span>Aufgabenspalte (mm)</span><input id="pr-labelWidth" data-print="labelWidth" type="number" min="48" max="125" step="1"></label>'+
    '<label class="print-field"><span>Schriftgröße (pt)</span><input id="pr-fontSize" data-print="fontSize" type="number" min="8" max="13" step=".5"></label>'+
    '<label class="print-field" id="pr-manual-box"><span>Maßstab (%)</span><input id="pr-scale" data-print="scale" type="number" min="30" max="250" step="10"></label>'+
  '</div>';
}
function checkbox(id,text,checked=false){
  return '<label class="print-checkbox"><input type="checkbox" id="pr-'+id+'" data-print="'+id+'"'+(checked?' checked':'')+'><span>'+esc(text)+'</span></label>';
}
function buildControls(){
  $('printSettings').innerHTML=
    '<section class="print-settings-section"><h3>Profil und Bericht</h3>'+
    '<div class="print-fields">'+select('pr-profile','Druckprofil',[['management','Management-Übersicht'],['detailed','Detaillierter Projektplan'],['custom','Benutzerdefiniert']])+
    '<label class="print-field"><span>Berichtstitel</span><input id="pr-reportTitle" data-print="reportTitle" maxlength="120" placeholder="Projektname verwenden"></label></div>'+
    '<div class="print-save-profile"><input id="printProfileName" maxlength="50" placeholder="Profilname" aria-label="Name für eigenes Druckprofil"><button class="btn small" id="printSaveProfile" type="button">Profil speichern</button></div></section>'+
    '<section class="print-settings-section"><h3>Format und Skalierung</h3>'+optionHTML()+'</section>'+
    '<section class="print-settings-section"><h3>Inhalt und Zeitraum</h3>'+
    '<div class="print-fields">'+
    select('pr-scope','Aufgabenauswahl',[['all','Alle Aufgaben im Diagramm'],['filtered','Aktuelle Filterauswahl'],['summary','Nur Phasen, Meilensteine und Gates'],['phases','Ausgewählte Phasen'],['selected','Einzelne Aufgaben']])+
    select('pr-timeframe','Zeitraum',[['full','Vollständiger Projektzeitraum'],['custom','Benutzerdefiniert'],['month','Aktueller Monat'],['quarter','Ausgewähltes Quartal'],['phase','Projektabschnitt']])+
    '<label class="print-field pr-custom"><span>Von</span><input data-print="startDate" id="pr-startDate" type="date"></label>'+
    '<label class="print-field pr-custom"><span>Bis</span><input data-print="endDate" id="pr-endDate" type="date"></label>'+
    '<label class="print-field pr-quarter"><span>Quartal (JJJJ-Q1 bis Q4)</span><input data-print="quarter" id="pr-quarter" pattern="[0-9]{4}-Q[1-4]" placeholder="2026-Q4"></label>'+
    '<label class="print-field pr-phase"><span>Projektabschnitt</span><select data-print="sectionPhase" id="pr-sectionPhase"></select></label>'+
    '<label class="print-field pr-phases"><span>Phasen (Mehrfachauswahl)</span><select multiple size="5" data-print="phaseIds" id="pr-phaseIds"></select></label>'+
    '<label class="print-field pr-tasks"><span>Aufgaben (Mehrfachauswahl)</span><select multiple size="7" data-print="taskIds" id="pr-taskIds"></select></label>'+
    '</div>'+checkbox('expandCollapsed','Eingeklappte Phasen für den Druck erweitern',true)+'</section>'+
    '<section class="print-settings-section"><h3>Druckbare Elemente</h3><div class="print-checks">'+controls.map(([id,text])=>checkbox(id,text)).join('')+'</div></section>'+
    '<section class="print-settings-section"><h3>Dokumentgestaltung</h3><div class="print-checks">'+
    checkbox('header','Kopfzeile')+checkbox('footer','Fußzeile')+checkbox('legend','Legende')+
    checkbox('color','Farbdruck statt Graustufen')+'</div>'+
    '<label class="print-field"><span>Fußzeilenhinweis</span><input data-print="footerNote" id="pr-footerNote" maxlength="120" placeholder="Optional"></label></section>';
}
function stored(){
  try{const item=JSON.parse(localStorage.getItem(KEY)||'{}');return {last:item.last||defaults(),saved:Array.isArray(item.saved)?item.saved:[]};}
  catch{return {last:defaults(),saved:[]};}
}
function save(store){try{localStorage.setItem(KEY,JSON.stringify(store));}catch{/* private browsing */}}
function optionValue(input){
  if(input.multiple)return Array.from(input.selectedOptions).map(o=>o.value);
  if(input.type==='checkbox')return input.checked;
  if(input.type==='number')return input.value===''?undefined:Number(input.value);
  return input.value;
}
function fill(input,value){
  if(input.multiple){for(const option of input.options)option.selected=(value||[]).map(String).includes(option.value);}
  else if(input.type==='checkbox')input.checked=!!value;
  else input.value=value??'';
}
export function createPrintController(getCurrent) {
  const dialog=$('printDialog'),preview=$('printPreview'),pages=$('printPageCount'),status=$('printStatus');
  const store=stored();let options={...defaults(),...store.last,elements:{...defaults().elements,...store.last.elements}};
  let view=null,snapshot=null,projection=null,layout=null,currentPage=0,zoom=60,queued=false,outputFrame=null;
  buildControls();
  function renderProfileOptions(){
    const node=$('pr-profile'),selected=options.profile;
    node.innerHTML='<option value="management">Management-Übersicht</option><option value="detailed">Detaillierter Projektplan</option><option value="custom">Benutzerdefiniert</option>'+
      store.saved.map(p=>'<option value="saved:'+esc(p.id)+'">'+esc(p.name)+'</option>').join('');
    node.value=selected;if(node.selectedIndex<0)node.value='custom';
  }
  function populateSelections(){
    const phases=snapshot.planning?.phases||[],tasks=snapshot.tasks||[];
    $('pr-sectionPhase').innerHTML=phases.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>').join('');
    $('pr-phaseIds').innerHTML=phases.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>').join('');
    $('pr-taskIds').innerHTML=tasks.filter(t=>t.showInGantt!==false).map(t=>'<option value="'+esc(t.id)+'">'+esc(t.name)+'</option>').join('');
    if(!options.sectionPhase&&phases.length)options.sectionPhase=String(phases[0].id);
  }
  function syncControls(){
    renderProfileOptions();
    for(const input of dialog.querySelectorAll('[data-print]')){
      const key=input.dataset.print;const val=key in options?options[key]:options.elements[key];
      fill(input,val);
    }
    $('pr-manual-box').hidden=options.strategy!=='manual';
    for(const input of dialog.querySelectorAll('.pr-custom'))input.hidden=options.timeframe!=='custom';
    for(const input of dialog.querySelectorAll('.pr-quarter'))input.hidden=options.timeframe!=='quarter';
    for(const input of dialog.querySelectorAll('.pr-phase'))input.hidden=options.timeframe!=='phase';
    for(const input of dialog.querySelectorAll('.pr-phases'))input.hidden=options.scope!=='phases';
    for(const input of dialog.querySelectorAll('.pr-tasks'))input.hidden=options.scope!=='selected';
  }
  function persist(){store.last=structuredClone(options);save(store);}
  function recompute(){
    queued=false;if(!snapshot)return;
    try {
      projection=createPrintProjection(snapshot,options,view);
      layout=computePrintLayout(projection,options);
      currentPage=Math.min(currentPage,layout.pages.length-1);
      const page=layout.pages[currentPage];
      $('printPageNumber').max=layout.pages.length;$('printPageNumber').value=currentPage+1;
      $('printPagePrevious').disabled=currentPage===0;$('printPageNext').disabled=currentPage>=layout.pages.length-1;
      pages.textContent=layout.pages.length+' Druckseite(n) · '+layout.timePages+' Zeitabschnitt(e) · '+layout.rowPages+' Aufgabenabschnitt(e)';
      status.textContent=layout.warnings.join(' ')||'Vollständiger Projektplan. Kein Viewport-Ausschnitt.';
      status.classList.toggle('warning',layout.warnings.length>0);
      const frame=document.createElement('iframe');
      frame.title='Druckvorschau Seite '+page.number;
      frame.className='print-preview-frame';
      frame.style.width=layout.pageWidth+'mm';frame.style.height=layout.pageHeight+'mm';
      frame.style.zoom=zoom+'%';
      frame.srcdoc='<!doctype html><html lang="de"><head><meta charset="utf-8"><style>'+printStyles(layout)+'</style></head><body>'+renderPrintPage(projection,layout,page,options)+'</body></html>';
      preview.replaceChildren(frame);
      $('printExecute').disabled=false;
    }catch(error){
      projection=null;layout=null;preview.textContent='Keine gültige Druckvorschau verfügbar.';
      status.textContent=error.message||'Die Druckvorschau konnte nicht berechnet werden.';
      status.classList.add('warning');pages.textContent='Keine Seiten';$('printExecute').disabled=true;
    }
  }
  function schedule(){if(!queued){queued=true;requestAnimationFrame(recompute);}}
  function handleChange(event){
    const node=event.target,key=node?.dataset?.print;if(!key)return;
    if(key==='profile'){
      const value=node.value;
      if(value.startsWith('saved:')){
        const chosen=store.saved.find(p=>p.id===value.slice(6));if(chosen)options={...defaults(),...structuredClone(chosen.options),profile:value,elements:{...defaults().elements,...chosen.options.elements}};
      }else options=preset(value);
      populateSelections();syncControls();
    }else {
      if(key in options)options[key]=optionValue(node);
      else options.elements[key]=optionValue(node);
      if(key!=='reportTitle'&&key!=='footerNote'&&key!=='profile')options.profile='custom';
      syncControls();
    }
    persist();currentPage=0;schedule();
  }
  function open() {
    const data=getCurrent();
    snapshot=structuredClone(data.project);
    view={filteredTaskIds:data.filteredTaskIds||[],collapsedPhaseIds:data.collapsedPhaseIds||[],sortMode:data.sortMode||'manual'};
    populateSelections();syncControls();currentPage=0;schedule();dialog.showModal();
  }
  function close(){dialog.close();}
  function cleanupFrame(){
    if(outputFrame){outputFrame.remove();outputFrame=null;}
  }
  function output(){
    if(!projection||!layout)return;
    const html=renderPrintDocument(projection,layout,options);
    cleanupFrame();
    const iframe=document.createElement('iframe');
    iframe.title='Gantt-Druckdokument';iframe.setAttribute('aria-hidden','true');
    iframe.style.cssText='position:fixed;left:-10000px;top:0;width:0;height:0;border:0';
    outputFrame=iframe;
    // Assign srcdoc before attaching the iframe: avoid printing the initial
    // about:blank document if that navigation emits its own load event.
    iframe.srcdoc=html;
    iframe.addEventListener('load',()=>{
      if(outputFrame!==iframe)return;
      const win=iframe.contentWindow;
      if(!win)return;
      win.addEventListener('afterprint',cleanupFrame,{once:true});
      try{win.focus();win.print();}catch(error){status.textContent='Browserdruck fehlgeschlagen: '+error.message;cleanupFrame();}
    },{once:true});
    document.body.appendChild(iframe);
    window.setTimeout(()=>{if(outputFrame===iframe)cleanupFrame();},120000);
  }
  $('printClose').addEventListener('click',close);
  dialog.addEventListener('close',()=>{snapshot=null;view=null;projection=null;layout=null;preview.replaceChildren();});
  dialog.addEventListener('change',handleChange);
  dialog.addEventListener('input',event=>{if(event.target?.dataset?.print&&['reportTitle','footerNote','startDate','endDate','quarter'].includes(event.target.dataset.print))handleChange(event);});
  $('printPagePrevious').addEventListener('click',()=>{currentPage=Math.max(0,currentPage-1);schedule();});
  $('printPageNext').addEventListener('click',()=>{currentPage=Math.min(layout?.pages.length-1||0,currentPage+1);schedule();});
  $('printPageNumber').addEventListener('change',()=>{currentPage=Math.max(0,Math.min((layout?.pages.length||1)-1,Number($('printPageNumber').value)-1||0));schedule();});
  $('printPreviewZoom').addEventListener('change',event=>{zoom=Number(event.target.value)||60;if(layout)schedule();});
  $('printExecute').addEventListener('click',output);
  $('printReset').addEventListener('click',()=>{options=defaults();populateSelections();syncControls();persist();currentPage=0;schedule();});
  $('printSaveProfile').addEventListener('click',()=>{
    const name=$('printProfileName').value.trim();if(!name){status.textContent='Bitte einen Namen für das Druckprofil eingeben.';return;}
    const id=crypto.randomUUID(),profile={id,name,options:{...structuredClone(options),profile:'custom'}};
    store.saved.push(profile);if(store.saved.length>20)store.saved.shift();
    options.profile='saved:'+id;persist();renderProfileOptions();$('printProfileName').value='';
    status.textContent='Druckprofil lokal gespeichert.';
  });
  window.addEventListener('beforeunload',cleanupFrame,{once:true});
  return {open,close};
}
