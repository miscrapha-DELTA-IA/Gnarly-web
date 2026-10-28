/** Native HTMLAudioElement startup, with a bounded waiter for one user intent.
 * play() and AudioContext unlock both begin synchronously in the user gesture.
 * Aborting a waiter observes the old promise without pausing a newer source.
 */
export function startNativePlayback(audio,{
 signal,timeoutMs=30000,unlock=()=>{},setTimer=setTimeout,clearTimer=clearTimeout
}={}){
 if(signal?.aborted)return Promise.reject(new DOMException('Playback canceled','AbortError'));
 return new Promise((resolve,reject)=>{
  let settled=false,timer=null;
  const finish=(error)=>{
   if(settled)return;
   settled=true;clearTimer(timer);signal?.removeEventListener('abort',cancel);
   error?reject(error):resolve();
  };
  const cancel=()=>finish(new DOMException('Playback canceled','AbortError'));
  signal?.addEventListener('abort',cancel,{once:true});
  timer=setTimer(()=>finish(new DOMException('Audio startup timed out','TimeoutError')),timeoutMs);
  try{
   const start=audio.play();
   // Attach before unlock: even a synchronous graph failure cannot leave an
   // interrupted native play promise unobserved after Next or Previous.
   const native=Promise.resolve(start);
   native.catch(()=>{});
   const graph=unlock();
   Promise.all([native,graph]).then(()=>finish(),finish);
  }catch(error){finish(error)}
 });
}
