import assert from 'node:assert/strict';
import test from 'node:test';
import {waitForPCNodeReady} from '../lib/pc-node-recovery.js';

const ID='PvHL6FfmWJE';
const response=state=>({ok:true,status:200,json:async()=>({state,node_online:true})});

test('PC node preparation is polled until ready without invoking audio origin',async()=>{
 const states=['pending','leased','leased','ready'];
 let calls=0,waits=0,clock=0;
 const result=await waitForPCNodeReady(ID,{
  fetcher:async(url,opts)=>{
   assert.equal(url,'https://nightcorelab.onrender.com/pc-node/status/'+ID);
   assert.equal(opts.method,'GET');
   assert.equal(opts.credentials,'omit');
   return response(states[calls++]);
  },
  now:()=>clock,wait:async ms=>{waits++;clock+=ms;},
 });
 assert.equal(result,'ready');
 assert.equal(calls,4);
 assert.equal(waits,3);
});

test('PC node failure ends polling instead of a retry storm',async()=>{
 let calls=0;
 const result=await waitForPCNodeReady(ID,{
  fetcher:async()=>{calls++;return response('failed');},
  wait:async()=>{throw Error('should not retry');}
 });
 assert.equal(result,'failed');
 assert.equal(calls,1);
});

test('A new selection cancels exact recording waiter',async()=>{
 let selected=true,clock=0,calls=0;
 const result=await waitForPCNodeReady(ID,{
  current:()=>selected,fetcher:async()=>{calls++;return response('leased');},
  now:()=>clock,wait:async ms=>{clock+=ms;selected=false;}
 });
 assert.equal(result,'cancelled');
 assert.equal(calls,1);
});

test('Unknown job and invalid ID never trigger further requests',async()=>{
 let calls=0;
 const fetcher=async()=>{calls++;return response('absent');};
 assert.equal(await waitForPCNodeReady('../unsafe',{fetcher}),'unavailable');
 assert.equal(await waitForPCNodeReady(ID,{fetcher}),'unavailable');
 assert.equal(calls,1);
});

test('PC node preparation is time bounded',async()=>{
 let clock=0,calls=0;
 const result=await waitForPCNodeReady(ID,{
  maxWaitMs:4600,pollMs:2300,
  fetcher:async()=>{calls++;return response('pending');},
  now:()=>clock,wait:async ms=>{clock+=ms;}
 });
 assert.equal(result,'timeout');
 assert.equal(calls,2);
});

test('Short read-only backend outages do not kill an ongoing preparation',async()=>{
 let attempts=0,clock=0;
 const result=await waitForPCNodeReady(ID,{
  fetcher:async()=>{attempts++;if(attempts===1)throw new Error('network');return response('ready')},
  now:()=>clock,wait:async ms=>{clock+=ms;}
 });
 assert.equal(result,'ready');
 assert.equal(attempts,2);
});
