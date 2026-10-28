import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {QueueAudioWarmup,canWarmNext} from '../lib/queue-audio-warmup.js';
import {quickPlaylistMarkup} from '../ui/quick-playlist.js';
import {renderMusicPanel} from '../ui/music-panel.js';
import {WebAudioEngine} from '../lib/audio-engine.js';
const current={id:'youtube:AAAAAAAAAAA',videoId:'AAAAAAAAAAA',source:'youtube'};
const next={id:'youtube:BBBBBBBBBBB',videoId:'BBBBBBBBBBB',source:'youtube'};
test('next-song priming only in short safe handoff window, never offline/metered',()=>{
 const args={current,next,remaining:22,online:true};
 assert.equal(canWarmNext(args),true);
 for(const remaining of [0,2,50,Infinity])assert.equal(canWarmNext({...args,remaining}),false);
 assert.equal(canWarmNext({...args,saveData:true}),false);
 assert.equal(canWarmNext({...args,effectiveType:'slow-2g'}),false);
 assert.equal(canWarmNext({...args,online:false}),false);
 assert.equal(canWarmNext({...args,next:current}),false);
 assert.equal(canWarmNext({...args,next:{source:'preview'}}),false);
});
test('one bounded range request only, no full-track prefetch, no second request for same ID',async()=>{
 const calls=[];
 const fetcher=async(url,options)=>{
  calls.push({url,options});
  return new Response(new Uint8Array([42,51,60]),{status:206,headers:{'content-type':'audio/mp4'}});
 };
 const warmup=new QueueAudioWarmup({fetcher,timeout:250});
 assert.equal(await warmup.start(next),true);
 assert.equal(await warmup.start(next),false);
 assert.equal(calls.length,1);
 assert.equal(calls[0].options.headers.Range,'bytes=0-65535');
 assert.equal(calls[0].options.credentials,'omit');
 assert.match(calls[0].url,/delivery=browser/);
 warmup.reset();
 assert.equal(await warmup.start(next),true);
 assert.equal(calls.length,2);
});
test('micro playlist saves avoid extra player buttons and escape titles',()=>{
 const html=quickPlaylistMarkup(['Meu Mix','<img src=x onerror=alert(1)>'],'Meu Mix');
 assert.match(html,/data-quick-playlist="add"/);
 assert.match(html,/id="quick-playlist-create"/);
 assert.match(html,/Criar \+ salvar/);
 assert.doesNotMatch(html,/<img src=x/);
 assert.match(html,/&lt;img/);
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(index,/id="quick-playlist-button"/);
 assert.match(index,/id="quick-playlist-popover"/);
 assert.match(app,/playlistStore\.add\(name,track\)/);
 assert.match(app,/playlistStore\.create\(name\)/);
 assert.match(app,/closeQuickPlaylist\(\)/);
});
test('iPhone tells the truth about native EQ and exposes one explicit studio mode',()=>{
 const native=renderMusicPanel({backgroundAudioSupported:true,backgroundAudioEnabled:true});
 assert.match(native,/data-command="enable-studio-effects"/);
 assert.match(native,/id="bass"[^>]*disabled/);
 assert.match(native,/id="reverb"[^>]*disabled/);
 const studio=renderMusicPanel({backgroundAudioSupported:true,backgroundAudioEnabled:false});
 assert.doesNotMatch(studio,/enable-studio-effects/);
 assert.doesNotMatch(studio,/id="bass"[^>]*disabled/);
 assert.doesNotMatch(studio,/id="reverb"[^>]*disabled/);
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/case 'enable-studio-effects'/);
 assert.match(app,/backgroundAudioEnabled:engine.nativeTransport/);
 assert.match(app,/const start=audio\.play\(\),unlock=engine\.resume\(\)/);
});
test('enabling studio creates exactly one real WebAudio source; EQ changes live gain',async()=>{
 const previous=globalThis.window;
 class Node{
  constructor(){this.gain={value:0,setTargetAtTime(){}};this.frequency={value:0};this.fftSize=0;this.smoothingTimeConstant=0;}
  connect(){return this}
 }
 class Context{
  constructor(){this.state='running';this.sampleRate=22050;this.currentTime=0;this.destination=new Node();this.created=0}
  createMediaElementSource(){this.created++;return new Node()}
  createBiquadFilter(){return new Node()}
  createGain(){return new Node()}
  createConvolver(){return new Node()}
  createAnalyser(){const n=new Node();n.frequencyBinCount=512;return n}
  createBuffer(channels,length){return {getChannelData:()=>new Float32Array(length)}}
  resume(){this.state='running';return Promise.resolve()}
 }
 globalThis.window={AudioContext:Context};
 try{
  const audio={muted:false};
  const engine=new WebAudioEngine(audio,{device:{userAgent:'iPhone',platform:'iPhone'}});
  await engine.resume();
  assert.equal(engine.ctx,null,'native lock-screen route must not create graph');
  assert.equal(await engine.enableStudioEffects(),true);
  assert.equal(engine.nativeTransport,false);
  assert.equal(engine.ctx.created,1);
  engine.setBass(8);engine.setReverb(.5);
  assert.equal(engine.bassNode.gain.value,8);
  assert.equal(engine.wet.gain.value,.5);
  assert.equal(await engine.enableStudioEffects(),true);
  assert.equal(engine.ctx.created,1,'never double-claim the HTML audio element');
  assert.equal(engine.setBackgroundPriority(true),false,'cannot silently restore native after WebAudio owns source');
 }finally{globalThis.window=previous}
});
