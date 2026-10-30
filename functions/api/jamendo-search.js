/** First-party optional independent Jamendo resolver, never a YouTube fallback.
 * Client ID is configured in Cloudflare Pages as JAMENDO_CLIENT_ID.
 * Search responses carry only canonical metadata and our own stream URL. */
const clean=(v,n)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,n);
const clientId=v=>/^[a-f\d]{8,64}$/i.test(String(v||''))?String(v):null;
export function normalizeJamendoTrack(item){
 const id=String(item?.id||'');
 if(!/^\d{1,16}$/.test(id)||typeof item?.audio!=='string'||
   !/^https:\/\//.test(item.audio))return null;
 const artist=clean(item.artist_name,120),title=clean(item.name,180);
 const duration=Number(item.duration);
 if(!artist||!title||!Number.isFinite(duration)||duration<25||duration>3600)return null;
 return {id:'jamendo:'+id,jamendoId:id,source:'jamendo',title,artist,duration,
  album:clean(item.album_name,150),
  artwork:typeof item.image==='string'&&item.image.startsWith('https://')?
   item.image.slice(0,600):'',
  url:'/jamendo-audio/'+id};
}
export async function onRequestGet({request,env},fetcher=fetch){
 const key=clientId(env?.JAMENDO_CLIENT_ID);
 if(!key)return Response.json({status:'not_configured',results:[]},{status:503,
  headers:{'Cache-Control':'no-store'}});
 const u=new URL(request.url),term=clean(u.searchParams.get('term'),90);
 if(!term)return Response.json({status:'invalid_query',results:[]},{status:400});
 const limit=Math.max(1,Math.min(20,Number(u.searchParams.get('limit'))||15));
 const api=new URL('https://api.jamendo.com/v3.0/tracks/');
 api.searchParams.set('client_id',key);api.searchParams.set('format','json');
 api.searchParams.set('search',term);api.searchParams.set('limit',String(limit));
 api.searchParams.set('type','single albumtrack');api.searchParams.set('audioformat','mp32');
 try{
  const response=await fetcher(api.href,{method:'GET',redirect:'error',
   headers:{Accept:'application/json'},credentials:'omit',
   signal:AbortSignal.any([request.signal,AbortSignal.timeout(4000)])});
  if(!response.ok)return Response.json({status:'unavailable',results:[]},{status:503});
  const body=await response.json();
  if(body?.headers?.status!=='success'||!Array.isArray(body?.results))
   return Response.json({status:'unavailable',results:[]},{status:503});
  return Response.json({status:'ok',results:body.results.map(normalizeJamendoTrack).filter(Boolean)},{
   headers:{'Cache-Control':'public,max-age=120','X-Content-Type-Options':'nosniff'}});
 }catch{return Response.json({status:'unavailable',results:[]},{status:503,
  headers:{'Cache-Control':'no-store'}})}
}
