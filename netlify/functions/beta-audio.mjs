/** Private beta gateway for permitted test audio from the existing Stage72 backend.
 * This Netlify function does not run yt-dlp, accept arbitrary URLs, or expose any credentials.
 * Its 20MB streaming response limit and max execution time still apply.
 */
import {betaEnabled,verifySession,trustedBackend,responseHeaders} from '../lib/beta-auth.mjs';
export const MAX_AUDIO_BYTES=19*1024*1024;
export const validVideoId=id=>/^[a-zA-Z0-9_-]{11}$/.test(id||'');
const json=(error,status)=>Response.json({error},{status,headers:responseHeaders});
export default async function handler(request){
  if(request.method!=='GET')return json('Método não permitido',405);
  if(!betaEnabled())return json('Áudio beta desativado',404);
  if(!verifySession(request,process.env.GNARLY_BETA_SESSION_SECRET))return json('Convite não autorizado',401);
  const id=new URL(request.url).searchParams.get('id');
  if(!validVideoId(id))return json('Identificador de faixa inválido',400);
  const backend=trustedBackend();if(!backend)return json('Backend não configurado',503);
  const endpoint=new URL('/download',backend);endpoint.searchParams.set('url',`https://www.youtube.com/watch?v=${id}`);
  const headers={'accept':'audio/mp4'};
  const range=request.headers.get('range');
  if(range){if(!/^bytes=\d{0,12}-\d{0,12}$/.test(range))return json('Range inválido',416);headers.range=range}
  try{
    const upstream=await fetch(endpoint,{method:'GET',headers,signal:AbortSignal.timeout(54000),redirect:'error'});
    if(![200,206].includes(upstream.status))return json(upstream.status===429?'Backend ocupado':'Áudio indisponível, tente novamente',upstream.status===429?429:502);
    const type=(upstream.headers.get('content-type')||'').split(';')[0].trim();
    if(!['audio/mp4','audio/x-m4a','audio/m4a','application/octet-stream'].includes(type))return json('Formato de áudio inesperado',502);
    const length=Number(upstream.headers.get('content-length')||0);
    if(length>MAX_AUDIO_BYTES){await upstream.body?.cancel();return json('Faixa acima do limite de transmissão do Netlify (19 MB)',413)}
    const downstream=new Headers({...responseHeaders,'content-type':'audio/mp4','accept-ranges':'bytes'});
    for(const h of ['content-length','content-range','etag','last-modified']){const v=upstream.headers.get(h);if(v)downstream.set(h,v)}
    if(!upstream.body)return json('Sem áudio no servidor',502);
    let seen=0;
    const meter=new TransformStream({transform(chunk,controller){seen+=chunk.byteLength;if(seen>MAX_AUDIO_BYTES){controller.error(Error('audio-size-limit'));return}controller.enqueue(chunk)}});
    return new Response(upstream.body.pipeThrough(meter),{status:upstream.status,headers:downstream});
  }catch{return json('Backend temporariamente indisponível ou tempo limite excedido',504)}
}
export const config={path:'/api/beta-audio',method:['GET']};
