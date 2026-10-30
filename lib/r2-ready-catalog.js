/** Native-only cache discovery. Never sends a request to Render or YouTube. */
export async function searchReadyAudio(term='',{limit=16,signal,fetcher=globalThis.fetch}={}){
 const query=String(term||'').trim().slice(0,90);
 if(typeof fetcher!=='function')return [];
 const ctl=new AbortController();
 const cancel=()=>ctl.abort();
 if(signal?.aborted)cancel();
 signal?.addEventListener('abort',cancel,{once:true});
 const timer=setTimeout(cancel,5000);
 try{
  const endpoint='/api/r2-available?term='+encodeURIComponent(query)+
   '&limit='+Math.max(1,Math.min(32,Number(limit)||16));
  const response=await fetcher(endpoint,{signal:ctl.signal,headers:{Accept:'application/json'}});
  if(!response.ok)return [];
  const data=await response.json();
  if(data?.status!=='ok'||!Array.isArray(data.results))return [];
  return data.results.filter(t=>t?.source==='youtube'&&
   /^youtube:[A-Za-z0-9_-]{11}$/.test(t.id||'')&&
   t.id==='youtube:'+t.videoId&&t.playbackAvailability==='r2'&&
   !!t.title).slice(0,32);
 }catch{return []}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel)}
}
