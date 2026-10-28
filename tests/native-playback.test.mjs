import test from 'node:test';
import assert from 'node:assert/strict';
import {startNativePlayback} from '../lib/native-playback.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
test('native playback and graph unlock start synchronously within the gesture',async()=>{
 const order=[];
 const result=startNativePlayback({play(){order.push('play');return Promise.resolve()}},{unlock(){order.push('unlock')}});
 assert.deepEqual(order,['play','unlock']);await result;
});
test('canceling an old same-track waiter cannot affect a resumed playback',async()=>{
 const old=deferred(),controller=new AbortController();
 const first=startNativePlayback({play:()=>old.promise},{signal:controller.signal});
 controller.abort();
 await assert.rejects(first,{name:'AbortError'});
 await startNativePlayback({play:()=>Promise.resolve()});
 old.reject(new DOMException('Old source interrupted','AbortError'));
 await new Promise(resolve=>setTimeout(resolve,0));
});
test('a source that never supplies playable media has a bounded startup deadline',async()=>{
 await assert.rejects(startNativePlayback({play:()=>new Promise(()=>{})},{timeoutMs:5}),{name:'TimeoutError'});
});
test('synchronous graph failures still observe an interrupted native play promise',async()=>{
 const pending=deferred();
 await assert.rejects(startNativePlayback({play:()=>pending.promise},{unlock(){throw Error('Graph unavailable')}}),/Graph unavailable/);
 pending.reject(new DOMException('replaced source','AbortError'));
 await new Promise(resolve=>setTimeout(resolve,0));
});
