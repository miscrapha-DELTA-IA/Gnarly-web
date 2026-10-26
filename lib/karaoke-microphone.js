import {analyzeVoice} from './karaoke-live-score.js';
const SILENCE=Object.freeze({rms:0,hz:null,confidence:0,voiced:false});
/** An isolated media-input graph with no connection to the player/destination.
 * User opt-in only; no uploads or retained microphone buffers.
 */
export class KaraokeMicrophone {
 constructor({mediaDevices=globalThis.navigator?.mediaDevices,AudioContextClass=globalThis.AudioContext||globalThis.webkitAudioContext}={}){
  this.mediaDevices=mediaDevices;this.AudioContextClass=AudioContextClass;
  this.stream=null;this.context=null;this.source=null;this.analyser=null;this.frame=null;
  this.last=SILENCE;this.timer=null;this.recorder=null;this.chunks=[];this.recording=false;this.onChange=null;this.generation=0;
 }
 get active(){return !!this.stream?.active}
 async start(){
  if(this.active)return true;
  if(!this.mediaDevices?.getUserMedia||!this.AudioContextClass)throw Error('Microfone indisponível neste navegador HTTPS.');
  const token=++this.generation;
  const stream=await this.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:false},video:false});
  if(token!==this.generation){stream.getTracks().forEach(t=>t.stop());return false}
  try{
   const context=new this.AudioContextClass();
   const source=context.createMediaStreamSource(stream);
   const analyser=context.createAnalyser();analyser.fftSize=4096;
   // Don't route the microphone to speakers, WebAudio playback or export.
   source.connect(analyser);
   await context.resume();
   if(token!==this.generation){source.disconnect();await context.close();stream.getTracks().forEach(t=>t.stop());return false}
   this.stream=stream;this.context=context;this.source=source;this.analyser=analyser;
   this.frame=new Float32Array(analyser.fftSize);this.last=SILENCE;
   stream.getTracks().forEach(t=>t.addEventListener('ended',()=>this.stop(),{once:true}));
   this.timer=setInterval(()=>this.sample(),90);
   this.onChange?.();
   return true;
  }catch(err){stream.getTracks().forEach(t=>t.stop());throw err}
 }
 sample(){
  if(!this.analyser||!this.context||this.context.state!=='running')return;
  this.analyser.getFloatTimeDomainData(this.frame);
  this.last=analyzeVoice(this.frame,this.context.sampleRate);
  this.onChange?.();
 }
 frameNow(){return this.active?this.last:SILENCE}
 beginRecording(){
  if(!this.active||this.recorder||typeof MediaRecorder==='undefined')return false;
  const mime=['audio/mp4','audio/webm;codecs=opus','audio/webm'].find(t=>MediaRecorder.isTypeSupported(t));
  const recorder=new MediaRecorder(this.stream,mime?{mimeType:mime}:undefined);
  this.chunks=[];this.recorder=recorder;this.recording=true;
  recorder.ondataavailable=e=>{if(e.data?.size)this.chunks.push(e.data)};
  recorder.onstop=()=>{
   this.recording=false;this.recorder=null;
   const blob=new Blob(this.chunks,{type:recorder.mimeType||'audio/webm'});this.chunks=[];
   this.onRecording?.(blob);
   this.onChange?.();
  };
  recorder.start(250);this.onChange?.();return true;
 }
 stopRecording(){if(this.recorder?.state==='recording'){this.recorder.stop();return true}return false}
 stop(){
  ++this.generation;this.stopRecording();
  if(this.timer!==null){clearInterval(this.timer);this.timer=null}
  try{this.source?.disconnect()}catch{}
  this.source=null;this.analyser=null;this.frame=null;
  this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;
  const ctx=this.context;this.context=null;
  if(ctx&&ctx.state!=='closed')void ctx.close().catch(()=>{});
  this.last=SILENCE;this.onChange?.();
 }
}
