import { dateMath } from './print-projection.mjs?v=2.9.0';
const {DAY,parse}=dateMath;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=n=>Number(n.toFixed(3));
const day=(date)=>new Date(date).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'UTC'});
const month=(date)=>new Date(date).toLocaleDateString('de-DE',{month:'short',year:'numeric',timeZone:'UTC'});
const xOf=(iso,page)=>((parse(iso)-parse(page.start))/DAY)*page.dayWidth;
const inPage=(iso,page)=>parse(iso)>=parse(page.start)&&parse(iso)<=parse(page.end);
function rect(x,y,w,h,fill,extra=''){
  return '<rect x="'+num(x)+'" y="'+num(y)+'" width="'+num(Math.max(0,w))+'" height="'+num(Math.max(0,h))+'" fill="'+fill+'" '+extra+'/>';
}
function line(x,y,x2,y2,color='#CDD6DE',width=.25,dash=''){
  return '<path d="M'+num(x)+' '+num(y)+' L'+num(x2)+' '+num(y2)+'" fill="none" stroke="'+color+'" stroke-width="'+width+'"'+(dash?' stroke-dasharray="'+dash+'"':'')+'/>';
}
function txt(x,y,value,size=3,fill='#263A48',extra=''){
  return '<text x="'+num(x)+'" y="'+num(y)+'" font-size="'+num(size)+'" fill="'+fill+'" font-family="Arial,Helvetica,sans-serif" '+extra+'>'+esc(value)+'</text>';
}
const fmtStatus=status=>({green:'Grün',amber:'Gelb',red:'Rot',neutral:'Neutral'})[status]||'Neutral';
function paperTint(color) {
  const match=/^#([0-9a-f]{6})$/i.exec(String(color||''));
  if(!match)return '#E9EFF2';
  const value=match[1],channels=[0,2,4].map(i=>parseInt(value.slice(i,i+2),16));
  return '#'+channels.map(channel=>Math.round(channel*.23+255*.77).toString(16).padStart(2,'0')).join('');
}
function colorsFor(projection,options) {
  if(options.color===false)return {work:'#747D86',critical:'#39454F',milestone:'#3C4B58',gate:'#606C76',phase:'#E7EAED',grid:'#D3D8DC',text:'#253340',muted:'#52616B',risk:'#464E56',marker:'#505F6A',today:'#111827'};
  return {work:'#28798B',critical:'#284C6F',milestone:'#688131',gate:'#925D33',phase:'#E9EFF2',grid:'#D8E1E6',text:'#243746',muted:'#556A77',risk:'#A74732',marker:'#7355A2',today:'#B5424B'};
}
function drawAxis(page,layout,colors,options){
  const {labelWidth:label,timelineWidth:w,axisHeight:a}=layout;
  const first=parse(page.start),last=parse(page.end);
  let svg=rect(0,0,label,a,'#F3F6F8')+rect(label,0,w,a,'#F5F8FA');
  svg+=txt(2,8,'Aufgaben / Verantwortliche',3.2,colors.text,'font-weight="700"');
  let cursor=Date.UTC(new Date(first).getUTCFullYear(),new Date(first).getUTCMonth(),1);
  while(cursor<=last){
    const following=Date.UTC(new Date(cursor).getUTCFullYear(),new Date(cursor).getUTCMonth()+1,1);
    const from=Math.max(cursor,first),to=Math.min(following,last+DAY);
    const px=(from-first)/DAY*page.dayWidth,wide=(to-from)/DAY*page.dayWidth;
    if(wide>=10)svg+=txt(label+px+wide/2,5,month(cursor),3.2,colors.text,'text-anchor="middle" font-weight="700"');
    svg+=line(label+px,0,label+px,a,colors.grid,.3);
    cursor=following;
  }
  const unit=page.dayWidth*7>=11?7:page.dayWidth*30>=11?30:90;
  for(let offset=0;offset<page.days;offset+=unit){
    const start=new Date(first+offset*DAY),x=label+offset*page.dayWidth;
    const text=unit===7?'KW '+week(start):unit===30?start.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',timeZone:'UTC'}):String(start.getUTCFullYear());
    if(x+12<label+w)svg+=txt(x+1,11,text,2.7,colors.muted);
    svg+=line(x,7,x,a,colors.grid,.22);
  }
  svg+=line(0,a,label+w,a,colors.grid,.4);
  return svg;
}
function week(date){
  const d=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()));
  d.setUTCDate(d.getUTCDate()+4-(d.getUTCDay()||7));
  const begin=Date.UTC(d.getUTCFullYear(),0,1);
  return Math.ceil((((d.getTime()-begin)/DAY)+1)/7);
}
function drawRows(projection,page,layout,options,colors){
  const {labelWidth:label,timelineWidth:w,axisHeight:a,fontSize}=layout;
  const elems=options.elements||{};
  let svg='',y=a;const centers=new Map(),progressPoints=[];
  for(const [index,row] of page.rows.entries()){
    const height=row.height,phase=row.kind==='phase';
    const bg=phase?(options.color===false?'#E8EAED':paperTint(row.color)):index%2===0?'#FFFFFF':'#F8FAFB';
    svg+=rect(0,y,label+w,height,bg);
    if(!phase&&elems.phases!==false&&row.phaseId) {
      const selected=projection.phases.find(p=>String(p.id)===String(row.phaseId));
      if(selected)svg+=rect(0,y,1.4,height,options.color===false?'#B3BBC1':paperTint(selected.color));
    }
    if(elems.weekends!==false&&page.dayWidth>=.65){
      for(let d=0;d<page.days;d++) {
        const dt=new Date(parse(page.start)+d*DAY).getUTCDay();
        if(dt===0||dt===6)svg+=rect(label+d*page.dayWidth,y,page.dayWidth,height,'#F1F3F5');
      }
    }
    if(elems.holidays){
      for(const holiday of projection.holidays)if(inPage(holiday.date,page))svg+=rect(label+xOf(holiday.date,page),y,page.dayWidth,height,'#EDE4E4');
    }
    const titleSize=fontSize*25.4/72,metaSize=Math.max(8,fontSize-1)*25.4/72;
    let base=y+3.7,step=titleSize*1.28;
    for(const name of row.titleLines) {svg+=txt(2,base,name,titleSize,colors.text,phase?'font-weight="700"':'font-weight="600"');base+=step;}
    for(const meta of row.metaLines){svg+=txt(2,base,meta,metaSize,colors.muted);base+=metaSize*1.28;}
    svg+=line(label,y,label,y+height,colors.grid,.35);
    svg+=line(0,y+height,label+w,y+height,colors.grid,.25);
    const center=y+height/2;centers.set(String(row.id),{center,row});
    if(phase) {
      const start=Math.max(parse(row.start),parse(page.start)),end=Math.min(parse(row.end),parse(page.end));
      if(start<=end)svg+=rect(label+((start-parse(page.start))/DAY)*page.dayWidth,center-1.65,
        ((end-start)/DAY+1)*page.dayWidth,3.3,colors.phase,'stroke="#9DAFBC" stroke-width=".35"');
      y+=height;continue;
    }
    if(elems.baselines!==false&&row.baselineStart&&row.baselineEnd){
      const bs=Math.max(parse(row.baselineStart),parse(page.start)),be=Math.min(parse(row.baselineEnd),parse(page.end));
      if(Number.isFinite(bs)&&Number.isFinite(be)&&bs<=be)
        svg+=rect(label+(bs-parse(page.start))/DAY*page.dayWidth,center+3.8,(be-bs+DAY)/DAY*page.dayWidth,.9,'#536A78');
    }
    if(elems.buffer!==false&&Number(row.bufferDays)>0){
      const bs=parse(row.end)+DAY,be=bs+Math.min(365,Number(row.bufferDays))*DAY-DAY;
      const from=Math.max(bs,parse(page.start)),to=Math.min(be,parse(page.end));
      if(from<=to)svg+=rect(label+(from-parse(page.start))/DAY*page.dayWidth,center-1.7,(to-from+DAY)/DAY*page.dayWidth,3.4,'#DDE5EA','stroke="#667987" stroke-dasharray="1,1" stroke-width=".25"');
    }
    const left=Math.max(parse(row.start),parse(page.start)),right=Math.min(parse(row.end),parse(page.end));
    if(left>right){y+=height;continue;}
    const lx=label+(left-parse(page.start))/DAY*page.dayWidth;
    const rw=Math.max(page.dayWidth,(right-left+DAY)/DAY*page.dayWidth);
    const kind=row.type||'workstream';
    const fill=kind==='critical'?colors.critical:kind==='milestone'?colors.milestone:kind==='gate'?colors.gate:colors.work;
    if(kind==='milestone'||kind==='gate'){
      const target=parse(row.start)>=parse(page.start)&&parse(row.start)<=parse(page.end)?parse(row.start):parse(row.end);
      if(target>=parse(page.start)&&target<=parse(page.end)){
        const trueX=label+(target-parse(page.start))/DAY*page.dayWidth+page.dayWidth/2;
        const radius=2.7,xx=Math.max(label+radius+.2,Math.min(label+w-radius-.2,trueX));
        if(Math.abs(xx-trueX)>.2)svg+=line(trueX,center,xx,center,fill,.35,'1,.5');
        const points=[[xx,center-radius],[xx+radius,center],[xx,center+radius],[xx-radius,center]].map(p=>p.map(num).join(',')).join(' ');
        svg+='<polygon points="'+points+'" fill="'+fill+'" stroke="#FFFFFF" stroke-width=".4"/>';
        if(kind==='gate')svg+=rect(xx-.85,center-.85,1.7,1.7,'#FFFFFF');
      }
    } else {
      svg+=rect(lx,center-2.2,rw,4.4,fill,'rx=".75"');
      if(elems.progress!==false){const progress=Math.min(100,Math.max(0,Number(row.progress)||0));
        if(progress>0)svg+=rect(lx,center-2.2,rw*progress/100,4.4,'#1C3444','opacity=".34" rx=".5"');}
      if(parse(row.start)<parse(page.start))svg+=txt(lx+.8,center+1.2,'‹',3.6,'#FFFFFF','font-weight="700"');
      if(parse(row.end)>parse(page.end))svg+=txt(lx+rw-2,center+1.2,'›',3.6,'#FFFFFF','font-weight="700"');
    }
    if(elems.statusLine){
      const percentage=Math.min(100,Math.max(0,Number(row.progress)||0))/100;
      const date=parse(row.start)+(parse(row.end)-parse(row.start))*percentage;
      if(date>=parse(page.start)&&date<=parse(page.end))
        progressPoints.push([label+(date-parse(page.start))/DAY*page.dayWidth+page.dayWidth/2,center]);
    }
    if(elems.risk&&['high','critical'].includes(row.risk))
      svg+=txt(label+w-3,center+1.3,'!',3.7,colors.risk,'text-anchor="end" font-weight="700"');
    y+=height;
  }
  // The grid is date-based, never based on the current viewport.
  const bottom=y;
  const step=page.dayWidth*7>=8?7:30;
  for(let d=0;d<page.days;d+=step) {
    const xx=label+d*page.dayWidth;svg+=line(xx,a,xx,bottom,colors.grid,.18);
  }
  if(elems.markers!==false||elems.relative){
    for(const marker of projection.markers)if(inPage(marker.date,page)&&(marker.kind==='relative'?elems.relative:elems.markers!==false)){
      const xx=label+xOf(marker.date,page)+page.dayWidth/2;
      svg+=line(xx,a,xx,bottom,colors.marker,.4,'1.2,1');
      svg+=txt(Math.min(xx+1,label+w-2),a-1,marker.name||'Marker',2.5,colors.marker,'text-anchor="end"');
    }
  }
  if(elems.today!==false){
    const today=new Date().toISOString().slice(0,10);
    if(inPage(today,page)) {
      const xx=label+xOf(today,page)+page.dayWidth/2;
      svg+=line(xx,a,xx,bottom,colors.today,.55,'2,1');
      svg+=txt(Math.min(xx+4,label+w-1),a-1,'Heute',2.6,colors.today,'text-anchor="end"');
    }
  }
  if(elems.dependencies){
    for(const row of page.rows)if(row.kind==='task'){
      const target=centers.get(String(row.id));
      for(const id of (Array.isArray(row.dependencies)?row.dependencies:[])){
        const origin=centers.get(String(id));if(!origin)continue;
        const sourceDate=origin.row.end,targetDate=row.start;
        if(!inPage(sourceDate,page)||!inPage(targetDate,page))continue;
        const from=label+xOf(sourceDate,page)+page.dayWidth,to=label+xOf(targetDate,page);
        const turn=Math.max(from+2,Math.min(to-1,from+5));
        svg+='<path d="M'+num(from)+' '+num(origin.center)+' H'+num(turn)+' V'+num(target.center)+' H'+num(to)+'" stroke="#596A78" stroke-width=".5" fill="none" stroke-dasharray="1.1,.7"/>';
        svg+='<path d="M'+num(to-1.6)+' '+num(target.center-1)+' L'+num(to)+' '+num(target.center)+' L'+num(to-1.6)+' '+num(target.center+1)+'" stroke="#596A78" stroke-width=".5" fill="none"/>';
      }
    }
  }
  if(elems.statusLine&&progressPoints.length>1){
    const progressColor=options.color===false?'#596671':'#BB4D37';
    svg+='<polyline points="'+progressPoints.map(([x,y])=>num(x)+','+num(y)).join(' ')+'" fill="none" stroke="'+progressColor+'" stroke-width=".8" stroke-dasharray="2,1.1"/>';
    for(const [x,y] of progressPoints)svg+='<circle cx="'+num(x)+'" cy="'+num(y)+'" r=".8" fill="'+progressColor+'"/>';
  }
  if(page.rows.length===0)svg+=txt(4,a+12,'Keine Aufgaben im gewählten Zeitraum.',4,colors.muted);
  return svg;
}
export function renderPrintPage(projection,layout,page,options={}){
  const c=colorsFor(projection,options),w=layout.usableWidth,h=layout.axisHeight+layout.rowSpace;
  const title=options.reportTitle||projection.projectName;
  const header=layout.settings.header
    ?'<header class="print-header"><div><strong>'+esc(title)+'</strong><small>'+esc(projection.projectName)+' · '+day(projection.start)+' – '+day(projection.end)+'</small></div><span>Revision '+esc(projection.revision)+' · Stand '+day(projection.printedAt.slice(0,10))+'</span></header>'
    :'<div class="print-spacer"></div>';
  const footer=layout.settings.footer
    ?'<footer class="print-footer"><span>'+esc(options.footerNote||projection.projectName)+'</span><span>Abschnitt '+(page.timeIndex+1)+'/'+page.timeCount+' · Zeilen '+(page.rowIndex+1)+'/'+page.rowCount+' · Seite '+page.number+'/'+page.total+'</span></footer>':'';
  const legend=layout.settings.legend?'<div class="print-legend">■ Vorgang &nbsp; ◆ Meilenstein / Gate &nbsp; ┄ Baseline / Puffer &nbsp; │ Stichtag</div>':'';
  const svg='<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Zeitplan '+esc(day(page.start))+' bis '+esc(day(page.end))+'" width="'+num(w)+'mm" height="'+num(h)+'mm" viewBox="0 0 '+num(w)+' '+num(h)+'">'+drawAxis(page,layout,c,options)+drawRows(projection,page,layout,options,c)+'</svg>';
  return '<section class="print-page" data-print-page="'+page.number+'" style="width:'+layout.pageWidth+'mm;height:'+layout.pageHeight+'mm;padding:'+layout.margin+'mm"><div class="print-inner">'+header+'<div class="print-chart">'+svg+'</div>'+legend+footer+'</div></section>';
}
export function printStyles(layout){
  return '@page{size:'+layout.pageWidth+'mm '+layout.pageHeight+'mm;margin:0}'+
    '*{box-sizing:border-box}html,body{padding:0;margin:0;background:#FFFFFF;color:#243746;font-family:Arial,Helvetica,sans-serif}'+
    '.print-page{display:block;background:#FFF;overflow:hidden;break-after:page;page-break-after:always;position:relative;}'+
    '.print-page:last-child{break-after:auto;page-break-after:auto}'+
    '.print-inner{width:100%;height:100%;display:flex;flex-direction:column;min-height:0}'+
    '.print-header{height:'+layout.topHeight+'mm;flex-shrink:0;display:flex;justify-content:space-between;gap:4mm;align-items:center;border-bottom:.4mm solid #DDE5EA;padding:0 0 2mm;font-size:8pt}'+
    '.print-header strong{display:block;font-size:12pt;font-weight:700}.print-header small{display:block;font-size:8pt;color:#526778}.print-header>span{color:#526778}'+
    '.print-spacer{height:'+layout.topHeight+'mm;flex-shrink:0}.print-chart{height:'+(layout.axisHeight+layout.rowSpace)+'mm;flex-shrink:0}'+
    '.print-chart svg{display:block;overflow:hidden}.print-legend{height:'+layout.legendHeight+'mm;display:flex;align-items:center;font-size:8pt;color:#526778;white-space:nowrap}'+
    '.print-footer{height:'+layout.bottomHeight+'mm;display:flex;align-items:end;justify-content:space-between;border-top:.3mm solid #DDE5EA;font-size:8pt;color:#526778}'+
    '@media print{html,body{width:'+layout.pageWidth+'mm!important} .print-page{box-shadow:none!important;outline:0!important;}}';
}
export function renderPrintDocument(projection,layout,options={}){
  const styles=printStyles(layout);
  return '<!doctype html><html lang="de"><head><meta charset="utf-8"><title>'+esc(options.reportTitle||projection.projectName)+'</title><style>'+styles+'</style></head><body>'+
    layout.pages.map(page=>renderPrintPage(projection,layout,page,options)).join('')+'</body></html>';
}
