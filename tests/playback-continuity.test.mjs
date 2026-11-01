import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PlaybackContinuityMonitor,playableBufferAhead} from '../lib/playback-continuity.js';
import {FluidVisual} from '../lib/visual-engine.js';

const sample=(monitor,timeMs,position,options={})=>monitor.sample({
 timeMs,position,rate:1,readyState:4,visible:true,source:'file-a',
 duration:180,bufferedAhead:10,...options
});

test('normal decoder clock and delayed JS timeupdate never count as forward microjump',()=>{
 const events=[],m=new PlaybackContinuityMonitor({onInstability:(reason)=>events.push(reason)});
 m.select(1);
 assert.equal(sample(m,0,10),null);
 assert.equal(sample(m,350,10.35),null);
 assert.equal(sample(m,650,10.65),null);
 // A 2s main-thread delay with 2s of real audio progression is NOT a jump.
 assert.equal(sample(m,2650,12.65),null);
 assert.equal(m.snapshot().forwardJumps,0);
 assert.deepEqual(events,[]);
});

test('genuine forward discontinuity is reported without changing the native clock',()=>{
 const reports=[],m=new PlaybackContinuityMonitor({onInstability:(reason,detail)=>reports.push({reason,detail})});
 m.select(1);sample(m,100,10);sample(m,450,10.35);
 assert.equal(sample(m,750,11.12),'forward_jump');
 assert.equal(m.snapshot().forwardJumps,1);
 assert.ok(m.snapshot().lastForwardJumpSeconds>.4);
 assert.equal(reports[0].reason,'forward_jump');
 // Read-only monitor: no setter/seek/playbackRate mutation.
 assert.equal(sample(m,1050,11.42),null);
 assert.equal(m.snapshot().forwardJumps,1);
});

test('explicit seek, new source, paused track, ratechange or hidden tab cannot create false positives',()=>{
 const m=new PlaybackContinuityMonitor();m.select(1);
 sample(m,0,0);
 m.transportEvent('seeking');sample(m,100,99,{seeking:true});
 m.transportEvent('seeked');sample(m,300,99);
 assert.equal(sample(m,600,99.3),null);
 sample(m,700,99.4,{paused:true});
 assert.equal(sample(m,800,100.2),null);
 sample(m,1100,100.5,{visible:false});
 assert.equal(sample(m,1200,102),null);
 sample(m,1500,102.3);
 sample(m,1700,119,{source:'file-b'});
 sample(m,1900,119.2,{rate:.8});
 m.transportEvent('ratechange');sample(m,2000,120,{rate:.8});
 assert.equal(m.snapshot().forwardJumps,0);
 m.select(2);assert.equal(m.snapshot().forwardJumps,0);
});

test('low playable buffer only triggers occasional audio-priority handling, never near track end',()=>{
 const events=[],m=new PlaybackContinuityMonitor({onInstability:reason=>events.push(reason)});
 m.select(1);sample(m,100,30,{bufferedAhead:.5});
 assert.equal(sample(m,450,30.35,{bufferedAhead:.5}),'low_buffer');
 assert.equal(sample(m,750,30.65,{bufferedAhead:.5}),null);
 assert.equal(sample(m,5800,35.7,{bufferedAhead:.5}),null,'large JS scheduling gaps are ignored');
 assert.equal(sample(m,6200,36.1,{bufferedAhead:.5}),'low_buffer');
 m.select(2);sample(m,100,178,{bufferedAhead:.3});
 assert.equal(sample(m,500,178.4,{bufferedAhead:.3}),null);
 assert.deepEqual(events,['low_buffer','low_buffer']);
});

test('HTTP buffered ranges find only the current decodable contiguous interval',()=>{
 const audio={currentTime:14.8,buffered:{length:2,
  start:i=>i===0?0:14,end:i=>i===0?10:22}};
 assert.ok(Math.abs(playableBufferAhead(audio)-7.2)<.01);
 audio.currentTime=11;
 assert.equal(playableBufferAhead(audio),null);
 audio.currentTime=99;
 assert.equal(playableBufferAhead(audio),null);
});

test('GPU prioritization temporarily halves shader work without changing resolution or audio',()=>{
 const v=Object.create(FluidVisual.prototype);
 Object.assign(v,{playbackActive:true,reduced:false,audioPriorityUntil:0,
  audioPressureCount:0,lastAudioPressureAt:-Infinity});
 assert.ok(Math.abs(v.targetFramePeriod(100)-1000/60)<.01);
 v.prioritizeAudio('waiting',1000);
 assert.ok(Math.abs(v.targetFramePeriod(1100)-1000/30)<.01);
 assert.ok(Math.abs(v.targetFramePeriod(14000)-1000/60)<.01);
 v.prioritizeAudio('forward_jump',15000);
 v.prioritizeAudio('forward_jump',16000);
 assert.ok(Math.abs(v.targetFramePeriod(16100)-1000/24)<.01);
 assert.ok(Math.abs(v.targetFramePeriod(42000)-1000/60)<.01);
 v.playbackActive=false;
 assert.ok(Math.abs(v.targetFramePeriod(42100)-1000/30)<.01);
});

test('app tracks native clock without writing currentTime during normal playing',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const section=app.slice(app.indexOf("audio.addEventListener('timeupdate'"),app.indexOf("audio.addEventListener('progress',prepareUpcomingAudio)"));
 assert.match(section,/playbackContinuity\.sample\(/);
 assert.match(section,/playableBufferAhead\(audio\)/);
 assert.doesNotMatch(section,/audio\.currentTime\s*=/);
 const visual=readFileSync(new URL('../lib/visual-engine.js',import.meta.url),'utf8');
 assert.match(visual,/this\.targetFramePeriod\(now\)/);
 assert.doesNotMatch(visual,/audio\.currentTime\s*=/);
});
