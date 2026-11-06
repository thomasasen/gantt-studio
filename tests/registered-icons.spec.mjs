import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {icon} from '../assets/js/icons.mjs';

test('all static HTML icon placeholders have a registered SVG glyph',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const names=[...html.matchAll(/data-icon="([^"]+)"/g)].map(match=>match[1]);
 assert.ok(names.length>10);
 for(const name of names)assert.doesNotThrow(()=>icon(name),'Unknown data-icon: '+name);
});
