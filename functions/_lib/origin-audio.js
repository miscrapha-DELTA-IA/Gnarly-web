/** Header-only deadlines. Once media starts, native streaming has no song-length
 * timeout. Never hedge extraction: a timed-out/canceled attempt ends the chain. */
export async function fetchAudioHeaders(fetcher,url,options,{signal,timeoutMs=40000}={}){
 if(signal?.aborted)throw new DOMException('Request canceled','AbortError');
 if(timeoutMs<=0)throw new DOMException('Origin headers timed out','TimeoutError');
 const controller=new AbortController();let timer,abort;
 const stopped=new Promise((_,reject)=>{
  abort=()=>{controller.abort();reject(new DOMException('Request canceled','AbortError'))};
  signal?.addEventListener('abort',abort,{once:true});
  timer=setTimeout(()=>{
   controller.abort();reject(new DOMException('Origin headers timed out','TimeoutError'));
  },Math.max(1,timeoutMs));
 });
 const pending=Promise.resolve().then(()=>fetcher(url,{...options,signal:controller.signal}));
 // If a non-conforming fetch ignores cancellation, release its eventual body.
 void pending.then(response=>{if(controller.signal.aborted)discardAudioBody(response)},()=>{});
 try{return await Promise.race([pending,stopped])}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',abort)}
}
export function discardAudioBody(response){
 try{void response?.body?.cancel().catch(()=>{})}catch{}
}
export function retryAfter(response,fallback='8'){
 const value=response?.headers?.get('Retry-After');
 // Do not relay arbitrary header values from an origin error.
 return /^\d{1,4}$/.test(value||'')?String(Math.max(1,Math.min(3600,Number(value)))):fallback;
}
export function validAudioResponse(response){
 if(!response?.body||![200,206].includes(response.status))return false;
 if(!/^audio\/(?:mp4|mpeg|aac|x-m4a)(?:;|$)/i.test(response.headers.get('Content-Type')||''))return false;
 const raw=response.headers.get('Content-Length');
 const size=raw===null?null:Number(raw);
 if(raw!==null&&(!/^\d+$/.test(raw)||!Number.isSafeInteger(size)||size<=0))return false;
 const range=response.headers.get('Content-Range');
 if(response.status===200)return !range;
 const match=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(range||'');
 if(!match)return false;
 const [start,end,total]=match.slice(1).map(Number);
 return [start,end,total].every(Number.isSafeInteger)&&start<=end&&end<total&&
  (size===null||size===end-start+1);
}
