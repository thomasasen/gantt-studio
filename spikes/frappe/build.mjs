import {readFile, copyFile, mkdir, writeFile} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const home=fileURLToPath(new URL('.',import.meta.url));
const pkg=JSON.parse(await readFile(resolve(home,'node_modules/frappe-gantt/package.json'),'utf8'));
if(pkg.version!=='1.2.2' || pkg.license!=='MIT')
  throw new Error('Unexpected Frappe Gantt package version or license.');
const vendor=resolve(home,'vendor');
await mkdir(vendor,{recursive:true});
for(const filename of ['frappe-gantt.umd.js','frappe-gantt.css'])
  await copyFile(resolve(home,'node_modules/frappe-gantt/dist',filename),join(vendor,filename));
const license=await readFile(resolve(home,'node_modules/frappe-gantt/license.txt'),'utf8');
await writeFile(join(vendor,'LICENSE.frappe.txt'),license);
console.log('Frappe 1.2.2 local UMD/CSS and MIT notice bundled. No runtime CDN.');
