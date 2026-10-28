/** First-party GNARLY Fast Stream: R2 edge hit, progressive Render miss.
 * The only accepted public input is a canonical eleven-character video ID.
 * No bucket listing, credentials, arbitrary URL proxying, or signed URL leaks.
 */
const VIDEO_ID=/^[A-Za-z0-9_-]{11}$/;
const RENDER='https://nightcorelab.onrender.com';
const PASSTHROUGH=['content-length','content-range','accept-ranges','etag','last-modified'];
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Expose-Headers':
 'Content-Length, Content-Range, Accept-Ranges, X-Gnarly-Playback-Source, Server-Timing'};

export function validByteRange(value){
 if(!value)return null;
 if(typeof value!=='string'||value.length>48)return false;
 return /^bytes=(?:\d+-\d*|-\d+)$/.test(value)?value:false;
}
function reply(status,body='',headers={}){
 return new Response(body,{status,headers:{...cors,'Cache-Control':'no-store',...headers}});
}
function audioHeaders(source,extra={}){
 return new Headers({...cors,'Content-Type':'audio/mp4','Accept-Ranges':'bytes',
  'X-Content-Type-Options':'nosniff','Cache-Control':'public, max-age=86400',
  'X-Gnarly-Playback-Source':source,...extra});
}
async function edgeAudio(bucket,id,range,headOnly){
 const key=id+'/audio.m4a';
 const obj=headOnly?await bucket.head(key):
  await bucket.get(key,range?{range:new Headers({Range:range})}:{});
 if(!obj)return null;
 const size=obj.size;
 if(!Number.isSafeInteger(size)||size<=0)return null;
 const headers=audioHeaders('r2-edge');
 headers.set('ETag',obj.httpEtag);
 headers.set('Content-Length',String(size));
 const r=obj.range;
 if(range&&r&&Number.isInteger(r.offset)&&Number.isInteger(r.length)&&r.length>0){
  headers.set('Content-Range',`bytes ${r.offset}-${r.offset+r.length-1}/${size}`);
  headers.set('Content-Length',String(r.length));
  return new Response(headOnly?null:obj.body,{status:206,headers});
 }
 if(range&&!headOnly){
  // R2 can reject an invalid/satisfiable-range combination. Don't send
  // a full response with an incorrect 206; browsers will retry correctly.
  return reply(416,'',{ 'Content-Range':'bytes */'+size });
 }
 return new Response(headOnly?null:obj.body,{status:200,headers});
}
export async function handleFastAudio({request,env,params},fetcher=fetch){
 const id=params?.id;
 if(!VIDEO_ID.test(id||''))return reply(400,'Invalid track ID');
 if(request.method!=='GET'&&request.method!=='HEAD')
  return reply(405,'',{Allow:'GET, HEAD'});
 const range=validByteRange(request.headers.get('Range'));
 if(range===false)return reply(416,'Unsupported Range');
 const started=Date.now();
 if(env?.GNARLY_AUDIO_R2){
  try{
   const result=await edgeAudio(env.GNARLY_AUDIO_R2,id,range,request.method==='HEAD');
   if(result){
    result.headers.set('Server-Timing','edge;dur='+Math.max(0,Date.now()-started));
    return result;
   }
  }catch(error){
   console.warn('GNARLY fast audio R2 error',error?.name||'unknown');
  }
 }
 // HEAD is side-effect-free: never start metadata extraction on a cache probe.
 if(request.method==='HEAD')return reply(404,'',{'X-Gnarly-Playback-Source':'cache-miss'});
 const youtube='https://www.youtube.com/watch?v='+id;
 const options={method:'GET',headers:range?{Range:range}:{},redirect:'manual'};
 const candidates=[
  new URL('/stream?url='+encodeURIComponent(youtube),RENDER),
  new URL('/download?delivery=browser&url='+encodeURIComponent(youtube),RENDER)
 ];
 for(let index=0;index<candidates.length;index++){
  let upstream;
  try{upstream=await fetcher(candidates[index].href,options)}catch{continue}
  if(upstream.status!==200&&upstream.status!==206)continue;
  const contentType=upstream.headers.get('content-type')||'';
  if(!/^audio\/(?:mp4|mpeg|aac|x-m4a)(?:;|$)/i.test(contentType))continue;
  const headers=audioHeaders(index===0?'progressive-origin':'extraction-origin',
   {'Cache-Control':'no-store','Server-Timing':
    'edge;dur='+Math.max(0,Date.now()-started)+', origin;desc="'+(index===0?'progressive':'prepared')+'"'});
  for(const key of PASSTHROUGH){
   if(upstream.headers.has(key))headers.set(key,upstream.headers.get(key));
  }
  if(!upstream.headers.has('content-length'))headers.delete('content-length');
  if(!upstream.headers.has('content-range'))headers.delete('content-range');
  return new Response(upstream.body,{status:upstream.status,headers});
 }
 return reply(503,'Audio source temporarily unavailable',{'Retry-After':'8',
  'X-Gnarly-Playback-Source':'unavailable'});
}
export const onRequestGet=ctx=>handleFastAudio(ctx);
export const onRequestHead=ctx=>handleFastAudio(ctx);
