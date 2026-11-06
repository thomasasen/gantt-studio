// Browser-only raster export for the same immutable print sheets used by PDF preview.
// No screenshot of the on-screen Gantt viewport and no external network dependencies.
const MM_TO_PX=96/25.4;
const encoder=new TextEncoder();
const crcTable=Uint32Array.from({length:256},(_,index)=>{
  let crc=index;
  for(let bit=0;bit<8;bit++)crc=(crc&1)?(0xedb88320^(crc>>>1)):(crc>>>1);
  return crc>>>0;
});
const crc32=data=>{
  let crc=0xffffffff;
  for(const byte of data)crc=crcTable[(crc^byte)&255]^(crc>>>8);
  return (crc^0xffffffff)>>>0;
};
const fileStem=value=>String(value||'projektplan').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
  .replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||'projektplan';

function header(length){
  const bytes=new Uint8Array(length);
  return {bytes,view:new DataView(bytes.buffer)};
}

// ZIP 'stored' entries. PNG and JPG are already compressed; another compression
// pass adds CPU use without improving their size significantly.
export async function zipStoredImages(files){
  if(!files.length||files.length>65535)throw new RangeError('Ungültige Anzahl von ZIP-Dateien.');
  const chunks=[],directory=[];
  let offset=0;
  for(const file of files){
    const name=encoder.encode(file.name),data=new Uint8Array(await file.blob.arrayBuffer());
    if(name.length>65535||data.length>0xffffffff)throw new RangeError('Exportdatei ist zu groß.');
    const checksum=crc32(data),local=header(30+name.length);
    local.view.setUint32(0,0x04034b50,true);
    local.view.setUint16(4,20,true);
    local.view.setUint16(6,0x0800,true); // UTF-8 names
    local.view.setUint32(14,checksum,true);
    local.view.setUint32(18,data.length,true);
    local.view.setUint32(22,data.length,true);
    local.view.setUint16(26,name.length,true);
    local.bytes.set(name,30);
    chunks.push(local.bytes,data);
    const central=header(46+name.length);
    central.view.setUint32(0,0x02014b50,true);
    central.view.setUint16(4,20,true);
    central.view.setUint16(6,20,true);
    central.view.setUint16(8,0x0800,true);
    central.view.setUint32(16,checksum,true);
    central.view.setUint32(20,data.length,true);
    central.view.setUint32(24,data.length,true);
    central.view.setUint16(28,name.length,true);
    central.view.setUint32(42,offset,true);
    central.bytes.set(name,46);
    directory.push(central.bytes);
    offset+=local.bytes.length+data.length;
  }
  const directorySize=directory.reduce((sum,part)=>sum+part.length,0);
  if(offset+directorySize>0xffffffff)throw new RangeError('ZIP-Export überschreitet die Dateigrößengrenze.');
  const end=header(22);
  end.view.setUint32(0,0x06054b50,true);
  end.view.setUint16(8,files.length,true);
  end.view.setUint16(10,files.length,true);
  end.view.setUint32(12,directorySize,true);
  end.view.setUint32(16,offset,true);
  return new Blob([...chunks,...directory,end.bytes],{type:'application/zip'});
}

const blobFromCanvas=(canvas,type,quality)=>new Promise((resolve,reject)=>{
  canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Bild konnte nicht kodiert werden.')),type,quality);
});

export async function renderPrintSheet(sheet,{format='png',scale=2,jpegQuality=90}={}){
  if(!['png','jpg'].includes(format))throw new TypeError('Unbekanntes Bildformat.');
  if(!Number.isFinite(scale)||scale<1||scale>3)throw new RangeError('Ungültige Bildauflösung.');
  const source=sheet.ownerDocument;
  await source.fonts?.ready;
  const width=Math.ceil(parseFloat(sheet.style.width)*MM_TO_PX);
  const height=Math.ceil(parseFloat(sheet.style.height)*MM_TO_PX);
  if(!width||!height||width*height*scale*scale>50000000)throw new RangeError('Bildabmessungen überschreiten das sichere Limit.');
  const styles=[...source.querySelectorAll('head style')].map(style=>style.textContent).join('\n');
  const serial=new XMLSerializer().serializeToString(sheet.cloneNode(true));
  // SVG foreignObject preserves the exact HTML/SVG layout from the print page.
  // CSS and markup are embedded so this works offline; neither images nor fonts
  // are requested from a third-party domain.
  const markup='<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+height+'" viewBox="0 0 '+width+' '+height+'">'+
    '<foreignObject x="0" y="0" width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" '+
    'style="width:'+width+'px;height:'+height+'px;background:#fff;color:#253746;font:12px system-ui,sans-serif">'+
    '<style>'+styles.replace(/<\x2fstyle/gi,'<\\/style')+'\n.sheet{box-shadow:none!important;margin:0!important}</style>'+
    serial+'</div></foreignObject></svg>';
  const url=URL.createObjectURL(new Blob([markup],{type:'image/svg+xml;charset=utf-8'}));
  const image=new Image();
  try{
    image.src=url;
    await image.decode();
    const canvas=document.createElement('canvas');
    canvas.width=Math.round(width*scale);
    canvas.height=Math.round(height*scale);
    const ctx=canvas.getContext('2d',{alpha:false});
    if(!ctx)throw new Error('Canvas ist nicht verfügbar.');
    ctx.fillStyle='#fff';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(image,0,0,canvas.width,canvas.height);
    // Detect engines that refuse to paint foreignObject into an SVG image:
    // never silently deliver an all-white or unreadable export.
    const probe=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    let ink=false;
    for(let y=12;y<canvas.height-12&&!ink;y+=Math.max(1,Math.floor(canvas.height/70))){
      for(let x=12;x<canvas.width-12;x+=Math.max(1,Math.floor(canvas.width/100))){
        const i=(y*canvas.width+x)*4;
        if(probe[i]<235||probe[i+1]<235||probe[i+2]<235){ink=true;break;}
      }
    }
    if(!ink)throw new Error('Der Browser konnte die Druckseite nicht als Bild darstellen.');
    return blobFromCanvas(canvas,format==='png'?'image/png':'image/jpeg',jpegQuality/100);
  }finally{URL.revokeObjectURL(url);}
}

export async function createImageExport(doc,{format,scale=2,jpegQuality=90,scope='all',currentPage=1,projectName}={}){
  const pages=[...doc.querySelectorAll('.sheet')];
  if(!pages.length)throw new Error('Keine Druckseiten vorhanden.');
  const chosen=scope==='current'?[pages[Math.max(0,Math.min(pages.length-1,currentPage-1))]]:pages;
  const filenames=[],stem=fileStem(projectName),files=[];
  for(const page of chosen){
    const pageNumber=pages.indexOf(page)+1,name=stem+'-seite-'+String(pageNumber).padStart(2,'0')+'.'+format;
    files.push({name,blob:await renderPrintSheet(page,{format,scale,jpegQuality})});
    filenames.push(name);
  }
  if(files.length===1)return {blob:files[0].blob,filename:files[0].name,pages:1};
  return {blob:await zipStoredImages(files),filename:stem+'-'+format+'-seiten.zip',pages:files.length,files:filenames};
}

export function downloadPrintExport({blob,filename}){
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement('a');
  anchor.href=url;
  anchor.download=filename;
  anchor.hidden=true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
