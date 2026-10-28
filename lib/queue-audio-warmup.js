/** Bound next-track cache warmup, triggered only as playback nears its end.
 * The first-party Render/R2 backend may need time to resolve a cold track.
 * One tiny Range request is permitted per next canonical ID, never whole
 * playlist prefetches. The browser cancels bytes immediately and does not
 * claim a cache hit until the next song actually plays.
 */
import {trackAudioURL,youtubeID} from './playback-source.js';

export function canWarmNext({current,next,remaining,saveData=false,effectiveType='',online=true}={}){
 return online&&!saveData&&!/^(slow-2g|2g)$/i.test(effectiveType||'')&&
  Number.isFinite(remaining)&&remaining>4&&remaining<=42&&
  !!youtubeID(next)&&next?.id!==current?.id;
}
export class QueueAudioWarmup{
 constructor({fetcher=globalThis.fetch,timeout=9000}={}){
  this.fetcher=fetcher;this.timeout=timeout;this.pending=null;this.last='';
 }
 async start(track){
  const id=youtubeID(track);
  if(!id||typeof this.fetcher!=='function'||this.last===id)return false;
  this.cancel();this.last=id;
  const controller=new AbortController();
  const run=(async()=>{
   let response,reader;
   try{
    const timer=setTimeout(()=>controller.abort(),this.timeout);
    try{
     response=await this.fetcher(trackAudioURL(track),{
      method:'GET',headers:{Range:'bytes=0-65535'},
      credentials:'omit',mode:'cors',cache:'no-store',signal:controller.signal
     });
     if(![200,206].includes(response.status))return false;
     reader=response.body?.getReader?.();
     if(reader)await reader.read();
     return true;
    }finally{clearTimeout(timer)}
   }catch{return false}
   finally{
    try{await reader?.cancel()}catch{}
    try{reader?.releaseLock()}catch{}
    controller.abort();
   }
  })();
  this.pending={controller,run,id};
  try{return await run}finally{if(this.pending?.run===run)this.pending=null}
 }
 cancel(){
  this.pending?.controller.abort();
  this.pending=null;
 }
 reset(){this.cancel();this.last=''}
}
