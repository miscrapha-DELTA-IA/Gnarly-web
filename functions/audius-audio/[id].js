/** Audius public stream to SAME native GNARLY audio element.
 * Strict ID-only routing, no user URLs/cookies, redirect allowlist,
 * no preview substitution or shared caching of external media.
 */
const ID=/^[A-Za-z0-9]{3,64}$/;
const MEDIA=/^(audio\/(?:mpeg|mp3|mp4|aac|ogg|webm|flac)|application\/(?:octet-stream|x-mpegurl))(?:;|$)/i;
const REDIRECT=/^(?:301|302|303|307|308)$/;
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Expose-Headers':'Content-Length,Content-Range,Accept-Ranges,Retry-After,X-Gnarly-Playback-Source'};
function fail(status,message,retry=''){
 return new Response(message,{status,headers:{...cors,'Cache-Control':'no-store',
  ...(retry?{'Retry-After':retry}:{})}});
}
export function allowedAudiusMediaOrigin(raw){
 try{
  const u=new URL(raw);
  const host=u.hostname.toLowerCase();
  return u.protocol==='https:'&&!u.username&&!u.password&&
   (!u.port||u.port==='443')&&
   (host==='api.audius.co'||host.endsWith('.audius.co')||
    host==='audius.org'||host.endsWith('.audius.org')||
    host.endsWith('.r2.cloudflarestorage.com'));
 }catch{return false}
}
export async function handleAudiusAudio({request,params},fetcher=fetch){
 const id=params?.id;
 if(!ID.test(id||''))return fail(400,'Invalid Audius ID');
 if(!['GET','HEAD'].includes(request.method))return fail(405,'Method not allowed');
 const rawRange=request.headers.get('Range');
 if(rawRange&&(!/^bytes=(?:\d+-\d*|-\d+)$/.test(rawRange)||rawRange.length>48))
  return fail(416,'Invalid range');
 const api=new URL('https://api.audius.co/v1/tracks/'+id+'/stream');
 api.searchParams.set('app_name','Gnarly');
 let url=api.href;
 const ctl=AbortSignal.timeout(25000);
 const signal=AbortSignal.any([request.signal,ctl]);
 try{
  for(let hop=0;hop<5;hop++){
   if(!allowedAudiusMediaOrigin(url))return fail(502,'Untrusted provider redirect');
   const response=await fetcher(url,{
    method:request.method,signal,redirect:'manual',
    headers:{...(rawRange?{Range:rawRange}:{})},credentials:'omit'
   });
   if(REDIRECT.test(String(response.status))){
    const dest=response.headers.get('Location');
    const next=dest?new URL(dest,url).href:null;
    await response.body?.cancel?.().catch(()=>{});
    if(!next||!allowedAudiusMediaOrigin(next))return fail(502,'Untrusted provider redirect');
    url=next;continue;
   }
   if(response.status===429){
    await response.body?.cancel?.().catch(()=>{});
    return fail(429,'Audius temporariamente limitado',response.headers.get('Retry-After')||'30');
   }
   if(response.status!==200&&response.status!==206){
    await response.body?.cancel?.().catch(()=>{});
    return fail(response.status===404||response.status===403?404:503,'Audio stream unavailable');
   }
   const type=response.headers.get('Content-Type')||'';
   // Some Audius nodes return an official JSON stream URL instead of a 302.
   // Follow it only if the destination remains on our strict provider allowlist.
   if(/^application\/json(?:;|$)/i.test(type)&&url.startsWith('https://api.audius.co/')){
    const payload=await response.json().catch(()=>null);
    const target=typeof payload?.data==='string'?payload.data:
     typeof payload?.data?.url==='string'?payload.data.url:null;
    if(!target||!allowedAudiusMediaOrigin(target))return fail(502,'Untrusted Audius stream metadata');
    url=target;
    continue;
   }
   if(!MEDIA.test(type)){
    await response.body?.cancel?.().catch(()=>{});
    return fail(502,'Provider returned non-audio content');
   }
   const headers=new Headers({...cors,'Content-Type':type,'Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff','X-Gnarly-Playback-Source':'audius-native'});
   for(const key of ['Content-Length','Content-Range','Accept-Ranges','ETag'])
    if(response.headers.has(key))headers.set(key,response.headers.get(key));
   return new Response(request.method==='HEAD'?null:response.body,{status:response.status,headers});
  }
  return fail(502,'Audius redirect limit');
 }catch(error){
  if(request.signal.aborted)return fail(499,'Playback canceled');
  return fail(error?.name==='TimeoutError'?504:503,'Audius stream temporarily unavailable');
 }
}
export const onRequestGet=ctx=>handleAudiusAudio(ctx);
export const onRequestHead=ctx=>handleAudiusAudio(ctx);
