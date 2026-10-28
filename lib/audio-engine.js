/** One HTMLAudioElement → one Web Audio graph. Browser-equivalent foundations
 * for rate, pitch preservation, bass, reverb and audio spectrum; not AVAudioEngine parity.
 */
/**
 * iOS Safari commonly suspends AudioContext when locked, even though the
 * HTMLMediaElement's Media Session keeps showing controls. For uninterrupted
 * background music, keep the authoritative <audio> on its native renderer.
 * Desktop and explicit Studio preference retain all DSP; native mode keeps
 * rate/pitch, queue and headset controls, but cannot process the original
 * stream through the EQ/reverb nodes.
 */
export function isIOSWebKitAudioDevice(device={}){
 const ua=String(device.userAgent||''),platform=String(device.platform||'');
 return /iPad|iPhone|iPod/i.test(ua)||(platform==='MacIntel'&&Number(device.maxTouchPoints)>1);
}
export function prefersNativeBackgroundAudio(device={},priority=true){
 return Boolean(priority)&&isIOSWebKitAudioDevice(device);
}
export class WebAudioEngine{
 constructor(element,{device=globalThis.navigator,backgroundPriority=true}={}){
  this.audio=element;this.ctx=null;this.analyser=null;this.energy=0;
  this.spectrum={bass:0,mid:0,treble:0,beat:0,energy:0};
  this.speed=1;this.keepOriginalPitch=true;this.reverb=0;this.bass=0;this.device=device;
  this.nativeTransport=prefersNativeBackgroundAudio(device,backgroundPriority);
 }
 setBackgroundPriority(priority=true){
  const next=prefersNativeBackgroundAudio(this.device,priority);
  // A MediaElementAudioSourceNode permanently claims the element's audio
  // output. Never silently switch routing for the same element mid-session.
  if(this.ctx&&this.nativeTransport!==next)return false;
  this.nativeTransport=next;return true;
 }
 async resume({requireGraph=false}={}){
  if(this.nativeTransport&&!requireGraph)return; // direct <audio> survives iOS background
  if(!this.ctx){
   const ctx=new (window.AudioContext||window.webkitAudioContext)();
   const src=this.nativeTransport?null:ctx.createMediaElementSource(this.audio);this.mediaSource=src;const bass=ctx.createBiquadFilter();bass.type='lowshelf';bass.frequency.value=180;const dry=ctx.createGain();const wet=ctx.createGain();const convolver=ctx.createConvolver();const analyser=ctx.createAnalyser();analyser.fftSize=1024;analyser.smoothingTimeConstant=.86;const total=ctx.createGain();const sourceGain=ctx.createGain();const input=ctx.createGain();if(src)src.connect(sourceGain);sourceGain.connect(input);input.connect(bass);bass.connect(dry);bass.connect(convolver);convolver.connect(wet);dry.connect(total);wet.connect(total);total.connect(analyser);analyser.connect(ctx.destination);const len=Math.floor(ctx.sampleRate*1.7);const ir=ctx.createBuffer(2,len,ctx.sampleRate);for(let channel=0;channel<2;channel++){let p=ir.getChannelData(channel);for(let i=0;i<len;i++)p[i]=(Math.random()*2-1)*Math.pow(1-i/len,2.9)*.33}convolver.buffer=ir;this.ctx=ctx;this.convolver=convolver;this.input=input;this.sourceGain=sourceGain;this.dry=dry;this.wet=wet;this.bassNode=bass;this.analyser=analyser;this.samples=new Uint8Array(analyser.frequencyBinCount);this.setReverb(this.reverb);this.setBass(this.bass)}if(this.ctx.state==='suspended')await this.ctx.resume()}
 /** Explicit opt-in on WebKit: a native <audio> stream cannot have live EQ.
  * Attach the current source exactly once to the existing WebAudio graph.
  * This may reduce background reliability on iOS; switching back to native
  * requires a fresh media element (and therefore a new app session).
  */
 async enableStudioEffects(){
  if(!this.nativeTransport){await this.resume();return true}
  const AudioCtor=globalThis.window?.AudioContext||globalThis.window?.webkitAudioContext;
  if(!this.ctx&&!AudioCtor)return false;
  if(!this.ctx){
   this.nativeTransport=false;
   try{await this.resume();return true}
   catch(error){if(!this.mediaSource)this.nativeTransport=true;throw error}
  }
  // Stems/DJ can have created a graph without claiming the native player.
  if(!this.mediaSource){
   this.mediaSource=this.ctx.createMediaElementSource(this.audio);
   this.mediaSource.connect(this.sourceGain);
  }
  this.nativeTransport=false;
  if(this.ctx.state==='suspended')await this.ctx.resume();
  this.setBass(this.bass);this.setReverb(this.reverb);
  return true;
 }
  setOriginalGain(level=1){
  if(this.nativeTransport){this.audio.muted=Number(level)<=0;return;}
  if(this.sourceGain)this.sourceGain.gain.setTargetAtTime(level,this.ctx.currentTime,.018);
 }
 setSpeed(value,preservePitch=true){
  this.speed=Math.max(.5,Math.min(2,Number(value)||1));
  this.keepOriginalPitch=Boolean(preservePitch);
  // HTMLMediaElement.load() is allowed to reset playbackRate to defaultPlaybackRate.
  // Carry the session's chosen speed across every song and resource selection.
  try{
   if(Number(this.audio.defaultPlaybackRate)!==this.speed)this.audio.defaultPlaybackRate=this.speed;
  }catch{/* Some embedded WebKit engines expose a read-only implementation. */}
  if(Number(this.audio.playbackRate)!==this.speed)this.audio.playbackRate=this.speed;
  this.audio.preservesPitch=this.keepOriginalPitch;
  this.audio.mozPreservesPitch=this.keepOriginalPitch;
  this.audio.webkitPreservesPitch=this.keepOriginalPitch;
 }
 restoreSpeed(){this.setSpeed(this.speed,this.keepOriginalPitch);}

 setReverb(value){this.reverb=Math.max(0,Math.min(.7,Number(value)||0));if(this.wet){this.wet.gain.value=this.reverb;this.dry.gain.value=1-this.reverb*.35}}
 setBass(value){this.bass=Math.max(0,Math.min(12,Number(value)||0));if(this.bassNode)this.bassNode.gain.value=this.bass}
 sampleSpectrum(){
  const s=this.spectrum;
  if(!this.analyser){s.bass=s.mid=s.treble=s.beat=s.energy=0;return s}
  this.analyser.getByteFrequencyData(this.samples);
  const band=(start,end,div)=>{let sum=0;for(let i=start;i<Math.min(end,this.samples.length);i++)sum+=this.samples[i];return Math.min(1,sum/Math.max(1,end-start)/div)};
  const bass=band(1,6,138),mid=band(6,32,126),treble=band(32,112,118);
  const old=s.bass;
  s.bass=.72*s.bass+.28*bass;s.mid=.79*s.mid+.21*mid;s.treble=.82*s.treble+.18*treble;
  s.energy=Math.min(1,.5*s.bass+.34*s.mid+.16*s.treble);
  s.beat=Math.max(0,Math.min(1,Math.max(bass-old*1.25,0)*2.4));
  this.energy=s.energy;return s;
 }
 sampleEnergy(){return this.sampleSpectrum().energy;}
}
