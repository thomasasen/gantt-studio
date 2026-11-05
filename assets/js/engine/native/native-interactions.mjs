/**
 * Native-only task-list interactions. This module depends on the native DOM,
 * not on the project's storage, scheduler or canonical model.
 */
export function createNativeInteractions({container,onIntent,onSelect,onError}) {
  let project=null,view=null,drag=null,suppressClickUntil=0;

  const emit=intent=>{
    try { Promise.resolve(onIntent(intent)).catch(onError); }
    catch(error){onError(error);}
  };
  const groupKey=id=>{
    const task=project?.tasks.find(t=>String(t.id)===String(id));
    if(!task)return null;
    const key=String(task.phaseId||'');
    return project.planning?.phases?.some(p=>String(p.id)===key)?key:'';
  };
  const clearMarkers=state=>{
    state.left.querySelectorAll('.gantt-order-drop-before,.gantt-order-drop-after')
      .forEach(row=>row.classList.remove('gantt-order-drop-before','gantt-order-drop-after'));
    state.right.querySelectorAll('.gantt-order-drop-before,.gantt-order-drop-after')
      .forEach(row=>row.classList.remove('gantt-order-drop-before','gantt-order-drop-after'));
  };
  function cancel(){
    const state=drag;
    if(!state)return;
    drag=null;
    state.row.style.transform='';
    state.row.classList.remove('gantt-row-dragging');
    state.handle.classList.remove('active');
    clearMarkers(state);
    window.removeEventListener('pointermove',move);
    window.removeEventListener('pointerup',finish);
    window.removeEventListener('pointercancel',cancel);
    window.removeEventListener('keydown',onEscape,true);
    window.removeEventListener('blur',cancel);
    if(state.handle.hasPointerCapture?.(state.pointerId))
      state.handle.releasePointerCapture(state.pointerId);
  }
  function onEscape(event){
    if(event.key!=='Escape')return;
    event.preventDefault();event.stopPropagation();
    const handle=drag?.handle;
    cancel();
    handle?.focus({preventScroll:true});
    suppressClickUntil=Date.now()+350;
    window.__ganttDragUntil=suppressClickUntil;
  }
  function start(event){
    if(!view?.reorderable||event.button!==0||!event.isPrimary||drag)return;
    const handle=event.target.closest('[data-gantt-order-handle]');
    if(!handle)return;
    const row=handle.closest('.task-row-left[data-task-id]');
    const left=container.querySelector('.gantt-left');
    const right=container.querySelector('.gantt-right');
    if(!row||!left||!right)return;
    const phase=groupKey(row.dataset.taskId);
    if(phase===null)return;
    event.preventDefault();event.stopPropagation();
    drag={handle,row,left,right,pointerId:event.pointerId,startY:event.clientY,
      active:false,drop:null,phase};
    handle.setPointerCapture(event.pointerId);
    window.addEventListener('pointermove',move);
    window.addEventListener('pointerup',finish);
    window.addEventListener('pointercancel',cancel);
    window.addEventListener('keydown',onEscape,true);
    window.addEventListener('blur',cancel);
  }
  function move(event){
    const state=drag;
    if(!state||event.pointerId!==state.pointerId)return;
    const delta=event.clientY-state.startY;
    if(!state.active&&Math.abs(delta)<6)return;
    if(!state.active){
      state.active=true;
      state.row.classList.add('gantt-row-dragging');
      state.handle.classList.add('active');
    }
    state.row.style.transform='translateY('+delta+'px)';
    clearMarkers(state);
    state.drop=null;
    const target=[...state.left.querySelectorAll('.task-row-left[data-task-id]')]
      .filter(row=>row!==state.row)
      .find(row=>{
        const rect=row.getBoundingClientRect();
        return event.clientY>=rect.top&&event.clientY<=rect.bottom;
      });
    if(!target||groupKey(target.dataset.taskId)!==state.phase)return;
    const rect=target.getBoundingClientRect();
    const place=event.clientY<rect.top+rect.height/2?'before':'after';
    const cssClass=place==='before'?'gantt-order-drop-before':'gantt-order-drop-after';
    target.classList.add(cssClass);
    [...state.right.querySelectorAll('.task-row-right[data-task-id]')]
      .find(row=>row.dataset.taskId===target.dataset.taskId)?.classList.add(cssClass);
    state.drop={targetId:target.dataset.taskId,place};
  }
  function finish(event){
    const state=drag;
    if(!state||event.pointerId!==state.pointerId)return;
    move(event);
    const drop=state.drop,sourceId=state.row.dataset.taskId,active=state.active;
    cancel();
    if(!active)return;
    suppressClickUntil=Date.now()+350;
    window.__ganttDragUntil=suppressClickUntil;
    if(drop&&view?.reorderable)
      emit({type:'reorder',taskId:sourceId,targetId:drop.targetId,place:drop.place,surface:'gantt'});
  }
  function onClick(event){
    if(Date.now()<suppressClickUntil||Date.now()<(window.__ganttDragUntil||0)||
       event.target.closest('[data-gantt-order-handle]'))return;
    const phaseId=event.target.closest('[data-phase-id]')?.dataset.phaseId;
    if(phaseId){onSelect({kind:'phase',id:phaseId});return;}
    const id=event.target.closest('[data-task-id]')?.dataset.taskId;
    if(id)onSelect({kind:'task',id});
  }
  function onKeydown(event){
    const handle=event.target.closest('[data-gantt-order-handle]');
    if(handle){
      if(view?.reorderable&&['ArrowUp','ArrowDown'].includes(event.key)){
        event.preventDefault();event.stopPropagation();
        emit({type:'nudge',taskId:handle.dataset.taskId,
          direction:event.key==='ArrowUp'?-1:1,surface:'gantt'});
      }
      return;
    }
    if(!['Enter',' '].includes(event.key))return;
    const phaseId=event.target.closest('[data-phase-id]')?.dataset.phaseId;
    if(phaseId){event.preventDefault();onSelect({kind:'phase',id:phaseId});return;}
    const taskId=event.target.closest('[data-task-id]')?.dataset.taskId;
    if(taskId){event.preventDefault();onSelect({kind:'task',id:taskId});}
  }

  container.addEventListener('pointerdown',start);
  container.addEventListener('click',onClick);
  container.addEventListener('keydown',onKeydown);
  return {
    update(nextProject,nextView){cancel();project=nextProject;view=nextView;},
    cancel,
    destroy(){
      cancel();
      container.removeEventListener('pointerdown',start);
      container.removeEventListener('click',onClick);
      container.removeEventListener('keydown',onKeydown);
      project=null;view=null;
    }
  };
}
