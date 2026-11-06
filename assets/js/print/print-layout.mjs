import { dateMath } from './print-projection.mjs?v=2.9.0';

const {DAY,parse,iso}=dateMath;
const PAPERS=Object.freeze({A4:[210,297],A3:[297,420]});
const clamp=(v,a,b)=>Math.min(b,Math.max(a,Number(v)||a));
const periodDays=(a,b)=>Math.round((parse(b)-parse(a))/DAY)+1;
function wrapText(text,maxWidth,fontPt=8.5){
  const chars=Math.max(8,Math.floor(maxWidth/(fontPt*25.4/72*.90)));
  const words=String(text??'').split(/\s+/),lines=[];let line='';
  for(const word of words){
    if(!word)continue;
    if(word.length>chars){
      if(line){lines.push(line);line='';}
      for(let k=0;k<word.length;k+=chars)lines.push(word.slice(k,k+chars));
    }else if((line?line.length+1:0)+word.length>chars){lines.push(line);line=word;}
    else line+=(line?' ':'')+word;
  }
  if(line)lines.push(line);
  return lines.length?lines:[''];
}
function nextBoundary(day,limit,rangeEnd) {
  const proposed=Math.min(day+(limit-1)*DAY,rangeEnd);
  if(proposed===rangeEnd||limit<30)return proposed;
  for(let n=proposed;n>=day+Math.floor(limit*.80)*DAY;n-=DAY) {
    const date=new Date(n),following=new Date(n+DAY);
    if(date.getUTCMonth()!==following.getUTCMonth())return n;
  }
  return proposed;
}
export function computePrintLayout(projection,options={}){
  const settings={paper:options.paper||'A4',orientation:options.orientation||'auto',
    margin:clamp(options.margin??10,5,25),labelWidth:clamp(options.labelWidth??74,48,125),
    density:options.density||'comfortable',strategy:options.strategy||'readable',
    scale:clamp(options.scale??100,30,250),fontSize:clamp(options.fontSize??9,8,13),
    header:options.header!==false,footer:options.footer!==false,legend:!!options.legend};
  const pair=PAPERS[settings.paper]||PAPERS.A4,span=periodDays(projection.start,projection.end);
  const landscape=settings.orientation==='auto'?(span>45||projection.rows.length>20):settings.orientation==='landscape';
  const pageWidth=landscape?pair[1]:pair[0],pageHeight=landscape?pair[0]:pair[1];
  const usableWidth=pageWidth-2*settings.margin,usableHeight=pageHeight-2*settings.margin;
  const labelWidth=Math.min(settings.labelWidth,usableWidth-35);
  const timelineWidth=usableWidth-labelWidth;
  const topHeight=settings.header?16:5,axisHeight=13,bottomHeight=settings.footer?9:2,legendHeight=settings.legend?9:0;
  const rowSpace=usableHeight-topHeight-axisHeight-bottomHeight-legendHeight;
  if(rowSpace<18)throw new RangeError('Zu wenig Platz: Bitte Seitenränder oder Papierformat ändern.');
  const baseDay=span<=31?2.8:span<=100?1.6:span<=365?.85:span<=1500?.52:.45;
  const warnings=[];
  let dayWidth;
  if(settings.strategy==='fit-width'||settings.strategy==='one-page')dayWidth=timelineWidth/span;
  else if(settings.strategy==='manual')dayWidth=baseDay*settings.scale/100;
  else dayWidth=baseDay;
  if((settings.strategy==='fit-width'||settings.strategy==='one-page')&&dayWidth<.34){
    warnings.push('Eine Seite in der Breite wäre unlesbar. Die Zeitachse wird deshalb mehrseitig gedruckt.');
    dayWidth=baseDay;
  }
  function prepareRows(font) {
    return projection.rows.map(r=>{
      const e=options.elements||{};
      const meta=[e.owners!==false?r.owner:'',e.status?'Status: '+({green:'Grün',amber:'Gelb',red:'Rot',neutral:'Neutral'}[r.status]||'Neutral'):'',
        e.progress!==false?Math.round(Number(r.progress)||0)+' %':'',
        e.dates?r.start+' – '+r.end:'',e.risk&&r.risk&&r.risk!=='none'?'Risiko: '+r.risk:''].filter(Boolean).join(' · ');
      const title=wrapText(e.names===false?'':r.name,labelWidth-7,font);
      const extra=meta?wrapText(meta,labelWidth-7,Math.max(8,font-1)):[];
      const lineHeight=font*25.4/72*1.28;
      const height=Math.max(settings.density==='compact'?9:12,(title.length+extra.length)*lineHeight+4);
      if(height>rowSpace)throw new RangeError('Aufgabe passt bei dieser Spaltenbreite nicht auf eine Druckseite. Bitte die Aufgabenspalte verbreitern.');
      return {...r,titleLines:title,metaLines:extra,height};
    });
  }
  const font=settings.fontSize,rows=prepareRows(font);
  const totalRowsHeight=rows.reduce((s,r)=>s+r.height,0);
  if(settings.strategy==='one-page'&&totalRowsHeight>rowSpace)
    warnings.push('Für eine Einzelseite müssten Aufgaben oder Schrift zu stark verkleinert werden. Lesbare Folgeseiten werden verwendet.');
  if(settings.strategy==='fit-width'&&span>730)warnings.push('Die gesamte Zeitachse auf einer Seite kann bei mehrjährigen Projekten schwer lesbar sein.');
  const daysPerPage=Math.max(1,Math.floor(timelineWidth/dayWidth)),timePages=[];
  const end=parse(projection.end);
  for(let first=parse(projection.start);first<=end;) {
    const last=nextBoundary(first,daysPerPage,end);
    timePages.push({start:iso(first),end:iso(last),days:Math.round((last-first)/DAY)+1,index:timePages.length});
    first=last+DAY;
    if(timePages.length>500)throw new RangeError('Über 500 Zeitabschnitte. Bitte einen kürzeren Zeitraum oder größeren Maßstab wählen.');
  }
  const rowPages=[];
  if(rows.length===0)rowPages.push({rows:[],from:0,to:0,index:0});
  for(let offset=0;offset<rows.length;){
    let used=0,start=offset;
    while(offset<rows.length&&(used+rows[offset].height<=rowSpace||offset===start)){
      used+=rows[offset].height;offset++;
    }
    rowPages.push({rows:rows.slice(start,offset),from:start,to:offset,index:rowPages.length});
    if(rowPages.length>500)throw new RangeError('Über 500 Aufgabenabschnitte. Bitte ein größeres Papierformat wählen.');
  }
  if(timePages.length*rowPages.length>600)throw new RangeError('Über 600 Druckseiten. Bitte ein größeres Format oder einen eingeschränkten Zeitraum wählen.');
  const pages=[];
  // Avoid blank sheets from a rectangular time-by-row grid. Every period
  // remains represented, even when all its activities are outside the slice.
  for(const time of timePages) {
    const from=parse(time.start),to=parse(time.end);
    const containsMarker=projection.markers.some(m=>parse(m.date)>=from&&parse(m.date)<=to);
    let added=0;
    for(const lines of rowPages) {
      const active=lines.rows.some(row=>{
        if(parse(row.start)<=to&&parse(row.end)>=from)return true;
        if(options.elements?.baselines!==false&&row.baselineStart&&row.baselineEnd
           &&parse(row.baselineStart)<=to&&parse(row.baselineEnd)>=from)return true;
        if(options.elements?.buffer!==false&&Number(row.bufferDays)>0
           &&parse(row.end)+Math.min(365,Number(row.bufferDays))*DAY>=from&&parse(row.end)<=to)return true;
        return false;
      });
      if(!active&&!(added===0&&containsMarker)&&rows.length!==0)continue;
      pages.push({timeIndex:time.index,rowIndex:lines.index,
        timeCount:timePages.length,rowCount:rowPages.length,
        start:time.start,end:time.end,rows:lines.rows,dayWidth,days:time.days});
      added++;
    }
    if(!added)pages.push({timeIndex:time.index,rowIndex:0,
      timeCount:timePages.length,rowCount:rowPages.length,
      start:time.start,end:time.end,rows:rowPages[0].rows,dayWidth,days:time.days});
  }
  pages.forEach((page,i)=>{page.number=i+1;page.total=pages.length;});
  if(pages.length>1)warnings.push(pages.length+' Seiten: '+timePages.length+' Zeitabschnitt(e), '+rowPages.length+' Aufgabenabschnitt(e), leere Kombinationen ausgelassen.');
  return {pageWidth,pageHeight,usableWidth,usableHeight,margin:settings.margin,labelWidth,timelineWidth,
    topHeight,axisHeight,bottomHeight,legendHeight,rowSpace,fontSize:font,settings,pages,warnings,
    timePages:timePages.length,rowPages:rowPages.length,taskCount:projection.taskCount};
}
