/** Optional second independent full-track provider. Disabled unless first-party
 * Pages Function has its own JAMENDO_CLIENT_ID. Never expose third-party URLs. */
export function jamendoPlaybackURL(track){
 const id=String(track?.jamendoId||'');
 if(track?.source!=='jamendo'||!/^\d{1,16}$/.test(id)||track.id!=='jamendo:'+id)return null;
 return '/jamendo-audio/'+id;
}
export async function searchJamendo(term,{limit=15,signal,fetcher=globalThis.fetch}={}){
 const q=String(term||'').trim().slice(0,90);
 if(!q)return [];
 const ctl=new AbortController(),abort=()=>ctl.abort();
 if(signal?.aborted)abort();
 signal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(abort,4200);
 try{
  const response=await fetcher('/api/jamendo-search?term='+encodeURIComponent(q)+
   '&limit='+Math.max(1,Math.min(20,Number(limit)||15)),{
   method:'GET',credentials:'omit',signal:ctl.signal,headers:{Accept:'application/json'}
  });
  if(!response.ok)return [];
  const body=await response.json();
  if(body?.status!=='ok'||!Array.isArray(body.results))return [];
  return body.results.filter(x=>!!jamendoPlaybackURL(x)&&
   x.url===jamendoPlaybackURL(x)&&!!x.title&&!!x.artist&&
   Number.isFinite(Number(x.duration))&&Number(x.duration)>0).slice(0,20);
 }catch{return []}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',abort)}
}
