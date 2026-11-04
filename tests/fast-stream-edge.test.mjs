import test from 'node:test';
import assert from 'node:assert/strict';
import {handleFastAudio as rawFastAudio,validByteRange,completeAudioLength} from '../functions/fast-audio/[id].js';
import {onRequestPost as prepare} from '../functions/fast-prepare/[id].js';
import {fastPrepareURL,trackAudioURL,isGnarlyPagesHost} from '../lib/playback-source.js';
import {QueueAudioWarmup,canWarmNext,canWarmImmediately} from '../lib/queue-audio-warmup.js';

// This suite exercises transport, not the new independent cooldown preflight.
const handleFastAudio=(ctx,fetcher)=>rawFastAudio({...ctx,originProbe:false},fetcher);
const audio=new Uint8Array(4096).fill(7);
audio.set([0,0,0,24,102,116,121,112,77,52,65,32],0); // bounded M4A ftyp prefix
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

test('unverified progressive AAC is streamed but never promoted into shared R2',async()=>{
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
 assert.equal(writes.length,0,'No backend decoder attestation: do not poison R2');
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

test('confirmed Render 429 is detected even when PC heartbeat masks status as ready',async()=>{
 const calls=[];
 const fetcher=async url=>{
  const path=new URL(url).pathname;
  calls.push(path+new URL(url).search);
  if(path==='/playback-status')return Response.json({
   status:'ready',retry_after:0,youtube_retry_after:220,pc_node_online:false
  });
  if(path==='/download')return new Response('no cached copy',{status:404});
  throw new Error('MUST NOT probe YouTube while origin is rate limited: '+path);
 };
 const response=await rawFastAudio({
  request:request('/fast-audio/ABCDEFGHIJK'),env:{},
  params:{id:'ABCDEFGHIJK'},originProbe:true
 },fetcher);
 assert.equal(response.status,429);
 assert.equal(response.headers.get('retry-after'),'220');
 assert.deepEqual(calls.map(x=>new URL('https://host'+x).pathname),
  ['/playback-status','/download']);
 assert.match(calls[1],/cache_only=1/);
});
test('an online PC Node remains an eligible independent playback route during Render cooldown',async()=>{
 const calls=[];
 const fetcher=async url=>{
  const path=new URL(url).pathname;calls.push(url);
  if(path==='/playback-status')return Response.json({
   status:'ready',retry_after:0,youtube_retry_after:180,pc_node_online:true
  });
  if(path==='/download')return new Response(audio,{status:200,
   headers:{'Content-Type':'audio/mp4','Content-Length':String(audio.byteLength)}});
  throw new Error('Unexpected YouTube /stream request while origin 429');
 };
 const response=await rawFastAudio({
  request:request('/fast-audio/ABCDEFGHIJK'),env:{},
  params:{id:'ABCDEFGHIJK'},originProbe:true
 },fetcher);
 assert.equal(response.status,200);
 assert.equal(calls.length,2);
 assert.match(calls[1],/\/download\?/);
 assert.doesNotMatch(calls[1],/cache_only=1|\/stream/);
 assert.equal(response.headers.get('x-gnarly-playback-source'),'cached-render-origin');
});
test('PC job preparing during a real Render cooldown stays 503 instead of false 429',async()=>{
 const calls=[];
 const fetcher=async url=>{
  calls.push(new URL(url).pathname);
  if(new URL(url).pathname==='/playback-status')
   return Response.json({status:'ready',youtube_retry_after:220,
    pc_node_online:true});
  return new Response('PC job preparing',{status:503,
   headers:{'X-Download-Error':'pc_node_preparing','Retry-After':'3'}});
 };
 const response=await rawFastAudio({
  request:request('/fast-audio/ABCDEFGHIJK'),env:{},params:{id:'ABCDEFGHIJK'},
  originProbe:true
 },fetcher);
 assert.equal(response.status,503);
 assert.equal(response.headers.get('retry-after'),'3');
 assert.equal(response.headers.get('x-gnarly-playback-source'),'pc-node-preparing');
 assert.deepEqual(calls,['/playback-status','/download']);
});


test('PC preparing is not misclassified as origin unavailable even without YouTube cooldown',async()=>{
 const calls=[];
 const result=await handleFastAudio({
  request:request('/fast-audio/ABCDEFGHIJK'),env:{},params:{id:'ABCDEFGHIJK'}
 },async(url)=>{
  const p=new URL(url).pathname;calls.push(p);
  if(p!=='/stream')throw Error('MUST NOT make redundant /download requests');
  return new Response('preparing',{status:503,headers:{
   'X-Download-Error':'pc_node_preparing','Retry-After':'3'
  }});
 });
 assert.equal(result.status,503);
 assert.equal(result.headers.get('x-gnarly-playback-source'),'pc-node-preparing');
 assert.equal(result.headers.get('retry-after'),'3');
 assert.deepEqual(calls,['/stream']);
});
test('PC queue full is not a misleading YouTube HTTP 429',async()=>{
 const calls=[];
 const result=await handleFastAudio({
  request:request('/fast-audio/ABCDEFGHIJK'),env:{},params:{id:'ABCDEFGHIJK'}
 },async(url)=>{
  calls.push(new URL(url).pathname);
  return new Response('busy',{status:429,headers:{
   'X-Download-Error':'pc_node_queue_full','Retry-After':'5'
  }});
 });
 assert.equal(result.status,503);
 assert.equal(result.headers.get('x-gnarly-playback-source'),'pc-node-busy');
 assert.equal(result.headers.get('retry-after'),'5');
 assert.deepEqual(calls,['/stream']);
});


test('PC online with healthy Render origin chooses one cache-first PC route; no redundant /stream extractor',async()=>{
 const urls=[];
 const fetcher=async url=>{
  urls.push(url);
  if(new URL(url).pathname==='/playback-status')return Response.json({
   status:'ready',youtube_retry_after:0,retry_after:0,pc_node_online:true
  });
  if(new URL(url).pathname==='/download')return new Response('PC still preparing',{status:503,
   headers:{'X-Download-Error':'pc_node_preparing','Retry-After':'3'}});
  throw Error('Unexpected duplicate origin request to '+url);
 };
 const response=await rawFastAudio({
  request:request('/fast-audio/ABCDEFGHIJK'),env:{},
  params:{id:'ABCDEFGHIJK'},originProbe:true
 },fetcher);
 assert.equal(response.status,503);
 assert.equal(response.headers.get('x-gnarly-playback-source'),'pc-node-preparing');
 assert.deepEqual(urls.map(u=>new URL(u).pathname),['/playback-status','/download']);
 assert.ok(urls[1].includes('delivery=browser'));
});
test('PC online and origin cooldown reject only once without /stream or duplicate retries',async()=>{
 const urls=[];
 const response=await rawFastAudio({
  request:request('/fast-audio/ABCDEFGHIJK'),env:{},
  params:{id:'ABCDEFGHIJK'},originProbe:true
 },async url=>{
  urls.push(url);
  if(new URL(url).pathname==='/playback-status')return Response.json({
   status:'ready',youtube_retry_after:150,retry_after:0,pc_node_online:true
  });
  return new Response('Upstream 429',{status:429,headers:{
   'X-Download-Error':'upstream_rate_limited','Retry-After':'150'
  }});
 });
 assert.equal(response.status,429);
 assert.equal(response.headers.get('retry-after'),'150');
 assert.deepEqual(urls.map(u=>new URL(u).pathname),['/playback-status','/download']);
});
test('PC online + local R2 hit returns native audio without youtube player lookup',async()=>{
 const calls=[];
 const response=await rawFastAudio({
  request:request('/fast-audio/ABCDEFGHIJK'),env:{},
  params:{id:'ABCDEFGHIJK'},originProbe:true
 },async url=>{
  calls.push(new URL(url).pathname);
  if(new URL(url).pathname==='/playback-status')return Response.json({
   status:'ready',youtube_retry_after:0,pc_node_online:true
  });
  return new Response(audio,{status:200,headers:{
   'Content-Type':'audio/mp4','Content-Length':String(audio.length)
  }});
 });
 assert.equal(response.status,200);
 assert.equal(response.headers.get('x-gnarly-playback-source'),'extraction-origin');
 assert.deepEqual(calls,['/playback-status','/download']);
});
