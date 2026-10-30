import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AudioDeliveryRecovery,retryableMediaFailure,inspectPlaybackLimit,inspectPlaybackStatus,resolvePlaybackCooldown,PlaybackCooldown,playbackLimitMessage} from '../lib/audio-delivery.js';
const a = {id:'youtube:dQw4w9WgXcQ',videoId:'dQw4w9WgXcQ',source:'youtube'};
test('only recover transient browser transport errors, not autoplay or cancellations',()=>{
 assert.equal(retryableMediaFailure(null,{code:2}),true);
 assert.equal(retryableMediaFailure(null,{code:4}),true);
 assert.equal(retryableMediaFailure({name:'NotAllowedError'},{code:2}),false);
 assert.equal(retryableMediaFailure({name:'AbortError'},{code:2}),false);
});
test('bounded retries retain the same track identity and stop on success',async()=>{
 const attempts=[];
 const c=new AudioDeliveryRecovery({delays:[0,0],wait:async()=>{}});
 c.select(a);
 const got=await c.retry({track:a,mediaError:{code:2},isCurrent:()=>true,restart:async n=>{attempts.push(n);return n===2;}});
 assert.equal(got,true);assert.deepEqual(attempts,[1,2]);assert.equal(c.attempt,2);
 const again=await c.retry({track:a,mediaError:{code:2},isCurrent:()=>true,restart:async()=>{throw Error('unexpected')}});
 assert.equal(again,false);
});
test('simultaneous events share one recovery request',async()=>{
 let calls=0;
 const c=new AudioDeliveryRecovery({delays:[0],wait:async()=>{}});
 c.select(a);
 const args={track:a,mediaError:{code:4},isCurrent:()=>true,restart:async()=>{calls++;return true}};
 await Promise.all([c.retry(args),c.retry(args)]);
 assert.equal(calls,1);
});
test('a track change or user pause invalidates an in-flight retry',async()=>{
 let resolveWait, calls=0;
 const c=new AudioDeliveryRecovery({delays:[10],wait:()=>new Promise(r=>resolveWait=r)});
 c.select(a);
 const pending=c.retry({track:a,mediaError:{code:2},isCurrent:()=>true,restart:async()=>{calls++;return true}});
 c.select({...a});
 resolveWait();
 assert.equal(await pending,false);assert.equal(calls,0);
 assert.equal(await c.retry({track:a,mediaError:{code:2},isCurrent:()=>true,restart:async()=>true}),false);
});

test('read-only playback status identifies backend 429 without hitting a media endpoint',async()=>{
 let requested;
 const limit=await inspectPlaybackLimit({fetcher:async(url,options)=>{
  requested={url,options};return {ok:true,json:async()=>({status:'upstream_rate_limited',retry_after:264})}
 }});
 assert.deepEqual(limit,{code:'upstream_rate_limited',retryAfter:264});
 assert.equal(new URL(requested.url).pathname,'/playback-status');
 assert.equal(new URL(requested.url).search,'');
 assert.equal(requested.options.method,'GET');
 assert.equal(requested.options.cache,'no-store');
 assert.equal(requested.options.credentials,'omit');
 assert.match(playbackLimitMessage(limit),/HTTP 429/);
 assert.match(playbackLimitMessage(limit),/5 min/);
});
test('playback diagnosis fails open without fabricating provider errors',async()=>{
 assert.equal(await inspectPlaybackLimit({fetcher:async()=>({ok:true,json:async()=>({status:'ready',retry_after:0})})}),null);
 assert.equal(await inspectPlaybackLimit({fetcher:async()=>({ok:false,status:404})}),null);
 assert.equal(await inspectPlaybackLimit({fetcher:async()=>{throw Error('offline')}}),null);
 assert.equal(playbackLimitMessage(null),null);
});
test('detected upstream cooldown aborts further rapid retries, including mid-session',async()=>{
 const c=new AudioDeliveryRecovery({delays:[0,0],wait:async()=>{}});
 c.select(a);
 let requests=0;
 const got=await c.retry({
  track:a,mediaError:{code:4},isCurrent:()=>true,
  restart:async()=>{requests++;const e=new Error('429');e.name='UpstreamRateLimitedError';throw e;}
 });
 assert.equal(got,false);
 assert.equal(requests,1,'must not repeat downloads while the provider is rate-limited');
});
test('player uses actual status endpoint before deciding to retry media error 4',async()=>{
 const {readFileSync}=await import('node:fs');
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(source,/async function recoverNativeAudio[\s\S]*?let rateLimit=await resolvePlaybackCooldown\(playbackCooldown\)/);
 assert.match(source,/rateLimit\?playbackLimitMessage\(rateLimit\):playbackFailureMessage/);
 const publicSource=readFileSync(new URL('../lib/playback-source.js',import.meta.url),'utf8');
 assert.doesNotMatch(publicSource,/Pode ser 403\/422/,'a media error is not proof of a 403/422 response');
});

test('fresh backend ready releases a stale locally remembered 5-minute block',async()=>{
 const limiter=new PlaybackCooldown({now:()=>1234});
 limiter.remember({code:'upstream_rate_limited',retryAfter:300});
 let calls=0;
 const result=await resolvePlaybackCooldown(limiter,{inspect:async()=>{
  calls++;return {code:'ready'};
 }});
 assert.equal(result,null);assert.equal(limiter.active(),false);assert.equal(calls,1);
 const status=await inspectPlaybackStatus({fetcher:async()=>({
  ok:true,json:async()=>({status:'ready',retry_after:0})
 })});
 assert.deepEqual(status,{code:'ready'});
});

test('inaccessible backend cannot clear a known provider cooldown',async()=>{
 const limiter=new PlaybackCooldown({now:()=>0});
 limiter.remember({code:'upstream_rate_limited',retryAfter:300});
 const status=await resolvePlaybackCooldown(limiter,{inspect:async()=>null});
 assert.equal(status.retryAfter,300);
 assert.equal(limiter.active(),true);
});

test('backend new retry-after replaces old local cooldown instead of extending it',async()=>{
 let now=0;
 const limiter=new PlaybackCooldown({now:()=>now});
 limiter.remember({code:'upstream_rate_limited',retryAfter:300});
 now=1000;
 const state=await resolvePlaybackCooldown(limiter,{inspect:async()=>({
  code:'upstream_rate_limited',retryAfter:40
 })});
 assert.equal(state.retryAfter,40);
 assert.equal(limiter.snapshot().retryAfter,40);
});
