import {test} from 'node:test';
import assert from 'node:assert/strict';
import {exportProfile,freezeShareRequest,shareFrame,shareMetadata} from '../lib/share-model.js';
import {stretchClip} from '../lib/share-stretch.js';
import {readShareAsset} from '../lib/share-renderer.js';
import {KaraokeMicrophone,microphoneError} from '../lib/karaoke-microphone.js';
import {analyzeVoice,timedWindows,KaraokeLiveScore} from '../lib/karaoke-live-score.js';
const draft={track:{id:'local',source:'local',title:'Song',artist:'Artist',artwork:'https://example.org/cover?private=1'},duration:60,position:10,speed:1.25,lines:[{time:9,text:'First'},{time:12,text:'Second'}],synced:true,visual:{theme:'ACID'}};
test('export profiles match all native size/fps/bitrate combinations; lyrics never crop',()=>{
 for(const [quality,short,long,fps,bitrate] of [['economy',540,960,15,1600000],['balanced',720,1280,20,2800000],['high',1080,1920,30,5500000]]){
  for(const [aspect,width,height] of [['portrait',short,long],['square',short,short],['landscape',long,short]]){
   assert.deepEqual(exportProfile({quality,aspect}),{quality,aspect,crop:'safe',width,height,fps,bitrate});
  }
 }
 assert.equal(exportProfile({crop:'crop'},'lyrics').crop,'safe');
});
test('draft freezes source time and lines; public package metadata excludes private media URLs',()=>{
 const state=structuredClone(draft),r=freezeShareRequest(state,'lyrics-audio');state.lines[0].text='changed';state.visual.theme='ICE';
 assert.equal(r.lines[0].text,'First');assert.equal(r.visual.theme,'ACID');assert.equal(r.duration,15);assert.throws(()=>r.lines[0].text='mutate');
 const p=exportProfile();assert.equal(shareFrame(r,p,2).sourceTime,12.5);assert.equal(shareFrame(r,p,2).line.text,'Second');assert.equal(shareFrame(r,p,0).index,0);
 const meta=JSON.stringify(shareMetadata(r,p,{mime:'video/webm',duration:2}));assert.doesNotMatch(meta,/example|private|artwork|sourceURL/);
 assert.equal(freezeShareRequest({...draft,position:59,speed:2},'video').duration,.5);
 assert.throws(()=>freezeShareRequest({...draft,synced:false},'lyrics-noaudio'),/sincronizada/);
 assert.throws(()=>freezeShareRequest({...draft,track:{...draft.track,source:'preview'}},'player-audio'),/prévia/);
});
test('bounded pitch-preserving export stretch keeps a tone near 440 Hz at 0.75x and 1.5x',()=>{
 const rate=32000,tone=Float32Array.from({length:rate*4},(_,i)=>.3*Math.sin(i*2*Math.PI*440/rate));
 for(const speed of [.75,1.5]){
  const [audio]=stretchClip([tone],rate,speed,2);assert.equal(audio.length,rate*2);
  const voice=analyzeVoice(audio.subarray(5000,9096),rate);assert.ok(Math.abs(voice.hz-440)<4,JSON.stringify({speed,voice}));
 }
 assert.throws(()=>stretchClip([tone],rate,1,16),/limite/);
});
test('native voice gate detects fundamentals, excludes DC/silence/noise and explicit lyric gaps',()=>{
 for(const hz of [65,80,110,220,440,880,1000,1090,1100]){
  const rate=48000,frame=analyzeVoice(Float32Array.from({length:4096},(_,i)=>.12*Math.sin(2*Math.PI*hz*i/rate)),rate);
  assert.ok(frame.voiced&&Math.abs(frame.hz-hz)<6,JSON.stringify({hz,frame}));
 }
 assert.equal(analyzeVoice(new Float32Array(4096).fill(.2),48000).voiced,false);
 let seed=2;const noise=Float32Array.from({length:4096},()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296-.5});assert.equal(analyzeVoice(noise,48000).voiced,false);
 const w=timedWindows([{time:0,text:'voice'},{time:2,text:''},{time:10,text:'again'}],15);assert.equal(w[0].end,2);
 const score=new KaraokeLiveScore();score.start([{time:0,text:'a'},{time:2,text:''},{time:10,text:'b'}],15);const vocal={rms:.1,hz:220,confidence:.9,voiced:true};
 for(let t=.1;t<2.1;t+=.1)score.tick(t,true,vocal);const before=score.snapshot().score;for(let t=2.2;t<8;t+=.1)score.tick(t,true,vocal);assert.equal(score.snapshot().score,before);score.finish();assert.equal(score.finish().score,before);
});
test('microphone start deduplicates permission and resumes before waiting; canceled input is released',async()=>{
 let grant,requests=0,stopped=0,resumed=false;const events=[];
 class Context{state='running';resume(){resumed=true;events.push('resume');return Promise.resolve()}close(){this.state='closed';return Promise.resolve()}}
 const mic=new KaraokeMicrophone({AudioContextClass:Context,mediaDevices:{getUserMedia(){requests++;events.push('permission');return new Promise(r=>grant=r)}},WorkerClass:null});
 const a=mic.start(),b=mic.start();assert.equal(a,b);assert.equal(requests,1);assert.ok(resumed);assert.deepEqual(events,['resume','permission']);mic.stop();
 grant({active:true,getTracks:()=>[{stop(){stopped++}}]});assert.equal(await a,false);assert.ok(stopped>0);assert.equal(mic.active,false);assert.equal(mic.context,null);assert.equal(mic.frameNow().voiced,false);
});
test('microphone context and permission failures leave retryable states and precise feedback',async()=>{
 class Broken{constructor(){throw Error('context failed')}}
 const mic=new KaraokeMicrophone({AudioContextClass:Broken,mediaDevices:{getUserMedia(){throw Error('should not call')}}});await assert.rejects(mic.start(),/context failed/);assert.equal(mic.status,'error');assert.equal(mic.pending,null);
 assert.match(microphoneError({name:'NotAllowedError'}),/permissões/);assert.match(microphoneError({name:'NotFoundError'}),/Nenhum microfone/);
});
test('export reads only bounded complete objects and cancels oversized streaming bodies',async()=>{
 const original=globalThis.fetch;let canceled=false;
 try{
  globalThis.fetch=async()=>new Response(new Uint8Array(3),{status:206});await assert.rejects(readShareAsset('/partial'),/completo/);
  globalThis.fetch=async()=>new Response(new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(5))},cancel(){canceled=true}}));
  await assert.rejects(readShareAsset('/large',{maxBytes:8}),/limite/);assert.ok(canceled);
  globalThis.fetch=async()=>new Response(new Uint8Array([1,2,3]));assert.deepEqual(new Uint8Array(await readShareAsset('/complete',{maxBytes:8})),new Uint8Array([1,2,3]));
 }finally{globalThis.fetch=original}
});

test('WebM finalization adds finite duration without copying/changing encoded clusters',async()=>{
 const {finalizeWebM}=await import('../lib/webm-duration.js');
 const header=new Uint8Array([0x1a,0x45,0xdf,0xa3,0x80,0x18,0x53,0x80,0x67,0x01,255,255,255,255,255,255,255,0x15,0x49,0xa9,0x66,0x87,0x2a,0xd7,0xb1,0x83,0x0f,0x42,0x40]);
 const clusters=new Uint8Array([0x1f,0x43,0xb6,0x75,0xff,0xe7,0x81,0x00]);
 const before=new Blob([header,clusters],{type:'video/webm'}),after=await finalizeWebM(before,1.25),bytes=new Uint8Array(await after.arrayBuffer());
 assert.equal(after.size,before.size+11);assert.deepEqual(bytes.slice(-clusters.length),clusters);assert.equal(bytes[21],0x92);
 assert.equal(new DataView(bytes.buffer).getFloat64(32),1250);
 await assert.rejects(finalizeWebM(before,Infinity),/Duração/);await assert.rejects(finalizeWebM(new Blob(['invalid'],{type:'video/webm'}),1));
 assert.equal(await finalizeWebM(new Blob([],{type:'video/mp4'}),2) instanceof Blob,true);
});

test('a stale stage permission completion cannot stop or reset a newer capture',async()=>{
 const {KaraokeStage}=await import('../ui/karaoke-stage.js');let resolve,stops=0,starts=0;
 const mic={active:false,generation:0,start(){this.generation++;return new Promise(r=>resolve=r)},stop(){stops++}};
 const stage={mic,remoteHost:{},query:()=>({disabled:false,hidden:false}),onMicConflict:()=>false,isCaptureVisible:()=>true,updateScore(){},scorer:{start(){starts++}},onNotify(){throw Error('stale activation must not notify')}};
 const activating=KaraokeStage.prototype.toggleMic.call(stage);mic.generation++;mic.active=true;resolve(true);await activating;assert.equal(stops,0);assert.equal(starts,0);
});

test('format detection prefers native Apple codecs and mature WebM elsewhere',async()=>{
 const {videoMime}=await import('../lib/share-encoder.js');const original=globalThis.MediaRecorder,nav=globalThis.navigator,descriptor=Object.getOwnPropertyDescriptor(nav,'vendor');
 try{globalThis.MediaRecorder={isTypeSupported:()=>true};Object.defineProperty(nav,'vendor',{configurable:true,value:'Google Inc.'});assert.equal(videoMime(true),'video/webm;codecs=vp8,opus');Object.defineProperty(nav,'vendor',{configurable:true,value:'Apple Computer, Inc.'});assert.match(videoMime(true),/avc1.*mp4a/);assert.doesNotMatch(videoMime(false),/mp4a/);globalThis.MediaRecorder={isTypeSupported:()=>false};assert.equal(videoMime(true),null)}
 finally{globalThis.MediaRecorder=original;if(descriptor)Object.defineProperty(nav,'vendor',descriptor);else delete nav.vendor}
});
