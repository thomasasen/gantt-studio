import {isValidIsoDate} from './date-only.mjs?v=2.8.1';

/**
 * Engine-independent, opt-in transaction boundary for task edits.
 * Caller owns persistence and canonical publication. No iframe is trusted to
 * select a project, grant edit access, choose a revision or write to storage.
 *
 * The existing createProjectCommitter supplies serialized, CAS-checked writes.
 * This bridge is deliberately NOT wired to the production application.
 */
export function validateEditorIntent(intent, project, visibleTaskIds) {
  if (!intent || typeof intent !== 'object' || intent.type !== 'task-change'
      || !intent.change || typeof intent.change !== 'object'
      || Array.isArray(intent.change)) throw new TypeError('Invalid task-change intent.');
  if (!project || !Array.isArray(project.tasks)) throw new TypeError('Project tasks are required.');
  const change = intent.change;
  const keys = Object.keys(change);
  if (!keys.includes('id') || keys.some(key => !['id','start','end','progress'].includes(key))
      || keys.length < 2 || typeof change.id !== 'string' || !change.id.trim())
    throw new TypeError('Unknown or incomplete task-change fields.');
  const task = project.tasks.find(item => String(item.id) === change.id);
  if (!task || task.syntheticPhase === true || task.showInGantt === false
      || !(visibleTaskIds instanceof Set) || !visibleTaskIds.has(change.id))
    throw new Error('Task is absent, protected or outside the current view.');
  const start = Object.hasOwn(change,'start') ? change.start : task.start;
  const end = Object.hasOwn(change,'end') ? change.end : task.end;
  if (!isValidIsoDate(start) || !isValidIsoDate(end) || end < start)
    throw new RangeError('Invalid inclusive date-only interval.');
  if (Object.hasOwn(change,'progress')
      && (typeof change.progress !== 'number' || !Number.isFinite(change.progress)
        || change.progress < 0 || change.progress > 100))
    throw new RangeError('Task progress must be between 0 and 100.');
  const allowed = {id:change.id};
  for (const key of ['start','end','progress']) {
    if (Object.hasOwn(change,key)) allowed[key] = key === 'progress'
      ? Math.round(change.progress) : change[key];
  }
  return Object.freeze(allowed);
}

export function applyEditorIntent(project, intent, visibleTaskIds) {
  const change = validateEditorIntent(intent, project, visibleTaskIds);
  const task = project.tasks.find(item => String(item.id) === change.id);
  let modified = false;
  for (const key of ['start','end','progress']) {
    if (Object.hasOwn(change,key) && task[key] !== change[key]) {
      task[key] = change[key];
      modified = true;
    }
  }
  return modified;
}

/**
 * Explicit session fencing: open -> preview* -> submit -> commit/rollback.
 * An invalidated session cannot start a new write. A write already submitted
 * to IndexedDB cannot be retroactively cancelled: its result is never
 * published into another active project/session.
 */
export function createTransactionalEditor({
  committer, getActiveProject, onCommitted=()=>{},
  onRollback=()=>{}, onState=()=>{}, onError=()=>{}
}) {
  if (typeof committer?.commit !== 'function'
      || typeof getActiveProject !== 'function'
      || [onCommitted,onRollback,onState,onError].some(fn => typeof fn !== 'function'))
    throw new TypeError('Transactional editor callbacks required.');
  let counter = 0, session = null;
  let state = 'idle';
  const notify = next => {
    state = next;
    try { onState(next); } catch(error) { try { onError(error); } catch (_) {} }
  };
  const active = token => session !== null && token === session.token;
  const projectMatches = s => {
    const project = getActiveProject();
    return Boolean(project && project.id === s.project.id
      && project.revision === s.project.revision);
  };
  const restore = s => {
    try { onRollback(structuredClone(s.project)); }
    catch(error) { try { onError(error); } catch (_) {} }
  };
  function invalidate() {
    if (session && (state === 'preview' || state === 'pending')
        && projectMatches(session)) restore(session);
    session = null;
    ++counter;
    notify('idle');
  }
  function open({project, generation, visibleTaskIds}) {
    invalidate();
    if (!project?.id || !Number.isSafeInteger(project.revision) || project.revision < 1
        || !Number.isSafeInteger(generation) || generation < 0
        || !Array.isArray(visibleTaskIds))
      throw new TypeError('Explicit project, revision, generation and visible IDs required.');
    const snapshot = structuredClone(project);
    session = {
      token: ++counter, generation, project:snapshot,
      visible:new Set(visibleTaskIds.map(String)), intent:null
    };
    if (!projectMatches(session)) {
      session = null;
      throw new Error('Cannot open a stale project revision.');
    }
    return session.token;
  }
  function preview(token, intent) {
    if (!active(token) || (state !== 'idle' && state !== 'preview')) return false;
    const s = session;
    if (!projectMatches(s)) { invalidate(); return false; }
    try {
      s.intent = {type:'task-change',
        change:validateEditorIntent(intent,s.project,s.visible)};
      notify('preview');
      return true;
    } catch(error) {
      s.intent = null;
      restore(s);
      notify('failed');
      try { onError(error); } catch (_) {}
      return false;
    }
  }
  async function submit(token) {
    if (!active(token) || state !== 'preview' || !session.intent) return false;
    const s = session;
    if (!projectMatches(s)) { invalidate(); return false; }
    notify('pending');
    try {
      const result = await committer.commit(s.project, next => {
        // Check again inside the per-project queue, before save().
        if (!active(token) || !projectMatches(s)
            || next.id !== s.project.id || next.revision !== s.project.revision)
          return false;
        return applyEditorIntent(next,s.intent,s.visible);
      });
      if (!active(token)) return false; // Stale result: never touch a new UI.
      if (!result.changed) {
        restore(s);
        notify('cancelled');
        return false;
      }
      notify('committed');
      try { onCommitted(structuredClone(result.project)); }
      catch(error) { try { onError(error); } catch (_) {} }
      return true;
    } catch(error) {
      if (active(token)) {
        restore(s);
        notify('failed');
        try { onError(error); } catch (_) {}
      }
      return false;
    }
  }
  function cancel(token) {
    if (!active(token) || state === 'pending' || state === 'committed') return false;
    restore(session);
    session.intent = null;
    notify('cancelled');
    return true;
  }
  return {
    open, preview, submit, cancel, invalidate,
    getState:() => state,
    getSession:() => session && Object.freeze({
      token:session.token, projectId:session.project.id,
      revision:session.project.revision,generation:session.generation
    })
  };
}
