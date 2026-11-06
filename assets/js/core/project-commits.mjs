/**
 * Per-project transactional command queue.
 *
 * A command receives an isolated copy of the last successfully committed project.
 * It must not mutate the application's canonical project or perform persistence.
 * Commands for the same project are serialized; a failed write leaves the previous
 * committed snapshot intact and does not poison the queue.
 *
 * The returned snapshot may be published only after save() has completed.
 * Different projects have independent queues to prevent project-switch races.
 */
export function createProjectCommitter(save) {
  if (typeof save !== 'function') throw new TypeError('A save function is required.');
  const committed = new Map();
  const pending = new Map();
  const clone = value => structuredClone(value);

  function remember(project) {
    if (!project?.id) throw new TypeError('Project id is required.');
    const previous=committed.get(project.id);
    // An out-of-order project read must not rewind a confirmed commit.
    if (previous && Number.isSafeInteger(previous.revision)
        && Number.isSafeInteger(project.revision)
        && project.revision < previous.revision) {
      const error=new Error('Veralteter Projektstand. Bitte Projekt erneut laden.');
      error.name='ConcurrentModificationError';
      throw error;
    }
    if (!pending.has(project.id)) committed.set(project.id, clone(project));
  }

  function commit(project, change) {
    if (!project?.id || typeof change !== 'function') throw new TypeError('Invalid project command.');
    const id = project.id;
    const fallback = clone(project);
    const previous = pending.get(id) || Promise.resolve();
    const job = previous.catch(() => {}).then(async () => {
      const before = clone(committed.get(id) || fallback);
      const next = clone(before);
      const applied = await change(next);
      if (applied === false || JSON.stringify(before) === JSON.stringify(next))
        return { changed: false, project: before };

      next.revision = Math.max(1, Number(before.revision) || 1) + 1;
      next.updatedAt = new Date().toISOString();
      await save(clone(next), before.revision);
      committed.set(id, clone(next));
      return { changed: true, project: clone(next) };
    });
    pending.set(id, job);
    // Do not introduce an unhandled rejection through Promise.finally().
    void job.then(
      () => { if (pending.get(id) === job) pending.delete(id); },
      () => { if (pending.get(id) === job) pending.delete(id); }
    );
    return job;
  }

  async function whenIdle(id) {
    const job = pending.get(id);
    if (job) await job.catch(() => {});
  }

  function forget(id) {
    if (pending.has(id)) throw new Error('Cannot forget a project with pending writes.');
    committed.delete(id);
  }

  return { remember, commit, whenIdle, forget };
}
