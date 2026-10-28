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
  if(!r.ok)throw Error('Catalog HTTP '+r.status);
  return await r.json();
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel)}
}
const previews=data=>Array.isArray(data?.results)?data.results.map(normalize).filter(x=>x.url):[];
/** First nonempty genuine catalogue wins; the other request is canceled.
 * The caller's AbortSignal cancels BOTH requests on each new query.
 * A temporary empty/failed provider never hides a successful alternative.
 */
export async function hedgeCatalogue(primary,backup,{signal=null,delay=420,schedule=setTimeout,cancel=clearTimeout}={}){
 if(signal?.aborted)throw Object.assign(new Error('Search canceled'),{name:'AbortError'});
 const controllers=[new AbortController(),new AbortController()];
 const onAbort=()=>controllers.forEach(c=>c.abort());
 signal?.addEventListener('abort',onAbort,{once:true});
 let timer=null,startBackup=null,backupStarted=false;
 const backupTask=new Promise((resolve,reject)=>{
  startBackup=()=>{
   if(backupStarted)return;
   backupStarted=true;
   if(timer!==null){cancel(timer);timer=null}
   Promise.resolve().then(()=>backup(controllers[1].signal)).then(resolve,reject);
  };
  timer=schedule(startBackup,delay);
 });
 const primaryTask=Promise.resolve().then(()=>primary(controllers[0].signal)).then(results=>{
  if(results?.length)return results;
  startBackup();
  throw Error('Empty catalogue proxy');
 },error=>{startBackup();throw error});
 try{
  const results=await Promise.any([primaryTask,backupTask]);
  if(signal?.aborted)throw Object.assign(new Error('Search canceled'),{name:'AbortError'});
  return results;
 }catch(error){
  if(signal?.aborted)throw Object.assign(new Error('Search canceled'),{name:'AbortError'});
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
  {signal}
 );
}
export async function searchNativeBackend(term,{offset=0,limit=15,signal=null}={}){
 const q=String(term||'').trim().slice(0,140);if(!q)return [];
 const page=Math.min(80,Math.max(0,Math.floor(Number(offset)||0)));
 const size=Math.min(20,Math.max(1,Math.floor(Number(limit)||15)));
 const data=await json('/api/omnibox?term='+encodeURIComponent(q)+'&offset='+page+'&limit='+size,7400,signal);
 return Array.isArray(data.results)?data.results.filter(x=>x.source==='youtube'):[];
}

// Metadata does not authorize a media URL. It only improves display credits, albums and artwork.
export async function resolveTrackMetadata(track,{signal}={}){
 if(!track?.title||!['youtube','local'].includes(track.source))return null;
 const q=new URLSearchParams({title:String(track.title).slice(0,180),artist:String(track.artist||'').slice(0,110),duration:String(Number(track.duration)||0)});
 try{const r=await fetch('/api/metadata?'+q,{signal,headers:{accept:'application/json'}});
 if(!r.ok)return null;const value=await r.json();return value.metadata||null}
 catch(e){if(e?.name==='AbortError')throw e;return null}
}
