import {createFrappeGestureGate} from '../../assets/js/engine/frappe/frappe-gesture-gate.mjs?v=2.8.1';
import {mapFrappeDateChange} from '../../assets/js/engine/frappe/frappe-task-mapper.mjs?v=2.8.1';

// Executed in a disposable browsing context. The outer app stays Native-only.
const CHANNEL='gantt-studio-frappe-isolated-v1';
let initialized=false;
function reply(type,payload={}){
  window.parent.postMessage({channel:CHANNEL,type,...payload},location.origin);
}
window.addEventListener('message',event=>{
  if(initialized||event.origin!==location.origin||event.source!==window.parent)return;
  const data=event.data;
  if(!data||data.channel!==CHANNEL||data.type!=='render')return;
  initialized=true;
  const generation=data.generation;
  try{
    if(typeof globalThis.Gantt!=='function')throw new Error('Local Frappe UMD missing');
    const editable=data.experimentalEditable===true;
    const tasks=structuredClone(data.tasks);
    const root=document.getElementById('chart');
    const gate=createFrappeGestureGate({
      emit:intent=>reply('intent',{generation,intent}),
      rollback:()=>reply('cancelled',{generation})
    });
    if(editable){
      root.addEventListener('mousedown',e=>{
        if(e.button!==0)return;
        const wrapper=e.target?.closest?.('.bar-wrapper');
        if(wrapper)gate.start(wrapper.getAttribute('data-id'),1);
      },true);
      document.addEventListener('mouseup',e=>{
        if(!gate.isActive())return;
        gate.finish(1,{inside:Boolean(e.target?.closest?.('#chart svg'))});
      });
      window.addEventListener('keydown',e=>{
        if(e.key==='Escape'&&gate.isActive()){
          e.preventDefault();gate.cancel(1);
        }
      },true);
      window.addEventListener('pointercancel',()=>{
        if(gate.isActive())gate.cancel(1);
      },true);
    }
    const chart=new globalThis.Gantt(root,tasks,{
      view_mode:data.viewMode,readonly:!editable,readonly_dates:!editable,
      readonly_progress:!editable,move_dependencies:false,infinite_padding:false,
      today_button:false,view_mode_select:false,scroll_to:'start',
      language:'de',popup:()=>false,
      on_click:task=>reply('selected',{generation,id:String(task.id)}),
      on_date_change:editable?(task,start,end)=>{
        try{gate.preview(mapFrappeDateChange(task.id,start,end));}
        catch(error){reply('error',{generation,message:error.message});}
      }:undefined,
      on_progress_change:editable?(task,progress)=>{
        gate.preview({id:String(task.id),progress:Number(progress)});
      }:undefined
    });
    // Test-only instrumentation on the isolated spike, never in the app.
    if(editable)window.__frappeExperimental={chart,gate};
    reply('ready',{generation});
  }catch(error){
    reply('error',{generation,message:error?.message||String(error)});
  }
});
