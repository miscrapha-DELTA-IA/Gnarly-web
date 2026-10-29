import test from 'node:test';
import assert from 'node:assert/strict';
import {handleFastAudio,validByteRange} from '../functions/fast-audio/[id].js';
import {onRequestPost as prepare} from '../functions/fast-prepare/[id].js';
import {fetchAudioHeaders,validAudioResponse} from '../functions/_lib/origin-audio.js';
const id='ABCDEFGHIJK';
const req=(options={})=>new Request('https://gnarly-web.miscrapha.workers.dev/fast-audio/'+id,options);
const ctx=(options={})=>({request:req(),params:{id},env:{},...options});
const audio=()=>new Response(new Uint8Array(2048),{headers:{'Content-Type':'audio/mp4','Content-Length':'2048'}});

test('an origin timeout ends the attempt without starting a duplicate fallback extraction',async()=>{
 let calls=0,aborts=0;
 const result=await handleFastAudio(ctx({originTimeoutMs:8}),async(url,{signal})=>{
  calls++;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{aborts++;reject(new DOMException('aborted','AbortError'))},{once:true}));
 });
 assert.equal(result.status,504);assert.equal(result.headers.get('x-gnarly-playback-source'),'origin-timeout');
 assert.equal(calls,1);assert.equal(aborts,1);
});
test('an exhausted header budget never dispatches a new origin request',async()=>{
 let calls=0;
 const result=await handleFastAudio(ctx({originTimeoutMs:0}),()=>{calls++;return audio()});
 assert.equal(result.status,504);assert.equal(calls,0);
});
test('rapid navigation cancellation aborts pending origin work and never starts /download',async()=>{
 const controller=new AbortController();let started,aborted=false,calls=0;
 const ready=new Promise(resolve=>started=resolve);
 const job=handleFastAudio(ctx({request:req({signal:controller.signal})}),async(url,{signal})=>{
  calls++;started();return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(new DOMException('abort','AbortError'))},{once:true}));
 });
 await ready;controller.abort();const result=await job;
 assert.equal(result.status,499);assert.equal(calls,1);assert.equal(aborted,true);
});
test('after headers, the header deadline is cleared while user cancellation still reaches the stream',async()=>{
 const controller=new AbortController();let upstreamSignal;
 const response=await fetchAudioHeaders(async(url,{signal})=>{upstreamSignal=signal;return audio()},'https://origin.test/audio',{}, {signal:controller.signal,timeoutMs:8});
 await new Promise(resolve=>setTimeout(resolve,12));
 assert.equal(upstreamSignal.aborted,false,'the header deadline must not become a song-length limit');
 controller.abort();assert.equal(upstreamSignal.aborted,true,'Next must still cancel an established origin response');
 await response.body.cancel();
});
test('a request canceled before selection does not touch R2 or origin',async()=>{
 const controller=new AbortController();controller.abort();let calls=0;
 const result=await handleFastAudio(ctx({request:req({signal:controller.signal}),env:{GNARLY_AUDIO_R2:{get(){calls++}}}}),()=>{calls++});
 assert.equal(result.status,499);assert.equal(calls,0);
});
test('rate limits are propagated with bounded Retry-After without another provider request',async()=>{
 let calls=0,canceled=0;
 const result=await handleFastAudio(ctx(),async()=>{calls++;return new Response(new ReadableStream({cancel(){canceled++}}),{status:429,headers:{'Retry-After':'180'}})});
 assert.equal(result.status,429);assert.equal(result.headers.get('Retry-After'),'180');
 assert.equal(calls,1);assert.equal(canceled,1);
});
test('unsupported progressive response body is released before prepared fallback',async()=>{
 let calls=0,canceled=0;
 const result=await handleFastAudio(ctx(),async()=>{
  if(++calls===1)return new Response(new ReadableStream({cancel(){canceled++}}),{status:415});
  assert.equal(canceled,1);return audio();
 });
 assert.equal(result.status,200);assert.equal(calls,2);
});
test('MPEG/AAC transport retains its real MIME and cannot poison the shared M4A key',async()=>{
 let writes=0;const pending=[];
 const result=await handleFastAudio(ctx({env:{GNARLY_AUDIO_R2:{get:async()=>null,put:async()=>writes++}},waitUntil:job=>pending.push(job)}),async()=>new Response(new Uint8Array(2048),{headers:{'Content-Type':'audio/mpeg','Content-Length':'2048'}}));
 assert.equal(result.headers.get('Content-Type'),'audio/mpeg');await result.arrayBuffer();await Promise.all(pending);assert.equal(writes,0);
});
test('a mislabeled complete error body is streamed but never promoted as audio',async()=>{
 let writes=0;const pending=[];
 const result=await handleFastAudio(ctx({env:{GNARLY_AUDIO_R2:{get:async()=>null,put:async()=>writes++}},waitUntil:job=>pending.push(job)}),async()=>audio());
 await result.arrayBuffer();await Promise.all(pending);assert.equal(writes,0);
});
test('206 requires an honest Content-Range and matching byte length; empty audio is rejected',()=>{
 assert.equal(validAudioResponse(new Response(null,{headers:{'Content-Type':'audio/mp4'}})),false);
 assert.equal(validAudioResponse(new Response(new Uint8Array(20),{status:206,headers:{'Content-Type':'audio/mp4','Content-Length':'20'}})),false);
 assert.equal(validAudioResponse(new Response(new Uint8Array(20),{status:206,headers:{'Content-Type':'audio/mp4','Content-Length':'20','Content-Range':'bytes 0-9/2048'}})),false);
 assert.equal(validAudioResponse(new Response(new Uint8Array(20),{status:206,headers:{'Content-Type':'audio/mp4','Content-Length':'20','Content-Range':'bytes 0-19/2048'}})),true);
 for(const range of ['bytes=20-10','bytes=-0','bytes=9007199254740992-'])assert.equal(validByteRange(range),false);
});
test('R2 range beyond the complete object returns416 without extraction, including R2 range errors',async()=>{
 const result=await handleFastAudio(ctx({request:req({headers:{Range:'bytes=9000-'}}),env:{GNARLY_AUDIO_R2:{get:async()=>{throw Error('range')},head:async()=>({size:2048})}}}),()=>{throw Error('no extraction')});
 assert.equal(result.status,416);assert.equal(result.headers.get('Content-Range'),'bytes */2048');
});
test('preparing a complete R2 hit does not wake Render or trigger extraction',async()=>{
 const result=await prepare(ctx({request:req({method:'POST'}),env:{GNARLY_AUDIO_R2:{head:async()=>({size:2048})}}}),()=>{throw Error('no origin')});
 assert.equal(result.status,200);assert.deepEqual(await result.json(),{status:'cached'});
});
test('preparation honors a bounded origin deadline',async()=>{
 const result=await prepare(ctx({request:req({method:'POST'}),originTimeoutMs:8}),async(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('abort','AbortError')),{once:true})));
 assert.equal(result.status,504);assert.equal(result.headers.get('Cache-Control'),'no-store');
});
