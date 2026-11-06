const {test,expect}=require('@playwright/test');
const {execFileSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');

const temporary=path.resolve('assets/js/gantt-main-benchmark.mjs');

test('same-run main vs Native adapter renderer baseline',async({page,browser})=>{
  test.setTimeout(180000);
  const baseSha=execFileSync('git',['rev-parse','origin/main'],{encoding:'utf8'}).trim();
  const source=execFileSync('git',['show',baseSha+':assets/js/gantt.js'],{encoding:'utf8'});
  fs.writeFileSync(temporary,source,'utf8');
  try{
    await page.goto('/');
    const numbers=await page.evaluate(async()=>{
      const {renderGantt:renderOld}=await import('/assets/js/gantt-main-benchmark.mjs');
      const {createNativeEngine}=await import('/assets/js/engine/native/native-adapter.mjs?v=2.8.0');
      const cases=[0,1,25,250,1000],out=[];
      const iso=n=>new Date(Date.UTC(2026,3,1+n)).toISOString().slice(0,10);
      const median=a=>a.slice().sort((x,y)=>x-y)[Math.floor(a.length/2)];
      for(const n of cases){
        const project={id:'baseline',name:'Baseline',
          tasks:Array.from({length:n},(_,i)=>({
            id:'t'+i,name:'Baseline '+i,type:'workstream',
            start:iso(i%30),end:iso(i%30+4),progress:i%100,
            status:'neutral',risk:'none',showInGantt:true,phaseId:'',
            displayOrder:i,dependencies:[]
          })),
          planning:{phases:[],holidays:[],markers:[],settings:{
            showToday:false,showStatusLine:false,showDependencies:false,
            showWeekends:true,showHolidays:true
          }}
        };
        const stage=document.createElement('div');
        stage.style.cssText='position:absolute;left:-100000px;top:0';
        document.body.appendChild(stage);
        const old=[],native=[],adapter=createNativeEngine();
        adapter.mount({container:stage,onIntent:async()=>{},onError:()=>{},onSelect:()=>{}});
        try{
          for(let i=0;i<5;i++){
            const oldStart=performance.now();
            renderOld(stage,project,{zoom:'day',reorderable:true,onTaskChange:()=>{}});
            old.push(performance.now()-oldStart);
            const newStart=performance.now();
            adapter.render({project,view:{zoom:'day',reorderable:true}});
            native.push(performance.now()-newStart);
          }
        }finally{adapter.destroy();stage.remove();}
        const oldMs=Math.round(median(old)*100)/100;
        const nativeMs=Math.round(median(native)*100)/100;
        out.push({taskCount:n,mainMs:oldMs,nativeMs,
          differencePercent:oldMs>0?Math.round((nativeMs/oldMs-1)*1000)/10:null,
          samples:{main:old,native}});
      }
      return out;
    });
    expect(numbers.map(x=>x.taskCount)).toEqual([0,1,25,250,1000]);
    fs.mkdirSync('performance-results',{recursive:true});
    fs.writeFileSync('performance-results/main-comparison.json',
      JSON.stringify({baseSha,branch:'refactor/engine-abstraction',
        browserVersion:browser.version(),dateUtc:new Date().toISOString(),
        method:'five alternating same-browser renders; medians; renderer vs adapter',
        results:numbers},null,2)+'\n');
    console.log('NATIVE_VS_MAIN_BENCHMARK '+JSON.stringify(numbers.map(
      ({taskCount,mainMs,nativeMs,differencePercent})=>({
        taskCount,mainMs,nativeMs,differencePercent
      }))));
  }finally{
    if(fs.existsSync(temporary))fs.unlinkSync(temporary);
  }
});
