import {mapProjectToFrappeTasks} from './frappe-task-mapper.mjs?v=2.8.1';

/*
 * Frappe 1.2.2 installs a global document mouseup handler per Gantt instance
 * without a public destroy method. This experimental adapter creates a fresh
 * same-origin iframe browsing context for every render and discards the entire
 * context on rerender or destroy. No vendor listeners touch the host document.
 * Editing stays disabled; upstream date callbacks may run before pointer-up.
 */
const CAPABILITIES=Object.freeze({
  id:'frappe-isolated-readonly',zoom:Object.freeze(['day','week','month']),
  taskMove:false,resizeStart:false,resizeEnd:false,progress:false,
  reorder:false,keyboardReorder:false,phaseRows:false,baseline:false,
  buffer:false,markers:false,holidays:false,dependencies:true,
  themes:0,print:false,offline:true
});
const VIEW_MODE=Object.freeze({day:'Day',week:'Week',month:'Month'});
const CHANNEL='gantt-studio-frappe-isolated-v1';
const FRAME_URL=new URL('../../../../spikes/frappe/frame.html',import.meta.url);

export function createFrappeEngine({experimentalEditable=false}={}) {
  let container=null,frame=null,generation=0,mounted=false;
  let onSelect=()=>{},onError=()=>{},onStatus=()=>{};
  let messageHandler=null,lastRequest=null,onIntent=()=>{};
  function detachFrame() {
    const previous=frame;
    frame=null;
    if(previous){previous.onload=null;previous.remove();}
  }
  const engine={
    getCapabilities:()=>CAPABILITIES,
    mount(options) {
      if(mounted)throw new Error('Frappe engine already mounted.');
      if(!options?.container || typeof options.container.replaceChildren!=='function')
        throw new TypeError('Frappe mount container required.');
      container=options.container;
      onSelect=typeof options.onSelect==='function'?options.onSelect:()=>{};
      onIntent=typeof options.onIntent==='function'?options.onIntent:()=>{};
      onError=typeof options.onError==='function'?options.onError:()=>{};
      onStatus=typeof options.onStatus==='function'?options.onStatus:()=>{};
      mounted=true;
      messageHandler=event=>{
        if(event.origin!==location.origin||event.source!==frame?.contentWindow)return;
        const data=event.data;
        if(!data||data.channel!==CHANNEL||data.generation!==generation)return;
        if(data.type==='ready')onStatus('Frappe: gerendert');
        else if(data.type==='selected')onSelect({kind:'task',id:String(data.id)});
        else if(data.type==='error')onError(new Error('Frappe-Frame: '+String(data.message)));
        else if(data.type==='cancelled' && experimentalEditable && lastRequest)
          engine.render(lastRequest);
        else if(data.type==='intent' && experimentalEditable) {
          try{Promise.resolve(onIntent(data.intent)).catch(onError);}
          catch(error){onError(error);}
        }
      };
      window.addEventListener('message',messageHandler);
    },
    render({project,view}) {
      if(!mounted)throw new Error('Frappe engine must be mounted first.');
      if(!Object.hasOwn(VIEW_MODE,view?.zoom))throw new RangeError('Unsupported zoom');
      const tasks=mapProjectToFrappeTasks(project);
      lastRequest={project,view};
      const token=++generation;
      detachFrame();
      container.replaceChildren();
      if(!tasks.length){onStatus('Frappe: leer');return {empty:true};}
      const target=document.createElement('iframe');
      target.className='studio-frappe-frame';
      target.title='Frappe-Zeitplan (schreibgeschützte Vorschau)';
      target.style.cssText='width:100%;min-height:360px;height:'+Math.min(1200,Math.max(360,150+tasks.length*38))+'px;border:0;display:block';
      target.src=FRAME_URL.href;
      target.onload=()=>{
        if(!mounted||frame!==target||generation!==token)return;
        target.contentWindow?.postMessage({
          channel:CHANNEL,type:'render',generation:token,tasks,viewMode:VIEW_MODE[view.zoom],
          experimentalEditable:Boolean(experimentalEditable)
        },location.origin);
      };
      frame=target;
      container.appendChild(target);
      onStatus('Frappe: lade isolierte Ansicht');
      return {empty:false};
    },
    setViewport(next={}) {
      const scroller=container?.parentElement;
      if(scroller&&Number.isFinite(next.scrollLeft))scroller.scrollLeft=next.scrollLeft;
      if(scroller&&Number.isFinite(next.scrollTop))scroller.scrollTop=next.scrollTop;
    },
    cancelInteraction() {
      if(experimentalEditable&&frame?.contentWindow){
        frame.contentWindow.postMessage({channel:CHANNEL,type:'cancel',generation},location.origin);
      }
    },
    locateMarker(){return null;},
    focusTask(){return false;},
    destroy(){
      if(!mounted)return;
      ++generation;
      detachFrame();
      if(messageHandler)window.removeEventListener('message',messageHandler);
      container.replaceChildren();
      container=null;messageHandler=null;mounted=false;lastRequest=null;
      onSelect=()=>{};onError=()=>{};onStatus=()=>{};onIntent=()=>{};
    }
  };
  return engine;
}
