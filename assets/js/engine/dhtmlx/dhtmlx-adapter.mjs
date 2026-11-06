import {mapProjectToDhtmlx,dhtmlxTaskToChange} from './dhtmlx-mapper.mjs';
import {validateEditorIntent} from '../../core/transactional-editor.mjs?v=2.8.1';
const CAPABILITIES=Object.freeze({id:'dhtmlx-community-spike',zoom:Object.freeze(['day','week','month']),
  taskMove:true,resizeStart:true,resizeEnd:true,progress:true,reorder:false,
  keyboardReorder:false,phaseRows:true,baseline:false,buffer:false,markers:true,
  holidays:false,dependencies:true,themes:0,print:false,offline:true});
const SCALES=Object.freeze({
  day:[{unit:'month',step:1,format:'%F %Y'},{unit:'day',step:1,format:'%d'}],
  week:[{unit:'month',step:1,format:'%F %Y'},{unit:'week',step:1,format:'KW %W'}],
  month:[{unit:'year',step:1,format:'%Y'},{unit:'month',step:1,format:'%M'}]
});
/**
 * Experimental only. Every public DHTMLX drag is rolled back inside DHTMLX.
 * A validated intent is emitted only after a verified release; canonical
 * state, revisions, replay protection and persistence are the host's concern.
 */
export function createDhtmlxEngine({diagnosticEditable=false,factory=()=>globalThis.Gantt.getGanttInstance()}={}){
  let host=null,chart=null,project=null,view=null,onIntent=()=>{},onSelect=()=>{},onError=()=>{},onStatus=()=>{};
  let events=[],gesture=null,sequence=0,trace=[],generation=0;
  const record=(type,data={})=>{trace.push({type,...data});if(trace.length>500)trace.shift();};
  const cancel=(reason)=>{
    if(gesture){gesture.cancelled=true;record('cancel',{reason,id:gesture.id});gesture=null;}
  };
  const down=e=>{if(gesture&&e.pointerId!==gesture.pointerId){cancel('second-pointer');}};
  const up=e=>{if(gesture&&e.pointerId===gesture.pointerId){gesture.released=true;record('pointerup',{id:gesture.id});}};
  const escape=e=>{if(e.key==='Escape'){cancel('escape');}};
  const focus=()=>cancel('focus-lost');
  const pointercancel=()=>cancel('pointercancel');
  const clear=()=>{
    cancel('destroy-or-render');generation++;
    if(chart){
      for(const id of events)chart.detachEvent(id);
      events=[];chart.destructor();chart=null;
    }
    if(host)host.replaceChildren();
  };
  const api={
    getCapabilities:()=>CAPABILITIES,
    getTrace:()=>structuredClone(trace),
    mount(options){
      if(host)throw new Error('Already mounted');
      if(!options?.container)throw new TypeError('Missing container');
      host=options.container;onIntent=options.onIntent||(()=>{});onSelect=options.onSelect||(()=>{});
      onError=options.onError||(()=>{});onStatus=options.onStatus||(()=>{});
      window.addEventListener('pointerdown',down,true);
      window.addEventListener('pointerup',up,true);
      window.addEventListener('pointercancel',pointercancel,true);
      window.addEventListener('keydown',escape,true);
      window.addEventListener('blur',focus,true);
    },
    render(request){
      if(!host)throw new Error('Not mounted');
      if(!Object.hasOwn(SCALES,request?.view?.zoom))throw new RangeError('Unsupported zoom');
      clear();project=structuredClone(request.project);view={...request.view};
      const mapped=mapProjectToDhtmlx(project);
      const visibleIds=new Set(mapped.data.filter(t=>t.type!=='project').map(t=>String(t.id)));
      chart=factory();
      if(!chart||typeof chart.init!=='function'||typeof chart.destructor!=='function')throw new Error('DHTMLX instance API missing');
      const g=chart;
      g.config.readonly=!diagnosticEditable;
      g.config.date_format='%Y-%m-%d';
      g.config.duration_unit='day';g.config.duration_step=1;
      g.config.work_time=false;g.config.correct_work_time=false;g.config.skip_off_time=false;
      g.config.auto_scheduling=false;g.config.drag_project=false;g.config.drag_links=false;
      g.config.details_on_dblclick=false;g.config.details_on_create=false;
      g.config.drag_move=!!diagnosticEditable;g.config.drag_resize=!!diagnosticEditable;
      g.config.drag_progress=!!diagnosticEditable;g.config.order_branch=false;
      g.config.scales=SCALES[view.zoom];g.config.min_column_width=view.zoom==='day'?34:70;
      g.config.columns=[{name:'text',label:'Aufgabe / Phase',tree:true,width:210,resize:true}];
      g.config.row_height=38;g.config.bar_height=20;g.config.grid_width=220;
      const event=(name,fn)=>events.push(g.attachEvent(name,fn));
      event('onBeforeLinkAdd',()=>false);
      event('onBeforeTaskMove',()=>false);
      event('onTaskDblClick',()=>false);
      event('onTaskClick',id=>{if(visibleIds.has(String(id)))onSelect({kind:'task',id:String(id)});return true;});
      event('onBeforeTaskDrag',(id,mode,e)=>{
        record('onBeforeTaskDrag',{id:String(id),mode});
        if(!diagnosticEditable||!visibleIds.has(String(id))||gesture)return false;
        const original=project.tasks.find(t=>String(t.id)===String(id));
        if(!original)return false;
        gesture={id:String(id),mode,pointerId:e?.pointerId??1,projectId:project.id,
          revision:project.revision,stamp:generation,gestureId:++sequence,
          before:{start:original.start,end:original.end,progress:original.progress},
          released:false,cancelled:false,pending:null};
        return true;
      });
      event('onTaskDrag',(id,mode,task)=>{
        record('onTaskDrag',{id:String(id),mode});
        if(gesture&&gesture.id===String(id)){
          try{gesture.preview=dhtmlxTaskToChange(task);}catch(error){cancel('invalid-preview');onError(error);}
        }
      });
      event('onBeforeTaskChanged',(id,mode,original)=>{
        record('onBeforeTaskChanged',{id:String(id),mode,released:!!gesture?.released});
        if(gesture&&!gesture.cancelled&&gesture.id===String(id)&&gesture.stamp===generation){
          try{
            const change=dhtmlxTaskToChange(g.getTask(id));
            validateEditorIntent({type:'task-change',change},project,visibleIds);
            if(['start','end','progress'].some(k=>gesture.before[k]!==change[k]))gesture.pending=change;
          }catch(error){record('rejected-change',{message:error.message});onError(error);}
        }
        return false; // Public API: revert ALL vendor mutations; canonical remains authoritative.
      });
      event('onAfterTaskDrag',(id,mode)=>{
        record('onAfterTaskDrag',{id:String(id),mode,released:!!gesture?.released});
        const pending=gesture;gesture=null;
        if(!pending||!pending.released||pending.cancelled||!pending.pending||pending.stamp!==generation)return;
        const intent={type:'task-change',projectId:pending.projectId,
          expectedRevision:pending.revision,gestureId:pending.gestureId,
          kind:mode,before:pending.before,change:pending.pending};
        record('intent',{id:String(id),gestureId:pending.gestureId});
        Promise.resolve(onIntent(intent)).catch(onError);
      });
      const target=document.createElement('div');
      target.style.cssText='height:480px;min-width:0;width:100%';
      target.setAttribute('aria-label','Experimentelles DHTMLX-Gantt');
      host.appendChild(target);
      try{g.init(target);g.parse(mapped);}catch(error){clear();throw error;}
      record('render',{projectId:project.id,revision:project.revision,zoom:view.zoom,tasks:mapped.data.length});
      onStatus('DHTMLX: gerendert');
      return {empty:!mapped.data.length};
    },
    setViewport(next){
      if(next?.zoom&&next.zoom!==view?.zoom)throw new Error('Use render() for zoom change');
      if(!chart)return;
      if(Number.isFinite(next.scrollLeft)||Number.isFinite(next.scrollTop)){
        const pos=chart.getScrollState();
        chart.scrollTo(Number.isFinite(next.scrollLeft)?next.scrollLeft:pos.x,
          Number.isFinite(next.scrollTop)?next.scrollTop:pos.y);
      }
    },
    cancelInteraction:()=>cancel('explicit-cancel'),
    locateMarker:()=>null,
    focusTask(id){if(!chart)return false;return Boolean(chart.isTaskExists(id));},
    destroy(){
      clear();
      if(host){
        window.removeEventListener('pointerdown',down,true);
        window.removeEventListener('pointerup',up,true);
        window.removeEventListener('pointercancel',pointercancel,true);
        window.removeEventListener('keydown',escape,true);
        window.removeEventListener('blur',focus,true);
      }
      host=null;project=null;view=null;
    }
  };
  return api;
}
