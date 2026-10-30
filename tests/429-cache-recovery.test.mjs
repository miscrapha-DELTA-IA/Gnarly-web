import test from 'node:test';
import assert from 'node:assert/strict';
import {handleFastAudio} from '../functions/fast-audio/[id].js';

const id='ABCDEFGHIJK';
const request=()=>new Request('https://gnarly-web-pages.pages.dev/fast-audio/'+id);
const bytes=new Uint8Array(4096).fill(7);
bytes.set([0,0,0,24,102,116,121,112,77,52,65,32],0);
const r2Miss=()=>({async get(){return null}});

test('confirmed upstream 429 still checks Render existing R2 via cache-first /download',async()=>{
 const urls=[];
 const result=await handleFastAudio({
  request:request(),params:{id},env:{GNARLY_AUDIO_R2:r2Miss()}
 },async url=>{
  if(url.endsWith('/playback-status'))return Response.json({status:'ready'});
  urls.push(url);
  if(urls.length===1)return new Response('blocked',{status:429,headers:{
   'Retry-After':'300','X-Download-Error':'upstream_rate_limited'
  }});
  return new Response(bytes,{status:200,headers:{
   'Content-Type':'audio/mp4','Content-Length':String(bytes.length)
  }});
 });
 assert.equal(result.status,200);
 assert.equal(result.headers.get('X-Gnarly-Playback-Source'),'extraction-origin');
 assert.equal((await result.arrayBuffer()).byteLength,bytes.length);
 assert.equal(urls.length,2);
 assert.match(urls[0],/\/stream\?/);
 assert.match(urls[1],/\/download\?/);
});

test('if Render R2 also misses, original provider 429 is preserved without extra retries',async()=>{
 const urls=[];
 const result=await handleFastAudio({
  request:request(),params:{id},env:{GNARLY_AUDIO_R2:r2Miss()}
 },async url=>{
  if(url.endsWith('/playback-status'))return Response.json({status:'ready'});
  urls.push(url);
  return urls.length===1?
   new Response('upstream blocked',{status:429,headers:{
    'Retry-After':'240','X-Download-Error':'upstream_rate_limited'
   }}):
   new Response('origin unavailable',{status:503,headers:{'Retry-After':'20'}});
 });
 assert.equal(result.status,429);
 assert.equal(result.headers.get('Retry-After'),'240');
 assert.equal(result.headers.get('X-Gnarly-Playback-Source'),'origin-rate-limited');
 assert.equal(urls.length,2);
});

test('queue-full or access-limited 429 must not trigger another origin request',async()=>{
 for(const reason of ['queue_full','access_limited']){
  let calls=0;
  const result=await handleFastAudio({
   request:request(),params:{id},env:{GNARLY_AUDIO_R2:r2Miss()}
  },async url=>{
   if(url.endsWith('/playback-status'))return Response.json({status:'ready'});
   calls++;return new Response('blocked',{status:429,headers:{
    'X-Download-Error':reason,'Retry-After':'30'
   }});
  });
  assert.equal(result.status,429);
  assert.equal(result.headers.get('Retry-After'),'30');
  assert.equal(calls,1);
 }
});

test('fully streamed /download fallback can populate edge R2 without blocking first audio',async()=>{
 const uploads=[],background=[],urls=[];
 const bucket={
  async get(){return null},
  async put(key,data,metadata){uploads.push({key,data:new Uint8Array(data),metadata})}
 };
 const result=await handleFastAudio({
  request:request(),params:{id},env:{GNARLY_AUDIO_R2:bucket},
  waitUntil:promise=>background.push(promise)
 },async url=>{
  if(url.endsWith('/playback-status'))return Response.json({status:'ready'});
  urls.push(url);
  return urls.length===1?new Response('no progressive audio',{status:415}):
   new Response(bytes,{status:200,headers:{
    'Content-Type':'audio/mp4','Content-Length':String(bytes.length)
   }});
 });
 assert.equal(result.status,200);
 assert.equal((await result.arrayBuffer()).byteLength,bytes.length);
 await Promise.all(background);
 assert.equal(uploads.length,1);
 assert.equal(uploads[0].key,id+'/audio.m4a');
 assert.equal(uploads[0].data.byteLength,bytes.length);
 assert.equal(uploads[0].metadata.httpMetadata.contentType,'audio/mp4');
});

test('provider 429 followed by non-audio 200 is still classified as provider-limited',async()=>{
 let calls=0;
 const result=await handleFastAudio({request:request(),params:{id},env:{}},async url=>{
  if(url.endsWith('/playback-status'))return Response.json({status:'ready'});
  calls++;
  return calls===1?new Response('blocked',{status:429,headers:{
   'X-Download-Error':'upstream_rate_limited','Retry-After':'300'
  }}):new Response('<html>error</html>',{status:200,headers:{'Content-Type':'text/html'}});
 });
 assert.equal(result.status,429);
 assert.equal(calls,2);
});
