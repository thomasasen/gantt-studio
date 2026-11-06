/**
 * Diagnostic-only gesture gate. Frappe 1.2.2 fires preview callbacks before
 * mouseup; a callback is never a commit authorization. This gate is not a
 * substitute for a documented public upstream pointer/commit contract.
 */
export function createFrappeGestureGate({emit,rollback=()=>{},onError=()=>{}}) {
  if ([emit,rollback,onError].some(callback=>typeof callback!=='function'))
    throw new TypeError('Gesture callbacks required.');
  let active=null, pending=false, destroyed=false;
  let sequence=0, state='idle';
  const fail=error=>{try{onError(error);}catch(_){}};
  const undo=()=>{
    try{rollback();}catch(error){fail(error);}
  };
  return {
    start(taskId,pointerId){
      if(destroyed||active!==null||pending||!String(taskId||'').trim()
          || !Number.isSafeInteger(pointerId)||pointerId<0)return false;
      active={id:String(taskId),pointerId,change:null,sequence:++sequence};
      state='preview';
      return true;
    },
    preview(change){
      if(destroyed||!active||!change||String(change.id)!==active.id)return false;
      const allowed={};
      for(const key of ['start','end','progress']){
        if(!Object.hasOwn(change,key))continue;
        const value=change[key];
        if(key==='progress'){
          if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>100)
            return false;
        }else if(typeof value!=='string'
          || !/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
        allowed[key]=value;
      }
      if(!Object.keys(allowed).length)return false;
      active.change={...(active.change||{}),...allowed,id:active.id};
      return true;
    },
    finish(pointerId,{inside=true}={}){
      if(destroyed||!active||pointerId!==active.pointerId)return false;
      const finished=active;
      active=null;
      if(!inside){state='cancelled';undo();return false;}
      if(!finished.change){state='idle';return false;}
      state='pending';
      try{
        const result=emit({type:'task-change',change:finished.change},finished.sequence);
        if(result && typeof result.then==='function'){
          pending=true;
          void Promise.resolve(result).then(
            ()=>{if(!destroyed){pending=false;state='dispatched';}},
            error=>{pending=false;if(!destroyed){state='failed';undo();fail(error);}}
          );
        } else state='dispatched';
        return true;
      }catch(error){
        state='failed';undo();fail(error);return false;
      }
    },
    cancel(pointerId=null){
      if(destroyed||!active||(pointerId!==null&&pointerId!==active.pointerId))return false;
      active=null;state='cancelled';undo();return true;
    },
    isActive(){return active!==null;},
    getPointerId(){return active?.pointerId??null;},
    getState(){return state;},
    destroy(){destroyed=true;active=null;state='cancelled';}
  };
}
