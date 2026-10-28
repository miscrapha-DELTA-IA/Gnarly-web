/** Explicit bounded preparation for ONE next recording.
 * The previous Range probe was aborted after the first chunk and often
 * cancelled the very backend extraction intended to warm the R2 cache.
 * A POST /prepare instead returns immediately while the backend retains
 * and uploads its own single work item to R2, independent of the listener.
 */
import {fastPrepareURL,youtubeID} from './playback-source.js';

export function canWarmNext({current,next,remaining,saveData=false,effectiveType='',online=true}={}){
 return online&&!saveData&&!/^(slow-2g|2g)$/i.test(effectiveType||'')&&
  Number.isFinite(remaining)&&remaining>4&&remaining<=75&&
  !!youtubeID(next)&&next?.id!==current?.id;
}
export class QueueAudioWarmup{
 constructor({fetcher=globalThis.fetch,timeout=3500}={}){
  this.fetcher=fetcher;this.timeout=timeout;this.pending=null;this.last='';
 }
 async start(track){
  const id=youtubeID(track),target=fastPrepareURL(track);
  if(!id||!target||typeof this.fetcher!=='function'||this.last===id)return false;
  this.cancel();this.last=id;
  const controller=new AbortController();
  const run=(async()=>{
   const timer=setTimeout(()=>controller.abort(),this.timeout);
   try{
    const response=await this.fetcher(target,{
     method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({url:'https://www.youtube.com/watch?v='+id}),
     credentials:'omit',mode:'cors',cache:'no-store',signal:controller.signal
    });
    return response?.status===200||response?.status===202;
   }catch{return false}
   finally{clearTimeout(timer)}
  })();
  this.pending={controller,run,id};
  try{return await run}finally{if(this.pending?.run===run)this.pending=null}
 }
 cancel(){this.pending?.controller.abort();this.pending=null}
 reset(){this.cancel();this.last=''}
}
