/**
 * The Gantt engine contract. Engines receive read-only projections and emit
 * domain intents. No engine is allowed to mutate project data or persist it.
 *
 * @typedef {{type:'task-change', change:{id:string,start?:string,end?:string,progress?:number}} |
 *           {type:'reorder', taskId:string, targetId:string, place:'before'|'after', surface?:string} |
 *           {type:'nudge', taskId:string, direction:-1|1, surface?:string}} EngineIntent
 *
 * @typedef {{container:HTMLElement, onIntent:(intent:EngineIntent)=>Promise<unknown>,
 *            onSelect:(selection:{kind:'task'|'phase',id:string})=>void,
 *            onError:(error:Error)=>void, onStatus?:(message:string)=>void}} MountOptions
 *
 * @typedef {{project:object, view:{zoom:'day'|'week'|'month',reorderable:boolean}}} RenderRequest
 *
 * Required lifecycle: mount(options), render(request), setViewport(viewport),
 * cancelInteraction(), locateMarker(kind), focusTask(id,control), destroy(), getCapabilities(). destroy is idempotent.
 */
export const ENGINE_METHODS = Object.freeze([
  'mount','render','setViewport','cancelInteraction','locateMarker','focusTask','destroy','getCapabilities'
]);

export function assertEngineContract(engine) {
  if (!engine || typeof engine !== 'object') throw new TypeError('Engine adapter must be an object.');
  for (const method of ENGINE_METHODS) {
    if (typeof engine[method] !== 'function')
      throw new TypeError('Engine adapter missing ' + method + '().');
  }
  const caps = engine.getCapabilities();
  if (!caps || typeof caps !== 'object' || !Object.isFrozen(caps))
    throw new TypeError('Engine capabilities must be a frozen object.');
  return engine;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) deepFreeze(item);
    Object.freeze(value);
  }
  return value;
}

/** Independent, immutable view projection; never pass the canonical state to an engine. */
export function immutableEngineProjection(project) {
  if (!project || typeof project !== 'object') throw new TypeError('Project projection is required.');
  return deepFreeze(structuredClone(project));
}
