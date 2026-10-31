import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {playbackTimelineDuration,durationIsInflated} from '../lib/playback-duration.js';
import {mediaPosition} from '../lib/media-session-controller.js';

const song={source:'youtube',videoId:'ABCDEFGHIJK',duration:195};
const audio=(duration,currentTime=0,opts={})=>({
 duration,currentTime,playbackRate:1.25,
 src:opts.src??'https://example.org/new.m4a',
 currentSrc:opts.currentSrc??'https://example.org/new.m4a',
 hasAttribute:()=>opts.attached!==false
});
test('reconciles grossly inflated progressive MP4 duration without changing audio',()=>{
 const media=audio(512);
 assert.equal(durationIsInflated(media,song),true);
 assert.equal(playbackTimelineDuration(media,song),195);
 assert.equal(media.src,'https://example.org/new.m4a');
 assert.equal(media.duration,512,'native media element is never modified');
 assert.equal(media.currentTime,0);
});
test('accepts encoder rounding or a slightly longer song as real',()=>{
 assert.equal(durationIsInflated(audio(199),song),false);
 assert.equal(playbackTimelineDuration(audio(199),song),199);
 assert.equal(playbackTimelineDuration(audio(229),song),229);
});
test('does not hide a recording that demonstrably continues past catalogue duration',()=>{
 const media=audio(512,199);
 assert.equal(playbackTimelineDuration(media,song),512);
 assert.equal(mediaPosition(media,song).position,199);
});
test('an unavailable old src cannot carry previous song duration to new selection',()=>{
 const stale=audio(540,0,{attached:false});
 assert.equal(playbackTimelineDuration(stale,song),195);
 const swapping=audio(540,0,{currentSrc:'https://example.org/old.m4a'});
 assert.equal(playbackTimelineDuration(swapping,song),195);
});
test('never invents a duration for unknown R2-only/local media',()=>{
 assert.equal(playbackTimelineDuration(audio(440),{source:'youtube',duration:0}),440);
 assert.equal(playbackTimelineDuration(audio(440),{source:'local',duration:180}),440);
 assert.equal(playbackTimelineDuration(audio(440),{source:'audius',duration:180}),440);
 assert.equal(durationIsInflated(audio(440),{source:'local',duration:180}),false);
 assert.equal(playbackTimelineDuration(audio(Infinity),{source:'local',duration:0}),0);
});
test('iTunes preview cannot inherit full-release duration before loading media',()=>{
 assert.equal(playbackTimelineDuration(audio(NaN,0,{attached:false}),{source:'preview',duration:215}),30);
 assert.equal(playbackTimelineDuration(audio(29.6),{source:'preview',duration:215}),29.6);
});
test('lock-screen media position agrees with player and clamps elapsed time',()=>{
 const media=audio(512,30);
 const result=mediaPosition(media,song);
 assert.deepEqual(result,{duration:195,position:30,playbackRate:1.25});
});
test('duration reconciliation never changes the selected audio src or playbackRate',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const durationFile=readFileSync(new URL('../lib/playback-duration.js',import.meta.url),'utf8');
 assert.match(app,/function updateProgress\(\)\{[\s\S]*?playbackTimelineDuration\(audio,state\.current\)/);
 assert.match(app,/audio\.addEventListener\('durationchange',reconcileReportedDuration\)/);
 assert.match(app,/visual\.setSong\(audio\.currentTime\|\|0,playbackTimelineDuration\(audio,state\.current\)/);
 assert.match(app,/audio\.currentTime=playbackTimelineDuration\(audio,state\.current\)\*Number\(e\.target\.value\)\/1000/);
 assert.doesNotMatch(durationFile,/\.play\(|\.pause\(|\.load\(|\.src\s*=|\.playbackRate\s*=/);
});
