import test from 'node:test';
import assert from 'node:assert/strict';
import {PlaybackMetrics} from '../lib/playback-metrics.js';
test('diagnostics distinguish startup, rebuffering and user pause without identifiers',()=>{
 let time=0;const m=new PlaybackMetrics({now:()=>time,capacity:2});
 m.begin('next','offline');time=50;m.playing();time=1050;m.waiting();
 time=1250;m.playing();time=2250;m.pause();time=10000;
 const s=m.snapshot();assert.equal(s.p50,50);assert.equal(s.samples[0].bufferingMs,200);
 assert.equal(s.samples[0].listeningMs,2000);assert.equal(s.samples[0].rebufferEvents,1);
 assert.equal(s.bufferingRatio,200/2200);assert.equal(s.rebufferEventsPerHour,1800);
 assert.ok(!JSON.stringify(s).includes('youtube'));
 m.begin();m.begin();m.begin();assert.equal(m.samples.length,2);
});
