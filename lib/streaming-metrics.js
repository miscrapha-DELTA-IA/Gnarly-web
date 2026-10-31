/** GNARLY streaming signals: aggregate only, never song IDs, URLs or users.
 * This is fire-and-forget. Failures cannot block audio or create retries.
 */
import {NATIVE_BACKEND} from './playback-source.js';
const EVENTS=new Set(['first_audio','recovered_audio','initial_media_error','final_error','watchdog','play_cancelled',
 'first_buffer','rebuffer','pc_ready','pc_queued','recovery_started']);
const SOURCES=new Set(['fast_edge','render','offline','independent','unknown']);

export function audioSourceCategory(url=''){
 if(typeof url!=='string')return 'unknown';
 if(url.startsWith('blob:')||url.startsWith('file:'))return 'offline';
 if(url.includes('/fast-audio/'))return 'fast_edge';
 if(url.includes('/audius-audio/')||url.includes('/jamendo-audio/'))return 'independent';
 if(url.includes('/download?')||url.includes('/stream?'))return 'render';
 return 'unknown';
}

export function recordStreamingMetric({event,source='unknown',ms=0,code=0},
 {sendBeacon=globalThis.navigator?.sendBeacon?.bind(globalThis.navigator),
  fetcher=globalThis.fetch,endpoint=NATIVE_BACKEND+'/v1/playback-metric'}={}){
 if(!EVENTS.has(event)||!SOURCES.has(source)||!Number.isFinite(ms)||ms<0||ms>240000||
    ![0,2,3,4].includes(code))return false;
 const payload=JSON.stringify({event,source,ms:Math.round(ms),code});
 // text/plain avoids CORS preflight and sendBeacon's last-gasp limitations;
 // source/event enums are locally validated and also strictly checked server-side.
 const blob=new Blob([payload],{type:'text/plain;charset=UTF-8'});
 try{
  if(typeof sendBeacon==='function'&&sendBeacon(endpoint,blob))return true;
 }catch{}
 try{
  if(typeof fetcher!=='function')return false;
  void fetcher(endpoint,{method:'POST',body:payload,headers:{'Content-Type':'text/plain;charset=UTF-8'},
    credentials:'omit',keepalive:true,mode:'cors'}).catch(()=>{});
  return true;
 }catch{return false}
}
