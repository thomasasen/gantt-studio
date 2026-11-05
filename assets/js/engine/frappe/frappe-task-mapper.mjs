import { isValidIsoDate } from '../../core/date-only.mjs?v=2.8.0';

// Frappe accepts date-only strings with a visible inclusive end date.
// Never convert the canonical YYYY-MM-DD dates to UTC timestamps here.
export function mapProjectToFrappeTasks(project) {
  if (!Array.isArray(project?.tasks)) throw new TypeError('Project tasks are required.');
  const visible = project.tasks.filter(task =>
    task.syntheticPhase !== true && task.showInGantt !== false && task.start && task.end);
  const ids = new Set();
  for (const task of visible) {
    const id = String(task.id || '');
    if (!id || ids.has(id)) throw new Error('Duplicate or missing Frappe task ID.');
    if (!isValidIsoDate(task.start) || !isValidIsoDate(task.end) || task.end < task.start)
      throw new Error('Invalid date-only task range: ' + id);
    ids.add(id);
  }
  const styles = {critical: 'studio-critical', milestone: 'studio-milestone', gate: 'studio-gate'};
  return visible.map(task => ({
    id: String(task.id),
    name: String(task.name ?? ''),
    start: task.start,
    end: task.end,
    progress: Math.max(0, Math.min(100, Number(task.progress) || 0)),
    dependencies: (Array.isArray(task.dependencies) ? task.dependencies : [])
      .map(String).filter(id => id !== String(task.id) && ids.has(id)),
    custom_class: styles[task.type] || 'studio-workstream'
  }));
}

// Only for a later interaction experiment. Frappe's callbacks return Date
// objects, often with end at 23:59:59. Use LOCAL calendar parts, not toISOString().
export function frappeCallbackDateToIso(value) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime()))
    throw new TypeError('A finite Frappe Date is required.');
  const iso = [String(value.getFullYear()).padStart(4, '0'),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0')].join('-');
  if (!isValidIsoDate(iso)) throw new RangeError('Frappe returned an invalid date.');
  return iso;
}

export function mapFrappeDateChange(id, start, end) {
  const change = {id: String(id), start: frappeCallbackDateToIso(start),
    end: frappeCallbackDateToIso(end)};
  if (change.end < change.start) throw new RangeError('Frappe end precedes start.');
  return change;
}
