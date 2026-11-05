import { assertEngineContract, immutableEngineProjection } from './engine-contract.mjs?v=2.8.0';

/**
 * Owns one replaceable adapter. The only state carried across engine switches
 * is a copied, frozen project projection and explicit view state, never DOM.
 */
export function createEngineController(initialFactory) {
  if(typeof initialFactory!=='function')throw new TypeError('Engine factory is required.');
  let factory=initialFactory;
  let engine=null;
  let mounted=false;
  let mountOptions=null;
  let lastRequest=null;
  let lastViewport=null;
  return {
    mount(options) {
      if(mounted)throw new Error('Engine is already mounted.');
      const candidate=assertEngineContract(factory());
      candidate.mount(options);
      engine=candidate;
      mountOptions={...options};
      mounted=true;
    },
    render({project,view}) {
      if(!mounted)throw new Error('Engine must be mounted before rendering.');
      lastRequest={
        project:immutableEngineProjection(project),
        view:Object.freeze({...view})
      };
      return engine.render(lastRequest);
    },
    setViewport(viewport) {
      lastViewport={...lastViewport,...viewport};
      if(mounted)engine.setViewport(lastViewport);
    },
    cancelInteraction() {
      if(mounted)engine.cancelInteraction();
    },
    locateMarker(kind) {
      return mounted?engine.locateMarker(kind):null;
    },
    focusTask(id,control='reorder') {
      return mounted?engine.focusTask(id,control):false;
    },
    getCapabilities() {
      return assertEngineContract(engine||factory()).getCapabilities();
    },
    switchEngine(nextFactory) {
      if(typeof nextFactory!=='function')throw new TypeError('Engine factory required.');
      const next=assertEngineContract(nextFactory());
      if(!mounted){
        factory=nextFactory;
        return;
      }
      const old=engine;
      old.destroy();
      try {
        next.mount(mountOptions);
        if(lastRequest)next.render(lastRequest);
        if(lastViewport)next.setViewport(lastViewport);
        engine=next;
        factory=nextFactory;
      } catch(error) {
        try{next.destroy();}catch{}
        // A failed adapter must not destroy the user's current view.
        old.mount(mountOptions);
        if(lastRequest)old.render(lastRequest);
        if(lastViewport)old.setViewport(lastViewport);
        engine=old;
        throw error;
      }
    },
    destroy() {
      if(!mounted)return;
      mounted=false;
      try{engine.destroy();}
      finally{engine=null;lastRequest=null;lastViewport=null;mountOptions=null;}
    }
  };
}
