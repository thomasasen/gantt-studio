import {createNativeEngine} from '../../assets/js/engine/native/native-adapter.mjs?v=2.8.1';
import {createDhtmlxEngine} from '../../assets/js/engine/dhtmlx/dhtmlx-adapter.mjs';
const file=await (await fetch('../../examples/demo.gantt.json')).json();
const baseline=file.project;
const day=n=>new Date(Date.UTC(2026,0,1+n)).toISOString().slice(0,10);
const now=()=>performance.now();
const median=arr=>{const s=[...arr].sort((a,b)=>a-b);return s[Math.floor(s.length/2)]};
function fixture(count){
 const tasks=Array.from({length:count},(_,i)=>({
   id:'bench-'+i,name:'Task '+i,start:day(i%300),end:day(i%300+1+i%9),
   progress:i%101,type:i%13===0?'critical':'workstream',
   dependencies:i>0&&i%7===0?['bench-'+(i-1)]:[],
   phaseId:baseline.planning.phases[i%baseline.planning.phases.length].id,
   displayOrder:i,showInGantt:true
 }));
 return {...structuredClone(baseline),id:'bench-project',revision:1,tasks};
}
async function run(count,repeat=3){
 if(![0,1,25,250,1000].includes(count)||repeat<1||repeat>5)throw new Error('Invalid fixture');
 const times={nativeInitial:[],dhtmlxInitial:[],nativeRerender:[],dhtmlxRerender:[],nativeZoom:[],dhtmlxZoom:[],nativeSwitch:[],dhtmlxSwitch:[],nativeDestroy:[],dhtmlxDestroy:[]};
 for(let i=0;i<repeat;i++){
  const project=fixture(count),next={...project,id:'bench-next'};
  const n=createNativeEngine(),d=createDhtmlxEngine();
  const nRoot=document.getElementById('native'),dRoot=document.getElementById('dhtmlx');
  n.mount({container:nRoot,onIntent:async()=>false,onSelect:()=>{},onError:e=>{throw e}});
  d.mount({container:dRoot,onIntent:async()=>false,onSelect:()=>{},onError:e=>{throw e}});
  const invoke=(key,fn)=>{const start=now();fn();times[key].push(now()-start)};
  try{
   const request={project,view:{zoom:'week',reorderable:false}};
   invoke('nativeInitial',()=>n.render(request));invoke('dhtmlxInitial',()=>d.render(request));
   invoke('nativeRerender',()=>n.render(request));invoke('dhtmlxRerender',()=>d.render(request));
   const zoom={project,view:{zoom:'day',reorderable:false}};
   invoke('nativeZoom',()=>n.render(zoom));invoke('dhtmlxZoom',()=>d.render(zoom));
   const switched={project:next,view:{zoom:'week',reorderable:false}};
   invoke('nativeSwitch',()=>n.render(switched));invoke('dhtmlxSwitch',()=>d.render(switched));
  }finally{
   invoke('nativeDestroy',()=>n.destroy());invoke('dhtmlxDestroy',()=>d.destroy());
  }
 }
 return {count,repeat,ms:Object.fromEntries(Object.entries(times).map(([k,v])=>[k,{median:median(v),samples:v}])),
   environment:{userAgent:navigator.userAgent,viewport:[innerWidth,innerHeight]},
   memoryAvailable:Boolean(performance.memory?.usedJSHeapSize)};
}
window.__runDhtmlxBench=run;
