import {readShareAsset,canvasBlob} from './share-renderer.js';
import {finalizeWebM} from './webm-duration.js';
import {shareMetadata} from './share-model.js';
const abortError=()=>new DOMException('Exportação cancelada.','AbortError');
function check(signal){if(signal?.aborted)throw abortError()}
function stretch(channels,rate,speed,seconds,signal){return new Promise((resolve,reject)=>{
 const worker=new Worker(new URL('./share-stretch-worker.js',import.meta.url),{type:'module'});
 const finish=(error,value)=>{worker.terminate();signal?.removeEventListener('abort',cancel);error?reject(error):resolve(value)};
 const cancel=()=>finish(abortError());signal?.addEventListener('abort',cancel,{once:true});
 worker.onerror=()=>finish(Error('Não foi possível preservar o tom neste navegador.'));
 worker.onmessage=({data})=>data.error?finish(Error(data.error)):finish(null,data.channels.map(x=>new Float32Array(x)));
 worker.postMessage({channels:channels.map(x=>x.buffer),rate,speed,seconds},channels.map(x=>x.buffer));
})}
export async function renderClipAudio(request,source,{signal,impulse=null}={}){
 if(!source)throw Error('Áudio indisponível. Importe um arquivo autorizado ou baixe a música completa.');
 if(request.sourceDuration>420)throw Error('Exportação com áudio limitada a faixas de até 7 minutos.');
 const max=24*1024*1024;
 if(source instanceof Blob&&source.size>max)throw Error('Use um áudio de até 24 MB para exportar.');
 const bytes=source instanceof Blob?await source.arrayBuffer():await readShareAsset(source,{signal,maxBytes:max});check(signal);
 const Offline=globalThis.OfflineAudioContext||globalThis.webkitOfflineAudioContext;
 if(!Offline)throw Error('Este navegador não permite preparar o áudio para exportação.');
 const rate=32000,decoder=new Offline(2,1,rate);let decoded=await decoder.decodeAudioData(bytes);check(signal);
 if(decoded.duration>420||decoded.numberOfChannels>2)throw Error('Use um áudio mono/estéreo de até 7 minutos.');
 if(request.start+request.duration*request.speed>decoded.duration+.1)throw Error('O trecho solicitado não está disponível no arquivo completo.');
 const start=Math.floor(request.start*rate),size=Math.min(decoded.length-start,Math.ceil((request.duration*request.speed+.08)*rate));
 let channels=Array.from({length:decoded.numberOfChannels},(_,c)=>decoded.getChannelData(c).slice(start,start+size));decoded=null;
 let playbackRate=request.speed;
 if(request.pitch&&Math.abs(request.speed-1)>.001){channels=await stretch(channels,rate,request.speed,request.duration,signal);playbackRate=1}check(signal);
 const offline=new Offline(channels.length,Math.ceil(request.duration*rate),rate),buffer=offline.createBuffer(channels.length,channels[0].length,rate);
 channels.forEach((data,c)=>buffer.copyToChannel(data,c));channels=null;
 const input=offline.createBufferSource();input.buffer=buffer;input.playbackRate.value=playbackRate;
 const bass=offline.createBiquadFilter();bass.type='lowshelf';bass.frequency.value=180;bass.gain.value=request.bass;
 const dry=offline.createGain(),wet=offline.createGain(),convolver=offline.createConvolver();dry.gain.value=1-request.reverb*.35;wet.gain.value=request.reverb;
 if(impulse){
  const ir=offline.createBuffer(impulse.numberOfChannels,Math.ceil(impulse.duration*rate),rate);
  for(let c=0;c<ir.numberOfChannels;c++){const target=ir.getChannelData(c),data=impulse.getChannelData(c);for(let i=0;i<target.length;i++){const at=i*impulse.sampleRate/rate,low=Math.floor(at),blend=at-low;target[i]=(data[low]||0)*(1-blend)+(data[low+1]||0)*blend}}convolver.buffer=ir;
 }else{
  const ir=offline.createBuffer(2,Math.floor(rate*1.7),rate);let seed=72;
  for(let c=0;c<2;c++){const data=ir.getChannelData(c);for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[i]=(seed/4294967296*2-1)*Math.pow(1-i/data.length,2.9)*.33}}convolver.buffer=ir;
 }
 input.connect(bass);bass.connect(dry);bass.connect(convolver);convolver.connect(wet);dry.connect(offline.destination);wet.connect(offline.destination);input.start();
 const rendered=await offline.startRendering();check(signal);return rendered;
}
export function videoMime(includeAudio){
 const mp4=includeAudio?['video/mp4;codecs=avc1.42E028,mp4a.40.2','video/mp4;codecs=avc1.640028,mp4a.40.2']:['video/mp4;codecs=avc1.42E028','video/mp4;codecs=avc1.640028'];
 const webm=includeAudio?['video/webm;codecs=vp8,opus','video/webm;codecs=vp9,opus','video/webm']:['video/webm;codecs=vp8','video/webm;codecs=vp9','video/webm'];
 // Safari's native recorder uses H.264/AAC. Chromium/Firefox have a mature
 // WebM recorder; a generic MP4 claim can otherwise produce VP9/Opus in MP4.
 const apple=/Apple/.test(globalThis.navigator?.vendor||'');
 const options=apple?[...mp4,...webm,'video/mp4']:[...webm,...mp4,'video/mp4'];
 return options.find(mime=>globalThis.MediaRecorder?.isTypeSupported?.(mime))||null;
}
async function validateVideo(file,profile,signal){
 const url=URL.createObjectURL(file),video=document.createElement('video');video.muted=true;video.playsInline=true;video.preload='auto';let cancel;
 try{await new Promise((resolve,reject)=>{
  const finish=error=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);video.onloadeddata=video.onloadedmetadata=video.onerror=null;error?reject(error):resolve()};
  const timer=setTimeout(()=>finish(Error('Não foi possível validar o primeiro quadro do vídeo.')),8000);
  cancel=()=>finish(abortError());signal?.addEventListener('abort',cancel,{once:true});
  video.onloadeddata=()=>finish();video.onloadedmetadata=()=>{if(video.readyState>=2)finish()};video.onerror=()=>finish(Error('O vídeo gerado não é reproduzível.'));video.src=url;
 });
  if(video.videoWidth!==profile.width||video.videoHeight!==profile.height)throw Error('O vídeo não corresponde ao tamanho selecionado.');
  return Number.isFinite(video.duration)?video.duration:null;
 }finally{signal?.removeEventListener('abort',cancel);video.removeAttribute('src');video.load();URL.revokeObjectURL(url)}
}

/** Returns video + first-frame thumbnail + public JSON, as native SharePackage. */
export async function encodeShare(request,profile,renderer,{signal,onProgress=()=>{},audioContext=null,audioSource=null,impulse=null}={}){
 check(signal);renderer.draw(0);const thumbnail=await canvasBlob(renderer.canvas,'image/jpeg');check(signal);
 let media,mime='image/png',duration=0,frames=1,measuredFPS=null;
 if(request.format==='image'){media=await canvasBlob(renderer.canvas)}else{
  mime=videoMime(request.includeAudio);if(!mime||!renderer.canvas.captureStream)throw Error('Este navegador não permite exportar vídeos. A imagem PNG continua disponível.');
  if(request.includeAudio&&!audioContext)throw Error('Toque Gerar novamente para autorizar o áudio da exportação.');
  onProgress(.03,'Preparando áudio…');const clip=request.includeAudio?await renderClipAudio(request,audioSource,{signal,impulse}):null;check(signal);
  let stream=renderer.canvas.captureStream(profile.fps),captureTrack=stream.getVideoTracks()[0];
  if(typeof captureTrack.requestFrame!=='function'){stream.getTracks().forEach(t=>t.stop());stream=renderer.canvas.captureStream(profile.fps);captureTrack=stream.getVideoTracks()[0]}
  const captureFrame=()=>{const ctx=renderer.canvas.getContext('2d');ctx.putImageData(ctx.getImageData(0,0,1,1),0,0);captureTrack.requestFrame?.()};
  let source,destination,recorder,frameId=0,stopTimer,warmTimer,started=0,stoppedAt=0,actualFrames=0,removeCancel=()=>{};
  try{
   if(clip){destination=audioContext.createMediaStreamDestination();source=audioContext.createBufferSource();source.buffer=clip;source.connect(destination)}
   recorder=new MediaRecorder(stream,{mimeType:videoMime(false),videoBitsPerSecond:profile.bitrate});
   // Prime the capture/encoder with frame zero before the timed clip. No voice
   // or music is consumed, and the warm-up bytes are discarded, never shared.
   await new Promise((resolve,reject)=>{
    let timer;const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel)};
    const fail=error=>{cleanup();reject(error);if(recorder.state!=='inactive')recorder.stop()};
    const cancel=()=>fail(abortError());signal?.addEventListener('abort',cancel,{once:true});
    recorder.ondataavailable=()=>{};recorder.onerror=()=>fail(Error('O codificador de vídeo não iniciou.'));
    recorder.onstart=()=>recorder.stop();recorder.onstop=()=>{cleanup();resolve()};
    timer=setTimeout(()=>fail(Error('O navegador não iniciou a captura. Tente imagem.')),8000);
    recorder.start(50);captureFrame();
   });check(signal);
   if(destination)for(const track of destination.stream.getAudioTracks())stream.addTrack(track);
   recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:profile.bitrate,audioBitsPerSecond:128000});
   const chunks=[];let size=0;
   media=await new Promise((resolve,reject)=>{
    const fail=error=>{reject(error);if(recorder.state!=='inactive')recorder.stop()};const cancel=()=>fail(abortError());signal?.addEventListener('abort',cancel,{once:true});removeCancel=()=>signal?.removeEventListener('abort',cancel);
    recorder.onerror=()=>fail(Error('O navegador não conseguiu codificar o vídeo.'));
    recorder.ondataavailable=event=>{if(event.data?.size){size+=event.data.size;if(size>32*1024*1024){fail(Error('O vídeo excedeu o limite de 32 MB. Use uma qualidade menor.'));return}chunks.push(event.data)}};
    recorder.onstop=()=>{signal?.removeEventListener('abort',cancel);duration=Math.max(0,((stoppedAt||performance.now())-started)/1000);mime=recorder.mimeType||mime;resolve(new Blob(chunks,{type:mime}))};
    let last=-Infinity;
    function draw(now){try{if(signal?.aborted)return;const elapsed=(now-started)/1000;if(elapsed>=request.duration)return;
     if(now-last>=1000/profile.fps-1){renderer.draw(elapsed);captureFrame();actualFrames++;last=now;onProgress(.08+.84*elapsed/request.duration,'Gerando vídeo…')}
     frameId=requestAnimationFrame(draw);
    }catch(error){fail(error)}}
    recorder.onstart=()=>clearTimeout(warmTimer);
    // The thumbnail await above committed frame zero. Let it paint before the
    // first expensive shader update, so encoder startup cannot lose that frame.
    warmTimer=setTimeout(()=>fail(Error('O codificador não iniciou. Tente imagem ou outro navegador.')),8000);
    recorder.start(200);started=performance.now();source?.start();captureFrame();
    frameId=requestAnimationFrame(()=>{captureFrame();frameId=requestAnimationFrame(draw)});
    stopTimer=setTimeout(()=>{captureFrame();stopTimer=setTimeout(()=>{if(recorder.state==='recording'){stoppedAt=performance.now();recorder.stop()}},80)},request.duration*1000);

   });check(signal);if(!media.size)throw Error('O vídeo ficou vazio.');
   media=await finalizeWebM(media,duration);check(signal);const encodedDuration=await validateVideo(media,profile,signal);duration=encodedDuration||duration;if(duration<request.duration*.65||duration>request.duration+1.5)throw Error('O navegador não conseguiu manter a duração do vídeo. Tente a qualidade Leve.');frames=Math.max(1,actualFrames);measuredFPS=Number((frames/Math.max(.01,duration)).toFixed(2));
  }finally{removeCancel();cancelAnimationFrame(frameId);clearTimeout(stopTimer);clearTimeout(warmTimer);try{source?.stop()}catch{}source?.disconnect();destination?.disconnect();stream.getTracks().forEach(t=>t.stop());if(recorder?.state==='recording')recorder.stop()}
 }
 check(signal);const extension=mime.includes('mp4')?'mp4':mime.includes('webm')?'webm':'png';
 const metadata=shareMetadata(request,profile,{mime,duration,frames,measuredFPS}),stem='gnarly-'+(request.mode==='lyrics'?'letras':'player');
 onProgress(1,'Pronto para compartilhar.');return {media:new File([media],stem+'.'+extension,{type:mime}),thumbnail:new File([thumbnail],'thumbnail.jpg',{type:'image/jpeg'}),metadata:new File([JSON.stringify(metadata,null,2)],'metadata.json',{type:'application/json'}),info:metadata};
}
