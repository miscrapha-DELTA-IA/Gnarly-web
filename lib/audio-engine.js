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
/**
 * Algorithmic hall model using only native DelayNode + BiquadFilterNode.
 * The iOS reference uses AVAudioUnitReverb (algorithmic), not a convolution IR.
 * Four independent damped comb tails share one send gain; the graph is built
 * ONCE and remains connected. A zero wet mix disconnects the send without
 * destroying any nodes. Cost stays bounded even during Slowed + Reverb.
 */
export function createAlgorithmicHall(ctx){
 const input=ctx.createGain(),sum=ctx.createGain();
 input.gain.value=.23;sum.gain.value=.45;
 const voices=[];
 for(const [delaySeconds,feedbackLevel,cutoff] of [
  [.0311,.865,4200],[.0397,.879,3900],
  [.0533,.887,3500],[.0679,.897,3200]
 ]){
  const delay=ctx.createDelay(.25),feedback=ctx.createGain(),damping=ctx.createBiquadFilter();
  delay.delayTime.value=delaySeconds;
  feedback.gain.value=feedbackLevel;
  damping.type='lowpass';damping.frequency.value=cutoff;
  input.connect(delay);delay.connect(sum);
  delay.connect(damping);damping.connect(feedback);feedback.connect(delay);
  voices.push({delay,feedback,damping});
 }
 return {input,output:sum,voices};
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
  this.hall=null;
  // Transport gate is independent of the mastering gain: effect automation
  // must never re-open audio when the listener pressed Pause.
  this.transportPaused=Boolean(element?.paused);
  this.transportGain=null;
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
   const dry=ctx.createGain(),wet=ctx.createGain();
   const hall=createAlgorithmicHall(ctx);
   const mix=ctx.createGain();
   const limiter=ctx.createDynamicsCompressor();
   // Approximate AVAudioUnit PeakLimiter, rather than unbounded 12 dB bass
   // plus a second wet output that could hard-clip on headphone devices.
   limiter.threshold.value=-2;
   limiter.knee.value=0;
   limiter.ratio.value=16;
   limiter.attack.value=.003;
   limiter.release.value=.08;
   const master=ctx.createGain(),transport=ctx.createGain();
   transport.gain.value=this.transportPaused?0:1;
   const analyser=ctx.createAnalyser();analyser.fftSize=1024;analyser.smoothingTimeConstant=.86;
   if(src)src.connect(sourceGain);
   sourceGain.connect(input);
   input.connect(bass);
   bass.connect(eqOutput);
   eqOutput.connect(dry);dry.connect(mix);
   // Built once. Its INPUT is enabled only when the user requests reverb;
   // the stereo dry/wet mix and algorithmic delay graph never reconstruct.
   hall.output.connect(wet);wet.connect(mix);
   mix.connect(limiter);limiter.connect(master);
   master.connect(transport);transport.connect(analyser);analyser.connect(ctx.destination);
   this.ctx=ctx;this.mediaSource=src;this.sourceGain=sourceGain;this.input=input;
   this.bassNode=bass;this.eqOutput=eqOutput;
   this.dry=dry;this.wet=wet;this.hall=hall;this.masterMix=mix;
   this.limiter=limiter;this.masterGain=master;this.transportGain=transport;
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
 /** Silence all song, stem and reverb output on transport Pause without
  * suspending/closing the shared context or rebuilding nodes on Resume.
  * The MediaElement owns the authoritative transport state.
  */
 setTransportPaused(paused=true){
  this.transportPaused=!!paused;
  const gain=this.transportGain?.gain,ctx=this.ctx;
  if(!gain||!ctx)return;
  try{gain.cancelScheduledValues?.(ctx.currentTime)}catch{}
  smooth(gain,this.transportPaused?0:1,ctx,this.transportPaused?.006:.012);
 }
 setOriginalGain(level=1){
  if(this.nativeTransport){this.audio.muted=Number(level)<=0;return}
  if(this.sourceGain)smooth(this.sourceGain.gain,Math.max(0,Number(level)||0),this.ctx,.018);
 }
 setSpeed(value,preservePitch=true,{persistDefault=true}={}){
  const plan=playbackDSPPlan(value,preservePitch);
  this.speed=plan.speed;this.keepOriginalPitch=plan.preservePitch;
  // Write pitch BEFORE playbackRate, and only through ONE supported
  // property: legacy vendor aliases may reference the SAME decoder internals.
  // Never toggle all three, which can create redundant stretch resets.
  const pitchKeys=('preservesPitch' in this.audio)?['preservesPitch']:
   (('webkitPreservesPitch' in this.audio)?['webkitPreservesPitch']:
    (('mozPreservesPitch' in this.audio)?['mozPreservesPitch']:['preservesPitch']));
  for(const key of pitchKeys){
   if(key in this.audio||key==='preservesPitch'){
    try{if(this.audio[key]!==plan.preservePitch)this.audio[key]=plan.preservePitch}catch{}
   }
  }
  // Save the new default only when the requested speed actually changes.
  // Safari resets playbackRate to defaultPlaybackRate when loading the next
  // song. The old implementation rewrote both properties every slider tick;
  // the UI now sends at most ~9 updates/s and restoreSpeed is a no-op when
  // neither property changed.
  // defaultPlaybackRate is a SECOND decoder control in Chromium/WebKit.
  // Writing it while media is playing can trigger an extra ratechange and
  // pitch-stretch reset. The iOS engine changes varispeed once, not twice.
  // Next track always restores the saved this.speed in loadedmetadata.
  try{if(persistDefault&&this.audio.paused!==false&&
    this.audio.defaultPlaybackRate!==plan.speed)
    this.audio.defaultPlaybackRate=plan.speed}catch{}
  try{if(this.audio.playbackRate!==plan.speed)this.audio.playbackRate=plan.speed}catch{}
 }
 restoreSpeed(){this.setSpeed(this.speed,this.keepOriginalPitch)}
 setReverb(value){
  this.reverb=clip(value,0,.7,0);
  if(!this.ctx||!this.wet)return;
  const levels=masteringLevels({bass:this.bass,reverb:this.reverb});
  // The convolution branch has ZERO DSP cost with Reverb disabled.
  if(levels.wet>0&&!this.reverbConnected){
   this.eqOutput.connect(this.hall.input);this.reverbConnected=true;
  }
  smooth(this.wet.gain,levels.wet,this.ctx);
  smooth(this.dry.gain,levels.dry,this.ctx);
  if(levels.wet===0&&this.reverbConnected){
   this.eqOutput.disconnect(this.hall.input);this.reverbConnected=false;
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
