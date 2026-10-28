// iTunes official previews and the Stage72 music SEARCH endpoint, separately.
// Never represent metadata hits as signed/decoded full MP3 streams.
const normalize = (r)=>({id:`itunes:${r.trackId}`,title:String(r.trackName||r.title||'Sem título'),artist:String(r.artistName||r.artist||'Artista'),album:String(r.collectionName||r.album||''),artwork:String(r.artworkUrl100||r.artwork||'').replace(/100x100bb/g,'600x600bb'),url:String(r.previewUrl||''),duration:Number(r.trackTimeMillis||0)/1000,source:'preview'});
async function json(url,timeout=9500){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeout);try{const r=await fetch(url,{signal:controller.signal});if(!r.ok)throw Error('Catalog HTTP '+r.status);return await r.json()}finally{clearTimeout(timer)}}
export async function searchCatalog(term,{offset=0,limit=22}={}){const q=String(term||'').trim().slice(0,90);if(q.length<2)return [];
 const page=Math.min(200,Math.max(0,Math.floor(Number(offset)||0)));
 const size=Math.min(25,Math.max(1,Math.floor(Number(limit)||22)));
 try{const data=await json(`/api/catalog?term=${encodeURIComponent(q)}&offset=${page}&limit=${size}`);if(Array.isArray(data.results))return data.results.map(normalize).filter(x=>x.url)}catch{}
 const url=new URL('https://itunes.apple.com/search');url.searchParams.set('term',q);url.searchParams.set('entity','song');url.searchParams.set('media','music');url.searchParams.set('limit',String(size));url.searchParams.set('offset',String(page));const data=await json(url,8500);return (data.results||[]).map(normalize).filter(x=>x.url)}
export async function searchNativeBackend(term,{offset=0,limit=15}={}){const q=String(term||'').trim().slice(0,140);if(q.length<2)return [];
 const page=Math.min(80,Math.max(0,Math.floor(Number(offset)||0)));
 const size=Math.min(20,Math.max(1,Math.floor(Number(limit)||15)));
 const data=await json(`/api/omnibox?term=${encodeURIComponent(q)}&offset=${page}&limit=${size}`,13000);
 return Array.isArray(data.results)?data.results.filter(x=>x.source==='youtube'):[]}

// Metadata does not authorize a media URL. It only improves display credits, albums and artwork.
export async function resolveTrackMetadata(track,{signal}={}){
 if(!track?.title||!['youtube','local'].includes(track.source))return null;
 const q=new URLSearchParams({title:String(track.title).slice(0,180),artist:String(track.artist||'').slice(0,110),duration:String(Number(track.duration)||0)});
 try{const r=await fetch('/api/metadata?'+q,{signal,headers:{accept:'application/json'}});
 if(!r.ok)return null;const value=await r.json();return value.metadata||null}
 catch(e){if(e?.name==='AbortError')throw e;return null}
}
