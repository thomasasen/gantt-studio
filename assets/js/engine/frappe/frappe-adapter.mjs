import {mapProjectToFrappeTasks} from './frappe-task-mapper.mjs?v=2.8.1';
import {validateEditorIntent} from '../../core/transactional-editor.mjs?v=2.8.1';

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
  themes:0,print:false,offline:true,asyncRendering:true
});
const VIEW_MODE=Object.freeze({day:'Day',week:'Week',month:'Month'});
const CHANNEL='gantt-studio-frappe-isolated-v1';
const FRAME_URL=new URL('../../../../spikes/frappe/frame.html',import.meta.url);

export function createFrappeEngine({experimentalEditable=false,readyTimeoutMs=15000,frameUrl=FRAME_URL}={}) {
  if (!Number.isFinite(readyTimeoutMs) || readyTimeoutMs < 1)
    throw new RangeError('A positive finite frame readiness timeout is required.');
  // Same-origin test fixture injection only; never load a remote runtime.
  const resolvedFrameUrl=new URL(frameUrl,FRAME_URL);
  if(resolvedFrameUrl.origin!==FRAME_URL.origin)
    throw new TypeError('Frappe frame URL must be same origin.');
  let container=null,frame=null,generation=0,mounted=false;
  let onSelect=()=>{},onError=()=>{},onStatus=()=>{};
  let messageHandler=null,lastRequest=null,onIntent=()=>{};
  let pendingRender=null,frameSession=null,renderReady=false;
  let allowedIds=new Set(),seenGestures=new Set();
  function finishPending(token,value,error=null){
    if(!pendingRender || (token!==null && pendingRender.token!==token))return;
    const pending=pendingRender;
    pendingRender=null;
    clearTimeout(pending.timer);
    if(pending.signal)pending.signal.removeEventListener('abort',pending.onAbort);
    if(error)pending.reject(error);
    else pending.resolve(value);
  }
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
        if(!data||data.channel!==CHANNEL||data.generation!==generation
          || data.session!==frameSession)return;
        if(data.type==='ready'){
          if(renderReady)return;
          renderReady=true;
          finishPending(generation,{empty:false});
          onStatus('Frappe: gerendert');
        }
        else if(data.type==='selected'&&renderReady&&allowedIds.has(data.id))
          onSelect({kind:'task',id:data.id});
        else if(data.type==='error'){
          const error=new Error('Frappe-Frame: '+String(data.message));
          finishPending(generation,null,error);
          onError(error);
        }
        else if(data.type==='cancelled' && experimentalEditable && renderReady && lastRequest)
          engine.render(lastRequest);
        else if(data.type==='intent' && experimentalEditable && renderReady && lastRequest) {
          try{
            if(!Number.isSafeInteger(data.gestureId)||data.gestureId<1
                || seenGestures.has(data.gestureId))return;
            const change=validateEditorIntent(data.intent,lastRequest.project,allowedIds);
            seenGestures.add(data.gestureId);
            Promise.resolve(onIntent({type:'task-change',change})).catch(onError);
          }catch(error){onError(error);}
        }
      };
      window.addEventListener('message',messageHandler);
    },
    render({project,view}) {
      if(!mounted)throw new Error('Frappe engine must be mounted first.');
      if(!Object.hasOwn(VIEW_MODE,view?.zoom))throw new RangeError('Unsupported zoom');
      const tasks=mapProjectToFrappeTasks(project);
      lastRequest={project:structuredClone(project),view:{...view}};
      allowedIds=new Set(tasks.map(task=>task.id));
      seenGestures=new Set();
      frameSession=crypto.randomUUID();
      renderReady=false;
      const token=++generation;
      finishPending(null,{superseded:true});
      detachFrame();
      container.replaceChildren();
      if(!tasks.length){onStatus('Frappe: leer');return {empty:true};}
      const target=document.createElement('iframe');
      target.className='studio-frappe-frame';
      target.title='Frappe-Zeitplan (schreibgeschützte Vorschau)';
      target.style.cssText='width:100%;min-height:360px;height:'+Math.min(1200,Math.max(360,150+tasks.length*38))+'px;border:0;display:block';
      target.src=resolvedFrameUrl.href;
      target.onload=()=>{
        if(!mounted||frame!==target||generation!==token)return;
        target.contentWindow?.postMessage({
          channel:CHANNEL,type:'render',generation:token,session:frameSession,
          tasks,viewMode:VIEW_MODE[view.zoom],
          experimentalEditable:Boolean(experimentalEditable)
        },location.origin);
      };
      frame=target;
      container.appendChild(target);
      onStatus('Frappe: lade isolierte Ansicht');
      return {empty:false};
    },
    renderAsync(request,{signal}={}) {
      if(signal?.aborted)return Promise.reject(new DOMException('Frame render aborted','AbortError'));
      let result;
      try{result=this.render(request);}
      catch(error){return Promise.reject(error);}
      if(result.empty)return Promise.resolve(result);
      const token=generation;
      return new Promise((resolve,reject)=>{
        const pending={token,resolve,reject,signal,timer:null,onAbort:null};
        pendingRender=pending;
        pending.onAbort=()=>finishPending(token,null,
          new DOMException('Frame render aborted','AbortError'));
        if(signal)signal.addEventListener('abort',pending.onAbort,{once:true});
        pending.timer=setTimeout(()=>finishPending(token,null,
          new Error('Frappe frame readiness timed out')),readyTimeoutMs);
        if(signal?.aborted)pending.onAbort();
      });
    },
    setViewport(next={}) {
      const scroller=container?.parentElement;
      if(scroller&&Number.isFinite(next.scrollLeft))scroller.scrollLeft=next.scrollLeft;
      if(scroller&&Number.isFinite(next.scrollTop))scroller.scrollTop=next.scrollTop;
    },
    cancelInteraction() {
      if(experimentalEditable&&frame?.contentWindow){
        frame.contentWindow.postMessage({channel:CHANNEL,type:'cancel',generation,
          session:frameSession},location.origin);
      }
    },
    locateMarker(){return null;},
    focusTask(){return false;},
    destroy(){
      if(!mounted)return;
      ++generation;
      finishPending(null,{superseded:true});
      detachFrame();
      if(messageHandler)window.removeEventListener('message',messageHandler);
      container.replaceChildren();
      container=null;messageHandler=null;mounted=false;lastRequest=null;
      frameSession=null;renderReady=false;allowedIds.clear();seenGestures.clear();
      onSelect=()=>{};onError=()=>{};onStatus=()=>{};onIntent=()=>{};
    }
  };
  return engine;
}
