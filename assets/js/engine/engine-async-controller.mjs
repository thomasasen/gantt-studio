import { assertEngineContract, immutableEngineProjection } from './engine-contract.mjs?v=2.8.1';

/**
 * Opt-in asynchronous Gantt engine coordinator. The production/native controller
 * remains synchronous and unchanged. Async transitions are serialized, each new
 * intent invalidates/aborts older work, and lastRequest is published only after
 * renderer readiness. A failed latest transition restores the last committed
 * immutable snapshot or fails closed if restoration itself fails.
 *
 * render(), switchEngine() and setViewport() return Promises. Superseded work
 * resolves to {superseded:true}. No persistence is ever performed here.
 */
export function createAsyncEngineController(initialFactory) {
  if (typeof initialFactory !== 'function') throw new TypeError('Engine factory is required.');
  let factory = initialFactory;
  let engine = null;
  let mounted = false;
  let mountOptions = null;
  let lastRequest = null;
  let lastViewport = null;
  let generation = 0;
  let mountSession = 0;
  let queue = Promise.resolve();
  let activeAbort = null;
  let switchingCandidate = null;

  const superseded = () => ({superseded:true});
  const current = token => mounted && token === generation;
  const destroySafely = (candidate, errors = []) => {
    try { candidate?.destroy(); } catch (error) { errors.push(error); }
    return errors;
  };
  const draw = (candidate, request, signal) =>
    typeof candidate.renderAsync === 'function'
      ? candidate.renderAsync(request, {signal})
      : candidate.render(request);
  async function applyViewport(candidate, viewport) {
    if (viewport) await candidate.setViewport(viewport);
  }
  function reset() {
    ++mountSession;
    engine = null; mounted = false; mountOptions = null;
    lastRequest = null; lastViewport = null; switchingCandidate = null;
  }
  function failClosed(errors, candidates = []) {
    for (const candidate of new Set(candidates)) destroySafely(candidate, errors);
    reset();
    throw new AggregateError(errors,
      'Async Gantt engine restoration failed; mount required.');
  }
  async function restore(candidate) {
    // destroy() is idempotent by contract and resets partial mounts.
    candidate.destroy();
    candidate.mount(mountOptions);
    if (lastRequest) await draw(candidate, lastRequest, undefined);
    await applyViewport(candidate, lastViewport);
  }
  function schedule(operation) {
    if (!mounted) return Promise.reject(new Error('Engine must be mounted first.'));
    const token = ++generation;
    activeAbort?.abort();
    const scheduled = queue.then(async () => {
      if (!current(token)) return superseded();
      const controller = new AbortController();
      activeAbort = controller;
      try { return await operation(token, controller.signal); }
      finally { if (activeAbort === controller) activeAbort = null; }
    });
    queue = scheduled.then(() => {}, () => {});
    return scheduled;
  }

  return {
    mount(options) {
      if (mounted) throw new Error('Engine is already mounted.');
      const candidate = assertEngineContract(factory());
      try { candidate.mount(options); }
      catch (error) {
        const errors = destroySafely(candidate, [error]);
        if (errors.length > 1)
          throw new AggregateError(errors, 'Async engine mount and cleanup failed.');
        throw error;
      }
      engine = candidate;
      mountOptions = {...options};
      mounted = true;
      ++mountSession;
    },
    render({project, view}) {
      // Clone at intent time, not after another async transition has run.
      const request = {
        project: immutableEngineProjection(project),
        view: Object.freeze({...view})
      };
      return schedule(async (token, signal) => {
        try {
          const result = await draw(engine, request, signal);
          if (!current(token)) return superseded();
          await applyViewport(engine, lastViewport);
          if (!current(token)) return superseded();
          if (result?.superseded) throw new Error('Engine render was superseded before readiness.');
          lastRequest = request;
          return result;
        } catch (error) {
          if (!current(token)) return superseded();
          if (!lastRequest) failClosed([error], [engine]);
          try {
            engine.cancelInteraction();
            await draw(engine, lastRequest, undefined);
            await applyViewport(engine, lastViewport);
          } catch (rollbackError) {
            failClosed([error, rollbackError], [engine]);
          }
          if (!current(token)) return superseded();
          throw error;
        }
      });
    },
    setViewport(viewport) {
      if (!mounted) return Promise.reject(new Error('Engine must be mounted first.'));
      const patch = {...viewport};
      const session = mountSession;
      // Scrolling is not a new rendering intent. In particular it must not
      // abort a frame while the first async render is becoming ready.
      const scheduled = queue.then(async () => {
        if (!mounted || session !== mountSession) return superseded();
        const next = {...lastViewport, ...patch};
        try {
          await engine.setViewport(next);
          if (!mounted || session !== mountSession) return superseded();
          lastViewport = next;
          return true;
        } catch (error) {
          if (!mounted || session !== mountSession) return superseded();
          if (!lastViewport) throw error;
          try { await engine.setViewport(lastViewport); }
          catch (rollbackError) {
            failClosed([error, rollbackError], [engine]);
          }
          if (!mounted || session !== mountSession) return superseded();
          throw error;
        }
      });
      queue = scheduled.then(() => {}, () => {});
      return scheduled;
    },
    switchEngine(nextFactory) {
      if (typeof nextFactory !== 'function')
        return Promise.reject(new TypeError('Engine factory required.'));
      return schedule(async (token, signal) => {
        let next;
        try { next = assertEngineContract(nextFactory()); }
        catch (error) {
          if (!current(token)) return superseded();
          if (!lastRequest) failClosed([error], [engine]);
          try {
            await draw(engine, lastRequest, signal);
            await applyViewport(engine, lastViewport);
          } catch (rollbackError) {
            if (!current(token)) return superseded();
            failClosed([error, rollbackError], [engine]);
          }
          if (!current(token)) return superseded();
          throw error;
        }
        const old = engine;
        switchingCandidate = next;
        let cause = null;
        try {
          try {
            old.destroy();
            next.mount(mountOptions);
            if (lastRequest) {
              const result = await draw(next, lastRequest, signal);
              if (result?.superseded && current(token))
                throw new Error('Candidate did not complete rendering.');
            }
            if (current(token)) await applyViewport(next, lastViewport);
          } catch (error) {
            cause = error;
          }
          if (!mounted) {
            destroySafely(next);
            return superseded();
          }
          if (!cause && current(token)) {
            engine = next;
            factory = nextFactory;
            return true;
          }
          const errors = destroySafely(next, cause ? [cause] : []);
          try { await restore(old); }
          catch (rollbackError) {
            failClosed([...errors, rollbackError], [old, next]);
          }
          if (!current(token)) return superseded();
          if (errors.length > 1)
            throw new AggregateError(errors, 'Engine switch cleanup failed; original restored.');
          if (cause) throw cause;
          return superseded();
        } finally {
          if (switchingCandidate === next) switchingCandidate = null;
        }
      });
    },
    cancelInteraction() {
      if (mounted) {
        engine?.cancelInteraction();
        if (switchingCandidate && switchingCandidate !== engine)
          switchingCandidate.cancelInteraction();
      }
    },
    locateMarker(kind) { return mounted ? engine.locateMarker(kind) : null; },
    focusTask(id, control='reorder') {
      return mounted ? engine.focusTask(id, control) : false;
    },
    getCapabilities() {
      return assertEngineContract(engine || factory()).getCapabilities();
    },
    async whenIdle() { await queue; },
    destroy() {
      if (!mounted) return;
      ++generation;
      activeAbort?.abort();
      const former = engine;
      const pending = switchingCandidate;
      reset();
      const errors = destroySafely(pending, []);
      if (former !== pending) destroySafely(former, errors);
      if (errors.length) throw new AggregateError(errors, 'Async engine destroy failed.');
    }
  };
}
