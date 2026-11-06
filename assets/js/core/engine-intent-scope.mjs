/**
 * Renderer-neutral origin stamp for user intents.
 *
 * The origin of an intent is the rendered snapshot, not the currently active
 * project when an asynchronous callback eventually arrives.
 */
export function captureEngineIntentScope(project, activationGeneration=null) {
  if (!project?.id) throw new TypeError('An engine render requires a project ID.');
  return Object.freeze({
    projectId:String(project.id),
    expectedRevision:Number.isSafeInteger(project.revision) && project.revision>=1
      ? project.revision : null,
    activationGeneration:Number.isSafeInteger(activationGeneration) && activationGeneration>=0
      ? activationGeneration : null
  });
}

export function matchesEngineIntentScope(scope, project, activationGeneration) {
  return Boolean(scope && project?.id
    && typeof scope.projectId==='string'
    && Number.isSafeInteger(scope.expectedRevision) && scope.expectedRevision>=1
    && Number.isSafeInteger(scope.activationGeneration) && scope.activationGeneration>=0
    && String(project.id)===scope.projectId
    && project.revision===scope.expectedRevision
    && activationGeneration===scope.activationGeneration);
}
