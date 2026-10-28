/** Prepare one likely next recording, after the active audio has buffered.
 * Accepted jobs live on Render, not on a sacrificial browser Range request.
 * Keep a small TTL ledger across selections so rapid navigation cannot create
 * repeated speculative work. Failed/canceled requests may retry after backoff.
 */
import {fastPrepareURL,youtubeID} from './playback-source.js';

export function canWarmImmediately({current,next,saveData=false,effectiveType='',online=true}={}){
 return online&&!saveData&&!/^(slow-2g|2g|3g)$/i.test(effectiveType||'')&&
  !!youtubeID(next)&&next?.id!==current?.id;
}
export function canWarmNext(options={}){
 return canWarmImmediately(options)&&Number.isFinite(options.remaining)&&
  options.remaining>4&&options.remaining<=75;
}
export class QueueAudioWarmup{
 constructor({fetcher=globalThis.fetch,timeout=3500,now=Date.now}={}){
  this.fetcher=fetcher;this.timeout=timeout;this.now=now;this.pending=null;
  this.entries=new Map();
 }
 retain(track){if(this.pending&&this.pending.id!==youtubeID(track))this.cancel()}
 async start(track){
  const id=youtubeID(track),target=fastPrepareURL(track);
  if(!id||!target||typeof this.fetcher!=='function')return false;
  const previous=this.entries.get(id);
  if(previous&&previous.until>this.now())return false;
  // Canceling the HTTP waiter does not cancel a job already accepted by Render.
  // Do not accept another speculative identity until this reservation expires.
  if([...this.entries].some(([key,item])=>key!==id&&item.state==='preparing'&&item.until>this.now()))return false;
  this.cancel();
  const entry={state:'resolving',until:this.now()+this.timeout};
  this.entries.delete(id);this.entries.set(id,entry);
  while(this.entries.size>12)this.entries.delete(this.entries.keys().next().value);
  const controller=new AbortController();
  const run=(async()=>{
   const timer=setTimeout(()=>controller.abort(),this.timeout);
   try{
    const response=await this.fetcher(target,{
     method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({url:'https://www.youtube.com/watch?v='+id}),
     credentials:'omit',mode:'cors',cache:'no-store',signal:controller.signal,
     priority:'low'
    });
    const accepted=response?.status===200||response?.status===202;
    entry.state=accepted?(response.status===200?'ready':'preparing'):'backoff';
    // Recheck an accepted extraction after 30s; a durable cache hit lasts longer.
    entry.until=this.now()+(accepted?(response.status===200?300000:30000):15000);
    return accepted;
   }catch{entry.state='backoff';entry.until=this.now()+15000;return false}
   finally{clearTimeout(timer)}
  })();
  this.pending={controller,run,id};
  try{return await run}finally{if(this.pending?.run===run)this.pending=null}
 }
 cancel(){this.pending?.controller.abort();this.pending=null}
 reset(){this.cancel();this.entries.clear()}
}
