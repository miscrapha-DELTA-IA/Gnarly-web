/**
 * GNARLY Workers AI Whisper fallback.
 * Accepts ONLY a user-selected audio file after explicit consent.
 * NO Youtube/backend downloads, persistent audio, provider keys or auto-billing.
 */
const MAX_BYTES=9*1024*1024;
const seen=new Map();
const response=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
function validAudio(bytes,type){
 if(!bytes||bytes.length<256)return false;
 const ascii=(start,n)=>String.fromCharCode(...bytes.subarray(start,start+n));
 if(ascii(0,4)==='RIFF'&&ascii(8,4)==='WAVE')return true;
 if(ascii(0,4)==='fLaC'||ascii(0,4)==='OggS'||ascii(0,3)==='ID3')return true;
 if(bytes[0]===0xff&&(bytes[1]&0xe0)===0xe0)return true;
 if(ascii(4,4)==='ftyp')return true;
 return false;
}
function toBase64(data){
 let parts=[];
 const STEP=24576; // divisible by 3; safe from argument/stack overflow.
 for(let i=0;i<data.length;i+=STEP){
  parts.push(btoa(String.fromCharCode(...data.subarray(i,i+STEP))));
 }
 return parts.join('');
}
function lyricSegments(result){
 let segments=Array.isArray(result?.segments)?result.segments:[];
 let lines=segments.map(s=>({time:Number(s?.start),text:String(s?.text||'').trim()}))
  .filter(x=>Number.isFinite(x.time)&&x.time>=0&&x.time<=600&&x.text&&x.text.length<=400)
  .slice(0,220).sort((a,b)=>a.time-b.time);
 if(lines.length===0&&typeof result?.vtt==='string'){
  const raw=result.vtt.slice(0,24000).split(/\r?\n/),stamp=s=>{
   const m=s.match(/(?:(\d{1,2}):)?(\d{2}):(\d{2})\.(\d{3})/);
   return m?Number(m[1]||0)*3600+Number(m[2])*60+Number(m[3])+Number(m[4])/1000:null;
  };
  for(let i=0;i<raw.length-1;i++)if(raw[i].includes('-->')){
   const start=stamp(raw[i].split('-->')[0]),text=raw[i+1]?.trim();
   if(start!==null&&text&&text.length<=400)lines.push({time:start,text});
  }
 }
 // Avoid hallucination loops / repeated boilerplate.
 const prior=[];lines=lines.filter(s=>{
  const normalized=s.text.toLowerCase().replace(/\W/g,'');
  if(!normalized||/^(thankyou|subtitlesby|subscribe|music|applause)$/.test(normalized))return false;
  if(prior.slice(-3).includes(normalized))return false;
  prior.push(normalized);return true;
 });
 const text=typeof result?.text==='string'?result.text.slice(0,15000):'';
 const plainLines=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean).slice(0,240);
 if(lines.length>=2)return {lines,plainLines,source:'whisper-ai',synced:true,
   status:'Transcrição experimental por IA · revise palavras e tempos'};
 if(plainLines.length)return {lines:[],plainLines,source:'whisper-ai',synced:false,
   status:'Transcrição por IA sem tempos confiáveis · revise o texto'};
 return {lines:[],plainLines:[],source:null,synced:false,status:'Não foi possível reconhecer voz neste áudio.'};
}
export async function transcribeLyrics(request,env={}){
 if(request.method!=='POST')return response({error:'Método inválido'},405);
 const origin=request.headers.get('origin');
 const expected=new URL(request.url).origin;
 if(origin!==expected)return response({error:'Origem não autorizada'},403);
 if(request.headers.get('x-gnarly-audio-consent')!=='yes')return response({error:'Consentimento necessário para enviar áudio à IA'},403);
 if(!env?.AI?.run)return response({error:'Transcrição por IA ainda não configurada neste ambiente'},503);
 const length=Number(request.headers.get('content-length')||0);
 if(length>MAX_BYTES)return response({error:'Áudio acima de 9 MB'},413);
 const type=(request.headers.get('content-type')||'').split(';')[0].trim();
 if(!['audio/mpeg','audio/mp3','audio/wav','audio/x-wav','audio/flac','audio/ogg','audio/mp4','audio/aac','audio/x-m4a','application/octet-stream'].includes(type)){
  return response({error:'Formato de áudio não suportado'},415);
 }
 const ip=request.headers.get('cf-connecting-ip')||'unknown';
 const rateKey=ip.slice(0,80),now=Date.now(),recent=seen.get(rateKey)||0;
 if(now-recent<90000)return response({error:'Limite temporário de transcrições. Tente novamente mais tarde.'},429);
 if(seen.size>800)seen.clear();
 // Isolation-level protection is deliberately additional, not a substitute for WAF/Turnstile.
 seen.set(rateKey,now);
 try{
  const bytes=new Uint8Array(await request.arrayBuffer());
  if(bytes.byteLength>MAX_BYTES||!validAudio(bytes,type))return response({error:'Arquivo de áudio inválido'},422);
  const result=await env.AI.run('@cf/openai/whisper-large-v3-turbo',{
   audio:toBase64(bytes),task:'transcribe',vad_filter:true,condition_on_previous_text:false
  });
  const recognized=lyricSegments(result);
  return response(recognized);
 }catch{
  return response({error:'Motor de transcrição indisponível; o áudio continua funcionando.'},502);
 }
}
