import {isValidIsoDate} from '../../core/date-only.mjs?v=2.8.1';

const DAY=86400000;
function dayNumber(iso){
  if(!isValidIsoDate(iso))throw new RangeError('Invalid calendar date: '+iso);
  const [y,m,d]=iso.split('-').map(Number);
  const date=new Date(0);
  date.setUTCHours(0,0,0,0);
  date.setUTCFullYear(y,m-1,d);
  return date.getTime()/DAY;
}
function dateFromDay(n){
  const d=new Date(n*DAY);
  const iso=[String(d.getUTCFullYear()).padStart(4,'0'),String(d.getUTCMonth()+1).padStart(2,'0'),
    String(d.getUTCDate()).padStart(2,'0')].join('-');
  if(!isValidIsoDate(iso))throw new RangeError('Calendar shift out of range');
  return iso;
}
export function inclusiveDays(start,end){return dayNumber(end)-dayNumber(start)+1;}
export function shiftCalendarDay(iso,delta){return dateFromDay(dayNumber(iso)+delta);}
const unchanged=(before,after)=>['start','end','progress'].every(k=>before[k]===after[k]);

/**
 * Experimental renderer-independent gesture state machine. No Frappe methods,
 * DOM selectors, project mutation or storage side effects in this module.
 * A single pointer owns a gesture; end/cancel/destroy consume it exactly once.
 */
export function createIndependentGesture({emit=()=>{},onPreview=()=>{},onCancel=()=>{}}={}){
  if([emit,onPreview,onCancel].some(fn=>typeof fn!=='function'))throw new TypeError('Callbacks required');
  let active=null,destroyed=false,sequence=0,state='idle';
  const preview=(g,dx)=>{
    const days=Math.round(dx/g.dayWidth);
    const after={...g.before};
    if(g.kind==='move'){
      after.start=shiftCalendarDay(g.before.start,days);
      after.end=shiftCalendarDay(g.before.end,days);
    }else if(g.kind==='resize-left'){
      after.start=shiftCalendarDay(g.before.start,Math.min(days,inclusiveDays(g.before.start,g.before.end)-1));
    }else if(g.kind==='resize-right'){
      after.end=shiftCalendarDay(g.before.end,Math.max(days,1-inclusiveDays(g.before.start,g.before.end)));
    }else if(g.kind==='progress'){
      after.progress=Math.max(0,Math.min(100,Math.round(g.before.progress+100*dx/g.barWidth)));
    }
    return after;
  };
  function cancel(reason='cancelled'){
    if(!active||destroyed)return false;
    const g=active;active=null;state='cancelled';
    onCancel({id:g.id,reason,gestureId:g.gestureId});
    return true;
  }
  return {
    start({task,projectId,revision,pointerId,kind,barWidth}){
      if(destroyed||active||!['move','resize-left','resize-right','progress'].includes(kind)
        ||!task?.id||!projectId||!Number.isSafeInteger(revision)||revision<1
        ||!Number.isSafeInteger(pointerId)||pointerId<0
        ||!Number.isFinite(barWidth)||barWidth<=0)return false;
      const before={start:task.start,end:task.end,progress:task.progress};
      if(!isValidIsoDate(before.start)||!isValidIsoDate(before.end)||before.end<before.start
        ||!Number.isFinite(before.progress)||before.progress<0||before.progress>100)return false;
      const span=inclusiveDays(before.start,before.end);
      active={id:String(task.id),projectId:String(projectId),revision,pointerId,
        kind,barWidth,dayWidth:barWidth/span,before,after:before,dx:0,gestureId:++sequence};
      state='active';return true;
    },
    move(pointerId,dx){
      if(destroyed||!active||pointerId!==active.pointerId||!Number.isFinite(dx))return null;
      try{active.dx=dx;active.after=preview(active,dx);}
      catch(_){cancel('invalid-calendar-range');return null;}
      onPreview({...active.after,id:active.id,kind:active.kind,dx});
      return {...active.after};
    },
    finish(pointerId){
      if(destroyed||!active||active.pointerId!==pointerId)return false;
      const g=active;active=null;
      if(unchanged(g.before,g.after)){state='idle';onCancel({id:g.id,reason:'unchanged'});return false;}
      const intent=Object.freeze({type:'task-change',gestureId:g.gestureId,
        projectId:g.projectId,expectedRevision:g.revision,kind:g.kind,
        before:Object.freeze({...g.before}),
        change:Object.freeze({id:g.id,...g.after})});
      state='committed';emit(intent);return intent;
    },
    cancel, destroy(){if(active)cancel('destroy');destroyed=true;state='destroyed';},
    getState:()=>state,getActive:()=>active&&{id:active.id,pointerId:active.pointerId,
      kind:active.kind,gestureId:active.gestureId},
  };
}
/**
 * Synchronous memory-only compare-and-swap contract for test evidence.
 * No IndexedDB, localStorage or product application wiring.
 */
export function createMemoryRevisionStore(project){
  if(!project?.id||!Array.isArray(project.tasks))throw new TypeError('Project required');
  let current=structuredClone(project);
  current.revision=Number.isSafeInteger(current.revision)&&current.revision>0
    ?current.revision:1;
  const applied=new Set();
  const commit=intent=>{
    if(!intent||intent.type!=='task-change'||!Number.isSafeInteger(intent.gestureId)
      ||intent.gestureId<1)return {ok:false,reason:'invalid'};
    const key=[intent.projectId,intent.expectedRevision,intent.gestureId].join(':');
    if(applied.has(key))return {ok:false,reason:'duplicate'};
    if(intent.projectId!==current.id||intent.expectedRevision!==current.revision)
      return {ok:false,reason:'stale'};
    const index=current.tasks.findIndex(t=>String(t.id)===intent.change?.id);
    if(index<0)return {ok:false,reason:'missing-task'};
    const old=current.tasks[index];
    if(!['start','end','progress'].every(k=>old[k]===intent.before?.[k]))
      return {ok:false,reason:'conflict'};
    const fields=Object.keys(intent.change);
    if(fields.some(f=>!['id','start','end','progress'].includes(f))
      ||!isValidIsoDate(intent.change.start)||!isValidIsoDate(intent.change.end)
      ||intent.change.end<intent.change.start
      ||!Number.isFinite(intent.change.progress)
      ||intent.change.progress<0||intent.change.progress>100)
      return {ok:false,reason:'invalid'};
    if(unchanged(old,intent.change))return {ok:false,reason:'unchanged'};
    const next=structuredClone(current);
    next.tasks[index]={...next.tasks[index],start:intent.change.start,
      end:intent.change.end,progress:intent.change.progress};
    next.revision++;
    current=next;applied.add(key);
    return {ok:true,revision:current.revision};
  };
  return {commit,snapshot:()=>structuredClone(current),
    activate:p=>{if(!p?.id||!Array.isArray(p.tasks))throw new TypeError('Project required');
      current=structuredClone(p);current.revision=current.revision||1;}};
}
