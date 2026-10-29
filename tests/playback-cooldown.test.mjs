import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PlaybackCooldown,playbackLimitMessage} from '../lib/audio-delivery.js';
import {QueueAudioWarmup} from '../lib/queue-audio-warmup.js';
import {trackAudioURL} from '../lib/playback-source.js';
import {handleFastAudio} from '../functions/fast-audio/[id].js';
import {onRequestPost as prepare} from '../functions/fast-prepare/[id].js';

const track={source:'youtube',id:'youtube:ABCDEFGHIJK',videoId:'ABCDEFGHIJK'};
function storage(){
 const m=new Map();
 return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};
}
const request=(path,options={})=>new Request('https://gnarly-web-pages.pages.dev'+path,options);
test('confirmed 429 persists for bounded time, survives tab reload, then expires',()=>{
 let now=100000;const db=storage();
 const a=new PlaybackCooldown({storage:db,now:()=>now});
 assert.equal(a.active(),false);
 assert.equal(a.remember({code:'upstream_rate_limited',retryAfter:300}),true);
 assert.equal(a.snapshot().retryAfter,300);
 const b=new PlaybackCooldown({storage:db,now:()=>now});
 assert.equal(b.active(),true);
 now+=299000;
 assert.equal(b.snapshot().retryAfter,1);
 now+=1000;
 assert.equal(a.active(),false);
 assert.equal(b.snapshot(),null);
 assert.equal(a.remember({code:'other_limit',retryAfter:3600}),false);
});
test('a later confirmed limitation extends global block, never shortens it',()=>{
 let now=0;const a=new PlaybackCooldown({now:()=>now});
 a.remember({code:'upstream_rate_limited',retryAfter:300});
 now=1000;a.remember({code:'upstream_rate_limited',retryAfter:20});
 assert.equal(a.snapshot().retryAfter,299);
 assert.match(playbackLimitMessage(a.snapshot()),/HTTP 429/);
});
test('during cooldown, prewarm skips all new extraction; cache or offline stays independent',async()=>{
 let now=0,calls=0;const limiter=new PlaybackCooldown({now:()=>now});
 const warm=new QueueAudioWarmup({
  now:()=>now,canPrepare:()=>!limiter.active(),
  onRateLimit:seconds=>limiter.remember({code:'upstream_rate_limited',retryAfter:seconds}),
  fetcher:async()=>{
   calls++;
   return new Response('',{status:429,headers:{
    'Retry-After':'300','X-Download-Error':'upstream_rate_limited'}});
  }
 });
 assert.equal(await warm.start(track),false);
 assert.equal(calls,1);assert.equal(limiter.active(),true);
 warm.reset();
 assert.equal(await warm.start(track),false);
 assert.equal(calls,1,'reset/new track must not clear provider cooldown');
 now=300000;
 assert.equal(limiter.active(),false);
 assert.equal(await warm.start(track),false);
 assert.equal(calls,2);
});
test('queue-full 429 does not become a global upstream 429',async()=>{
 let called=0;
 const warm=new QueueAudioWarmup({onRateLimit:()=>called++,fetcher:async()=>new Response('',{
  status:429,headers:{'Retry-After':'30','X-Download-Error':'queue_full'}
 })});
 assert.equal(await warm.start(track),false);
 assert.equal(called,0);
});
test('R2-only route serves cached media even when origin is limited',async()=>{
 let originCalls=0;
 const bytes=new Uint8Array(64);
 const bucket={async get(){return {size:bytes.length,httpEtag:'"hit"',
  body:new Blob([bytes],{type:'audio/mp4'}).stream()}}};
 const result=await handleFastAudio({
  request:request('/fast-audio/ABCDEFGHIJK?cached-only=1'),
  env:{GNARLY_AUDIO_R2:bucket},params:{id:'ABCDEFGHIJK'}
 },()=>{originCalls++;throw Error('origin must not be called')});
 assert.equal(result.status,200);
 assert.equal(result.headers.get('x-gnarly-playback-source'),'r2-edge');
 assert.equal(originCalls,0);
});
test('R2-only misses never trigger streaming nor yt-dlp fallback',async()=>{
 let originCalls=0;
 const bucket={async get(){return null}};
 const result=await handleFastAudio({
  request:request('/fast-audio/ABCDEFGHIJK?cached-only=1'),
  env:{GNARLY_AUDIO_R2:bucket},params:{id:'ABCDEFGHIJK'}
 },()=>{originCalls++;throw Error('unexpected origin call')});
 assert.equal(result.status,503);
 assert.equal(result.headers.get('x-gnarly-playback-source'),'cache-miss-during-cooldown');
 assert.equal(originCalls,0);
});
test('edge prewarm preserves confirmed provider 429 but queue full remains non-global',async()=>{
 for(const [reason,status] of [['upstream_rate_limited',429],['queue_full',503]]){
  const requestBody=request('/fast-prepare/ABCDEFGHIJK',{method:'POST'});
  const result=await prepare({params:{id:'ABCDEFGHIJK'},request:requestBody},async()=>new Response('no',{
   status:429,headers:{'X-Download-Error':reason,'Retry-After':'300'}
  }));
  assert.equal(result.status,status);
  assert.equal(result.headers.get('X-Download-Error'),status===429?reason:null);
 }
});
test('player consults stored global cooldown and requests cache only on first origin attempt',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/new PlaybackCooldown\(\{storage:localStorage\}\)/);
 assert.match(app,/canPrepare:\(\)=>!playbackCooldown\.active\(\)/);
 assert.match(app,/cacheOnly:attempt===0&&playbackCooldown\.active\(\)/);
 assert.match(app,/playbackCooldown\.snapshot\(\)\|\|await inspectPlaybackLimit\(\)/);
 assert.match(app,/playbackCooldown\.remember\(rateLimit\)/);
 assert.match(app,/queueAudioWarmup\.cancel\(\)/);
 const original=globalThis.location;
 try{
  globalThis.location={hostname:'gnarly-web-pages.pages.dev'};
  assert.equal(trackAudioURL(track,{cacheOnly:true}),'/fast-audio/ABCDEFGHIJK?cached-only=1');
  assert.equal(trackAudioURL(track,{cacheOnly:false}),'/fast-audio/ABCDEFGHIJK');
 }finally{
  if(original===undefined)delete globalThis.location;else globalThis.location=original;
 }
});

test('rapid skips cannot launch speculative jobs faster than configured budget',async()=>{
 let now=0,calls=0;
 const warm=new QueueAudioWarmup({
  now:()=>now,minIntervalMs:20000,
  fetcher:async()=>{calls++;return new Response('{"status":"preparing"}',{status:202})}
 });
 assert.equal(await warm.start(track),true);
 warm.reset();
 now=1200;
 assert.equal(await warm.start({...track,id:'youtube:BBBBBBBBBBB',videoId:'BBBBBBBBBBB'}),false);
 assert.equal(calls,1);
 now=20000;
 assert.equal(await warm.start({...track,id:'youtube:BBBBBBBBBBB',videoId:'BBBBBBBBBBB'}),true);
 assert.equal(calls,2);
});
