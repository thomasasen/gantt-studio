// Engine-independent, single-image export of the *complete* Gantt diagram.
// No viewport screenshot, DOM cloning, page slicing, ZIP, or external dependencies.
import { add, days } from './print-model.mjs?v=2.10.0';

const safeText=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeColor=(value,fallback)=>/^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(String(value||''))?value:fallback;
const stem=value=>String(value||'projektplan').normalize('NFKD')
  .replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||'projektplan';
const fmt=date=>new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'UTC'}).format(new Date(date+'T00:00:00Z'));
const clamp=(value,lo,hi)=>Math.max(lo,Math.min(hi,value));
const isoToday=()=>new Date().toISOString().slice(0,10);

export function createGanttChartSvg(projection){
  if(!projection||!projection.settings)throw new Error('Keine Projektansicht für den Bildexport vorhanden.');
  const {settings:s,rows,from,to}=projection;
  const count=days(from,to)+1;
  if(!Number.isFinite(count)||count<1||count>20000)throw new RangeError('Der Zeitraum kann nicht als Bild dargestellt werden.');
  const labelWidth=clamp(340+(s.labelWidth-57)*2.3,280,620);
  const gutter=24,header=115,footer=s.footer?32:18;
  const rowH=clamp(s.rowHeight*4.8,38,78);
  const timeWidth=Math.min(7900-labelWidth-gutter,Math.max(250,count*12*s.scale/100));
  const dayWidth=timeWidth/count;
  const width=Math.ceil(labelWidth+timeWidth+gutter);
  const height=Math.ceil(header+rows.length*rowH+footer);
  const xml=[];
  const chartLeft=labelWidth;
  const chartRight=chartLeft+timeWidth;
  const barY=index=>header+index*rowH+rowH/2;
  const barX=date=>chartLeft+days(from,date)*dayWidth;
  const colors=projection.colors||{};
  const taskColor=(row)=>{
    if(!s.color)return '#577589';
    if(row.type==='phase-summary')return safeColor(row.phaseColor,'#b3d5de');
    if(row.type==='milestone')return safeColor(colors.milestone,'#94703a');
    if(row.type==='gate')return safeColor(colors.gate,'#9c603f');
    return row.status==='red'?safeColor(colors.critical,'#b65b54'):safeColor(colors.workstream,'#287f8a');
  };
  const rect=(x,y,w,h,fill,extra='')=>'<rect x="'+x+'" y="'+y+'" width="'+Math.max(0,w)+'" height="'+Math.max(0,h)+'" fill="'+fill+'" '+extra+'/>';
  const line=(x1,y1,x2,y2,color='#dde6ea',sw=1,extra='')=>'<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'" stroke="'+color+'" stroke-width="'+sw+'" '+extra+'/>';
  const label=(x,y,txt,size=12,color='#253b4a',extra='')=>'<text x="'+x+'" y="'+y+'" font-family="Arial,Helvetica,sans-serif" font-size="'+size+'" fill="'+color+'" '+extra+'>'+safeText(txt)+'</text>';
  const truncate=(value,max)=>{const str=String(value||'');return str.length>max?str.slice(0,max-1)+'…':str;};

  xml.push('<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+height+'" viewBox="0 0 '+width+' '+height+'" role="img" aria-label="'+safeText('Gantt-Diagramm '+projection.name)+'">');
  xml.push('<defs><clipPath id="timeline-clip">'+rect(chartLeft,header,timeWidth,rows.length*rowH,'#fff')+'</clipPath>'+
    '<marker id="gantt-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#687b8b"/></marker></defs>');
  xml.push(rect(0,0,width,height,'#fff'));
  xml.push(rect(0,0,width,64,'#f1f6f8'));
  xml.push(rect(0,0,6,64,safeColor(colors.workstream,'#287f8a')));
  xml.push(label(24,31,truncate(s.title||projection.name,105),21,'#20374e','font-weight="700"'));
  xml.push(label(24,52,'Gantt-Diagramm · '+fmt(from)+' – '+fmt(to)+' · '+rows.length+' Zeilen',12,'#566e7e'));
  xml.push(rect(0,64,width,51,'#e6eff3'));
  xml.push(label(20,91,'AUFGABE / PHASE',12,'#3e5869','font-weight="700"'));
  xml.push(line(0,114,width,114,'#c8d8df',1.5));
  xml.push(line(chartLeft,64,chartLeft,header+rows.length*rowH,'#c1d2d9',1.3));
  xml.push(label(chartLeft+9,82,'ZEITACHSE',11,'#3e5869','font-weight="700"'));
  const tickStep=Math.max(1,Math.ceil(115/dayWidth));
  for(let d=0;d<count;d+=tickStep){
    const date=add(from,d),x=chartLeft+d*dayWidth;
    xml.push(line(x,91,x,header+rows.length*rowH,'#e0e8ec',.8));
    xml.push(label(x+5,105,fmt(date),10,'#526b79'));
  }
  if(s.weekends&&dayWidth>=3){
    for(let d=0;d<count;d++){
      const weekday=new Date(add(from,d)+'T00:00:00Z').getUTCDay();
      if(weekday===0||weekday===6)xml.push(rect(chartLeft+d*dayWidth,header,dayWidth,rows.length*rowH,'#f1f4f6'));
    }
  }
  if(s.holidays)for(const holiday of projection.holidays||[]){
    const d=days(from,holiday.date);if(d>=0&&d<count)xml.push(rect(chartLeft+d*dayWidth,header,Math.max(dayWidth,1),rows.length*rowH,'#fae4e1'));
  }
  if(s.markers)for(const marker of projection.markers||[]){
    const d=days(from,marker.date);if(d>=0&&d<count)xml.push(line(chartLeft+d*dayWidth,header,chartLeft+d*dayWidth,header+rows.length*rowH,'#bd894c',1.2,'stroke-dasharray="4 4"'));
  }
  const indices=new Map(rows.map((row,index)=>[String(row.id),index]));
  rows.forEach((row,index)=>{
    const y=header+index*rowH,cy=barY(index),isPhase=row.type==='phase-summary';
    if(isPhase)xml.push(rect(0,y,width,rowH,'#eaf2f5'));
    else if(index%2===1)xml.push(rect(0,y,labelWidth,rowH,'#f8fafb'));
    xml.push(line(0,y+rowH,width,y+rowH,'#e0e8ed',.9));
    const fontColor=isPhase?'#244457':'#263c4c';
    const maxLabel=Math.max(22,Math.floor((labelWidth-38)/7.2));
    xml.push(label(18,y+(s.owners&&row.owner?rowH*.43:rowH*.59),truncate(s.names?row.name:row.id,maxLabel),isPhase?13:12,fontColor,isPhase?'font-weight="700"':'font-weight="600"'));
    if(s.owners&&row.owner)xml.push(label(18,y+rowH*.75,truncate(row.owner,maxLabel),10,'#6b7e87'));
    const start=clamp(days(from,row.start)*dayWidth,0,timeWidth);
    const end=clamp((days(from,row.end)+1)*dayWidth,0,timeWidth);
    if(end>start){
      const color=taskColor(row);
      if(row.type==='milestone'||row.type==='gate'){
        const x=chartLeft+(start+end)/2,dy=clamp(rowH*.23,8,14);
        xml.push('<path d="M'+x+' '+(cy-dy)+' L'+(x+dy)+' '+cy+' L'+x+' '+(cy+dy)+' L'+(x-dy)+' '+cy+' Z" fill="'+color+'"/>');
      }else{
        const barHeight=isPhase?10:16,top=cy-barHeight/2;
        xml.push(rect(chartLeft+start,top,end-start,barHeight,color,'rx="3"'));
        if(s.progress&&Number(row.progress)>0)xml.push(rect(chartLeft+start,top,(end-start)*clamp(Number(row.progress)/100,0,1),barHeight,'#163c52','opacity=".43" rx="3"'));
      }
    }
    if(s.baseline&&row.baselineStart&&row.baselineEnd){
      const a=clamp(days(from,row.baselineStart)*dayWidth,0,timeWidth);
      const b=clamp((days(from,row.baselineEnd)+1)*dayWidth,0,timeWidth);
      if(b>a)xml.push(rect(chartLeft+a,cy+rowH*.23,b-a,2,'#7a8d98'));
    }
    if(s.buffers&&Number(row.bufferDays)>0&&row.type!=='phase-summary'){
      const a=clamp((days(from,row.end)+1)*dayWidth,0,timeWidth);
      const b=clamp((days(from,row.end)+1+Number(row.bufferDays))*dayWidth,0,timeWidth);
      if(b>a)xml.push(rect(chartLeft+a,cy-3,b-a,6,'#9caeb8','opacity=".7"'));
    }
    if(s.risks&&['high','critical'].includes(row.risk)){
      const x=clamp(barX(row.start),chartLeft+3,chartRight-3);
      xml.push('<circle cx="'+x+'" cy="'+(cy-rowH*.28)+'" r="3" fill="#c94b41"/>');
    }
  });
  if(s.dependencies){
    for(let i=0;i<rows.length;i++)for(const predecessor of rows[i].dependencies||[]){
      const sourceIndex=indices.get(String(predecessor));
      if(sourceIndex==null||sourceIndex===i)continue;
      const a=rows[sourceIndex],b=rows[i],x1=clamp(barX(add(a.end,1)),chartLeft,chartRight),x2=clamp(barX(b.start),chartLeft,chartRight);
      const y1=barY(sourceIndex),y2=barY(i);
      const mid=clamp((x1+x2)/2,chartLeft+5,chartRight-5);
      xml.push('<path d="M'+x1+','+y1+' H'+mid+' V'+y2+' H'+x2+'" fill="none" stroke="#718492" stroke-width="1.3" opacity=".85" marker-end="url(#gantt-arrow)"/>');
    }
  }
  if(s.today){
    const today=days(from,isoToday());
    if(today>=0&&today<count){
      const x=chartLeft+today*dayWidth;
      xml.push(line(x,header,x,header+rows.length*rowH,'#087e75',2,'stroke-dasharray="5 3"'));
    }
  }
  if(s.footer){
    xml.push(line(0,height-30,width,height-30,'#d5e1e6',1));
    xml.push(label(20,height-11,projection.name+' · Revision '+(projection.revision||'–'),10,'#69808d'));
  }
  xml.push('</svg>');
  return {svg:xml.join(''),width,height,rows:rows.length,from,to};
}

const toBlob=(canvas,type,quality)=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Bildkodierung fehlgeschlagen.')),type,quality));

export async function createChartImage(projection,{format='png',scale=2,jpegQuality=90}={}){
  if(!['png','jpg'].includes(format))throw new TypeError('Ungültiges Bildformat.');
  if(![1,2,3].includes(scale))throw new RangeError('Ungültige Bildauflösung.');
  const chart=createGanttChartSvg(projection);
  const pixelW=chart.width*scale,pixelH=chart.height*scale;
  if(pixelW>16000||pixelH>16000||pixelW*pixelH>64000000)
    throw new RangeError('Diagramm zu groß für ein einzelnes Bild. Bitte Zeitraum oder Aufgaben eingrenzen oder eine kleinere Bildauflösung wählen.');
  const url=URL.createObjectURL(new Blob([chart.svg],{type:'image/svg+xml;charset=utf-8'}));
  try{
    const img=new Image();
    img.src=url;
    await img.decode();
    const canvas=document.createElement('canvas');
    canvas.width=pixelW;canvas.height=pixelH;
    const ctx=canvas.getContext('2d',{alpha:false});
    if(!ctx)throw new Error('Bildexport wird vom Browser nicht unterstützt.');
    ctx.fillStyle='#fff';ctx.fillRect(0,0,pixelW,pixelH);
    ctx.drawImage(img,0,0,pixelW,pixelH);
    const blob=await toBlob(canvas,format==='png'?'image/png':'image/jpeg',clamp(jpegQuality,1,100)/100);
    return {blob,filename:stem(projection.name)+'-gantt.'+format,width:pixelW,height:pixelH};
  }finally{URL.revokeObjectURL(url);}
}

export function downloadPrintExport({blob,filename}){
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement('a');
  anchor.href=url;anchor.download=filename;anchor.hidden=true;
  document.body.append(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
