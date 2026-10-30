/** GNARLY Multi-Source Engine: race independent VERIFIED recordings while the
 * original user-gesture <audio>.play() is already running. The router does not
 * extract YouTube media, invent titles, modify the active queue or open embeds.
 * Each provider has its OWN health circuit; one 429 must never poison others.
 */
import {exactIndependentRecording} from './independent-recovery.js';
import {searchAudius,audiusPlaybackURL} from './audius-catalog.js';
import {searchJamendo,jamendoPlaybackURL} from './jamendo-catalog.js';

export const DEFAULT_AUDIO_PROVIDERS=Object.freeze([
 {id:'audius',search:searchAudius,url:audiusPlaybackURL},
 {id:'jamendo',search:searchJamendo,url:jamendoPlaybackURL}
]);
const AUDIO=/^audio\/(?:mpeg|mp3|mp4|aac|ogg|flac|webm)(?:;|$)/i;
export function audioHeaderAndSignature(contentType,bytes){
 if(!AUDIO.test(contentType||'')||!bytes||bytes.length<4)return false;
 const b=bytes;
 const ascii=(i,text)=>[...text].every((c,j)=>b[i+j]===c.charCodeAt(0));
 if(/^audio\/(mpeg|mp3)/i.test(contentType))
  return ascii(0,'ID3')||(b[0]===255&&(b[1]&0xe0)===0xe0);
 if(/^audio\/(mp4|aac)/i.test(contentType))
  return ascii(4,'ftyp')||(b[0]===255&&(b[1]&0xf0)===0xf0);
 if(/^audio\/ogg/i.test(contentType))return ascii(0,'OggS');
 if(/^audio\/flac/i.test(contentType))return ascii(0,'fLaC');
 if(/^audio\/webm/i.test(contentType))return b[0]===0x1a&&b[1]===0x45&&b[2]===0xdf&&b[3]===0xa3;
 return false;
}
/** Probe first actual bytes; HEAD/metadata-only 200 is not playback proof.
 * Abort after first chunk, never buffer the song or trigger a second download.
 * Only first-party ID-derived paths are allowed as endpoints.
 */
export async function probePlayableAudio(url,{
 fetcher=globalThis.fetch,signal,timeoutMs=2300
}={}){
 if(typeof url!=='string'||!/^\/(?:audius-audio\/[A-Za-z0-9]{3,64}|jamendo-audio\/\d{1,16})$/.test(url))
  return false;
 const ctl=new AbortController(),abort=()=>ctl.abort();
 if(signal?.aborted)return false;
 signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(abort,Math.max(100,timeoutMs));
 let reader=null;
 try{
  const response=await fetcher(url,{method:'GET',cache:'no-store',
   credentials:'omit',headers:{Range:'bytes=0-2047',Accept:'audio/*'},signal:ctl.signal});
  if(!response||![200,206].includes(response.status)||!response.body)return false;
  const type=response.headers.get('content-type')||'';
  if(!AUDIO.test(type))return false;
  reader=response.body.getReader();
  const first=await reader.read();
  if(first.done||!first.value)return false;
  return audioHeaderAndSignature(type,new Uint8Array(first.value));
 }catch{return false}
 finally{
  ctl.abort();
  try{void reader?.cancel?.().catch(()=>{})}catch{}
  clearTimeout(timer);
  signal?.removeEventListener('abort',abort);
 }
}

export class VerifiedSourceRouter{
 constructor({providers=DEFAULT_AUDIO_PROVIDERS,probe=probePlayableAudio,
   now=()=>Date.now(),budgetMs=5900}={}){
  this.providers=providers;this.probe=probe;this.now=now;
  this.budgetMs=Math.max(100,Math.min(12000,budgetMs));
  this.pending=null;this.health=new Map();
 }
 cancel(){if(this.pending){this.pending.controller.abort();this.pending=null}}
 /** The same current track shares one resolution; a Next/Pause invalidates it. */
 resolve(track,{signal=null,known=[]}={}){
  if(track?.source!=='youtube'||!track?.videoId||!track?.title||!track?.artist||
   !Number.isFinite(Number(track.duration))||Number(track.duration)<=0)
   return Promise.resolve(null);
  const key=[track.videoId,track.title,track.artist,track.duration].join('|');
  if(this.pending?.key===key)return this.pending.promise;
  this.cancel();
  const ctl=new AbortController(),abort=()=>ctl.abort();
  if(signal?.aborted)return Promise.resolve(null);
  signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(abort,this.budgetMs);
  const pending={controller:ctl,key,promise:null};
  this.pending=pending;
  const started=this.now();
  const tasks=this.providers.filter(p=>{
   const info=this.health.get(p.id);
   return !info||info.disabledUntil<=this.now();
  }).map(async provider=>{
   if(ctl.signal.aborted)throw Error('canceled');
   // Omnibox may already have returned this same provider recording.
   // Reuse validated metadata immediately; avoid an extra catalogue RTT.
   const prior=exactIndependentRecording(track,(known||[]).filter(
    item=>item?.source===provider.id));
   const results=prior?[prior]:await provider.search(track.artist+' '+track.title,{
    signal:ctl.signal,limit:20
   });
   if(ctl.signal.aborted)throw Error('canceled');
   const exact=prior||exactIndependentRecording(track,results);
   const url=exact&&provider.url(exact);
   if(!exact||!url)throw Error('no exact match');
   const verified=await this.probe(url,{signal:ctl.signal});
   if(!verified||ctl.signal.aborted){
    const prev=this.health.get(provider.id)||{failures:0,disabledUntil:0};
    const failures=prev.failures+1;
    this.health.set(provider.id,{failures,disabledUntil:failures>=3?this.now()+30000:0});
    throw Error('audio unavailable');
   }
   this.health.set(provider.id,{failures:0,disabledUntil:0,
    lastVerifiedMs:this.now()-started});
   return {...exact,verifiedAudioURL:url};
  });
  const job=(async()=>{
   try{
    if(!tasks.length)return null;
    return await Promise.any(tasks);
   }catch{return null}
   finally{
    clearTimeout(timer);signal?.removeEventListener('abort',abort);
    // A winning stream is ready; discard other probes immediately.
    ctl.abort();
    if(this.pending===pending)this.pending=null;
   }
  })();
  pending.promise=job;
  return job;
 }
 snapshot(){
  return Object.fromEntries([...this.health].map(([id,value])=>[id,{...value}]));
 }
}
