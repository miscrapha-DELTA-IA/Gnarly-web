/** First-party GNARLY Fast Stream: R2 edge hit, progressive Render miss.
 * The only accepted public input is a canonical eleven-character video ID.
 * No bucket listing, credentials, arbitrary URL proxying, or signed URL leaks.
 */
import {fetchAudioHeaders,discardAudioBody,retryAfter,validAudioResponse} from '../_lib/origin-audio.js';
const VIDEO_ID=/^[A-Za-z0-9_-]{11}$/;
const RENDER='https://nightcorelab.onrender.com';
const PASSTHROUGH=['content-length','content-range','accept-ranges','etag','last-modified'];

const PROMOTION_MAX_BYTES=16*1024*1024;
/** Never promote partial, unbounded or malformed media to the shared cache.
 * A full-span 206 is allowed because browsers often request bytes=0-.
 */
export function completeAudioLength(response){
 const size=Number(response.headers.get('content-length'));
 if(!Number.isSafeInteger(size)||size<1024||size>PROMOTION_MAX_BYTES)return 0;
 if(response.status===200)return size;
 if(response.status!==206)return 0;
 const match=/^bytes 0-(\d+)\/(\d+)$/.exec(response.headers.get('content-range')||'');
 return match&&Number(match[1])+1===size&&Number(match[2])===size?size:0;
}
function promoteCompleteStream({upstream,bucket,id,waitUntil}){
 const size=completeAudioLength(upstream);
 if(!size||!/^audio\/(?:mp4|x-m4a)(?:;|$)/i.test(upstream.headers.get('content-type')||'')||
  !upstream.body||!bucket||typeof bucket.put!=='function'||typeof waitUntil!=='function')
  return upstream.body;
 const [browser,copy]=upstream.body.tee();
 const work=(async()=>{
  const chunks=[];let received=0;
  try{
   const reader=copy.getReader();
   while(true){
    const {done,value}=await reader.read();if(done)break;
    received+=value.byteLength;
    if(received>size){await reader.cancel();return}
    chunks.push(value);
   }
   if(received!==size)return;
   const bytes=new Uint8Array(size);let offset=0;
   for(const part of chunks){bytes.set(part,offset);offset+=part.byteLength}
   // A complete ISO-BMFF file begins with an ftyp box. Never promote a
   // mislabeled HTML/error body or another codec into the shared M4A key.
   if(bytes[4]!==102||bytes[5]!==116||bytes[6]!==121||bytes[7]!==112)return;
   await bucket.put(id+'/audio.m4a',bytes,{httpMetadata:{contentType:'audio/mp4'}});
  }catch(error){console.debug('GNARLY edge cache promotion skipped',error?.name||'unknown')}
 })();
 try{waitUntil(work)}catch{void work.catch(()=>{})}
 return browser;
}

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Expose-Headers':
 'Content-Length, Content-Range, Accept-Ranges, X-Gnarly-Playback-Source, Server-Timing'};

export function validByteRange(value){
 if(!value)return null;
 if(typeof value!=='string'||value.length>48)return false;
 const match=/^bytes=(?:(\d+)-(\d*)|-(\d+))$/.exec(value);
 if(!match)return false;
 if(match[3]!==undefined)return Number.isSafeInteger(Number(match[3]))&&Number(match[3])>0?value:false;
 const start=Number(match[1]),end=match[2]===''?null:Number(match[2]);
 return Number.isSafeInteger(start)&&(end===null||Number.isSafeInteger(end)&&end>=start)?value:false;
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
 let obj;
 try{obj=headOnly?await bucket.head(key):
  await bucket.get(key,range?{range:new Headers({Range:range})}:{})}
 catch(error){
  // An unsatisfiable R2 range must not trigger a new provider extraction.
  if(range&&!headOnly){
   const existing=await bucket.head(key);
   const start=/^bytes=(\d+)-/.exec(range);
   if(Number.isSafeInteger(existing?.size)&&existing.size>0&&start&&Number(start[1])>=existing.size)
    return reply(416,'',{'Content-Range':'bytes */'+existing.size});
  }
  throw error;
 }
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
  discardAudioBody(obj);
  return reply(416,'',{ 'Content-Range':'bytes */'+size });
 }
 return new Response(headOnly?null:obj.body,{status:200,headers});
}
export async function handleFastAudio({request,env,params,waitUntil:contextWaitUntil,originTimeoutMs=40000},fetcher=fetch){
 const id=params?.id;
 if(!VIDEO_ID.test(id||''))return reply(400,'Invalid track ID');
 if(request.method!=='GET'&&request.method!=='HEAD')
  return reply(405,'',{Allow:'GET, HEAD'});
 const range=validByteRange(request.headers.get('Range'));
 if(range===false)return reply(416,'Unsupported Range');
 const started=Date.now();
 if(request.signal?.aborted)return reply(499);
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
  try{upstream=await fetchAudioHeaders(fetcher,candidates[index].href,options,{
   signal:request.signal,timeoutMs:originTimeoutMs-(Date.now()-started)
  })}catch(error){
   if(request.signal?.aborted||error?.name==='AbortError')return reply(499);
   if(error?.name==='TimeoutError')return reply(504,'Audio origin timed out',{
    'Retry-After':'8','X-Gnarly-Playback-Source':'origin-timeout'});
   continue;
  }
  if([401,403,416,429,503,504].includes(upstream.status)){
   const headers={'X-Gnarly-Playback-Source':'origin-unavailable'};
   if([429,503,504].includes(upstream.status))headers['Retry-After']=retryAfter(upstream);
   if(upstream.status===416&&/^bytes \*\/\d+$/.test(upstream.headers.get('Content-Range')||''))
    headers['Content-Range']=upstream.headers.get('Content-Range');
   discardAudioBody(upstream);
   return reply(upstream.status,'Audio source temporarily unavailable',headers);
  }
  if(!validAudioResponse(upstream)){discardAudioBody(upstream);continue}
  const headers=audioHeaders(index===0?'progressive-origin':'extraction-origin',
   {'Content-Type':upstream.headers.get('Content-Type'),'Cache-Control':'no-store','Server-Timing':
    'edge;dur='+Math.max(0,Date.now()-started)+', origin;desc="'+(index===0?'progressive':'prepared')+'"'});
  for(const key of PASSTHROUGH){
   if(upstream.headers.has(key))headers.set(key,upstream.headers.get(key));
  }
  if(!upstream.headers.has('content-length'))headers.delete('content-length');
  if(!upstream.headers.has('content-range'))headers.delete('content-range');
  // Write-through only a complete, bounded progressive AAC stream.
  // The browser receives its tee immediately; R2 writes never block first audio.
  const body=index===0?promoteCompleteStream({upstream,bucket:env?.GNARLY_AUDIO_R2,
   id,waitUntil:contextWaitUntil}):upstream.body;
  return new Response(body,{status:upstream.status,headers});
 }
 return reply(503,'Audio source temporarily unavailable',{'Retry-After':'8',
  'X-Gnarly-Playback-Source':'unavailable'});
}
export const onRequestGet=ctx=>handleFastAudio(ctx);
export const onRequestHead=ctx=>handleFastAudio(ctx);
