import {isValidIsoDate} from '../../core/date-only.mjs?v=2.8.1';
import {shiftCalendarDay} from '../frappe/independent-gesture.mjs?v=2.8.1';

export function dateOnlyToLocalDate(iso){
  if(!isValidIsoDate(iso))throw new RangeError('Invalid ISO calendar day: '+iso);
  const [y,m,d]=iso.split('-').map(Number);
  return new Date(y,m-1,d);
}
export function localDateToDateOnly(date){
  if(!(date instanceof Date)||!Number.isFinite(date.getTime()))throw new TypeError('Expected finite local Date');
  const iso=[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
  if(!isValidIsoDate(iso))throw new RangeError('Out-of-range local date');
  return iso;
}
/** DHTMLX uses exclusive end_date. Project stores YYYY-MM-DD inclusive. */
export function mapProjectToDhtmlx(project){
  if(!project||!Array.isArray(project.tasks))throw new TypeError('Project tasks required');
  const phases=[...(project.planning?.phases||[])].sort((a,b)=>String(a.start).localeCompare(String(b.start)));
  const visible=project.tasks.filter(t=>t.syntheticPhase!==true&&t.showInGantt!==false&&t.start&&t.end);
  const ids=new Set(),data=[],links=[],phasesIds=new Set();
  for(const phase of phases){
    if(!phase.id||phasesIds.has(String(phase.id)))throw new Error('Duplicate phase id');
    const id='phase:'+String(phase.id);
    if(ids.has(id))throw new Error('Phase/task ID collision');
    phasesIds.add(String(phase.id));ids.add(id);
    data.push({id,text:String(phase.name||''),type:'project',open:true,readonly:true});
  }
  for(const task of visible){
    const id=String(task.id||'');
    if(!id||ids.has(id))throw new Error('Duplicate or missing task ID: '+id);
    if(!isValidIsoDate(task.start)||!isValidIsoDate(task.end)||task.end<task.start)
      throw new RangeError('Invalid inclusive interval: '+id);
    ids.add(id);
  }
  for(const task of visible){
    const id=String(task.id);
    const parent=task.phaseId&&phasesIds.has(String(task.phaseId))?'phase:'+String(task.phaseId):0;
    const kind=task.type==='milestone'?'milestone':'task';
    // A milestone is a single point in DHTMLX; the original inclusive end is retained
    // in the canonical project, not silently written back as a zero-duration task.
    data.push({id,parent,text:String(task.name||''),type:kind,
      start_date:dateOnlyToLocalDate(task.start),
      end_date:dateOnlyToLocalDate(shiftCalendarDay(task.end,1)),
      progress:Math.max(0,Math.min(1,(Number(task.progress)||0)/100)),
      studioType:String(task.type||'workstream'),studioDisplayOrder:task.displayOrder??null});
    for(const predecessor of (Array.isArray(task.dependencies)?task.dependencies:[])){
      const source=String(predecessor);
      if(source!==id&&ids.has(source)&&visible.some(t=>String(t.id)===source))
        links.push({id:'link:'+source+':'+id,source,target:id,type:'0'});
    }
  }
  return {data,links};
}
export function dhtmlxTaskToChange(task){
  return {id:String(task.id),start:localDateToDateOnly(task.start_date),
    end:shiftCalendarDay(localDateToDateOnly(task.end_date),-1),
    progress:Math.max(0,Math.min(100,Math.round(Number(task.progress)*100)))};
}
