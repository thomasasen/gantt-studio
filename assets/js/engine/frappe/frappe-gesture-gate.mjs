/**
 * Draft-only Frappe interaction bridge. Frappe 1.2.2 may produce multiple
 * date/progress callbacks during mousemove. Buffer a single domain intent and
 * publish it only after a valid, matching pointer completion.
 *
 * The production-facing Frappe adapter remains read-only. This small gate is
 * testable separately before any interactive Frappe capability is advertised.
 */
export function createFrappeGestureGate({emit,rollback=()=>{}}){
  if(typeof emit!=='function'||typeof rollback!=='function')
    throw new TypeError('Gesture callbacks required.');
  let active=null;
  return {
    start(taskId,pointerId){
      if(active!==null || !taskId || !Number.isInteger(pointerId))return false;
      active={id:String(taskId),pointerId,change:null};
      return true;
    },
    preview(change){
      if(!active || !change || String(change.id)!==active.id)return false;
      const allowed={};
      for(const key of ['start','end','progress']){
        if(Object.hasOwn(change,key))allowed[key]=change[key];
      }
      if(!Object.keys(allowed).length)return false;
      active.change={...(active.change||{}),...allowed,id:active.id};
      return true;
    },
    finish(pointerId,{inside=true}={}){
      if(!active || pointerId!==active.pointerId)return false;
      const finished=active;
      active=null;
      if(!inside){rollback();return false;}
      if(!finished.change)return false;
      emit({type:'task-change',change:finished.change});
      return true;
    },
    cancel(pointerId=null){
      if(!active || (pointerId!==null && pointerId!==active.pointerId))return false;
      active=null;rollback();return true;
    },
    isActive(){return active!==null;}
  };
}
