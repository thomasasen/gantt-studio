import {readFile,copyFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));
const home=resolve(root,'node_modules/dhtmlx-gantt');
const pkg=JSON.parse(await readFile(resolve(home,'package.json'),'utf8'));
if(pkg.version!=='10.0.3'||pkg.license!=='MIT')throw new Error('Unexpected DHTMLX package/version/license: '+pkg.version+'/'+pkg.license);
const vendor=resolve(root,'vendor');
await mkdir(vendor,{recursive:true});
for(const name of ['dhtmlxgantt.js','dhtmlxgantt.css']){
  const source=resolve(home,'codebase',name);
  await copyFile(source,join(vendor,name));
}
const license=await readFile(resolve(home,'LICENSE.md'),'utf8');
if(!license.includes('MIT'))throw new Error('MIT notice missing');
await writeFile(join(vendor,'LICENSE.dhtmlx.md'),license);
console.log('DHTMLX Gantt Community 10.0.3 (MIT): local offline assets verified');
