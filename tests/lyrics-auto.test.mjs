import test from 'node:test';import assert from 'node:assert/strict';
import {autoLyrics,normalizeIdentity,selectBestMatch} from '../lib/lyrics-auto.js';
import {PALETTES,themeKind} from '../lib/visual-engine.js';
test('Swift Stage72 palettes present',()=>{assert.equal(Object.keys(PALETTES).length,41);assert.equal(PALETTES.ACID[1],'#1ad91a');assert.equal(themeKind('XEROX SERPENTINE'),2)});
test('identity normalization',()=>assert.equal(normalizeIdentity('É!'),'e'));
test('avoids wrong artist',()=>assert.equal(selectBestMatch([{trackName:'A',artistName:'B',syncedLyrics:'x'}],{title:'A',artist:'C'}),null));
test('automatic lyrics with known API',async()=>{const before=globalThis.fetch;globalThis.fetch=async()=>({ok:true,json:async()=>({trackName:'Song',artistName:'Real Artist',duration:240,syncedLyrics:'[00:01.50]Hello'})});try{const r=await autoLyrics({title:'Song',artist:'Real Artist',duration:240});assert.equal(r.lines.length,1)}finally{globalThis.fetch=before}});
test('plain exact result can be upgraded to a verified synchronized alternative',async()=>{
 const before=globalThis.fetch,track={title:'Clock Upgrade',artist:'Clock Artist',duration:120};let calls=0;
 globalThis.fetch=async url=>{calls++;return Response.json(String(url).includes('/search')?[{trackName:track.title,artistName:track.artist,duration:120,syncedLyrics:'[00:00.00]One\n[00:01.00]Two'}]:{trackName:track.title,artistName:track.artist,duration:120,plainLyrics:'One\nTwo'})};
 try{const result=await autoLyrics(track);assert.equal(result.synced,true);assert.equal(result.lines[1].time,1);assert.equal(calls,2)}finally{globalThis.fetch=before}
});
test('a failed synchronization lookup keeps known plain lyrics without inventing times',async()=>{
 const before=globalThis.fetch,track={title:'Clock Plain',artist:'Clock Artist',duration:120};
 globalThis.fetch=async url=>{if(String(url).includes('/search'))throw Error('unavailable');return Response.json({trackName:track.title,artistName:track.artist,duration:120,plainLyrics:'Plain one\nPlain two'})};
 try{const result=await autoLyrics(track);assert.equal(result.synced,false);assert.deepEqual(result.plainLines,['Plain one','Plain two']);assert.deepEqual(result.lines,[])}finally{globalThis.fetch=before}
});
