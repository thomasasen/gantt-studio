const {test,expect}=require('@playwright/test');

test('repeated project listing and reading close IndexedDB connections',async({page})=>{
  await page.goto('/');
  const observed=await page.evaluate(async()=>{
    const {listProjects,loadProject}=await import('/assets/js/storage.js?v=2.8.0');
    const id=document.querySelector('#projectSelect').value;
    const original=IDBDatabase.prototype.close;
    let closed=0;
    IDBDatabase.prototype.close=function(...args){
      closed++;
      return original.apply(this,args);
    };
    try{
      for(let i=0;i<12;i++){
        const projects=await listProjects();
        if(!projects.some(p=>p.id===id))throw Error('Active project missing');
        const selected=await loadProject(id);
        if(selected.id!==id)throw Error('Wrong project returned');
      }
      return closed;
    }finally{IDBDatabase.prototype.close=original;}
  });
  expect(observed).toBeGreaterThanOrEqual(24);
});

test('project deletion also closes IndexedDB and never changes another active project',async({page})=>{
  await page.goto('/');
  await expect(page.locator('#projectSelect')).not.toHaveValue('');
  const response=await page.evaluate(async()=>{
    const {saveLocal,deleteProject,loadProject}=await import('/assets/js/storage.js?v=2.8.0');
    const active=document.querySelector('#projectSelect').value;
    const id='connection-probe-'+crypto.randomUUID();
    const original=IDBDatabase.prototype.close;
    let closes=0;
    IDBDatabase.prototype.close=function(...args){closes++;return original.apply(this,args);};
    try{
      await saveLocal({id,name:'Temporary probe',revision:1,tasks:[]});
      await deleteProject(id);
      const missing=await loadProject(id);
      return{closes,missing,activeAfter:localStorage.getItem('gantt-studio.active-project'),active};
    }finally{IDBDatabase.prototype.close=original;}
  });
  expect(response.missing).toBeNull();
  expect(response.activeAfter).toBe(response.active);
  expect(response.closes).toBeGreaterThanOrEqual(3);
});
