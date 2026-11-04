/** Bounded public autocomplete from the existing music-catalogue endpoint.
 * This proxies search WORDS only. No listener history, cookies, IP lists,
 * playback URLs, provider auth or extract/download requests are forwarded.
 */
const allowedBackend=value=>{try{
 const url=new URL(value);
 return url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash?url:null;
}catch{return null}};
export function cleanSuggestions(values,query,max=8){
 if(!Array.isArray(values))return [];
 const seen=new Set(),out=[];
 for(const value of values.slice(0,25)){
  if(typeof value!=='string')continue;
  const phrase=value.replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,90);
  const key=phrase.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if(phrase.length<2||key===query.toLowerCase()||seen.has(key))continue;
  seen.add(key);out.push(phrase);
  if(out.length>=max)break;
 }
 return out;
}
export async function onRequestGet({request,env,context,waitUntil}){
 const q=new URL(request.url).searchParams.get('q')?.trim().slice(0,80)||'';
 if(q.length<3)return Response.json({suggestions:[]},{headers:{'cache-control':'no-store'}});
 const backend=allowedBackend(env?.GNARLY_BACKEND_URL||'https://nightcorelab.onrender.com');
 if(!backend)return Response.json({suggestions:[],status:'unavailable'},{
  status:503,headers:{'cache-control':'no-store'}});
 const edgeCache=globalThis.caches?.default,cacheKey=edgeCache?
  new Request(new URL('/api/suggest?q='+encodeURIComponent(q.toLowerCase()),request.url)) : null;
 if(edgeCache&&cacheKey)try{
  const hit=await edgeCache.match(cacheKey);
  if(hit)return new Response(hit.body,hit);
 }catch{}
 try{
  const target=new URL('/v1/suggest',backend);
  target.searchParams.set('q',q);
  const response=await fetch(target,{
   headers:{accept:'application/json'},
   signal:AbortSignal.any([request.signal,AbortSignal.timeout(4100)]),
   cf:{cacheEverything:true,cacheTtlByStatus:{'200-299':180,'400-599':-1}}
  });
  if(!response.ok)return Response.json({suggestions:[],status:'unavailable'},{
   status:503,headers:{'cache-control':'no-store'}});
  const raw=await response.text();
  if(raw.length>14000)throw Error('oversized suggestions');
  const suggestions=cleanSuggestions(JSON.parse(raw),q);
  const answer=Response.json({suggestions,status:'ok'},{
   headers:{'cache-control':'public,max-age=180','x-content-type-options':'nosniff'}
  });
  const defer=waitUntil||(context?.waitUntil?job=>context.waitUntil(job):null);
  if(suggestions.length&&edgeCache&&cacheKey&&defer)
   defer(edgeCache.put(cacheKey,answer.clone()).catch(()=>{}));
  return answer;
 }catch{
  return Response.json({suggestions:[],status:'unavailable'},{
   status:503,headers:{'cache-control':'no-store'}});
 }
}
