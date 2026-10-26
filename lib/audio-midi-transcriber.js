/**
 * GNARLY audio-to-MIDI: offline, opt-in Basic Pitch, executed in a Worker.
 * Only user's chosen local file; never requests a streaming track.
 * Model (~0.9MB) and TFJS are fetched lazily from the GNARLY deployment.
 */
export const PITCH_FILE_LIMIT=10*1024*1024;
export const PITCH_MAX_SECONDS=25;
export async function decodePitchFile(file){
 if(!file||file.size>PITCH_FILE_LIMIT||file.size<256)throw Error('Use um áudio local de até 10 MB.');
 const Offline=globalThis.OfflineAudioContext||globalThis.webkitOfflineAudioContext;
 if(!Offline)throw Error('Decodificação de áudio não suportada neste navegador.');
 const decoder=new Offline(1,1,22050);
 const decoded=await decoder.decodeAudioData(await file.arrayBuffer());
 if(decoded.duration<.25)throw Error('Áudio curto demais.');
 // Strictly bound memory/CPU: keep only the first 25 seconds, resampled
 // with OfflineAudioContext, not a full-track ML inference.
 const len=Math.min(Math.floor(PITCH_MAX_SECONDS*22050),Math.ceil(decoded.duration*22050));
 const render=new Offline(1,len,22050);
 const src=render.createBufferSource();src.buffer=decoded;src.connect(render.destination);src.start(0);
 const mono=await render.startRendering();
 return {pcm:mono.getChannelData(0).slice(),sampleRate:22050,duration:mono.duration};
}
export async function transcribeMidiFile(file,{signal,onProgress}={}){
 if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
 const decoded=await decodePitchFile(file);
 if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
 if(typeof Worker==='undefined')throw Error('Seu navegador não oferece análise em segundo plano.');
 return new Promise((resolve,reject)=>{
  let finished=false,worker;
  const cleanup=()=>{if(finished)return;finished=true;signal?.removeEventListener('abort',cancel);worker?.terminate()};
  const cancel=()=>{cleanup();reject(new DOMException('Cancelled','AbortError'))};
  try{
   worker=new Worker(new URL('../basic-pitch-worker.js',import.meta.url),{type:'module'});
   worker.onerror=()=>{cleanup();reject(new Error('Não foi possível carregar o modelo Basic Pitch.'))};
   const id=1;
   worker.onmessage=e=>{
    if(e.data?.id!==id||finished)return;
    if(Number.isFinite(e.data.progress))onProgress?.(e.data.progress);
    if(e.data.error){cleanup();reject(new Error(e.data.error))}
    if(Array.isArray(e.data.notes)){const result=e.data;cleanup();resolve(result)}
   };
   signal?.addEventListener('abort',cancel,{once:true});
   worker.postMessage({id,pcm:decoded.pcm,sampleRate:decoded.sampleRate,duration:decoded.duration},[decoded.pcm.buffer]);
  }catch(e){cleanup();reject(e)}
 });
}
