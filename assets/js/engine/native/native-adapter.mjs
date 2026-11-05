import { renderGantt } from '../../gantt.js?v=2.8.0';
import { createNativeInteractions } from './native-interactions.mjs?v=2.8.0';

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
  return {
    getCapabilities:()=>CAPABILITIES,
    mount(options) {
      if(container)throw new Error('Native engine already mounted.');
      if(!options?.container)throw new TypeError('Mount container required.');
      container=options.container;
      onIntent=options.onIntent;
      interactions=createNativeInteractions({container,onIntent:options.onIntent,
        onSelect:options.onSelect,onError:options.onError});
    },
    render({project,view}) {
      if(!container)throw new Error('Native engine is not mounted.');
      this.cancelInteraction();
      interactions.update(project,view);
      activeRender=renderGantt(container,project,{
        zoom:view.zoom,
        reorderable:view.reorderable,
        onTaskChange:change=>onIntent({type:'task-change',change})
      });
      if(viewport) this.setViewport(viewport);
      return {empty:activeRender.empty===true};
    },
    setViewport(next) {
      viewport={...viewport,...next};
      if(!container)return;
      if(Number.isFinite(next.scrollLeft)) container.parentElement.scrollLeft=next.scrollLeft;
      if(Number.isFinite(next.scrollTop)) container.parentElement.scrollTop=next.scrollTop;
    },
    cancelInteraction() {
      interactions?.cancel();
      activeRender?.destroy?.();
      activeRender=null;
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
    }
  };
}
