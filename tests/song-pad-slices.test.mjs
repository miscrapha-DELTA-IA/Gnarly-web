import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SONG_PAD_COUNT,SONG_CLIP_SECONDS,detectSongPadOffsets,createSongPadClips,displaySongTime} from '../lib/song-pad-slices.js';
import {PerformancePads,padFromNote} from '../lib/performance-pads.js';
import {renderPerformancePanel} from '../ui/performance-panel.js';

test('sixteen note commands are track-local audio slices, not invented MIDI transcription',()=>{
 const sampleRate=8000,duration=16,channel=new Float32Array(sampleRate*duration);
 for(let i=0;i<channel.length;i++)channel[i]=.08*Math.sin(i/12);
 for(let t=0;t<16;t++)for(let i=0;i<180;i++)channel[t*sampleRate+70+i]=.85;
 const offsets=detectSongPadOffsets(channel,sampleRate,duration);
 assert.equal(offsets.length,SONG_PAD_COUNT);
 assert.ok(offsets.every(t=>t>=0&&t<=duration-SONG_CLIP_SECONDS));
 assert.ok(offsets[0]<offsets[7]&&offsets[7]<offsets[15],'each pad maps to a distinct region across the actual song');
 assert.deepEqual([padFromNote(36),padFromNote(51),padFromNote(52)],[0,15,-1]);
 assert.equal(displaySongTime(73.9),'1:13');
});
test('PCM bank keeps just 16 short clips, not 16 copies of the full song',()=>{
 const rate=8000,duration=16;
 const decoded={length:rate*duration,duration,sampleRate:rate,numberOfChannels:1,getChannelData:()=>new Float32Array(rate*duration)};
 const context={createBuffer:(channels,frames,sampleRate)=>{
  const samples=Array.from({length:channels},()=>new Float32Array(frames));
  return {numberOfChannels:channels,frames,sampleRate,getChannelData:index=>samples[index]};
 }};
 const clips=createSongPadClips(decoded,context);
 assert.equal(clips.length,16);
 assert.ok(clips.every(clip=>clip.buffer.frames<=Math.ceil(rate*SONG_CLIP_SECONDS)));
 assert.ok(clips.reduce((sum,clip)=>sum+clip.buffer.frames,0)<decoded.length);
});
test('current song automatically becomes the primary bank without MIDI permissions',async()=>{
 const original=globalThis.OfflineAudioContext;
 const decoded={
  numberOfChannels:1,length:16000,sampleRate:8000,duration:2,
  getChannelData:()=>new Float32Array(16000).fill(.2)
 };
 class OfflineStub{
  async decodeAudioData(){return decoded}
  createBuffer(_ch,frames,rate){const v=new Float32Array(frames);return {numberOfChannels:1,sampleRate:rate,getChannelData:()=>v,duration:frames/rate}}
 }
 globalThis.OfflineAudioContext=OfflineStub;
 try{
  const pads=new PerformancePads({});
  const record={id:'first',title:'Minha música',file:{size:200,async arrayBuffer(){return new ArrayBuffer(200)}}};
  assert.equal(await pads.prepareSong(record),true);
  assert.equal(pads.songStatus,'ready');
  assert.equal(pads.snapshot().songTitle,'Minha música');
  assert.equal(pads.snapshot().songClips.length,16);
  assert.equal(pads.snapshot().songReady,true);
  const markup=renderPerformancePanel(pads.snapshot());
  assert.equal((markup.match(/data-dj-pad="/g)||[]).length,16);
  assert.match(markup,/16 trechos reais desta faixa/);
  assert.match(markup,/data-dj-state="ready"/);
  assert.match(markup,/<details class="dj-advanced">/);
  assert.doesNotMatch(markup,/MIDI \/ LED FEEDBACK|Saída LED|luzes guiadas/);
  pads.resetSong();
  assert.equal(pads.songClips.length,0);
  assert.equal(pads.songStatus,'idle');
  pads.destroy();
 }finally{globalThis.OfflineAudioContext=original}
});
test('a stale previous song never replaces new song pad bank',async()=>{
 const original=globalThis.OfflineAudioContext;
 let release;
 const gate=new Promise(resolve=>release=resolve);
 class OfflineStub{
  async decodeAudioData(bytes){
   if(bytes.byteLength===101)await gate;
   return {numberOfChannels:1,length:16000,sampleRate:8000,duration:2,getChannelData:()=>new Float32Array(16000)};
  }
  createBuffer(_ch,frames,rate){return {numberOfChannels:1,sampleRate:rate,getChannelData:()=>new Float32Array(frames)}}
 }
 globalThis.OfflineAudioContext=OfflineStub;
 try{
  const pads=new PerformancePads({});
  const slow=pads.prepareSong({id:'old',title:'Old',file:{size:101,async arrayBuffer(){return new ArrayBuffer(101)}}});
  const fast=pads.prepareSong({id:'new',title:'New',file:{size:102,async arrayBuffer(){return new ArrayBuffer(102)}}});
  assert.equal(await fast,true);
  release();
  assert.equal(await slow,false);
  assert.equal(pads.songTitle,'New');
  assert.equal(pads.songStatus,'ready');
  pads.destroy();
 }finally{globalThis.OfflineAudioContext=original}
});
test('when audio is unavailable, fallback is labeled as demonstration, never music-derived MIDI',async()=>{
 const pads=new PerformancePads({});
 await pads.prepareSong({id:'protected',title:'External player',source:'youtube'});
 assert.equal(pads.songStatus,'unavailable');
 const html=renderPerformancePanel(pads.snapshot());
 assert.match(html,/banco de demonstração/);
 assert.match(html,/MP3 não contém MIDI original/);
 assert.ok(html.includes('data-dj-command="midi"'));
 pads.destroy();
});
