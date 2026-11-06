// Executed in a disposable same-origin iframe, never in the Studio document.
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
    const tasks=structuredClone(data.tasks);
    new globalThis.Gantt(document.getElementById('chart'),tasks,{
      view_mode:data.viewMode,readonly:true,readonly_dates:true,
      readonly_progress:true,move_dependencies:false,infinite_padding:false,
      today_button:false,view_mode_select:false,scroll_to:'start',
      language:'de',popup:()=>false,
      on_click:task=>reply('selected',{generation,id:String(task.id)})
      // Never wire on_date_change: Frappe fires it during drag preview.
    });
    reply('ready',{generation});
  }catch(error){
    reply('error',{generation,message:error?.message||String(error)});
  }
});
