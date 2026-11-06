import { renderGantt } from '../../gantt.js?v=2.10.0';
import { createNativeInteractions } from './native-interactions.mjs?v=2.10.0';
import { captureEngineIntentScope } from '../../core/engine-intent-scope.mjs?v=2.10.0';

const CAPABILITIES=Object.freeze({
  id:'native', zoom:Object.freeze(['day','week','month']),
  taskMove:true, resizeStart:true, resizeEnd:true, progress:true,
  reorder:true, keyboardReorder:true, phaseRows:true, baseline:true,
  buffer:true, markers:true, holidays:true, dependencies:true,
  themes:11, print:true, offline:true
});

/**
 * Native rendering adapter. It neither knows about IndexedDB nor changes the
 * project. Timeline gestures emit intents; the application owns validation.
 */
export function createNativeEngine() {
  let container=null;
  let onIntent=()=>{};
  let activeRender=null;
  let viewport=null;
  let interactions=null;
  let lastRequest=null;
  let renderGeneration=0;
  let renderScope=null;
  const emitScopedIntent=intent=>{
    if(!container||!renderScope)return false;
    return onIntent({...intent,scope:renderScope});
  };
  return {
    getCapabilities:()=>CAPABILITIES,
    mount(options) {
      if(container)throw new Error('Native engine already mounted.');
      if(!options?.container)throw new TypeError('Mount container required.');
      container=options.container;
      onIntent=options.onIntent;
      interactions=createNativeInteractions({container,onIntent:emitScopedIntent,
        onSelect:options.onSelect,onError:options.onError,onStatus:options.onStatus});
    },
    render({project,view}) {
      if(!container)throw new Error('Native engine is not mounted.');
      lastRequest={project,view:{...view}};
      this.cancelInteraction();
      const generation=++renderGeneration;
      const scope=captureEngineIntentScope(project,view.activationGeneration);
      renderScope=scope;
      interactions.update(project,view);
      activeRender=renderGantt(container,project,{
        zoom:view.zoom,
        reorderable:view.reorderable,
        onTaskChange:change=>generation===renderGeneration && container
          ? onIntent({type:'task-change',change,scope}) : false
      });
      if(viewport) this.setViewport(viewport);
      return {empty:activeRender.empty===true};
    },
    setViewport(next) {
      viewport={...viewport,...next};
      if(!container)return;
      if(next.zoom && lastRequest && next.zoom!==lastRequest.view.zoom){
        this.render({project:lastRequest.project,view:{...lastRequest.view,zoom:next.zoom}});
        return;
      }
      const scroller=container.parentElement;
      if(Number.isFinite(next.scrollLeft)&&scroller)scroller.scrollLeft=next.scrollLeft;
      if(Number.isFinite(next.scrollTop)&&scroller)scroller.scrollTop=next.scrollTop;
    },
    cancelInteraction() {
      ++renderGeneration;
      renderScope=null;
      interactions?.cancel();
      activeRender?.destroy?.();
      activeRender=null;
    },
    focusTask(taskId,control='reorder') {
      if(!container)return false;
      const selector=control==='reorder'?'[data-gantt-order-handle]':'[data-task-id]';
      const node=[...container.querySelectorAll(selector)]
        .find(element=>String(element.dataset.taskId)===String(taskId));
      if(!node)return false;
      node.focus({preventScroll:true});
      return true;
    },
    locateMarker(kind) {
      if(!container || kind!=='relative-target')return null;
      const line=container.querySelector('.relative-today-line');
      if(!line)return null;
      const leftWidth=parseInt(getComputedStyle(document.documentElement)
        .getPropertyValue('--left-width'))||430;
      return {x:leftWidth+line.offsetLeft};
    },
    destroy() {
      this.cancelInteraction();
      interactions?.destroy();interactions=null;
      if(container)container.replaceChildren();
      container=null;
      onIntent=()=>{};
      viewport=null;
      lastRequest=null;
    }
  };
}
