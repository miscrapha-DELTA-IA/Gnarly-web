const normalize = (r)=>({
  id:`itunes:${r.trackId}`,
  title: String(r.trackName||r.title||'Sem título'), artist:String(r.artistName||r.artist||'Artista'),
  album:String(r.collectionName||r.album||''),
  artwork:String(r.artworkUrl100||r.artwork||'').replace(/100x100bb/g,'600x600bb'),
  url:String(r.previewUrl||''), duration:Number(r.trackTimeMillis||0)/1000,
  source:'preview'
});
export async function searchCatalog(term){
  const q=String(term||'').trim().slice(0,90);if(q.length<2)return [];
  const abort=new AbortController();const cancel=setTimeout(()=>abort.abort(),10000);
  try{
    const local=await fetch(`/api/catalog?term=${encodeURIComponent(q)}`,{signal:abort.signal});
    if(local.ok){const data=await local.json();if(Array.isArray(data.results))return data.results.map(normalize).filter(x=>x.url)}
  }catch{/* static preview host: try direct public Apple API */}
  finally{clearTimeout(cancel)}
  const abort2=new AbortController();const timer=setTimeout(()=>abort2.abort(),8500);
  try{const url=new URL('https://itunes.apple.com/search');url.searchParams.set('term',q);url.searchParams.set('entity','song');url.searchParams.set('media','music');url.searchParams.set('limit','22');const r=await fetch(url,{signal:abort2.signal});if(!r.ok)throw Error('Catálogo indisponível');const body=await r.json();return (body.results||[]).map(normalize).filter(x=>x.url)}finally{clearTimeout(timer)}
}
