/**
 * GNARLY voice-only Whisper review. Raw mic audio is sent solely after a
 * dedicated consent action; live pitch/presence analysis stays on-device.
 */
const TARGET_RATE=16000;
const MAX_SECONDS=48;
export function vocalWords(value){
 return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().match(/[\p{L}\p{N}]+/gu)||[];
}
export function compareSungWords({lines=[],from=0,to=0,transcript=''}={}){
 if(!Array.isArray(lines)||!Number.isFinite(from)||!Number.isFinite(to)||to<=from)return null;
 const timed=lines.map(line=>({time:Number(line?.time),text:String(line?.text||'').trim()}))
  .filter(line=>Number.isFinite(line.time)&&line.time>=0&&line.text)
  .sort((a,b)=>a.time-b.time);
 if(!timed.length)return null;
 const expected=[];
 for(let i=0;i<timed.length;i++){
  const begin=timed[i].time,end=timed[i+1]?.time??Math.max(begin+5,to);
  if(end<=from||begin>=to)continue;
  // A line merely grazed at its beginning/end isn't reliable evidence.
  const overlap=Math.min(end,to)-Math.max(begin,from);
  if(overlap<Math.min(0.5,(end-begin)*0.25))continue;
  expected.push(...vocalWords(timed[i].text));
  if(expected.length>240)break;
 }
 if(expected.length<4)return null;
 const heard=vocalWords(transcript).slice(0,240);
 // Each word may match at most once; repeated lyric fragments cannot inflate
 // correctness. Order matters, unlike a mere bag-of-words comparison.
 let prior=new Uint16Array(heard.length+1);
 for(const word of expected){
  const next=new Uint16Array(heard.length+1);
  for(let j=1;j<=heard.length;j++)
   next[j]=word===heard[j-1]?prior[j-1]+1:Math.max(prior[j],next[j-1]);
  prior=next;
 }
 const matched=prior[heard.length];
 return {similarity:Math.round(200*matched/(expected.length+heard.length)),
  matched,expectedWords:expected.length,heardWords:heard.length,
  measure:'similaridade textual aproximada; não mede afinação'};
}
export async function encodeVoiceWav(blob,{AudioContextClass=globalThis.AudioContext||globalThis.webkitAudioContext}={}){
 if(!blob||blob.size<128||!AudioContextClass)throw Error('Não foi possível decodificar a gravação de voz neste navegador.');
 const context=new AudioContextClass();
 let decoded;
 try{decoded=await context.decodeAudioData(await blob.arrayBuffer())}
 catch{throw Error('Formato da gravação incompatível com o navegador.')}
 finally{if(context.state!=='closed')await context.close().catch(()=>{})}
 if(!decoded||decoded.duration<0.8||decoded.duration>MAX_SECONDS)
  throw Error('Grave entre 1 e 45 segundos para avaliar seu canto.');
 const frames=Math.floor(decoded.duration*TARGET_RATE);
 const out=new ArrayBuffer(44+frames*2),view=new DataView(out);
 const write=(offset,value)=>{for(let i=0;i<value.length;i++)view.setUint8(offset+i,value.charCodeAt(i))};
 write(0,'RIFF');view.setUint32(4,36+frames*2,true);write(8,'WAVEfmt ');
 view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
 view.setUint32(24,TARGET_RATE,true);view.setUint32(28,TARGET_RATE*2,true);
 view.setUint16(32,2,true);view.setUint16(34,16,true);write(36,'data');
 view.setUint32(40,frames*2,true);
 const channels=Array.from({length:Math.min(2,decoded.numberOfChannels)},(_,i)=>decoded.getChannelData(i));
 if(!channels.length)throw Error('Gravação de voz sem canais válidos.');
 const step=decoded.sampleRate/TARGET_RATE;
 for(let i=0;i<frames;i++){
  const at=i*step,left=Math.min(decoded.length-1,Math.floor(at)),right=Math.min(decoded.length-1,left+1),fraction=at-left;
  let value=0;
  for(const pcm of channels)value+=pcm[left]*(1-fraction)+pcm[right]*fraction;
  value=Math.max(-1,Math.min(1,value/channels.length));
  view.setInt16(44+i*2,value<0?Math.round(value*32768):Math.round(value*32767),true);
 }
 return new Blob([out],{type:'audio/wav'});
}
export async function transcribeSinging(blob,{signal,fetchImpl=globalThis.fetch,AudioContextClass}={}){
 const wav=await encodeVoiceWav(blob,{AudioContextClass});
 if(signal?.aborted)throw signal.reason||new Error('Análise cancelada.');
 if(wav.size>9*1024*1024)throw Error('Gravação ultrapassou o limite de transcrição.');
 const response=await fetchImpl('/api/lyrics-ai',{
  method:'POST',
  headers:{'content-type':'audio/wav','x-gnarly-audio-consent':'yes'},
  body:wav,signal
 });
 let data={};try{data=await response.json()}catch{}
 if(!response.ok)throw Error(String(data.error||'Whisper indisponível no momento.'));
 const text=Array.isArray(data.plainLines)&&data.plainLines.length?
  data.plainLines.join(' '):Array.isArray(data.lines)?data.lines.map(x=>x.text).join(' '):'';
 return {transcript:String(text||'').trim().slice(0,4000),source:'Whisper (Cloudflare Workers AI)'};
}
