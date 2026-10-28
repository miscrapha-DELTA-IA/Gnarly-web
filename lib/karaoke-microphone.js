import {analyzeVoice} from './karaoke-live-score.js';
import {configureBrowserAudioSession} from './media-session-controller.js';
const SILENCE=Object.freeze({rms:0,hz:null,confidence:0,voiced:false});
export function microphoneError(error){
 return ({NotAllowedError:'Autorize o microfone nas permissões deste site e tente novamente.',SecurityError:'O microfone requer HTTPS e permissão neste navegador.',NotFoundError:'Nenhum microfone foi encontrado. Conecte um microfone e tente novamente.',NotReadableError:'O microfone está ocupado por outro aplicativo.',OverconstrainedError:'O microfone não aceita esta configuração.'})[error?.name]||error?.message||'Não foi possível ativar o microfone.';
}
/** One input session, no speaker monitoring, no uploads. Worker mailbox is bounded. */
export class KaraokeMicrophone {
 constructor({mediaDevices=globalThis.navigator?.mediaDevices,AudioContextClass=globalThis.AudioContext||globalThis.webkitAudioContext,navigatorObject=globalThis.navigator,WorkerClass=globalThis.Worker}={}){
  Object.assign(this,{mediaDevices,AudioContextClass,navigatorObject,WorkerClass});
  this.stream=null;this.context=null;this.source=null;this.analyser=null;this.silentSink=null;this.frame=null;
  this.last=SILENCE;this.sampleAt=-Infinity;this.timer=null;this.recorder=null;this.recording=false;this.onChange=null;this.generation=0;this.pending=null;this.status='idle';this.error='';this.worker=null;this.inFlight=false;
 }
 get active(){return !!this.stream?.active}
 start(){
  if(this.active)return Promise.resolve(true);if(this.pending)return this.pending;
  const task=this.activate();this.pending=task;task.finally(()=>{if(this.pending===task)this.pending=null}).catch(()=>{});return task;
 }
 async activate(){
  if(!this.mediaDevices?.getUserMedia||!this.AudioContextClass)throw Error('Microfone indisponível. Abra o GNARLY em HTTPS no navegador.');
  const token=++this.generation;this.status='requesting';this.error='';this.onChange?.();
  // Create/resume synchronously in the user gesture, before the permission await.
  let context,stream,source,sink;
  try{
   context=new this.AudioContextClass();this.context=context;
   configureBrowserAudioSession({navigatorObject:this.navigatorObject,recording:true});
   const resumed=Promise.resolve(context.resume());resumed.catch(()=>{});
   stream=await this.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:false},video:false});
   if(token!==this.generation){stream.getTracks().forEach(t=>t.stop());return false}
   this.stream=stream;source=context.createMediaStreamSource(stream);const analyser=context.createAnalyser();analyser.fftSize=4096;
   sink=context.createGain();sink.gain.value=0;source.connect(analyser);analyser.connect(sink);sink.connect(context.destination);
   let timeout;try{await Promise.race([resumed,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('Toque novamente para liberar o áudio do microfone.')),5000)})])}finally{clearTimeout(timeout)}
   if(token!==this.generation)return false;
   this.source=source;this.analyser=analyser;this.silentSink=sink;this.frame=new Float32Array(analyser.fftSize);this.last=SILENCE;
   if(this.WorkerClass)try{
    this.worker=new this.WorkerClass(new URL('./karaoke-voice-worker.js',import.meta.url),{type:'module'});
    this.worker.onmessage=({data})=>{if(token!==this.generation)return;this.inFlight=false;this.frame=new Float32Array(data.buffer);this.last=data.voice;this.sampleAt=data.at;this.onChange?.()};
    this.worker.onerror=()=>{this.worker?.terminate();this.worker=null;this.inFlight=false;this.frame=new Float32Array(analyser.fftSize)};
   }catch{this.worker=null}
   stream.getTracks().forEach(t=>t.addEventListener('ended',()=>{if(token===this.generation)this.stop()},{once:true}));
   this.timer=setInterval(()=>this.sample(),50);this.status='listening';this.onChange?.();return true;
  }catch(error){
   stream?.getTracks().forEach(t=>t.stop());try{source?.disconnect();sink?.disconnect()}catch{}
   if(context&&context.state!=='closed')await context.close().catch(()=>{});
   if(token===this.generation){this.stream=null;this.context=null;this.status='error';this.error=microphoneError(error);configureBrowserAudioSession({navigatorObject:this.navigatorObject});this.onChange?.()}
   throw error;
  }finally{if(token!==this.generation){stream?.getTracks().forEach(t=>t.stop());try{source?.disconnect();sink?.disconnect()}catch{}if(context&&context.state!=='closed')void context.close().catch(()=>{})}}
 }
 sample(){
  if(!this.analyser||this.context?.state!=='running'||this.inFlight)return;
  this.analyser.getFloatTimeDomainData(this.frame);const at=performance.now();
  if(this.worker){this.inFlight=true;this.worker.postMessage({buffer:this.frame.buffer,sampleRate:this.context.sampleRate,at},[this.frame.buffer])}
  else{this.last=analyzeVoice(this.frame,this.context.sampleRate);this.sampleAt=at;this.onChange?.()}
 }
 frameNow(){return this.active&&performance.now()-this.sampleAt<=300?this.last:SILENCE}
 beginRecording(){
  if(!this.active||this.recorder||typeof MediaRecorder==='undefined')return false;
  const mime=['audio/mp4;codecs=mp4a.40.2','audio/webm;codecs=opus','audio/webm','audio/mp4'].find(t=>MediaRecorder.isTypeSupported(t));
  let recorder;try{recorder=new MediaRecorder(this.stream,mime?{mimeType:mime}:undefined)}catch(error){this.error=microphoneError(error);this.onChange?.();return false}const chunks=[];let bytes=0,failed=false;
  this.recorder=recorder;this.recording=true;
  const deadline=setTimeout(()=>this.stopRecording(),120000);
  recorder.ondataavailable=e=>{if(e.data?.size){bytes+=e.data.size;chunks.push(e.data);if(bytes>32*1024*1024&&recorder.state==='recording')recorder.stop()}};
  recorder.onerror=()=>{failed=true;clearTimeout(deadline);this.error='Não foi possível gravar a voz neste navegador.';this.onChange?.()};
  recorder.onstop=()=>{clearTimeout(deadline);if(this.recorder===recorder){this.recording=false;this.recorder=null}if(!failed)this.onRecording?.(new Blob(chunks,{type:recorder.mimeType||'audio/webm'}));this.onChange?.()};
  try{recorder.start(250)}catch(error){clearTimeout(deadline);this.recorder=null;this.recording=false;this.error=microphoneError(error);this.onChange?.();return false}this.onChange?.();return true;
 }
 stopRecording(){if(this.recorder?.state==='recording'){this.recorder.stop();return true}return false}
 stop(){
  ++this.generation;this.pending=null;this.stopRecording();
  clearInterval(this.timer);this.timer=null;this.worker?.terminate();this.worker=null;this.inFlight=false;
  try{this.source?.disconnect();this.analyser?.disconnect();this.silentSink?.disconnect()}catch{}
  this.source=null;this.analyser=null;this.silentSink=null;this.frame=null;
  this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;
  const ctx=this.context;this.context=null;if(ctx&&ctx.state!=='closed')void ctx.close().catch(()=>{});
  this.last=SILENCE;this.status='idle';configureBrowserAudioSession({navigatorObject:this.navigatorObject});this.onChange?.();
 }
}
