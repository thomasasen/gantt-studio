// Canonical project-management ordering: display sequence is never a scheduling rule.
// Imported legacy projects receive a date-based baseline once, without changing dates.
export const ORDER_STEP = 10;

export function phaseKey(project, task) {
  const key = String(task.phaseId || '');
  return (project.planning?.phases || []).some(phase => String(phase.id) === key) ? key : '';
}

function dateCompare(a, b) {
  return String(a.start || '').localeCompare(String(b.start || ''))
    || String(a.end || '').localeCompare(String(b.end || ''))
    || String(a.id || '').localeCompare(String(b.id || ''));
}

export function sortedProjectTasks(project, mode = 'manual', source = project.tasks) {
  const phases = (project.planning?.phases || []).slice().sort((a,b) =>
    String(a.start || '').localeCompare(String(b.start || ''))
    || String(a.id).localeCompare(String(b.id))
  );
  const ranks = new Map(phases.map((p,i) => [String(p.id),i]));
  const groupRank = task => ranks.get(phaseKey(project,task)) ?? phases.length;
  return source.slice().sort((a,b) => {
    const diff = groupRank(a)-groupRank(b);
    if(diff) return diff;
    if(mode === 'date') return dateCompare(a,b);
    const aOrder = Number.isSafeInteger(a.displayOrder) && a.displayOrder >= 0 ? a.displayOrder : Number.MAX_SAFE_INTEGER;
    const bOrder = Number.isSafeInteger(b.displayOrder) && b.displayOrder >= 0 ? b.displayOrder : Number.MAX_SAFE_INTEGER;
    return aOrder-bOrder || dateCompare(a,b);
  });
}

export function normalizeTaskOrder(project) {
  const byGroup = new Map();
  for(const task of sortedProjectTasks(project,'date')){
    const key = phaseKey(project,task);
    if(!byGroup.has(key)) byGroup.set(key,[]);
    byGroup.get(key).push(task);
  }
  for(const tasks of byGroup.values()){
    const valid = tasks.filter(t=>Number.isSafeInteger(t.displayOrder) && t.displayOrder>=0);
    let next = valid.length ? Math.max(...valid.map(t=>t.displayOrder)) + ORDER_STEP : ORDER_STEP;
    for(const task of tasks){
      if(Number.isSafeInteger(task.displayOrder) && task.displayOrder>=0) continue;
      task.displayOrder=next;
      next+=ORDER_STEP;
    }
  }
  return project;
}

export function nextDisplayOrder(project, phaseId) {
  const key = phaseKey(project,{phaseId});
  let max=0;
  for(const task of project.tasks){
    if(phaseKey(project,task)===key && Number.isSafeInteger(task.displayOrder))
      max=Math.max(max,task.displayOrder);
  }
  return max+ORDER_STEP;
}

export function reorderTask(project, taskId, targetId, place='before') {
  if(!['before','after'].includes(place) || taskId===targetId) return false;
  const source=project.tasks.find(t=>String(t.id)===String(taskId));
  const target=project.tasks.find(t=>String(t.id)===String(targetId));
  if(!source || !target || phaseKey(project,source)!==phaseKey(project,target))return false;
  const siblings=sortedProjectTasks(project,'manual').filter(t=>phaseKey(project,t)===phaseKey(project,source));
  const before=siblings.map(t=>t.id).join('\u001f');
  const without=siblings.filter(t=>t!==source);
  const targetIndex=without.indexOf(target);
  if(targetIndex<0)return false;
  without.splice(targetIndex+(place==='after'?1:0),0,source);
  if(without.map(t=>t.id).join('\u001f')===before)return false;
  without.forEach((t,index)=>{t.displayOrder=(index+1)*ORDER_STEP;});
  return true;
}

export function nudgeTask(project, taskId, direction) {
  const source=project.tasks.find(t=>String(t.id)===String(taskId));
  if(!source || ![-1,1].includes(direction))return false;
  const siblings=sortedProjectTasks(project,'manual').filter(t=>phaseKey(project,t)===phaseKey(project,source));
  const from=siblings.indexOf(source),to=from+direction;
  if(from<0 || to<0 || to>=siblings.length)return false;
  return reorderTask(project, source.id, siblings[to].id, direction<0?'before':'after');
}
