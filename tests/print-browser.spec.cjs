const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');

const EVIDENCE='print-evidence';
const REVIEW='visual-review/print';
function dir(){fs.mkdirSync(EVIDENCE,{recursive:true});fs.mkdirSync(REVIEW,{recursive:true});}
async function openPrint(page){
  await page.locator('#centralExportBtn').click();
  await page.locator('#printPdfBtn').click();
  await expect(page.locator('#printDialog')).toBeVisible();
  await expect(page.frameLocator('#printPreview iframe').locator('svg')).toBeVisible();
}
function fixture(count=60,years=4){
  const DAY=86400000,start=Date.parse('2024-01-01T00:00:00Z'),iso=x=>new Date(x).toISOString().slice(0,10);
  const tasks=Array.from({length:count},(_,i)=>{
    const at=start+Math.floor((i/(Math.max(1,count-1)))*365*years)*DAY;
    return {id:'pdf-'+i,name:'Gantt Prüfaufgabe '+i+' für Zeilen- und Zeitabschnitte',
      start:iso(at),end:iso(at+25*DAY),progress:i%101,showInGantt:true,
      type:i%9===0?'milestone':'workstream',phaseId:'phase-1',displayOrder:i,owner:'Fachteam '+i,
      status:i%3===0?'red':'green',risk:'low',bufferDays:3,baselineStart:iso(at),baselineEnd:iso(at+20*DAY),
      dependencies:i>0?['pdf-'+(i-1)]:[]};
  });
  return {schema:'gantt-studio.project',schemaVersion:1,generator:'Browser QA',project:{
    id:'print-qa',name:'Kompletter Druckplan',revision:1,tasks,design:{colors:{panelBg:'#fff',pageBg:'#fff'}},
    planning:{settings:{showDependencies:true},phases:[{id:'phase-1',name:'Projektphase',
      start:'2024-01-01',end:iso(start+365*years*DAY),color:'#E5EEF3'}],markers:[],holidays:[]}}};
}
test('Druckdialog zeigt die vollständige Projektprojektion und reagiert auf Einstellungen',async({page})=>{
  dir();await page.goto('/');await expect(page.locator('#saveStatusText')).toContainText('Gespeichert');
  await page.locator('#loadDemoBtn').click();
  const scroll=page.locator('#ganttScroller');
  await scroll.evaluate(node=>{node.scrollLeft=800;node.scrollTop=250;});
  const before=await page.evaluate(async()=>JSON.stringify(await (await import('/assets/js/storage.js?v=2.9.0')).loadActive()));
  await openPrint(page);
  await expect(page.locator('#printPageCount')).toContainText('Seite');
  const fullText=await page.frameLocator('#printPreview iframe').locator('svg').textContent();
  expect(fullText).toContain('Projekt-Kick-off');
  if(!fullText.includes('Go-live')){await page.locator('#printPageNext').click();await expect(page.frameLocator('#printPreview iframe').locator('svg')).toContainText('Go-live');}
  await page.locator('#pr-paper').selectOption('A3');
  await expect(page.frameLocator('#printPreview iframe').locator('svg')).toHaveAttribute('width',/\d+mm/);
  await page.locator('#pr-strategy').selectOption('manual');
  await expect(page.locator('#pr-scale')).toBeVisible();
  await page.locator('#pr-scale').fill('160');await page.locator('#pr-scale').dispatchEvent('change');
  await expect(page.locator('#printPageCount')).toContainText('Seite');
  await page.locator('#printDialog').screenshot({path:path.join(REVIEW,'dialog-desktop.png')});
  await page.locator('#printClose').click();await expect(page.locator('#printDialog')).toBeHidden();
  const after=await page.evaluate(async()=>JSON.stringify(await (await import('/assets/js/storage.js?v=2.9.0')).loadActive()));
  expect(after).toBe(before);
});
test('PDF verwendet vollständige SVG-Seiten statt Viewport-Screenshots',async({page,browser})=>{
  dir();await page.goto('/');
  const data=fixture(72,5);
  const rendered=await page.evaluate(async p=>{
    const {createPrintProjection}=await import('/assets/js/print/print-projection.mjs?v=2.9.0');
    const {computePrintLayout}=await import('/assets/js/print/print-layout.mjs?v=2.9.0');
    const {renderPrintDocument}=await import('/assets/js/print/print-renderer.mjs?v=2.9.0');
    const options={paper:'A4',orientation:'landscape',strategy:'readable',margin:10,labelWidth:80,
      header:true,footer:true,legend:true,elements:{names:true,markers:true,dependencies:true,baselines:true,buffer:true}};
    const projection=createPrintProjection(p.project,options);
    const layout=computePrintLayout(projection,options);
    return {html:renderPrintDocument(projection,layout,options),count:layout.pages.length,time:layout.timePages,rows:layout.rowPages};
  },data);
  expect(rendered.time).toBeGreaterThan(1);expect(rendered.rows).toBeGreaterThan(1);
  const doc=await browser.newPage({viewport:{width:1440,height:1000}});
  await doc.setContent(rendered.html,{waitUntil:'load'});
  await expect(doc.locator('.print-page')).toHaveCount(rendered.count);
  const pdf=await doc.pdf({printBackground:true,preferCSSPageSize:true});
  const file=path.join(EVIDENCE,'multi-year-A4-landscape.pdf');fs.writeFileSync(file,pdf);
  const info=execFileSync('pdfinfo',[file],{encoding:'utf8'});
  const pages=Number(info.match(/^Pages:\s*(\d+)/m)?.[1]);
  const dims=info.match(/^Page size:\s*([\d.]+) x ([\d.]+) pts/m);
  expect(pages).toBe(rendered.count);
  expect(Number(dims?.[1])).toBeGreaterThan(840);expect(Number(dims?.[2])).toBeGreaterThan(590);
  const extracted=execFileSync('pdftotext',['-layout',file,'-'],{encoding:'utf8',maxBuffer:10*1024*1024});
  expect(extracted).toContain('Gantt Prüfaufgabe 0');
  expect(extracted).toContain('Gantt Prüfaufgabe 71');
  expect(extracted).toContain('2024');
  expect(extracted).toContain('2029');
  execFileSync('pdftoppm',['-f','1','-l','1','-scale-to','1600','-png','-singlefile',file,path.join(REVIEW,'multi-year-pdf-page-1')]);
  await doc.close();
});
test('Druckvorschau bleibt bei Projektwechsel stabil und ist bei 200 Prozent bedienbar',async({page})=>{
  dir();await page.setViewportSize({width:390,height:760});await page.goto('/');
  await page.locator('#loadDemoBtn').click();
  const demo=await page.locator('#projectSelect').inputValue();
  await page.locator('#loadDemoBtn').click();
  await page.locator('#projectSelect').selectOption(demo);
  await openPrint(page);
  await expect(page.locator('#printPageCount')).toContainText('Seite');
  await page.locator('#printPreviewZoom').selectOption('100');
  await expect(page.frameLocator('#printPreview iframe').locator('svg')).toBeVisible();
  await page.locator('#printDialog').screenshot({path:path.join(REVIEW,'dialog-mobile.png')});
  await page.evaluate(()=>{document.getElementById('printClose').focus();});
  await page.keyboard.press('Escape');
  await expect(page.locator('#printDialog')).toBeHidden();
  await expect(page.locator('#projectSelect')).toHaveValue(demo);
});
test('Papierfarben sind für dunkle Projektfarben und mehrere Skalierungen neutral',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async p=>{
    const {createPrintProjection}=await import('/assets/js/print/print-projection.mjs?v=2.9.0');
    const {computePrintLayout}=await import('/assets/js/print/print-layout.mjs?v=2.9.0');
    const {renderPrintPage,printStyles}=await import('/assets/js/print/print-renderer.mjs?v=2.9.0');
    p.project.design.colors={pageBg:'#060E17',panelBg:'#142336',text:'#F0F3F8'};
    return ['A4','A3'].flatMap(paper=>['portrait','landscape'].map(orientation=>{
      const options={paper,orientation,margin:9,elements:{names:true}};
      const proj=createPrintProjection(p.project,options),lay=computePrintLayout(proj,options);
      const html=renderPrintPage(proj,lay,lay.pages[0],options);
      return {white:printStyles(lay).includes('background:#FFF'),svg:html.includes('<svg'),width:lay.pageWidth};
    }));
  },fixture(20,2));
  for(const item of result){expect(item.white).toBe(true);expect(item.svg).toBe(true);expect(item.width).toBeGreaterThan(200);}
});
