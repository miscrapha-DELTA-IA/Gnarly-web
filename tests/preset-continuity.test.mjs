import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {WebAudioEngine} from '../lib/audio-engine.js';
import {MUSIC_PRESETS} from '../lib/music-presets.js';
import {mediaPosition} from '../lib/media-session-controller.js';

function player(){
 return {src:'',defaultPlaybackRate:1,playbackRate:1,preservesPitch:true,
  mozPreservesPitch:true,webkitPreservesPitch:true,duration:180,currentTime:0,
  load(){
   // Simulate Safari's new resource selection resetting media properties.
   this.playbackRate=1;this.preservesPitch=true;
   this.mozPreservesPitch=true;this.webkitPreservesPitch=true;
  }};
}
const create=(audio)=>new WebAudioEngine(audio,{device:{userAgent:'iPhone',platform:'iPhone',maxTouchPoints:5}});
test('Nightcore survives automatic next-track, source-load reset and headset previous',()=>{
 const audio=player(),engine=create(audio);
 engine.setSpeed(MUSIC_PRESETS.NIGHTCORE.speed,MUSIC_PRESETS.NIGHTCORE.pitch);
 for(const src of ['track-a.mp3','track-b.mp3','track-a.mp3']){
  audio.src=src;audio.load();engine.restoreSpeed();
  assert.equal(audio.playbackRate,1.25,src);
  assert.equal(audio.defaultPlaybackRate,1.25,src);
  assert.equal(audio.preservesPitch,false,src);
  assert.equal(audio.webkitPreservesPitch,false,src);
  assert.equal(audio.mozPreservesPitch,false,src);
  assert.equal(mediaPosition(audio,{duration:180}).playbackRate,1.25);
 }
});
test('Slowed, Original and custom user settings persist until explicitly changed',()=>{
 const audio=player(),engine=create(audio);
 const choices=[
  {speed:.8,pitch:false},{speed:1,pitch:true},
  {speed:1.43,pitch:false},{speed:.72,pitch:true}
 ];
 for(const choice of choices){
  engine.setSpeed(choice.speed,choice.pitch);
  audio.load();engine.restoreSpeed();
  assert.equal(engine.speed,choice.speed);
  assert.equal(engine.keepOriginalPitch,choice.pitch);
  assert.equal(audio.playbackRate,choice.speed);
  assert.equal(audio.preservesPitch,choice.pitch);
 }
});
test('browser unexpected async playbackRate reset is fixed without overriding user preset',()=>{
 const audio=player(),engine=create(audio);
 engine.setSpeed(1.25,false);
 audio.playbackRate=1;engine.restoreSpeed();
 assert.equal(audio.playbackRate,1.25);
 engine.setSpeed(.8,true);
 audio.playbackRate=1;engine.restoreSpeed();
 assert.equal(audio.playbackRate,.8);
 assert.equal(audio.preservesPitch,true);
});
test('session preset is restored in selection, Play, new URL, media metadata and recovery',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const selected=app.slice(app.indexOf('function selectTrack('),app.indexOf('async function recoverNativeAudio('));
 const native=app.slice(app.indexOf('function prepareNativeAudio('),app.indexOf('function reportAudioError('));
 const recovered=app.slice(app.indexOf('async function recoverNativeAudio('),app.indexOf('function pause()'));
 assert.match(selected,/engine\.restoreSpeed\(\)/);
 assert.doesNotMatch(selected,/state\.preset\s*=\s*['"]ORIGINAL/);
 assert.match(native,/engine\.restoreSpeed\(\)/);
 assert.match(recovered,/engine\.restoreSpeed\(\)/);
 assert.match(app,/audio\.addEventListener\('loadedmetadata',\(\)=>\{\s*engine\.restoreSpeed\(\)/);
 assert.match(app,/audio\.addEventListener\('ratechange',\(\)=>\{/);
 assert.match(app,/preset:getSetting\('preset','ORIGINAL'\)/);
 assert.match(app,/engine\.setSpeed\(state\.speed,state\.pitch\)/);
 assert.match(app,/for\(const key of \['speed','reverb','pitch','preset'\]\)setSetting/);
});
