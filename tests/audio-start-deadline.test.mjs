import test from 'node:test';
import assert from 'node:assert/strict';
import {settleAudioStart} from '../lib/audio-start-deadline.js';

test('immediately available native audio does not incur a recovery delay',async()=>{
 assert.deepEqual(await settleAudioStart(Promise.resolve('playing'),Promise.resolve('unlocked'),{timeoutMs:200}),['playing','unlocked']);
});
test('never-resolving play promise is bounded, and its timer cleaned up',async()=>{
 let callback,cancelled=0;
 const pending=new Promise(()=>{});
 const work=settleAudioStart(pending,Promise.resolve(),{timeoutMs:400,
  schedule:(fn,ms)=>{assert.equal(ms,400);callback=fn;return 1},
  cancel:()=>{cancelled++}
 });
 callback();
 await assert.rejects(work,{name:'AudioStartTimeoutError'});
 assert.equal(cancelled,1);
});
test('start failure reaches caller without leaving a deadline running',async()=>{
 let cancelled=0;
 await assert.rejects(settleAudioStart(Promise.reject(new TypeError('audio')),Promise.resolve(),{
  schedule:()=>11,cancel:()=>{cancelled++}
 }),TypeError);
 assert.equal(cancelled,1);
});
