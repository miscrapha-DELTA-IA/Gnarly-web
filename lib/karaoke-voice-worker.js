import {analyzeVoice} from './karaoke-live-score.js';
// One in-flight buffer. Raw samples never leave this device or accumulate.
self.onmessage=({data})=>{
 const samples=new Float32Array(data.buffer);
 const voice=analyzeVoice(samples,data.sampleRate);
 self.postMessage({voice,buffer:data.buffer,at:data.at},[data.buffer]);
};
