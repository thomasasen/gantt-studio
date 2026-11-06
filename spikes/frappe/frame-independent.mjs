import {createIndependentGesture} from '../../assets/js/engine/frappe/independent-gesture.mjs?v=2.8.1';

const NS='http://www.w3.org/2000/svg';
const rect=(parent,attrs)=>{
  const node=document.createElementNS(NS,'rect');
  for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));
  parent.appendChild(node);return node;
};
/**
 * Experiment-only binding. Frappe is strictly readonly and the independent
 * gesture controller owns pointer capture, preview, completion and abort.
 * NOTE: .bar-wrapper/.bar SVG shapes are NOT a public vendor API. This
 * adapter deliberately makes that upgrade risk observable, NOT acceptable.
 */
export function mountIndependentLayer({root,tasks,projectId,revision,record,sendIntent,sendCancel}){
  const byId=new Map(tasks.map(t=>[String(t.id),{...t}]));
  const overlayNodes=[];
  const ghost=document.createElement('div');
  ghost.id='independent-gesture-preview';
  ghost.style.cssText='display:none;position:fixed;z-index:9999;pointer-events:none;box-sizing:border-box;border:2px solid #007e75;background:rgba(0,126,117,.17);border-radius:4px;min-height:10px';
  const label=document.createElement('span');
  label.style.cssText='position:absolute;top:-29px;left:0;white-space:nowrap;background:#153f48;color:white;border-radius:4px;padding:3px 6px;font:12px system-ui';
  ghost.appendChild(label);document.body.appendChild(ghost);
  let startX=0,visual=null,destroyed=false;
  const gesture=createIndependentGesture({
    emit:intent=>{ghost.style.display='none';visual=null;
      record('independent-commit',{gestureId:intent.gestureId,kind:intent.kind,change:intent.change});
      sendIntent(intent);},
    onPreview:change=>{
      if(!visual)return;
      const dx=change.dx,{box,kind}=visual;
      let left=box.left,width=box.width;
      if(kind==='move')left+=dx;
      if(kind==='resize-left'){left+=Math.min(dx,box.width-10);width=box.width-(left-box.left);}
      if(kind==='resize-right')width=Math.max(10,box.width+dx);
      ghost.style.left=left+'px';ghost.style.top=box.top+'px';
      ghost.style.width=width+'px';ghost.style.height=box.height+'px';
      label.textContent=change.start+' – '+change.end+' · '+change.progress+' %';
      ghost.style.background='linear-gradient(90deg,rgba(0,126,117,.32) '+change.progress+'%,rgba(0,126,117,.10) '+change.progress+'%)';
      record('independent-preview',{kind,dx,change:{id:visual.id,start:change.start,end:change.end,progress:change.progress}});
    },
    onCancel:details=>{ghost.style.display='none';visual=null;
      record('independent-cancel',details);sendCancel(details.reason);}
  });
  if(!projectId||!Number.isSafeInteger(revision)||revision<1)throw new TypeError('Project identity/revision missing');
  function drawHandles(){
    for(const wrapper of root.querySelectorAll('.bar-wrapper[data-id]')){
      const id=wrapper.getAttribute('data-id'),task=byId.get(id);
      if(!task)continue;
      const bar=wrapper.querySelector('.bar');
      if(!bar||typeof bar.getBBox!=='function')continue;
      const b=bar.getBBox();
      if(!Number.isFinite(b.width)||b.width<18||b.height<8)continue;
      const group=document.createElementNS(NS,'g');
      group.setAttribute('class','studio-independent-controls');
      group.setAttribute('data-task-id',id);
      const common={'pointer-events':'all','stroke':'#13665f','stroke-width':1};
      const move=rect(group,{...common,x:b.x+9,y:b.y,width:Math.max(0,b.width-18),height:b.height,
        fill:'rgba(0,126,117,0.015)','data-independent-kind':'move'});
      move.setAttribute('aria-label','Aufgabe verschieben: '+task.name);
      rect(group,{...common,x:b.x,y:b.y,width:9,height:b.height,fill:'#50c5b2',
        'data-independent-kind':'resize-left'});
      rect(group,{...common,x:b.x+b.width-9,y:b.y,width:9,height:b.height,fill:'#50c5b2',
        'data-independent-kind':'resize-right'});
      const px=Math.max(b.x+10,Math.min(b.x+b.width-10,b.x+b.width*task.progress/100));
      rect(group,{...common,x:px-5,y:b.y+b.height-7,width:10,height:7,fill:'#f4b942',
        'data-independent-kind':'progress'});
      wrapper.appendChild(group);overlayNodes.push(group);
    }
    record('independent-handles',{count:overlayNodes.length});
  }
  drawHandles();
  // Pointerdown on an SVG rect can be prevented from focusing the iframe.
  // The editor surface must own keyboard focus for Escape to be reliable.
  root.tabIndex=-1;
  const onDown=e=>{
    const target=e.target?.closest?.('[data-independent-kind]');
    if(!target||e.isPrimary===false||e.button!==0)return;
    const id=target.closest('[data-task-id]')?.getAttribute('data-task-id');
    const task=byId.get(id),bar=target.closest('.bar-wrapper')?.querySelector('.bar');
    if(!task||!bar)return;
    const box=bar.getBoundingClientRect();
    const kind=target.getAttribute('data-independent-kind');
    if(!gesture.start({task,projectId,revision,pointerId:e.pointerId,kind,barWidth:box.width})){
      record('independent-rejected',{kind,id,pointerId:e.pointerId});return;
    }
    e.preventDefault();e.stopPropagation();
    startX=e.clientX;visual={id,kind,box};
    ghost.style.display='block';
    ghost.style.left=box.left+'px';ghost.style.top=box.top+'px';
    ghost.style.width=box.width+'px';ghost.style.height=box.height+'px';
    label.textContent=task.start+' – '+task.end+' · '+task.progress+' %';
    root.setPointerCapture(e.pointerId);
    root.focus({preventScroll:true});
    record('independent-pointerdown',{kind,id,pointerId:e.pointerId,x:e.clientX});
  };
  const onMove=e=>{if(gesture.getActive()?.pointerId===e.pointerId)gesture.move(e.pointerId,e.clientX-startX);};
  const onUp=e=>{
    if(gesture.getActive()?.pointerId!==e.pointerId)return;
    record('independent-pointerup',{pointerId:e.pointerId,x:e.clientX});
    if(e.clientX<0||e.clientY<0||e.clientX>innerWidth||e.clientY>innerHeight)
      gesture.cancel('out-of-bounds');
    else gesture.finish(e.pointerId);
  };
  const onCancel=e=>{if(gesture.getActive()?.pointerId===e.pointerId)gesture.cancel('pointercancel');};
  const onLost=e=>{if(gesture.getActive()?.pointerId===e.pointerId)gesture.cancel('lostpointercapture');};
  const onKey=e=>{if(e.key==='Escape'&&gesture.getActive()){e.preventDefault();gesture.cancel('escape');}};
  const onBlur=()=>gesture.cancel('blur');
  const onExit=e=>{if(e.relatedTarget===null&&gesture.getActive())gesture.cancel('browser-exit');};
  const onVisibility=()=>{if(document.hidden)gesture.cancel('hidden');};
  const listeners=[
    [root,'pointerdown',onDown,true],[root,'pointermove',onMove,false],
    [root,'pointerup',onUp,false],[root,'pointercancel',onCancel,false],
    [root,'lostpointercapture',onLost,false],[window,'keydown',onKey,true],
    [window,'blur',onBlur,true],[window,'mouseout',onExit,true],
    [document,'visibilitychange',onVisibility,false]
  ];
  listeners.forEach(([host,type,fn,capture])=>host.addEventListener(type,fn,capture));
  return {
    cancel:()=>gesture.cancel('host-cancel'),
    getState:()=>gesture.getState(),
    destroy:()=>{if(destroyed)return;destroyed=true;
      gesture.destroy();listeners.forEach(([host,type,fn,capture])=>host.removeEventListener(type,fn,capture));
      overlayNodes.forEach(node=>node.remove());ghost.remove();}
  };
}
