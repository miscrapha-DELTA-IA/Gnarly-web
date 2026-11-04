import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mediaTimeline,shouldFinishGhostTail} from '../lib/media-duration.js';
import {mediaPosition} from '../lib/media-session-controller.js';

const recorded={source:'youtube',catalogDuration:192,mediaDuration:390,currentTime:0};
test('decoded duration wins even when catalogue metadata is radically shorter',()=>{
 const t=mediaTimeline(recorded);
 assert.equal(t.inflated,true);
 assert.equal(t.duration,390);
 assert.equal(t.mediaDuration,390);
 assert.ok(t.ghostEndAt>=200&&t.ghostEndAt<=212);
 assert.equal(mediaTimeline({...recorded,mediaDuration:192}).duration,192);
 assert.equal(mediaTimeline({...recorded,mediaDuration:210}).duration,210,
  'small drift from a known recording must not cause early termination');
});
test('potential ghost tail never ends a healthy track unless independently confirmed',()=>{
 const t=mediaTimeline(recorded);
 assert.equal(shouldFinishGhostTail({...recorded,currentTime:t.ghostEndAt-.2}),false);
 assert.equal(shouldFinishGhostTail({...recorded,currentTime:t.ghostEndAt+.2}),false,
  'a healthy track must NEVER be cut at the catalogue duration');
 assert.equal(shouldFinishGhostTail({...recorded,currentTime:t.ghostEndAt+.2,confirmedSilentTail:true}),true);
 assert.equal(shouldFinishGhostTail({...recorded,currentTime:t.ghostEndAt+.2,paused:true}),false);
 assert.equal(shouldFinishGhostTail({...recorded,currentTime:t.ghostEndAt+.2,ended:true}),false);
 assert.equal(shouldFinishGhostTail({...recorded,currentTime:t.ghostEndAt+.2,recovering:true}),false);
 assert.equal(shouldFinishGhostTail({...recorded,currentTime:391}),false);
});
test('never forcibly end legitimate long edits, uploads, offline audio, live tracks or previews',()=>{
 for(const source of ['local','audius','jamendo','preview','live','']){
  const props={...recorded,source,currentTime:260};
  assert.equal(mediaTimeline(props).inflated,false,source);
  assert.equal(shouldFinishGhostTail(props),false,source);
 }
 assert.equal(shouldFinishGhostTail({...recorded,offline:true,currentTime:260}),false);
 assert.equal(mediaTimeline({...recorded,offline:true}).duration,390);
 assert.equal(shouldFinishGhostTail({...recorded,catalogDuration:0,currentTime:260}),false);
 assert.equal(shouldFinishGhostTail({...recorded,catalogDuration:15,currentTime:260}),false);
 assert.equal(shouldFinishGhostTail({...recorded,catalogDuration:4000,currentTime:260}),false);
});
test('browser-known media duration is authoritative when there is no clear mismatch',()=>{
 assert.equal(mediaTimeline({...recorded,mediaDuration:200}).duration,200);
 assert.equal(mediaTimeline({...recorded,mediaDuration:175}).duration,175);
 assert.equal(mediaTimeline({...recorded,mediaDuration:Infinity}).duration,192);
 assert.equal(mediaTimeline({...recorded,mediaDuration:NaN}).duration,192);
 assert.equal(mediaTimeline({...recorded,mediaDuration:0,catalogDuration:0}).duration,0);
 assert.equal(shouldFinishGhostTail({...recorded,mediaDuration:175,currentTime:180}),false);
});
test('lock-screen position, elapsed time and duration share identical bounded timeline',()=>{
 const state=mediaPosition({duration:390,currentTime:235,playbackRate:.8},{source:'youtube',duration:192});
 assert.equal(state.duration,390);
 assert.equal(state.position,235);
 assert.equal(state.playbackRate,.8);
 const local=mediaPosition({duration:390,currentTime:235,playbackRate:1},{source:'local',duration:192});
 assert.equal(local.duration,390);
 assert.equal(local.position,235);
});
test('player uses decoded duration for UI and never ends a healthy track based solely on catalogue data',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/function activeTimeline\(\)/);
 assert.match(app,/const duration=activeTimeline\(\)\.duration/);
 assert.match(app,/function updateProgress\(\)\{/);
 assert.match(app,/const d=activeTimeline\(\)\.duration/);
 assert.match(app,/if\(state\.current&&state\.audioState==='playing'&&shouldFinishGhostTail\(/);
 assert.match(app,/completedPlaybackSelection===playbackSelection/);
 assert.match(app,/function completeCurrentRecording\(\{ghost=false\}=\{\}\)/);
 assert.match(app,/audio\.addEventListener\('ended',\(\)=>\{/);
 assert.match(app,/if\(track\.source==='local'&&\!\(Number\(track\.duration\)>0\)/,
  'inflated YouTube decoder duration must never poison catalogue duration');
 assert.doesNotMatch(app,/if\(!\(Number\(track\.duration\)>0\)&&audio\.duration<1200\)track\.duration=audio\.duration/);
});
