import test from 'node:test';
import assert from 'node:assert/strict';
import {QueueAudioWarmup} from '../lib/queue-audio-warmup.js';

const song={source:'youtube',id:'youtube:AAAAAAAAAAA',videoId:'AAAAAAAAAAA'};
test('a failed prepare is retried after cooldown, then accepted work is reused',async()=>{
 let now=0,calls=0;
 const warmup=new QueueAudioWarmup({now:()=>now,fetcher:async()=>new Response('',{status:++calls===1?503:202})});
 assert.equal(await warmup.start(song),false);
 assert.equal(await warmup.start(song),false);
 assert.equal(calls,1);
 now=29999;assert.equal(await warmup.start(song),false);assert.equal(calls,1);
 now=30000;assert.equal(await warmup.start(song),true);assert.equal(calls,2);
 now=90000;assert.equal(await warmup.start(song),false);assert.equal(calls,2);
});
test('speculative preparation has a two-attempt budget per selection',async()=>{
 let now=0,calls=0;
 const warmup=new QueueAudioWarmup({now:()=>now,fetcher:async()=>{calls++;return new Response('',{status:503})}});
 assert.equal(await warmup.start(song),false);
 now=30000;assert.equal(await warmup.start(song),false);
 now=3600000;assert.equal(await warmup.start(song),false);assert.equal(calls,2);
 warmup.reset();assert.equal(await warmup.start(song),false);assert.equal(calls,3);
});
test('provider Retry-After seconds and HTTP dates override speculative cooldown',async()=>{
 for(const header of ['7200',new Date(7200000).toUTCString()]){
  let now=0,calls=0;
  const warmup=new QueueAudioWarmup({now:()=>now,fetcher:async()=>{calls++;return new Response('',{status:429,headers:{'Retry-After':header}})}});
  await warmup.start(song);now=7199999;await warmup.start(song);assert.equal(calls,1,header);
  now=7200000;await warmup.start(song);assert.equal(calls,2,header);
 }
});
test('concurrent callers share one in-flight preparation',async()=>{
 let calls=0,finish;
 const warmup=new QueueAudioWarmup({fetcher:()=>{calls++;return new Promise(resolve=>finish=resolve)}});
 const first=warmup.start(song),second=warmup.start(song);
 assert.equal(calls,1);finish(new Response('',{status:202}));
 assert.deepEqual(await Promise.all([first,second]),[true,true]);
 assert.equal(warmup.pending,null);
});
test('canceling obsolete preparation does not consume its failure budget or pin readiness',async()=>{
 let calls=0;
 const warmup=new QueueAudioWarmup({fetcher:(_url,{signal})=>{
  calls++;
  if(calls>1)return Promise.resolve(new Response('',{status:202}));
  return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));
 }});
 const pending=warmup.start(song);warmup.cancel();assert.equal(await pending,false);
 assert.equal(warmup.failure,null);assert.equal(warmup.last,'');
 assert.equal(await warmup.start(song),true);assert.equal(calls,2);
});
test('a timed-out prepare is eligible for one bounded retry',async()=>{
 let now=0,calls=0;
 const warmup=new QueueAudioWarmup({timeout:10,now:()=>now,fetcher:(_url,{signal})=>{
  calls++;return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Timed out','AbortError')),{once:true}));
 }});
 assert.equal(await warmup.start(song),false);assert.equal(warmup.failure.attempts,1);
 now=30000;assert.equal(await warmup.start(song),false);assert.equal(warmup.failure.attempts,2);
 now=60000;assert.equal(await warmup.start(song),false);assert.equal(calls,2);
});
