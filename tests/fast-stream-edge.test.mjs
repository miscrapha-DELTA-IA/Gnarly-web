import test from 'node:test';
import assert from 'node:assert/strict';
import {handleFastAudio,validByteRange,completeAudioLength} from '../functions/fast-audio/[id].js';
import {onRequestPost as prepare} from '../functions/fast-prepare/[id].js';
import {fastPrepareURL,trackAudioURL,isGnarlyPagesHost} from '../lib/playback-source.js';
import {QueueAudioWarmup,canWarmNext,canWarmImmediately} from '../lib/queue-audio-warmup.js';

const audio=new Uint8Array(4096).fill(7);
audio.set([0,0,0,24,0x66,0x74,0x79,0x70,0x4d,0x34,0x41,0x20]);
const track={source:'youtube',id:'youtube:ABCDEFGHIJK',videoId:'ABCDEFGHIJK'};
const request=(path,options={})=>new Request('https://gnarly-web-pages.pages.dev'+path,options);
function mockBucket({present=true,range=false}={}){
 const calls=[];
 const bucket={
  async head(key){calls.push({method:'head',key});return present?{size:audio.length,httpEtag:'"etag"'}:null},
  async get(key,options){calls.push({method:'get',key,options});
   if(!present)return null;
   if(options?.range){
    return {size:audio.length,httpEtag:'"etag"',range:{offset:0,length:128},
     body:new Blob([audio.slice(0,128)],{type:'audio/mp4'}).stream()};
   }
   return {size:audio.length,httpEtag:'"etag"',
    body:new Blob([audio],{type:'audio/mp4'}).stream()};
  }
 };
 return {bucket,calls};
}
test('GNARLY Pages allow-list never routes arbitrary domains to edge',()=>{
 assert.equal(isGnarlyPagesHost('gnarly-web-pages.pages.dev'),true);
 assert.equal(isGnarlyPagesHost('preview.gnarly-web-stage72.pages.dev'),true);
 for(const bad of ['evil.pages.dev','gnarly-web-pages.pages.dev.attacker.com',
                    'localhost','gnarlyweb.netlify.app']){
  assert.equal(isGnarlyPagesHost(bad),false);
 }
 assert.equal(fastPrepareURL({...track,source:'local'}),null);
 assert.ok(trackAudioURL(track).includes('/download'),
   'Node and local test runtime retain the proven backend');
});
test('R2 cache hit returns audio bytes at edge, no Render fetch',async()=>{
 const {bucket,calls}=mockBucket();
 const result=await handleFastAudio({
  request:request('/fast-audio/ABCDEFGHIJK'),
  env:{GNARLY_AUDIO_R2:bucket},params:{id:'ABCDEFGHIJK'}
 },()=>{throw new Error('origin fetch on cache hit')});
 assert.equal(result.status,200);
 assert.equal(result.headers.get('x-gnarly-playback-source'),'r2-edge');
 assert.equal(result.headers.get('accept-ranges'),'bytes');
 assert.equal(result.headers.get('content-length'),'4096');
 assert.equal((await result.arrayBuffer()).byteLength,4096);
 assert.equal(calls[0].key,'ABCDEFGHIJK/audio.m4a');
});
test('Range GET is 206 with proper Content-Range and byte length',async()=>{
 const {bucket}=mockBucket();
 const result=await handleFastAudio({
  request:request('/fast-audio/ABCDEFGHIJK',{headers:{Range:'bytes=0-127'}}),
  env:{GNARLY_AUDIO_R2:bucket},params:{id:'ABCDEFGHIJK'}
 },()=>{throw Error('Unexpected upstream fetch')});
 assert.equal(result.status,206);
 assert.equal(result.headers.get('content-range'),'bytes 0-127/4096');
 assert.equal(result.headers.get('content-length'),'128');
 assert.equal((await result.arrayBuffer()).byteLength,128);
});
test('HEAD miss never triggers remote extraction and malformed range/id are rejected',async()=>{
 const {bucket}=mockBucket({present:false});
 const f=()=>{throw Error('Unexpected remote fetch')};
 const head=await handleFastAudio({
  request:request('/fast-audio/ABCDEFGHIJK',{method:'HEAD'}),
  env:{GNARLY_AUDIO_R2:bucket},params:{id:'ABCDEFGHIJK'}
 },f);
 assert.equal(head.status,404);
 assert.equal(head.headers.get('x-gnarly-playback-source'),'cache-miss');
 const bad=await handleFastAudio({
  request:request('/fast-audio/NOTVALID'),
  env:{GNARLY_AUDIO_R2:bucket},params:{id:'NOTVALID'}
 },f);
 assert.equal(bad.status,400);
 assert.equal(validByteRange('bytes=0-1,4-5'),false);
});
test('R2 miss proxies progressive AAC without buffering or redirects',async()=>{
 const {bucket}=mockBucket({present:false}),calls=[];
 const result=await handleFastAudio({
  request:request('/fast-audio/ABCDEFGHIJK'),
  env:{GNARLY_AUDIO_R2:bucket},params:{id:'ABCDEFGHIJK'}
 },async(url,options)=>{
  calls.push({url,options});
  return new Response(new Blob([audio],{type:'audio/mp4'}),{
   status:200,headers:{'Content-Type':'audio/mp4','Content-Length':'4096'}
  });
 });
 assert.equal(calls.length,1);
 assert.ok(calls[0].url.includes('/stream?'));
 assert.equal(result.headers.get('x-gnarly-playback-source'),'progressive-origin');
 assert.equal(result.status,200);
});
test('unsupported progressive source falls back to existing full-download route',async()=>{
 const calls=[];
 const result=await handleFastAudio({
  request:request('/fast-audio/ABCDEFGHIJK'),env:{},params:{id:'ABCDEFGHIJK'}
 },async(url)=>{
  calls.push(url);
  return calls.length===1?new Response('no direct AAC',{status:415}):
   new Response(audio,{status:200,headers:{'Content-Type':'audio/mp4'}});
 });
 assert.equal(result.status,200);
 assert.equal(result.headers.get('x-gnarly-playback-source'),'extraction-origin');
 assert.equal(calls.length,2);
 assert.ok(calls[1].includes('/download?'));
});
test('preparation endpoint carries one server-validated identity',async()=>{
 const calls=[];
 const result=await prepare({request:request('/fast-prepare/ABCDEFGHIJK',{method:'POST'}),
  params:{id:'ABCDEFGHIJK'}},async(url,options)=>{
   calls.push({url,options});
   return new Response('{"status":"preparing"}',{status:202});
  });
 assert.equal(result.status,202);
 assert.equal(calls.length,1);
 assert.equal(calls[0].options.method,'POST');
 const sent=JSON.parse(calls[0].options.body);
 assert.equal(sent.url,'https://www.youtube.com/watch?v=ABCDEFGHIJK');
 assert.equal((await prepare({request:request('/fast-prepare/BAD',{method:'POST'}),
  params:{id:'BAD'}},()=>{throw Error('unreachable')})).status,400);
});
test('warmup sends one persistent POST rather than aborting Range download',async()=>{
 const calls=[];
 const warmup=new QueueAudioWarmup({fetcher:async(url,options)=>{
  calls.push({url,options});return {status:202};
 }});
 assert.equal(canWarmNext({current:track,next:{...track,id:'youtube:BBBBBBBBBBB',videoId:'BBBBBBBBBBB'},remaining:60}),true);
 assert.equal(await warmup.start(track),true);
 assert.equal(await warmup.start(track),false);
 assert.equal(calls.length,1);
 assert.equal(calls[0].options.method,'POST');
 assert.equal(calls[0].options.headers.Range,undefined);
 assert.equal(JSON.parse(calls[0].options.body).url,'https://www.youtube.com/watch?v=ABCDEFGHIJK');
});

test('early next-song warmup is restricted to one eligible real recording',()=>{
 const next={...track,id:'youtube:BBBBBBBBBBB',videoId:'BBBBBBBBBBB'};
 assert.equal(canWarmImmediately({current:track,next,online:true}),true);
 assert.equal(canWarmImmediately({current:track,next,saveData:true}),false);
 assert.equal(canWarmImmediately({current:track,next,effectiveType:'2g'}),false);
 assert.equal(canWarmImmediately({current:track,next:track}),false);
 assert.equal(canWarmImmediately({current:track,next:{...next,source:'preview'}}),false);
});

test('complete progressive AAC is streamed without blocking an asynchronous R2 write',async()=>{
 const writes=[],pending=[];
 const bucket={async get(){return null},async put(key,bytes,metadata){writes.push({key,bytes:new Uint8Array(bytes),metadata});return {}}};
 const result=await handleFastAudio({
  request:request('/fast-audio/ABCDEFGHIJK'),env:{GNARLY_AUDIO_R2:bucket},
  params:{id:'ABCDEFGHIJK'},waitUntil:promise=>pending.push(promise)
 },async()=>new Response(audio,{status:200,headers:{
  'Content-Type':'audio/mp4','Content-Length':String(audio.byteLength)
 }}));
 assert.equal(result.status,200);
 assert.equal(result.headers.get('x-gnarly-playback-source'),'progressive-origin');
 assert.equal((await result.arrayBuffer()).byteLength,audio.length);
 await Promise.all(pending);
 assert.equal(writes.length,1);
 assert.equal(writes[0].key,'ABCDEFGHIJK/audio.m4a');
 assert.equal(writes[0].bytes.byteLength,audio.length);
 assert.equal(writes[0].metadata.httpMetadata.contentType,'audio/mp4');
});
test('partial or oversized origin media is never promoted into a complete R2 object',async()=>{
 let writes=0;
 const bucket={async get(){return null},async put(){writes++}};
 const pending=[];
 const result=await handleFastAudio({
  request:request('/fast-audio/ABCDEFGHIJK',{headers:{Range:'bytes=0-127'}}),
  env:{GNARLY_AUDIO_R2:bucket},params:{id:'ABCDEFGHIJK'},waitUntil:p=>pending.push(p)
 },async()=>new Response(audio.slice(0,128),{status:206,headers:{
  'Content-Type':'audio/mp4','Content-Length':'128','Content-Range':'bytes 0-127/4096'
 }}));
 assert.equal(result.status,206);
 assert.equal((await result.arrayBuffer()).byteLength,128);
 await Promise.all(pending);
 assert.equal(writes,0);
 assert.equal(completeAudioLength(new Response(null,{headers:{'Content-Length':String(17*1024*1024)}})),0);
 assert.equal(completeAudioLength(new Response(null,{status:206,headers:{
  'Content-Length':'4096','Content-Range':'bytes 0-4095/4096'
 }})),4096);
});

test('R2 prepared next track does not contact Render',async()=>{
 const {bucket,calls}=mockBucket();
 const result=await prepare({request:request('/fast-prepare/ABCDEFGHIJK',{method:'POST'}),
  params:{id:'ABCDEFGHIJK'},env:{GNARLY_AUDIO_R2:bucket}},()=>{throw Error('Must not wake Render')});
 assert.equal(result.status,200);assert.equal((await result.json()).status,'cached');
 assert.equal(calls.length,1);
});
test('provider cooldown is preserved without a duplicate extraction request',async()=>{
 let calls=0,canceled=0;
 const result=await handleFastAudio({request:request('/fast-audio/ABCDEFGHIJK'),env:{},params:{id:'ABCDEFGHIJK'}},async()=>{
  calls++;return new Response(new ReadableStream({cancel(){canceled++}}),{status:429,headers:{'Retry-After':'180'}});
 });
 assert.equal(result.status,429);assert.equal(result.headers.get('retry-after'),'180');
 assert.equal(calls,1);assert.equal(canceled,1);
});
test('malformed partial upstream is closed before extraction fallback',async()=>{
 let calls=0,canceled=0;
 const result=await handleFastAudio({request:request('/fast-audio/ABCDEFGHIJK'),env:{},params:{id:'ABCDEFGHIJK'}},async()=>{
  calls++;
  if(calls===1)return new Response(new ReadableStream({cancel(){canceled++}}),{
   status:206,headers:{'Content-Type':'audio/mp4','Content-Length':'100','Content-Range':'bytes 0-100/100'}});
  return new Response(audio,{headers:{'Content-Type':'audio/mp4'}});
 });
 assert.equal(result.status,200);assert.equal(canceled,1);assert.equal(calls,2);
});
test('truncated, excessive and interrupted streams cannot poison R2',async()=>{
 for(const mode of ['short','long','error']){
  let writes=0;const pending=[];
  const body=mode==='error'?new ReadableStream({start(c){c.error(Error('network interruption'))}}):audio.slice(0,mode==='short'?2048:4096);
  const result=await handleFastAudio({request:request('/fast-audio/ABCDEFGHIJK'),
   env:{GNARLY_AUDIO_R2:{get:async()=>null,put:async()=>writes++}},params:{id:'ABCDEFGHIJK'},waitUntil:p=>pending.push(p)
  },async()=>new Response(body,{headers:{'Content-Type':'audio/mp4','Content-Length':mode==='long'?'2048':'4096'}}));
  await result.arrayBuffer().catch(()=>{});await Promise.all(pending);assert.equal(writes,0,mode);
 }
});
test('failed warmup retries after bounded backoff and retains accepted work across navigation',async()=>{
 let now=0,calls=0;
 const w=new QueueAudioWarmup({now:()=>now,fetcher:async()=>({status:++calls===1?503:202})});
 assert.equal(await w.start(track),false);assert.equal(await w.start(track),false);
 now=16000;assert.equal(await w.start(track),true);w.cancel();
 assert.equal(await w.start(track),false);
 const other={...track,id:'youtube:BBBBBBBBBBB',videoId:'BBBBBBBBBBB'};
 assert.equal(await w.start(other),false,'one accepted speculative extraction at a time');
 now+=31000;assert.equal(await w.start(other),true);
 assert.equal(calls,3);
 assert.equal(canWarmImmediately({current:track,next:other,effectiveType:'3g'}),false);
});
test('progressive header deadline falls back once and cancels the slow waiter',async()=>{
 let calls=0,aborted=false;
 const result=await handleFastAudio({request:request('/fast-audio/ABCDEFGHIJK'),env:{},params:{id:'ABCDEFGHIJK'}},
  async(url,{signal})=>{
   if(++calls===1)return new Promise((_,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(signal.reason)},{once:true}));
   return new Response(audio,{headers:{'Content-Type':'audio/mp4'}});
  },{progressiveDeadlineMs:5});
 assert.equal(result.status,200);assert.equal(calls,2);assert.equal(aborted,true);
});
test('first progressive bytes arrive before the upstream completes or R2 promotion finishes',async()=>{
 let finish;let written=false;const work=[];
 const stream=new ReadableStream({start(c){c.enqueue(audio.slice(0,1024));finish=()=>{c.enqueue(audio.slice(1024));c.close()}}});
 const response=await handleFastAudio({request:request('/fast-audio/ABCDEFGHIJK'),
  env:{GNARLY_AUDIO_R2:{get:async()=>null,put:async()=>{written=true}}},params:{id:'ABCDEFGHIJK'},waitUntil:p=>work.push(p)},
  async()=>new Response(stream,{headers:{'Content-Type':'audio/mp4','Content-Length':'4096'}}));
 const reader=response.body.getReader();const first=await reader.read();
 assert.equal(first.value.byteLength,1024);assert.equal(written,false);
 finish();while(!(await reader.read()).done){}await Promise.all(work);assert.equal(written,true);
});
test('mislabeled corrupt media is never promoted as M4A',async()=>{
 let writes=0;const pending=[];
 const result=await handleFastAudio({request:request('/fast-audio/ABCDEFGHIJK'),params:{id:'ABCDEFGHIJK'},
  env:{GNARLY_AUDIO_R2:{get:async()=>null,put:async()=>writes++}},waitUntil:p=>pending.push(p)},
  async()=>new Response(new Uint8Array(4096),{headers:{'Content-Type':'audio/mp4','Content-Length':'4096'}}));
 await result.arrayBuffer();await Promise.all(pending);assert.equal(writes,0);
});
