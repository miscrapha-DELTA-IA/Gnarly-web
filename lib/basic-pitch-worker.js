/* Lazy, isolated Basic Pitch inference. No audio data ever leaves this worker. */
import {BasicPitch,outputToNotesPoly,addPitchBendsToNoteEvents,noteFramesToTime} from '@spotify/basic-pitch';
let busy=false;
self.onmessage=async event=>{
 const {id,pcm,sampleRate,duration}=event.data||{};
 if(busy||!(pcm instanceof Float32Array)||pcm.length<1024||!Number.isFinite(sampleRate)){
  self.postMessage({id,error:'Áudio para MIDI inválido ou motor ocupado.'});return;
 }
 busy=true;
 try{
  self.postMessage({id,progress:0});
  // Model is downloaded only on demand, from our own origin, into TensorFlow.js.
  const basic=new BasicPitch(new URL('./models/basic-pitch/model.json',import.meta.url).href);
  const frames=[],onsets=[],contours=[];
  // BasicPitch.prepareData assumes 22050Hz. Resample in the caller before entering worker.
  await basic.evaluateModel(pcm,(f,o,c)=>{frames.push(...f);onsets.push(...o);contours.push(...c)},
   p=>self.postMessage({id,progress:Math.min(.99,Math.max(0,Number(p)||0))}));
  const notes=noteFramesToTime(addPitchBendsToNoteEvents(
   contours,outputToNotesPoly(frames,onsets,.38,.38,7))).map(n=>({
    pitchMidi:n.pitchMidi,startTimeSeconds:n.startTimeSeconds,
    durationSeconds:n.durationSeconds,amplitude:n.amplitude
   }));
  self.postMessage({id,progress:1,notes:notes.slice(0,6000),duration});
 }catch(e){self.postMessage({id,error:'Basic Pitch não conseguiu analisar o arquivo. Use um trecho com instrumento isolado.'})}
 finally{busy=false}
};
