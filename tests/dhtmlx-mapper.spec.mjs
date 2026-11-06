import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mapProjectToDhtmlx,dateOnlyToLocalDate,localDateToDateOnly,dhtmlxTaskToChange} from '../assets/js/engine/dhtmlx/dhtmlx-mapper.mjs';
const task=(id,start,end,extra={})=>({id,name:id,start,end,progress:50,dependencies:[],...extra});
test('calendar-only mapping retains inclusive start/end and DST boundaries',()=>{
 for(const [start,end] of [['2026-03-28','2026-03-30'],['2026-10-24','2026-10-26'],
 ['2026-12-31','2027-01-01'],['2028-02-29','2028-02-29'],['0099-12-31','0100-01-01']]){
   const mapped=mapProjectToDhtmlx({tasks:[task('A',start,end)]});
   assert.equal(localDateToDateOnly(mapped.data[0].start_date),start);
   assert.deepEqual(dhtmlxTaskToChange(mapped.data[0]),{id:'A',start,end,progress:50});
 }
 assert.equal(localDateToDateOnly(dateOnlyToLocalDate('2026-03-29')),'2026-03-29');
});
test('phase hierarchy, stable ids, links and progress',()=>{
 const p={tasks:[task('a','2026-04-01','2026-04-01',{phaseId:'p',progress:85}),
 task('b','2026-04-02','2026-04-04',{phaseId:'p',dependencies:['a'],progress:0})],
 planning:{phases:[{id:'p',name:'Phase P',start:'2026-04-01'}]}};
 const result=mapProjectToDhtmlx(p);
 assert.equal(result.data[0].id,'phase:p');
 assert.equal(result.data[1].parent,'phase:p');
 assert.equal(result.data[1].progress,.85);
 assert.deepEqual(result.links,[{id:'link:a:b',source:'a',target:'b',type:'0'}]);
 assert.deepEqual(p.tasks[0].start,'2026-04-01');
});
test('reject duplicate ids, invalid dates, and do not serialize fields',()=>{
 assert.throws(()=>mapProjectToDhtmlx({tasks:[task('x','2026-03-05','2026-03-04')]}));
 assert.throws(()=>mapProjectToDhtmlx({tasks:[task('x','2026-03-05','2026-03-05'),task('x','2026-03-05','2026-03-05')]}));
 assert.throws(()=>mapProjectToDhtmlx({tasks:[task('x','2026-02-30','2026-03-02')]}));
});
