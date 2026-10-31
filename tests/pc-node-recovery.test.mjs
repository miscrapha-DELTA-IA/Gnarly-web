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
 const fetcher=async()=>{calls++;return {ok:true,status:200,json:async()=>({state:'absent',node_online:false})};};
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

test('One Play queues exact recording idempotently before polling status',async()=>{
 const calls=[],clock={value:0};
 const responses={
  prepare:{ok:true,status:200,json:async()=>({state:'pending'})},
  status:[{ok:true,status:200,json:async()=>({state:'leased',node_online:true})},
          {ok:true,status:200,json:async()=>({state:'ready',node_online:true})}]
 };
 const result=await waitForPCNodeReady(ID,{
  prepare:true,now:()=>clock.value,
  wait:async ms=>{clock.value+=ms;},
  fetcher:async(url,options)=>{
   calls.push({url,method:options.method});
   if(options.method==='POST')return responses.prepare;
   return responses.status.shift();
  }
 });
 assert.equal(result,'ready');
 assert.deepEqual(calls.map(x=>x.method),['POST','GET','GET']);
 assert.equal(calls[0].url,'https://nightcorelab.onrender.com/pc-node/prepare/'+ID);
});

test('PC node job that appears shortly after original media error is not lost',async()=>{
 let clock=0,calls=0;
 const result=await waitForPCNodeReady(ID,{
  now:()=>clock,wait:async ms=>{clock+=ms;},
  fetcher:async()=>{
   calls++;
   return {ok:true,status:200,json:async()=>calls<=2?
    {state:'absent',node_online:true}:{state:'ready',node_online:true}};
  }
 });
 assert.equal(result,'ready');
 assert.equal(calls,3);
});
