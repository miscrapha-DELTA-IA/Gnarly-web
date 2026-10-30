/** Public availability index of ALREADY-CACHED, complete GNARLY R2 media.
 * Only public YouTube metadata and canonical IDs; no object URLs, private keys,
 * R2 object listing responses, or new extraction requests are exposed.
 */
const VALID=/^([A-Za-z0-9_-]{11})\/audio\.m4a$/;
const normalize=t=>String(t??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const clean=(t,max=160)=>String(t??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);
export function cachedTrack(object){
 const key=String(object?.key||''),match=VALID.exec(key);
 const title=clean(object?.customMetadata?.title);
 if(!match||!title||!(Number(object.size)>1024))return null;
 const id=match[1],separator=title.indexOf(' - ');
 const artist=separator>1&&separator<80?clean(title.slice(0,separator),100):'Artista não identificado';
 const song=separator>1&&separator<80?clean(title.slice(separator+3),170):title;
 if(!song)return null;
 const art=object?.customMetadata?.thumbnail;
 const artwork=typeof art==='string'&&/^https:\/\//i.test(art)?
  art.slice(0,550):'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg';
 return {id:'youtube:'+id,videoId:id,source:'youtube',title:song,artist,artwork,
  duration:0,playbackAvailability:'r2'};
}
export async function onRequestGet({request,env},cache=globalThis.caches?.default){
 const query=new URL(request.url).searchParams;
 const term=clean(query.get('term'),90),needle=normalize(term);
 const limit=Math.max(1,Math.min(32,Number.parseInt(query.get('limit')||'16',10)||16));
 const bucket=env?.GNARLY_AUDIO_R2;
 if(!bucket||typeof bucket.list!=='function')
  return Response.json({results:[],status:'r2_unavailable'},{headers:{'cache-control':'no-store'}});
 const key=cache?new Request(new URL('/api/r2-available?term='+encodeURIComponent(term)+'&limit='+limit,request.url)):null;
 if(cache&&key)try{const hit=await cache.match(key);if(hit)return hit}catch{}
 try{
  const results=[],seen=new Set();let cursor=null,round=0;
  // Do not scan unbounded storage or expose arbitrary bucket paths.
  while(round++<3){
   const response=await bucket.list({limit:1000,include:['customMetadata'],
    ...(cursor?{cursor}:{})});
   if(!Array.isArray(response?.objects))throw Error('Invalid R2 index');
   for(const object of response.objects){
    const track=cachedTrack(object);
    if(!track||seen.has(track.id))continue;
    seen.add(track.id);
    const searchable=track.artist==='Artista não identificado'?track.title:track.artist+' '+track.title;
    if(needle&&!normalize(searchable).includes(needle))continue;
    results.push(track);
   }
   if(!response.truncated||!response.cursor)break;
   cursor=response.cursor;
  }
  results.sort((a,b)=>a.title.localeCompare(b.title,'pt-BR'));
  const result=Response.json({results:results.slice(0,limit),status:'ok',
   hasMore:results.length>limit},{
   headers:{'cache-control':'public, max-age=60','x-content-type-options':'nosniff'}
  });
  if(cache&&key)try{await cache.put(key,result.clone())}catch{}
  return result;
 }catch{
  return Response.json({results:[],status:'r2_unavailable'},
   {status:503,headers:{'cache-control':'no-store'}});
 }
}
