/** GNARLY playback / DSP, modeled after NightcoreLab AudioEngineManager.
 *
 * iOS AVAudioEngine: player -> varispeed -> optional timePitch -> low shelf EQ
 * -> medium hall reverb -> peak limiter -> -1.5 dB output.
 *
 * Browsers cannot attach AVAudioUnitTimePitch or AVAudioUnitPeakLimiter to an
 * HTMLMediaElement. Native preservesPitch provides the browser-equivalent
 * tape-vs-stretch behavior; one persistent Web Audio graph implements the
 * EQ/reverb/mastering stages. Never rebuild the graph on slider input.
 */
export function isIOSWebKitAudioDevice(device={}){
 const ua=String(device.userAgent||''),platform=String(device.platform||'');
 return /iPad|iPhone|iPod/i.test(ua)||(platform==='MacIntel'&&Number(device.maxTouchPoints)>1);
}
export function prefersNativeBackgroundAudio(device={},priority=true){
 return Boolean(priority)&&isIOSWebKitAudioDevice(device);
}
const clip=(value,min,max,fallback)=>{
 const number=Number(value);
 return Number.isFinite(number)?Math.max(min,Math.min(max,number)):fallback;
};
export const OUTPUT_HEADROOM_DB=-1.5;
export const BASS_FREQUENCY_HZ=120;
export const REVERB_MAX_WET=.5; // Swift AVAudioUnitReverb wetDryMix 0…50%
export function playbackDSPPlan(speed=1,preservePitch=true){
 const rate=clip(speed,.5,2,1),keep=Boolean(preservePitch);
 // Swift's playbackRates(): keep pitch -> time stretch; tape effect ->
 // varispeed only. Web Audio has no equivalent built-in high quality
 // timePitch node; the native media decoder decides stretch quality.
 return {speed:rate,preservePitch:keep,tapeRate:keep?1:rate,stretchRate:keep?rate:1};
}
export function masteringLevels({bass=0,reverb=0}={}){
 const bassDB=clip(bass,0,12,0),uiWet=clip(reverb,0,.7,0);
 const wet=uiWet/.7*REVERB_MAX_WET;
 return {bassDB,wet,dry:1-wet,eqCompensation:Math.pow(10,-bassDB/20),
  outputGain:Math.pow(10,OUTPUT_HEADROOM_DB/20)};
}
function smooth(param,value,ctx,seconds=.022){
 if(!param)return;
 if(typeof param.setTargetAtTime==='function')
  param.setTargetAtTime(value,ctx.currentTime,seconds);
 else param.value=value;
}
function hallImpulse(ctx){
 // Generated ONCE on graph creation. Not on Speed, Bass or Reverb input.
 // Shorter 1.45 s hall reduces convolution cost on mobile WebKit.
 const frames=Math.max(1,Math.floor(ctx.sampleRate*1.45));
 const impulse=ctx.createBuffer(2,frames,ctx.sampleRate);
 for(let channel=0;channel<2;channel++){
  const samples=impulse.getChannelData(channel);
  let noise=channel?0.17:-0.13;
  for(let i=0;i<frames;i++){
   // Stable decaying noise with a few diffuse reflections; no allocations.
   noise=noise*.47+((Math.random()*2)-1)*.53;
   const decay=1-i/frames;
   samples[i]=noise*decay*decay*.29;
  }
 }
 return impulse;
}
export class WebAudioEngine{
 constructor(element,{device=globalThis.navigator,backgroundPriority=true}={}){
  this.audio=element;this.ctx=null;this.analyser=null;this.energy=0;
  this.spectrum={bass:0,mid:0,treble:0,beat:0,energy:0};
  this.speed=1;this.keepOriginalPitch=true;this.reverb=0;this.bass=0;this.device=device;
  // On iOS: native HTMLMediaElement keeps headset/lock-screen background
  // audio until the user explicitly requests DSP or Stems/DJ graph operation.
  this.nativeTransport=prefersNativeBackgroundAudio(device,backgroundPriority);
  this.reverbConnected=false;
 }
 setBackgroundPriority(priority=true){
  const next=prefersNativeBackgroundAudio(this.device,priority);
  // MediaElementAudioSourceNode permanently claims the element. Do not
  // flip back to native playback without replacing the media element.
  if(this.ctx&&this.nativeTransport!==next)return false;
  this.nativeTransport=next;return true;
 }
 async resume({requireGraph=false}={}){
  if(this.nativeTransport&&!requireGraph)return; // background survives on iOS
  if(!this.ctx){
   const Ctor=globalThis.window?.AudioContext||globalThis.window?.webkitAudioContext;
   if(!Ctor)throw new Error('Web Audio indisponível neste navegador');
   const ctx=new Ctor();
   // Single persistent connection. Source attachment must not happen each
   // time Speed/Pitch/Bass/Reverb changes; that causes audible discontinuity.
   const src=this.nativeTransport?null:ctx.createMediaElementSource(this.audio);
   const sourceGain=ctx.createGain(),input=ctx.createGain();
   const bass=ctx.createBiquadFilter();bass.type='lowshelf';bass.frequency.value=BASS_FREQUENCY_HZ;
   if(bass.Q)bass.Q.value=.707;
   const eqOutput=ctx.createGain();
   const dry=ctx.createGain(),wet=ctx.createGain(),convolver=ctx.createConvolver();
   convolver.normalize=true;
   convolver.buffer=hallImpulse(ctx);
   const mix=ctx.createGain();
   const limiter=ctx.createDynamicsCompressor();
   // Approximate AVAudioUnit PeakLimiter, rather than unbounded 12 dB bass
   // plus a second wet output that could hard-clip on headphone devices.
   limiter.threshold.value=-5;
   limiter.knee.value=0;
   limiter.ratio.value=16;
   limiter.attack.value=.003;
   limiter.release.value=.08;
   const master=ctx.createGain();
   const analyser=ctx.createAnalyser();analyser.fftSize=1024;analyser.smoothingTimeConstant=.86;
   if(src)src.connect(sourceGain);
   sourceGain.connect(input);
   input.connect(bass);
   bass.connect(eqOutput);
   eqOutput.connect(dry);dry.connect(mix);
   // Reverb's expensive convolution input is connected ONLY while wet > 0.
   convolver.connect(wet);wet.connect(mix);
   mix.connect(limiter);limiter.connect(master);
   master.connect(analyser);analyser.connect(ctx.destination);
   this.ctx=ctx;this.mediaSource=src;this.sourceGain=sourceGain;this.input=input;
   this.bassNode=bass;this.eqOutput=eqOutput;
   this.dry=dry;this.wet=wet;this.convolver=convolver;this.masterMix=mix;
   this.limiter=limiter;this.masterGain=master;
   this.analyser=analyser;this.samples=new Uint8Array(analyser.frequencyBinCount);
   this.setBass(this.bass);this.setReverb(this.reverb);
  }
  if(this.ctx.state==='suspended')await this.ctx.resume();
 }
 /** Opt-in iOS Studio. There is only ONE MediaElementAudioSourceNode.
  * Never detach the current HTMLAudioElement and create a new one just
  * because two effects are combined. Caller serializes this operation.
  */
 async enableStudioEffects(){
  if(!this.nativeTransport){await this.resume();return true}
  const Ctor=globalThis.window?.AudioContext||globalThis.window?.webkitAudioContext;
  if(!this.ctx&&!Ctor)return false;
  if(!this.ctx){
   this.nativeTransport=false;
   try{await this.resume();return true}
   catch(error){if(!this.mediaSource)this.nativeTransport=true;throw error}
  }
  // Stems/DJ may have initialized a graph without claiming native audio.
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
  if(this.nativeTransport){this.audio.muted=Number(level)<=0;return}
  if(this.sourceGain)smooth(this.sourceGain.gain,Math.max(0,Number(level)||0),this.ctx,.018);
 }
 setSpeed(value,preservePitch=true){
  const plan=playbackDSPPlan(value,preservePitch);
  this.speed=plan.speed;this.keepOriginalPitch=plan.preservePitch;
  // Write pitch BEFORE playbackRate; each change can force WebKit to
  // recreate its time-stretch internal state. Rewriting all aliases and
  // defaultPlaybackRate on EVERY slider tick caused repeated rate changes
  // and stuttering in Slowed + Reverb sessions.
  for(const key of ['preservesPitch','webkitPreservesPitch','mozPreservesPitch']){
   if(key==='preservesPitch'||key in this.audio){
    try{if(this.audio[key]!==plan.preservePitch)this.audio[key]=plan.preservePitch}catch{}
   }
  }
  // Keeping defaultPlaybackRate at 1 avoids a second ratechange for every
  // speed input. loadedmetadata/ratechange call restoreSpeed when required.
  try{if(this.audio.playbackRate!==plan.speed)this.audio.playbackRate=plan.speed}catch{}
 }
 restoreSpeed(){this.setSpeed(this.speed,this.keepOriginalPitch)}
 setReverb(value){
  this.reverb=clip(value,0,.7,0);
  if(!this.ctx||!this.wet)return;
  const levels=masteringLevels({bass:this.bass,reverb:this.reverb});
  // The convolution branch has ZERO DSP cost with Reverb disabled.
  if(levels.wet>0&&!this.reverbConnected){
   this.eqOutput.connect(this.convolver);this.reverbConnected=true;
  }
  smooth(this.wet.gain,levels.wet,this.ctx);
  smooth(this.dry.gain,levels.dry,this.ctx);
  if(levels.wet===0&&this.reverbConnected){
   this.eqOutput.disconnect(this.convolver);this.reverbConnected=false;
  }
 }
 setBass(value){
  this.bass=clip(value,0,12,0);
  if(!this.ctx||!this.bassNode)return;
  const levels=masteringLevels({bass:this.bass,reverb:this.reverb});
  smooth(this.bassNode.gain,levels.bassDB,this.ctx);
  smooth(this.eqOutput.gain,levels.eqCompensation,this.ctx,.03);
  smooth(this.masterGain.gain,levels.outputGain,this.ctx,.03);
 }
 sampleSpectrum(){
  const s=this.spectrum;
  if(!this.analyser||this.ctx?.state==='suspended'){
   s.bass=s.mid=s.treble=s.beat=s.energy=0;return s;
  }
  this.analyser.getByteFrequencyData(this.samples);
  const band=(start,end,div)=>{
   let sum=0;for(let i=start;i<Math.min(end,this.samples.length);i++)sum+=this.samples[i];
   return Math.min(1,sum/Math.max(1,end-start)/div)
  };
  const bass=band(1,6,138),mid=band(6,32,126),treble=band(32,112,118);
  const old=s.bass;
  s.bass=.72*s.bass+.28*bass;s.mid=.79*s.mid+.21*mid;s.treble=.82*s.treble+.18*treble;
  s.energy=Math.min(1,.5*s.bass+.34*s.mid+.16*s.treble);
  s.beat=Math.max(0,Math.min(1,Math.max(bass-old*1.25,0)*2.4));
  this.energy=s.energy;return s;
 }
}
