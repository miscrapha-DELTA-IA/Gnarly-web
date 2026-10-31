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
 maxWaitMs=105000,pollMs=2300,requestTimeoutMs=3500
}={}){
 if(!ID.test(videoId||'')||typeof fetcher!=='function')return 'unavailable';
 const endpoint=new URL('/pc-node/status/'+videoId,backend).href;
 const start=now();
 let failedProbes=0;
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
    if(result?.state==='absent'||result?.state==='invalid')return 'unavailable';
    if(!['pending','leased'].includes(result?.state))return 'unavailable';
    onProgress(result.state);
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
