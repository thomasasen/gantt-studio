import { assertEngineContract, immutableEngineProjection } from './engine-contract.mjs?v=2.8.1';

/**
 * Owns the active adapter and the last successfully rendered immutable view.
 * A failed transition either restores that view or explicitly unmounts the
 * controller. Failed candidates must never become the active engine.
 */
export function createEngineController(initialFactory) {
  if (typeof initialFactory !== 'function') throw new TypeError('Engine factory is required.');
  let factory = initialFactory;
  let engine = null;
  let mounted = false;
  let mountOptions = null;
  let lastRequest = null;
  let lastViewport = null;

  function clearState() {
    engine = null;
    mounted = false;
    mountOptions = null;
    lastRequest = null;
    lastViewport = null;
  }

  function cleanup(candidate, errors) {
    try { candidate?.destroy(); }
    catch (error) { errors.push(error); }
  }

  function failClosed(errors, candidate) {
    cleanup(candidate, errors);
    clearState();
    throw new AggregateError(errors, 'Gantt-Engine konnte nicht wiederhergestellt werden; neu mounten erforderlich.');
  }

  function restore(candidate) {
    candidate.mount(mountOptions);
    if (lastRequest) candidate.render(lastRequest);
    if (lastViewport) candidate.setViewport(lastViewport);
  }

  return {
    mount(options) {
      if (mounted) throw new Error('Engine is already mounted.');
      const candidate = assertEngineContract(factory());
      try { candidate.mount(options); }
      catch (error) {
        const errors = [error];
        cleanup(candidate, errors);
        if (errors.length > 1) throw new AggregateError(errors, 'Engine mount and cleanup failed.');
        throw error;
      }
      engine = candidate;
      mountOptions = {...options};
      mounted = true;
    },
    render({project, view}) {
      if (!mounted) throw new Error('Engine must be mounted before rendering.');
      const nextRequest = {
        project: immutableEngineProjection(project),
        view: Object.freeze({...view})
      };
      try {
        const result = engine.render(nextRequest);
        lastRequest = nextRequest;
        return result;
      } catch (error) {
        if (!lastRequest) failClosed([error], engine);
        try {
          engine.cancelInteraction();
          engine.render(lastRequest);
          if (lastViewport) engine.setViewport(lastViewport);
        } catch (rollbackError) {
          failClosed([error, rollbackError], engine);
        }
        throw error;
      }
    },
    setViewport(viewport) {
      const nextViewport = {...lastViewport, ...viewport};
      if (!mounted) {
        lastViewport = nextViewport;
        return;
      }
      try {
        engine.setViewport(nextViewport);
        lastViewport = nextViewport;
      } catch (error) {
        if (!lastViewport) throw error;
        try { engine.setViewport(lastViewport); }
        catch (rollbackError) { failClosed([error, rollbackError], engine); }
        throw error;
      }
    },
    cancelInteraction() {
      if (mounted) engine.cancelInteraction();
    },
    locateMarker(kind) {
      return mounted ? engine.locateMarker(kind) : null;
    },
    focusTask(id, control = 'reorder') {
      return mounted ? engine.focusTask(id, control) : false;
    },
    getCapabilities() {
      return assertEngineContract(engine || factory()).getCapabilities();
    },
    switchEngine(nextFactory) {
      if (typeof nextFactory !== 'function') throw new TypeError('Engine factory required.');
      const next = assertEngineContract(nextFactory());
      if (!mounted) {
        factory = nextFactory;
        return;
      }
      const old = engine;
      try {
        old.destroy();
        next.mount(mountOptions);
        if (lastRequest) next.render(lastRequest);
        if (lastViewport) next.setViewport(lastViewport);
      } catch (error) {
        const errors = [error];
        cleanup(next, errors);
        try {
          // The old adapter may have been partially destroyed. Its destroy()
          // contract is idempotent, so reset it before restoring the view.
          old.destroy();
          restore(old);
        } catch (rollbackError) {
          errors.push(rollbackError);
          failClosed(errors, old);
        }
        if (errors.length > 1) throw new AggregateError(errors, 'Engine switch failed; old engine restored with cleanup errors.');
        throw error;
      }
      engine = next;
      factory = nextFactory;
    },
    destroy() {
      if (!mounted) return;
      const candidate = engine;
      clearState();
      candidate.destroy();
    }
  };
}
