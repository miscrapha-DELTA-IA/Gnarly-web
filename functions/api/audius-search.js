/** Audius read-only catalogue. A track is offered ONLY when API streaming
 * is explicitly enabled and no account, payment or preview gate applies.
 * Metadata alone never upgrades a YouTube ID into a different recording.
 */
const AUDIUS_ID=/^[A-Za-z0-9]{3,64}$/;
const clean=(v,n)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,n);
export function normalizeAudiusTrack(item){
 if(!item||!AUDIUS_ID.test(item.id||'')||
  item.is_streamable!==true||item.is_available===false||
  item.is_stream_gated===true||item.is_unlisted===true||item.is_delete===true||
  item.stream_conditions||item.access?.stream===false)return null;
 const artist=clean(item.user?.name,120),title=clean(item.title,180);
 if(!title||!artist)return null;
 const duration=Number(item.duration);
 if(!Number.isFinite(duration)||duration<25||duration>3600)return null;
 const artwork=[item.artwork?.['480x480'],item.artwork?.['150x150'],
  item.artwork?.['1000x1000']].find(u=>typeof u==='string'&&/^https:\/\//i.test(u))||'';
 return {
  id:'audius:'+item.id,source:'audius',audiusId:item.id,
  title,artist,album:clean(item.album?.name||'',150),
  artwork:artwork.slice(0,600),duration,
  url:'/audius-audio/'+item.id
 };
}
export async function onRequestGet({request,context,waitUntil},fetcher=fetch){
 const u=new URL(request.url),query=clean(u.searchParams.get('term'),90);
 if(!query)return Response.json({error:'Termo de busca obrigatório'},{status:400});
 const size=Math.max(1,Math.min(20,Number.parseInt(u.searchParams.get('limit')||'12',10)||12));
 const edgeCache=globalThis.caches?.default,cacheKey=edgeCache?new Request(u.href):null;
 if(edgeCache&&cacheKey)try{
  const cached=await edgeCache.match(cacheKey);
  if(cached){const hit=new Response(cached.body,cached);
   hit.headers.set('X-Gnarly-Search-Cache','HIT');return hit}
 }catch{}
 try{
  const api=new URL('https://api.audius.co/v1/tracks/search');
  api.searchParams.set('query',query);api.searchParams.set('limit',String(size));
  api.searchParams.set('app_name','Gnarly');
  const signal=AbortSignal.any([request.signal,AbortSignal.timeout(6100)]);
  const resp=await fetcher(api.href,{method:'GET',signal,headers:{Accept:'application/json'},redirect:'error'});
  if(resp.status===429)return Response.json({results:[],status:'upstream_rate_limited'},
   {status:429,headers:{'cache-control':'no-store','Retry-After':resp.headers.get('retry-after')||'30'}});
  if(!resp.ok)return Response.json({results:[],status:'audius_unavailable'},
   {status:503,headers:{'cache-control':'no-store'}});
  const body=await resp.json();
  if(!Array.isArray(body?.data))throw Error('Invalid provider payload');
  const results=body.data.map(normalizeAudiusTrack).filter(Boolean);
  const result=Response.json({results,status:'ok'},{
   headers:{'cache-control':'public,max-age=180','x-content-type-options':'nosniff',
    'X-Gnarly-Search-Cache':'MISS'}
  });
  const defer=waitUntil||(context?.waitUntil?job=>context.waitUntil(job):null);
  if(results.length&&edgeCache&&cacheKey&&defer)defer(edgeCache.put(cacheKey,result.clone()).catch(()=>{}));
  return result;
 }catch{
  return Response.json({results:[],status:'audius_unavailable'},{status:503,headers:{'cache-control':'no-store'}});
 }
}
