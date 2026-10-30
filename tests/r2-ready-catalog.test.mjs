import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../src/worker.js';
import {cachedTrack,onRequestGet} from '../functions/api/r2-available.js';
import {searchReadyAudio} from '../lib/r2-ready-catalog.js';

const row=(id,title,extra={})=>({
 key:id+'/audio.m4a',size:200000,
 customMetadata:{title,thumbnail:'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg'},...extra
});
const rows=[
 row('AAAAAAAAAAA','Artist One - Electronic Demo'),
 row('BBBBBBBBBBB','Artist Two - Synth Waves'),
 row('CCCCCCCCCCC','Not separated song'),
 row('BAD','Bad ID'),
 row('DDDDDDDDDDD','',{}),
 row('EEEEEEEEEEE','Too short',{size:2}),
 {key:'private/file.m4a',size:10000,customMetadata:{title:'Secret'}},
];
test('R2 availability index exposes only valid, complete, titled recordings',async()=>{
 assert.equal(cachedTrack(rows[0]).id,'youtube:AAAAAAAAAAA');
 assert.equal(cachedTrack(rows[0]).source,'youtube');
 assert.equal(cachedTrack(rows[0]).playbackAvailability,'r2');
 assert.equal(cachedTrack(rows[0]).artist,'Artist One');
 assert.equal(cachedTrack(rows[2]).artist,'Artista não identificado');
 assert.equal(rows.slice(3).every(x=>cachedTrack(x)===null),true);
});
test('public R2 search never starts extraction and has bounded listing',async()=>{
 let listed=0;
 const bucket={async list(options){
  listed++;
  assert.equal(options.limit,1000);
  assert.deepEqual(options.include,['customMetadata']);
  return {objects:rows,truncated:false};
 }};
 const response=await onRequestGet({
  request:new Request('https://gnarly.test/api/r2-available?term=electronic&limit=20'),
  env:{GNARLY_AUDIO_R2:bucket}
 },null);
 assert.equal(response.status,200);
 const data=await response.json();
 assert.equal(listed,1);
 assert.equal(data.results.length,1);
 assert.equal(data.results[0].videoId,'AAAAAAAAAAA');
 assert.equal(data.results[0].playbackAvailability,'r2');
 assert.equal(data.results[0].id,'youtube:AAAAAAAAAAA');
 assert.ok(!JSON.stringify(data).includes('private/file.m4a'));
});
test('R2 index empty query provides a genuinely cached discovery set',async()=>{
 const res=await onRequestGet({request:new Request('https://gnarly.test/api/r2-available?limit=3'),
  env:{GNARLY_AUDIO_R2:{list:async()=>({objects:rows,truncated:false})}}},null);
 const data=await res.json();
 assert.equal(data.results.length,3);
 assert.equal(data.status,'ok');
});
test('client verifies canonical R2 tracks and never requests new media during discovery',async()=>{
 let calls=[];
 const out=await searchReadyAudio('demo',{fetcher:async(url,options)=>{
  calls.push(url);assert.equal(options.headers.Accept,'application/json');
  return Response.json({status:'ok',results:[
   {...cachedTrack(rows[0])},
   {...cachedTrack(rows[0]),videoId:'WRONG000000'}
  ]});
 }});
 assert.equal(calls.length,1);
 assert.match(calls[0],/^\/api\/r2-available\?term=demo/);
 assert.equal(out.length,1);
 assert.equal(out[0].playbackAvailability,'r2');
});
test('Worker route reads real R2 binding, no YouTube requests',async()=>{
 let listed=0;
 const response=await worker.fetch(new Request('https://gnarly.test/api/r2-available?term=Artist'),{
  GNARLY_AUDIO_R2:{list:async()=>{listed++;return {objects:rows,truncated:false}}}
 },{waitUntil:()=>{}});
 assert.equal(response.status,200);
 assert.equal((await response.json()).results.length,2);
 assert.equal(listed,1);
});
test('mobile startup timeout invokes bounded recovery and protects the audio clock',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/const youtube=track\.source==='youtube'&&!isOffline\(track\.id\)/);
 assert.match(app,/if\(youtube&&!recoveryOperation\)\{[\s\S]*?void recoverNativeAudio\(track,\{name:'TimeoutError'\}\)/);
 assert.match(app,/if\(recoveryOperation\|\|state\.audioState==='recovering'\)return/);
 assert.match(app,/page\.remote=originals/);
 assert.match(app,/const ready=searchReadyAudio\(query,\{limit:24,signal:controller\.signal\}\)/);
 assert.match(app,/playbackAvailability==='r2'\?'✓ Pronta no GNARLY/);
});
