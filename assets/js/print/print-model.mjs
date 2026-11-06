// Engine-independent print projection and two-dimensional pagination.
// This module never reads the Gantt DOM, scroll position, or browser viewport.
const DAY = 86400000;
const iso = d => new Date(d).toISOString().slice(0,10);
const ms = s => Date.parse(s + 'T00:00:00Z');
const add = (s,n) => iso(ms(s) + n * DAY);
const days = (a,b) => Math.round((ms(b)-ms(a))/DAY);
const valid = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(ms(s)) && iso(ms(s)) === s;
const clamp = (n,min,max) => Math.max(min,Math.min(max,n));
export const PRINT_DEFAULTS = Object.freeze({
  profile:'detail', paper:'A4', orientation:'landscape', strategy:'readable',
  margin:12, scale:100, labelWidth:57, rowHeight:9, fontSize:9,
  scope:'all', range:'full', from:'', to:'', color:true,
  names:true, owners:true, status:true, progress:true, dates:false,
  phases:true, milestones:true, dependencies:true, baseline:true, markers:true,
  weekends:false, legend:false, header:true, footer:true, title:''
});
export const PAGE_MM = Object.freeze({A4:[210,297],A3:[297,420]});
export function sanitizePrintSettings(input={}) {
  const s={...PRINT_DEFAULTS,...input};
  for(const [key,values] of Object.entries({
    profile:['management','detail','custom'],paper:['A4','A3'],
    orientation:['portrait','landscape','auto'],
    strategy:['one','fitWidth','readable','manual'],
    scope:['all','filtered','milestones'],range:['full','custom','month','quarter']
  })) if(!values.includes(s[key])) s[key]=PRINT_DEFAULTS[key];
  for(const [key,min,max] of [['margin',5,30],['scale',30,200],['labelWidth',32,100],['rowHeight',6,16],['fontSize',7,14]])
    s[key]=clamp(Number(s[key])||PRINT_DEFAULTS[key],min,max);
  for(const key of ['color','names','owners','status','progress','dates','phases','milestones','dependencies','baseline','markers','weekends','legend','header','footer'])
    s[key]=Boolean(s[key]);
  s.title=String(s.title||'').slice(0,120);
  return s;
}
function orderedTasks(project,tasks,sortMode) {
  const phases=project.planning?.phases||[];
  const byPhase=new Map(phases.map(p=>[String(p.id),[]]));
  const unphased=[];
  for(const t of tasks) {
    const group=byPhase.get(String(t.phaseId||''));
    (group||unphased).push(t);
  }
  const sort=(a,b)=>sortMode==='date'
    ? String(a.start||'').localeCompare(String(b.start||'')) || String(a.name).localeCompare(String(b.name))
    : (Number(a.displayOrder)||0)-(Number(b.displayOrder)||0) || String(a.start||'').localeCompare(String(b.start||''));
  const output=[];
  for(const phase of [...phases].sort((a,b)=>String(a.start||'').localeCompare(String(b.start||'')))) {
    const group=byPhase.get(String(phase.id))||[];
    if(!group.length)continue;
    group.sort(sort);
    if(project._printPhases!==false) {
      const starts=group.map(t=>t.start).filter(valid).sort(),ends=group.map(t=>t.end).filter(valid).sort();
      output.push({id:'print-phase-'+phase.id,name:phase.name||'Phase',type:'phase-summary',
        start:valid(phase.start)?phase.start:starts[0],end:valid(phase.end)?phase.end:ends.at(-1),
        progress:Math.round(group.reduce((a,t)=>a+(Number(t.progress)||0),0)/group.length),
        phaseId:phase.id,phaseColor:phase.color,owner:group.length+' Aufgaben'});
    }
    output.push(...group);
  }
  return [...output,...unphased.sort(sort)];
}
export function projectForPrint(project, settings, context={}) {
  const s=sanitizePrintSettings(settings);
  // Pure snapshot: no writes to the project, its revision, or local storage.
  const source=JSON.parse(JSON.stringify(project||{}));
  let tasks=(source.tasks||[]).filter(t=>t.showInGantt!==false && valid(t.start) && valid(t.end) && t.start<=t.end);
  if(s.scope==='filtered') {
    const ids=new Set(context.filteredTaskIds||[]);
    tasks=tasks.filter(t=>ids.has(t.id));
  } else if(s.scope==='milestones') tasks=tasks.filter(t=>['milestone','gate'].includes(t.type));
  if(!s.milestones) tasks=tasks.filter(t=>!['milestone','gate'].includes(t.type));
  source._printPhases=s.phases;
  const rows=orderedTasks(source,tasks,context.sortMode);
  const dates=rows.flatMap(t=>[t.start,t.end,...(s.baseline?[t.baselineStart,t.baselineEnd]:[])]).filter(valid);
  if(s.markers) dates.push(...(source.planning?.markers||[]).map(m=>m.date).filter(valid));
  if(s.phases)dates.push(...(source.planning?.phases||[]).filter(p=>rows.some(t=>t.phaseId===p.id)).flatMap(p=>[p.start,p.end]).filter(valid));
  const today=iso(Date.now());
  let from=dates.length?[...dates].sort()[0]:today;
  let to=dates.length?[...dates].sort().at(-1):today;
  if(s.range==='custom' && valid(s.from) && valid(s.to) && s.from<=s.to){from=s.from;to=s.to;}
  if(s.range==='month'){from=today.slice(0,7)+'-01';to=add(iso(Date.UTC(Number(today.slice(0,4)),Number(today.slice(5,7)),1)),-1);}
  if(s.range==='quarter') {
    const y=Number(today.slice(0,4)), m=Number(today.slice(5,7))-1, q=Math.floor(m/3)*3;
    from=iso(Date.UTC(y,q,1));to=add(iso(Date.UTC(y,q+3,1)),-1);
  }
  const rangeRows=rows.filter(t=>t.type==='phase-summary' || (t.end>=from&&t.start<=to));
  return Object.freeze({name:source.name||'Projektplan',revision:source.revision,
    rows:rangeRows,from,to,markers:s.markers?(source.planning?.markers||[]).filter(m=>valid(m.date)&&m.date>=from&&m.date<=to):[],
    holidays:source.planning?.holidays||[],settings:s});
}
export function paginatePrint(projection) {
  const s=projection.settings;
  let [short,long]=PAGE_MM[s.paper];
  let orientation=s.orientation==='auto'
    ? (days(projection.from,projection.to)>60 || projection.rows.length<20?'landscape':'portrait')
    :s.orientation;
  const w=orientation==='landscape'?long:short, h=orientation==='landscape'?short:long;
  const usableW=w-2*s.margin,usableH=h-2*s.margin;
  const labelW=Math.min(s.labelWidth,usableW*.48), timeW=usableW-labelW;
  const overhead=(s.header?17:0)+(s.footer?10:0)+15;
  const rows=projection.rows;
  const dayCount=Math.max(1,days(projection.from,projection.to)+1);
  // In the readable profile, timeline time units are never shrunk to illegibility.
  const nominalDay=clamp(2.1*s.scale/100,.75,5);
  let mmPerDay=nominalDay;
  let rowHeight=s.rowHeight;
  let fontSize=s.fontSize;
  const warn=[];
  if(s.strategy==='fitWidth'||s.strategy==='one') mmPerDay=Math.min(nominalDay,timeW/dayCount);
  if(s.strategy==='one') {
    const rowRoom=Math.max(1,usableH-overhead);
    rowHeight=Math.min(rowHeight,rowRoom/Math.max(1,rows.length));
    if(rowHeight<6 || mmPerDay<.32 || fontSize*rowHeight/s.rowHeight<7)
      warn.push('Eine Seite wäre schwer lesbar. Mehrseitigen Druck oder ein größeres Papierformat wählen.');
  }
  if(s.strategy==='manual')mmPerDay=nominalDay;
  // If one-page scaling is illegible, retain minimum row size and paginate vertically.
  rowHeight=Math.max(6,rowHeight);
  const perCol=Math.max(1,Math.floor(timeW/mmPerDay));
  const perRow=Math.max(1,Math.floor((usableH-overhead)/rowHeight));
  const horizontal=Math.ceil(dayCount/perCol),vertical=Math.max(1,Math.ceil(rows.length/perRow));
  const pages=[];
  for(let y=0;y<vertical;y++)for(let x=0;x<horizontal;x++){
    const from=add(projection.from,x*perCol),to=add(from,Math.min(perCol,dayCount-x*perCol)-1);
    pages.push({index:pages.length+1,x:x+1,y:y+1,from,to,
      rows:rows.slice(y*perRow,(y+1)*perRow)});
  }
  if(pages.length>120)warn.push('Sehr großer Ausdruck: '+pages.length+' Seiten. Zeitraum oder Aufgaben einschränken.');
  return {pages,pageCount:pages.length,horizontal,vertical,w,h,orientation,usableW,usableH,
    labelW,timeW,mmPerDay,rowHeight,fontSize,warnings:warn};
}
export {add,days,valid};
