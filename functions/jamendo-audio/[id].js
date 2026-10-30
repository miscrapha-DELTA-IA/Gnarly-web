/** Canonical-ID-only Jamendo MP3 transport for the existing GNARLY <audio>.
 * Never accept a user-supplied URL and never follow a redirect off Jamendo. */
const safeKey=v=>/^[a-f\d]{8,64}$/i.test(String(v||''))?String(v):null;
export function allowedJamendoOrigin(value){
 try{
  const u=new URL(value),h=u.hostname.toLowerCase();
  return u.protocol==='https:'&&!u.username&&!u.password&&
   (!u.port||u.port==='443')&&
   (h==='api.jamendo.com'||h==='storage.jamendo.com'||h.endsWith('.storage.jamendo.com'));
 }catch{return false}
}
const MEDIA=/^audio\/(?:mpeg|mp3|mp4|aac|ogg|flac|webm)(?:;|$)/i;
const cors={'Access-Control-Allow-Origin':'*',
 'Access-Control-Expose-Headers':'Content-Length,Content-Range,Accept-Ranges,X-Gnarly-Playback-Source'};
const error=(code,reason)=>new Response(reason,{status:code,headers:{...cors,'Cache-Control':'no-store'}});
export async function handleJamendoAudio({request,params,env},fetcher=fetch){
 const id=String(params?.id||''),key=safeKey(env?.JAMENDO_CLIENT_ID);
 if(!/^\d{1,16}$/.test(id))return error(400,'Invalid track ID');
 if(!key)return error(503,'Jamendo source not configured');
 if(!['GET','HEAD'].includes(request.method))return error(405,'Method not supported');
 const range=request.headers.get('Range');
 if(range&&(!/^bytes=(?:\d+-\d*|-\d+)$/.test(range)||range.length>48))
  return error(416,'Invalid Range');
 const url=new URL('https://api.jamendo.com/v3.0/tracks/file/');
 url.searchParams.set('client_id',key);url.searchParams.set('id',id);
 url.searchParams.set('action','stream');url.searchParams.set('audioformat','mp32');
 let current=url.href;
 try{
  const signal=AbortSignal.any([request.signal,AbortSignal.timeout(10000)]);
  for(let hop=0;hop<5;hop++){
   if(!allowedJamendoOrigin(current))return error(502,'Untrusted provider redirect');
   const response=await fetcher(current,{method:request.method,redirect:'manual',
    signal,credentials:'omit',headers:range?{Range:range}:{}});
   if([301,302,303,307,308].includes(response.status)){
    const next=response.headers.get('Location');
    try{await response.body?.cancel?.()}catch{}
    if(!next)return error(502,'Missing provider redirect');
    current=new URL(next,current).href;
    continue;
   }
   if(![200,206].includes(response.status)){
    try{await response.body?.cancel?.()}catch{}
    return error(response.status===404?404:response.status===429?429:503,'Jamendo stream unavailable');
   }
   const type=response.headers.get('Content-Type')||'';
   if(!MEDIA.test(type)){try{await response.body?.cancel?.()}catch{}
    return error(502,'Not an audio stream')}
   const h=new Headers({...cors,'Content-Type':type,'Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff','X-Gnarly-Playback-Source':'jamendo-native'});
   for(const k of ['Content-Length','Content-Range','Accept-Ranges','ETag'])
    if(response.headers.has(k))h.set(k,response.headers.get(k));
   return new Response(request.method==='HEAD'?null:response.body,{status:response.status,headers:h});
  }
  return error(502,'Redirect limit');
 }catch{
  return error(request.signal.aborted?499:504,'Jamendo source timeout');
 }
}
export const onRequestGet=ctx=>handleJamendoAudio(ctx);
export const onRequestHead=ctx=>handleJamendoAudio(ctx);
