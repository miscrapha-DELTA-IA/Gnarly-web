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
 maxWaitMs=205000,pollMs=2300,requestTimeoutMs=3500,prepare=false
}={}){
 if(!ID.test(videoId||'')||typeof fetcher!=='function')return 'unavailable';
 const endpoint=new URL('/pc-node/status/'+videoId,backend).href;
 const start=now();
 let failedProbes=0;
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
   }else if(response?.status===429||response?.status===503)return 'unavailable';
  }catch{/* Retry the read-only status if the enqueue response was lost. */}
  finally{clearTimeout(timer)}
 }
 let absentSince=null;
 while(current()&&now()-start<maxWaitMs){
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
    if(result?.state==='failed')return 'failed';
    if(result?.state==='invalid')return 'unavailable';
    if(result?.state==='absent'){
     if(!result?.node_online)return 'unavailable';
     if(absentSince===null)absentSince=now();
     if(now()-absentSince>=5000)return 'unavailable';
     onProgress('pending');
    }else{
     absentSince=null;
     if(!['pending','leased'].includes(result?.state))return 'unavailable';
     onProgress(result.state);
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
  await wait(pollMs);
 }
 return current()?'timeout':'cancelled';
}
