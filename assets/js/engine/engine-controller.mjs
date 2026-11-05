import { assertEngineContract, immutableEngineProjection } from './engine-contract.mjs?v=2.8.0';

/** Hosts exactly one adapter at a time. Swap does not reconstruct data from DOM. */
export function createEngineController(factory) {
  if (typeof factory !== 'function') throw new TypeError('Engine factory is required.');
  let engine = null;
  let mounted = false;

  return {
    mount({container,onIntent,onSelect=()=>{},onError=()=>{},onStatus=()=>{}}) {
      if (mounted) throw new Error('Engine is already mounted.');
      engine=assertEngineContract(factory());
      engine.mount({container,onIntent,onSelect,onError,onStatus});
      mounted=true;
    },
    render({project,view}) {
      if (!mounted) throw new Error('Engine must be mounted before rendering.');
      return engine.render({project:immutableEngineProjection(project),view:Object.freeze({...view})});
    },
    setViewport(viewport) {
      if (!mounted) return;
      engine.setViewport({...viewport});
    },
    cancelInteraction() {
      if (mounted) engine.cancelInteraction();
    },
    locateMarker(kind) {
      return mounted ? engine.locateMarker(kind) : null;
    },
    getCapabilities() {
      return assertEngineContract(engine || factory()).getCapabilities();
    },
    destroy() {
      if (!mounted) return;
      mounted=false;
      try { engine.destroy(); } finally { engine=null; }
    }
  };
}
