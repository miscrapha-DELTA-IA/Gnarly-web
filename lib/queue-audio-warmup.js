/** Explicit bounded preparation for ONE next recording.
 * The previous Range probe was aborted after the first chunk and often
 * cancelled the very backend extraction intended to warm the R2 cache.
 * A POST /prepare instead returns immediately while the backend retains
 * and uploads its own single work item to R2, independent of the listener.
 */
import {fastPrepareURL,youtubeID} from './playback-source.js';

/** One likely next recording only, on a healthy connection. */
export function canWarmImmediately({current,next,saveData=false,effectiveType='',online=true}={}){
 return online&&!saveData&&!/^(slow-2g|2g)$/i.test(effectiveType||'')&&
  !!youtubeID(next)&&next?.id!==current?.id;
}
export function canWarmNext(options={}){
 return canWarmImmediately(options)&&Number.isFinite(options.remaining)&&
  options.remaining>4&&options.remaining<=75;
}
export class QueueAudioWarmup{
 constructor({fetcher=globalThis.fetch,timeout=3500,retryDelay=30000,now=()=>Date.now(),canPrepare=()=>true,onRateLimit=()=>{},minIntervalMs=0}={}){
  this.fetcher=fetcher;this.timeout=timeout;this.retryDelay=retryDelay;this.now=now;
  this.canPrepare=canPrepare;this.onRateLimit=onRateLimit;
  this.minIntervalMs=Math.max(0,Number(minIntervalMs)||0);this.lastAttemptAt=-Infinity;
  this.pending=null;this.last='';this.failure=null;
 }
 async start(track){
  const id=youtubeID(track),target=fastPrepareURL(track);
  if(!id||!target||typeof this.fetcher!=='function'||this.last===id||!this.canPrepare())return false;
  if(this.pending?.id===id)return this.pending.run;
  const failed=this.failure?.id===id?this.failure:null;
  // A failed speculative request is retryable, but progress events must not
  // create a prepare storm. At most two attempts for the current next song.
  if(failed&&(failed.attempts>=2||this.now()<failed.retryAt))return false;
  if(this.now()-this.lastAttemptAt<this.minIntervalMs)return false;
  this.cancel();
  const controller=new AbortController();
  const pending={controller,run:null,id,canceled:false};this.pending=pending;
  const run=(async()=>{
   const timer=setTimeout(()=>controller.abort(),this.timeout);
   let accepted=false,retryAfter=0;
   try{
    this.lastAttemptAt=this.now();
    const response=await this.fetcher(target,{
     method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({url:'https://www.youtube.com/watch?v='+id}),
     credentials:'omit',mode:'cors',cache:'no-store',signal:controller.signal
    });
    accepted=response?.status===200||response?.status===202;
    const header=response?.headers?.get?.('Retry-After'),seconds=Number(header);
    // Only the origin's explicit upstream limitation pauses ALL new prewarm.
    // A queue-full 429 is local capacity and must not masquerade as YouTube.
    if(response?.status===429&&response?.headers?.get?.('X-Download-Error')==='upstream_rate_limited')
     this.onRateLimit(Number.isFinite(seconds)&&seconds>0?seconds:300);
    if(Number.isFinite(seconds)&&seconds>0)retryAfter=seconds*1000;
    else if(header)retryAfter=Math.max(0,Date.parse(header)-this.now())||0;
    if(accepted&&!pending.canceled){this.last=id;this.failure=null}
    return accepted;
   }catch{return false}
   finally{
    clearTimeout(timer);
    if(!accepted&&!pending.canceled)this.failure={id,attempts:(failed?.attempts||0)+1,
     retryAt:this.now()+Math.max(this.retryDelay,retryAfter)};
   }
  })();
  pending.run=run;
  try{return await run}finally{if(this.pending?.run===run)this.pending=null}
 }
 cancel(){if(this.pending){this.pending.canceled=true;this.pending.controller.abort()}this.pending=null}
 reset(){this.cancel();this.last='';this.failure=null}
}
