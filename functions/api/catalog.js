// Official music metadata + 30s previews from Apple's iTunes Search API.
// No unauthorized full-track downloading or API keys. Server-side proxy avoids CORS problems.
export async function onRequestGet({request,context,waitUntil}) {
  try {
    const url = new URL(request.url);
    const term=(url.searchParams.get('term')||'').trim().slice(0,90);
    const offset=Math.min(200,Math.max(0,Number.parseInt(url.searchParams.get('offset')||'0',10)||0));
    const limit=Math.min(25,Math.max(1,Number.parseInt(url.searchParams.get('limit')||'22',10)||22));
    if(term.length<1)return new Response(JSON.stringify({error:'Use pelo menos 2 caracteres'}),{status:400,headers:{'content-type':'application/json'}});
    const edgeCache=globalThis.caches?.default,cacheKey=edgeCache?new Request(request.url,{method:'GET'}):null;
    if(edgeCache&&cacheKey){try{const cached=await edgeCache.match(cacheKey);if(cached)return cached}catch{}}
    const apple = new URL('https://itunes.apple.com/search');
    apple.searchParams.set('term',term);
    apple.searchParams.set('media','music');apple.searchParams.set('entity','song');apple.searchParams.set('limit',String(limit));
    if(offset)apple.searchParams.set('offset',String(offset));
    const res=await fetch(apple,{headers:{'accept':'application/json'},signal:AbortSignal.timeout(6300),cf:{cacheEverything:true,cacheTtlByStatus:{'200-299':120,'400-599':-1}}});
    if(!res.ok)throw Error('Apple catalog returned '+res.status);
    const data=await res.json();
    const results=(data.results||[]).filter(x=>x.wrapperType==='track'&&x.previewUrl).map(x=>({trackId:x.trackId,trackName:x.trackName,artistName:x.artistName,collectionName:x.collectionName,artworkUrl100:x.artworkUrl100,previewUrl:x.previewUrl,trackTimeMillis:x.trackTimeMillis}));
    const result=new Response(JSON.stringify({results}),{status:200,headers:{'content-type':'application/json','cache-control':'public,max-age=120'}});
    const defer=waitUntil||(context?.waitUntil?job=>context.waitUntil(job):null);
    if(results.length&&edgeCache&&cacheKey&&defer)
      defer(edgeCache.put(cacheKey,result.clone()).catch(()=>{}));
    return result;
  }catch(e){return new Response(JSON.stringify({error:'Não foi possível carregar o catálogo agora.'}),{status:502,headers:{'content-type':'application/json','cache-control':'no-store'}})}
}
