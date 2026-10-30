/** Bounded wait for HTMLMediaElement.play() + WebAudio unlock.
 * Safari may leave play() unresolved even when the media request has failed.
 * The caller decides whether to retry, swap to cached audio or report failure.
 * Each promise remains rejection-observed after the deadline fires.
 */
export async function settleAudioStart(start,unlock,{
 timeoutMs=5200,schedule=setTimeout,cancel=clearTimeout
}={}){
 let timer;
 const timeout=new Promise((_,reject)=>{
  timer=schedule(()=>{
   const error=new Error('Audio start deadline exceeded');
   error.name='AudioStartTimeoutError';reject(error);
  },Math.max(100,timeoutMs));
 });
 try{return await Promise.race([Promise.all([start,unlock]),timeout]);}
 finally{if(timer!==undefined)cancel(timer);}
}
