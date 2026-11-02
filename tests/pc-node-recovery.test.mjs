import assert from 'node:assert/strict';
import test from 'node:test';
import {waitForPCNodeReady,waitForPCNodeCache} from '../lib/pc-node-recovery.js';

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


test('PC busy is distinct from provider HTTP 429, without repeated extraction',async()=>{
 const calls=[];
 const result=await waitForPCNodeReady(ID,{
  prepare:true,fetcher:async(url,options)=>{
   calls.push({url,method:options.method});
   return {ok:false,status:429,json:async()=>({state:'busy'})};
  },wait:async()=>{throw Error('busy request cannot create work')}
 });
 assert.equal(result,'busy');
 assert.deepEqual(calls.map(x=>x.method),['POST']);
});
test('offline PC rejects preparation immediately without reporting an unsupported codec',async()=>{
 const result=await waitForPCNodeReady(ID,{
  prepare:true,fetcher:async()=>({ok:false,status:503,json:async()=>({state:'offline'})}),
  wait:async()=>{throw Error('offline node should not poll')}
 });
 assert.equal(result,'unavailable');
});
test('transient PC prepare gateway 503 does not discard a previously accepted job',async()=>{
 let calls=0,clock=0;
 const result=await waitForPCNodeReady(ID,{
  prepare:true,now:()=>clock,wait:async ms=>{clock+=ms;},
  fetcher:async(_url,options)=>{
   calls++;
   if(options.method==='POST')return {ok:false,status:503,json:async()=>{throw Error('gateway html')}};
   return response('ready');
  }
 });
 assert.equal(result,'ready');
 assert.equal(calls,2);
});
test('success recovery accepts player playing event as terminal state, not stale selection',async()=>{
 const {readFileSync}=await import('node:fs');
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const cache=source.slice(source.indexOf('async function resumeCachedNative('),
  source.indexOf('async function awaitAlreadyPreparingCache('));
 const pc=source.slice(source.indexOf('async function resumeCompletedPCNode('),
  source.indexOf('async function recoverIndependentAudio('));
 for(const helper of [cache,pc]){
  assert.match(helper,/const selection=playbackSelection/);
  assert.match(helper,/state\.current!==track\|\|playbackSelection!==selection\|\|state\.userPaused/);
  assert.doesNotMatch(helper,/await settleAudioStart[\s\S]*?if\(!isCurrent\(\)\)return false/);
 }
 assert.match(source,/if\(pcResult==='ready'\)\{[\s\S]*?await resumeCompletedPCNode\(track,current\)[\s\S]*?waitForPCNodeCache\(/);
 assert.match(source,/probe:\(\)=>resumeCachedNative\(track,current\)/);
});

test('one Play survives R2 propagation after PC reports ready',async()=>{
 let clock=0,calls=0,progress=0;
 const result=await waitForPCNodeCache({
  now:()=>clock,wait:async ms=>{clock+=ms;},
  probe:async()=>{calls++;return calls===3;},
  onProgress:()=>{progress++}
 });
 assert.equal(result,'ready');
 assert.equal(calls,3);
 assert.equal(progress,2);
 assert.ok(clock<6000);
});

test('transient edge cache check does not show a terminal error',async()=>{
 let clock=0,checks=0;
 const result=await waitForPCNodeCache({
  now:()=>clock,wait:async ms=>{clock+=ms;},
  probe:async()=>{checks++;if(checks===1)throw Error('R2 temporarily unreachable');return true;}
 });
 assert.equal(result,'ready');
 assert.equal(checks,2);
});

test('paused or changed selection cancels cache settling without extra requests',async()=>{
 let clock=0,selected=true,checks=0;
 const result=await waitForPCNodeCache({
  now:()=>clock,current:()=>selected,
  wait:async ms=>{clock+=ms;selected=false;},
  probe:async()=>{checks++;return false;}
 });
 assert.equal(result,'cancelled');
 assert.equal(checks,1);
});

test('R2 never becoming ready is bounded with read-only probes',async()=>{
 let clock=0,checks=0;
 const result=await waitForPCNodeCache({
  maxWaitMs:4400,pollMs:1800,now:()=>clock,
  wait:async ms=>{clock+=ms;},
  probe:async()=>{checks++;return false;}
 });
 assert.equal(result,'timeout');
 assert.ok(checks>=2&&checks<=4);
 assert.equal(clock,4400);
});

test('completed-PC recovery does not launch an extraction or change the recording',async()=>{
 const {readFileSync}=await import('node:fs');
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const branch=app.slice(app.indexOf("if(pcResult==='ready'){"),
                       app.indexOf("if(pcResult==='failed'"));
 assert.match(branch,/await resumeCompletedPCNode\(track,current\)/);
 assert.match(branch,/waitForPCNodeCache\(/);
 assert.match(branch,/probe:\(\)=>resumeCachedNative\(track,current\)/);
 assert.doesNotMatch(branch,/selectedAudioWarmup\.start|\/stream\?|\/download\?|sourceRouter\.resolve/);
});

test('one timeout is retried automatically only after server cooldown, without another Play',async()=>{
 let clock=0,prepareCalls=0,statusCalls=0;
 const result=await waitForPCNodeReady(ID,{
  prepare:true,autoRetryTimeout:true,maxWaitMs:12000,
  now:()=>clock,wait:async ms=>{clock+=ms;},
  fetcher:async(_url,{method})=>{
   if(method==='POST'){
    prepareCalls++;
    return {ok:true,json:async()=>({state:prepareCalls===1?'failed':'pending'})};
   }
   statusCalls++;
   return {ok:true,json:async()=>statusCalls===1?
    {state:'failed',failure_category:'timeout',retry_after_seconds:3,node_online:true,cooldown_seconds:0}:
    {state:'ready',node_online:true}};
  }
 });
 assert.equal(result,'ready');
 assert.equal(prepareCalls,2,'only one delayed retry is allowed');
 assert.equal(statusCalls,2);
 assert.ok(clock>=3750,'respect the advertised server cooldown plus margin');
});

test('protected, rate-limited and unavailable formats cannot trigger another extraction',async()=>{
 for(const reason of ['upstream_rate_limited','age_restricted','authentication_required','format_unavailable','source_unavailable']){
  let prepares=0;
  const state={state:'failed',failure_category:reason,retry_after_seconds:1,node_online:true,cooldown_seconds:0};
  const result=await waitForPCNodeReady(ID,{
   prepare:true,autoRetryTimeout:true,
   fetcher:async(_url,{method})=>{
    if(method==='POST'){prepares++;return {ok:true,json:async()=>({state:'failed'})}}
    return {ok:true,json:async()=>state}
   },
   wait:async()=>{throw Error('must not wait after non-timeout failure')}
  });
  assert.equal(result,'failed');
  assert.equal(prepares,1,reason+' is terminal for automatic retries');
 }
});

test('one automatic retry never enters a third extraction after second timeout',async()=>{
 let clock=0,prepares=0,statuses=0;
 const failed={state:'failed',failure_category:'timeout',retry_after_seconds:0,node_online:true,cooldown_seconds:0};
 const result=await waitForPCNodeReady(ID,{
  prepare:true,autoRetryTimeout:true,maxWaitMs:12000,
  now:()=>clock,wait:async ms=>{clock+=ms;},
  fetcher:async(_url,{method})=>{
   if(method==='POST'){prepares++;return {ok:true,json:async()=>({state:prepares===1?'failed':'pending'})}}
   statuses++;return {ok:true,json:async()=>failed};
  }
 });
 assert.equal(result,'failed');
 assert.equal(prepares,2);
 assert.equal(statuses,2);
});
