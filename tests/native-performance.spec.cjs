const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');

/**
 * Reproducible adapter-level microbenchmark (not a user-perceived end-to-end
 * latency benchmark). No time threshold: CI hardware load varies.
 */
test('native-engine performance matrix: 0, 1, 25, 250 and 1000 tasks',async({page,browser})=>{
  test.setTimeout(180000);
  await page.goto('/');
  const browserVersion=browser.version();
  const result=await page.evaluate(async()=>{
    const {createNativeEngine}=await import('/assets/js/engine/native/native-adapter.mjs?v=2.8.0');
    const cases=[0,1,25,250,1000];
    const results=[];
    const addDays=(n)=>new Date(Date.UTC(2026,3,1+n)).toISOString().slice(0,10);
    const build=n=>({
      id:'benchmark',name:'Benchmark',
      tasks:Array.from({length:n},(_,i)=>({
        id:'task-'+i,name:'Benchmark task '+i,type:'workstream',
        start:addDays(i%30),end:addDays(i%30+4),progress:i%101,
        status:'neutral',risk:'none',showInGantt:true,phaseId:'',
        displayOrder:i,dependencies:[]
      })),
      planning:{phases:[],markers:[],holidays:[],
        settings:{showToday:false,showWeekends:true,showHolidays:true,
          showStatusLine:false,showDependencies:false}}
    });
    const median=values=>{
      const ordered=values.slice().sort((a,b)=>a-b);
      return Math.round(ordered[Math.floor(ordered.length/2)]*100)/100;
    };
    for(const n of cases){
      const timings={initial:[],rerender:[],zoom:[],filter:[],taskChange:[],
        keyboardIntent:[],mountDestroy:[]};
      for(let repetition=0;repetition<3;repetition++){
        const project=build(n);
        const host=document.createElement('section');
        host.style.cssText='position:absolute;left:-100000px;top:0';
        const stage=document.createElement('div');host.appendChild(stage);
        document.body.appendChild(host);
        let intentAt=null;
        const engine=createNativeEngine();
        const time=fn=>{const begin=performance.now();fn();return Math.round((performance.now()-begin)*100)/100;};
        try{
          const begin=performance.now();
          engine.mount({container:stage,onIntent:async()=>{intentAt=performance.now();},
            onSelect:()=>{},onError:()=>{}});
          engine.render({project,view:{zoom:'day',reorderable:true}});
          timings.initial.push(Math.round((performance.now()-begin)*100)/100);
          timings.rerender.push(time(()=>engine.render({
            project,view:{zoom:'day',reorderable:true}
          })));
          timings.zoom.push(time(()=>engine.setViewport({zoom:'week'})));
          const filtered={...project,tasks:project.tasks.slice(0,Math.ceil(n/2))};
          timings.filter.push(time(()=>engine.render({
            project:filtered,view:{zoom:'week',reorderable:true}
          })));
          const changed={...project,tasks:project.tasks.map((t,i)=>
            i===0?{...t,progress:(t.progress+10)%101}:t)};
          timings.taskChange.push(time(()=>engine.render({
            project:changed,view:{zoom:'week',reorderable:true}
          })));
          const handle=stage.querySelector('[data-gantt-order-handle]');
          if(handle){
            intentAt=null;const start=performance.now();
            handle.dispatchEvent(new KeyboardEvent('keydown',{
              key:'ArrowDown',bubbles:true,cancelable:true
            }));
            if(intentAt!==null)timings.keyboardIntent.push(
              Math.round((intentAt-start)*100)/100);
          }
          timings.mountDestroy.push(time(()=>{
            engine.destroy();
            engine.mount({container:stage,onIntent:async()=>{},
              onSelect:()=>{},onError:()=>{}});
            engine.render({project,view:{zoom:'week',reorderable:true}});
            engine.destroy();
          }));
          if(stage.childElementCount)throw Error('Leaked DOM children after destroy');
        }finally{
          engine.destroy();host.remove();
        }
      }
      results.push({taskCount:n,repetitions:3,
        metricsMs:Object.fromEntries(Object.entries(timings).map(
          ([key,values])=>[key,values.length?median(values):null]
        )),
        samplesMs:timings});
    }
    return{results,userAgent:navigator.userAgent,
      hardwareConcurrency:navigator.hardwareConcurrency||null,
      memoryApiAvailable:!!performance.memory};
  });
  expect(result.results.map(r=>r.taskCount)).toEqual([0,1,25,250,1000]);
  const artifact={
    label:'native-adapter microbenchmark, median of 3 Chromium samples',
    dateUtc:new Date().toISOString(),
    browserVersion,
    environment:{ci:!!process.env.CI,platform:process.platform,node:process.version},
    ...result
  };
  fs.mkdirSync('performance-results',{recursive:true});
  fs.writeFileSync(path.join('performance-results','native-benchmark.json'),
    JSON.stringify(artifact,null,2)+'\n');
  console.log('NATIVE_ENGINE_BENCHMARK '+JSON.stringify(result.results.map(
    ({taskCount,metricsMs})=>({taskCount,...metricsMs})
  )));
});
