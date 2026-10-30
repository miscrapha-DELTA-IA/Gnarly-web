import test from 'node:test';
import assert from 'node:assert/strict';
import {handleFastAudio,originCooldown,promotionTitle} from '../functions/fast-audio/[id].js';
const id='AbCdEFgh123';
const req=(range=null)=>new Request('https://gnarly-web-pages.pages.dev/fast-audio/'+id,{
 headers:range?{Range:range}:{}
});
const bucket={head:async()=>null,get:async()=>null};
const available=Response.json({status:'upstream_rate_limited',retry_after:148});
test('edge reads actual upstream cooldown without extracting new audio',async()=>{
 const calls=[];
 const fetcher=async url=>{calls.push(url);return available.clone()};
 const r=await handleFastAudio({request:req(),env:{GNARLY_AUDIO_R2:bucket},params:{id}},fetcher);
 assert.equal(r.status,429);
 assert.equal(r.headers.get('Retry-After'),'148');
 assert.equal(r.headers.get('X-Gnarly-Playback-Source'),'origin-rate-limited');
 assert.deepEqual(calls,['https://nightcorelab.onrender.com/playback-status']);
});
test('R2 HIT is delivered before any origin health checks or provider requests',async()=>{
 let calls=0;
 const track={size:1024,httpEtag:'"cached"',
  body:new ReadableStream({start(c){c.enqueue(new Uint8Array(1024));c.close()}}),
  range:{offset:0,length:1024}};
 const fetcher=()=>{calls++;throw Error('origin must not be called')};
 const response=await handleFastAudio({request:req('bytes=0-1023'),
  env:{GNARLY_AUDIO_R2:{get:async()=>track}},params:{id}},fetcher);
 assert.equal(response.status,206);
 assert.equal(response.headers.get('X-Gnarly-Playback-Source'),'r2-edge');
 assert.equal(calls,0);
});
test('stream reports masked 422 but global 429 circuit prevents second heavy /download',async()=>{
 let n=0,urls=[];
 const fetcher=async url=>{
  urls.push(url);
  if(url.endsWith('/playback-status'))
   return Response.json(n++===0?{status:'ready'}:{status:'upstream_rate_limited',retry_after:225});
  if(url.includes('/stream?'))return Response.json({detail:'Unavailable'},{status:422});
  throw Error('second extraction must not be started');
 };
 const r=await handleFastAudio({request:req(),env:{GNARLY_AUDIO_R2:bucket},params:{id}},fetcher);
 assert.equal(r.status,429);
 assert.equal(r.headers.get('Retry-After'),'225');
 assert.equal(urls.filter(url=>url.includes('/download?')).length,0);
});
test('unreachable status check does not block a healthy progressive origin',async()=>{
 const audio=new Uint8Array(1024);
 const fetcher=async url=>{
  if(url.endsWith('/playback-status'))throw Error('health check down');
  return new Response(audio,{status:200,headers:{'Content-Type':'audio/mp4','Content-Length':'1024'}});
 };
 const response=await handleFastAudio({request:req(),env:{GNARLY_AUDIO_R2:bucket},params:{id}},fetcher);
 assert.equal(response.status,200);
 assert.equal(response.headers.get('X-Gnarly-Playback-Source'),'progressive-origin');
});
test('promotion title sanitizes trusted Content-Disposition only',()=>{
 assert.equal(promotionTitle(new Headers({'content-disposition':'attachment; filename="Some Artist - Song.m4a"'})),'Some Artist - Song');
 assert.equal(promotionTitle(new Headers({'content-disposition':"attachment; filename*=UTF-8''M%C3%BAsica%20Pronta.m4a"})),'Música Pronta');
 assert.equal(promotionTitle(new Headers()),'');
});
test('R2 write-through retains existing metadata instead of hiding cached songs',async()=>{
 let background,write;
 const bytes=new Uint8Array(1024);bytes.set([0,0,0,24,102,116,121,112]);
 const fetcher=async url=>{
  if(url.endsWith('/playback-status'))return Response.json({status:'ready'});
  return new Response(bytes,{status:200,headers:{'Content-Type':'audio/mp4','Content-Length':'1024',
   'Content-Disposition':'attachment; filename="New Song.m4a"'}});
 };
 const cache={head:async()=>({customMetadata:{title:'Canonical Title',thumbnail:'https://example.org/cover.jpg'}}),
  get:async()=>null,put:async(key,body,options)=>{write={key,body,options}}};
 const response=await handleFastAudio({request:req(),params:{id},env:{GNARLY_AUDIO_R2:cache},
  waitUntil:promise=>{background=promise;}},fetcher);
 assert.equal(response.status,200);
 await background;
 assert.equal(write.key,id+'/audio.m4a');
 assert.equal(write.options.customMetadata.title,'Canonical Title');
 assert.equal(write.options.customMetadata.thumbnail,'https://example.org/cover.jpg');
});
