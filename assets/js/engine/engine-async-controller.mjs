import { assertEngineContract, immutableEngineProjection } from './engine-contract.mjs?v=2.8.2';

/**
 * Opt-in coordinator only. Production uses the synchronous Native controller.
 *
 * Rendering intents are serialized and generation-fenced. Engine switching uses
 * PREPARE (an inert, geometrically sized sibling) -> COMMIT (one synchronous
 * visibility/ownership flip) -> CLEANUP. Until COMMIT the old mounted adapter,
 * its DOM, focus and listeners are left intact. No persistence occurs here.
 *
 * The adapter's parentElement is its scrolling viewport, including while staged.
 * This is essential for Native's setViewport() implementation. Do not move a
 * live iframe between parents: that would discard its browsing context.
 */
export function createAsyncEngineController(initialFactory) {
  if (typeof initialFactory !== 'function') throw new TypeError('Engine factory is required.');
  let factory = initialFactory;
  let engine = null;
  let mounted = false;
  let mountOptions = null;
  let activeContainer = null;
  let originalContainer = null;
  let originalParent = null;
  let originalNextSibling = null;
  let lastRequest = null;
  let lastViewport = null;
  let generation = 0;
  let mountSession = 0;
  let queue = Promise.resolve();
  let activeAbort = null;
  let switchingCandidate = null;
  let pendingStaging = null;
  let phase = 'unmounted';
  const destroyed = new WeakSet();
  const superseded = () => ({superseded:true});
  const current = token => mounted && token === generation;

  function destroySafely(candidate, errors = []) {
    if (candidate && !destroyed.has(candidate)) {
      destroyed.add(candidate);
      try { candidate.destroy(); } catch (error) { errors.push(error); }
    }
    return errors;
  }
  const draw = (candidate, request, signal) =>
    typeof candidate.renderAsync === 'function'
      ? candidate.renderAsync(request, {signal})
      : candidate.render(request);

  // Even an incorrectly written async adapter that ignores AbortSignal must
  // not keep the transition queue blocked forever after a newer request.
  async function awaitAbortable(value, signal) {
    if (!signal) return await value;
    if (signal.aborted) throw new DOMException('Engine request aborted', 'AbortError');
    let onAbort;
    const aborted = new Promise((_, reject) => {
      onAbort = () => reject(new DOMException('Engine request aborted', 'AbortError'));
      signal.addEventListener('abort', onAbort, {once:true});
    });
    try { return await Promise.race([Promise.resolve(value), aborted]); }
    finally { signal.removeEventListener('abort', onAbort); }
  }
  async function applyViewport(candidate, viewport) {
    if (viewport) await candidate.setViewport(viewport);
  }
  function reportCleanup(error) {
    try { mountOptions?.onError?.(error); }
    catch (_) { /* An error reporter must never undo a committed engine. */ }
  }
  function reset() {
    ++mountSession;
    engine = null; mounted = false; mountOptions = null;
    activeContainer = null; originalContainer = null;
    originalParent = null; originalNextSibling = null;
    lastRequest = null; lastViewport = null; switchingCandidate = null;
    pendingStaging = null; phase = 'unmounted';
  }
  function failClosed(errors, candidates = []) {
    for (const candidate of new Set(candidates)) destroySafely(candidate, errors);
    pendingStaging?.close();
    restoreOriginalContainer();
    reset();
    throw new AggregateError(errors, 'Async Gantt engine restoration failed; mount required.');
  }
  function restoreOriginalContainer() {
    if (!originalParent || !originalContainer) return;
    if (activeContainer && activeContainer !== originalContainer)
      activeContainer.remove();
    if (originalContainer.parentElement !== originalParent)
      originalParent.insertBefore(originalContainer,
        originalNextSibling?.parentElement === originalParent ? originalNextSibling : null);
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
  function createStage(active) {
    // DOM-free mock adapters are supported for Node unit tests only.
    if (typeof document === 'undefined') {
      return {node:{}, close(){}, activate(){return ()=>{};}};
    }
    const parent = active?.parentElement;
    if (!parent || !active.isConnected || !parent.isConnected)
      throw new Error('Engine staging requires an attached DOM mount container.');
    const rect = active.getBoundingClientRect();
    // offset* measurements stay in layout CSS pixels at 200% browser/CSS zoom.
    // Bounding rectangles may already be zoom-scaled; use them only as fallback.
    const width = Math.max(1, active.offsetWidth || active.clientWidth || parent.clientWidth || rect.width);
    const height = Math.max(0, active.offsetHeight || active.clientHeight || rect.height);
    const liveWidth = active.style.width;
    const node = document.createElement(active.tagName.toLowerCase());
    node.className = active.className;
    node.setAttribute('aria-hidden', 'true');
    node.inert = true;
    node.style.cssText = 'position:absolute;opacity:0;pointer-events:none;'
      + 'overflow:hidden;box-sizing:border-box;'
      + 'left:0;top:0;'
      + 'width:' + width + 'px;min-height:' + height + 'px;';
    let committed = false;
    let closed = false;
    active.after(node);
    return {
      node,
      activate() {
        if (closed || !node.isConnected || node.parentElement !== parent
          || active.parentElement !== parent)
          throw new Error('Staged engine cannot be safely activated.');
        const previousOldStyle = active.getAttribute('style');
        const previousOldAria = active.getAttribute('aria-hidden');
        const previousOldInert = active.inert;
        const previousNewStyle = node.getAttribute('style');
        try {
          // Synchronous DOM changes form one browser paint. The old tree
          // remains present (but inert) until successful publication.
          active.style.position = 'absolute';
          active.style.visibility = 'hidden';
          active.style.opacity = '0';
          active.style.pointerEvents = 'none';
          active.setAttribute('aria-hidden', 'true');
          active.inert = true;
          node.style.position = '';
          node.style.left = '';
          node.style.top = '';
          // Honor an explicit size on the original mount root. Clearing this
          // width would clamp horizontal scroll during an atomic switch.
          node.style.width = liveWidth;
          // opacity avoids Chromium retaining the hidden computed visibility
          // of a staged iframe. There is no transition: one synchronous swap.
          node.style.opacity = '1';
          node.style.visibility = 'visible';
          node.style.pointerEvents = '';
          node.style.overflow = '';
          node.removeAttribute('aria-hidden');
          node.inert = false;
          committed = true;
        } catch (error) {
          undo();
          throw error;
        }
        return undo;
        function undo() {
          if (previousOldStyle === null) active.removeAttribute('style');
          else active.setAttribute('style', previousOldStyle);
          if (previousOldAria === null) active.removeAttribute('aria-hidden');
          else active.setAttribute('aria-hidden', previousOldAria);
          active.inert = previousOldInert;
          if (previousNewStyle === null) node.removeAttribute('style');
          else node.setAttribute('style', previousNewStyle);
          node.setAttribute('aria-hidden', 'true');
          node.inert = true;
          committed = false;
        }
      },
      close() {
        if (closed) return;
        closed = true;
        if (!committed) node.remove();
      }
    };
  }
  function focusAfterCommit(newContainer, focused, shouldRestoreFocus) {
    if (typeof document === 'undefined' || !shouldRestoreFocus) return;
    const taskId = focused.closest?.('[data-task-id]')?.dataset.taskId;
    const control = focused.closest?.('[data-gantt-order-handle]') ? 'reorder' : 'task';
    let restored = false;
    try { if (taskId) restored = Boolean(engine.focusTask(taskId, control)); }
    catch (error) { reportCleanup(error); }
    if (!restored) {
      if (!newContainer.hasAttribute('tabindex')) newContainer.tabIndex = -1;
      newContainer.focus({preventScroll:true});
    }
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
      activeContainer = options.container;
      originalContainer = options.container;
      originalParent = options.container?.parentElement || null;
      originalNextSibling = options.container?.nextSibling || null;
      mounted = true; phase = 'active';
      ++mountSession;
    },
    render({project, view}) {
      // Clone at intent time; an external project activation invalidates staging.
      const request = {
        project: immutableEngineProjection(project),
        view: Object.freeze({...view})
      };
      return schedule(async (token, signal) => {
        try {
          const result = await awaitAbortable(draw(engine, request, signal), signal);
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
          catch (rollbackError) { failClosed([error, rollbackError], [engine]); }
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
        const old = engine;
        const oldContainer = activeContainer;
        // An iframe may steal browser focus while loading, even when its
        // staging host is inert. Capture the old focus before any preparation.
        const focusAtPrepare = typeof document !== 'undefined'
          && oldContainer?.contains(document.activeElement)
          ? document.activeElement : null;
        let next, staging, committed = false;
        phase = 'preparing';
        try {
          next = assertEngineContract(nextFactory());
          if (next === old || destroyed.has(next)) {
            // A reused adapter belongs to the active view (or a previous
            // teardown). Never let failed candidate cleanup destroy it.
            next = null;
            throw new Error('Engine factory must return a fresh adapter instance.');
          }
          switchingCandidate = next;
          staging = createStage(oldContainer);
          pendingStaging = staging;
          const callbacks = {
            ...mountOptions, container:staging.node,
            onIntent: intent => engine === next && mounted
              ? mountOptions.onIntent?.(intent) : false,
            onSelect: value => { if (engine === next && mounted) mountOptions.onSelect?.(value); },
            onError: error => { if (engine === next && mounted) mountOptions.onError?.(error); },
            onStatus: value => { if (engine === next && mounted) mountOptions.onStatus?.(value); }
          };
          next.mount(callbacks);
          if (lastRequest) {
            const result = await awaitAbortable(draw(next, lastRequest, signal), signal);
            if (result?.superseded && current(token))
              throw new Error('Candidate did not complete rendering.');
          }
          if (!current(token)) return superseded();
          // The parent is shared. Capture scroll *now*, not at prepare time:
          // the user may have scrolled while the new iframe was loading.
          const parent = oldContainer?.parentElement;
          const viewport = parent && typeof document !== 'undefined'
            ? {...lastViewport, scrollLeft:parent.scrollLeft, scrollTop:parent.scrollTop}
            : lastViewport;
          await awaitAbortable(applyViewport(next, viewport), signal);
          if (!current(token)) return superseded();
          const currentFocus = typeof document !== 'undefined' ? document.activeElement : null;
          // Respect a deliberate focus move to another UI control. Otherwise
          // recover the original old-chart focus if the browser sent it to
          // body or the newly loading iframe during PREPARE.
          const focusBeforeCommit = oldContainer?.contains?.(currentFocus)
            ? currentFocus
            : (typeof document !== 'undefined' && (currentFocus === document.body || staging.node?.contains?.(currentFocus)))
              ? focusAtPrepare : null;
          const undo = staging.activate();
          try {
            engine = next;
            factory = nextFactory;
            activeContainer = staging.node;
            committed = true; phase = 'active';
          } catch (error) {
            undo();
            engine = old; activeContainer = oldContainer;
            throw error;
          }
          const restoreFocus = Boolean(focusBeforeCommit && oldContainer?.contains?.(focusBeforeCommit));
          // Cleanup is post-commit. Its failure is reported, never rolled back
          // by reactivating an already destroyed / detached old engine.
          const errors = destroySafely(old);
          if (typeof document !== 'undefined' && oldContainer?.isConnected)
            oldContainer.remove();
          errors.forEach(reportCleanup);
          focusAfterCommit(activeContainer, focusBeforeCommit, restoreFocus);
          return true;
        } catch (error) {
          if (!current(token)) return superseded();
          if (committed) {
            reportCleanup(error);
            return true;
          }
          const errors = destroySafely(next, [error]);
          if (errors.length > 1)
            throw new AggregateError(errors, 'Staged engine failed; old engine remains active.');
          throw error;
        } finally {
          if (!committed) {
            destroySafely(next).forEach(reportCleanup);
            staging?.close();
          } else staging?.close();
          if (pendingStaging === staging) pendingStaging = null;
          if (switchingCandidate === next) switchingCandidate = null;
          if (mounted && phase === 'preparing') phase = 'active';
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
    getCapabilities() { return assertEngineContract(engine || factory()).getCapabilities(); },
    getStatus() { return phase; },
    async whenIdle() { await queue; },
    destroy() {
      if (!mounted) return;
      ++generation;
      activeAbort?.abort();
      const former = engine;
      const pending = switchingCandidate;
      const errors = destroySafely(pending);
      if (former !== pending) destroySafely(former, errors);
      pendingStaging?.close();
      restoreOriginalContainer();
      reset();
      if (errors.length) throw new AggregateError(errors, 'Async engine destroy failed.');
    }
  };
}
