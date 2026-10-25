import test from 'node:test';import assert from 'node:assert/strict';
import {autoLyrics,normalizeIdentity,selectBestMatch} from '../lib/lyrics-auto.js';
import {PALETTES,themeKind} from '../lib/visual-engine.js';
test('Swift Stage72 palettes present',()=>{assert.equal(Object.keys(PALETTES).length,27);assert.equal(PALETTES.ACID[1],'#1ad91a');assert.equal(themeKind('XEROX SERPENTINE'),2)});
test('identity normalization',()=>assert.equal(normalizeIdentity('É!'),'e'));
test('avoids wrong artist',()=>assert.equal(selectBestMatch([{trackName:'A',artistName:'B',syncedLyrics:'x'}],{title:'A',artist:'C'}),null));
test('automatic lyrics with known API',async()=>{const before=globalThis.fetch;globalThis.fetch=async()=>({ok:true,json:async()=>({syncedLyrics:'[00:01.50]Hello'})});try{const r=await autoLyrics({title:'Song',artist:'Artist',duration:240});assert.equal(r.lines.length,1)}finally{globalThis.fetch=before}});
