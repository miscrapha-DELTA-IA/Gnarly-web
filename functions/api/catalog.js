// Official music metadata + 30s previews from Apple's iTunes Search API.
// No unauthorized full-track downloading or API keys. Server-side proxy avoids CORS problems.
export async function onRequestGet({request}) {
  try {
    const url = new URL(request.url);
    const term=(url.searchParams.get('term')||'').trim().slice(0,90);
    if(term.length<2)return new Response(JSON.stringify({error:'Use pelo menos 2 caracteres'}),{status:400,headers:{'content-type':'application/json'}});
    const apple = new URL('https://itunes.apple.com/search');
    apple.searchParams.set('term',term);
    apple.searchParams.set('media','music');apple.searchParams.set('entity','song');apple.searchParams.set('limit','22');
    const res=await fetch(apple,{headers:{'accept':'application/json'},signal:AbortSignal.timeout(8000)});
    if(!res.ok)throw Error('Apple catalog returned '+res.status);
    const data=await res.json();
    const results=(data.results||[]).filter(x=>x.wrapperType==='track'&&x.previewUrl).map(x=>({trackId:x.trackId,trackName:x.trackName,artistName:x.artistName,collectionName:x.collectionName,artworkUrl100:x.artworkUrl100,previewUrl:x.previewUrl,trackTimeMillis:x.trackTimeMillis}));
    return new Response(JSON.stringify({results}),{status:200,headers:{'content-type':'application/json','cache-control':'public,max-age=120'}});
  }catch(e){return new Response(JSON.stringify({error:'Não foi possível carregar o catálogo agora.'}),{status:502,headers:{'content-type':'application/json'}})}
}
