/**
 * Latest-intent-wins project activation.
 *
 * Loading (including IndexedDB reads and portfolio discovery) is asynchronous,
 * but presentation must be synchronous: no await is permitted between the
 * current-generation check and publication of the canonical project/UI.
 * Stale completions and stale failures never publish a project.
 */
export function createProjectActivationCoordinator({load, present}) {
  if (typeof load !== 'function' || typeof present !== 'function')
    throw new TypeError('Project load and synchronous presentation are required.');
  let generation = 0;
  const isCurrent = token => token === generation;
  return {
    begin() { return ++generation; },
    isCurrent,
    current() { return generation; },
    async activate(id, token) {
      if (!isCurrent(token)) return false;
      const snapshot = await load(id);
      if (!isCurrent(token)) return false;
      if (!snapshot) throw new Error('Das ausgewählte Projekt ist nicht mehr vorhanden.');
      // A synchronous presentation prevents another browser event from
      // overtaking the final IDB-to-UI handoff.
      const result = present(snapshot);
      if (result?.then) throw new TypeError('Project presentation must be synchronous.');
      return true;
    }
  };
}
