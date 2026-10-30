import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {hedgeCatalogue} from '../lib/catalog.js';
import {OmniboxSession} from '../lib/omnibox.js';
import {instantSearch} from '../lib/live-search.js';

const track=(id,title,source='youtube')=>source==='youtube'
 ? {id:'youtube:'+id,videoId:id,title,artist:'Artist',source,artwork:'https://example.org/cover.jpg',duration:172}
 : {id:'itunes:'+id,title,artist:'Artist',source,url:'https://audio.example.org/preview.m4a',duration:172};
const storage=()=>{const map=new Map();return {getItem:key=>map.get(key),setItem:(key,value)=>map.set(key,value),map}};

test('fast proxy avoids launching the backup Apple request',async()=>{
 let backupCalls=0;
 const result=await hedgeCatalogue(async()=>[track('AAAAAAAAAAA','Neon')],async()=>{backupCalls++;return []},{delay:25});
 assert.equal(result.length,1);
 assert.equal(backupCalls,0);
});
test('slow native proxy never makes Apple fallback wait for a full timeout',async()=>{
 let sawAbort=false;
 const start=Date.now();
 const result=await hedgeCatalogue(signal=>new Promise((resolve,reject)=>{
  signal.addEventListener('abort',()=>{sawAbort=true;reject(new Error('aborted'))},{once:true});
 }),async()=>[track('12','Neon Preview','preview')],{delay:10});
 assert.equal(result[0].source,'preview');
 assert.ok(Date.now()-start<400,'second provider must be hedged before backend timeout');
 assert.equal(sawAbort,true,'losing provider is cancelled');
});
test('an empty early backup does not discard a later valid native recording',async()=>{
 const result=await hedgeCatalogue(async()=>{
  await new Promise(resolve=>setTimeout(resolve,22));
  return [track('BBBBBBBBBBB','Full Track')];
 },async()=>[],{delay:0});
 assert.equal(result[0].source,'youtube');
});
test('both failures return no fabricated results',async()=>{
 const results=await hedgeCatalogue(async()=>{throw Error('proxy 502')},async()=>{throw Error('Apple offline')},{delay:0});
 assert.deepEqual(results,[]);
});
test('user cancellation terminates both providers rather than displaying old search',async()=>{
 const controller=new AbortController();
 const pending=hedgeCatalogue(signal=>new Promise((resolve,reject)=>{
  signal.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'})),{once:true});
 }),signal=>new Promise((resolve,reject)=>{
  signal.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'})),{once:true});
 }),{signal:controller.signal,delay:0});
 await new Promise(resolve=>setTimeout(resolve,10));
 controller.abort();
 await assert.rejects(pending,error=>error.name==='AbortError');
});
test('public successful search metadata persists, retrieves and refines by prefix',()=>{
 const db=storage(),a=new OmniboxSession(db);
 a.cacheResults('neon',[track('CCCCCCCCCCC','Neon Lights'),track('1','Neon Preview','preview')]);
 assert.deepEqual(a.fromCache('neon').results.map(x=>x.title),['Neon Lights','Neon Preview']);
 const b=new OmniboxSession(db);
 assert.equal(b.fromCache('neon').results.length,2);
 assert.ok(b.cachedMatches('neo').some(x=>x.title==='Neon Lights'));
 assert.ok(instantSearch('neon l',{cached:b.cachedMatches('neon l')}).some(x=>x.title==='Neon Lights'));
});
test('local files, private URLs, and unsafe metadata are never stored as catalogue cache',()=>{
 const db=storage(),session=new OmniboxSession(db);
 session.cacheResults('mine',[
  {id:'local:secret',title:'Local',source:'local',url:'blob:private'},
  {id:'itunes:bad',source:'preview',title:'Private URL',url:'blob:private'},
  track('DDDDDDDDDDD','Real')
 ]);
 const persisted=db.map.get('gnarly.omnibox.search-cache')||'';
 assert.doesNotMatch(persisted,/blob:private|local:secret|itunes:bad/);
 assert.match(persisted,/DDDDDDDDDDD/);
});
test('search results are merged across providers with incremental DOM retention',()=>{
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(source,/const available=\[\.\.\.native,\.\.\.page\.ready,\.\.\.matchingIndependentTracks\(page\.audius,page\.query\),\.\.\.page\.previews\]/);
 assert.match(source,/omnibox\.cachedMatches\(query\)/);
 assert.match(source,/list\.dataset\.searchRows=JSON\.stringify\(rendered\)/);
 assert.match(source,/const appended=existing&&previous\.length/);
 assert.match(source,/Buscando músicas…/);
 assert.match(source,/searchPaging\?\.controller\?\.abort\(\)/);
});
test('edge functions expose bounded fetch deadlines and cache public metadata only',()=>{
 const omni=readFileSync(new URL('../functions/api/omnibox.js',import.meta.url),'utf8');
 const apple=readFileSync(new URL('../functions/api/catalog.js',import.meta.url),'utf8');
 assert.match(omni,/signal:AbortSignal\.any\(\[request\.signal,AbortSignal\.timeout\(7300\)\]\)/);
 assert.match(omni,/if\(results\.length&&edgeCache&&cacheKey/);
 assert.match(apple,/signal:AbortSignal\.any\(\[request\.signal,AbortSignal\.timeout\(6300\)\]\)/);
 assert.match(apple,/if\(results\.length&&edgeCache&&cacheKey/);
});
