import test from 'node:test';import assert from 'node:assert/strict';
import {mapStemFiles,classifyStemFilename,STEM_PRESETS,StemMixer} from '../lib/stem-mixer.js';
test('classify 4-source neural Demucs track filenames',()=>{
 assert.equal(classifyStemFilename('Vocals.wav'),'vocal');assert.equal(classifyStemFilename('drums.m4a'),'drums');assert.equal(classifyStemFilename('bass.wav'),'bass');assert.equal(classifyStemFilename('other.wav'),'other');
});
test('mixer rejects incomplete, ambiguous uploads',()=>{
 const f=['vocals.wav','drums.wav','bass.wav','other.wav'].map(name=>({name}));assert.deepEqual(Object.keys(mapStemFiles(f)),['vocal','drums','bass','other']);
 assert.throws(()=>mapStemFiles(f.slice(0,3)),/4 arquivos/);assert.throws(()=>mapStemFiles([...f,{name:'vocals.mp3'}]),/repetido/);
});
test('true stem presets mute specific sources (never infer source separation)',()=>{
 assert.deepEqual(STEM_PRESETS.karaoke,{vocal:0,drums:1,bass:1,other:1});assert.deepEqual(STEM_PRESETS.acapella,{vocal:1,drums:0,bass:0,other:0});
});

test('small asynchronous media clock jitter never causes repetitive stem seeks',()=>{
 const clock={currentTime:20,playbackRate:.8,preservesPitch:false,paused:false,seeking:false};
 const engine={speed:.8};const mixer=new StemMixer(engine,clock);
 mixer.ready=true;
 const elements=[];
 for(let i=0;i<4;i++){
  let time=19.8,rate=.8,pitch=false,seeks=0,rateWrites=0;
  const el={readyState:3,paused:false,duration:180,
   get currentTime(){return time},set currentTime(v){time=v;seeks++},
   get playbackRate(){return rate},set playbackRate(v){rate=v;rateWrites++},
   get preservesPitch(){return pitch},set preservesPitch(v){pitch=v},
   get counts(){return {seeks,rateWrites}}};
  mixer.entries.set(String(i),{el});elements.push(el);
 }
 for(let i=0;i<30;i++)mixer.sync();
 for(const el of elements){
  assert.equal(el.counts.seeks,0,'timeupdate jitter must not cause microseeks');
  assert.equal(el.counts.rateWrites,0,'unchanged playbackRate must not be rewritten');
 }
 clock.currentTime=21;
 mixer.lastCorrectionAt=0;
 mixer.sync();
 for(const el of elements)assert.equal(el.counts.seeks,1,'sustained >650ms drift corrected once');
 clock.currentTime=22;
 mixer.sync();
 for(const el of elements)assert.equal(el.counts.seeks,1,'next timeupdate cannot immediately seek again');
 clock.paused=true;mixer.sync();
 for(const el of elements)assert.equal(el.counts.seeks,1,'paused stems cannot be resynchronized');
});

