/** A single next-song preparation request through Pages to Render.
 * No client-provided URL, no cookie/credential propagation and no bulk API.
 * The Render worker retains the extraction task after this request ends.
 */
import {fetchAudioHeaders,discardAudioBody,retryAfter} from '../_lib/origin-audio.js';
const ID=/^[A-Za-z0-9_-]{11}$/;
const HOST='https://nightcorelab.onrender.com';
export async function onRequestPost({params,request,env,originTimeoutMs=10000},fetcher=fetch){
 const id=params?.id;
 if(!ID.test(id||''))return new Response('Invalid track ID',{status:400});
 const contentLength=Number(request.headers.get('content-length')||0);
 if(contentLength>512)return new Response('Body too large',{status:413});
 if(request.signal?.aborted)return new Response(null,{status:499});
 // R2 readiness is authoritative and avoids waking Render for cached songs.
 try{
  const cached=await env?.GNARLY_AUDIO_R2?.head(id+'/audio.m4a');
  if(Number.isSafeInteger(cached?.size)&&cached.size>0)
   return Response.json({status:'cached'},{headers:{'Cache-Control':'no-store'}});
 }catch{}
 // Deliberately ignore untrusted body: only the validated URL path ID is sent upstream.
 const origin=new URL('/prepare',HOST);
 try{
  const response=await fetchAudioHeaders(fetcher,origin.href,{
   method:'POST',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({url:'https://www.youtube.com/watch?v='+id}),
   redirect:'manual'
  },{signal:request.signal,timeoutMs:originTimeoutMs});
  if(response.status===200||response.status===202){
   // Backend status is deliberately small and contains no credentials.
   return new Response(response.body,{status:response.status,headers:{
    'Content-Type':'application/json','Cache-Control':'no-store'
   }});
  }
  const originReason=response.headers?.get('X-Download-Error');
  const providerLimited=response.status===429&&originReason==='upstream_rate_limited';
  discardAudioBody(response);
  // Worker-local queue pressure should not trigger the global YouTube
  // cooldown. Only a confirmed upstream 429 is classified that way.
  return new Response('Preparation unavailable',{status:providerLimited?429:503,
   headers:{'Cache-Control':'no-store','Retry-After':retryAfter(response,'20'),
    ...(providerLimited?{'X-Download-Error':'upstream_rate_limited'}:{})}});
 }catch(error){
  return new Response('Origin unavailable',{status:request.signal?.aborted?499:error?.name==='TimeoutError'?504:503,
   headers:{'Cache-Control':'no-store','Retry-After':'20'}});
 }
}
