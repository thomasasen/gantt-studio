import {createFrappeGestureGate} from '../../assets/js/engine/frappe/frappe-gesture-gate.mjs?v=2.8.1';
import {mapFrappeDateChange} from '../../assets/js/engine/frappe/frappe-task-mapper.mjs?v=2.8.1';

// Disposable browsing context; no production storage or app integration.
const CHANNEL='gantt-studio-frappe-isolated-v1';
let initialized=false,activeGate=null,activeGeneration=null,activeSession=null;
function reply(type,payload={}) {
  window.parent.postMessage({
    channel:CHANNEL,type,generation:activeGeneration,session:activeSession,...payload
  },location.origin);
}
window.addEventListener('pagehide',()=>activeGate?.destroy());
window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==window.parent)return;
  const data=event.data;
  if(!data||data.channel!==CHANNEL)return;
  if(data.type==='cancel'&&initialized
      &&data.generation===activeGeneration&&data.session===activeSession){
    activeGate?.cancel();
    return;
  }
  if(initialized||data.type!=='render'
      || !Number.isSafeInteger(data.generation)
      || typeof data.session!=='string'||data.session.length<16)return;
  initialized=true;
  const generation=data.generation;
  activeGeneration=generation;
  activeSession=data.session;
  try{
    if(typeof globalThis.Gantt!=='function')throw new Error('Local Frappe UMD missing');
    const editable=data.experimentalEditable===true;
    const tasks=structuredClone(data.tasks);
    const root=document.getElementById('chart');
    const gate=createFrappeGestureGate({
      emit:(intent,gestureId)=>reply('intent',{gestureId,intent}),
      rollback:()=>reply('cancelled'),
      onError:error=>reply('error',{message:error?.message||String(error)})
    });
    activeGate=gate;
    if(editable){
      let pointerId=1;
      root.addEventListener('pointerdown',e=>{
        if(e.isPrimary===false||e.button!==0)return;
        const wrapper=e.target?.closest?.('.bar-wrapper');
        if(!wrapper)return;
        pointerId=e.pointerId;
        gate.start(wrapper.getAttribute('data-id'),pointerId);
      },true);
      // Legacy Frappe listens to mouse events; synthetic upstream probes
      // may not dispatch pointerdown. Both paths share the same single gate.
      root.addEventListener('mousedown',e=>{
        if(e.button!==0)return;
        const wrapper=e.target?.closest?.('.bar-wrapper');
        if(wrapper&&!gate.isActive())
          gate.start(wrapper.getAttribute('data-id'),pointerId);
      },true);
      document.addEventListener('mouseup',e=>{
        const id=gate.getPointerId();
        if(id===null)return;
        const inside=Boolean(e.target?.closest?.('#chart svg'));
        // Frappe installs its mouseup listener after ours. Finalize only
        // after all synchronous upstream mouseup callbacks have completed.
        queueMicrotask(()=>gate.finish(id,{inside}));
      });
      window.addEventListener('pointerup',e=>{
        if(e.pointerType==='mouse')return;
        const id=e.pointerId;
        setTimeout(()=>gate.finish(id,{inside:true}),0);
      },true);
      window.addEventListener('keydown',e=>{
        if(e.key==='Escape'&&gate.isActive()){
          e.preventDefault();gate.cancel();
        }
      },true);
      window.addEventListener('pointercancel',e=>{
        if(gate.isActive())gate.cancel(e.pointerId);
      },true);
      window.addEventListener('lostpointercapture',e=>{
        if(gate.isActive())gate.cancel(e.pointerId);
      },true);
      window.addEventListener('blur',()=>gate.cancel(),true);
    }
    const chart=new globalThis.Gantt(root,tasks,{
      view_mode:data.viewMode,readonly:!editable,readonly_dates:!editable,
      readonly_progress:!editable,move_dependencies:false,infinite_padding:false,
      today_button:false,view_mode_select:false,scroll_to:'start',
      language:'de',popup:()=>false,
      on_click:task=>reply('selected',{id:String(task.id)}),
      on_date_change:editable?(task,start,end)=>{
        try{gate.preview(mapFrappeDateChange(task.id,start,end));}
        catch(error){reply('error',{message:error.message});}
      }:undefined,
      on_progress_change:editable?(task,progress)=>{
        gate.preview({id:String(task.id),progress:Number(progress)});
      }:undefined
    });
    // Diagnostic-only private reference: not part of product adapter.
    if(editable)window.__frappeExperimental={chart,gate};
    reply('ready');
  }catch(error){
    reply('error',{message:error?.message||String(error)});
  }
});
