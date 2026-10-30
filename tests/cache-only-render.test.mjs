import test from 'node:test';
import assert from 'node:assert/strict';
import {handleFastAudio} from '../functions/fast-audio/[id].js';

const id='ABCDEFGHIJK';
function req(){return new Request('https://gnarly-web-pages.pages.dev/fast-audio/'+id,{method:'GET'});}
function ctx(){return {request:req(),params:{id},env:{GNARLY_AUDIO_R2:{get:async()=>null}},waitUntil:()=>{}};}
const cached=()=>new Response(new Uint8Array(2048),{
 status:200,headers:{'content-type':'audio/mp4','content-length':'2048'}
});
const limit=()=>Response.json({status:'upstream_rate_limited',retry_after:295});

test('known upstream 429 still serves same recording from Render cached-only audio',async()=>{
 const calls=[];
 const fetcher=async url=>{
  calls.push(new URL(url).pathname+new URL(url).search);
  if(url.includes('/playback-status'))return limit();
  if(url.includes('/download?')&&url.includes('cache_only=1'))return cached();
  throw Error('must not extract or call /stream during upstream cooldown');
 };
 const response=await handleFastAudio(ctx(),fetcher);
 assert.equal(response.status,200);
 assert.equal(response.headers.get('X-Gnarly-Playback-Source'),'cached-render-origin');
 assert.equal((await response.arrayBuffer()).byteLength,2048);
 assert.equal(calls.filter(x=>x.startsWith('/download')).length,1);
 assert.equal(calls.some(x=>x.startsWith('/stream')),false);
});

test('real cooldown cache miss reports original rate limit without fetching new media',async()=>{
 const calls=[];
 const fetcher=async url=>{
  calls.push(new URL(url).pathname+new URL(url).search);
  if(url.includes('/playback-status'))return limit();
  if(url.includes('cache_only=1'))return new Response('missing',{status:404});
  throw Error('unexpected origin extraction');
 };
 const response=await handleFastAudio(ctx(),fetcher);
 assert.equal(response.status,429);
 assert.equal(response.headers.get('X-Gnarly-Playback-Source'),'origin-rate-limited');
 assert.equal(calls.some(x=>x.startsWith('/stream')),false);
 assert.equal(calls.filter(x=>x.startsWith('/download')).length,1);
});

test('429 during /stream routes second lookup to cached-only rather than extraction',async()=>{
 const calls=[];
 const fetcher=async url=>{
  calls.push(new URL(url).pathname+new URL(url).search);
  if(url.includes('/playback-status'))return Response.json({status:'ready',retry_after:0});
  if(url.includes('/stream'))return new Response('upstream refused',{
   status:429,headers:{'X-Download-Error':'upstream_rate_limited','Retry-After':'300'}
  });
  if(url.includes('cache_only=1'))return cached();
  throw Error('second extraction must not happen');
 };
 const response=await handleFastAudio(ctx(),fetcher);
 assert.equal(response.status,200);
 assert.equal(response.headers.get('X-Gnarly-Playback-Source'),'cached-render-origin');
 assert.equal(calls.filter(x=>x.startsWith('/stream')).length,1);
 assert.equal(calls.filter(x=>x.startsWith('/download')).length,1);
 assert.ok(calls.find(x=>x.startsWith('/download')).includes('cache_only=1'));
});
