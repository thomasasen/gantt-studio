// Shared, deterministic annotation policy for chart images and printed timelines.
// No DOM measurements, no viewport dependence, no mutation of project data.
export const LABEL_DEFAULTS=Object.freeze({
 enabled:true,tracks:4,leaderLines:true,ellipsis:true,twoLine:true,maxWidth:240,placement:'auto',
 groups:Object.freeze({name:true,progress:true,owner:false,dates:false,phase:false,status:false,risk:false})
});
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const statusName=Object.freeze({green:'Grün',amber:'Gelb',red:'Rot',neutral:'Neutral'});
const riskName=Object.freeze({low:'Niedriges Risiko',medium:'Mittleres Risiko',high:'Hohes Risiko',critical:'Kritisches Risiko'});
const format=date=>new Intl.DateTimeFormat('de-DE',{timeZone:'UTC',day:'2-digit',month:'2-digit',year:'2-digit'}).format(new Date(date+'T00:00:00Z'));

export function resolveLabelConfig(value){
 const raw=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
 const groups=raw.groups&&typeof raw.groups==='object'&&!Array.isArray(raw.groups)?raw.groups:{};
 return {
  enabled:raw.enabled===undefined?LABEL_DEFAULTS.enabled:raw.enabled===true,
  tracks:clamp(Math.round(Number(raw.tracks)||LABEL_DEFAULTS.tracks),1,4),
  leaderLines:raw.leaderLines===undefined?LABEL_DEFAULTS.leaderLines:raw.leaderLines===true,
  ellipsis:raw.ellipsis===undefined?LABEL_DEFAULTS.ellipsis:raw.ellipsis===true,
  twoLine:raw.twoLine===undefined?LABEL_DEFAULTS.twoLine:raw.twoLine===true,
  maxWidth:clamp(Number(raw.maxWidth)||LABEL_DEFAULTS.maxWidth,120,480),
  placement:['auto','inside','outside','above','below'].includes(raw.placement)?raw.placement:LABEL_DEFAULTS.placement,
  groups:Object.fromEntries(Object.entries(LABEL_DEFAULTS.groups).map(([key,fallback])=>[key,groups[key]===undefined?fallback:groups[key]===true]))
 };
}

export function barAnnotation(row,settings,rawConfig){
 const config=resolveLabelConfig(rawConfig);
 if(!config.enabled)return '';
 const group=config.groups,parts=[];
 const milestone=['milestone','gate'].includes(row.type);
 if(group.name&&settings.names!==false&&row.name)parts.push(String(row.name));
 if(group.phase&&settings.phases!==false&&row.type!=='phase-summary'&&row.phaseName)parts.push(String(row.phaseName));
 if(group.progress&&settings.progress!==false&&!milestone&&Number.isFinite(Number(row.progress)))
  parts.push(clamp(Math.round(Number(row.progress)),0,100)+' %');
 if(group.owner&&settings.owners!==false&&row.owner)parts.push(String(row.owner));
 if(group.dates&&settings.dates!==false&&row.start&&row.end)parts.push(format(row.start)+' – '+format(row.end));
 if(group.status&&settings.status!==false&&row.status&&row.status!=='neutral')parts.push(statusName[row.status]||String(row.status));
 if(group.risk&&settings.risks!==false&&row.risk&&row.risk!=='none')parts.push(riskName[row.risk]||String(row.risk));
 return parts.join(' · ');
}

// Word-safe SVG lines. Estimate Arial glyph width conservatively so browser text
// measurements cannot shift placements beyond the chart canvas.
export function wrapAnnotation(text,maxWidth,{fontSize=12,twoLine=true,ellipsis=true}={}){
 const content=String(text||'').trim();
 if(!content)return [];
 const capacity=Math.max(4,Math.floor(maxWidth/(fontSize*.9)));
 const maxLines=twoLine?2:1;
 const words=content.split(/\s+/),lines=[];
 let active='';
 for(const word of words){
  let pending=word;
  while(pending.length>capacity){
   if(active){lines.push(active);active='';}
   lines.push(pending.slice(0,capacity));
   pending=pending.slice(capacity);
  }
  if(pending){
   if(!active)active=pending;
   else if((active+' '+pending).length<=capacity)active+=' '+pending;
   else{lines.push(active);active=pending;}
  }
 }
 if(active)lines.push(active);
 if(ellipsis&&lines.length>maxLines){
  const clipped=lines.slice(0,maxLines);
  clipped[maxLines-1]=clipped[maxLines-1].slice(0,capacity-1).trimEnd()+'…';
  return clipped;
 }
 return lines;
}

// Positions are entirely contained within a dedicated task row. This avoids
// annotation collisions between tasks and guarantees no right-side clipping.
export function planBarAnnotation({text,barStart,barEnd,timelineWidth,rowHeight,config:rawConfig,fontSize=12,isMilestone=false,trackIndex=0}){
 const config=resolveLabelConfig(rawConfig);
 if(!text||!config.enabled)return null;
 const padding=8,maximum=Math.max(36,Math.min(config.maxWidth,timelineWidth-2*padding));
 const lines=wrapAnnotation(text,maximum,{fontSize,twoLine:config.twoLine,ellipsis:config.ellipsis});
 const fullLength=lines.reduce((m,line)=>Math.max(m,line.length),0);
 const labelW=Math.min(maximum,Math.ceil(fullLength*fontSize*.9+4));
 const lineH=fontSize+3,blockH=lines.length*lineH;
 const a=clamp(barStart,0,timelineWidth),b=clamp(barEnd,0,timelineWidth);
 const availableRight=timelineWidth-b-padding,availableLeft=a-padding;
 const fitsInside=!isMilestone&&lines.length===1&&(b-a>=labelW+16);
 const priority=config.placement;
 let mode;
 if(priority==='inside'&&fitsInside)mode='inside';
 else if(priority==='outside'&&availableRight>=labelW+7)mode='right';
 else if(priority==='above'||priority==='below')mode=priority;
 else if(fitsInside&&priority==='auto')mode='inside';
 else if(availableRight>=labelW+7)mode='right';
 else if(availableLeft>=labelW+7)mode='left';
 else mode='above';
 if(mode==='above'&&config.tracks>1&&trackIndex%2===1)mode='below';
 if(mode==='inside'&&!fitsInside)mode=availableRight>=labelW+7?'right':'above';
 if(mode==='right'&&availableRight<labelW+7)mode='above';
 const safeH=Math.max(rowHeight,blockH+25);
 const barCenter=safeH*.58;
 let x=0,y=0;
 if(mode==='inside'){x=clamp(a+8,padding,Math.max(padding,timelineWidth-labelW-padding));y=barCenter-blockH/2;}
 if(mode==='right'){x=b+6;y=barCenter-blockH/2;}
 if(mode==='left'){x=a-6-labelW;y=barCenter-blockH/2;}
 if(mode==='above'||mode==='below'){
   x=clamp((a+b)/2-labelW/2,padding,Math.max(padding,timelineWidth-labelW-padding));
   y=mode==='above'?3:safeH-blockH-3;
 }
 x=clamp(x,padding,Math.max(padding,timelineWidth-labelW-padding));
 y=clamp(y,2,Math.max(2,safeH-blockH-2));
 return {text,lines,x,y,width:labelW,height:blockH,mode,
  leader:config.leaderLines&&mode!=='inside',
  barCenter,visibleText:lines.join(' '),truncated:config.ellipsis&&lines.join(' ').replace(/…$/,'')!==text&&lines.at(-1)?.endsWith('…')};
}

export function printBarAnnotation(row,settings,config){
 return barAnnotation(row,settings,config);
}
