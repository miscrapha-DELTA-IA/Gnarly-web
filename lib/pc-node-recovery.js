/** Await one already-requested, exact GNARLY audio recording on the PC node.
 * This is READ-ONLY: never creates an extraction, guesses a recording or
 * opens YouTube. Stops when the selection changes, user pauses or node fails.
 */
import {NATIVE_BACKEND} from './playback-source.js';
const ID=/^[A-Za-z0-9_-]{11}$/;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export async function waitForPCNodeReady(videoId,{
 fetcher=globalThis.fetch,backend=NATIVE_BACKEND,
 current=()=>true,onProgress=()=>{},wait=delay,now=()=>Date.now(),
 // The installed Windows agent has a 75s extraction deadline and 90s
 // upload deadline. The former 145s wait ended *before* a valid upload
 // could finish, causing false MediaError 4 and repeated Play presses.
 maxWaitMs=205000,pollMs=2300,requestTimeoutMs=3500,prepare=false,
 autoRetryTimeout=false
}={}){
 if(!ID.test(videoId||'')||typeof fetcher!=='function')return 'unavailable';
 const endpoint=new URL('/pc-node/status/'+videoId,backend).href;
 const start=now();
 let failedProbes=0;
 let timeoutRetryUsed=false,retryAt=null;
 // A single lightweight POST enqueues the selected recording. It closes the
 // race where the browser's first /fast-audio/ request times out before the
 // PC queue actually receives the job. Never invokes yt-dlp in the browser.
 if(prepare&&current()){
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),requestTimeoutMs);
  try{
   const response=await fetcher(new URL('/pc-node/prepare/'+videoId,backend).href,{
    method:'POST',credentials:'omit',cache:'no-store',signal:ctl.signal,
    headers:{Accept:'application/json'}
   });
   if(!current())return 'cancelled';
   if(response?.ok){
    const queued=await response.json();
    if(queued?.state==='ready')return 'ready';
    // A previous attempt may have failed but still occupies a 35s queue
    // cooldown. The status endpoint supplies its sanitized category; retry
    // ONLY an authenticated worker timeout and at most once, after cooldown.
    if(queued?.state==='failed'&&!autoRetryTimeout)return 'failed';
   }else if(response?.status===429||response?.status===503){
    // PC queue pressure is independent of YouTube 429. Never convert it
    // into a codec failure or start another Render extraction. An offline
    // node cannot prepare anything, but a queued job might still be visible.
    let state=null;
    try{state=(await response.json())?.state}catch{}
    if(state==='offline')return 'unavailable';
    if(state==='busy')return 'busy';
    // A transient non-JSON gateway 503 is not proof that an accepted
    // previous job disappeared. Read its status before giving up.
   }
  }catch{/* Retry the read-only status if the enqueue response was lost. */}
  finally{clearTimeout(timer)}
 }
 let absentSince=null,nextPollMs=pollMs;
 while(current()&&now()-start<maxWaitMs){
  if(retryAt!==null){
   const remaining=retryAt-now();
   if(remaining>0){
    onProgress('retrying');
    await wait(Math.min(pollMs,remaining));
    continue;
   }
   retryAt=null;
   // One and only one fresh enqueue for the SAME exact recording, after
   // the backend cooldown. The server deduplicates already accepted jobs.
   const controller=new AbortController();
   const timer=setTimeout(()=>controller.abort(),requestTimeoutMs);
   try{
    const response=await fetcher(new URL('/pc-node/prepare/'+videoId,backend).href,{
     method:'POST',credentials:'omit',cache:'no-store',signal:controller.signal,
     headers:{Accept:'application/json'}
    });
    if(!current())return 'cancelled';
    if(response?.ok){
     const result=await response.json();
     if(result?.state==='ready')return 'ready';
     if(result?.state==='failed')return 'failed';
     if(!['pending','leased'].includes(result?.state))return 'unavailable';
     absentSince=null;failedProbes=0;
     onProgress('leased');
    }else return response?.status===429?'busy':'unavailable';
   }catch{return current()?'unavailable':'cancelled'}
   finally{clearTimeout(timer)}
  }
  const ctl=new AbortController();
  const timer=setTimeout(()=>ctl.abort(),requestTimeoutMs);
  try{
   const response=await fetcher(endpoint,{
    method:'GET',credentials:'omit',cache:'no-store',signal:ctl.signal,
    headers:{Accept:'application/json'}
   });
   if(!current())return 'cancelled';
   if(response?.ok){
    const result=await response.json();
    failedProbes=0;
    if(result?.state==='ready')return 'ready';
    if(result?.state==='failed'){
     // A timeout means the Windows extraction actually exceeded its own
     // bounded deadline. A single automatic retry removes manual Play
     // repetition; restrictions, 429, missing formats and other failures
     // must NEVER trigger another extraction.
     const seconds=Number(result.retry_after_seconds);
     if(!autoRetryTimeout||timeoutRetryUsed||
       result.failure_category!=='timeout'||result.node_online!==true||
       Number(result.cooldown_seconds)>0||
       !Number.isFinite(seconds)||seconds<0||seconds>40)return 'failed';
     timeoutRetryUsed=true;
     retryAt=now()+Math.max(750,Math.min(40750,seconds*1000+750));
     onProgress('retrying');
     continue;
    }
    if(result?.state==='invalid')return 'unavailable';
    if(result?.state==='absent'){
     if(!result?.node_online)return 'unavailable';
     if(absentSince===null)absentSince=now();
     if(now()-absentSince>=5000)return 'unavailable';
     onProgress('pending',{queueAhead:0});
    }else{
     absentSince=null;
     if(!['pending','leased'].includes(result?.state))return 'unavailable';
     // Under public traffic, do not poll the same queue for every visitor
     // at 2.3-second intervals when there are several jobs ahead. Once
     // this exact recording is being extracted, probe a little faster.
     const ahead=Number.isInteger(result.queue_ahead)&&result.queue_ahead>=0
      ?Math.min(8,result.queue_ahead):0;
     nextPollMs=result.state==='leased'?Math.min(pollMs,1700):
      ahead>=2?Math.max(pollMs,4500):
      ahead===1?Math.max(pollMs,3000):pollMs;
     onProgress(result.state,{queueAhead:ahead});
    }
   }else if(response?.status===404){
    return 'unavailable';
   }else if(++failedProbes>=3){
    return 'unavailable';
   }
  }catch{
   if(!current())return 'cancelled';
   if(++failedProbes>=3)return 'unavailable';
  }finally{clearTimeout(timer)}
  if(!current())return 'cancelled';
  const remaining=maxWaitMs-(now()-start);
  if(remaining>0)await wait(Math.min(nextPollMs,remaining));
 }
 return current()?'timeout':'cancelled';
}


/** A PC job can report ready before its asynchronous R2 upload is visible
 * at the listener's edge POP. Wait for the SAME exact cached recording,
 * without requesting another extraction or changing the user's selection.
 * The caller supplies an edge-cache-only probe; this helper never fetches
 * YouTube, Render /download, or /stream itself.
 */
export async function waitForPCNodeCache({
 current=()=>true,probe=async()=>false,onProgress=()=>{},
 wait=delay,now=()=>Date.now(),maxWaitMs=22000,pollMs=1800
}={}){
 if(typeof probe!=='function')return 'unavailable';
 const started=now();
 while(current()&&now()-started<maxWaitMs){
  let ready=false;
  try{ready=await probe()}catch{/* Transient edge probe is not a terminal failure. */}
  if(!current())return 'cancelled';
  if(ready)return 'ready';
  onProgress('syncing');
  const remaining=maxWaitMs-(now()-started);
  if(remaining<=0)break;
  await wait(Math.max(1,Math.min(pollMs,remaining)));
 }
 return current()?'timeout':'cancelled';
}
