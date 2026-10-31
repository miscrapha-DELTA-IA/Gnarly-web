import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {WebAudioEngine,playbackDSPPlan,masteringLevels,
 BASS_FREQUENCY_HZ,OUTPUT_HEADROOM_DB,REVERB_MAX_WET} from '../lib/audio-engine.js';

const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<.0001,
 `Expected ${actual} to be near ${expected}`);
const iPhone={userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18 like Mac OS X)',
 platform:'iPhone',maxTouchPoints:5};
class FakeParam{
 constructor(value=0){this.value=value;this.ramps=[]}
 setTargetAtTime(value,time,constant){this.value=value;this.ramps.push({value,time,constant})}
}
class FakeNode{
 constructor(){
  this.connected=[];this.gain=new FakeParam(1);this.frequency=new FakeParam();
  this.Q=new FakeParam();this.threshold=new FakeParam();this.knee=new FakeParam();
  this.ratio=new FakeParam();this.attack=new FakeParam();this.release=new FakeParam();
 }
 connect(node){this.connected.push(node);return node}
 disconnect(node){if(!node){this.connected=[];return}this.connected=this.connected.filter(x=>x!==node)}
 getByteFrequencyData(array){array.fill(0)}
}
class FakeAudioContext{
 static instances=[];
 constructor(){this.state='running';this.sampleRate=24000;this.currentTime=0;
  this.destination=new FakeNode();this.sources=0;
  FakeAudioContext.instances.push(this);
 }
 createMediaElementSource(){this.sources++;return new FakeNode()}
 createGain(){return new FakeNode()}
 createConvolver(){return new FakeNode()}
 createBiquadFilter(){return new FakeNode()}
 createDynamicsCompressor(){return new FakeNode()}
 createAnalyser(){const n=new FakeNode();n.frequencyBinCount=512;return n}
 createBuffer(channels,frames){
  const data=Array.from({length:channels},()=>new Float32Array(frames));
  return {getChannelData:(channel)=>data[channel]};
 }
 async resume(){this.state='running'}
}

test('Swift-equivalent speed and pitch intent: tape bypass or preserve-pitch time stretch',()=>{
 assert.deepEqual(playbackDSPPlan(.8,false),{
  speed:.8,preservePitch:false,tapeRate:.8,stretchRate:1
 });
 assert.deepEqual(playbackDSPPlan(.8,true),{
  speed:.8,preservePitch:true,tapeRate:1,stretchRate:.8
 });
 assert.equal(playbackDSPPlan(999,false).speed,2);
 assert.equal(playbackDSPPlan(-2,true).speed,.5);
});

test('120 Hz low shelf, reverb limited to 50% and compensated mastering headroom',()=>{
 assert.equal(BASS_FREQUENCY_HZ,120);
 assert.equal(OUTPUT_HEADROOM_DB,-1.5);
 assert.equal(REVERB_MAX_WET,.5);
 const levels=masteringLevels({bass:12,reverb:.7});
 near(levels.bassDB,12);
 near(levels.wet,.5);
 near(levels.dry,.5);
 near(levels.eqCompensation,Math.pow(10,-12/20));
 near(levels.outputGain,Math.pow(10,-1.5/20));
 near(masteringLevels({bass:0,reverb:0}).wet,0);
});

test('Safari rate/pitch change updates once without forcing default rate changes',()=>{
 const audio={muted:false,playbackRate:1,defaultPlaybackRate:1,preservesPitch:true};
 const engine=new WebAudioEngine(audio,{device:iPhone});
 engine.setSpeed(.8,false);
 near(audio.playbackRate,.8);assert.equal(audio.preservesPitch,false);
 assert.equal(audio.defaultPlaybackRate,1);
 engine.setSpeed(.8,true);
 near(audio.playbackRate,.8);assert.equal(audio.preservesPitch,true);
 assert.equal(engine.ctx,null,'native iOS playback must not claim the media source');
});

test('only one stable DSP graph and one original media source, no rebuild during presets',async()=>{
 const previous=globalThis.window;
 globalThis.window={AudioContext:FakeAudioContext};
 FakeAudioContext.instances=[];
 try{
  const audio={muted:false,playbackRate:1,defaultPlaybackRate:1,preservesPitch:true};
  const engine=new WebAudioEngine(audio,{device:{userAgent:'Desktop',platform:'Win32'}});
  await engine.resume();
  const graph=engine.ctx;
  assert.ok(graph);assert.equal(graph.sources,1);
  assert.equal(engine.bassNode.type,'lowshelf');
  assert.equal(engine.bassNode.frequency.value,120);
  assert.equal(engine.limiter.ratio.value,16);
  assert.equal(engine.limiter.attack.value,.003);
  assert.equal(engine.limiter.release.value,.08);
  assert.equal(engine.eqOutput.connected.includes(engine.convolver),false,
   'convolver input disconnected when reverb is off');
  engine.setBass(12);
  engine.setReverb(.4);
  near(engine.bassNode.gain.value,12);
  near(engine.eqOutput.gain.value,Math.pow(10,-12/20));
  near(engine.masterGain.gain.value,Math.pow(10,-1.5/20));
  near(engine.wet.gain.value,.4/.7*.5);
  near(engine.dry.gain.value,1-.4/.7*.5);
  assert.equal(engine.eqOutput.connected.filter(x=>x===engine.convolver).length,1);
  for(let i=0;i<30;i++){
   engine.setSpeed(.5+i/30,true);engine.setBass(i/3);engine.setReverb(.1+i/60);
  }
  await engine.resume();
  assert.equal(engine.ctx,graph);
  assert.equal(graph.sources,1);
  assert.equal(engine.eqOutput.connected.filter(x=>x===engine.convolver).length,1);
  engine.setReverb(0);
  assert.equal(engine.eqOutput.connected.includes(engine.convolver),false);
  near(engine.wet.gain.value,0);
 }finally{globalThis.window=previous}
});

test('iPhone preserves native playback until effects are requested; once captured it is one way',async()=>{
 const previous=globalThis.window;
 globalThis.window={AudioContext:FakeAudioContext};
 try{
  const element={muted:false,playbackRate:1,preservesPitch:true};
  const engine=new WebAudioEngine(element,{device:iPhone});
  await engine.resume();assert.equal(engine.ctx,null);
  await engine.resume({requireGraph:true});
  assert.ok(engine.ctx);assert.equal(engine.ctx.sources,0);
  assert.equal(engine.mediaSource,null);
  await engine.enableStudioEffects();
  assert.equal(engine.ctx.sources,1);assert.equal(engine.nativeTransport,false);
  await engine.enableStudioEffects();assert.equal(engine.ctx.sources,1);
  assert.equal(engine.setBackgroundPriority(true),false);
 }finally{globalThis.window=previous}
});

test('continuous speed input is throttled and final speed commit is immediate',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/function scheduleSpeedMix\(\)/);
 assert.match(app,/now-lastSpeedMixTick>=110/);
 assert.match(app,/function commitSpeedMix\(\)/);
 assert.match(app,/if\(id==='speed'\)\{state\.speed=v;scheduleSpeedMix\(\)/);
 assert.match(app,/if\(e\.target\?\.dataset\?\.slider==='speed'\)commitSpeedMix\(\)/);
 assert.doesNotMatch(app,/if\(id==='speed'\)\{state\.speed=v;engine\.setSpeed\(v,state\.pitch\)/);
});
