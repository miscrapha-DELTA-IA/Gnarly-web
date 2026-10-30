// iTunes official previews and the Stage72 music SEARCH endpoint, separately.
// Never represent metadata hits as signed/decoded full MP3 streams.
const normalize = (r)=>({id:`itunes:${r.trackId}`,title:String(r.trackName||r.title||'Sem título'),artist:String(r.artistName||r.artist||'Artista'),album:String(r.collectionName||r.album||''),artwork:String(r.artworkUrl100||r.artwork||'').replace(/100x100bb/g,'600x600bb'),url:String(r.previewUrl||''),duration:Number(r.trackTimeMillis||0)/1000,source:'preview'});
/** The native search and Apple previews are independent providers.
 * Hedge the second Apple route only when the Pages proxy is not quick:
 * this removes the old 6.5s + 6.5s serial waterfall.
 */
async function json(url,timeout=6500,signal=null){
 const controller=new AbortController();
 const cancel=()=>controller.abort();
 if(signal?.aborted)cancel();
 signal?.addEventListener('abort',cancel,{once:true});
 const timer=setTimeout(cancel,timeout);
 try{
  const r=await fetch(url,{signal:controller.signal,headers:{accept:'application/json'}});
  if(!r.ok){
   const error=new Error('Catalog HTTP '+r.status);
   error.status=r.status;
   error.searchError=r.headers?.get('X-Search-Error')||'';
   const seconds=Number(r.headers?.get('Retry-After'));
   error.retryAfter=Number.isFinite(seconds)&&seconds>0?Math.min(120,seconds):30;
   throw error;
  }
  return await r.json();
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel)}
}
const previews=data=>{
 if(!Array.isArray(data?.results))throw Error('Invalid catalogue response');
 return data.results.map(normalize).filter(x=>x.url);
};
/** First nonempty genuine catalogue wins; the other request is canceled.
 * The caller's AbortSignal cancels BOTH requests on each new query.
 * A temporary empty/failed provider never hides a successful alternative.
 */
export async function hedgeCatalogue(primary,backup,{signal=null,delay=420,schedule=setTimeout,cancel=clearTimeout,throwOnFailure=false}={}){
 if(signal?.aborted)throw Object.assign(new Error('Search canceled'),{name:'AbortError'});
 const controllers=[new AbortController(),new AbortController()];
 const onAbort=()=>controllers.forEach(c=>c.abort());
 signal?.addEventListener('abort',onAbort,{once:true});
 let timer=null,startBackup=null,backupStarted=false,hadResponse=false;
 const accept=(results,message)=>{
  if(Array.isArray(results)){hadResponse=true;if(results.length)return results}
  throw Error(message);
 };
 const backupTask=new Promise((resolve,reject)=>{
  startBackup=()=>{
   if(backupStarted)return;
   backupStarted=true;
   if(timer!==null){cancel(timer);timer=null}
   Promise.resolve().then(()=>backup(controllers[1].signal)).then(results=>accept(results,'Empty backup catalogue')).then(resolve,reject);
  };
  timer=schedule(startBackup,delay);
 });
 const primaryTask=Promise.resolve().then(()=>primary(controllers[0].signal)).then(results=>{
  if(Array.isArray(results)){hadResponse=true;if(results.length)return results}
  startBackup();
  throw Error('Empty catalogue proxy');
 },error=>{startBackup();throw error});
 try{
  const results=await Promise.any([primaryTask,backupTask]);
  if(signal?.aborted)throw Object.assign(new Error('Search canceled'),{name:'AbortError'});
  return results;
 }catch(error){
  if(signal?.aborted)throw Object.assign(new Error('Search canceled'),{name:'AbortError'});
  if(throwOnFailure&&!hadResponse)throw error;
  return [];
 }finally{
  if(timer!==null)cancel(timer);
  onAbort();
  signal?.removeEventListener('abort',onAbort);
 }
}
export async function searchCatalog(term,{offset=0,limit=22,signal=null}={}){
 const q=String(term||'').trim().slice(0,90);if(!q)return [];
 const page=Math.min(200,Math.max(0,Math.floor(Number(offset)||0)));
 const size=Math.min(25,Math.max(1,Math.floor(Number(limit)||22)));
 const proxied='/api/catalog?term='+encodeURIComponent(q)+'&offset='+page+'&limit='+size;
 const direct=new URL('https://itunes.apple.com/search');
 direct.searchParams.set('term',q);direct.searchParams.set('entity','song');
 direct.searchParams.set('media','music');direct.searchParams.set('limit',String(size));
 direct.searchParams.set('offset',String(page));
 return hedgeCatalogue(
  controller=>json(proxied,6200,controller).then(previews),
  controller=>json(direct.href,6200,controller).then(previews),
  {signal,throwOnFailure:true}
 );
}
// In-memory positive metadata is safe for reuse. Unlike song audio, these
// records contain no credentials, tokens or playable media URLs.
const nativeResultsCache=new Map();
const NATIVE_FRESH_MS=15*60*1000, NATIVE_STALE_MS=2*60*60*1000;
let nativeSearchBlockedUntil=0;
export async function searchNativeBackend(term,{offset=0,limit=15,signal=null,now=()=>Date.now()}={}){
 const q=String(term||'').trim().slice(0,140);if(!q)return [];
 if(signal?.aborted)throw Object.assign(new Error('Search canceled'),{name:'AbortError'});
 const page=Math.min(80,Math.max(0,Math.floor(Number(offset)||0)));
 const size=Math.min(20,Math.max(1,Math.floor(Number(limit)||15)));
 const key=q.toLocaleLowerCase()+'|'+page+'|'+size,current=now(),hit=nativeResultsCache.get(key);
 if(hit&&hit.freshUntil>current)return hit.tracks.slice();
 // Metadata for a previously verified video ID is still useful if the
 // external catalogue is temporarily unavailable. Never invent audio URLs.
 if(current<nativeSearchBlockedUntil){
  if(hit&&hit.staleUntil>current)return hit.tracks.slice();
  throw Error('Native catalogue rate limited');
 }
 try{
  const url='/api/omnibox?term='+encodeURIComponent(q)+'&offset='+page+'&limit='+size;
  let data;
  try{data=await json(url,7400,signal)}
  catch(error){
   if(error?.status!==503||error.searchError!=='search_busy')throw error;
   // One short retry is for the LOCAL backend search worker only. Do not
   // retry actual YouTube provider 429s and do not block a later query.
   await new Promise(resolve=>setTimeout(resolve,350));
   if(signal?.aborted)throw Object.assign(new Error('Search canceled'),{name:'AbortError'});
   data=await json(url,7400,signal);
  }
  if(!Array.isArray(data?.results)||data.status&&data.status!=='ok')throw Error('Native catalogue unavailable');
  const tracks=data.results.filter(x=>x.source==='youtube');
  if(tracks.length){
   if(nativeResultsCache.size>=96)nativeResultsCache.delete(nativeResultsCache.keys().next().value);
   const savedAt=now();
   nativeResultsCache.set(key,{tracks,freshUntil:savedAt+NATIVE_FRESH_MS,staleUntil:savedAt+NATIVE_STALE_MS});
  }
  nativeSearchBlockedUntil=0;
  return tracks;
 }catch(error){
  // 429 is an explicit provider throttle, not a reason to retry every typed
  // prefix. Playback, queue and searches share a cooldown but not an error UI.
  if(error?.name==='AbortError')throw error;
  if(error?.status===429)nativeSearchBlockedUntil=Math.max(nativeSearchBlockedUntil,
   now()+1000*Math.max(5,Math.min(120,error.retryAfter||30)));
  if(hit&&hit.staleUntil>now())return hit.tracks.slice();
  throw error;
 }
}

// Metadata does not authorize a media URL. It only improves display credits, albums and artwork.
export async function resolveTrackMetadata(track,{signal}={}){
 if(!track?.title||!['youtube','local'].includes(track.source))return null;
 const q=new URLSearchParams({title:String(track.title).slice(0,180),artist:String(track.artist||'').slice(0,110),duration:String(Number(track.duration)||0)});
 try{const r=await fetch('/api/metadata?'+q,{signal,headers:{accept:'application/json'}});
 if(!r.ok)return null;const value=await r.json();return value.metadata||null}
 catch(e){if(e?.name==='AbortError')throw e;return null}
}
