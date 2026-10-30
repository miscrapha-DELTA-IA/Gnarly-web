/** Independent full-track catalogue. Never mark previews as full recordings. */
export async function searchAudius(term,{limit=12,signal=null,fetcher=globalThis.fetch}={}){
 const q=String(term||'').trim().slice(0,90);if(!q)return [];
 const n=Math.max(1,Math.min(20,Number(limit)||12));
 const ctl=new AbortController(),abort=()=>ctl.abort();
 if(signal?.aborted)abort();
 signal?.addEventListener('abort',abort,{once:true});
 const timeout=setTimeout(abort,6500);
 try{
  const response=await fetcher('/api/audius-search?term='+encodeURIComponent(q)+'&limit='+n,{
   signal:ctl.signal,headers:{Accept:'application/json'}
  });
  if(!response.ok)throw Object.assign(new Error('Audius search HTTP '+response.status),{status:response.status});
  const data=await response.json();
  if(data?.status!=='ok'||!Array.isArray(data?.results))throw Error('Invalid Audius results');
  // Never accept a third-party URL carried in an arbitrary response.
  return data.results.filter(track=>track?.source==='audius'&&
    /^audius:[A-Za-z0-9]{3,64}$/.test(track.id||'')&&
    track.id==='audius:'+track.audiusId&&
    track.url==='/audius-audio/'+track.audiusId&&
    !!track.title&&!!track.artist).slice(0,n);
 }finally{clearTimeout(timeout);signal?.removeEventListener('abort',abort)}
}

export function audiusPlaybackURL(track){
 const id=track?.audiusId;
 if(track?.source!=='audius'||!id||!/^[A-Za-z0-9]{3,64}$/.test(id)||
   track.id!=='audius:'+id)return null;
 return '/audius-audio/'+id;
}
