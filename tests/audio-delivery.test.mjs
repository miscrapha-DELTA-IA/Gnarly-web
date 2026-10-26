import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AudioDeliveryRecovery,retryableMediaFailure} from '../lib/audio-delivery.js';
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
