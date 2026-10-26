/**
 * GNARLY Performance: sixteen pads mapped to actual clips from the selected
 * song when available. A short synthetic demonstration bank remains available
 * when the browser cannot decode a protected, remote or oversized track.
 * Web MIDI is OPTIONAL hardware control, not a requirement for song pads.
 */
import {createSongPadClips,loadSongBytes,SONG_DECODE_MAX_BYTES,SONG_DECODE_MAX_SECONDS,displaySongTime} from './song-pad-slices.js';
export const PAD_NAMES=Object.freeze([
 'Kick','Snare','Clap','Closed Hat',
 'Open Hat','Low Tom','High Tom','Rim',
 'Perc','Cowbell','Crash','Shaker',
 'Sub','Click','Zap','FX'
]);
export const PAD_KEYS=Object.freeze(['1','2','3','4','q','w','e','r','a','s','d','f','z','x','c','v']);
export const MIDI_BASE_NOTE=36;
export const padFromNote=note=>Number.isInteger(note)&&note>=MIDI_BASE_NOTE&&note<MIDI_BASE_NOTE+16?note-MIDI_BASE_NOTE:-1;
export const clampBpm=value=>Math.max(70,Math.min(160,Math.round(Number(value)||110)));
export const quantizeStep=(elapsed,bpm)=>Math.round(Math.max(0,elapsed)*clampBpm(bpm)*4/60)%16;
const clampVelocity=value=>Math.max(1,Math.min(127,Math.round(Number(value)||100)));

export class PerformancePads{
 constructor(audioEngine){
  this.engine=audioEngine;this.bpm=110;this.pattern=Array.from({length:16},()=>new Set());
  this.running=false;this.recording=false;this.step=0;this.pulse=0;this.startTime=0;
  this.timer=null;this.nextStepTime=0;this.nextStep=0;this.pendingUI=new Set();
  this.midi=null;this.outputId='off';this.noiseBuffer=null;
  this.songKey=null;this.songTitle='';this.songStatus='idle';this.songError='';this.songClips=[];
  this.songAbort=null;this.songRevision=0;
  this.onHit=null;this.onStep=null;this.onChange=null;
 }
 snapshot(){
  return {bpm:this.bpm,running:this.running,recording:this.recording,step:this.step,
   programmed:this.pattern.map(steps=>steps.size),
   songTitle:this.songTitle,songStatus:this.songStatus,songError:this.songError,
   songClips:this.songClips.map(({offset})=>displaySongTime(offset)),
   songReady:this.songStatus==='ready'&&this.songClips.length===16,
   midiReady:!!this.midi,
   midiSupported:typeof navigator!=='undefined'&&typeof navigator.requestMIDIAccess==='function',
   outputs:this.midi?[...this.midi.outputs.values()].map(p=>({id:p.id,name:p.name||'Saída MIDI'})):[],
   outputId:this.outputId};
 }
 /** The current song is the pad bank. Loading is deferred until DJ mode
  * opens: no extra full-track fetch competes with streaming music playback.
  */
 resetSong(){
  this.songRevision++;this.songAbort?.abort();this.songAbort=null;
  this.songClips=[];this.songStatus='idle';this.songError='';this.songKey=null;this.songTitle='';
  this.stopLoop();this.clearPattern();this.onChange?.();
 }
 async prepareSong(track,{force=false}={}){
  const key=track?.id||track?.url||null;
  if(!force&&this.songKey===key&&(this.songStatus==='ready'||this.songStatus==='loading'))return this.songStatus==='ready';
  this.songRevision++;const revision=this.songRevision;
  this.songAbort?.abort();
  this.songAbort=new AbortController();
  this.songKey=key;this.songClips=[];this.songError='';
  this.songTitle=String(track?.title||'');
  this.stopLoop();this.clearPattern();
  if(!track){
   this.songStatus='idle';this.onChange?.();return false;
  }
  if(!track.file&&!track.url){
   this.songStatus='unavailable';this.songError='O player não disponibiliza o áudio desta faixa para recortes.';
   this.onChange?.();return false;
  }
  this.songStatus='loading';this.onChange?.();
  try{
   let bytes;
   if(track.file){
    if(track.file.size>SONG_DECODE_MAX_BYTES)throw Error('Arquivo grande demais para análise local.');
    bytes=await track.file.arrayBuffer();
   }else bytes=await loadSongBytes(track.url,{signal:this.songAbort.signal,maxBytes:SONG_DECODE_MAX_BYTES});
   if(revision!==this.songRevision)return false;
   const Offline=globalThis.OfflineAudioContext||globalThis.webkitOfflineAudioContext;
   if(!Offline)throw Error('Este navegador não permite analisar a música.');
   const decoder=new Offline(1,1,44100);
   const decoded=await decoder.decodeAudioData(bytes);
   if(revision!==this.songRevision)return false;
   if(decoded.duration<1||decoded.duration>SONG_DECODE_MAX_SECONDS)throw Error('Esta faixa excede a duração suportada para pads locais.');
   const clips=createSongPadClips(decoded,decoder);
   if(revision!==this.songRevision)return false;
   if(clips.length!==16)throw Error('Não foi possível gerar os trechos desta música.');
   this.songClips=clips;this.songStatus='ready';this.songError='';
   this.onChange?.();return true;
  }catch(err){
   if(revision!==this.songRevision)return false;
   this.songStatus='unavailable';this.songClips=[];
   this.songError=err?.name==='AbortError'?'':String(err?.message||'Áudio não disponível para análise local.');
   this.onChange?.();return false;
  }finally{
   if(revision===this.songRevision)this.songAbort=null;
  }
 }
 getPulse(){const value=this.pulse;this.pulse*=.86;if(this.pulse<.008)this.pulse=0;return value}
 setBpm(value){
  this.bpm=clampBpm(value);
  if(this.running&&this.engine.ctx){this.nextStep=0;this.step=0;this.nextStepTime=this.engine.ctx.currentTime+.065;this.startTime=this.nextStepTime;this.clearUI();}
  this.onChange?.();return this.bpm;
 }
 clearUI(){for(const handle of this.pendingUI)clearTimeout(handle);this.pendingUI.clear()}
 clearPattern(){this.pattern.forEach(s=>s.clear());this.onChange?.()}
 setRecording(value){this.recording=!!value;if(this.recording&&!this.running)return this.startLoop();this.onChange?.();return Promise.resolve()}
 async startLoop(){
  if(this.running){this.stopLoop();return}
  await this.engine.resume();
  if(this.running)return;
  this.running=true;this.nextStep=0;this.step=0;
  this.startTime=this.engine.ctx.currentTime+.065;this.nextStepTime=this.startTime;
  this.schedule();this.timer=setInterval(()=>this.schedule(),25);this.onChange?.();
 }
 stopLoop(){
  this.running=false;this.recording=false;
  if(this.timer!==null)clearInterval(this.timer);this.timer=null;this.clearUI();this.onStep?.(-1);
  this.onChange?.();
 }
 schedule(){
  if(!this.running||!this.engine.ctx)return;
  const ctx=this.engine.ctx,horizon=ctx.currentTime+.105,stepLength=60/this.bpm/4;
  while(this.nextStepTime<horizon){
   const step=this.nextStep,time=this.nextStepTime;
   for(let pad=0;pad<16;pad++)if(this.pattern[pad].has(step))this.playSound(pad,time,106,true);
   const delay=Math.max(0,(time-ctx.currentTime)*1000);
   const handle=setTimeout(()=>{this.pendingUI.delete(handle);if(this.running){this.step=step;this.onStep?.(step)}},delay);
   this.pendingUI.add(handle);
   this.nextStep=(step+1)%16;this.nextStepTime+=stepLength;
  }
 }
 async trigger(pad,velocity=105,{fromMidi=false}={}){
  if(!Number.isInteger(pad)||pad<0||pad>=16)return false;
  // Apply feedback on pointerdown immediately instead of waiting for AudioContext unlock.
  this.pulse=Math.max(this.pulse,.74);
  this.onHit?.(pad);
  if(this.running&&this.recording&&this.engine.ctx){
   const step=quantizeStep(this.engine.ctx.currentTime-this.startTime,this.bpm);
   this.pattern[pad].add(step);this.onChange?.();
  }
  try{
   await this.engine.resume();
   this.playSound(pad,this.engine.ctx.currentTime+.002,velocity,!fromMidi);
   return true;
  }catch{return false}
 }
 _noise(ctx){
  if(this.noiseBuffer&&this.noiseBuffer.sampleRate===ctx.sampleRate)return this.noiseBuffer;
  const buffer=ctx.createBuffer(1,Math.round(ctx.sampleRate*.8),ctx.sampleRate),data=buffer.getChannelData(0);
  for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
  this.noiseBuffer=buffer;return buffer;
 }
 playSound(pad,when,velocity=106,feedback=true){
  const ctx=this.engine.ctx;if(!ctx||!Number.isInteger(pad)||pad<0||pad>=16)return;
  if(this.songClips[pad])return this.playSongClip(pad,when,velocity,feedback);
  const at=Math.max(ctx.currentTime,when),volume=clampVelocity(velocity)/127;
  const output=ctx.createGain();output.gain.value=.32*volume;output.connect(this.engine.analyser||ctx.destination);
  // Brief voices, no sample-fetching or persistent nodes per pad.
  const tone=(type,freq,endFreq,duration,gain=1)=>{
   const osc=ctx.createOscillator(),env=ctx.createGain();
   osc.type=type;osc.frequency.setValueAtTime(Math.max(25,freq),at);
   osc.frequency.exponentialRampToValueAtTime(Math.max(25,endFreq),at+duration);
   env.gain.setValueAtTime(Math.max(.0001,gain),at);
   env.gain.exponentialRampToValueAtTime(.0001,at+duration);
   osc.connect(env);env.connect(output);osc.start(at);osc.stop(at+duration+.005);
  };
  const noise=(cutoff,duration,gain=1,filterType='highpass')=>{
   const buffer=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),env=ctx.createGain();
   buffer.buffer=this._noise(ctx);filter.type=filterType;filter.frequency.value=cutoff;filter.Q.value=.7;
   env.gain.setValueAtTime(Math.max(.0001,gain),at);env.gain.exponentialRampToValueAtTime(.0001,at+duration);
   buffer.connect(filter);filter.connect(env);env.connect(output);buffer.start(at);buffer.stop(at+duration+.005);
  };
  switch(pad){
   case 0:tone('sine',165,42,.35,1.7);break;
   case 1:noise(1600,.18,.95);tone('triangle',185,92,.12,.38);break;
   case 2:noise(1150,.23,.88);break;
   case 3:noise(5800,.065,.59);break;
   case 4:noise(5200,.38,.53);break;
   case 5:tone('sine',175,80,.27,1.0);break;
   case 6:tone('sine',305,155,.2,.9);break;
   case 7:noise(3100,.037,.52);tone('triangle',790,560,.037,.42);break;
   case 8:tone('triangle',380,180,.16,.67);noise(2800,.08,.24);break;
   case 9:tone('square',625,590,.13,.2);tone('square',945,935,.13,.15);break;
   case 10:noise(2400,.72,.5);break;
   case 11:noise(6700,.105,.38);break;
   case 12:tone('sine',88,36,.57,1.12);break;
   case 13:tone('square',1450,940,.027,.19);break;
   case 14:tone('sawtooth',1100,145,.22,.3);break;
   case 15:tone('triangle',350,55,.45,.59);noise(900,.4,.25,'bandpass');break;
  }
  this.pulse=Math.max(this.pulse,pad===0||pad===12?1:.63);
  if(feedback)this.sendLed(pad,velocity,at);
  if(when>ctx.currentTime+.01){
   const handle=setTimeout(()=>{this.pendingUI.delete(handle);if(this.running)this.onHit?.(pad)},Math.max(0,(at-ctx.currentTime)*1000));
   this.pendingUI.add(handle);
  }
 }
 /** Trigger a real segment of the currently selected song. No oscillator or
  * external MIDI dependency. Each 16-note bank changes on track selection.
  */
 playSongClip(pad,when,velocity=106,feedback=true){
  const ctx=this.engine.ctx,clip=this.songClips[pad];if(!ctx||!clip)return;
  const at=Math.max(ctx.currentTime,when),duration=clip.duration,source=ctx.createBufferSource();
  const env=ctx.createGain();
  source.buffer=clip.buffer;
  source.playbackRate.value=Math.max(.5,Math.min(2,this.engine.speed||1));
  const length=Math.min(duration/source.playbackRate.value,.9);
  const gain=.66*clampVelocity(velocity)/127;
  env.gain.setValueAtTime(.0001,at);
  env.gain.linearRampToValueAtTime(gain,at+.006);
  env.gain.setValueAtTime(gain,Math.max(at+.007,at+length-.068));
  env.gain.exponentialRampToValueAtTime(.0001,at+length);
  source.connect(env);env.connect(this.engine.analyser||ctx.destination);
  source.start(at,0,duration);source.stop(at+length+.002);
  source.onended=()=>{try{source.disconnect();env.disconnect()}catch{}};
  this.pulse=Math.max(this.pulse,.77);
  if(feedback)this.sendLed(pad,velocity,at);
  if(when>ctx.currentTime+.01){
   const handle=setTimeout(()=>{this.pendingUI.delete(handle);if(this.running)this.onHit?.(pad)},Math.max(0,(at-ctx.currentTime)*1000));
   this.pendingUI.add(handle);
  }
 }
 sendLed(pad,velocity=105,at=this.engine.ctx?.currentTime||0){
  if(!this.midi||this.outputId==='off')return;
  const output=this.midi.outputs.get(this.outputId);if(!output)return;
  const ms=typeof performance!=='undefined'?performance.now():0;
  const delta=this.engine.ctx?Math.max(0,(at-this.engine.ctx.currentTime)*1000):0;
  const note=MIDI_BASE_NOTE+pad;
  try{
   output.send([0x90,note,clampVelocity(velocity)],ms+delta);
   output.send([0x80,note,0],ms+delta+155);
  }catch{/* Hardware LED support varies by controller. */}
 }
 setOutput(id){
  this.outputId=this.midi?.outputs.has(id)?id:'off';this.onChange?.();
 }
 _attachMidiInputs(){
  if(!this.midi)return;
  for(const input of this.midi.inputs.values()){
   input.onmidimessage=event=>{
    const [status,note,velocity]=event.data||[];
    if((status&0xf0)!==0x90||!velocity)return;
    const pad=padFromNote(note);
    if(pad>=0)void this.trigger(pad,velocity,{fromMidi:true});
   };
  }
  if(this.outputId!=='off'&&!this.midi.outputs.has(this.outputId))this.outputId='off';
  this.onChange?.();
 }
 async connectMIDI(){
  if(this.midi)return true;
  if(typeof navigator==='undefined'||typeof navigator.requestMIDIAccess!=='function')return false;
  try{
   this.midi=await navigator.requestMIDIAccess({sysex:false});
   this.midi.onstatechange=()=>this._attachMidiInputs();
   this._attachMidiInputs();return true;
  }catch{return false}
 }
 destroy(){
  this.resetSong();
  if(this.midi){for(const input of this.midi.inputs.values())input.onmidimessage=null;this.midi.onstatechange=null;}
  this.midi=null;
 }
}
